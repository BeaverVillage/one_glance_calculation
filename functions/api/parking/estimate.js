import { parkingLots } from './_lib/mock-data.js';
import { getNationalParkingLots } from './_lib/adapters.js';
import { estimateParkingFee } from './_lib/fee.js';

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

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return error('요청 형식이 올바르지 않습니다.');
  }

  const input = body.input || body;
  if (!input.arrivalAt || !input.departureAt) return error('입차 시간과 출차 시간이 필요합니다.');

  const lots = Array.isArray(body.lots)
    ? body.lots
    : body.lot
      ? [body.lot]
      : body.parkingLotIds?.length
        ? mergeCandidateLots().filter((lot) => new Set(body.parkingLotIds).has(lot.id))
        : parkingLots.slice(0, 20);

  if (!lots.length) return error('계산할 주차장 후보가 없습니다.', 404);
  return json({
    results: lots.map((lot) => ({ ...estimateParkingFee(lot, input), name: lot.name, source: lot.source || 'sample' }))
  });
}

function mergeCandidateLots() {
  const seen = new Set();
  return [...parkingLots, ...getNationalParkingLots()].filter((lot) => {
    if (!lot?.id || seen.has(lot.id)) return false;
    seen.add(lot.id);
    return true;
  });
}
