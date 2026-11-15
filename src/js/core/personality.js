/**
 * Weather personality (PRD FR-05) — turns temperature, condition and wind into a title and a
 * one-line recommendation. It is an application-generated interpretation, not a real credit score.
 *
 * Inputs (all straight from the API response): current.temp_c, current.condition.{code,text},
 * current.wind_kph.
 *
 * Priority order — the FIRST rule that matches wins, so overlapping conditions always resolve the
 * same way:
 *
 *   1. very hot   temp ≥ 35 °C                 → Sun Alert      (heat is the biggest health risk)
 *   2. very cold  temp ≤ 5 °C                  → Freeze Frame   (cold outranks rain and wind)
 *   3. rainy      condition is wet             → Rain Check     (rain, drizzle, sleet, thunder)
 *   4. hazy       fog, smoke, haze, dust, sand → Hazy Mode      (gap-filler: not in the PRD examples)
 *   5. windy      wind ≥ 30 km/h               → Breezy Mode    (Beaufort 5 "fresh breeze" and up)
 *   6. pleasant   18 °C ≤ temp ≤ 30 °C         → Perfect Day
 *   7. cool       5 °C < temp < 18 °C          → Layer Up       (gap-filler: not in the PRD examples)
 *   8. warm       30 °C < temp < 35 °C         → Warm Spell     (gap-filler: not in the PRD examples)
 *
 * The gap-fillers exist so every possible reading maps to an honest message: without them 9 °C or
 * 33 °C would be a "Perfect Day", and so would a severe sandstorm or Delhi's smog season (live data
 * already reports conditions such as "Smoky haze" and "Severe sandstorm").
 */

export const THRESHOLDS = Object.freeze({
  veryColdMaxC: 5,
  pleasantMinC: 18,
  pleasantMaxC: 30,
  veryHotMinC: 35,
  windyMinKph: 30,
});

export const PERSONALITIES = Object.freeze({
  SUN_ALERT: {
    id: 'sun-alert',
    title: 'Sun Alert',
    description: 'Stay hydrated and avoid excessive sun exposure.',
    tone: 'hot',
    icon: 'sun',
  },
  FREEZE_FRAME: {
    id: 'freeze-frame',
    title: 'Freeze Frame',
    description: 'Bone-chilling cold. Bundle up tight.',
    tone: 'cold',
    icon: 'snowflake',
  },
  RAIN_CHECK: {
    id: 'rain-check',
    title: 'Rain Check',
    description: 'Carry an umbrella before stepping out.',
    tone: 'rain',
    icon: 'cloud-rain',
  },
  HAZY_MODE: {
    id: 'hazy-mode',
    title: 'Hazy Mode',
    description: 'Reduced visibility or air quality. Take it easy outdoors.',
    tone: 'haze',
    icon: 'cloud',
  },
  BREEZY_MODE: {
    id: 'breezy-mode',
    title: 'Breezy Mode',
    description: 'Expect strong winds. Dress accordingly.',
    tone: 'wind',
    icon: 'wind',
  },
  PERFECT_DAY: {
    id: 'perfect-day',
    title: 'Perfect Day',
    description: 'Great weather to step outside.',
    tone: 'good',
    icon: 'smile',
  },
  LAYER_UP: {
    id: 'layer-up',
    title: 'Layer Up',
    description: 'Cool out there. A jacket will keep you comfortable.',
    tone: 'cool',
    icon: 'layers',
  },
  WARM_SPELL: {
    id: 'warm-spell',
    title: 'Warm Spell',
    description: 'Warm weather. Light clothes and a water bottle will help.',
    tone: 'warm',
    icon: 'thermometer',
  },
});

/**
 * WeatherAPI condition codes for liquid precipitation:
 * patchy/light/heavy rain, drizzle, freezing rain, sleet, showers and thunder with rain.
 * (Snow and ice-pellet codes are deliberately absent — they only occur in the "very cold" band.)
 */
const RAIN_CODES = new Set([
  1063, 1069, 1072, 1087, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1204, 1207, 1240, 1243,
  1246, 1249, 1252, 1273, 1276,
]);

/** Documented codes that are NOT liquid precipitation: clear/cloudy/mist/fog, snow, ice pellets, snow-thunder. */
const NON_RAIN_CODES = new Set([
  1000, 1003, 1006, 1009, 1030, 1066, 1114, 1117, 1135, 1147, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255, 1258, 1261,
  1264, 1279, 1282,
]);

const RAIN_TEXT = /rain|drizzle|shower|thunder|sleet/i;

/**
 * Codes are authoritative when we know them. WeatherAPI keeps adding conditions (live data already
 * returns e.g. 1036 "Smoky haze"), so an unknown or missing code is decided from the condition text.
 */
function isRainy(condition) {
  const code = Number(condition && condition.code);
  if (RAIN_CODES.has(code)) return true;
  if (NON_RAIN_CODES.has(code)) return false;
  return RAIN_TEXT.test(String((condition && condition.text) || ''));
}

/** Fog and freezing fog (documented codes) plus any smoke / haze / dust / sand condition by its text. */
const HAZY_CODES = new Set([1135, 1147]);
const HAZY_TEXT = /\b(fog|foggy|smoke|smoky|smog|haze|hazy|dust|dusty|duststorm|dust storm|sand|sandstorm|volcanic ash)\b/i;

function isHazy(condition) {
  const code = Number(condition && condition.code);
  return HAZY_CODES.has(code) || HAZY_TEXT.test(String((condition && condition.text) || ''));
}

function pick(definition, trigger) {
  return Object.freeze({ ...definition, trigger });
}

/** @param {{ current: { temp_c: number, wind_kph: number, condition: { code?: number, text?: string } } }} data */
export function getWeatherPersonality(data) {
  const { current } = data;
  const tempC = Number(current.temp_c);
  const windKph = Number(current.wind_kph);

  if (tempC >= THRESHOLDS.veryHotMinC) return pick(PERSONALITIES.SUN_ALERT, 'very-hot');
  if (tempC <= THRESHOLDS.veryColdMaxC) return pick(PERSONALITIES.FREEZE_FRAME, 'very-cold');
  if (isRainy(current.condition)) return pick(PERSONALITIES.RAIN_CHECK, 'rain');
  if (isHazy(current.condition)) return pick(PERSONALITIES.HAZY_MODE, 'haze');
  if (windKph >= THRESHOLDS.windyMinKph) return pick(PERSONALITIES.BREEZY_MODE, 'wind');
  if (tempC >= THRESHOLDS.pleasantMinC && tempC <= THRESHOLDS.pleasantMaxC) {
    return pick(PERSONALITIES.PERFECT_DAY, 'pleasant');
  }
  if (tempC < THRESHOLDS.pleasantMinC) return pick(PERSONALITIES.LAYER_UP, 'cool');
  return pick(PERSONALITIES.WARM_SPELL, 'warm');
}
