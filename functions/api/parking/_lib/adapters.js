import { distanceKm } from './distance.js';

const DEFAULT_SEOUL_BASE = 'http://openapi.seoul.go.kr:8088';
const DEFAULT_PUBLIC_DATA_BASE = '';
const DEFAULT_SEOUL_PARK_INFO_SERVICE = 'GetParkInfo';
const DEFAULT_SEOUL_REALTIME_SERVICE = 'GetParkingInfo';

export async function resolveParkingLotDataset({ env = {}, destination = null, radius = 3000, query = '' } = {}) {
  const sources = [];
  const errors = [];
  const lots = [];

  const seoul = await safeFetch('seoul-open-data', () => fetchSeoulParkingLots(env, { query }));
  if (seoul.ok && seoul.lots.length) {
    lots.push(...seoul.lots);
    sources.push(seoul.source);
  } else if (!seoul.ok) {
    errors.push(seoul.error);
  }

  const publicData = await safeFetch('public-data-portal', () => fetchPublicParkingLots(env, { query }));
  if (publicData.ok && publicData.lots.length) {
    lots.push(...publicData.lots);
    sources.push(publicData.source);
  } else if (!publicData.ok) {
    errors.push(publicData.error);
  }

  const deduped = dedupeLots(lots);
  const withDistance = destination
    ? deduped
        .filter((lot) => Number.isFinite(Number(lot.lat)) && Number.isFinite(Number(lot.lng)))
        .map((lot) => ({ ...lot, distanceFromDestinationKm: distanceKm(destination, lot) }))
        .sort((a, b) => a.distanceFromDestinationKm - b.distanceFromDestinationKm)
    : deduped;
  const nearby = destination ? withDistance.filter((lot) => lot.distanceFromDestinationKm * 1000 <= radius) : withDistance;

  return {
    lots: (nearby.length ? nearby : withDistance).slice(0, 80),
    meta: {
      mode: deduped.length ? 'external' : 'sample',
      sourceCount: sources.length,
      sources,
      errors,
      note: deduped.length
        ? '공공/개방 데이터 어댑터에서 읽은 후보를 우선 사용했습니다.'
        : '연동 가능한 공공데이터 키나 endpoint가 없어 샘플 데이터를 사용합니다.'
    }
  };
}

export async function resolveRealtimeStatuses({ env = {}, lots = [] } = {}) {
  const sources = [];
  const errors = [];
  const seoul = await safeFetch('seoul-realtime-parking', () => fetchSeoulRealtimeParking(env));
  if (seoul.ok && seoul.statuses.length) {
    sources.push(seoul.source);
    return {
      statuses: matchRealtimeStatuses(lots, seoul.statuses),
      meta: {
        mode: 'seoul-realtime-adapter',
        sources,
        errors,
        note: '서울시 시영주차장 실시간 주차대수 정보를 후보 주차장과 매칭했습니다. 실제 데이터는 5분 이상 차이가 날 수 있습니다.'
      }
    };
  }
  if (!seoul.ok) errors.push(seoul.error);
  return {
    statuses: [],
    meta: {
      mode: 'sample-fallback',
      sources,
      errors,
      note: '서울 실시간 주차대수 API 키가 없거나 호출이 실패해 샘플 실시간 데이터를 사용합니다.'
    }
  };
}

async function safeFetch(name, task) {
  try {
    return await task();
  } catch (error) {
    return { ok: false, lots: [], statuses: [], source: null, error: { name, message: error?.message || String(error) } };
  }
}

