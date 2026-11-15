/** Small geography helpers shared by place lookup and the heat map. */

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const round2 = (value) => Math.round(value * 100) / 100;

function coordinates(point) {
  return {
    lat: Number(point.lat !== undefined ? point.lat : point.latitude),
    lon: Number(point.lon !== undefined ? point.lon : point.longitude),
  };
}

/** Great-circle distance in km. Accepts `{lat, lon}` or `{latitude, longitude}` on either side. */
export function distanceKm(a, b) {
  const p = coordinates(a);
  const q = coordinates(b);
  const dLat = toRadians(q.lat - p.lat);
  const dLon = toRadians(q.lon - p.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(p.lat)) * Math.cos(toRadians(q.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export { toRadians };
