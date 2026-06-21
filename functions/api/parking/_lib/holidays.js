const DEFAULT_HOLIDAY_BASE = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';
const DEFAULT_HOLIDAY_SERVICE = 'getRestDeInfo';

export function getDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function getDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date,
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    dateKey: getDateKey(value)
  };
}

export async function resolveHolidayContext({ env = {}, dateString } = {}) {
  const fallback = buildCalendarFallback(dateString);
  const key = env.HOLIDAY_API_KEY || env.PUBLIC_DATA_API_KEY || env.DATA_GO_KR_SERVICE_KEY || '';
  if (!key || !fallback.dateKey) {
    return {
      ...fallback,
      mode: 'calendar-fallback',
      source: '주말 기준 fallback',
      note: '공휴일 API 키가 없어 토요일·일요일 기준으로 운영시간을 판정합니다.'
    };
  }

  try {
    const holidays = await fetchKoreanPublicHolidays(env, fallback);
    const match = holidays.find((item) => String(item.locdate) === fallback.dateKey && String(item.isHoliday || '').toUpperCase() === 'Y');
    if (match) {
      return {
        ...fallback,
        dayType: 'holiday',
        dayTypeLabel: '공휴일',
        isHoliday: true,
        holidayName: match.dateName || '공휴일',
        mode: 'holiday-api',
        source: '한국천문연구원 특일 정보',
        note: `${match.dateName || '공휴일'} 기준으로 공휴일 운영시간을 적용합니다.`
      };
    }
    return {
      ...fallback,
      mode: 'holiday-api',
      source: '한국천문연구원 특일 정보',
      note: fallback.dayType === 'weekday'
        ? '공휴일 API 확인 결과 일반 평일 기준으로 판정합니다.'
        : `${fallback.dayTypeLabel} 기준으로 운영시간을 적용합니다.`
    };
  } catch (error) {
    return {
      ...fallback,
      mode: 'calendar-fallback',
      source: '주말 기준 fallback',
      note: `공휴일 API 호출 실패로 토요일·일요일 기준을 적용합니다. (${error?.message || 'holiday api failed'})`
    };
  }
}

async function fetchKoreanPublicHolidays(env, parts) {
  const key = env.HOLIDAY_API_KEY || env.PUBLIC_DATA_API_KEY || env.DATA_GO_KR_SERVICE_KEY || '';
  const base = DEFAULT_HOLIDAY_BASE;
  const service = DEFAULT_HOLIDAY_SERVICE;
  const url = new URL(`${base}/${service}`);
  url.searchParams.set('serviceKey', normalizeServiceKey(key));
  url.searchParams.set('solYear', parts.year);
  url.searchParams.set('solMonth', parts.month);
  url.searchParams.set('_type', 'json');
  const res = await fetch(url.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error(`한국천문연구원 특일 정보 호출 실패: ${res.status}`);
  const text = await res.text();
  return parseHolidayResponse(text);
}

function normalizeServiceKey(key) {
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try { return decodeURIComponent(key); } catch (_) { return key; }
}

function parseHolidayResponse(text) {
  try {
    const data = JSON.parse(text);
    const item = data?.response?.body?.items?.item || data?.body?.items?.item || data?.items?.item || [];
    return (Array.isArray(item) ? item : [item]).filter(Boolean).map((row) => ({
      locdate: row.locdate || row.LOC_DATE || row.date,
      dateName: row.dateName || row.date_name || row.name,
      isHoliday: row.isHoliday || row.holidayYn || row.isHolidayYn
    }));
  } catch (_) {
    return parseHolidayXml(text);
  }
}

function parseHolidayXml(text) {
  const rows = [];
  const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const item of itemMatches) {
    rows.push({
      locdate: tag(item, 'locdate'),
      dateName: tag(item, 'dateName'),
      isHoliday: tag(item, 'isHoliday')
    });
  }
  return rows;
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? match[1].trim() : '';
}

export function buildCalendarFallback(dateString) {
  const parts = getDateParts(dateString);
  if (!parts) {
    return { dayType: 'weekday', dayTypeLabel: '평일', isHoliday: false, holidayName: '', dateKey: '', mode: 'calendar-fallback', source: '주말 기준 fallback', note: '방문일을 해석하지 못해 평일 기준으로 표시합니다.' };
  }
  const day = parts.date.getDay();
  if (day === 0) return { ...parts, dayType: 'holiday', dayTypeLabel: '공휴일', isHoliday: true, holidayName: '일요일', mode: 'calendar-fallback', source: '주말 기준 fallback', note: '일요일 기준으로 공휴일 운영시간을 적용합니다.' };
  if (day === 6) return { ...parts, dayType: 'saturday', dayTypeLabel: '토요일', isHoliday: false, holidayName: '', mode: 'calendar-fallback', source: '주말 기준 fallback', note: '토요일 운영시간을 적용합니다.' };
  return { ...parts, dayType: 'weekday', dayTypeLabel: '평일', isHoliday: false, holidayName: '', mode: 'calendar-fallback', source: '주말 기준 fallback', note: '평일 운영시간을 적용합니다.' };
}

export function getOperatingWindow(lot, dateString, holidayContext = null) {
  const context = holidayContext || buildCalendarFallback(dateString);
  if (context.dayType === 'holiday') return { open: lot.holidayOpen, close: lot.holidayClose, ...context };
  if (context.dayType === 'saturday') return { open: lot.saturdayOpen, close: lot.saturdayClose, ...context };
  return { open: lot.weekdayOpen, close: lot.weekdayClose, ...context };
}

function minutesOfDay(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function isOpenDuring(lot, arrivalAt, departureAt, holidayContext = null) {
  const window = getOperatingWindow(lot, arrivalAt, holidayContext);
  const open = minutesOfDay(window.open);
  const close = minutesOfDay(window.close);
  if (open == null || close == null) return { isOpen: false, reason: `${window.dayTypeLabel || '방문일'} 운영시간 정보 없음`, ...window };
  if (open === 0 && close >= 1439) return { isOpen: true, reason: `${window.dayTypeLabel || '방문일'} 24시간 운영으로 표시`, ...window };
  const arrival = new Date(arrivalAt);
  const departure = new Date(departureAt);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) return { isOpen: false, reason: '일정 오류', ...window };
  const start = arrival.getHours() * 60 + arrival.getMinutes();
  let end = departure.getHours() * 60 + departure.getMinutes();
  if (departure.getTime() > arrival.getTime() && departure.toDateString() !== arrival.toDateString()) end += 1440;
  const closeAdjusted = close < open ? close + 1440 : close;
  const startAdjusted = start < open && close < open ? start + 1440 : start;
  const fits = startAdjusted >= open && end <= closeAdjusted;
  return {
    isOpen: fits,
    reason: fits
      ? `${window.dayTypeLabel || '방문일'} 운영시간 기준 이용 가능으로 표시됩니다.`
      : `${window.dayTypeLabel || '방문일'} 운영시간 일부가 선택 시간 밖일 수 있습니다.`,
    ...window
  };
}

