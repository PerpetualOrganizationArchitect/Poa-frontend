function cancellationError(reason) {
  const error = new Error('Request cancelled', { cause: reason });
  error.name = 'AbortError';
  return error;
}

/**
 * Keep the caller's cancellation and a request timeout independent. In
 * particular, Apollo aborts its signal when a query loses its subscribers.
 * Replacing that signal would leave the abandoned request on the wire.
 *
 * A timeout remains retryable; deliberate caller cancellation does not.
 */
export async function fetchWithTimeout(input, init = {}, timeoutMs = 15000) {
  if (typeof AbortController === 'undefined') return fetch(input, init);

  const callerSignal = init.signal || input?.signal;
  if (callerSignal?.aborted) throw cancellationError(callerSignal.reason);

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(callerSignal.reason);
  callerSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (callerSignal?.aborted) throw cancellationError(callerSignal.reason);
    if (timedOut) {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`, { cause: error });
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', cancel);
  }
}

export function shouldRetryNetworkError(error) {
  return !!error && error.name !== 'AbortError';
}
