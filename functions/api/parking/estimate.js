import { parkingLots } from './_lib/mock-data.js';
import { estimateParkingFee } from './_lib/fee.js';
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }
export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (_) { return error('요청 형식이 올바르지 않습니다.'); }
  const ids = new Set(body.parkingLotIds || []);
  const lots = ids.size ? parkingLots.filter((lot) => ids.has(lot.id)) : parkingLots.slice(0, 20);
  return json({ results: lots.map((lot) => estimateParkingFee(lot, body)) });
}
