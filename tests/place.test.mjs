import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWeatherClient } from '../src/js/api/weatherApi.js';
import { ErrorType } from '../src/js/api/errors.js';
import { distanceKm } from '../src/js/core/geo.js';
import { foldDiacritics, namesMatch, nearbyNote, placeQueries } from '../src/js/core/places.js';

const fixture = (name) => readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

// The two places below are what Open-Meteo's geocoder returns for these cities.
const LONDON = { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.50853, longitude: -0.12574 };
const MUMBAI = { name: 'Mumbai', admin1: 'Maharashtra', country: 'India', latitude: 19.07283, longitude: 72.88261 };

/** A real WeatherAPI body (London) relocated to `name` at `lat`,`lon` — what the API says when it resolves a query there. */
async function answerAt(name, lat, lon) {
  const body = JSON.parse(await fixture('current-london.json'));
  Object.assign(body.location, { name, lat, lon });
  return JSON.stringify(body);
}
const notFound = () => reply(400, JSON.stringify({ error: { code: 1006, message: 'No matching location found.' } }));

/** A fetch that records each `q` and answers according to `script(q, callNumber)`. */
function scripted(script) {
  const queries = [];
  const impl = async (url) => {
    const params = new URL(url).searchParams;
    queries.push(params.get('q'));
    assert.equal(params.get('aqi'), 'yes', 'place lookups ask for air quality too');
    return script(params.get('q'), queries.length);
  };
  impl.queries = queries;
  return impl;
}
const clientWith = (fetchImpl) => createWeatherClient({ apiKey: 'test-key', fetchImpl });

// ---- helpers -----------------------------------------------------------------------------------------------

test('placeQueries runs from the most specific text to coordinates, without repeats', () => {
  assert.deepEqual(placeQueries(MUMBAI), ['Mumbai, Maharashtra, India', 'Mumbai, India', '19.0728,72.8826']);
  assert.deepEqual(placeQueries({ ...MUMBAI, admin1: 'Mumbai' }), ['Mumbai, India', '19.0728,72.8826'], 'admin1 equal to the name adds nothing');
  assert.deepEqual(placeQueries({ ...MUMBAI, admin1: '' }), ['Mumbai, India', '19.0728,72.8826']);
  assert.deepEqual(placeQueries({ name: 'Nowhere', latitude: 1.23456, longitude: -2.34567 }), ['1.2346,-2.3457']);
});

test('distanceKm is the great-circle distance and accepts either coordinate shape', () => {
  const londonParis = distanceKm({ lat: 51.5074, lon: -0.1278 }, { latitude: 48.8566, longitude: 2.3522 });
  assert.ok(Math.abs(londonParis - 344) < 4, `London–Paris ≈ 344 km, got ${londonParis.toFixed(1)}`);
  assert.equal(distanceKm({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }), 0);
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.2) < 0.5, 'one degree at the equator');
});

// ---- getCurrentForPlace ------------------------------------------------------------------------------------

test('the most specific query is used first and accepted when it lands near the chosen place (real Mumbai response)', async () => {
  const body = await fixture('current-mumbai-aqi.json');
  const fetchImpl = scripted(() => reply(200, body));
  const { data } = await clientWith(fetchImpl).getCurrentForPlace(MUMBAI);

  assert.deepEqual(fetchImpl.queries, ['Mumbai, Maharashtra, India']);
  assert.equal(data.location.name, 'Mumbai');
  assert.ok(distanceKm(MUMBAI, data.location) < 50);
});

test('London: "London, England, …" resolves to New England 78 km away, so it is rejected and the next query is used', async () => {
  const wrong = await answerAt('New England', 52.2, -0.13); // ≈ 77 km north of London
  const right = await answerAt('London', 51.52, -0.11);
  const fetchImpl = scripted((q) => reply(200, q === 'London, England, United Kingdom' ? wrong : right));
  const { data } = await clientWith(fetchImpl).getCurrentForPlace(LONDON);

  assert.deepEqual(fetchImpl.queries, ['London, England, United Kingdom', 'London, United Kingdom']);
  assert.equal(data.location.name, 'London');
});