async function fetchSeoulParkingLots(env, { query = '' } = {}) {
  const key = env.SEOUL_OPEN_API_KEY || '';
  if (!key) return { ok: true, lots: [], source: null };
  const base = (env.SEOUL_OPEN_API_BASE || DEFAULT_SEOUL_BASE).replace(/\/$/, '');
  const service = env.SEOUL_PARK_INFO_API_NAME || DEFAULT_SEOUL_PARK_INFO_SERVICE;
  const keyword = query ? '/' + encodeURIComponent(query) : '';
  const url = `${base}/${encodeURIComponent(key)}/json/${encodeURIComponent(service)}/1/100${keyword}`;
  const res = await fetch(url, { cf: { cacheTtl: apiCacheTtl(env, 300), cacheEverything: true } });
  if (!res.ok) throw new Error(`서울 열린데이터 ${service} 호출 실패: ${res.status}`);
  const data = await res.json();
  const rows = data?.[service]?.row || data?.GetParkInfo?.row || data?.GetParkingInfo?.row || data?.getParkInfo?.row || data?.row || [];
  return {
    ok: true,
    source: { id: 'seoul-open-data', name: '서울시 공영주차장 안내 정보', service, count: rows.length },
    lots: rows.map(normalizeSeoulParkInfoRow).filter(Boolean)
  };
}

async function fetchSeoulRealtimeParking(env) {
  const key = env.SEOUL_OPEN_API_KEY || env.SEOUL_REALTIME_PARKING_API_KEY || '';
  if (!key) return { ok: true, statuses: [], source: null };
  const base = (env.SEOUL_OPEN_API_BASE || DEFAULT_SEOUL_BASE).replace(/\/$/, '');
  const service = env.SEOUL_REALTIME_PARKING_API_NAME || DEFAULT_SEOUL_REALTIME_SERVICE;
  const url = `${base}/${encodeURIComponent(key)}/json/${encodeURIComponent(service)}/1/1000`;
  const res = await fetch(url, { cf: { cacheTtl: apiCacheTtl(env, 60, 'PARKING_REALTIME_CACHE_TTL_SECONDS'), cacheEverything: true } });
  if (!res.ok) throw new Error(`서울 실시간 주차대수 ${service} 호출 실패: ${res.status}`);
  const data = await res.json();
  const rows = data?.[service]?.row || data?.GetParkingInfo?.row || data?.RealtimeCityParking?.row || data?.row || [];
  return {
    ok: true,
    source: { id: 'seoul-realtime-parking', name: '서울시 시영주차장 실시간 주차대수 정보', service, count: rows.length },
    statuses: rows.map(normalizeSeoulRealtimeRow).filter(Boolean)
  };
}

async function fetchPublicParkingLots(env, { query = '' } = {}) {
  const key = env.PUBLIC_DATA_API_KEY || '';
  const endpoint = env.PUBLIC_DATA_PARKING_API_URL || env.PUBLIC_DATA_PARKING_ENDPOINT || DEFAULT_PUBLIC_DATA_BASE;
  if (!key || !endpoint) return { ok: true, lots: [], source: null };
  const url = new URL(endpoint);
  if (!url.searchParams.has('serviceKey')) url.searchParams.set('serviceKey', key);
  if (!url.searchParams.has('_type')) url.searchParams.set('_type', 'json');
  if (!url.searchParams.has('numOfRows')) url.searchParams.set('numOfRows', '100');
  if (query && !url.searchParams.has('keyword')) url.searchParams.set('keyword', query);
  const res = await fetch(url.toString(), { cf: { cacheTtl: apiCacheTtl(env, 300), cacheEverything: true } });
  if (!res.ok) throw new Error(`공공데이터포털 주차장 API 호출 실패: ${res.status}`);
  const data = await res.json();
  const rows = unwrapPublicDataRows(data);
  return {
    ok: true,
    source: { id: 'public-data-portal', name: '공공데이터포털 주차장 API', count: rows.length },
    lots: rows.map(normalizePublicDataParkingRow).filter(Boolean)
  };
}

function unwrapPublicDataRows(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || body?.data || body?.rows || [];
  return Array.isArray(items) ? items : [items].filter(Boolean);
}

