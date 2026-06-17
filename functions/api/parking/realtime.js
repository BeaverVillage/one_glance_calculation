import { realtimeStatuses } from './_lib/mock-data.js';
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const parkingLotId = url.searchParams.get('parkingLotId');
  if (!parkingLotId) return error('parkingLotId가 필요합니다.');
  return json({ realtime: realtimeStatuses.find((item) => item.parkingLotId === parkingLotId) || null });
}
