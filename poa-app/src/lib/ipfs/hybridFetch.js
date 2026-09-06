import { getVerifiedFetch } from './heliaClient';
import { recordOutcome } from './ipfsMetrics';
import { ImageTooLargeError, readCappedBytes } from './imageBytes';

// How long Helia gets a head start before we also fire the gateway. Sized to
// cover an IDB cache hit (<50 ms) and a fast delegated-routing + trustless
// gateway round trip (~200–350 ms) without unnecessarily firing the fallback.
// If Helia errors *before* this window elapses, the gateway fires immediately
// rather than waiting out the rest of the delay.
const HEDGE_DELAY_MS = 400;

const GATEWAY_URL = 'https://api.thegraph.com/ipfs/api/v0/cat';
const GATEWAY_MAX_RETRIES = 3;
const GATEWAY_BASE_DELAY_MS = 1000;

async function withRetry(fn, signal) {
  let lastError;
  for (let attempt = 0; attempt < GATEWAY_MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // Don't retry if the caller cancelled us — e.g., Helia already won the race.
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      // Nor when the content itself is over the cap: the retry would re-download
      // the same oversized bytes and fail identically.
      if (error instanceof ImageTooLargeError) throw error;
      if (attempt < GATEWAY_MAX_RETRIES - 1) {
        const ms = GATEWAY_BASE_DELAY_MS * Math.pow(2, attempt);
        await abortableSleep(ms, signal);
      }
    }
  }
  throw lastError;
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
}

// `maxBytes` is enforced against the declared Content-Length before the body is
// touched and again per streamed chunk, so an oversized or length-lying payload
// is abandoned rather than buffered. An over-limit body is a property of the
// content, not of the transport, so it must not be retried.
async function readBody(res, maxBytes) {
  if (!maxBytes) return new Uint8Array(await res.arrayBuffer());
  return readCappedBytes(res, maxBytes);
}

async function gatewayFetch(cid, signal, maxBytes) {
  return withRetry(async () => {
    const url = `${GATEWAY_URL}?arg=${encodeURIComponent(cid)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Gateway fetch failed: ${res.status} ${res.statusText}`);
    return readBody(res, maxBytes);
  }, signal);
}

async function heliaFetch(verifiedFetch, cid, signal, maxBytes) {
  const res = await verifiedFetch(`ipfs://${cid}`, { signal });
  if (!res.ok) throw new Error(`Helia fetch failed: ${res.status}`);
  return readBody(res, maxBytes);
}

// Hedged race: Helia gets HEDGE_DELAY_MS head start, then both run in
// parallel. First successful response wins; the loser is aborted. If Helia
// errors during the head-start window, the gateway is fired immediately
// (no point waiting out the rest of the hedge for a request we know failed).
//
// UX guarantee: user-visible latency is min(helia, gateway), never the sum.
// Worst case (both fail) matches the gateway-only behavior we had before.
//
// @param {{maxBytes?: number}} [options] - Cap the response size (0 = uncapped).
export async function hybridFetchBytes(cid, { maxBytes = 0 } = {}) {
  const { verifiedFetch, disabled } = await getVerifiedFetch();

  // Helia disabled (init failed, no IDB, etc.) — gateway path only.
  if (disabled || !verifiedFetch) {
    try {
      const bytes = await gatewayFetch(cid, undefined, maxBytes);
      recordOutcome('gatewayOnly');
      return bytes;
    } catch (err) {
      recordOutcome('failure');
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    const heliaCtrl = new AbortController();
    const gatewayCtrl = new AbortController();
    let settled = false;
    let heliaError = null;
    let gatewayError = null;
    let gatewayStarted = false;
    let hedgeTimer = null;

    const win = (source, bytes) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      // Cancel the loser to free its socket immediately.
      (source === 'helia' ? gatewayCtrl : heliaCtrl).abort();
      recordOutcome(source === 'helia' ? 'p2pWin' : 'gatewayWin');
      resolve(bytes);
    };

    const fail = () => {
      if (settled) return;
      // Both must have errored. Prefer the gateway error since it's the path
      // the caller would have seen pre-Helia.
      settled = true;
      clearTimeout(hedgeTimer);
      recordOutcome('failure');
      reject(gatewayError ?? heliaError ?? new Error('IPFS fetch failed'));
    };

    const startGateway = () => {
      if (gatewayStarted || settled) return;
      gatewayStarted = true;
      gatewayFetch(cid, gatewayCtrl.signal, maxBytes)
        .then((bytes) => win('gateway', bytes))
        .catch((err) => {
          if (settled || err?.name === 'AbortError') return;
          gatewayError = err;
          if (heliaError) fail();
        });
    };

    heliaFetch(verifiedFetch, cid, heliaCtrl.signal, maxBytes)
      .then((bytes) => win('helia', bytes))
      .catch((err) => {
        if (settled || err?.name === 'AbortError') return;
        heliaError = err;
        // Helia failed — race the gateway right now instead of waiting out the hedge.
        if (!gatewayStarted) startGateway();
        else if (gatewayError) fail();
      });

    hedgeTimer = setTimeout(startGateway, HEDGE_DELAY_MS);
  });
}
