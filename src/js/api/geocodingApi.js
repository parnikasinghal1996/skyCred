/**
 * Place suggestions — Open-Meteo's free geocoding API (no key, CORS-enabled).
 * See GEOCODING_BASE_URL in core/constants.js for why this is not WeatherAPI's own search endpoint.
 *
 * Suggestions are a convenience: callers treat any failure here as "no suggestions" and plain search
 * keeps working. The text typed so far is sent to Open-Meteo, which the README discloses.
 */
import { GEOCODING_BASE_URL, GEOCODING_TIMEOUT_MS, SUGGESTION_COUNT, SUGGESTION_MIN_CHARS } from '../core/constants.js';
import { abortError, fetchText, TransportError } from './http.js';

export class GeocodingError extends Error {
  constructor(kind, { status = null, cause } = {}) {
    super(kind);
    this.name = 'GeocodingError';
    this.kind = kind; // 'network' | 'timeout' | 'http' | 'unexpected'
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

/** "Pune, Maharashtra, India" — repeated parts are dropped ("Singapore, Singapore" → "Singapore"). */
export function placeLabel({ name, admin1, country }) {
  const seen = new Set();
  return [name, admin1, country]
    .filter((part) => {
      if (typeof part !== 'string' || !part.trim()) return false;
      const key = part.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((part) => part.trim())
    .join(', ');
}

/** One raw Open-Meteo result → a place, or null when it lacks a usable name or coordinates. */
export function toPlace(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.name !== 'string' || !item.name.trim()) return null;
  if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return null;

  const place = {
    id: Number.isFinite(item.id) ? item.id : null,
    name: item.name.trim(),
    admin1: typeof item.admin1 === 'string' ? item.admin1.trim() : '',
    country: typeof item.country === 'string' ? item.country.trim() : '',
    countryCode: typeof item.country_code === 'string' ? item.country_code : '',
    latitude: item.latitude,
    longitude: item.longitude,
  };
  place.label = placeLabel(place);
  return Object.freeze(place);
}

export function createGeocoder({
  baseUrl = GEOCODING_BASE_URL,
  timeoutMs = GEOCODING_TIMEOUT_MS,
  fetchImpl,
} = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

  /** Resolves a de-duplicated list of places (possibly empty). Rejects with GeocodingError / AbortError. */
  async function searchPlaces(query, { signal, count = SUGGESTION_COUNT } = {}) {
    const name = String(query ?? '').trim();
    if (name.length < SUGGESTION_MIN_CHARS) return [];
    if (signal && signal.aborted) throw abortError();

    const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/search`);
    url.searchParams.set('name', name);
    url.searchParams.set('count', String(count));
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    let reply;
    try {
      reply = await fetchText(doFetch, url, { signal, timeoutMs, init: { headers: { Accept: 'application/json' } } });
    } catch (error) {
      if (error instanceof TransportError) throw new GeocodingError(error.kind, { cause: error.cause });
      throw error; // AbortError
    }

    if (!reply.response.ok) throw new GeocodingError('http', { status: reply.response.status });

    let body;
    try {
      body = JSON.parse(reply.text);
    } catch {
      throw new GeocodingError('unexpected');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GeocodingError('unexpected');

    // No matches: Open-Meteo omits `results` entirely.
    const results = body.results === undefined ? [] : body.results;
    if (!Array.isArray(results)) throw new GeocodingError('unexpected');

    const seen = new Set();
    const places = [];
    for (const item of results) {
      const place = toPlace(item);
      if (!place || seen.has(place.label.toLowerCase())) continue;
      seen.add(place.label.toLowerCase());
      places.push(place);
    }
    return places;
  }

  return { searchPlaces };
}
