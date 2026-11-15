import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegionSampler } from '../src/js/core/regionSampler.js';
import { buildSampleGrid } from '../src/js/core/heatmap.js';
import { ErrorType, WeatherApiError } from '../src/js/api/errors.js';

const CENTER = { lat: 19.07, lon: 72.88 };
const reading = (q, extra = {}) => ({
  data: {
    location: { name: `near ${q}` },
    current: {
      temp_c: 20 + (q.length % 10),
      air_quality: { 'us-epa-index': 2, pm2_5: 21.5 },
      ...extra,
    },
  },
});

/** A client whose requests are recorded, delayed a tick, and can be made to fail by predicate. */
function fakeClient({ fail = () => null } = {}) {
  const calls = [];
  let inFlight = 0;
  const client = {
    calls,
    maxInFlight: 0,
    async getCurrent(q, { signal } = {}) {
      const sequence = calls.push(q); // this request's own number, fixed when it STARTS
      inFlight++;
      client.maxInFlight = Math.max(client.maxInFlight, inFlight);
      try {
        await new Promise((resolve) => setImmediate(resolve));
        if (signal && signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        const failure = fail(q, sequence);
        if (failure) throw failure;
        return reading(q);
      } finally {
        inFlight--;
      }
    },
  };
  return client;
}

test('one request per lattice point, each as "lat,lon", answers kept with their grid position', async () => {
  const client = fakeClient();
  const result = await createRegionSampler({ client }).sample(CENTER);
  const grid = buildSampleGrid(CENTER);

  assert.equal(client.calls.length, 25);
  assert.deepEqual([...client.calls].sort(), grid.points.map((p) => `${p.lat},${p.lon}`).sort());
  assert.equal(result.total, 25);
  assert.equal(result.okCount, 25);
  assert.deepEqual(result.grid.bounds, grid.bounds);
  result.points.forEach((p, i) => {
    assert.equal(p.ok, true);
    assert.deepEqual([p.lat, p.lon], [grid.points[i].lat, grid.points[i].lon], 'order matches the lattice');
    assert.equal(p.aqiLevel, 2);
    assert.equal(p.pm25, 21.5);
    assert.ok(Number.isFinite(p.temp));
  });
});

test('progress is reported as points complete', async () => {
  const seen = [];
  await createRegionSampler({ client: fakeClient() }).sample(CENTER, { onProgress: (done, total) => seen.push([done, total]) });
  assert.equal(seen.length, 25);
  assert.deepEqual(seen.at(-1), [25, 25]);
  assert.deepEqual(seen.map(([done]) => done), Array.from({ length: 25 }, (_, i) => i + 1));
});

test('requests run a few at a time, never more than the configured limit', async () => {
  const client = fakeClient();
  await createRegionSampler({ client, concurrency: 4 }).sample(CENTER);
  assert.ok(client.maxInFlight <= 4, `max in flight ${client.maxInFlight}`);
  assert.ok(client.maxInFlight > 1, 'and they do overlap');
});

test('a second sample of the same place is served from cache until the entries expire', async () => {
  let clock = 1_000;
  const client = fakeClient();
  const sampler = createRegionSampler({ client, cacheTtlMs: 5_000, now: () => clock });

  await sampler.sample(CENTER);
  assert.equal(client.calls.length, 25);

  clock += 4_000; // still fresh
  const cached = await sampler.sample(CENTER);
  assert.equal(client.calls.length, 25, 'no new requests');
  assert.ok(cached.points.every((p) => p.cached === true));

  clock += 2_000; // 6 s after the first sample: expired
  const fresh = await sampler.sample(CENTER);
  assert.equal(client.calls.length, 50);
  assert.ok(fresh.points.every((p) => !p.cached));
});

test('a few failed points leave holes, flagged ok:false, and the rest still draw', async () => {
  const client = fakeClient({ fail: (q, n) => (n % 5 === 0 ? new WeatherApiError(ErrorType.NETWORK) : null) });
  const result = await createRegionSampler({ client }).sample(CENTER);
  assert.equal(result.okCount, 20);
  assert.equal(result.points.filter((p) => !p.ok).length, 5);
  assert.ok(result.points.every((p) => typeof p.lat === 'number' && typeof p.lon === 'number'));
});

test('too few answers fails the whole sample with the first failure\'s type', async () => {
  const client = fakeClient({ fail: (q, n) => (n > 5 ? new WeatherApiError(ErrorType.SERVICE_UNAVAILABLE) : null) });
  const error = await createRegionSampler({ client }).sample(CENTER).catch((e) => e);
  assert.ok(error instanceof WeatherApiError);
  assert.equal(error.type, ErrorType.SERVICE_UNAVAILABLE);
  assert.match(error.apiMessage, /Only 5 of 25/);
});

test('a bad key or exhausted quota is fatal at once — the remaining requests are not sent', async () => {
  for (const type of [ErrorType.API_CONFIG, ErrorType.RATE_LIMIT]) {
    const client = fakeClient({ fail: () => new WeatherApiError(type) });
    const error = await createRegionSampler({ client, concurrency: 3 }).sample(CENTER).catch((e) => e);
    assert.equal(error.type, type);
    assert.ok(client.calls.length <= 3, `${type}: only the first batch went out (${client.calls.length})`);
  }
});

test('aborting stops the sample and sends no further requests', async () => {
  const controller = new AbortController();
  const client = fakeClient();
  const pending = createRegionSampler({ client, concurrency: 2 }).sample(CENTER, {
    signal: controller.signal,
    onProgress: (done) => done === 3 && controller.abort(),
  });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(client.calls.length < 25, `stopped early (${client.calls.length} sent)`);
});

test('a sample that was aborted before it began never touches the network', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = fakeClient();
  await assert.rejects(createRegionSampler({ client }).sample(CENTER, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(client.calls.length, 0);
});

test('places without air-quality data still sample fine, with null AQI fields', async () => {
  const client = {
    async getCurrent() {
      return { data: { location: { name: 'X' }, current: { temp_c: 21 } } };
    },
  };
  const result = await createRegionSampler({ client }).sample(CENTER);
  assert.ok(result.points.every((p) => p.ok && p.aqiLevel === null && p.pm25 === null && p.temp === 21));
});
