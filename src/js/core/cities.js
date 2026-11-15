/** City-name helpers shared by the search box and the popular-city chips. */
import { POPULAR_CITY_QUERIES } from './constants.js';

export function normalizeCity(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * The `q` actually sent to WeatherAPI for what the user typed or clicked. Popular cities whose bare
 * name is ambiguous get a country hint ("Delhi" → "Delhi, India"); anything else — including a
 * deliberately qualified search such as "Delhi, Ontario" — is sent exactly as written.
 */
export function toApiQuery(text) {
  const trimmed = String(text ?? '').trim();
  const key = normalizeCity(trimmed);
  const name = Object.keys(POPULAR_CITY_QUERIES).find((city) => normalizeCity(city) === key);
  return name ? POPULAR_CITY_QUERIES[name] : trimmed;
}

/**
 * Does the weather currently on screen belong to `city`? Matches either what the user asked for
 * ("bengaluru") or the name WeatherAPI resolved it to ("Bengaluru"), so typing a chip's city by
 * hand highlights the chip too.
 */
export function weatherMatchesCity(weather, city) {
  if (!weather) return false;
  const key = normalizeCity(city);
  if (!key) return false;
  const resolved = weather.data && weather.data.location ? weather.data.location.name : '';
  return key === normalizeCity(weather.query) || key === normalizeCity(resolved);
}
