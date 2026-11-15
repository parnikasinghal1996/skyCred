/**
 * WeatherAPI.com client (PRD FR-10) — GET {base}/current.json?key=…&q=…
 *
 * The client never touches the DOM and never logs the request URL (it contains the API key).
 * `fetchImpl` is injectable so the whole error matrix can be unit-tested.
 */
import { REQUEST_TIMEOUT_MS, WEATHER_API_DEFAULT_BASE_URL } from '../core/constants.js';
import { classifyFailure, ErrorType, WeatherApiError } from './errors.js';

const REQUIRED_CURRENT_NUMBERS = ['temp_c', 'temp_f', 'humidity', 'wind_kph', 'uv', 'cloud', 'vis_km', 'pressure_mb'];

/**
 * True only when the payload contains every field the UI renders. A partial payload is treated as
 * an "unexpected response" rather than being shown half-empty (FR-08: no incomplete data).
 */
export function isValidCurrentWeather(data) {
  if (!data || typeof data !== 'object') return false;
  const { location, current } = data;
  if (!location || typeof location !== 'object' || !current || typeof current !== 'object') return false;
  if (typeof location.name !== 'string' || location.name === '') return false;
  if (typeof location.tz_id !== 'string' || typeof location.localtime !== 'string') return false;
  if (typeof current.last_updated !== 'string') return false;
  if (!REQUIRED_CURRENT_NUMBERS.every((key) => Number.isFinite(current[key]))) return false;
  const condition = current.condition;
  return Boolean(
    condition &&
      typeof condition.text === 'string' &&
      typeof condition.icon === 'string' &&
      Number.isFinite(condition.code)
  );
}

function abortError() {
  const error = new Error('The request was aborted.');
  error.name = 'AbortError';
  return error;
}

export function createWeatherClient({
  apiKey,
  baseUrl = WEATHER_API_DEFAULT_BASE_URL,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl,
} = {}) {
  // Resolve `fetch` at call time so it can be swapped (tests, diagnostics).
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

  /**
   * Fetch current weather for `query`.
   * Resolves `{ data, rawText }` — `rawText` is the untouched response body (FR-07.2).
   * Rejects with a WeatherApiError, or an AbortError when `signal` aborts the request.
   */
  async function getCurrent(query, { signal } = {}) {
    const q = String(query ?? '').trim();
    if (!q) throw new WeatherApiError(ErrorType.VALIDATION);
    if (!apiKey) {
      throw new WeatherApiError(ErrorType.API_CONFIG, { apiMessage: 'The WeatherAPI key is not configured.' });
    }

    if (signal && signal.aborted) throw abortError(); // superseded before it even started

    const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/current.json`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', q);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', forwardAbort, { once: true });

    function transportFailure(cause) {
      if (timedOut) return new WeatherApiError(ErrorType.TIMEOUT, { cause });
      if (signal && signal.aborted) return abortError();
      return new WeatherApiError(ErrorType.NETWORK, {
        cause,
        offline: Boolean(globalThis.navigator) && globalThis.navigator.onLine === false,
      });
    }

    try {
      let response;
      let rawText;
      try {
        response = await doFetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store', // FR-10: always fetch fresh data
          signal: controller.signal,
        });
        rawText = await response.text();
      } catch (cause) {
        throw transportFailure(cause);
      }

      let body = null;
      try {
        body = rawText ? JSON.parse(rawText) : null;
      } catch {
        body = null; // not JSON — handled below
      }

      const apiError = body && typeof body === 'object' ? body.error : null;
      const apiCode = apiError && Number.isFinite(apiError.code) ? apiError.code : null;
      const apiMessage = apiError && typeof apiError.message === 'string' ? apiError.message : null;

      if (!response.ok || (apiError && !body.current)) {
        throw new WeatherApiError(classifyFailure(response.status, apiCode), {
          status: response.status,
          apiCode,
          apiMessage,
        });
      }
      if (!isValidCurrentWeather(body)) {
        throw new WeatherApiError(ErrorType.UNEXPECTED, {
          status: response.status,
          apiMessage: 'The response did not contain the expected weather fields.',
        });
      }
      return { data: body, rawText };
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', forwardAbort);
    }
  }

  return { getCurrent };
}
