/**
 * Pure helpers for safely turning an untrusted IPFS response into image bytes.
 *
 * Avatar CIDs come from on-chain profile metadata, so any address can point the
 * app at arbitrary content. Three rules follow from that:
 *
 *   1. Cap the download *before* buffering. A declared Content-Length is
 *      rejected up front, and a chunked/undeclared body is aborted mid-stream
 *      as soon as the running total crosses the cap.
 *   2. Only render bytes that actually are one of the image formats the upload
 *      path accepts (`util/imageUpload.js`). The old loader labelled every
 *      payload `image/png`, so a JPEG rendered by luck and a non-image blob
 *      became a broken <img>.
 *   3. Object URLs must be bounded and revoked — they pin their Blob in memory
 *      for the lifetime of the document otherwise.
 *
 * Kept free of React/DOM globals so it runs under this repo's `node` vitest
 * environment (`URL.createObjectURL` is injected by the caller).
 */

/** Matches MAX_AVATAR_SIZE_BYTES on the upload side (util/imageUpload.js). */
export const MAX_AVATAR_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Most object URLs the app holds at once. Sized well above the largest avatar
 * count on a single screen (leaderboard + modal) so eviction never revokes a
 * URL that is still rendered.
 */
export const MAX_CACHED_OBJECT_URLS = 64;

import { CID } from 'multiformats/cid';

/** bytes32 as stored by the contracts, converted to a CID before fetching. */
export const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * True for a CID this app can actually resolve. Deliberately stricter than a
 * `startsWith('Qm')` prefix check: an arbitrary string starting with "Qm" or
 * "ba" would otherwise be sent to the gateway as a real request.
 */
export function isResolvableCid(value) {
  if (typeof value !== 'string') return false;
  const cid = value.trim();
  if (!cid) return false;
  try {
    // CID.parse validates the multibase, version, codec and multihash rather
    // than accepting any long string that merely starts with "Qm" or "ba".
    // Only the two textual forms supported throughout this app are accepted.
    const parsed = CID.parse(cid);
    return parsed.version === 0 || (parsed.version === 1 && cid.startsWith('b'));
  } catch {
    return false;
  }
}

/**
 * Strip an HTTP-style query string and fragment from a bare IPFS reference.
 *
 * Neither is part of the content path: `Qm…/avatar.png?w=64#top` addresses
 * `Qm…/avatar.png`. Leaving them attached turned a resolvable avatar into a
 * guaranteed gateway 404, because the whole string was sent as the path.
 */
export function stripIpfsRefLocation(value) {
  if (typeof value !== 'string') return '';
  return value.trim().split('#')[0].split('?')[0];
}

/**
 * True for any reference the IPFS loader knows how to normalize: a real CID, a
 * bytes32 hash, or a CID followed by a path inside the addressed directory.
 *
 * Relative segments are rejected outright. Both back-ends resolve paths inside
 * the CID root so `..` cannot escape it, but a reference that only ever 404s is
 * not worth a network round trip.
 */
export function isResolvableIpfsReference(value) {
  if (typeof value !== 'string') return false;
  const ref = stripIpfsRefLocation(value);
  if (!ref) return false;
  if (BYTES32_RE.test(ref)) return true;
  const [cid, ...rest] = ref.split('/');
  if (!isResolvableCid(cid)) return false;
  return rest.every((segment, i) => {
    // A path segment may be empty only if it is a trailing slash.
    if (segment === '') return i === rest.length - 1;
    if (segment === '.' || segment === '..') return false;
    // Control characters cannot appear in a real IPFS path entry.
    return !/[\u0000-\u001f\u007f]/.test(segment);
  });
}

/**
 * Image signatures for exactly the formats `ACCEPTED_IMAGE_MIME` allows.
 * WebP additionally requires the "WEBP" tag at offset 8 of the RIFF container,
 * otherwise any RIFF file (e.g. a WAV) would pass.
 */
