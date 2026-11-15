/**
 * Maps a validated WeatherAPI /current.json payload to display values.
 * Numbers are shown exactly as the API reports them (no rounding) so the UI can be compared 1:1
 * with the JSON viewer. Units follow FR-04/FR-06: °C, km/h, %, Index, km, mb, °F.
 */
import { formatLocalTime, toDateTimeAttribute } from './format.js';

const ICON_HOST = 'cdn.weatherapi.com';

/**
 * WeatherAPI returns protocol-relative icon URLs ("//cdn.weatherapi.com/weather/64x64/day/116.png").
 * Only https URLs on WeatherAPI's own CDN are accepted; anything else is dropped.
 */
export function resolveIconUrl(icon, size = 128) {
  if (typeof icon !== 'string' || icon === '') return null;
  let url;
  try {
    url = new URL(icon.startsWith('//') ? `https:${icon}` : icon);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== ICON_HOST) return null;
  return size === 128 ? url.href.replace('/64x64/', '/128x128/') : url.href;
}

function joinPlace(region, country) {
  return [region, country].filter((part) => typeof part === 'string' && part.trim() !== '').join(', ');
}

export function toViewModel(data) {
  const { location, current } = data;

  const windHint = [];
  if (typeof current.wind_dir === 'string' && current.wind_dir) windHint.push(`from ${current.wind_dir}`);
  if (Number.isFinite(current.gust_kph)) windHint.push(`gusts ${current.gust_kph} km/h`);

  return {
    city: location.name,
    place: joinPlace(location.region, location.country),
    timezone: location.tz_id,
    localTime: formatLocalTime(location.localtime),
    localTimeAttribute: toDateTimeAttribute(location.localtime),
    temperatureC: String(current.temp_c),
    condition: current.condition.text,
    iconUrl: resolveIconUrl(current.condition.icon, 128),
    fallbackIconUrl: resolveIconUrl(current.condition.icon, 64),
    basis: `${current.temp_c}°C · ${current.condition.text} · ${current.wind_kph} km/h wind`,

    // FR-06 — the three primary metric cards
    metrics: [
      { id: 'humidity', label: 'Humidity', icon: 'droplet', value: String(current.humidity), unit: '%' },
      { id: 'wind', label: 'Wind', icon: 'wind', value: String(current.wind_kph), unit: 'km/h' },
      { id: 'uv', label: 'UV index', icon: 'sun', value: String(current.uv), unit: 'Index' },
    ],

    // FR-06 — secondary information
    details: [
      { id: 'cloud', label: 'Cloud coverage', icon: 'cloud', value: String(current.cloud), unit: '%' },
      { id: 'visibility', label: 'Visibility', icon: 'eye', value: String(current.vis_km), unit: 'km' },
      { id: 'pressure', label: 'Atmospheric pressure', icon: 'gauge', value: String(current.pressure_mb), unit: 'mb' },
      {
        id: 'windSpeed',
        label: 'Wind speed',
        icon: 'wind',
        value: String(current.wind_kph),
        unit: 'km/h',
        hint: windHint.join(' · '),
      },
      { id: 'temperatureF', label: 'Temperature', icon: 'thermometer', value: String(current.temp_f), unit: '°F' },
      {
        id: 'lastUpdated',
        label: 'Last updated',
        icon: 'refresh-cw',
        value: formatLocalTime(current.last_updated),
        unit: '',
        hint: `Local time in ${location.tz_id}`,
      },
    ],
  };
}
