/**
 * Gathers the weather around a place for the heat map: one WeatherAPI `current.json?q=lat,lon&aqi=yes`
 * request per lattice point, a few at a time, with a short-lived cache.
 *
 * Failure policy:
 *  • a bad key or an exhausted quota is fatal — there is no point sending the other requests;
 *  • any other single failure just leaves a hole the interpolation fills from its neighbours;
 *  • if too few points answer, the whole sample fails rather than drawing a misleading map.
 */
import { ErrorType, WeatherApiError } from '../api/errors.js';
import { abortError } from '../api/http.js';
import { aqiLevelOf } from './aqi.js';
import { buildSampleGrid } from './heatmap.js';

const FATAL = new Set([ErrorType.API_CONFIG, ErrorType.RATE_LIMIT]);
const cacheKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function toReading(data) {
  const air = data.current.air_quality;
  return {
    ok: true,
    name: data.location.name,
    temp: data.current.temp_c,
    aqiLevel: aqiLevelOf(air),
    pm25: air && Number.isFinite(air.pm2_5) ? air.pm2_5 : null,
  };
}

export function createRegionSampler({
  client,
  size = 5,
  halfSpanLatDeg = 1,
  concurrency = 8,
  cacheTtlMs = 10 * 60 * 1000,
  minCoverage = 0.4,
  now = Date.now,
} = {}) {
  const cache = new Map();

  /**
   * Resolves `{ grid, points, okCount, total }`; every point is `{ row, col, lat, lon, ok, ... }`.
   * Rejects with AbortError (superseded), or a WeatherApiError when the whole sample is unusable.
   */
  async function sample(center, { signal, onProgress } = {}) {
    const grid = buildSampleGrid(center, { size, halfSpanLatDeg });
    const total = grid.points.length;
    const points = new Array(total);
    let next = 0;
    let done = 0;
    let fatal = null;
    let firstFailure = null;

    async function worker() {
      while (!fatal) {
        if (signal && signal.aborted) throw abortError();
        const index = next++;
        if (index >= total) return;
        const spot = grid.points[index];
        const key = cacheKey(spot.lat, spot.lon);

        const hit = cache.get(key);
        if (hit && now() - hit.at < cacheTtlMs) {
          points[index] = { ...spot, ...hit.reading, cached: true };
        } else {
          try {
            const { data } = await client.getCurrent(`${spot.lat},${spot.lon}`, { signal });
            const reading = toReading(data);
            cache.set(key, { at: now(), reading });
            points[index] = { ...spot, ...reading };
          } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            if (!firstFailure) firstFailure = error;
            points[index] = { ...spot, ok: false };
            if (error instanceof WeatherApiError && FATAL.has(error.type)) fatal = error;
          }
        }
        done++;
        if (onProgress) onProgress(done, total);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
    if (fatal) throw fatal;

    const okCount = points.filter((p) => p && p.ok).length;
    if (okCount < Math.ceil(total * minCoverage)) {
      const type = firstFailure instanceof WeatherApiError ? firstFailure.type : ErrorType.UNEXPECTED;
      throw new WeatherApiError(type, { apiMessage: `Only ${okCount} of ${total} sample points answered.` });
    }
    return { grid, points, okCount, total };
  }

  return { sample };
}
