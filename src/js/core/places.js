/**
 * Turning a chosen suggestion into WeatherAPI queries — and noticing when the answer is not quite that place.
 *
 * Verified against the live API:
 *  • a bare `lat,lon` resolves to the nearest *neighbourhood* ("Strand" for London, "Bombay Dharavi" for Mumbai);
 *  • `London, England, United Kingdom` resolves to "New England", 74 km away;
 *  • WeatherAPI's own names carry no accents ("Ile-de-France", "Sao Paulo", "Zurich"), and an accented query can
 *    land somewhere else entirely: "Kraków, …, Poland" → Poland, New York; "Hyderābād, …" → Daraz, 200 km away.
 *
 * So candidates run from accent-free text to coordinates, and the caller keeps the first answer that lands near the
 * place that was actually chosen.
 */
import { distanceKm } from './geo.js';

const round4 = (value) => Math.round(value * 10000) / 10000;

/** Letters that do not decompose into base + accent under Unicode normalisation. */
const SPECIAL = { Ł: 'L', ł: 'l', Ø: 'O', ø: 'o', Đ: 'D', đ: 'd', ß: 'ss', Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe', ı: 'i' };

/** "Hyderābād" → "Hyderabad", "Kraków" → "Krakow", "Łódź" → "Lodz". */
export function foldDiacritics(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ŁłØøĐđßÆæŒœı]/g, (letter) => SPECIAL[letter]);
}

/** Ordered WeatherAPI `q` candidates for a place ({ name, admin1, country, latitude, longitude }). */
export function placeQueries(place) {
  const queries = [];
  const add = (query) => {
    if (query && !queries.includes(query)) queries.push(query);
  };

  // Accent-free spellings first (WeatherAPI's own); the original spelling only matters when it differs.
  const spellings = [
    { name: foldDiacritics(place.name), admin1: foldDiacritics(place.admin1), country: foldDiacritics(place.country) },
    { name: place.name, admin1: place.admin1, country: place.country },
  ];
  for (const { name, admin1, country } of spellings) {
    if (admin1 && admin1 !== name) add([name, admin1, country].filter(Boolean).join(', '));
    if (country) add(`${name}, ${country}`);
  }

  add(`${round4(place.latitude)},${round4(place.longitude)}`); // always resolves, so it is always last
  return queries;
}

const nameKey = (text) =>
  foldDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Same place name, ignoring accents, case and punctuation; one containing the other counts ("New York" / "New York City"). */
export function namesMatch(a, b) {
  const x = nameKey(a);
  const y = nameKey(b);
  return Boolean(x) && Boolean(y) && (x === y || x.includes(y) || y.includes(x));
}

/**
 * When the weather that came back is for a point whose name differs from the place that was chosen (WeatherAPI only
 * had a nearby village or neighbourhood), say so: `{ placeName, km }`. `null` when the names agree.
 */
export function nearbyNote(place, location) {
  if (!place || !location || namesMatch(place.name, location.name)) return null;
  const known = Number.isFinite(location.lat) && Number.isFinite(location.lon);
  return { placeName: place.name, km: known ? Math.round(distanceKm(place, location)) : null };
}
