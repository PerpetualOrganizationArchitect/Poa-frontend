import { describe, expect, it, vi } from 'vitest';
import {
  ImageTooLargeError,
  MAX_AVATAR_IMAGE_BYTES,
  assertDeclaredLengthWithinLimit,
  createObjectUrlRegistry,
  detectImageMimeType,
  isResolvableCid,
  isResolvableIpfsReference,
  readCappedBytes,
  stripIpfsRefLocation,
} from './imageBytes';

// The CID the live org actually stores for the reporter's address.
const REAL_CID = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
const REAL_CID_V1 = 'bafybeigprb5sszgq2zpupgeoddj7hvimnxdfivgwp3nennfdinxbduqoe4';

const bytes = (...values) => Uint8Array.from(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const GIF87 = bytes(...'GIF87a'.split('').map((c) => c.charCodeAt(0)), 0x00);
const GIF89 = bytes(...'GIF89a'.split('').map((c) => c.charCodeAt(0)), 0x00);
const WEBP = bytes(
  ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
  0x24, 0x00, 0x00, 0x00,
  ...'WEBP'.split('').map((c) => c.charCodeAt(0))
);

/** Minimal Response stand-in with a real ReadableStream body. */
function fakeResponse(chunks, { contentLength, contentEncoding } = {}) {
  const headers = new Map();
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  if (contentEncoding !== undefined) headers.set('content-encoding', contentEncoding);
  const queue = [...chunks];
  let cancelled = false;
  const reader = {
    read: async () => (queue.length ? { done: false, value: queue.shift() } : { done: true }),
    cancel: async () => { cancelled = true; },
    releaseLock: () => {},
  };
  return {
    headers: { get: (k) => (headers.has(k.toLowerCase()) ? headers.get(k.toLowerCase()) : null) },
    body: { getReader: () => reader },
    arrayBuffer: async () => {
      throw new Error('arrayBuffer() must not be used when a stream is available');
    },
    get cancelled() { return cancelled; },
  };
}

/** Response with no stream — exercises the arrayBuffer fallback path. */
function bufferOnlyResponse(payload, { contentLength } = {}) {
  const headers = new Map();
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  return {
    headers: { get: (k) => (headers.has(k.toLowerCase()) ? headers.get(k.toLowerCase()) : null) },
    arrayBuffer: async () => payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength
    ),
  };
}

describe('isResolvableCid', () => {
  it('accepts the CID families the loader supports', () => {
    expect(isResolvableCid(REAL_CID)).toBe(true);
    expect(isResolvableCid(REAL_CID_V1)).toBe(true);
  });

  it('rejects strings that merely start like a CID', () => {
    for (const value of [
      'Qm',
      'Qmnotacid',
      `${REAL_CID}x`,           // too long
      REAL_CID.slice(0, -1),     // too short
      'badge.png',
      'bafy',
      'backgroundbannerimages', // base32-looking text, but not a real CIDv1
      'QmO0Il' + 'a'.repeat(40), // base58 excludes 0, O, I, l
      '',
      null,
      undefined,
      42,
    ]) {
      expect(isResolvableCid(value), `accepted ${String(value)}`).toBe(false);
    }
  });
});

