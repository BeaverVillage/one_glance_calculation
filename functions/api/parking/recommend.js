import { parkingLots, realtimeStatuses } from './_lib/mock-data.js';
import { distanceKm } from './_lib/distance.js';
import { enrichLots, applyFilters, sortRows } from './_lib/recommend.js';
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }
export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (_) { return error('요청 형식이 올바르지 않습니다.'); }
  if (!body.destination) return error('목적지 좌표가 필요합니다.');
  const radius = Number(body.radius || 1500);
  const withDistance = parkingLots.filter((lot) => lot.lat && lot.lng)
    .map((lot) => ({ ...lot, distanceFromDestinationKm: distanceKm(body.destination, lot) }))
    .sort((a, b) => a.distanceFromDestinationKm - b.distanceFromDestinationKm);
  const nearby = withDistance.filter((lot) => lot.distanceFromDestinationKm * 1000 <= radius);
  const candidates = (nearby.length ? nearby : withDistance.slice(0, 8)).slice(0, 20);
  const enriched = enrichLots({ lots: candidates, realtimeStatuses, destination: body.destination, origin: body.origin, input: body });
  const filtered = sortRows(applyFilters(enriched, body.filters), body.sort).map((row, index) => ({ ...row, rank: index + 1 }));
  return json({ summary: { durationMinutes: filtered[0]?.durationMinutes ?? null, candidateCount: candidates.length, resultCount: filtered.length, bestLabel: body.sort === 'cheap' ? '저렴한순' : '균형 추천' }, recommended: filtered });
}
