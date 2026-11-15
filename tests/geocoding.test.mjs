import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGeocoder, GeocodingError, placeLabel, toPlace } from '../src/js/api/geocodingApi.js';

// Fixtures are REAL Open-Meteo geocoding responses.
const fixture = (name) => readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

function recordingFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return handler(url, init);
  };
  impl.calls = calls;
  return impl;
}
const geocoderWith = (fetchImpl, extra = {}) => createGeocoder({ fetchImpl, ...extra });

test('real "mum" response: Mumbai comes first, as a frozen place with a readable label and coordinates', async () => {
  const places = await geocoderWith(recordingFetch(async () => reply(200, await fixture('geocoding-mum.json')))).searchPlaces('mum');
  assert.equal(places[0].label, 'Mumbai, Maharashtra, India');
  assert.equal(places[0].name, 'Mumbai');
  assert.equal(places[0].admin1, 'Maharashtra');
  assert.equal(places[0].country, 'India');
  assert.ok(Number.isFinite(places[0].latitude) && Number.isFinite(places[0].longitude));
  assert.ok(Object.isFrozen(places[0]));
  assert.equal(new Set(places.map((p) => p.label)).size, places.length, 'no duplicate labels');
  assert.ok(places.length >= 2);
});

test('the request is a plain GET to /search with the typed text, count, language and format', async () => {
  const fetchImpl = recordingFetch(async () => reply(200, '{"results":[]}'));
  await geocoderWith(fetchImpl).searchPlaces('  new y ', { count: 4 });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url.origin + url.pathname, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.equal(url.searchParams.get('name'), 'new y');
  assert.equal(url.searchParams.get('count'), '4');
  assert.equal(url.searchParams.get('language'), 'en');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(init.method, 'GET');
  assert.ok(![...url.searchParams.keys()].includes('key'), 'no API key is sent to the geocoder');
});

test('text shorter than two characters never reaches the network', async () => {
  const fetchImpl = recordingFetch(async () => reply(200, '{}'));
  for (const value of ['', ' ', 'a', ' b ', undefined, null]) assert.deepEqual(await geocoderWith(fetchImpl).searchPlaces(value), []);
  assert.equal(fetchImpl.calls.length, 0);
});

test('"no matches" (Open-Meteo omits `results`) is an empty list, not an error', async () => {
  const places = await geocoderWith(recordingFetch(async () => reply(200, await fixture('geocoding-none.json')))).searchPlaces('zzqqxxyyww');
  assert.deepEqual(places, []);
});

test('unusable results are dropped and duplicate labels collapse', async () => {
  const body = JSON.stringify({
    results: [
      { id: 1, name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.5, longitude: 73.8 },
      { id: 2, name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.6, longitude: 73.9 }, // same label
      { id: 3, name: '', latitude: 1, longitude: 2 }, // no name
      { id: 4, name: 'Nowhere', latitude: 'x', longitude: 2 }, // bad coordinates
      null,
      'junk',
      { name: 'Delhi', admin1: 'NCT of Delhi', country: 'India', latitude: 28.6, longitude: 77.2 }, // no id: fine
    ],
  });
  const places = await geocoderWith(recordingFetch(async () => reply(200, body))).searchPlaces('pu');
  assert.deepEqual(places.map((p) => p.label), ['Pune, Maharashtra, India', 'Delhi, NCT of Delhi, India']);
  assert.equal(places[1].id, null);
});

test('failures are typed so the UI can simply show "no suggestions"', async () => {
  const kind = async (fetchImpl, options) =>
    (await geocoderWith(fetchImpl, options).searchPlaces('pune').catch((e) => e));

  const http = await kind(recordingFetch(async () => reply(429, 'slow down')));
  assert.ok(http instanceof GeocodingError);
  assert.deepEqual([http.kind, http.status], ['http', 429]);

  const network = await kind(recordingFetch(async () => { throw new TypeError('Failed to fetch'); }));
  assert.equal(network.kind, 'network');

  for (const body of ['<html>nope</html>', 'null', '[]', '{"results":"oops"}']) {
    const bad = await kind(recordingFetch(async () => reply(200, body)));
    assert.equal(bad.kind, 'unexpected', body);
  }
});

test('a geocoder that never answers times out; an aborted request surfaces as AbortError', async () => {
  const hanging = (url, init) =>
    new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort);
    });

  const slow = await geocoderWith(hanging, { timeoutMs: 25 }).searchPlaces('pune').catch((e) => e);
  assert.equal(slow.kind, 'timeout');

  const controller = new AbortController();
  const pending = geocoderWith(hanging).searchPlaces('pune', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });

  const already = new AbortController();
  already.abort();
  await assert.rejects(geocoderWith(hanging).searchPlaces('pune', { signal: already.signal }), { name: 'AbortError' });
});

test('placeLabel keeps useful parts and drops empty or repeated ones', () => {
  assert.equal(placeLabel({ name: 'Pune', admin1: 'Maharashtra', country: 'India' }), 'Pune, Maharashtra, India');
  assert.equal(placeLabel({ name: 'Singapore', admin1: '', country: 'Singapore' }), 'Singapore');
  assert.equal(placeLabel({ name: 'Delhi', admin1: 'Delhi', country: 'India' }), 'Delhi, India');
  assert.equal(placeLabel({ name: 'Paris' }), 'Paris');
});

test('toPlace rejects anything without a name and finite coordinates', () => {
  assert.equal(toPlace(null), null);
  assert.equal(toPlace({ name: 'X' }), null);
  assert.equal(toPlace({ name: 'X', latitude: 1 }), null);
  assert.equal(toPlace({ latitude: 1, longitude: 2 }), null);
  assert.equal(toPlace({ name: ' X ', latitude: 1, longitude: 2 }).name, 'X');
});
