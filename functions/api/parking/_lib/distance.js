export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
export function distanceKm(a, b) {
  const lat1 = toNumber(a.lat);
  const lng1 = toNumber(a.lng);
  const lat2 = toNumber(b.lat);
  const lng2 = toNumber(b.lng);
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function estimateDrivingMinutes(km) {
  if (!Number.isFinite(km)) return null;
  return Math.max(3, Math.round(km / 18 * 60 + 4));
}
export function gridKey(point) {
  return point ? Math.round(toNumber(point.lat) * 1000) + ':' + Math.round(toNumber(point.lng) * 1000) : 'unknown';
}
