import { ImageTooLargeError, readCappedBytes } from '@/lib/ipfs/imageBytes';

function encodeError(error) {
  return { name: error?.name || 'Error', message: error?.message || 'Verified retrieval failed', maxBytes: error?.maxBytes, actualBytes: error?.actualBytes };
}
function decodeError(error) {
  if (error?.name === 'ImageTooLargeError') return new ImageTooLargeError(error.maxBytes, error.actualBytes);
  return Object.assign(new Error(error?.message || 'Verified retrieval failed'), { name: error?.name || 'Error' });
}
const aborted = () => new DOMException('Verified retrieval cancelled', 'AbortError');

/** The worker owns verification and body buffering; only completed bytes cross. */
export async function serveVerifiedFetchWorker(port, createClient) {
  const requests = new Map();
  const ready = Promise.resolve().then(createClient);
  port.addEventListener('message', ({ data }) => {
    if (data.type === 'cancel') {
      requests.get(data.id)?.abort();
      requests.delete(data.id);
      return;
    }
    if (data.type !== 'fetch') return;
    const controller = new AbortController();
    requests.set(data.id, controller);
    void (async () => {
      try {
        const { verifiedFetch } = await ready;
        if (controller.signal.aborted) return;
        const response = await verifiedFetch(data.resource, { ...data.options, signal: controller.signal });
        if (controller.signal.aborted) return;
        // The caller rejects error statuses; avoid downloading their bodies.
        if (!response.ok) await response.body?.cancel().catch(() => {});
        const bytes = !response.ok ? new Uint8Array(0) : data.maxBytes > 0
          ? await readCappedBytes(response, data.maxBytes)
          : new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) return;
        port.postMessage({ type: 'result', id: data.id, status: response.status, statusText: response.statusText, bytes: bytes.buffer }, [bytes.buffer]);
      } catch (error) {
        if (!controller.signal.aborted) port.postMessage({ type: 'error', id: data.id, error: encodeError(error) });
      } finally {
        // Also stop unread bodies (for example a declared size over the cap).
        controller.abort();
        requests.delete(data.id);
      }
    })();
  });
  try {
    const client = await ready;
    if (client.disabled || !client.verifiedFetch) throw new Error('Verified retrieval unavailable');
    port.postMessage({ type: 'ready' });
  } catch (error) {
    port.postMessage({ type: 'init-error', error: encodeError(error) });
  }
}

/** Inject the Worker so lifecycle/protocol behavior can be tested without DOM. */
export function connectVerifiedFetchWorker(worker, { startupTimeoutMs = 10000 } = {}) {
  return new Promise((resolveReady, rejectReady) => {
    const pending = new Map();
    let nextId = 0;
    let failure;
    const finish = (id, error, response) => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.cleanup();
      if (error) request.reject(error);
      else request.resolve(response);
    };
    const stop = (error) => {
      if (failure) return;
      failure = error;
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
      worker.terminate();
      rejectReady(error);
      for (const id of pending.keys()) finish(id, error);
    };
    const onError = (event) => stop(new Error(event.message || 'Verified retrieval worker failed'));
    const verifiedFetch = (resource, { signal, maxBytes = 0, ...options } = {}) => new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      if (signal?.aborted) return reject(aborted());
      const id = ++nextId;
      const cancel = () => {
        finish(id, aborted());
        try { worker.postMessage({ type: 'cancel', id }); } catch (error) { stop(error); }
      };
      pending.set(id, { resolve, reject, cleanup: () => signal?.removeEventListener('abort', cancel) });
      signal?.addEventListener('abort', cancel, { once: true });
      try { worker.postMessage({ type: 'fetch', id, resource: String(resource), maxBytes, options }); }
      catch (error) { finish(id, error); }
    });
    const onMessage = ({ data }) => {
      if (data.type === 'ready') {
        clearTimeout(timer);
        resolveReady({ verifiedFetch, disabled: false });
      } else if (data.type === 'init-error') {
        stop(decodeError(data.error));
      } else if (data.type === 'error') {
        finish(data.id, decodeError(data.error));
      } else if (data.type === 'result' && pending.has(data.id)) {
        try {
          const body = [204, 205, 304].includes(data.status) ? null : data.bytes;
          finish(data.id, null, new Response(body, { status: data.status, statusText: data.statusText }));
        } catch (error) { finish(data.id, error); }
      }
    };
    const timer = setTimeout(() => stop(new DOMException('Verified retrieval worker startup timed out', 'TimeoutError')), startupTimeoutMs);
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
  });
}
