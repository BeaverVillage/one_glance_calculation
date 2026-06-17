import { resolveParkingLotDataset } from './_lib/adapters.js';
import { distanceKm } from './_lib/distance.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = normalizeRadiusMeters(url.searchParams.get('radius') || 1500);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return error('목적지 좌표가 필요합니다.');

  const center = { lat, lng };
  const dataset = await resolveParkingLotDataset({ env, destination: center, radius, query: url.searchParams.get('q') || '' });
  const effectiveRadius = Number(dataset.meta?.effectiveRadius || radius);
  const lots = dataset.lots
    .filter((lot) => Number.isFinite(Number(lot.lat)) && Number.isFinite(Number(lot.lng)))
    .map((lot) => {
      const km = roundDistance(distanceKm(center, lot));
      return { ...lot, distanceKm: km, distanceFromDestinationKm: km };
    })
    .filter((lot) => Number(lot.distanceKm) * 1000 <= effectiveRadius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 50);

  const stats = {
    ...(dataset.meta.stats || {}),
    finalNearbyCount: lots.length,
    returnedCount: lots.length
  };

  return json({
    lots,
    radius,
    effectiveRadius,
    dataMode: dataset.meta.mode || (lots.length ? 'public-adapter' : 'empty'),
    dataSources: dataset.meta.sources || [],
    stats,
    fallbackReason: dataset.meta.fallbackReason || '',
    note: lots.length
      ? dataset.meta.note
      : dataset.meta.fallbackReason || '이 주변에서 계산 가능한 주차장을 찾지 못했습니다. 검색 반경을 넓혀보세요.'
  });
}

function normalizeRadiusMeters(radius) {
  const value = Number(radius);
  if (!Number.isFinite(value) || value <= 0) return 1500;
  return Math.min(20000, Math.max(300, Math.round(value)));
}

function roundDistance(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
