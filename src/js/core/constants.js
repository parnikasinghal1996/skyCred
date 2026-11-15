/** App-wide constants. Nothing here is weather data — every weather value comes from the API. */

/** FR-01.1 — the city loaded on start-up and shown in the search box. */
export const DEFAULT_CITY = 'Mumbai';

/** FR-03 — popular city shortcuts, in display order. */
export const POPULAR_CITIES = Object.freeze([
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Ahmedabad',
  'New York',
  'London',
]);

/**
 * WeatherAPI resolves some bare names to a different place than people expect — verified against the
 * live API: q=Delhi returns Delhi, Ontario, Canada (3 °C), not Delhi, India. Popular cities listed
 * here are sent with a country hint; the UI still shows, types and highlights the plain name.
 * Every other popular city resolves correctly as-is and is sent exactly as written.
 */
export const POPULAR_CITY_QUERIES = Object.freeze({
  Delhi: 'Delhi, India',
});

export const WEATHER_API_DEFAULT_BASE_URL = 'https://api.weatherapi.com/v1';

/** A request that has not finished after this long is reported as a timeout (with Retry). */
export const REQUEST_TIMEOUT_MS = 15000;

/**
 * Place suggestions come from Open-Meteo's free geocoder, not WeatherAPI: checked against both, WeatherAPI's
 * search is a fuzzy full-name matcher (typing "mum" → Mumias, "pun" → Punia Airport, "tok" → Torokina Airport)
 * and surfaced the expected city for only 13 of 22 common prefixes, against 20 of 22 for Open-Meteo.
 * Weather and air quality still come only from WeatherAPI.
 */
export const GEOCODING_BASE_URL = 'https://geocoding-api.open-meteo.com/v1';
export const GEOCODING_TIMEOUT_MS = 8000;
export const SUGGESTION_DEBOUNCE_MS = 220;
export const SUGGESTION_MIN_CHARS = 2;
export const SUGGESTION_COUNT = 6;

/** A looked-up place must land within this distance of the suggestion that was chosen. */
export const PLACE_MATCH_MAX_KM = 50;
