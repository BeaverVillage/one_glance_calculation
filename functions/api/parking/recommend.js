import { realtimeStatuses } from './_lib/mock-data.js';
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

  const radius = normalizeRadiusMeters(body.radius || 1500);
  const holidayContext = await resolveHolidayContext({ env, dateString: body.arrivalAt });
  const input = { ...body, radius, sort: normalizeSort(body.sort), holidayContext };
  const dataset = await resolveParkingLotDataset({ env, destination: body.destination, radius, query: body.destination?.name || '' });
  const effectiveRadius = Number(dataset.meta?.effectiveRadius || radius);

  const candidates = dataset.lots
    .filter((lot) => Number.isFinite(Number(lot.lat)) && Number.isFinite(Number(lot.lng)))
    .map((lot) => {
      const km = roundDistance(distanceKm(body.destination, lot));
      return { ...lot, distanceFromDestinationKm: km, distanceKm: km };
    })
    .filter((lot) => Number(lot.distanceFromDestinationKm) * 1000 <= effectiveRadius)
    .sort((a, b) => a.distanceFromDestinationKm - b.distanceFromDestinationKm)
    .slice(0, 50);

  const externalRealtime = await resolveRealtimeStatuses({ env, lots: candidates });
  const realtimeSource = externalRealtime.statuses.length ? externalRealtime.statuses : realtimeStatuses;
  const enriched = enrichLots({ lots: candidates, realtimeStatuses: realtimeSource, destination: body.destination, input });
  const filtered = sortRows(applyFilters(enriched, body.filters), input.sort).map((row, index) => ({ ...row, rank: index + 1 }));
  const stats = {
    ...(dataset.meta.stats || {}),
    finalCandidateCount: candidates.length,
    resultCount: filtered.length
  };

  return json({
    summary: {
      durationMinutes: filtered[0]?.durationMinutes ?? null,
      candidateCount: candidates.length,
      resultCount: filtered.length,
      bestLabel: recommendationModeLabel(input.sort),
      dataMode: dataset.meta.mode || (candidates.length ? 'public-adapter' : 'empty'),
      effectiveRadius,
      dataSources: [...(dataset.meta.sources || []), ...(externalRealtime.meta.sources || [])],
      stats,
      fallbackReason: dataset.meta.fallbackReason || '',
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
      note: filtered.length
        ? dataset.meta.note
        : dataset.meta.fallbackReason || '이 주변에서 계산 가능한 주차장을 찾지 못했습니다. 검색 반경을 넓혀보세요.'
    },
    recommended: filtered
  });
}

function normalizeRadiusMeters(radius) {
  const value = Number(radius);
  if (!Number.isFinite(value) || value <= 0) return 1500;
  return Math.min(20000, Math.max(300, Math.round(value)));
}

function normalizeSort(sort) {
  return ['recommended', 'cheap', 'nearby', 'available', 'confidence'].includes(sort) ? sort : 'recommended';
}

function recommendationModeLabel(mode) {
  return { recommended: '추천순', cheap: '저렴한순', nearby: '가까운순', available: '빈자리순', confidence: '신뢰도순' }[mode] || '추천순';
}

function roundDistance(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