function normalizeSeoulParkInfoRow(row) {
  const name = pick(row, ['PARKING_NAME', 'PKLT_NM', 'parkingName', 'name']);
  const lat = toNumber(pick(row, ['LAT', 'Y', 'lat']));
  const lng = toNumber(pick(row, ['LNG', 'LOT', 'X', 'lng']));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const parkingCode = pick(row, ['PARKING_CODE', 'PKLT_CD']);
  const payName = pick(row, ['PAY_NM', 'PAY_YN_NM', 'PAY_YN', 'feeTypeName']);
  const publicType = pick(row, ['OPERATION_RULE_NM', 'OPER_MNATH', 'publicPrivateType']) || '공영';
  const baseMinutes = toNumber(pick(row, ['TIME_RATE', 'BASIC_TIME', 'baseMinutes']));
  const baseFee = toNumber(pick(row, ['RATES', 'BASIC_CHARGE', 'baseFee']));
  const additionalMinutes = toNumber(pick(row, ['ADD_TIME_RATE', 'ADD_TIME_RATES', 'ADD_UNIT_TIME', 'additionalMinutes']));
  const additionalFee = toNumber(pick(row, ['ADD_RATES', 'ADD_UNIT_CHARGE', 'additionalFee']));
  const dayPassFee = toNumber(pick(row, ['DAY_MAXIMUM', 'DAY_MAX_FEE', 'dayPassFee']), null);
  return {
    id: 'SEOUL_' + slug(parkingCode || name),
    name,
    publicPrivateType: publicType.includes('민영') ? '민영' : '공영',
    parkingType: pick(row, ['PARKING_TYPE_NM', 'PKLT_TYPE_NM', 'parkingType']) || '주차장',
    roadAddress: pick(row, ['ADDR', 'ROAD_ADDR', 'LCTN_NM', 'roadAddress']) || '',
    jibunAddress: pick(row, ['ADDR', 'JIBUN_ADDR', 'address']) || '',
    lat,
    lng,
    capacity: toNumber(pick(row, ['CAPACITY', 'PKLT_CNT', 'capacity']), null),
    operatingDays: '공공데이터 기준',
    weekdayOpen: formatHHMM(pick(row, ['WEEKDAY_BEGIN_TIME', 'weekdayOpen'])) || '00:00',
    weekdayClose: formatHHMM(pick(row, ['WEEKDAY_END_TIME', 'weekdayClose'])) || '23:59',
    saturdayOpen: formatHHMM(pick(row, ['WEEKEND_BEGIN_TIME', 'SATURDAY_BEGIN_TIME', 'saturdayOpen'])) || formatHHMM(pick(row, ['WEEKDAY_BEGIN_TIME'])) || '00:00',
    saturdayClose: formatHHMM(pick(row, ['WEEKEND_END_TIME', 'SATURDAY_END_TIME', 'saturdayClose'])) || formatHHMM(pick(row, ['WEEKDAY_END_TIME'])) || '23:59',
    holidayOpen: formatHHMM(pick(row, ['HOLIDAY_BEGIN_TIME', 'holidayOpen'])) || formatHHMM(pick(row, ['WEEKEND_BEGIN_TIME'])) || '00:00',
    holidayClose: formatHHMM(pick(row, ['HOLIDAY_END_TIME', 'holidayClose'])) || formatHHMM(pick(row, ['WEEKEND_END_TIME'])) || '23:59',
    feeType: payName?.includes('무료') || baseFee === 0 ? '무료' : '유료',
    baseMinutes,
    baseFee,
    additionalMinutes,
    additionalFee,
    dayPassMinutes: null,
    dayPassFee,
    monthlyFee: toNumber(pick(row, ['FULLTIME_MONTHLY', 'MONTHLY_FEE']), null),
    paymentMethods: '현장 확인',
    notes: '서울 열린데이터 기준 후보입니다. 실제 운영시간과 요금은 현장 기준을 확인하세요.',
    agencyName: '서울특별시 열린데이터광장',
    phone: pick(row, ['TEL', 'PHONE']) || '',
    hasDisabledSpaces: null,
    dataDate: pick(row, ['SYNC_TIME', 'LAST_DATA_TIME', 'CUR_PARKING_TIME', 'dataDate']) || new Date().toISOString().slice(0, 10),
    source: '서울시 공영주차장 안내 정보',
    realtimeKey: parkingCode || null,
    disabledDiscountRate: 50,
    compactDiscountRate: 50,
    evDiscountRate: 50
  };
}

