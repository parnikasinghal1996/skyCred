import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWeatherClient, isValidCurrentWeather } from '../src/js/api/weatherApi.js';
import { classifyFailure, describeError, ErrorType, WeatherApiError } from '../src/js/api/errors.js';

// Fixtures are REAL WeatherAPI responses captured from the live API (see tests/fixtures).
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

const clientWith = (fetchImpl, extra = {}) => createWeatherClient({ apiKey: 'test-key', fetchImpl, ...extra });

test('FR-10: calls GET /current.json with the key and city as query parameters', async () => {
  const fetchImpl = recordingFetch(async () => reply(200, await fixture('current-mumbai.json')));
  await clientWith(fetchImpl).getCurrent('Mumbai');

  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url.origin + url.pathname, 'https://api.weatherapi.com/v1/current.json');
  assert.equal(url.searchParams.get('key'), 'test-key');
  assert.equal(url.searchParams.get('q'), 'Mumbai');
  assert.equal(init.method, 'GET');
  assert.equal(init.cache, 'no-store'); // always fresh data
});

test('city names are trimmed and URL-encoded', async () => {
  const fetchImpl = recordingFetch(async () => reply(200, await fixture('current-london.json')));
  await clientWith(fetchImpl).getCurrent('  New York, NY & co  ');
  assert.equal(fetchImpl.calls[0].url.searchParams.get('q'), 'New York, NY & co');
  assert.ok(fetchImpl.calls[0].url.search.includes('q=New+York%2C+NY+%26+co'));
});

test('FR-07: resolves the parsed data AND the untouched raw response text', async () => {
  const raw = await fixture('current-mumbai.json');
  const { data, rawText } = await clientWith(recordingFetch(async () => reply(200, raw))).getCurrent('Mumbai');
  assert.equal(rawText, raw); // byte-for-byte
  assert.deepEqual(data, JSON.parse(raw));
  assert.equal(data.location.name, 'Mumbai');
});