describe('isResolvableIpfsReference', () => {
  it('accepts a CID, a CID with a path, and an on-chain bytes32 hash', () => {
    expect(isResolvableIpfsReference(REAL_CID)).toBe(true);
    expect(isResolvableIpfsReference(`${REAL_CID}/avatar.png`)).toBe(true);
    expect(isResolvableIpfsReference(`${REAL_CID}/nested/avatar.png`)).toBe(true);
    expect(isResolvableIpfsReference(`${REAL_CID}/`)).toBe(true);
    expect(isResolvableIpfsReference(`0x${'ab'.repeat(32)}`)).toBe(true);
  });

  it('rejects references the gateway could only 404 on', () => {
    for (const value of [
      'default-avatar.png',
      'hudsonhrh.eth',
      `${REAL_CID}//avatar.png`, // empty interior segment
      '0xdeadbeef',              // not a full bytes32
      `${REAL_CID}/../secrets`,  // relative segments never address content
      `${REAL_CID}/./avatar.png`,
      `${REAL_CID}/av\natar.png`, // control character
      '   ',
      '',
    ]) {
      expect(isResolvableIpfsReference(value), `accepted ${JSON.stringify(value)}`).toBe(false);
    }
  });

  it('ignores an HTTP query string and fragment, which are not content paths', () => {
    expect(stripIpfsRefLocation(`${REAL_CID}/avatar.png?w=64#top`)).toBe(`${REAL_CID}/avatar.png`);
    expect(stripIpfsRefLocation('  QmSpaced  ')).toBe('QmSpaced');
    expect(stripIpfsRefLocation(null)).toBe('');
    for (const value of [
      `${REAL_CID}?w=64`,
      `${REAL_CID}#top`,
      `${REAL_CID}/avatar.png?v=2#anchor`,
    ]) {
      expect(isResolvableIpfsReference(value), `rejected ${value}`).toBe(true);
    }
    // Stripping must not rescue something that was never resolvable.
    expect(isResolvableIpfsReference('badge.png?v=2')).toBe(false);
  });
});

describe('detectImageMimeType', () => {
  it('identifies every format the upload path accepts', () => {
    expect(detectImageMimeType(PNG)).toBe('image/png');
    expect(detectImageMimeType(JPEG)).toBe('image/jpeg');
    expect(detectImageMimeType(GIF87)).toBe('image/gif');
    expect(detectImageMimeType(GIF89)).toBe('image/gif');
    expect(detectImageMimeType(WEBP)).toBe('image/webp');
  });

  it('rejects non-image payloads served from a valid CID', () => {
    const html = bytes(...'<!DOCTYPE html>'.split('').map((c) => c.charCodeAt(0)));
    const svg = bytes(...'<svg xmlns'.split('').map((c) => c.charCodeAt(0)));
    const json = bytes(0x7b, 0x22, 0x61, 0x22, 0x7d);
    for (const payload of [html, svg, json, bytes(), bytes(0x89, 0x50)]) {
      expect(detectImageMimeType(payload)).toBeNull();
    }
    expect(detectImageMimeType(null)).toBeNull();
  });

  it('does not accept a non-WebP RIFF container', () => {
    const wav = bytes(
      ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
      0x24, 0x00, 0x00, 0x00,
      ...'WAVE'.split('').map((c) => c.charCodeAt(0))
    );
    expect(detectImageMimeType(wav)).toBeNull();
  });
});

describe('assertDeclaredLengthWithinLimit', () => {
  it('rejects an over-sized Content-Length before any body is read', () => {
    const res = fakeResponse([PNG], { contentLength: MAX_AVATAR_IMAGE_BYTES + 1 });
    expect(() => assertDeclaredLengthWithinLimit(res, MAX_AVATAR_IMAGE_BYTES))
      .toThrow(ImageTooLargeError);
  });

  it('passes a declared length at or under the cap, and tolerates a missing header', () => {
    expect(
      assertDeclaredLengthWithinLimit(
        fakeResponse([PNG], { contentLength: MAX_AVATAR_IMAGE_BYTES }),
        MAX_AVATAR_IMAGE_BYTES
      )
    ).toBe(MAX_AVATAR_IMAGE_BYTES);
    expect(assertDeclaredLengthWithinLimit(fakeResponse([PNG]), MAX_AVATAR_IMAGE_BYTES)).toBeNull();
  });

  it('does not read a compressed Content-Length as a decoded byte count', () => {
    // Observed live: a browser request to api.thegraph.com/ipfs/api/v0/cat for
    // the org's avatar CID returns `content-encoding: br` — Cloudflare
    // compresses that endpoint's `text/plain` payloads. Any Content-Length on
    // such a response counts *encoded* bytes, so it can neither cap nor verify
    // the decoded bytes we buffer.
    expect(
      assertDeclaredLengthWithinLimit(
        fakeResponse([PNG], { contentLength: 512, contentEncoding: 'br' }),
        MAX_AVATAR_IMAGE_BYTES
      )
    ).toBeNull();
    // An over-limit *compressed* declaration must not throw either: 6 MiB of
    // gzip can decode to well under the cap, and vice versa — only the streamed
    // total is authoritative.
    expect(() => assertDeclaredLengthWithinLimit(
      fakeResponse([PNG], { contentLength: MAX_AVATAR_IMAGE_BYTES + 1, contentEncoding: 'gzip' }),
      MAX_AVATAR_IMAGE_BYTES
    )).not.toThrow();
    // `identity` is not compression, so the header is still trustworthy.
    expect(
      assertDeclaredLengthWithinLimit(
        fakeResponse([PNG], { contentLength: PNG.length, contentEncoding: 'identity' }),
        MAX_AVATAR_IMAGE_BYTES
      )
    ).toBe(PNG.length);
  });
});

