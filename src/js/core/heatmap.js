/**
 * Regional heat map maths — pure functions, no DOM.
 *
 *   buildSampleGrid   a lattice of points around the chosen place (these become API requests)
 *   interpolateField  smooth value field over the lattice (Gaussian-weighted average — handles missing points)
 *   temperatureScale  colour scale for °C, auto-ranged to the region but never narrower than `minSpan`
 *   aqiScale          colour scale for WeatherAPI's US EPA level (1–6), in the EPA's own colours
 *   renderRgba        field → RGBA pixels with feathered edges (the UI paints them onto a canvas)
 */
import { clamp, round2, toRadians } from './geo.js';

// ---- colour ----------------------------------------------------------------------------------------------

const hexToRgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const prepare = (stops) => stops.map(([t, hex]) => [t, hexToRgb(hex)]);
const mix = (a, b, k) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * k));

/** cold → hot */
export const TEMPERATURE_STOPS = Object.freeze(
  prepare([
    [0, '#2b50d8'],
    [0.2, '#2fa7e6'],
    [0.4, '#3ddc97'],
    [0.6, '#f4e04d'],
    [0.8, '#f7931e'],
    [1, '#e0312c'],
  ])
);

/** EPA category colours: Good → Hazardous (levels 1…6 map to t = 0…1) */
export const AQI_STOPS = Object.freeze(
  prepare([
    [0, '#00e400'],
    [0.2, '#ffff00'],
    [0.4, '#ff7e00'],
    [0.6, '#ff0000'],
    [0.8, '#8f3f97'],
    [1, '#7e0023'],
  ])
);

