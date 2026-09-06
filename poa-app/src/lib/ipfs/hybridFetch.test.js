/**
 * Runtime cover for the size cap travelling through the hedged fetch.
 *
 * The cap only protects anything if it reaches *both* legs of the race and
 * survives the gateway's retry loop. Both are easy to break silently — the
 * bytes still arrive, just unbounded — so they are exercised here against the
 * real `hybridFetchBytes` rather than asserted over the source.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedFetch = vi.fn();
vi.mock('./heliaClient', () => ({ getVerifiedFetch: () => getVerifiedFetch() }));
vi.mock('./ipfsMetrics', () => ({ recordOutcome: vi.fn() }));

const { hybridFetchBytes } = await import('./hybridFetch');
const { ImageTooLargeError, MAX_AVATAR_IMAGE_BYTES } = await import('./imageBytes');

const CID = 'QmcJmonrdFPySQZftHRtvzoWePiGwNeG7wn35Z2qkJbbae';
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A 126027-byte PNG, matching what the live gateway serves for this CID. */
function livePng() {
  const payload = new Uint8Array(126027);
  payload.set(PNG_MAGIC, 0);
  return payload;
}

/** Response stand-in that streams `payload` in 16 KiB chunks. */
function streamed(payload, headers = {}) {
  const queue = [];
  for (let i = 0; i < payload.length; i += 16384) queue.push(payload.subarray(i, i + 16384));
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])
  );
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => lower[k.toLowerCase()] ?? null },
    body: {
      getReader: () => ({
        read: async () => (queue.length ? { done: false, value: queue.shift() } : { done: true }),
        cancel: async () => { queue.length = 0; },
        releaseLock: () => {},
      }),
    },
    arrayBuffer: async () => { throw new Error('should have streamed'); },
  };
}

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  getVerifiedFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe('hybridFetchBytes size cap', () => {
  it('returns the live avatar payload unchanged through the gateway-only path', async () => {
    getVerifiedFetch.mockResolvedValue({ disabled: true });
    // The real shape observed on api.thegraph.com: brotli, no usable length.
    globalThis.fetch = vi.fn(async () => streamed(livePng(), { 'content-encoding': 'br' }));

    const bytes = await hybridFetchBytes(CID, { maxBytes: MAX_AVATAR_IMAGE_BYTES });
    expect(bytes.length).toBe(126027);
    expect([...bytes.slice(0, 8)]).toEqual(PNG_MAGIC);
  });

  it('caps the gateway leg and does not retry an over-sized body', async () => {
    // Retrying would re-download the same oversized bytes twice more for a
    // failure that is a property of the content, not of the transport.
    getVerifiedFetch.mockResolvedValue({ disabled: true });
    const fetchMock = vi.fn(async () => streamed(new Uint8Array(64 * 1024)));
    globalThis.fetch = fetchMock;

    await expect(hybridFetchBytes(CID, { maxBytes: 1024 }))
      .rejects.toBeInstanceOf(ImageTooLargeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps the Helia leg too', async () => {
    // Helia wins the race by design, so a cap that only reached the gateway
    // would be bypassed on essentially every successful fetch. Both legs serve
    // the same over-cap content here: if either failed to enforce the limit it
    // would resolve with 64 KiB instead of rejecting.
    const verifiedFetch = vi.fn(async () => streamed(new Uint8Array(64 * 1024)));
    getVerifiedFetch.mockResolvedValue({ verifiedFetch, disabled: false });
    const fetchMock = vi.fn(async () => streamed(new Uint8Array(64 * 1024)));
    globalThis.fetch = fetchMock;

    await expect(hybridFetchBytes(CID, { maxBytes: 1024 }))
      .rejects.toBeInstanceOf(ImageTooLargeError);
    expect(verifiedFetch).toHaveBeenCalledTimes(1);
    expect(fetchMock, 'gateway retried an over-sized body').toHaveBeenCalledTimes(1);
  });

  it('resolves from Helia before the gateway is ever fired', async () => {
    const verifiedFetch = vi.fn(async () => streamed(livePng()));
    getVerifiedFetch.mockResolvedValue({ verifiedFetch, disabled: false });
    const fetchMock = vi.fn(() => new Promise(() => {}));
    globalThis.fetch = fetchMock;

    const bytes = await hybridFetchBytes(CID, { maxBytes: MAX_AVATAR_IMAGE_BYTES });
    expect(bytes.length).toBe(126027);
    expect(fetchMock, 'gateway fired despite a fast Helia win').not.toHaveBeenCalled();
  });

  it('leaves an uncapped caller (JSON metadata) on the plain buffered path', async () => {
    getVerifiedFetch.mockResolvedValue({ disabled: true });
    const json = new TextEncoder().encode('{"bio":"hi"}');
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => json.buffer.slice(json.byteOffset, json.byteOffset + json.byteLength),
    }));

    const bytes = await hybridFetchBytes(CID);
    expect(new TextDecoder().decode(bytes)).toBe('{"bio":"hi"}');
  });
});