test('FR-02.4: an empty or blank city never calls the API', async () => {
  const fetchImpl = recordingFetch(async () => reply(200, '{}'));
  for (const value of ['', '   ', undefined, null]) {
    await assert.rejects(clientWith(fetchImpl).getCurrent(value), { type: ErrorType.VALIDATION });
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test('FR-08: a missing API key is an API configuration error and never calls the API', async () => {
  const fetchImpl = recordingFetch(async () => reply(200, '{}'));
  await assert.rejects(createWeatherClient({ apiKey: '', fetchImpl }).getCurrent('Delhi'), { type: ErrorType.API_CONFIG });
  assert.equal(fetchImpl.calls.length, 0);
});

test('FR-08 matrix: real WeatherAPI error responses map to the right error type', async () => {
  const cases = [
    ['error-city-not-found.json', 400, ErrorType.CITY_NOT_FOUND, 1006],
    ['error-invalid-key.json', 401, ErrorType.API_CONFIG, 2006],
    ['error-missing-key.json', 401, ErrorType.API_CONFIG, 1002],
    ['error-missing-q.json', 400, ErrorType.VALIDATION, 1003],
  ];
  for (const [file, status, type, apiCode] of cases) {
    const body = await fixture(file);
    const error = await clientWith(recordingFetch(async () => reply(status, body))).getCurrent('x').catch((e) => e);
    assert.ok(error instanceof WeatherApiError, file);
    assert.equal(error.type, type, file);
    assert.equal(error.status, status, file);
    assert.equal(error.apiCode, apiCode, file);
  }
});

test('FR-08 matrix: documented-but-unreproducible failures', async () => {
  const quota = JSON.stringify({ error: { code: 2007, message: 'API key has exceeded calls per month quota.' } });
  const cases = [
    [403, quota, ErrorType.RATE_LIMIT], // monthly quota
    [429, 'Too Many Requests', ErrorType.RATE_LIMIT], // gateway rate limit, non-JSON body
    [403, JSON.stringify({ error: { code: 2008, message: 'API key has been disabled.' } }), ErrorType.API_CONFIG],
    [500, '<html>Internal Server Error</html>', ErrorType.SERVICE_UNAVAILABLE],
    [502, '', ErrorType.SERVICE_UNAVAILABLE],
    [503, JSON.stringify({ error: { code: 9999, message: 'Internal application error.' } }), ErrorType.SERVICE_UNAVAILABLE],
    [504, 'Gateway Timeout', ErrorType.SERVICE_UNAVAILABLE],
    [418, 'teapot', ErrorType.UNEXPECTED],
  ];
  for (const [status, body, type] of cases) {
    const error = await clientWith(recordingFetch(async () => reply(status, body))).getCurrent('x').catch((e) => e);
    assert.equal(error.type, type, `HTTP ${status}`);
  }
});

test('FR-08: unexpected 200 responses are errors, never half-rendered data', async () => {
  const bodies = [
    '<html><body>Captive portal</body></html>', // not JSON
    '',
    'null',
    '[]',
    '{"hello":"world"}',
    JSON.stringify({ location: { name: 'Mumbai' } }), // missing current
    JSON.stringify({ location: { name: 'Mumbai', tz_id: 'x', localtime: 'x' }, current: { temp_c: 'hot' } }), // wrong types
  ];
  for (const body of bodies) {
    const error = await clientWith(recordingFetch(async () => reply(200, body))).getCurrent('Mumbai').catch((e) => e);
    assert.equal(error.type, ErrorType.UNEXPECTED, JSON.stringify(body));
  }
});

test('FR-08: a 200 response that carries an error object is still an error', async () => {
  const body = JSON.stringify({ error: { code: 1006, message: 'No matching location found.' } });
  const error = await clientWith(recordingFetch(async () => reply(200, body))).getCurrent('x').catch((e) => e);
  assert.equal(error.type, ErrorType.CITY_NOT_FOUND);
});

test('FR-08: network failures are reported as network errors, offline is detected', async () => {
  const failing = recordingFetch(async () => {
    throw new TypeError('Failed to fetch');
  });
  const online = await clientWith(failing).getCurrent('Delhi').catch((e) => e);
  assert.equal(online.type, ErrorType.NETWORK);
  assert.equal(online.offline, false);

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    const offline = await clientWith(failing).getCurrent('Delhi').catch((e) => e);
    assert.equal(offline.type, ErrorType.NETWORK);
    assert.equal(offline.offline, true);
    assert.match(describeError(offline.type, { offline: true }).message, /offline/i);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});

/** A fetch that never answers, but — like the real one — rejects with an AbortError when its signal aborts. */
function hangingFetch(calls = []) {
  return (url, init) =>
    new Promise((resolve, reject) => {
      calls.push(url);
      const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort);
    });
}

test('FR-08: a response that never arrives times out (so Retry can be offered)', async () => {
  const error = await clientWith(hangingFetch(), { timeoutMs: 30 }).getCurrent('Delhi').catch((e) => e);
  assert.equal(error.type, ErrorType.TIMEOUT);
});

test('an external abort surfaces as an AbortError, not as a network error', async () => {
  const controller = new AbortController();
  const pending = clientWith(hangingFetch()).getCurrent('Delhi', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a request that was already superseded never reaches the network', async () => {
  const calls = [];
  const already = new AbortController();
  already.abort();
  await assert.rejects(clientWith(hangingFetch(calls)).getCurrent('Delhi', { signal: already.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('the API key never appears in an error message', async () => {
  const error = await clientWith(recordingFetch(async () => reply(401, '{"error":{"code":2006,"message":"API key is invalid."}}')))
    .getCurrent('Delhi')
    .catch((e) => e);
  assert.ok(!JSON.stringify([error.message, error.apiMessage, describeError(error.type)]).includes('test-key'));
});

test('isValidCurrentWeather accepts real responses and rejects partial ones', async () => {
  for (const file of ['current-mumbai.json', 'current-london.json']) {
    assert.equal(isValidCurrentWeather(JSON.parse(await fixture(file))), true, file);
  }
  const base = JSON.parse(await fixture('current-mumbai.json'));
  for (const mutate of [
    (d) => delete d.current.humidity,
    (d) => delete d.current.uv,
    (d) => delete d.current.condition.icon,
    (d) => (d.location.name = ''),
    (d) => delete d.location.localtime,
    (d) => (d.current.temp_c = null),
  ]) {
    const copy = structuredClone(base);
    mutate(copy);
    assert.equal(isValidCurrentWeather(copy), false);
  }
});

test('classifyFailure: the API error code wins over the HTTP status', () => {
  assert.equal(classifyFailure(400, 1006), ErrorType.CITY_NOT_FOUND);
  assert.equal(classifyFailure(403, 2007), ErrorType.RATE_LIMIT); // 403 alone would mean "config"
  assert.equal(classifyFailure(403, null), ErrorType.API_CONFIG);
  assert.equal(classifyFailure(404, null), ErrorType.UNEXPECTED);
});

test('describeError: wording required by FR-08', () => {
  assert.equal(describeError(ErrorType.CITY_NOT_FOUND, { query: 'Gotham' }).title, 'City not found');
  assert.match(describeError(ErrorType.CITY_NOT_FOUND, { query: 'Gotham' }).message, /Gotham/);
  assert.equal(describeError(ErrorType.API_CONFIG).title, 'API configuration error');
  assert.equal(describeError(ErrorType.RATE_LIMIT).title, 'Temporary service error');
  assert.equal(describeError(ErrorType.SERVICE_UNAVAILABLE).title, 'Service unavailable');
  assert.match(describeError(ErrorType.NETWORK).title, /network|connection/i);
  assert.equal(describeError('nonsense').title, 'Something went wrong'); // generic fallback
  // Retry is offered only where retrying can help
  assert.equal(describeError(ErrorType.NETWORK).retryable, true);
  assert.equal(describeError(ErrorType.RATE_LIMIT).retryable, true);
  assert.equal(describeError(ErrorType.SERVICE_UNAVAILABLE).retryable, true);
  assert.equal(describeError(ErrorType.CITY_NOT_FOUND).retryable, false);
  assert.equal(describeError(ErrorType.API_CONFIG).retryable, false);
  assert.equal(describeError(ErrorType.VALIDATION).retryable, false);
});
