import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AQI_LEVELS, aqiLevelOf, describeAirQuality } from '../src/js/core/aqi.js';

// Fixtures are REAL WeatherAPI responses requested with aqi=yes.
const fixture = async (name) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

test('real Mumbai response: US EPA level 4 (Unhealthy) with every pollutant in µg/m³', async () => {
  const { current } = await fixture('current-mumbai-aqi.json');
  const info = describeAirQuality(current.air_quality);

  assert.equal(info.available, true);
  assert.equal(info.level.level, current.air_quality['us-epa-index']); // the API's own index, not a recomputation
  assert.equal(info.level.level, 4);
  assert.equal(info.level.label, 'Unhealthy');
  assert.equal(info.level.range, '151–200');
  assert.deepEqual(
    info.pollutants.map((p) => [p.label, p.value, p.unit]),
    [
      ['PM2.5', '85.9', 'µg/m³'],
      ['PM10', '95.9', 'µg/m³'],
      ['O₃', '236', 'µg/m³'],
      ['NO₂', '17.9', 'µg/m³'],
      ['SO₂', '23.9', 'µg/m³'],
      ['CO', '288', 'µg/m³'],
    ]
  );
  assert.deepEqual(info.defra, { index: 10, label: 'Very high' });
});

test('real Reykjavik response: level 1 (Good)', async () => {
  const { current } = await fixture('current-reykjavik-aqi.json');
  const info = describeAirQuality(current.air_quality);
  assert.equal(info.level.label, 'Good');
  assert.equal(info.level.range, '0–50');
  assert.deepEqual(info.defra, { index: 1, label: 'Low' });
});

test('the six EPA levels carry the standard names and AQI ranges', () => {
  assert.deepEqual(
    AQI_LEVELS.map((l) => [l.level, l.label, l.range]),
    [
      [1, 'Good', '0–50'],
      [2, 'Moderate', '51–100'],
      [3, 'Unhealthy for sensitive groups', '101–150'],
      [4, 'Unhealthy', '151–200'],
      [5, 'Very unhealthy', '201–300'],
      [6, 'Hazardous', '301+'],
    ]
  );
  for (const level of AQI_LEVELS) assert.ok(level.advice.length > 20, `level ${level.level} has advice`);
});

test('each US EPA index maps to the matching level', () => {
  for (let index = 1; index <= 6; index++) {
    assert.equal(describeAirQuality({ 'us-epa-index': index }).level.level, index);
    assert.equal(aqiLevelOf({ 'us-epa-index': index }), index);
  }
});

test('UK DEFRA index bands: 1–3 Low, 4–6 Moderate, 7–9 High, 10 Very high', () => {
  const band = (index) => describeAirQuality({ 'us-epa-index': 2, 'gb-defra-index': index }).defra;
  for (const [index, label] of [[1, 'Low'], [3, 'Low'], [4, 'Moderate'], [6, 'Moderate'], [7, 'High'], [9, 'High'], [10, 'Very high']]) {
    assert.deepEqual(band(index), { index, label });
  }
  for (const bad of [0, 11, 2.5, '5', null, undefined]) assert.equal(band(bad), null, String(bad));
});

test('missing, partial or malformed air quality degrades to "unavailable" instead of throwing', () => {
  for (const bad of [undefined, null, {}, [], 'x', 5, { 'us-epa-index': 0 }, { 'us-epa-index': 7 }, { 'us-epa-index': 2.5 }, { 'us-epa-index': '3' }, { pm2_5: 10 }]) {
    assert.deepEqual(describeAirQuality(bad), { available: false }, JSON.stringify(bad));
  }
  assert.equal(aqiLevelOf(undefined), null);
  assert.equal(aqiLevelOf({ 'us-epa-index': 9 }), null);
});

test('only pollutants that were actually reported are listed, rounded to one decimal', () => {
  const info = describeAirQuality({ 'us-epa-index': 3, pm2_5: 58.049, pm10: null, o3: 'n/a', no2: 12, so2: undefined, co: Infinity });
  assert.deepEqual(info.pollutants.map((p) => [p.id, p.value]), [['pm2_5', '58'], ['no2', '12']]);
  assert.equal(describeAirQuality({ 'us-epa-index': 3, pm2_5: 58.06 }).pollutants[0].value, '58.1');
});
