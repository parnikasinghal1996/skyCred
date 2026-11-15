import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherStore, Status } from '../src/js/core/store.js';
import { ErrorType, WeatherApiError } from '../src/js/api/errors.js';

/** A client whose requests stay pending until the test settles them — lets us control response ORDER. */
function controllableClient() {
  const requests = [];
  return {
    requests,
    getCurrent(query, { signal }) {
      return new Promise((resolve, reject) => requests.push({ query, signal, resolve, reject }));
    },
  };
}

const payload = (name) => ({
  data: { location: { name } },
  rawText: JSON.stringify({ location: { name } }),
});

test('starts idle with nothing to show', () => {
  const store = createWeatherStore({ client: controllableClient() });
  assert.deepEqual(
    { ...store.getState() },
    { status: Status.IDLE, pendingQuery: null, weather: null, error: null, validationError: null }
  );
});

test('FR-02.4: an empty search sets a validation message and never calls the client', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  for (const value of ['', '   ', undefined]) await store.search(value);
  assert.equal(client.requests.length, 0);
  assert.equal(store.getState().validationError.type, ErrorType.VALIDATION);
  assert.equal(store.getState().status, Status.IDLE);
});

test('a successful search stores the data, the raw text and the query that produced them', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client, now: () => 1234 });
  const done = store.search('  Delhi ');
  assert.equal(store.getState().status, Status.LOADING);
  assert.equal(store.getState().pendingQuery, 'Delhi');

  client.requests[0].resolve(payload('Delhi'));
  await done;

  const { status, weather, error, pendingQuery } = store.getState();
  assert.equal(status, Status.SUCCESS);
  assert.equal(pendingQuery, null);
  assert.equal(error, null);
  assert.equal(weather.query, 'Delhi');
  assert.equal(weather.data.location.name, 'Delhi');
  assert.equal(weather.rawText, '{"location":{"name":"Delhi"}}');
  assert.equal(weather.fetchedAt, 1234);
});

test('an ambiguous popular city is sent with a country hint, but the user\'s own text is what the state remembers', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });

  const delhi = store.search('delhi'); // bare "Delhi" resolves to Ontario, Canada on WeatherAPI
  assert.equal(client.requests[0].query, 'Delhi, India');
  client.requests[0].resolve(payload('Delhi'));
  await delhi;
  assert.equal(store.getState().weather.query, 'delhi');

  const mumbai = store.search('Mumbai'); // unambiguous → sent exactly as written (PRD: q=Mumbai)
  assert.equal(client.requests[1].query, 'Mumbai');
  client.requests[1].resolve(payload('Mumbai'));
  await mumbai;

  const ontario = store.search('Delhi, Ontario'); // an explicit qualification is respected
  assert.equal(client.requests[2].query, 'Delhi, Ontario');
  client.requests[2].resolve(payload('Delhi'));
  await ontario;
});

test('retry of an ambiguous city re-applies the country hint and errors quote the user\'s own text', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  const failed = store.search('Delhi');
  client.requests[0].reject(new WeatherApiError(ErrorType.NETWORK));
  await failed;
  assert.equal(store.getState().error.query, 'Delhi');

  const retried = store.retry();
  assert.equal(client.requests[1].query, 'Delhi, India');
  client.requests[1].resolve(payload('Delhi'));
  await retried;
});

test('FR-08: an older response that arrives AFTER a newer one cannot overwrite it', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  const first = store.search('London');
  const second = store.search('Delhi');

  assert.equal(client.requests[0].signal.aborted, true, 'the superseded request is aborted');
  assert.equal(client.requests[1].signal.aborted, false);

  client.requests[1].resolve(payload('Delhi')); // newer answers first
  await second;
  client.requests[0].resolve(payload('London')); // older answers late (abort ignored, e.g. a non-cooperative client)
  await first;

  assert.equal(store.getState().weather.query, 'Delhi');
  assert.equal(store.getState().weather.data.location.name, 'Delhi');
  assert.equal(store.getState().status, Status.SUCCESS);
});

test('FR-08: an older FAILURE arriving late cannot clobber a newer success', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  const first = store.search('London');
  const second = store.search('Delhi');

  client.requests[1].resolve(payload('Delhi'));
  await second;
  client.requests[0].reject(new WeatherApiError(ErrorType.NETWORK));
  await first;

  assert.equal(store.getState().error, null);
  assert.equal(store.getState().weather.query, 'Delhi');
});

test('FR-08: a failed search keeps the last valid weather and reports the error', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });

  const ok = store.search('Mumbai');
  client.requests[0].resolve(payload('Mumbai'));
  await ok;

  const bad = store.search('Atlantis');
  client.requests[1].reject(new WeatherApiError(ErrorType.CITY_NOT_FOUND, { status: 400, apiCode: 1006 }));
  await bad;

  const state = store.getState();
  assert.equal(state.status, Status.ERROR);
  assert.equal(state.error.type, ErrorType.CITY_NOT_FOUND);
  assert.equal(state.error.title, 'City not found');
  assert.equal(state.error.query, 'Atlantis');
  assert.equal(state.error.retryable, false);
  assert.equal(state.weather.query, 'Mumbai', 'valid data is never replaced by a failure');
});

test('unknown exceptions are surfaced as a generic, retryable error', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  const pending = store.search('Pune');
  client.requests[0].reject(new Error('boom'));
  await pending;
  assert.equal(store.getState().error.type, ErrorType.UNEXPECTED);
  assert.equal(store.getState().error.retryable, true);
});

test('retry re-runs the failed query and clears the error on success', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });

  const failed = store.search('Chennai');
  client.requests[0].reject(new WeatherApiError(ErrorType.NETWORK));
  await failed;
  assert.equal(store.getState().error.type, ErrorType.NETWORK);
  assert.equal(store.getState().weather, null);

  const retried = store.retry();
  assert.equal(client.requests[1].query, 'Chennai');
  assert.equal(store.getState().error, null, 'the error clears as soon as the retry starts');
  client.requests[1].resolve(payload('Chennai'));
  await retried;
  assert.equal(store.getState().weather.query, 'Chennai');
});

test('a new valid search clears the previous error and validation message', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  await store.search('');
  assert.ok(store.getState().validationError);

  const pending = store.search('Kolkata');
  assert.equal(store.getState().validationError, null);
  client.requests[0].resolve(payload('Kolkata'));
  await pending;
  assert.equal(store.getState().error, null);
});

test('multiple searches in a row all work without any reload', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  for (const city of ['Delhi', 'London', 'Pune']) {
    const pending = store.search(city);
    client.requests.at(-1).resolve(payload(city));
    await pending;
    assert.equal(store.getState().weather.query, city);
  }
});

test('subscribers get the current state immediately and every change after; unsubscribe stops them', async () => {
  const client = controllableClient();
  const store = createWeatherStore({ client });
  const seen = [];
  const unsubscribe = store.subscribe((state) => seen.push(state.status));
  assert.deepEqual(seen, [Status.IDLE]);

  const pending = store.search('Delhi');
  client.requests[0].resolve(payload('Delhi'));
  await pending;
  assert.deepEqual(seen, [Status.IDLE, Status.LOADING, Status.SUCCESS]);

  unsubscribe();
  await store.search('');
  assert.equal(seen.length, 3);
});
