/**
 * Air quality, from WeatherAPI's `current.air_quality` (requested with `aqi=yes`).
 *
 * The category is WeatherAPI's own `us-epa-index` (1–6). A numeric 0–500 AQI is deliberately NOT
 * computed here: checked against live data, the API's index agrees with the textbook EPA formula on only
 * 80 of 90 samples (it uses its own PM2.5 cut-offs), so a number computed here would sometimes contradict
 * the category the API reports. Each level carries the EPA's standard AQI *range* instead.
 */

export const AQI_LEVELS = Object.freeze([
  {
    level: 1,
    key: 'good',
    label: 'Good',
    range: '0–50',
    advice: 'Air quality is satisfactory and poses little or no risk.',
  },
  {
    level: 2,
    key: 'moderate',
    label: 'Moderate',
    range: '51–100',
    advice: 'Air quality is acceptable. Unusually sensitive people may notice effects from prolonged exposure.',
  },
  {
    level: 3,
    key: 'sensitive',
    label: 'Unhealthy for sensitive groups',
    range: '101–150',
    advice:
      'People with heart or lung disease, older adults, children and teens should reduce prolonged or heavy exertion outdoors.',
  },
  {
    level: 4,
    key: 'unhealthy',
    label: 'Unhealthy',
    range: '151–200',
    advice:
      'Everyone may begin to feel health effects and sensitive groups may feel more serious ones. Limit prolonged outdoor exertion.',
  },
  {
    level: 5,
    key: 'very-unhealthy',
    label: 'Very unhealthy',
    range: '201–300',
    advice: 'Health alert: the risk is increased for everyone. Avoid prolonged outdoor exertion.',
  },
  {
    level: 6,
    key: 'hazardous',
    label: 'Hazardous',
    range: '301+',
    advice: 'Health warning of emergency conditions. Everyone should avoid outdoor exertion.',
  },
]);

/** [response key, short label, full name] — all reported in µg/m³. */
const POLLUTANTS = Object.freeze([
  ['pm2_5', 'PM2.5', 'Fine particles'],
  ['pm10', 'PM10', 'Coarse particles'],
  ['o3', 'O₃', 'Ozone'],
  ['no2', 'NO₂', 'Nitrogen dioxide'],
  ['so2', 'SO₂', 'Sulphur dioxide'],
  ['co', 'CO', 'Carbon monoxide'],
]);

/** UK DEFRA daily air quality index bands. */
const DEFRA_BANDS = Object.freeze([
  [1, 3, 'Low'],
  [4, 6, 'Moderate'],
  [7, 9, 'High'],
  [10, 10, 'Very high'],
]);

const UNAVAILABLE = Object.freeze({ available: false });

const formatConcentration = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10));

/** WeatherAPI's US EPA level (1–6) for a `current.air_quality` object, or null when it has none. */
export function aqiLevelOf(airQuality) {
  const level = airQuality && airQuality['us-epa-index'];
  return Number.isInteger(level) && level >= 1 && level <= AQI_LEVELS.length ? level : null;
}

/** Everything the AQI card needs. Missing or partial air-quality data degrades to `{ available: false }`. */
export function describeAirQuality(airQuality) {
  if (!airQuality || typeof airQuality !== 'object') return UNAVAILABLE;
  const levelNumber = aqiLevelOf(airQuality);
  if (levelNumber === null) return UNAVAILABLE;

  const defraIndex = airQuality['gb-defra-index'];
  const band = Number.isInteger(defraIndex) ? DEFRA_BANDS.find(([low, high]) => defraIndex >= low && defraIndex <= high) : null;

  return {
    available: true,
    level: AQI_LEVELS[levelNumber - 1],
    defra: band ? { index: defraIndex, label: band[2] } : null,
    pollutants: POLLUTANTS.filter(([key]) => Number.isFinite(airQuality[key])).map(([key, label, name]) => ({
      id: key,
      label,
      name,
      value: formatConcentration(airQuality[key]),
      unit: 'µg/m³',
    })),
  };
}
