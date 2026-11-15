import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherStore, Status } from '../src/js/core/store.js';
import { ErrorType, WeatherApiError } from '../src/js/api/errors.js';

/** Records which client method each search used, and lets the test settle it by hand. */
function client() {
  const requests = [];
  const make = (method) => (arg, { signal }) =>
    new Promise((resolve, reject) => requests.push({ method, arg, signal, resolve, reject }));
  return { requests, getCurrent: make('getCurrent'), getCurrentForPlace: make('getCurrentForPlace') };
}
const payload = (name) => ({ data: { location: { name } }, rawText: '{}' });
const PUNE = Object.freeze({ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.5, longitude: 73.8, label: 'Pune, Maharashtra, India' });

test('typed text uses getCurrent; a picked suggestion uses getCurrentForPlace with that exact place', async () => {
  const c = client();
  const store = createWeatherStore({ client: c });

  const typed = store.search('Mumbai');
  assert.equal(c.requests[0].method, 'getCurrent');
  assert.equal(c.requests[0].arg, 'Mumbai');
  c.requests[0].resolve(payload('Mumbai'));
  await typed;

  const picked = store.search(PUNE.label, { place: PUNE });
  assert.equal(c.requests[1].method, 'getCurrentForPlace');
  assert.equal(c.requests[1].arg, PUNE);
  c.requests[1].resolve(payload('Pune'));
  await picked;

  assert.equal(store.getState().weather.query, 'Pune, Maharashtra, India', 'the state remembers the label the user picked');
  assert.equal(store.getState().weather.data.location.name, 'Pune');
});

test('retry repeats a failed pick as the same place, not as plain text', async () => {
  const c = client();
  const store = createWeatherStore({ client: c });

  const failed = store.search(PUNE.label, { place: PUNE });
  c.requests[0].reject(new WeatherApiError(ErrorType.NETWORK));
  await failed;
  assert.equal(store.getState().error.type, ErrorType.NETWORK);

  const retried = store.retry();
  assert.equal(c.requests[1].method, 'getCurrentForPlace');
  assert.equal(c.requests[1].arg, PUNE);
  c.requests[1].resolve(payload('Pune'));
  await retried;
  assert.equal(store.getState().status, Status.SUCCESS);
});

test('a plain search after a pick does not carry the place along', async () => {
  const c = client();
  const store = createWeatherStore({ client: c });
  const picked = store.search(PUNE.label, { place: PUNE });
  c.requests[0].resolve(payload('Pune'));
  await picked;

  const typed = store.search('Delhi');
  assert.equal(c.requests[1].method, 'getCurrent');
  assert.equal(c.requests[1].arg, 'Delhi, India', 'the ambiguous-Delhi hint still applies to typed text');
  c.requests[1].resolve(payload('Delhi'));
  await typed;
});

test('a newer pick supersedes an older one just like a newer search does', async () => {
  const c = client();
  const store = createWeatherStore({ client: c });
  const first = store.search('Delhi');
  const second = store.search(PUNE.label, { place: PUNE });
  assert.equal(c.requests[0].signal.aborted, true);

  c.requests[1].resolve(payload('Pune'));
  await second;
  c.requests[0].resolve(payload('Delhi')); // late
  await first;
  assert.equal(store.getState().weather.data.location.name, 'Pune');
});

test('the weather in the state remembers which suggestion produced it (the UI uses it for the "nearest weather point" note)', async () => {
  const c = client();
  const store = createWeatherStore({ client: c });

  const picked = store.search(PUNE.label, { place: PUNE });
  c.requests[0].resolve(payload('Pune'));
  await picked;
  assert.equal(store.getState().weather.place, PUNE);

  const typed = store.search('Delhi');
  c.requests[1].resolve(payload('Delhi'));
  await typed;
  assert.equal(store.getState().weather.place, null, 'typed searches carry no place');
});
