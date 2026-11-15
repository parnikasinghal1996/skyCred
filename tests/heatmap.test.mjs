import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aqiScale,
  AQI_STOPS,
  buildSampleGrid,
  defaultSigma,
  gradientCss,
  interpolateField,
  rampColor,
  renderRgba,
  summarize,
  temperatureScale,
  TEMPERATURE_STOPS,
} from '../src/js/core/heatmap.js';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} expected ${expected} ± ${tolerance}, got ${actual}`);

// ---- sampling lattice ---------------------------------------------------------------------------------------

test('the lattice is 5×5, centred on the place, north row first', () => {
  const grid = buildSampleGrid({ lat: 19.07, lon: 72.88 });
  assert.equal(grid.points.length, 25);
  assert.deepEqual([grid.points[12].lat, grid.points[12].lon], [19.07, 72.88], 'the middle point is the place itself');
  assert.ok(grid.points[0].lat > grid.points[24].lat, 'row 0 is the north edge');
  assert.ok(grid.points[0].lon < grid.points[4].lon, 'columns run west → east');
  assert.deepEqual([grid.points[0].row, grid.points[0].col, grid.points[24].row, grid.points[24].col], [0, 0, 4, 4]);
  near(grid.latStep, 0.5, 1e-9, 'latitude step');
  near(grid.points[0].lat - grid.points[5].lat, 0.5, 0.011, 'rows are one step apart');
});

test('longitude steps widen with latitude so the lattice stays square on the ground', () => {
  const equator = buildSampleGrid({ lat: 0, lon: 10 });
  const sixty = buildSampleGrid({ lat: 60, lon: 10 });
  near(equator.lonStep, equator.latStep, 1e-9, 'at the equator');
  near(sixty.lonStep, 2 * sixty.latStep, 0.01, 'at 60° one degree of longitude is half as long');
});

test('the overlay reaches half a step beyond the outer points', () => {
  const grid = buildSampleGrid({ lat: 19.07, lon: 72.88 });
  near(grid.bounds.north - grid.points[0].lat, grid.latStep / 2, 0.011);
  near(grid.points[24].lat - grid.bounds.south, grid.latStep / 2, 0.011);
  near(grid.bounds.east - grid.points[24].lon, grid.lonStep / 2, 0.011);
  near(grid.points[0].lon - grid.bounds.west, grid.lonStep / 2, 0.011);
});

test('lattice coordinates are rounded (stable cache keys) and always valid, even at the edges of the map', () => {
  for (const center of [{ lat: 89.9, lon: 0 }, { lat: -89.9, lon: 179.9 }, { lat: 0, lon: -179.9 }, { lat: 19.07123, lon: 72.88456 }]) {
    const grid = buildSampleGrid(center);
    for (const p of grid.points) {
      assert.ok(p.lat >= -85 && p.lat <= 85, `lat ${p.lat}`);
      assert.ok(p.lon >= -180 && p.lon <= 180, `lon ${p.lon}`);
      near(p.lat * 100, Math.round(p.lat * 100), 1e-6, 'two decimals');
      near(p.lon * 100, Math.round(p.lon * 100), 1e-6, 'two decimals');
    }
    assert.ok(grid.bounds.north <= 85 && grid.bounds.south >= -85 && grid.bounds.east <= 180 && grid.bounds.west >= -180);
  }
  assert.deepEqual(buildSampleGrid({ lat: 19.07123, lon: 72.88456 }).center, { lat: 19.07, lon: 72.88 });
});

test('the lattice size and span are adjustable', () => {
  const small = buildSampleGrid({ lat: 10, lon: 10 }, { size: 3, halfSpanLatDeg: 0.5 });
  assert.equal(small.points.length, 9);
  near(small.latStep, 0.5, 1e-9);
});

// ---- interpolation ------------------------------------------------------------------------------------------

const BOX = { north: 1, south: -1, west: -1, east: 1 };

test('interpolation: a uniform set of samples gives a uniform field', () => {
  const samples = [-0.5, 0, 0.5].flatMap((lat) => [-0.5, 0, 0.5].map((lon) => ({ lat, lon, value: 27 })));
  const field = interpolateField(samples, { bounds: BOX, width: 20, height: 20, sigmaDeg: 0.3 });
  for (const v of field) near(v, 27, 1e-4);
});

test('interpolation: values blend smoothly between samples and never overshoot them', () => {
  const samples = [{ lat: 0, lon: -0.5, value: 10 }, { lat: 0, lon: 0.5, value: 20 }];
  const width = 41;
  const field = interpolateField(samples, { bounds: BOX, width, height: 41, sigmaDeg: 0.3 });
  const row = (j) => Array.from({ length: width }, (_, i) => field[j * width + i]);
  const middle = row(20);

  near(middle[20], 15, 0.3, 'halfway between 10 and 20');
  assert.ok(middle[10] < middle[20] && middle[20] < middle[30], 'increases from the cold sample to the warm one');
  for (let i = 1; i < width; i++) assert.ok(middle[i] >= middle[i - 1] - 1e-6, 'monotonic along the row');
  for (const v of field) assert.ok(v >= 10 - 1e-4 && v <= 20 + 1e-4, `${v} stays within the sample range`);
  near(middle[10], 10, 0.8, 'close to the first sample');
  near(middle[30], 20, 0.8, 'close to the second sample');
});

test('interpolation: a missing sample just leaves its neighbours to fill the gap', () => {
  const full = [-0.5, 0.5].flatMap((lat) => [-0.5, 0.5].map((lon) => ({ lat, lon, value: 30 })));
  const field = interpolateField(full.slice(0, 3), { bounds: BOX, width: 12, height: 12, sigmaDeg: 0.4 });
  for (const v of field) near(v, 30, 1e-4);
  assert.ok(!Array.from(field).some(Number.isNaN), 'no holes');
});

test('interpolation: no samples → every pixel is NaN (transparent)', () => {
  const field = interpolateField([], { bounds: BOX, width: 4, height: 4, sigmaDeg: 0.3 });
  assert.equal(field.length, 16);
  assert.ok(Array.from(field).every(Number.isNaN));
});

test('interpolation runs over a real-sized lattice quickly (pure maths, no DOM)', () => {
  const grid = buildSampleGrid({ lat: 19.07, lon: 72.88 });
  const samples = grid.points.map((p, i) => ({ lat: p.lat, lon: p.lon, value: 24 + (i % 7) }));
  const started = performance.now();
  const field = interpolateField(samples, { bounds: grid.bounds, width: 96, height: 96, sigmaDeg: defaultSigma(grid.latStep) });
  assert.ok(performance.now() - started < 500, 'under half a second');
  assert.equal(field.length, 96 * 96);
  assert.ok(!Array.from(field).some(Number.isNaN));
});

// ---- scales -------------------------------------------------------------------------------------------------

test('the temperature scale follows the region but is never narrower than the minimum span', () => {
  const narrow = temperatureScale([20, 20.5]);
  near(narrow.domain[1] - narrow.domain[0], 4, 1e-9, 'a 0.5 °C region is stretched to the 4 °C minimum');
  near((narrow.domain[0] + narrow.domain[1]) / 2, 20.25, 1e-9, 'and stays centred on the region');

  const wide = temperatureScale([10, 30]);
  assert.deepEqual(wide.domain, [10, 30]);

  assert.ok(temperatureScale([]).domain.every(Number.isFinite), 'no data still gives a usable domain');
  assert.deepEqual(temperatureScale([20, 20.5], { minSpan: 1 }).domain.map((d) => +d.toFixed(2)), [19.75, 20.75]);
});

test('temperature colours run blue → green → yellow → red across the domain', () => {
  const scale = temperatureScale([0, 40]);
  assert.deepEqual(scale.colorAt(0), [43, 80, 216], 'cold end is deep blue');
  assert.deepEqual(scale.colorAt(40), [224, 49, 44], 'hot end is red');
  const [r1, g1, b1] = scale.colorAt(16); // t = 0.4 → green
  assert.ok(g1 > r1 && g1 > b1, 'mid-low is green');
  const [r2, g2, b2] = scale.colorAt(24); // t = 0.6 → yellow
  assert.ok(r2 > 200 && g2 > 200 && b2 < 120, 'mid-high is yellow');
  assert.deepEqual(scale.colorAt(-50), scale.colorAt(0), 'below the domain clamps');
  assert.deepEqual(scale.colorAt(500), scale.colorAt(40), 'above the domain clamps');
});

test('the air-quality scale uses the EPA colours for levels 1–6', () => {
  const scale = aqiScale();
  assert.deepEqual(scale.colorAt(1), [0, 228, 0], 'Good is green');
  assert.deepEqual(scale.colorAt(2), [255, 255, 0], 'Moderate is yellow');
  assert.deepEqual(scale.colorAt(3), [255, 126, 0], 'Unhealthy for sensitive groups is orange');
  assert.deepEqual(scale.colorAt(4), [255, 0, 0], 'Unhealthy is red');
  assert.deepEqual(scale.colorAt(5), [143, 63, 151], 'Very unhealthy is purple');
  assert.deepEqual(scale.colorAt(6), [126, 0, 35], 'Hazardous is maroon');
  assert.deepEqual(scale.domain, [1, 6]);
});

test('rampColor clamps and tolerates bad input', () => {
  assert.deepEqual(rampColor(TEMPERATURE_STOPS, -1), [43, 80, 216]);
  assert.deepEqual(rampColor(TEMPERATURE_STOPS, 2), [224, 49, 44]);
  assert.deepEqual(rampColor(TEMPERATURE_STOPS, NaN), [43, 80, 216]);
  assert.deepEqual(rampColor(AQI_STOPS, 0.5).length, 3);
});

test('gradientCss builds a left-to-right CSS gradient from the stops', () => {
  const css = gradientCss(TEMPERATURE_STOPS);
  assert.ok(css.startsWith('linear-gradient(90deg, rgb(43, 80, 216) 0%'));
  assert.ok(css.endsWith('rgb(224, 49, 44) 100%)'));
  assert.equal(css.match(/rgb\(/g).length, TEMPERATURE_STOPS.length);
});

// ---- pixels -------------------------------------------------------------------------------------------------

test('renderRgba colours every pixel and feathers the edges to transparent', () => {
  const width = 21;
  const height = 21;
  const field = new Float32Array(width * height).fill(0);
  const pixels = renderRgba(field, { width, height, colorAt: () => [10, 20, 30] });
  assert.equal(pixels.length, width * height * 4);

  const alphaAt = (i, j) => pixels[(j * width + i) * 4 + 3];
  assert.equal(alphaAt(10, 10), 255, 'centre is opaque');
  assert.ok(alphaAt(0, 0) < 64, 'corner is nearly transparent');
  assert.ok(alphaAt(0, 10) < alphaAt(3, 10) && alphaAt(3, 10) <= alphaAt(10, 10), 'alpha rises toward the middle');
  assert.deepEqual([pixels[(10 * width + 10) * 4], pixels[(10 * width + 10) * 4 + 1], pixels[(10 * width + 10) * 4 + 2]], [10, 20, 30]);
});

test('renderRgba leaves NaN pixels fully transparent', () => {
  const field = new Float32Array(9).fill(5);
  field[4] = NaN;
  const pixels = renderRgba(field, { width: 3, height: 3, colorAt: () => [1, 2, 3], feather: 0 });
  assert.equal(pixels[4 * 4 + 3], 0);
  assert.equal(pixels[0 * 4 + 3], 255);
});

// ---- summary ------------------------------------------------------------------------------------------------

test('summarize reports min, max and mean and which point they came from', () => {
  const points = [{ id: 'a', t: 24.4 }, { id: 'b', t: 29.4 }, { id: 'c', t: 27 }, { id: 'd', t: NaN }, { id: 'e', t: null }];
  const s = summarize(points, (p) => p.t);
  assert.equal(s.count, 3);
  assert.deepEqual([s.min.value, s.min.point.id], [24.4, 'a']);
  assert.deepEqual([s.max.value, s.max.point.id], [29.4, 'b']);
  near(s.mean, (24.4 + 29.4 + 27) / 3, 1e-9);
  assert.deepEqual(summarize([], (p) => p), { count: 0, min: null, max: null, mean: null });
});