describe('readCappedBytes', () => {
  it('returns the exact bytes of a well-formed response', async () => {
    const res = fakeResponse([PNG.slice(0, 4), PNG.slice(4)], { contentLength: PNG.length });
    await expect(readCappedBytes(res, MAX_AVATAR_IMAGE_BYTES)).resolves.toEqual(PNG);
  });

  it('reproduces the 126027-byte avatar the live gateway serves', async () => {
    const payload = new Uint8Array(126027);
    payload.set(PNG.slice(0, 8), 0);
    const chunks = [];
    for (let i = 0; i < payload.length; i += 16384) chunks.push(payload.subarray(i, i + 16384));
    const res = fakeResponse(chunks, { contentLength: payload.length });

    const out = await readCappedBytes(res, MAX_AVATAR_IMAGE_BYTES);
    expect(out.length).toBe(126027);
    expect(detectImageMimeType(out)).toBe('image/png');
  });

  it('aborts a body that outgrows the cap without buffering all of it', async () => {
    const cap = 1024;
    const chunk = new Uint8Array(256);
    // No Content-Length: the stream check is the only thing standing between us
    // and an unbounded download.
    const res = fakeResponse([chunk, chunk, chunk, chunk, chunk, chunk], {});

    await expect(readCappedBytes(res, cap)).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(res.cancelled, 'over-limit stream was not cancelled').toBe(true);
  });

  it('rejects an over-sized declared length without consuming the stream', async () => {
    const res = fakeResponse([new Uint8Array(8)], { contentLength: MAX_AVATAR_IMAGE_BYTES + 1 });
    await expect(readCappedBytes(res, MAX_AVATAR_IMAGE_BYTES))
      .rejects.toBeInstanceOf(ImageTooLargeError);
    expect(res.cancelled).toBe(false);
  });

  it('rejects a body that does not match its own declared length', async () => {
    const res = fakeResponse([PNG], { contentLength: PNG.length + 5 });
    await expect(readCappedBytes(res, MAX_AVATAR_IMAGE_BYTES)).rejects.toThrow(/length mismatch/);
  });

  it('accepts the real gateway shape: brotli-encoded, length header of the encoded body', async () => {
    // Without the content-encoding exemption this is a guaranteed "length
    // mismatch" on every avatar the gateway serves — the decoded PNG is far
    // larger than the compressed length it advertises.
    const payload = new Uint8Array(126027);
    payload.set(PNG.slice(0, 8), 0);
    const chunks = [];
    for (let i = 0; i < payload.length; i += 16384) chunks.push(payload.subarray(i, i + 16384));
    const res = fakeResponse(chunks, { contentLength: 1204, contentEncoding: 'br' });

    const out = await readCappedBytes(res, MAX_AVATAR_IMAGE_BYTES);
    expect(out.length).toBe(126027);
    expect(detectImageMimeType(out)).toBe('image/png');
  });

  it('still caps a compressed body from the stream, not the header', async () => {
    const chunk = new Uint8Array(256);
    const res = fakeResponse([chunk, chunk, chunk, chunk, chunk], { contentLength: 90, contentEncoding: 'gzip' });
    await expect(readCappedBytes(res, 1024)).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(res.cancelled, 'over-limit compressed stream was not cancelled').toBe(true);
  });

  it('still caps a stream-less response', async () => {
    await expect(readCappedBytes(bufferOnlyResponse(PNG), MAX_AVATAR_IMAGE_BYTES))
      .resolves.toEqual(PNG);
    await expect(readCappedBytes(bufferOnlyResponse(new Uint8Array(64)), 32))
      .rejects.toBeInstanceOf(ImageTooLargeError);
  });
});

