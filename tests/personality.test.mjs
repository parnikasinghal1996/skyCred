import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWeatherPersonality, PERSONALITIES, THRESHOLDS } from '../src/js/core/personality.js';

const reading = ({ temp = 24, wind = 10, code = 1000, text = 'Sunny' } = {}) => ({
  current: { temp_c: temp, wind_kph: wind, condition: { code, text } },
});
const idOf = (input) => getWeatherPersonality(reading(input)).id;

test('FR-05: the five PRD examples produce the documented title and recommendation', () => {
  const cases = [
    [{ temp: -2 }, 'Freeze Frame', 'Bone-chilling cold. Bundle up tight.'],
    [{ temp: 24 }, 'Perfect Day', 'Great weather to step outside.'],
    [{ temp: 41 }, 'Sun Alert', 'Stay hydrated and avoid excessive sun exposure.'],
    [{ temp: 24, code: 1189, text: 'Moderate rain' }, 'Rain Check', 'Carry an umbrella before stepping out.'],
    [{ temp: 24, wind: 45 }, 'Breezy Mode', 'Expect strong winds. Dress accordingly.'],
  ];
  for (const [input, title, description] of cases) {
    const personality = getWeatherPersonality(reading(input));
    assert.equal(personality.title, title);
    assert.equal(personality.description, description);
  }
});

test('temperature thresholds behave exactly at their boundaries', () => {
  assert.equal(THRESHOLDS.veryColdMaxC, 5);
  assert.equal(idOf({ temp: 5 }), 'freeze-frame'); // ≤ 5 → very cold
  assert.equal(idOf({ temp: 5.1 }), 'layer-up');
  assert.equal(idOf({ temp: 17.9 }), 'layer-up');
  assert.equal(idOf({ temp: 18 }), 'perfect-day'); // 18..30 → pleasant
  assert.equal(idOf({ temp: 30 }), 'perfect-day');
  assert.equal(idOf({ temp: 30.1 }), 'warm-spell');
  assert.equal(idOf({ temp: 34.9 }), 'warm-spell');
  assert.equal(idOf({ temp: 35 }), 'sun-alert'); // ≥ 35 → very hot
});

test('wind threshold: 30 km/h and above is windy', () => {
  assert.equal(idOf({ wind: 29.9 }), 'perfect-day');
  assert.equal(idOf({ wind: 30 }), 'breezy-mode');
});

test('every temperature maps to exactly one personality (no gaps)', () => {
  const known = new Set(Object.values(PERSONALITIES).map((p) => p.id));
  for (let temp = -40; temp <= 60; temp += 0.1) {
    assert.ok(known.has(idOf({ temp: Number(temp.toFixed(1)) })), `no personality for ${temp}°C`);
  }
});

test('overlapping conditions resolve by the documented priority order', () => {
  // very hot > very cold > rain > haze > wind > comfort bands
  assert.equal(idOf({ temp: 38, code: 1195, text: 'Heavy rain', wind: 50 }), 'sun-alert');
  assert.equal(idOf({ temp: 0, code: 1195, text: 'Heavy rain', wind: 50 }), 'freeze-frame');
  assert.equal(idOf({ temp: 0, wind: 60 }), 'freeze-frame');
  assert.equal(idOf({ temp: 24, code: 1195, text: 'Heavy rain', wind: 50 }), 'rain-check');
  assert.equal(idOf({ temp: 24, code: 1135, text: 'Fog', wind: 50 }), 'hazy-mode'); // haze beats wind
  assert.equal(idOf({ temp: 24, code: 1189, text: 'Moderate rain', wind: 5 }), 'rain-check'); // rain beats haze
  assert.equal(idOf({ temp: 40, code: 1135, text: 'Fog' }), 'sun-alert'); // heat beats haze
  assert.equal(idOf({ temp: 12, wind: 40 }), 'breezy-mode'); // wind beats the "cool" band
  assert.equal(idOf({ temp: 33, wind: 40 }), 'breezy-mode'); // …and the "warm" band
});

test('hazard conditions are never called a Perfect Day (conditions reported by the live API)', () => {
  const cases = [
    [1135, 'Fog'],
    [1147, 'Freezing fog'],
    [1036, 'Smoky haze'], // live: Mumbai
    [4001, 'Severe sandstorm'], // live: Kuwait City, Riyadh
    [4002, 'Dust'],
    [4003, 'Dust storm'],
  ];
  for (const [code, text] of cases) assert.equal(idOf({ temp: 24, code, text }), 'hazy-mode', text);
  // ordinary skies and light mist stay pleasant, and look-alike words do not trigger it
  for (const [code, text] of [[1000, 'Sunny'], [1003, 'Partly Cloudy'], [1009, 'Overcast'], [1030, 'Mist'], [4004, 'Sandy beach weather splash']]) {
    assert.equal(idOf({ temp: 24, code, text }), 'perfect-day', text);
  }
});

test('rain detection: wet codes are rainy, dry and snow codes are not', () => {
  for (const code of [1063, 1150, 1183, 1189, 1195, 1198, 1204, 1240, 1246, 1087, 1273, 1276]) {
    assert.equal(idOf({ temp: 24, code, text: 'x' }), 'rain-check', `code ${code}`);
  }
  for (const code of [1000, 1003, 1006, 1009, 1030, 1213, 1225, 1237]) {
    assert.equal(idOf({ temp: 24, code, text: 'rain shower' }), 'perfect-day', `code ${code} is documented as dry`);
  }
});

test('rain detection falls back to the condition text for unknown or missing codes', () => {
  assert.equal(idOf({ temp: 24, code: 1036, text: 'Smoky haze' }), 'hazy-mode'); // real unknown code from the live API: not rain
  assert.equal(idOf({ temp: 24, code: 4242, text: 'Heavy rain shower with hail' }), 'rain-check');

  // no code at all (built by hand — the `reading` helper would default it to 1000)
  const withoutCode = (text) => ({ current: { temp_c: 24, wind_kph: 5, condition: { text } } });
  assert.equal(getWeatherPersonality(withoutCode('Patchy light drizzle')).id, 'rain-check');
  assert.equal(getWeatherPersonality(withoutCode('Overcast')).id, 'perfect-day');
});

test('the result names the rule that fired and is immutable', () => {
  const personality = getWeatherPersonality(reading({ temp: 41 }));
  assert.equal(personality.trigger, 'very-hot');
  assert.throws(() => {
    'use strict';
    personality.title = 'changed';
  });
});