function normalizeSeoulRealtimeRow(row) {
  const parkingCode = pick(row, ['PARKING_CODE', 'PKLT_CD', 'parkingCode']);
  const name = pick(row, ['PARKING_NAME', 'PKLT_NM', 'parkingName', 'name']);
  const capacity = toNumber(pick(row, ['CAPACITY', 'PKLT_CNT', 'totalSpaces']), null);
  const currentParking = toNumber(pick(row, ['CUR_PARKING', 'NOW_PRK_VHCL_CNT', 'currentParking']), null);
  let available = toNumber(pick(row, ['AVAILABLE_PARKING', 'AVAIL_PARKING', 'availableSpaces']), null);
  if (!hasNumber(available) && hasNumber(capacity) && hasNumber(currentParking)) {
    available = Math.max(0, Number(capacity) - Number(currentParking));
  }
  if (!parkingCode && !name) return null;
  if (!hasNumber(available) && !hasNumber(currentParking)) return null;
  return {
    parkingLotId: parkingCode ? 'SEOUL_' + slug(parkingCode) : 'SEOUL_REALTIME_' + slug(name),
    realtimeKey: parkingCode || null,
    parkingName: name,
    availableSpaces: hasNumber(available) ? Number(available) : null,
    occupiedSpaces: hasNumber(currentParking) ? Number(currentParking) : null,
    totalSpaces: hasNumber(capacity) ? Number(capacity) : null,
    observedAt: parseObservedTime(pick(row, ['CUR_PARKING_TIME', 'NOW_PRK_VHCL_UPDT_TIME', 'observedAt'])) || new Date().toISOString(),
    source: '서울시 시영주차장 실시간 주차대수 정보'
  };
}

function normalizePublicDataParkingRow(row) {
  const name = pick(row, ['prkplceNm', 'parkingLotName', '주차장명', 'PARKING_NAME', 'name']);
  const lat = toNumber(pick(row, ['latitude', 'lat', '위도', 'LAT']));
  const lng = toNumber(pick(row, ['longitude', 'lng', '경도', 'LNG']));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const publicType = pick(row, ['prkplceSe', 'operSe', '운영구분', 'publicPrivateType']) || '공영';
  const feeType = pick(row, ['parkingchrgeInfo', 'feeType', '요금정보']) || '';
  return {
    id: 'PUBLIC_' + slug(pick(row, ['prkplceNo', 'parkingLotId', '관리번호']) || name),
    name,
    publicPrivateType: String(publicType).includes('민영') ? '민영' : '공영',
    parkingType: pick(row, ['prkplceType', 'parkingType', '주차장유형']) || '주차장',
    roadAddress: pick(row, ['rdnmadr', 'roadAddress', '소재지도로명주소']) || '',
    jibunAddress: pick(row, ['lnmadr', 'jibunAddress', '소재지지번주소']) || '',
    lat,
    lng,
    capacity: toNumber(pick(row, ['prkcmprt', 'capacity', '주차구획수']), null),
    operatingDays: pick(row, ['operDay', '운영요일']) || '공공데이터 기준',
    weekdayOpen: formatHHMM(pick(row, ['weekdayOperOpenHhmm', '평일운영시작시각'])) || '00:00',
    weekdayClose: formatHHMM(pick(row, ['weekdayOperColseHhmm', '평일운영종료시각'])) || '23:59',
    saturdayOpen: formatHHMM(pick(row, ['satOperOperOpenHhmm', '토요일운영시작시각'])) || '00:00',
    saturdayClose: formatHHMM(pick(row, ['satOperCloseHhmm', '토요일운영종료시각'])) || '23:59',
    holidayOpen: formatHHMM(pick(row, ['holidayOperOpenHhmm', '공휴일운영시작시각'])) || '00:00',
    holidayClose: formatHHMM(pick(row, ['holidayCloseOpenHhmm', '공휴일운영종료시각'])) || '23:59',
    feeType: String(feeType).includes('무료') ? '무료' : '유료',
    baseMinutes: toNumber(pick(row, ['basicTime', '기본시간']), null),
    baseFee: toNumber(pick(row, ['basicCharge', '기본요금']), null),
    additionalMinutes: toNumber(pick(row, ['addUnitTime', '추가단위시간']), null),
    additionalFee: toNumber(pick(row, ['addUnitCharge', '추가단위요금']), null),
    dayPassMinutes: null,
    dayPassFee: toNumber(pick(row, ['dayCmmtkt', '일주차권요금적용시간', 'dayPassFee']), null),
    monthlyFee: toNumber(pick(row, ['monthCmmtkt', '월정기권요금']), null),
    paymentMethods: pick(row, ['metpay', '결제방법']) || '현장 확인',
    notes: '공공데이터포털 주차장 데이터 후보입니다. 실제 운영시간과 요금은 현장 기준을 확인하세요.',
    agencyName: pick(row, ['institutionNm', '관리기관명']) || '공공데이터포털',
    phone: pick(row, ['phoneNumber', '전화번호']) || '',
    hasDisabledSpaces: null,
    dataDate: pick(row, ['referenceDate', '데이터기준일자']) || new Date().toISOString().slice(0, 10),
    source: '공공데이터포털 주차장 API',
    realtimeKey: null,
    disabledDiscountRate: 50,
    compactDiscountRate: 50,
    evDiscountRate: 50
  };
}