const IMAGE_SIGNATURES = [
  { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
  { mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  {
    mime: 'image/webp',
    magic: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    also: { offset: 8, magic: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
  },
];

function matchesAt(bytes, magic, offset) {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Identify image bytes by signature.
 * @param {Uint8Array} bytes
 * @returns {string|null} MIME type, or null when the bytes are not an accepted image.
 */
export function detectImageMimeType(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return null;
  for (const { mime, magic, also } of IMAGE_SIGNATURES) {
    if (!matchesAt(bytes, magic, 0)) continue;
    if (also && !matchesAt(bytes, also.magic, also.offset)) continue;
    return mime;
  }
  return null;
}

export class ImageTooLargeError extends Error {
  constructor(maxBytes, actualBytes) {
    const seen = actualBytes == null ? 'stream' : `${actualBytes} bytes`;
    super(`IPFS image exceeds the ${maxBytes}-byte limit (${seen})`);
    this.name = 'ImageTooLargeError';
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes ?? null;
  }
}

/**
 * True when the response body arrives compressed, so `Content-Length` counts
 * *encoded* bytes while `fetch` hands us decoded ones.
 *
 * This is not hypothetical: the app's gateway (`api.thegraph.com/ipfs/api/v0/cat`)
 * sits behind Cloudflare and labels IPFS payloads `text/plain`, which Cloudflare
 * compresses — a browser request for the live avatar CID comes back
 * `content-encoding: br`. Comparing a decoded byte count against that header
 * would fail every such fetch.
 */
function isContentEncoded(response) {
  const encoding = response?.headers?.get?.('content-encoding');
  if (!encoding) return false;
  return encoding.trim().toLowerCase() !== 'identity';
}

/**
 * Reject an over-sized response from its declared length, before any body is read.
 * Returns null (i.e. "no usable declaration") for a compressed body, whose header
 * describes the encoded size rather than the bytes we will actually buffer.
 * @returns {number|null} The declared length when present, decoded, and within the cap.
 */
export function assertDeclaredLengthWithinLimit(response, maxBytes) {
  if (isContentEncoded(response)) return null;
  const raw = response?.headers?.get?.('content-length');
  if (raw == null || raw === '') return null;
  const declared = Number(raw);
  if (!Number.isFinite(declared) || declared < 0) return null;
  if (declared > maxBytes) throw new ImageTooLargeError(maxBytes, declared);
  return declared;
}

/**
 * Read a response body into bytes, never buffering more than `maxBytes`.
 *
 * Streams when the body exposes a reader so a lying/absent/compressed
 * Content-Length still cannot exhaust memory: the running total is checked per
 * chunk and the read is abandoned the moment it crosses the cap. The
 * `arrayBuffer()` fallback re-checks the materialized length, so the header is
 * never the only thing enforcing the cap.
 *
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<Uint8Array>}
 */
export async function readCappedBytes(response, maxBytes = MAX_AVATAR_IMAGE_BYTES) {
  const declaredLength = assertDeclaredLengthWithinLimit(response, maxBytes);

  const reader = response?.body?.getReader?.();
  if (!reader) {
    // No stream available (older fetch polyfills, Helia's synthetic responses).
    // The buffer is materialized in one go here, so re-check its real size
    // rather than trusting the header — which may be absent or encoded.
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new ImageTooLargeError(maxBytes, bytes.length);
    return bytes;
  }

  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      total += value.length;
      if (total > maxBytes) {
        // Stop pulling bytes we have already decided to discard.
        await reader.cancel().catch(() => {});
        throw new ImageTooLargeError(maxBytes, null);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  if (declaredLength != null && total !== declaredLength) {
    // Truncated/over-long body relative to its own header — treat as a failed
    // fetch so the hedged race can fall through to the other source.
    throw new Error(
      `IPFS image length mismatch: read ${total} bytes, expected ${declaredLength}`
    );
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * A bounded, FIFO registry of object URLs that revokes what it evicts.
 *
 * IPFS content is immutable by CID, so caching an object URL per CID is safe;
 * leaking one per avatar ever rendered is not. `createObjectUrl` is injected so
 * this stays testable outside a browser.
 *
 * `onEvict` is mandatory in spirit: callers that memoize the URL elsewhere (the
 * IPFS provider caches the resolving promise per CID) MUST drop their entry when
 * this registry revokes one, or that cache keeps handing out a dead `blob:` URL
 * forever — a broken avatar that no reload inside the tab can heal.
 */
export function createObjectUrlRegistry({
  createObjectUrl,
  revokeObjectUrl,
  maxEntries = MAX_CACHED_OBJECT_URLS,
  onEvict,
} = {}) {
  const urls = new Map(); // key -> objectURL, insertion-ordered

  const notifyEvicted = (key) => {
    if (typeof onEvict !== 'function') return;
    try {
      onEvict(key);
    } catch {
      // A listener must never be able to break revocation.
    }
  };

  return {
    /** Create and track an object URL for `key`, evicting the oldest if needed. */
    create(key, blob) {
      const existing = urls.get(key);
      if (existing) return existing;

      const url = createObjectUrl(blob);
      urls.set(key, url);

      while (urls.size > maxEntries) {
        const oldestKey = urls.keys().next().value;
        if (oldestKey === undefined) break;
        const oldestUrl = urls.get(oldestKey);
        urls.delete(oldestKey);
        try {
          revokeObjectUrl(oldestUrl);
        } catch {
          // Revoking a URL the document already dropped is not an error.
        }
        notifyEvicted(oldestKey);
      }
      return url;
    },

    /** Revoke and forget a single entry (e.g. when its fetch is retried). */
    release(key) {
      const url = urls.get(key);
      if (!url) return false;
      urls.delete(key);
      try {
        revokeObjectUrl(url);
      } catch {
        // See above.
      }
      notifyEvicted(key);
      return true;
    },

    /** Revoke everything — used when the provider unmounts. */
    clear() {
      const keys = [...urls.keys()];
      for (const url of urls.values()) {
        try {
          revokeObjectUrl(url);
        } catch {
          // See above.
        }
      }
      urls.clear();
      for (const key of keys) notifyEvicted(key);
    },

    get size() {
      return urls.size;
    },
  };
}
