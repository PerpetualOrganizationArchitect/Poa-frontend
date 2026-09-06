import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, shouldRetryNetworkError } from '@/util/fetchWithTimeout';

function stalledFetch() {
  return vi.fn((input, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
}

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('forwards Apollo cancellation to the active fetch and prevents retry', async () => {
    const fetch = stalledFetch();
    vi.stubGlobal('fetch', fetch);
    const caller = new AbortController();
    const removeListener = vi.spyOn(caller.signal, 'removeEventListener');
    const pending = fetchWithTimeout('/subgraph', { signal: caller.signal }, 100);
    const result = pending.catch((error) => error);

    caller.abort(new Error('route changed'));

    const error = await result;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(error.name).toBe('AbortError');
    expect(shouldRetryNetworkError(error)).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start a fetch for an already-cancelled request', async () => {
    const fetch = stalledFetch();
    vi.stubGlobal('fetch', fetch);
    const caller = new AbortController();
    caller.abort();

    await expect(fetchWithTimeout('/subgraph', { signal: caller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps timeouts retryable without aborting the caller signal', async () => {
    const fetch = stalledFetch();
    vi.stubGlobal('fetch', fetch);
    const caller = new AbortController();
    const result = fetchWithTimeout('/subgraph', { signal: caller.signal }, 100)
      .catch((error) => error);

    await vi.advanceTimersByTimeAsync(100);

    const error = await result;
    expect(error.name).toBe('TimeoutError');
    expect(shouldRetryNetworkError(error)).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the timer and cancellation listener on a successful response', async () => {
    const response = { ok: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const caller = new AbortController();
    const removeListener = vi.spyOn(caller.signal, 'removeEventListener');

    await expect(fetchWithTimeout('/subgraph', { signal: caller.signal })).resolves.toBe(response);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards Request-object cancellation when no init signal overrides it', async () => {
    vi.stubGlobal('fetch', stalledFetch());
    const caller = new AbortController();
    const request = new Request('https://example.test/subgraph', { signal: caller.signal });
    const result = fetchWithTimeout(request).catch((error) => error);
    caller.abort();
    expect((await result).name).toBe('AbortError');
  });

  it('preserves transient network errors for Apollo retry', async () => {
    const networkError = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));
    await expect(fetchWithTimeout('/subgraph')).rejects.toBe(networkError);
    expect(shouldRetryNetworkError(networkError)).toBe(true);
    expect(shouldRetryNetworkError(null)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