test('"not found" moves on to the next candidate and ends at the coordinates', async () => {
  const nearby = await answerAt('Strand', 51.51, -0.12);
  const fetchImpl = scripted((q) => (/^[\d.-]+,[\d.-]+$/.test(q) ? reply(200, nearby) : notFound()));
  const { data } = await clientWith(fetchImpl).getCurrentForPlace(LONDON);

  assert.deepEqual(fetchImpl.queries, ['London, England, United Kingdom', 'London, United Kingdom', '51.5085,-0.1257']);
  assert.equal(data.location.name, 'Strand');
});

test('when nothing lands close, the nearest answer is returned rather than no answer', async () => {
  const far = [await answerAt('Far A', 52.9, -0.1), await answerAt('Far B', 52.4, -0.1), await answerAt('Far C', 53.5, -0.1)];
  const fetchImpl = scripted((q, n) => reply(200, far[n - 1]));
  const { data } = await clientWith(fetchImpl).getCurrentForPlace(LONDON);
  assert.equal(fetchImpl.queries.length, 3);
  assert.equal(data.location.name, 'Far B'); // ≈ 100 km: the closest of the three
});

test('real failures surface immediately instead of being retried as different queries', async () => {
  const cases = [
    [() => { throw new TypeError('Failed to fetch'); }, ErrorType.NETWORK],
    [() => reply(403, JSON.stringify({ error: { code: 2007, message: 'quota' } })), ErrorType.RATE_LIMIT],
    [() => reply(401, JSON.stringify({ error: { code: 2006, message: 'bad key' } })), ErrorType.API_CONFIG],
    [() => reply(503, '<html>down</html>'), ErrorType.SERVICE_UNAVAILABLE],
  ];
  for (const [script, type] of cases) {
    const fetchImpl = scripted(script);
    const error = await clientWith(fetchImpl).getCurrentForPlace(LONDON).catch((e) => e);
    assert.equal(error.type, type);
    assert.equal(fetchImpl.queries.length, 1, `${type}: no further candidates were tried`);
  }
});

test('if every candidate is "not found", the place is reported as not found', async () => {
  const fetchImpl = scripted(() => notFound());
  const error = await clientWith(fetchImpl).getCurrentForPlace(LONDON).catch((e) => e);
  assert.equal(error.type, ErrorType.CITY_NOT_FOUND);
  assert.equal(fetchImpl.queries.length, 3);
});

