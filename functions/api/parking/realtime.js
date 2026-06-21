import { realtimeStatuses, parkingLots } from './_lib/mock-data.js';
import { resolveRealtimeStatuses } from './_lib/adapters.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=60'
    }
  });
}

function error(message, status = 400) {
  return json({ error: message }, { status, cacheControl: 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const parkingLotId = url.searchParams.get('parkingLotId');
  const realtimeKey = url.searchParams.get('realtimeKey');
  const all = url.searchParams.get('all') === '1';
  if (!parkingLotId && !realtimeKey && !all) return error('parkingLotId 또는 realtimeKey가 필요합니다.');

  const external = await resolveRealtimeStatuses({ env, lots: parkingLots });
  const source = external.statuses.length ? external.statuses : realtimeStatuses;
  const realtime = all
    ? source
    : source.find((item) => item.parkingLotId === parkingLotId || item.realtimeKey === realtimeKey) || null;

  return json({
    realtime,
    mode: external.statuses.length ? external.meta.mode : 'sample-fallback',
    note: external.statuses.length
      ? '서울 실시간 주차대수 어댑터에서 가져온 값입니다. 실제 데이터는 5분 이상 차이가 날 수 있습니다.'
      : '실시간 API 키가 없거나 호출이 실패해 샘플 실시간 데이터를 사용합니다.',
    sources: external.meta.sources || []
  });
}
