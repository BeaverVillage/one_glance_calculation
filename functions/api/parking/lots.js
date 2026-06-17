import { parkingLots } from './_lib/mock-data.js';
import { distanceKm } from './_lib/distance.js';
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = Number(url.searchParams.get('radius') || 1500);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return error('목적지 좌표가 필요합니다.');
  const center = { lat, lng };
  const lots = parkingLots.filter((lot) => lot.lat && lot.lng)
    .map((lot) => ({ ...lot, distanceKm: Math.round(distanceKm(center, lot) * 10) / 10 }))
    .filter((lot) => lot.distanceKm * 1000 <= radius || radius >= 3000)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 50);
  return json({ lots, radius });
}
