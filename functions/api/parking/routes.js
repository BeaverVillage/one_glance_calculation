import { resolveDrivingEstimates } from './_lib/mobility.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=120'
    }
  });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (_) { return error('요청 형식이 올바르지 않습니다.'); }
  if (!body.origin) return error('출발지 좌표가 필요합니다.');
  const lots = Array.isArray(body.lots) ? body.lots : [];
  if (!lots.length) return error('차량 소요시간을 계산할 주차장 후보가 필요합니다.');
  const result = await resolveDrivingEstimates({ env, origin: body.origin, lots, priority: body.priority || 'TIME' });
  return json(result);
}
