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