describe('createObjectUrlRegistry', () => {
  function registry(maxEntries, onEvict) {
    const revoked = [];
    let n = 0;
    const reg = createObjectUrlRegistry({
      createObjectUrl: () => `blob:test/${++n}`,
      revokeObjectUrl: (url) => revoked.push(url),
      maxEntries,
      onEvict,
    });
    return { reg, revoked };
  }

  it('reuses the URL already held for a CID', () => {
    const { reg, revoked } = registry(4);
    const first = reg.create(REAL_CID, {});
    expect(reg.create(REAL_CID, {})).toBe(first);
    expect(reg.size).toBe(1);
    expect(revoked).toEqual([]);
  });

  it('revokes the oldest URL once the cap is exceeded', () => {
    const { reg, revoked } = registry(2);
    const a = reg.create('a', {});
    reg.create('b', {});
    reg.create('c', {});
    expect(reg.size).toBe(2);
    expect(revoked).toEqual([a]);
  });

  it('revokes on explicit release and on clear', () => {
    const { reg, revoked } = registry(8);
    const a = reg.create('a', {});
    const b = reg.create('b', {});
    expect(reg.release('a')).toBe(true);
    expect(reg.release('a')).toBe(false);
    expect(revoked).toEqual([a]);
    reg.clear();
    expect(revoked).toEqual([a, b]);
    expect(reg.size).toBe(0);
  });

  it('tells its owner which key it revoked, on eviction, release and clear', () => {
    // IPFSprovider memoizes the resolving promise per CID forever. Revoking a
    // URL without saying so leaves that cache handing out a dead blob: for the
    // rest of the tab session — a permanently broken avatar. onEvict is how the
    // promise cache learns to re-fetch.
    const evicted = [];
    const { reg } = registry(2, (key) => evicted.push(key));
    reg.create('a', {});
    reg.create('b', {});
    reg.create('c', {});
    expect(evicted).toEqual(['a']);          // FIFO eviction past the cap
    reg.release('b');
    expect(evicted).toEqual(['a', 'b']);
    reg.release('b');                         // already gone — no second notice
    expect(evicted).toEqual(['a', 'b']);
    reg.clear();
    expect(evicted).toEqual(['a', 'b', 'c']);
  });

  it('does not let a throwing onEvict break revocation', () => {
    const { reg, revoked } = registry(1, () => { throw new Error('listener blew up'); });
    const a = reg.create('a', {});
    expect(() => reg.create('b', {})).not.toThrow();
    expect(revoked).toEqual([a]);
    expect(reg.size).toBe(1);
  });

  it('survives a revoke that throws (URL already dropped by the document)', () => {
    const reg = createObjectUrlRegistry({
      createObjectUrl: () => 'blob:test/1',
      revokeObjectUrl: vi.fn(() => { throw new Error('already revoked'); }),
      maxEntries: 1,
    });
    reg.create('a', {});
    expect(() => reg.create('b', {})).not.toThrow();
    expect(() => reg.clear()).not.toThrow();
  });
});