/** [r, g, b] for position `t` (0…1, clamped) along a list of colour stops. */
export function rampColor(stops, t) {
  const x = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    if (x <= t1) {
      const [t0, c0] = stops[i - 1];
      return mix(c0, c1, t1 === t0 ? 0 : (x - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1].slice();
}

/** CSS `linear-gradient(...)` for a legend bar. */
export function gradientCss(stops) {
  const parts = stops.map(([t, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${Math.round(t * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

// ---- scales ----------------------------------------------------------------------------------------------

/**
 * Temperature scale spanning the region's own min–max, but never narrower than `minSpan` °C: a region that
 * varies by 0.4 °C should look flat, not like a rainbow of noise.
 */
export function temperatureScale(values, { minSpan = 4 } = {}) {
  const finite = values.filter(Number.isFinite);
  const low = finite.length ? Math.min(...finite) : 0;
  const high = finite.length ? Math.max(...finite) : 0;
  const span = Math.max(high - low, minSpan);
  const mid = (low + high) / 2;
  const domain = [mid - span / 2, mid + span / 2];
  return {
    kind: 'temperature',
    unit: '°C',
    domain,
    stops: TEMPERATURE_STOPS,
    colorAt: (value) => rampColor(TEMPERATURE_STOPS, (value - domain[0]) / (domain[1] - domain[0])),
  };
}

export function aqiScale() {
  return {
    kind: 'aqi',
    unit: '',
    domain: [1, 6],
    stops: AQI_STOPS,
    colorAt: (level) => rampColor(AQI_STOPS, (level - 1) / 5),
  };
}

// ---- sampling lattice ------------------------------------------------------------------------------------

/**
 * A `size`×`size` lattice centred on `center` (row 0 = north). The latitude step is `halfSpanLatDeg / half`;
 * the longitude step is widened by 1/cos(latitude) so the lattice stays roughly square on the ground.
 */
export function buildSampleGrid(center, { size = 5, halfSpanLatDeg = 1 } = {}) {
  const lat0 = round2(center.lat);
  const lon0 = round2(center.lon);
  const half = Math.floor(size / 2);
  const latStep = halfSpanLatDeg / half;
  const lonStep = latStep / Math.max(Math.cos(toRadians(clamp(lat0, -80, 80))), 0.2);

  const points = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      points.push({
        row,
        col,
        lat: round2(clamp(lat0 + (half - row) * latStep, -85, 85)),
        lon: round2(clamp(lon0 + (col - half) * lonStep, -180, 180)),
      });
    }
  }

  // The overlay reaches half a step beyond the outer points so every point sits inside a full cell.
  const bounds = {
    north: clamp(lat0 + (half + 0.5) * latStep, -85, 85),
    south: clamp(lat0 - (half + 0.5) * latStep, -85, 85),
    east: clamp(lon0 + (half + 0.5) * lonStep, -180, 180),
    west: clamp(lon0 - (half + 0.5) * lonStep, -180, 180),
  };
  return { points, bounds, latStep, lonStep, size, center: { lat: lat0, lon: lon0 } };
}

// ---- interpolation & pixels ------------------------------------------------------------------------------

/** Kernel width: close enough to the lattice spacing to stay smooth, small enough not to flatten the extremes. */
export const defaultSigma = (latStep) => 0.42 * latStep;

/**
 * Value field over `bounds` as a Float32Array (row-major, north first). Each pixel is the Gaussian-weighted
 * average of the samples, so a failed sample point just leaves its neighbours to fill the gap.
 * Pixels no sample can reach are NaN.
 */
export function interpolateField(samples, { bounds, width, height, sigmaDeg }) {
  const field = new Float32Array(width * height).fill(NaN);
  if (!samples.length) return field;

  const squash = Math.cos(toRadians((bounds.north + bounds.south) / 2)); // degrees of longitude → "latitude degrees"
  const inverse = 1 / (2 * sigmaDeg * sigmaDeg);
  const points = samples.map((s) => ({ x: s.lon * squash, y: s.lat, v: s.value }));

  for (let j = 0; j < height; j++) {
    const lat = bounds.north - ((j + 0.5) / height) * (bounds.north - bounds.south);
    for (let i = 0; i < width; i++) {
      const lon = bounds.west + ((i + 0.5) / width) * (bounds.east - bounds.west);
      const x = lon * squash;
      let weighted = 0;
      let total = 0;
      for (const p of points) {
        const dx = x - p.x;
        const dy = lat - p.y;
        const w = Math.exp(-(dx * dx + dy * dy) * inverse);
        weighted += w * p.v;
        total += w;
      }
      if (total > 1e-12) field[j * width + i] = weighted / total;
    }
  }
  return field;
}

const smoothstep = (x) => x * x * (3 - 2 * x);

/**
 * Colour a field. Alpha fades to 0 over the outer `feather` fraction, so the heat patch melts into the map
 * instead of ending in a hard rectangle. NaN pixels are fully transparent.
 */
export function renderRgba(field, { width, height, colorAt, feather = 0.14 }) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const reach = feather > 0 ? Math.max(feather * Math.min(width, height), 1) : 0; // 0 = no feathering at all
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const value = field[j * width + i];
      if (!Number.isFinite(value)) continue;
      const [r, g, b] = colorAt(value);
      const at = (j * width + i) * 4;
      pixels[at] = r;
      pixels[at + 1] = g;
      pixels[at + 2] = b;
      if (reach === 0) {
        pixels[at + 3] = 255;
      } else {
        const edge = Math.min(i + 0.5, width - i - 0.5, j + 0.5, height - j - 0.5) / reach;
        pixels[at + 3] = Math.round(255 * smoothstep(clamp(edge, 0, 1)));
      }
    }
  }
  return pixels;
}

// ---- summary ---------------------------------------------------------------------------------------------

/** min / max / mean of `pick(point)` over the points that have a finite value. */
export function summarize(points, pick) {
  let min = null;
  let max = null;
  let total = 0;
  let count = 0;
  for (const point of points) {
    const value = pick(point);
    if (!Number.isFinite(value)) continue;
    count++;
    total += value;
    if (!min || value < min.value) min = { value, point };
    if (!max || value > max.value) max = { value, point };
  }
  return { count, min, max, mean: count ? total / count : null };
}
