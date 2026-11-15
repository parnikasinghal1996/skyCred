/**
 * WeatherAPI.com client — GET {base}/current.json?key=…&q=…&aqi=yes
 *
 * The client never touches the DOM and never logs the request URL (it contains the API key).
 * `fetchImpl` is injectable so the whole error matrix can be unit-tested.
 */
import { PLACE_MATCH_MAX_KM, REQUEST_TIMEOUT_MS, WEATHER_API_DEFAULT_BASE_URL } from '../core/constants.js';
import { distanceKm } from '../core/geo.js';
import { placeQueries } from '../core/places.js';
import { classifyFailure, ErrorType, WeatherApiError } from './errors.js';
import { abortError, fetchText, TransportError } from './http.js';

const REQUIRED_CURRENT_NUMBERS = ['temp_c', 'temp_f', 'humidity', 'wind_kph', 'uv', 'cloud', 'vis_km', 'pressure_mb'];

/**
 * True only when the payload contains every field the UI renders. A partial payload is treated as
 * an "unexpected response" rather than being shown half-empty (FR-08: no incomplete data).
 * `current.air_quality` is optional — WeatherAPI has none for some places.
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

function distanceToLocation(place, location) {
  return location && Number.isFinite(location.lat) && Number.isFinite(location.lon) ? distanceKm(place, location) : null;
}

export function createWeatherClient({
  apiKey,
  baseUrl = WEATHER_API_DEFAULT_BASE_URL,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl,
  includeAirQuality = true,
} = {}) {
  // Resolve `fetch` at call time so it can be swapped (tests, diagnostics).
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

  /**
   * Fetch current weather for `query` (a city name, "lat,lon", or "id:<WeatherAPI id>").
   * Resolves `{ data, rawText }` — `rawText` is the untouched response body (FR-07.2).
   * Rejects with a WeatherApiError, or an AbortError when `signal` aborts the request.
   */
  async function getCurrent(query, { signal, aqi = includeAirQuality } = {}) {
    const q = String(query ?? '').trim();
    if (!q) throw new WeatherApiError(ErrorType.VALIDATION);
    if (!apiKey) {
      throw new WeatherApiError(ErrorType.API_CONFIG, { apiMessage: 'The WeatherAPI key is not configured.' });
    }
    if (signal && signal.aborted) throw abortError();

    const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/current.json`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', q);
    if (aqi) url.searchParams.set('aqi', 'yes');

    let reply;
    try {
      reply = await fetchText(doFetch, url, {
        signal,
        timeoutMs,
        init: {
          headers: { Accept: 'application/json' },
          cache: 'no-store', // FR-10: always fetch fresh data
        },
      });
    } catch (error) {
      if (error instanceof TransportError) {
        throw new WeatherApiError(error.kind === 'timeout' ? ErrorType.TIMEOUT : ErrorType.NETWORK, {
          cause: error.cause,
          offline: error.offline,
        });
      }
      throw error; // AbortError
    }

    const { response, text: rawText } = reply;
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
  }

  /**
   * Weather for a place chosen from the suggestions ({ name, admin1, country, latitude, longitude }).
   * Candidates run from specific text to coordinates (see core/places.js); the first answer that lands
   * within PLACE_MATCH_MAX_KM of the chosen place wins. Only "no match" moves on to the next candidate —
   * network, quota and key problems are real failures and surface immediately.
   */
  async function getCurrentForPlace(place, { signal } = {}) {
    let closest = null;
    let notFound = null;

    for (const query of placeQueries(place)) {
      let result;
      try {
        result = await getCurrent(query, { signal });
      } catch (error) {
        if (error instanceof WeatherApiError && error.type === ErrorType.CITY_NOT_FOUND) {
          notFound = error;
          continue;
        }
        throw error;
      }
      const km = distanceToLocation(place, result.data.location);
      if (km === null || km <= PLACE_MATCH_MAX_KM) return result;
      if (!closest || km < closest.km) closest = { result, km };
    }

    if (closest) return closest.result; // nothing matched closely: the nearest answer beats no answer
    throw notFound || new WeatherApiError(ErrorType.CITY_NOT_FOUND);
  }

  return { getCurrent, getCurrentForPlace };
}
