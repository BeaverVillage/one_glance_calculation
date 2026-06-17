import { resolveHolidayContext } from './_lib/holidays.js';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=86400'
    }
  });
}

function error(message, status = 400) {
  return json({ error: message }, { status, cacheControl: 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return error('date는 YYYY-MM-DD 형식이어야 합니다.');
  const context = await resolveHolidayContext({ env, dateString: `${date}T00:00:00+09:00` });
  return json({
    date,
    dateKey: context.dateKey,
    dayType: context.dayType,
    dayTypeLabel: context.dayTypeLabel,
    isHoliday: context.isHoliday,
    holidayName: context.holidayName || '',
    mode: context.mode,
    source: context.source,
    note: context.note
  });
}
