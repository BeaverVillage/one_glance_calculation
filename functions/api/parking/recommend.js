import { parkingLots, realtimeStatuses } from './_lib/mock-data.js';
import { resolveParkingLotDataset, resolveRealtimeStatuses } from './_lib/adapters.js';
import { distanceKm } from './_lib/distance.js';
import { enrichLots, applyFilters, sortRows } from './_lib/recommend.js';
import { resolveHolidayContext } from './_lib/holidays.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (_) { return error('요청 형식이 올바르지 않습니다.'); }
  if (!body.destination) return error('목적지 좌표가 필요합니다.');
  if (!body.duration || Number(body.duration) <= 0) return error('출차 시간이 입차 시간보다 늦어야 합니다.');
  const radius = Number(body.radius || 1500);
  const holidayContext = await resolveHolidayContext({ env, dateString: body.arrivalAt });
  const input = { ...body, holidayContext };
  const external = await resolveParkingLotDataset({ env, destination: body.destination, radius, query: body.destination?.name || '' });
  const sourceLots = external.lots.length ? external.lots : parkingLots;
  const withDistance = sourceLots.filter((lot) => lot.lat && lot.lng)
    .map((lot) => ({ ...lot, distanceFromDestinationKm: distanceKm(body.destination, lot) }))
    .sort((a, b) => a.distanceFromDestinationKm - b.distanceFromDestinationKm);
  const nearby = withDistance.filter((lot) => lot.distanceFromDestinationKm * 1000 <= radius);
  const candidates = (nearby.length ? nearby : withDistance.slice(0, 8)).slice(0, 50);
  const externalRealtime = await resolveRealtimeStatuses({ env, lots: candidates });
  const realtimeSource = externalRealtime.statuses.length ? externalRealtime.statuses : realtimeStatuses;
  const enriched = enrichLots({ lots: candidates, realtimeStatuses: realtimeSource, destination: body.destination, input });
  const filtered = sortRows(applyFilters(enriched, body.filters), body.sort).map((row, index) => ({ ...row, rank: index + 1 }));
  return json({
    summary: {
      durationMinutes: filtered[0]?.durationMinutes ?? null,
      candidateCount: candidates.length,
      resultCount: filtered.length,
      bestLabel: recommendationModeLabel(body.sort),
      dataMode: external.lots.length ? 'public-adapter' : 'sample-fallback',
      dataSources: [...(external.meta.sources || []), ...(externalRealtime.meta.sources || [])],
      realtimeMode: externalRealtime.statuses.length ? externalRealtime.meta.mode : 'sample-fallback',
      realtimeNote: externalRealtime.meta.note,
      holidayContext: {
        dateKey: holidayContext.dateKey,
        dayType: holidayContext.dayType,
        dayTypeLabel: holidayContext.dayTypeLabel,
        isHoliday: holidayContext.isHoliday,
        holidayName: holidayContext.holidayName || '',
        mode: holidayContext.mode,
        source: holidayContext.source,
        note: holidayContext.note
      },
      note: external.meta.note
    },
    recommended: filtered
  });
}

function recommendationModeLabel(mode) {
  return { recommended: '추천순', cheap: '저렴한순', nearby: '가까운순', available: '빈자리순', confidence: '신뢰도순' }[mode] || '추천순';
}
