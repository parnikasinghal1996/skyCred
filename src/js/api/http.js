/**
 * Transport shared by the API clients: one GET with a timeout and an optional caller-supplied
 * AbortSignal. It never logs the URL (WeatherAPI URLs carry the API key).
 */

export function abortError() {
  const error = new Error('The request was aborted.');
  error.name = 'AbortError';
  return error;
}

export class TransportError extends Error {
  constructor(kind, { cause, offline = false } = {}) {
    super(kind);
    this.name = 'TransportError';
    this.kind = kind; // 'timeout' | 'network'
    this.offline = offline;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Resolves `{ response, text }`.
 * Rejects with a TransportError ('timeout' | 'network') or with an AbortError when `signal` aborts.
 */
export async function fetchText(doFetch, url, { signal, timeoutMs, init = {} } = {}) {
  if (signal && signal.aborted) throw abortError(); // superseded before it even started

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await doFetch(String(url), { method: 'GET', ...init, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (cause) {
    if (timedOut) throw new TransportError('timeout', { cause });
    if (signal && signal.aborted) throw abortError();
    throw new TransportError('network', {
      cause,
      offline: Boolean(globalThis.navigator) && globalThis.navigator.onLine === false,
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', forwardAbort);
  }
}