test('aborting between candidates stops the sequence', async () => {
  const controller = new AbortController();
  const wrong = await answerAt('New England', 52.2, -0.13);
  const fetchImpl = scripted(() => {
    controller.abort(); // the user searched for something else mid-lookup
    return reply(200, wrong);
  });
  await assert.rejects(clientWith(fetchImpl).getCurrentForPlace(LONDON, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetchImpl.queries.length, 1, 'no second candidate after the abort');
});

// ---- accents ----------------------------------------------------------------------------------------------

const HYDERABAD_PK = { name: 'Hyderābād', admin1: 'Sindh', country: 'Pakistan', latitude: 25.39242, longitude: 68.37366 };
const KRAKOW = { name: 'Kraków', admin1: 'Lesser Poland Voivodeship', country: 'Poland', latitude: 50.06143, longitude: 19.93658 };

test('foldDiacritics gives the accent-free spelling WeatherAPI itself uses', () => {
  const cases = [['Hyderābād', 'Hyderabad'], ['Zürich', 'Zurich'], ['São Paulo', 'Sao Paulo'], ['Kraków', 'Krakow'], ['Ürümqi', 'Urumqi'],
    ['Île-de-France', 'Ile-de-France'], ['Łódź', 'Lodz'], ['İstanbul', 'Istanbul'], ['Ho Chi Minh City', 'Ho Chi Minh City'], ['Straße', 'Strasse'], ['', '']];
  for (const [input, expected] of cases) assert.equal(foldDiacritics(input), expected, input);
  assert.equal(foldDiacritics(undefined), '');
});

test('placeQueries tries the accent-free spelling first, the original after it, then coordinates', () => {
  assert.deepEqual(placeQueries(HYDERABAD_PK), [
    'Hyderabad, Sindh, Pakistan',
    'Hyderabad, Pakistan',
    'Hyderābād, Sindh, Pakistan',
    'Hyderābād, Pakistan',
    '25.3924,68.3737',
  ]);
  assert.equal(placeQueries(KRAKOW)[0], 'Krakow, Lesser Poland Voivodeship, Poland');
  assert.equal(placeQueries(MUMBAI).length, 3, 'plain-ASCII names add no extra candidates');
});

test('an accented pick resolves on the first, accent-free query (real WeatherAPI behaviour: "Hyderābād" alone lands on Daraz)', async () => {
  const right = await answerAt('Hyderabad', 25.3667, 68.3667);
  const fetchImpl = scripted(() => reply(200, right));
  const { data } = await clientWith(fetchImpl).getCurrentForPlace(HYDERABAD_PK);
  assert.deepEqual(fetchImpl.queries, ['Hyderabad, Sindh, Pakistan']);
  assert.equal(data.location.name, 'Hyderabad');
});

test('a wrong answer for an accented name is rejected by the distance check (real case: Kraków → "Poland", New York)', async () => {
  const wrong = await answerAt('Poland', 43.1916, -75.0723);
  const right = await answerAt('Krakow', 50.0833, 19.9167);
  const fetchImpl = scripted((q) => reply(200, q === 'Krakow, Lesser Poland Voivodeship, Poland' ? wrong : right));
  const { data } = await clientWith(fetchImpl).getCurrentForPlace(KRAKOW);
  assert.deepEqual(fetchImpl.queries, ['Krakow, Lesser Poland Voivodeship, Poland', 'Krakow, Poland']);
  assert.equal(data.location.name, 'Krakow');
});

// ---- "nearest weather point" note -----------------------------------------------------------------------------

test('namesMatch ignores accents, case and punctuation, and lets one name contain the other', () => {
  for (const [a, b] of [['Hyderābād', 'Hyderabad'], ['New York', 'New York City'], ['Mumbai', 'mumbai'], ['Saint-Merri', 'Saint Merri'], ['Zürich', 'Zurich']]) {
    assert.equal(namesMatch(a, b), true, `${a} / ${b}`);
  }
  for (const [a, b] of [['London', 'Strand'], ['Hyderābād', 'Allah Ditta Chandia'], ['Paris', ''], ['', ''], [undefined, 'x']]) {
    assert.equal(namesMatch(a, b), false, `${a} / ${b}`);
  }
});

test('nearbyNote reports a differently named nearby point with its distance — and stays quiet when the names agree', () => {
  assert.equal(nearbyNote(HYDERABAD_PK, { name: 'Hyderabad', lat: 25.3667, lon: 68.3667 }), null);
  assert.equal(nearbyNote(MUMBAI, { name: 'Mumbai', lat: 18.975, lon: 72.826 }), null);
  assert.equal(nearbyNote(null, { name: 'Pune' }), null, 'typed searches never get a note');

  const note = nearbyNote(HYDERABAD_PK, { name: 'Allah Ditta Chandia', lat: 25.3969, lon: 68.3772 });
  assert.equal(note.placeName, 'Hyderābād');
  assert.ok(note.km >= 1 && note.km <= 3, `about 2 km, got ${note.km}`);
  assert.equal(nearbyNote(HYDERABAD_PK, { name: 'Somewhere' }).km, null, 'unknown coordinates: no distance claimed');
});
