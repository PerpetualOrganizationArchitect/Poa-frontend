/**
 * Chunked zkey loader for in-browser proving.
 *
 * The proving key (~400-650 MB) is split into ~8 MB parts (circuits/scripts/split-zkey.mjs), each pinned
 * individually on IPFS (The Graph's free endpoint caps uploads at ~10 MB, so per-part CIDs rather than a
 * directory). A per-circuit MANIFEST (JSON, its own CID) lists the part CIDs + the wasm CID + sha256.
 *
 * This fetches the manifest, then the parts in parallel (with retries) via a gateway, reassembles them
 * byte-perfectly into one Uint8Array, caches it in IndexedDB (localforage, keyed by sha256), and returns
 * it as snarkjs's `{ type: 'mem', data }` fastfile — standard snarkjs 0.7.6, no fork.
 *
 * `gateway` is a URL template with a `{cid}` placeholder, e.g.
 *   https://api.thegraph.com/ipfs/api/v0/cat?arg={cid}   (default; CORS-enabled, serves Graph-pinned CIDs)
 *   https://ipfs.io/ipfs/{cid}
 */
import localforage from 'localforage';

const CONCURRENCY = 6;
const RETRIES = 4;

const store = localforage.createInstance({ name: 'pop-zkey-cache', storeName: 'zkeys' });

function fileUrl(gateway, cid) {
  return gateway.includes('{cid}') ? gateway.replace('{cid}', cid) : `${gateway.replace(/\/$/, '')}/${cid}`;
}

// Read-side resilience: if a part isn't served by the primary gateway (The Graph's free IPFS is
// best-effort — it can GC unpinned content or rate-limit), fall through to public gateways by CID.
// Content addressing makes this safe: any gateway that resolves the CID returns the same bytes, and
// loadZkey still sha256-verifies the reassembled key. (The durable fix is dual-pinning on the write side.)
// Path-form gateways (work for the CIDv0 'Qm...' CIDs this system produces — subdomain gateways like
// {cid}.ipfs.dweb.link require lowercase base32 CIDv1 and would silently never resolve a Qm CID).
const FALLBACK_GATEWAYS = [
  'https://ipfs.io/ipfs/{cid}',
  'https://dweb.link/ipfs/{cid}',
  'https://gateway.pinata.cloud/ipfs/{cid}',
];

function candidateUrls(primaryGateway, cid) {
  return [fileUrl(primaryGateway, cid), ...FALLBACK_GATEWAYS.map((g) => fileUrl(g, cid))];
}

async function fetchCidBytes(primaryGateway, cid) {
  const urls = candidateUrls(primaryGateway, cid);
  let lastErr;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const url = urls[Math.min(attempt, urls.length - 1)]; // primary first, then rotate through fallbacks
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fetchParts(gateway, cids, onProgress) {
  const parts = new Array(cids.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < cids.length) {
      const i = next++;
      parts[i] = await fetchCidBytes(gateway, cids[i]);
      done += 1;
      if (onProgress) onProgress({ phase: 'download', done, total: cids.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cids.length) }, worker));
  return parts;
}

/**
 * In-session memo + in-flight dedup, keyed by manifest CID.
 *
 * Two callers need the SAME load: the step-2 PREFETCH (fired while the user is off sending their
 * email, hiding the ~download behind mail-delivery dead time) and the prove-time `loadZkey`. Without
 * dedup they would race and download the ~640 MB key twice; without the memo a second prove in the
 * same session would re-read it from IndexedDB. Progress listeners fan out so the prove-time UI still
 * gets download progress for a load the prefetch started. Failed loads clear the slot so a retry
 * actually retries.
 */
const inFlight = new Map(); // manifestCid -> { promise, listeners: Set<fn> }

function _entry(manifestCid) {
  let entry = inFlight.get(manifestCid);
  if (!entry) {
    entry = { promise: null, listeners: new Set() };
    inFlight.set(manifestCid, entry);
  }
  return entry;
}

/**
 * Fire-and-forget warm-up: start (or join) the load so the key is ready before proving. Never throws —
 * a failed prefetch just means prove-time falls back to a fresh, error-surfacing load.
 */
export function prefetchZkey(gateway, manifestCid, onProgress) {
  if (!gateway || !manifestCid) return;
  loadZkey(gateway, manifestCid, onProgress).catch(() => {
    /* swallowed — prefetch is best-effort; loadZkey cleared the slot so prove retries cleanly */
  });
}

/**
 * Load a chunked zkey from `gateway` given its `manifestCid`. Deduplicates concurrent calls and
 * memoizes the result for the session (the assembled buffer is reused, not re-read from IndexedDB).
 * @returns {Promise<{ zkey: { type: 'mem', data: Uint8Array }, wasmUrl: string }>}
 */
export function loadZkey(gateway, manifestCid, onProgress) {
  if (!gateway || !manifestCid) return Promise.reject(new Error('ZK artifacts gateway/manifest CID not configured.'));

  const entry = _entry(manifestCid);
  if (onProgress) entry.listeners.add(onProgress);
  if (!entry.promise) {
    const fanOut = (p) => entry.listeners.forEach((fn) => fn(p));
    entry.promise = _loadZkeyUncached(gateway, manifestCid, fanOut).catch((e) => {
      inFlight.delete(manifestCid); // let the next call retry from scratch
      throw e;
    });
  }
  return entry.promise;
}

async function _loadZkeyUncached(gateway, manifestCid, onProgress) {
  const manifestBytes = await fetchCidBytes(gateway, manifestCid);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const wasmUrl = fileUrl(gateway, manifest.wasmCid);
  const cacheKey = `${manifest.name}:${manifest.sha256 || manifest.totalSize}`;

  try {
    const cached = await store.getItem(cacheKey);
    if (cached) {
      if (onProgress) onProgress({ phase: 'cache-hit' });
      return { zkey: { type: 'mem', data: new Uint8Array(cached) }, wasmUrl };
    }
  } catch (_) {
    /* cache unavailable — re-download */
  }

  const parts = await fetchParts(gateway, manifest.parts, onProgress);
  if (onProgress) onProgress({ phase: 'assemble' });

  const data = new Uint8Array(manifest.totalSize);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  if (offset !== manifest.totalSize) {
    throw new Error(`chunked zkey size mismatch for ${manifest.name}: got ${offset}, expected ${manifest.totalSize}`);
  }

  // Integrity: verify the reassembled key against the manifest sha256. A flaky gateway (or a host that
  // silently corrupts binary — e.g. UTF-8-mangled uploads) can return same-size-but-wrong bytes that the
  // length check misses; feeding those to snarkjs fails with a cryptic witness error. Fail loudly instead.
  if (manifest.sha256 && globalThis.crypto && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== manifest.sha256) {
      throw new Error(
        `chunked zkey sha256 mismatch for ${manifest.name}: got ${hex.slice(0, 12)}…, expected ${manifest.sha256.slice(0, 12)}…`,
      );
    }
  }

  try {
    await store.setItem(cacheKey, data.buffer);
  } catch (_) {
    /* IndexedDB quota — proceed uncached */
  }
  return { zkey: { type: 'mem', data }, wasmUrl };
}