function matchRealtimeStatuses(lots, statuses) {
  if (!lots.length) return statuses;
  const statusByKey = new Map();
  const statusByName = new Map();
  for (const status of statuses) {
    if (status.realtimeKey) statusByKey.set(String(status.realtimeKey), status);
    if (status.parkingName) statusByName.set(normalizeName(status.parkingName), status);
    if (status.parkingLotId) statusByKey.set(String(status.parkingLotId).replace(/^SEOUL_/, ''), status);
  }
  const matched = [];
  for (const lot of lots) {
    const key = lot.realtimeKey ? String(lot.realtimeKey) : String(lot.id || '').replace(/^SEOUL_/, '');
    const status = statusByKey.get(key) || statusByName.get(normalizeName(lot.name));
    if (!status) continue;
    matched.push({
      ...status,
      parkingLotId: lot.id,
      realtimeKey: lot.realtimeKey || status.realtimeKey || null,
      parkingName: lot.name
    });
  }
  return dedupeStatuses(matched);
}

function apiCacheTtl(env, fallback = 300, key = 'PARKING_API_CACHE_TTL_SECONDS') {
  const value = Number(env?.[key] || env?.PARKING_API_CACHE_TTL_SECONDS);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function pick(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function toNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function formatHHMM(value) {
  if (!value) return '';
  const digits = String(value).replace(/[^0-9]/g, '').padStart(4, '0').slice(-4);
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 24 || m > 59) return '';
  if (h === 24) return '23:59';
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function parseObservedTime(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return new Date(text.replace(' ', 'T')).toISOString();
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length >= 12) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    const hour = digits.slice(8, 10);
    const minute = digits.slice(10, 12);
    const second = digits.slice(12, 14) || '00';
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  return '';
}

function slug(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 80) || Math.random().toString(36).slice(2);
}

function normalizeName(value) {
  return String(value || '').replace(/[\s·・\-_()\[\]]+/g, '').toLowerCase();
}

function dedupeLots(lots) {
  const seen = new Set();
  const result = [];
  for (const lot of lots) {
    const key = lot.id || `${lot.name}:${lot.lat}:${lot.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(lot);
  }
  return result;
}

function dedupeStatuses(statuses) {
  const seen = new Set();
  const result = [];
  for (const status of statuses) {
    const key = status.parkingLotId || status.realtimeKey || status.parkingName;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(status);
  }
  return result;
}

export const __parkingAdapterTest = {
  normalizeSeoulParkInfoRow,
  normalizeSeoulRealtimeRow,
  matchRealtimeStatuses,
  parseObservedTime,
  formatHHMM
};
