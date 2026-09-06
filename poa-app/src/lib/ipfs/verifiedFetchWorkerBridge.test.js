import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectVerifiedFetchWorker, serveVerifiedFetchWorker } from '@/lib/ipfs/verifiedFetchWorkerBridge';
import { ImageTooLargeError } from '@/lib/ipfs/imageBytes';

class FakePort {
  listeners = new Map();
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
  message(data) { this.emit('message', { data }); }
  listenerCount() { return [...this.listeners.values()].reduce((total, items) => total + items.size, 0); }
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function connected() {
  const worker = new FakePort();
  const ready = connectVerifiedFetchWorker(worker);
  worker.message({ type: 'ready' });
  return { worker, ...(await ready) };
}
function result(worker, id, text) {
  worker.message({ type: 'result', id, status: 200, statusText: 'OK', bytes: new TextEncoder().encode(text).buffer });
}
afterEach(() => { vi.useRealTimers(); });

describe('verified fetch worker client', () => {
  it('waits for readiness, then clears its startup deadline', async () => {
    vi.useFakeTimers();
    const worker = new FakePort();
    const ready = connectVerifiedFetchWorker(worker);
    const observer = vi.fn();
    ready.then(observer);
    await flush();
    expect(observer).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.message({ type: 'ready' });
    expect(await ready).toMatchObject({ disabled: false, verifiedFetch: expect.any(Function) });
    await vi.advanceTimersByTimeAsync(20000);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('terminates an unresponsive startup and removes listeners', async () => {
    vi.useFakeTimers();
    const worker = new FakePort();
    const ready = connectVerifiedFetchWorker(worker, { startupTimeoutMs: 50 });
    const rejected = expect(ready).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it('rejects initialization failure and terminates the worker', async () => {
    const worker = new FakePort();
    const ready = connectVerifiedFetchWorker(worker);
    worker.message({ type: 'init-error', error: { name: 'Error', message: 'IDB unavailable' } });
    await expect(ready).rejects.toThrow('IDB unavailable');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it('correlates concurrent responses and forwards cloneable fetch options', async () => {
    const { worker, verifiedFetch } = await connected();
    const first = verifiedFetch('ipfs://first', { offline: true, maxBytes: 12 });
    const second = verifiedFetch('ipfs://second');
    expect(worker.postMessage).toHaveBeenNthCalledWith(1, {
      type: 'fetch', id: 1, resource: 'ipfs://first', maxBytes: 12, options: { offline: true },
    });
    result(worker, 2, 'second');
    result(worker, 1, 'first');
    expect(await (await first).text()).toBe('first');
    expect(await (await second).text()).toBe('second');
  });

  it('does not dispatch pre-aborted requests', async () => {
    const { worker, verifiedFetch } = await connected();
    const controller = new AbortController();
    controller.abort();
    await expect(verifiedFetch('ipfs://first', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('cancels one request, removes its listener, and ignores its late result', async () => {
    const { worker, verifiedFetch } = await connected();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const first = verifiedFetch('ipfs://first', { signal: controller.signal });
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = verifiedFetch('ipfs://second');
    controller.abort();
    await rejection;
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', id: 1 });
    expect(removed).toHaveBeenCalledOnce();
    result(worker, 1, 'late');
    result(worker, 2, 'second');
    expect(await (await second).text()).toBe('second');
  });

  it('removes the caller abort listener when the response completes', async () => {
    const { worker, verifiedFetch } = await connected();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const request = verifiedFetch('ipfs://first', { signal: controller.signal });
    result(worker, 1, 'done');
    await request;
    controller.abort();
    expect(removed).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledOnce();
  });

  it('rejects all outstanding and future requests on worker failure', async () => {
    const { worker, verifiedFetch } = await connected();
    const first = verifiedFetch('ipfs://first');
    const second = verifiedFetch('ipfs://second');
    worker.emit('error', { message: 'Worker crashed' });
    await expect(first).rejects.toThrow('Worker crashed');
    await expect(second).rejects.toThrow('Worker crashed');
    await expect(verifiedFetch('ipfs://third')).rejects.toThrow('Worker crashed');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it('restores the image cap error type across the worker boundary', async () => {
    const { worker, verifiedFetch } = await connected();
    const request = verifiedFetch('ipfs://large', { maxBytes: 12 });
    worker.message({ type: 'error', id: 1, error: { name: 'ImageTooLargeError', maxBytes: 12, actualBytes: 20 } });
    await expect(request).rejects.toBeInstanceOf(ImageTooLargeError);
    await expect(request).rejects.toMatchObject({ maxBytes: 12, actualBytes: 20 });
  });
});

describe('verified fetch worker protocol', () => {
  it('transfers only complete verified bytes and preserves request options', async () => {
    const port = new FakePort();
    const verifiedFetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    await serveVerifiedFetchWorker(port, async () => ({ verifiedFetch }));
    port.message({ type: 'fetch', id: 7, resource: 'ipfs://fixture', maxBytes: 3, options: { offline: true } });
    await flush();
    expect(verifiedFetch).toHaveBeenCalledWith('ipfs://fixture', { offline: true, signal: expect.any(AbortSignal) });
    const [message, transfers] = port.postMessage.mock.calls.find(([data]) => data.type === 'result');
    expect(message).toMatchObject({ id: 7, status: 200 });
    expect(new Uint8Array(message.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(transfers).toEqual([message.bytes]);
  });

  it('cancels a streamed body at the cap without transferring oversized bytes', async () => {
    const port = new FakePort();
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); },
      cancel,
    });
    await serveVerifiedFetchWorker(port, async () => ({ verifiedFetch: async () => new Response(body) }));
    port.message({ type: 'fetch', id: 1, resource: 'ipfs://large', maxBytes: 3 });
    await flush();
    expect(cancel).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'error', id: 1, error: expect.objectContaining({ name: 'ImageTooLargeError', maxBytes: 3 }) });
    expect(port.postMessage.mock.calls.some(([message]) => message.type === 'result')).toBe(false);
  });

  it('rejects a declared oversized body before reading it', async () => {
    const port = new FakePort();
    const arrayBuffer = vi.fn();
    const getReader = vi.fn();
    const response = { ok: true, headers: new Headers({ 'content-length': '100' }), body: { getReader }, arrayBuffer };
    const verifiedFetch = vi.fn(async () => response);
    await serveVerifiedFetchWorker(port, async () => ({ verifiedFetch }));
    port.message({ type: 'fetch', id: 1, resource: 'ipfs://large', maxBytes: 3 });
    await flush();
    expect(getReader).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(verifiedFetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'error', id: 1, error: expect.objectContaining({ name: 'ImageTooLargeError', actualBytes: 100 }) });
  });

  it('does not download error response bodies', async () => {
    const port = new FakePort();
    const arrayBuffer = vi.fn();
    const cancel = vi.fn(async () => {});
    const response = { ok: false, status: 404, statusText: 'Not Found', body: { cancel }, arrayBuffer };
    await serveVerifiedFetchWorker(port, async () => ({ verifiedFetch: async () => response }));
    port.message({ type: 'fetch', id: 1, resource: 'ipfs://missing', maxBytes: 3 });
    await flush();
    expect(cancel).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'result', id: 1, status: 404, statusText: 'Not Found', bytes: new ArrayBuffer(0) }, [new ArrayBuffer(0)]);
  });

  it('aborts the matching retrieval and discards results returned after cancellation', async () => {
    const port = new FakePort();
    const response = deferred();
    const verifiedFetch = vi.fn(() => response.promise);
    await serveVerifiedFetchWorker(port, async () => ({ verifiedFetch }));
    port.message({ type: 'fetch', id: 1, resource: 'ipfs://slow' });
    await flush();
    const signal = verifiedFetch.mock.calls[0][1].signal;
    port.message({ type: 'cancel', id: 1 });
    expect(signal.aborted).toBe(true);
    response.resolve(new Response('late'));
    await flush();
    expect(port.postMessage).toHaveBeenCalledOnce();
  });

  it('never starts requests cancelled while client initialization is pending', async () => {
    const port = new FakePort();
    const init = deferred();
    const verifiedFetch = vi.fn();
    const serving = serveVerifiedFetchWorker(port, () => init.promise);
    port.message({ type: 'fetch', id: 1, resource: 'ipfs://cancelled' });
    port.message({ type: 'cancel', id: 1 });
    init.resolve({ verifiedFetch });
    await serving;
    await flush();
    expect(verifiedFetch).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'ready' });
  });

  it('reports initialization failure as a structured startup error', async () => {
    const port = new FakePort();
    await serveVerifiedFetchWorker(port, async () => { throw new Error('Cannot open IndexedDB'); });
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'init-error', error: expect.objectContaining({ message: 'Cannot open IndexedDB' }) });
  });
});
