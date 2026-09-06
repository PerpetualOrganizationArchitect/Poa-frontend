import { connectVerifiedFetchWorker } from '@/lib/ipfs/verifiedFetchWorkerBridge';

// Loading and verifying IPFS data can monopolize the UI thread. Start one
// worker only on first retrieval; blocked startup terminates after 10 seconds.
let heliaPromise = null;

export function getVerifiedFetch() {
  // Do not cache an SSR result: a server render must not disable the browser.
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve({ disabled: true });
  }
  if (!heliaPromise) {
    heliaPromise = Promise.resolve().then(() => {
      const worker = new Worker(new URL('./verifiedFetch.worker.js', import.meta.url));
      return connectVerifiedFetchWorker(worker);
    }).catch((error) => {
      console.warn('[IPFS] Worker init failed, gateway-only mode:', error?.message || error);
      return { disabled: true };
    });
  }
  return heliaPromise;
}
