import { parkingLots } from './_lib/mock-data.js';
import { distanceKm, estimateDrivingMinutes, gridKey } from './_lib/distance.js';
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }
export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (_) { return error('요청 형식이 올바르지 않습니다.'); }
  if (!body.origin || !Number.isFinite(Number(body.origin.lat)) || !Number.isFinite(Number(body.origin.lng))) return error('출발지 좌표가 필요합니다.');
  const ids = new Set((body.parkingLotIds || []).slice(0, 20));
  const lots = parkingLots.filter((lot) => ids.has(lot.id));
  const routes = lots.map((lot) => {
    const km = distanceKm(body.origin, lot);
    return { parkingLotId: lot.id, drivingMinutes: estimateDrivingMinutes(km), drivingDistanceKm: Math.round(km * 10) / 10, source: 'distance-fallback', cacheKey: gridKey(body.origin) + ':' + lot.id };
  });
  return json({ routes, note: 'Kakao Mobility API 키가 없거나 호출하지 못한 경우 직선거리 기반 참고 추정값을 반환합니다.' });
}
