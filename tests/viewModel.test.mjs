import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { toViewModel, resolveIconUrl } from '../src/js/core/viewModel.js';
import { formatLocalTime, parseApiTime, toDateTimeAttribute } from '../src/js/core/format.js';
import { normalizeCity, toApiQuery, weatherMatchesCity } from '../src/js/core/cities.js';
import { POPULAR_CITIES, DEFAULT_CITY } from '../src/js/core/constants.js';

const fixture = async (name) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

test('FR-04/FR-06: every displayed value is read from the response, with the required units', async () => {
  for (const file of ['current-mumbai.json', 'current-london.json']) {
    const data = await fixture(file);
    const vm = toViewModel(data);
    const { location, current } = data;

    assert.equal(vm.city, location.name);
    assert.equal(vm.timezone, location.tz_id);
    assert.equal(vm.temperatureC, String(current.temp_c)); // Celsius, unrounded
    assert.equal(vm.condition, current.condition.text);

    const metric = (id) => vm.metrics.find((m) => m.id === id);
    assert.deepEqual(vm.metrics.map((m) => m.id), ['humidity', 'wind', 'uv']);
    assert.deepEqual([metric('humidity').value, metric('humidity').unit], [String(current.humidity), '%']);
    assert.deepEqual([metric('wind').value, metric('wind').unit], [String(current.wind_kph), 'km/h']); // km/h, not mph
    assert.deepEqual([metric('uv').value, metric('uv').unit], [String(current.uv), 'Index']);

    const detail = (id) => vm.details.find((d) => d.id === id);
    assert.deepEqual(vm.details.map((d) => d.id), ['cloud', 'visibility', 'pressure', 'windSpeed', 'temperatureF', 'lastUpdated']);
    assert.deepEqual([detail('cloud').value, detail('cloud').unit], [String(current.cloud), '%']);
    assert.deepEqual([detail('visibility').value, detail('visibility').unit], [String(current.vis_km), 'km']);
    assert.deepEqual([detail('pressure').value, detail('pressure').unit], [String(current.pressure_mb), 'mb']);
    assert.deepEqual([detail('windSpeed').value, detail('windSpeed').unit], [String(current.wind_kph), 'km/h']);
    assert.deepEqual([detail('temperatureF').value, detail('temperatureF').unit], [String(current.temp_f), '°F']);
    assert.equal(detail('lastUpdated').value, formatLocalTime(current.last_updated));
  }
});

test('FR-04: the weather icon is the API\'s own icon for the condition', async () => {
  const data = await fixture('current-mumbai.json');
  const vm = toViewModel(data);
  const apiPath = new URL(`https:${data.current.condition.icon}`).pathname; // /weather/64x64/day/149.png
  assert.equal(new URL(vm.fallbackIconUrl).pathname, apiPath);
  assert.equal(new URL(vm.iconUrl).pathname, apiPath.replace('/64x64/', '/128x128/'));
  assert.equal(new URL(vm.iconUrl).hostname, 'cdn.weatherapi.com');
});

test('icon URLs are restricted to https on WeatherAPI\'s CDN', () => {
  assert.ok(resolveIconUrl('//cdn.weatherapi.com/weather/64x64/day/116.png'));
  assert.equal(resolveIconUrl('//evil.example/x.png'), null);
  assert.equal(resolveIconUrl('http://cdn.weatherapi.com/weather/64x64/day/116.png'), null);
  assert.equal(resolveIconUrl('javascript:alert(1)'), null);
  assert.equal(resolveIconUrl('/weather/64x64/day/116.png'), null); // relative
  assert.equal(resolveIconUrl(''), null);
  assert.equal(resolveIconUrl(undefined), null);
});

test('FR-04: local time is formatted from the city\'s own timestamp — never shifted by the viewer\'s timezone', () => {
  assert.equal(formatLocalTime('2026-11-15 14:42'), 'Sun, 15 Nov · 2:42 PM');
  assert.equal(formatLocalTime('2026-11-15 00:05'), 'Sun, 15 Nov · 12:05 AM');
  assert.equal(formatLocalTime('2026-11-15 12:00'), 'Sun, 15 Nov · 12:00 PM');
  assert.equal(formatLocalTime('2026-11-15 23:59'), 'Sun, 15 Nov · 11:59 PM');
  assert.equal(formatLocalTime('2026-03-05 9:05'), 'Thu, 5 Mar · 9:05 AM'); // WeatherAPI does not pad the hour
  assert.equal(formatLocalTime('2028-02-29 06:30'), 'Tue, 29 Feb · 6:30 AM'); // leap day
  assert.equal(toDateTimeAttribute('2026-03-05 9:05'), '2026-03-05T09:05');
  assert.equal(formatLocalTime('not a date'), 'not a date');
  assert.equal(parseApiTime('2026-13-01 10:00'), null);
  assert.equal(parseApiTime('2026-11-15 25:00'), null);
});

test('FR-03: the popular cities are exactly the ten in the PRD, in order, and Mumbai is the default', () => {
  assert.deepEqual([...POPULAR_CITIES], [
    'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'New York', 'London',
  ]);
  assert.equal(DEFAULT_CITY, 'Mumbai');
});

test('toApiQuery: only the ambiguous popular city gets a country hint', () => {
  assert.equal(toApiQuery('Delhi'), 'Delhi, India');
  assert.equal(toApiQuery('  dElHi '), 'Delhi, India');
  assert.equal(toApiQuery('Delhi, Ontario'), 'Delhi, Ontario');
  assert.equal(toApiQuery('Delhi, India'), 'Delhi, India');
  for (const city of POPULAR_CITIES.filter((c) => c !== 'Delhi')) assert.equal(toApiQuery(city), city, city);
  assert.equal(toApiQuery('Paris'), 'Paris');
  assert.equal(toApiQuery('   '), '');
});

test('FR-03.4: chip highlighting matches what was asked for or what the API resolved it to', () => {
  const weather = { query: 'bengaluru', data: { location: { name: 'Bangalore' } } };
  assert.equal(weatherMatchesCity(weather, 'Bengaluru'), true);
  assert.equal(weatherMatchesCity(weather, 'Bangalore'), true);
  assert.equal(weatherMatchesCity(weather, 'Delhi'), false);
  assert.equal(weatherMatchesCity(null, 'Delhi'), false);
  assert.equal(weatherMatchesCity({ query: 'London, UK', data: { location: { name: 'London' } } }, 'London'), true);
  assert.equal(weatherMatchesCity({ query: 'york', data: { location: { name: 'York' } } }, 'New York'), false);
  assert.equal(normalizeCity('  New   York '), 'new york');
});
