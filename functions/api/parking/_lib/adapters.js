import { distanceKm } from './distance.js';
import { parkingLots as sampleParkingLots, nationalParkingLots } from './mock-data.js';

const DEFAULT_SEOUL_BASE = 'http://openapi.seoul.go.kr:8088';
const DEFAULT_SEOUL_PARK_INFO_SERVICE = 'GetParkInfo';
const DEFAULT_SEOUL_REALTIME_SERVICE = 'GetParkingInfo';
const PUBLIC_DATA_ENDPOINT = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const PUBLIC_DATA_NUM_OF_ROWS = 1000;
const MAX_PUBLIC_DATA_PAGES = 100;
const PUBLIC_DATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_DATASET_RETURN = 80;

let publicDataCache = {
  key: '',
  expiresAt: 0,
  lots: [],
  meta: null,
  promise: null
};

export async function resolveParkingLotDataset({ env = {}, destination = null, radius = 3000, query = '' } = {}) {
  const radiusMeters = normalizeRadiusMeters(radius);
  const sources = [];
  const errors = [];
  const externalLots = [];
  const adapterQuery = destination ? '' : query;

  const seoul = await safeFetch('seoul-open-data', () => fetchSeoulParkingLots(env, { query: adapterQuery }));
  if (seoul.ok) {
    if (seoul.source) sources.push(seoul.source);
    if (seoul.lots.length) externalLots.push(...seoul.lots);
  } else {
    errors.push(seoul.error);
  }

  const publicData = await safeFetch('public-data-portal', () => fetchPublicParkingLots(env, { query: adapterQuery }));
  if (publicData.ok) {
    if (publicData.source) sources.push(publicData.source);
    if (publicData.lots.length) externalLots.push(...publicData.lots);
  } else {
    errors.push(publicData.error);
  }

  const dedupedExternal = dedupeLots(externalLots);
  const externalWithDistance = addDistances(dedupedExternal, destination);
  const externalNearby = filterByRadius(externalWithDistance, radiusMeters);

  const nationalCache = loadNationalParkingCache({ query: adapterQuery });
  const cacheWithDistance = addDistances(nationalCache, destination);
  const cacheNearby = filterByRadius(cacheWithDistance, radiusMeters);
  const expandedRadiusMeters = Math.min(3000, Math.max(radiusMeters, 3000));
  const expandedCacheNearby = cacheNearby.length ? cacheNearby : filterByRadius(cacheWithDistance, expandedRadiusMeters);

  const sampleWithDistance = addDistances(sampleParkingLots, destination);
  const sampleNearby = filterByRadius(sampleWithDistance, radiusMeters);

  let selectedLots = externalNearby;
  let mode = externalNearby.length ? 'public-adapter' : 'public-adapter-empty';
  let fallbackReason = '';
  let effectiveRadiusMeters = radiusMeters;

  if (externalNearby.length < 3 && expandedCacheNearby.length) {
    selectedLots = dedupeLots([...externalNearby, ...expandedCacheNearby]);
    mode = externalNearby.length ? 'hybrid-public-national-cache' : 'national-cache-fallback';
    fallbackReason = externalNearby.length
      ? '공공데이터 반경 후보가 적어 전국 주차장 캐시 후보를 함께 사용했습니다.'
      : externalWithDistance.length
        ? '공공데이터는 조회됐지만 현재 반경 내 주차장이 없어 전국 주차장 캐시 후보를 사용했습니다.'
        : '연동 가능한 공공데이터 후보가 없어 전국 주차장 캐시 후보를 사용했습니다.';
    if (!externalNearby.length && !cacheNearby.length && expandedCacheNearby.length) effectiveRadiusMeters = expandedRadiusMeters;
  } else if (externalNearby.length < 3 && sampleNearby.length) {
    selectedLots = dedupeLots([...externalNearby, ...sampleNearby]);
    mode = externalNearby.length ? 'hybrid-public-sample' : 'sample-fallback';
    fallbackReason = externalNearby.length
      ? '공공데이터 반경 후보가 적어 로컬 샘플 후보를 함께 사용했습니다.'
      : externalWithDistance.length
        ? '공공데이터는 조회됐지만 현재 반경 내 주차장이 없어 로컬 샘플 후보를 사용했습니다.'
        : '연동 가능한 공공데이터 후보가 없어 로컬 샘플 후보를 사용했습니다.';
  } else if (!externalNearby.length) {
    fallbackReason = externalWithDistance.length
      ? '공공데이터는 조회됐지만 현재 반경 내 주차장이 없습니다.'
      : '연동 가능한 공공데이터 후보가 없습니다.';
  }

  selectedLots = filterByRadius(addDistances(selectedLots, destination), effectiveRadiusMeters)
    .sort((a, b) => valueOrMax(a.distanceFromDestinationKm) - valueOrMax(b.distanceFromDestinationKm))
    .slice(0, MAX_DATASET_RETURN);

  const stats = buildDatasetStats({
    sources,
    externalLots,
    dedupedExternal,
    externalWithDistance,
    externalNearby,
    sampleNearby,
    cacheNearby,
    expandedCacheNearby,
    selectedLots
  });

  return {
    lots: selectedLots,
    meta: {
      mode,
      sourceCount: sources.length,
      sources,
      errors,
      stats,
      fallbackReason,
      effectiveRadius: effectiveRadiusMeters,
      note: selectedLots.length
        ? mode === 'public-adapter'
          ? '공공/개방 데이터 어댑터에서 읽은 반경 내 후보를 사용했습니다.'
          : fallbackReason
        : fallbackReason || '조건에 맞는 주차장 후보가 없습니다.'
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

function normalizeRadiusMeters(radius) {
  const value = Number(radius);
  if (!Number.isFinite(value) || value <= 0) return 1500;
  return Math.min(20000, Math.max(300, Math.round(value)));
}

function addDistances(lots, destination) {
  const validLots = lots.filter((lot) => isValidLatLng(lot.lat, lot.lng));
  if (!destination || !isValidLatLng(destination.lat, destination.lng)) return validLots;
  return validLots.map((lot) => {
    const km = distanceKm(destination, lot);
    return {
      ...lot,
      lat: Number(lot.lat),
      lng: Number(lot.lng),
      distanceFromDestinationKm: roundDistance(km),
      distanceKm: roundDistance(km)
    };
  });
}

function filterByRadius(lots, radiusMeters) {
  const meters = normalizeRadiusMeters(radiusMeters);
  return lots.filter((lot) => {
    if (lot.distanceFromDestinationKm == null) return true;
    return Number(lot.distanceFromDestinationKm) * 1000 <= meters;
  });
}

function buildDatasetStats({ sources, externalLots, dedupedExternal, externalWithDistance, externalNearby, sampleNearby, cacheNearby, expandedCacheNearby, selectedLots }) {
  const sourceById = new Map(sources.filter(Boolean).map((source) => [source.id, source]));
  const seoul = sourceById.get('seoul-open-data') || {};
  const publicData = sourceById.get('public-data-parking') || {};
  return {
    seoulFetchedCount: Number(seoul.count || 0),
    publicPagesFetched: Number(publicData.pagesFetched || 0),
    publicTotalCount: Number(publicData.totalCount || 0),
    publicFetchedCount: Number(publicData.fetchedCount || publicData.count || 0),
    publicNormalizedCount: Number(publicData.normalizedCount || 0),
    publicWithCoordinateCount: Number(publicData.withCoordinateCount || 0),
    publicMissingCoordinateCount: Number(publicData.missingCoordinateCount || 0),
    publicFailedPages: Number(publicData.failedPages || 0),
    normalizedCount: externalLots.length,
    dedupedCount: dedupedExternal.length,
    withCoordinateCount: externalWithDistance.length,
    nearbyCount: externalNearby.length,
    nationalCacheNearbyCount: cacheNearby?.length || 0,
    expandedCacheNearbyCount: expandedCacheNearby?.length || 0,
    sampleNearbyCount: sampleNearby.length,
    returnedCount: selectedLots.length
  };
}

function loadNationalParkingCache({ query = '' } = {}) {
  const lots = normalizeCachedLots(Array.isArray(nationalParkingLots) && nationalParkingLots.length ? nationalParkingLots : sampleParkingLots);
  const keyword = String(query || '').trim().toLowerCase();
  if (!keyword) return lots;
  return lots.filter((lot) => `${lot.name} ${lot.roadAddress || ''} ${lot.jibunAddress || ''} ${lot.region || ''}`.toLowerCase().includes(keyword));
}

function normalizeCachedLots(lots) {
  return lots.map((lot) => normalizeParkingLotLike(lot, { source: lot.source || '전국 주차장 캐시' })).filter(Boolean);
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
  const base = DEFAULT_SEOUL_BASE;
  const service = DEFAULT_SEOUL_PARK_INFO_SERVICE;
  const keyword = query ? '/' + encodeURIComponent(query) : '';
  const url = `${base}/${encodeURIComponent(key)}/json/${encodeURIComponent(service)}/1/100${keyword}`;
  const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) throw new Error(`서울 열린데이터 ${service} 호출 실패: ${res.status}`);
  const data = await res.json();
  const rows = data?.[service]?.row || data?.GetParkInfo?.row || data?.GetParkingInfo?.row || data?.getParkInfo?.row || data?.row || [];
  const lots = rows.map(normalizeSeoulParkInfoRow).filter(Boolean);
  return {
    ok: true,
    source: { id: 'seoul-open-data', name: '서울시 공영주차장 안내 정보', service, count: rows.length, normalizedCount: lots.length },
    lots
  };
}

async function fetchSeoulRealtimeParking(env) {
  const key = env.SEOUL_OPEN_API_KEY || '';
  if (!key) return { ok: true, statuses: [], source: null };
  const base = DEFAULT_SEOUL_BASE;
  const service = DEFAULT_SEOUL_REALTIME_SERVICE;
  const url = `${base}/${encodeURIComponent(key)}/json/${encodeURIComponent(service)}/1/1000`;
  const res = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
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
  if (!key) return { ok: true, lots: [], source: null };

  const cache = await getPublicParkingDataCache(key);
  const keyword = String(query || '').trim().toLowerCase();
  const filtered = keyword
    ? cache.lots.filter((lot) => `${lot.name} ${lot.roadAddress || ''} ${lot.jibunAddress || ''} ${lot.region || ''} ${lot.district || ''}`.toLowerCase().includes(keyword))
    : cache.lots;

  return {
    ok: true,
    source: {
      id: 'public-data-parking',
      name: '공공데이터포털 전국주차장정보표준데이터',
      service: 'tn_pubr_prkplce_info_api',
      count: filtered.length,
      ...cache.meta
    },
    lots: filtered
  };
}

async function getPublicParkingDataCache(serviceKey) {
  const cacheKey = serviceKey ? String(serviceKey).slice(0, 8) : 'no-key';
  const now = Date.now();
  if (publicDataCache.key === cacheKey && publicDataCache.lots.length && publicDataCache.expiresAt > now) {
    return { lots: publicDataCache.lots, meta: { ...publicDataCache.meta, cacheMode: 'memory-hit' } };
  }
  if (publicDataCache.key === cacheKey && publicDataCache.promise) return publicDataCache.promise;

  publicDataCache.key = cacheKey;
  publicDataCache.promise = fetchAllPublicParkingPages(serviceKey)
    .then((result) => {
      publicDataCache.lots = result.lots;
      publicDataCache.meta = result.meta;
      publicDataCache.expiresAt = Date.now() + PUBLIC_DATA_CACHE_TTL_MS;
      publicDataCache.promise = null;
      return { lots: publicDataCache.lots, meta: { ...publicDataCache.meta, cacheMode: 'memory-refresh' } };
    })
    .catch((error) => {
      publicDataCache.promise = null;
      if (publicDataCache.lots.length) return { lots: publicDataCache.lots, meta: { ...publicDataCache.meta, cacheMode: 'memory-stale', fetchError: error?.message || String(error) } };
      throw error;
    });
  return publicDataCache.promise;
}

async function fetchAllPublicParkingPages(serviceKey) {
  const first = await fetchPublicParkingPage(serviceKey, 1);
  const allRows = [...first.rows];
  const failedPages = [];
  const totalCount = first.totalCount || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / PUBLIC_DATA_NUM_OF_ROWS) : MAX_PUBLIC_DATA_PAGES;
  const pagesToFetch = Math.max(1, Math.min(MAX_PUBLIC_DATA_PAGES, totalPages));

  for (let pageNo = 2; pageNo <= pagesToFetch; pageNo += 1) {
    try {
      const page = await fetchPublicParkingPage(serviceKey, pageNo);
      allRows.push(...page.rows);
      if (!totalCount && page.rows.length < PUBLIC_DATA_NUM_OF_ROWS) break;
    } catch (error) {
      failedPages.push({ pageNo, message: error?.message || String(error) });
    }
  }

  const normalizedRows = allRows.map((row) => normalizePublicDataParkingRow(row));
  const normalized = normalizedRows.filter(Boolean);
  const missingCoordinates = normalizedRows.length - normalized.length;
  const deduped = dedupeLots(normalized);

  console.info?.('[public-data] pagesFetched:', pagesToFetch - failedPages.length, 'rawItems:', allRows.length, 'normalizedItems:', normalized.length, 'withCoordinates:', deduped.length, 'missingCoordinates:', missingCoordinates, 'failedPages:', failedPages.length);

  return {
    lots: deduped,
    meta: {
      fetchedCount: allRows.length,
      totalCount,
      pagesFetched: pagesToFetch - failedPages.length,
      requestedPages: pagesToFetch,
      failedPages: failedPages.length,
      failedPageNumbers: failedPages.map((item) => item.pageNo),
      normalizedCount: normalized.length,
      withCoordinateCount: deduped.length,
      missingCoordinateCount: missingCoordinates,
      numOfRows: PUBLIC_DATA_NUM_OF_ROWS,
      maxPages: MAX_PUBLIC_DATA_PAGES,
      cacheMode: 'memory-refresh'
    }
  };
}

async function fetchPublicParkingPage(serviceKey, pageNo) {
  const url = new URL(PUBLIC_DATA_ENDPOINT);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PUBLIC_DATA_NUM_OF_ROWS));
  url.searchParams.set('type', 'json');
  const res = await fetch(url.toString(), { cf: { cacheTtl: 21600, cacheEverything: true } });
  if (!res.ok) throw new Error(`전국주차장정보표준데이터 ${pageNo}페이지 호출 실패: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await res.json() : await parseMaybeJsonOrXml(await res.text());
  const parsed = unwrapPublicDataPayload(data);
  return { rows: parsed.rows, totalCount: parsed.totalCount };
}

async function parseMaybeJsonOrXml(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  return parseSimpleXmlPayload(trimmed);
}

function parseSimpleXmlPayload(xml) {
  const totalCount = toNumber(matchXmlText(xml, 'totalCount'), 0);
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(xml))) {
    const itemXml = match[1];
    const row = {};
    const fieldPattern = /<([^\/][^>\s]*)[^>]*>([\s\S]*?)<\/\1>/g;
    let field;
    while ((field = fieldPattern.exec(itemXml))) {
      row[field[1]] = decodeXml(field[2]);
    }
    if (Object.keys(row).length) items.push(row);
  }
  return { response: { body: { totalCount, items: { item: items } } } };
}

function matchXmlText(xml, tagName) {
  const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`).exec(xml);
  return match ? decodeXml(match[1]) : '';
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function unwrapPublicDataRows(data) {
  return unwrapPublicDataPayload(data).rows;
}

function unwrapPublicDataPayload(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || body?.data || body?.rows || [];
  const rows = Array.isArray(items) ? items : [items].filter(Boolean);
  return {
    rows,
    totalCount: toNumber(body?.totalCount ?? data?.totalCount, rows.length)
  };
}

function normalizeSeoulParkInfoRow(row) {
  const name = pick(row, ['PARKING_NAME', 'PKLT_NM', 'parkingName', 'name']);
  const lat = toNumber(pick(row, ['LAT', 'Y', 'lat']));
  const lng = toNumber(pick(row, ['LNG', 'LOT', 'X', 'lng']));
  if (!name || !isValidLatLng(lat, lng)) return null;
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
    dayPassMinutes: toNumber(pick(row, ['dayCmmtktAdjTime', '1일주차권요금적용시간']), null),
    dayPassFee,
    monthlyFee: toNumber(pick(row, ['FULLTIME_MONTHLY', 'MONTHLY_FEE']), null),
    paymentMethods: '현장 확인',
    notes: '서울 열린데이터 기준 후보입니다. 실제 운영시간과 요금은 현장 기준을 확인하세요.',
    agencyName: '서울특별시 열린데이터광장',
    phone: pick(row, ['TEL', 'PHONE']) || '',
    hasDisabledSpaces: null,
    dataDate: pick(row, ['SYNC_TIME', 'LAST_DATA_TIME', 'CUR_PARKING_TIME', 'dataDate']) || new Date().toISOString().slice(0, 10),
    source: '서울시 공영주차장 안내 정보',
    region: normalizeRegion(pick(row, ['ADDR', 'ROAD_ADDR', 'LCTN_NM', 'roadAddress']) || '서울'),
    realtimeKey: parkingCode || null,
    pricingStatus: resolvePricingStatus({ feeType: payName, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee }),
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
  const name = pick(row, ['prkplceNm', 'prkplce_nm', 'parkingLotName', 'parkingLotNm', 'parkNm', '주차장명', 'PARKING_NAME', 'name']);
  const roadAddress = pick(row, ['rdnmadr', 'roadAddress', 'roadNmAddress', '소재지도로명주소', 'ROAD_ADDR']);
  const jibunAddress = pick(row, ['lnmadr', 'jibunAddress', 'lotnoAddress', '소재지지번주소', 'JIBUN_ADDR']);
  const lat = parseCoordinate(pick(row, ['latitude', 'lat', '위도', 'LAT', 'y', 'Y좌표', '위도값']));
  const lng = parseCoordinate(pick(row, ['longitude', 'lng', '경도', 'LNG', 'x', 'X좌표', '경도값']));
  if (!name || !isValidLatLng(lat, lng)) return null;

  const publicType = pick(row, ['prkplceSe', 'prkplce_se', 'operSe', 'operatingSe', '운영구분', '주차장구분', 'publicPrivateType']) || '공영';
  const feeInfo = pick(row, ['parkingchrgeInfo', 'parkingChargeInfo', 'parkingchrgeSe', 'feeType', '요금정보', '유무료구분']);
  const baseMinutes = parseFeeNumber(pick(row, ['basicTime', 'parkingBasicTime', 'prkBasicTime', '주차기본시간', '기본시간']), null);
  const baseFee = parseFeeNumber(pick(row, ['basicCharge', 'parkingBasicCharge', 'prkBasicCharge', '주차기본요금', '기본요금']), null);
  const additionalMinutes = parseFeeNumber(pick(row, ['addUnitTime', 'addUnitTimeUnit', 'addTime', '추가단위시간']), null);
  const additionalFee = parseFeeNumber(pick(row, ['addUnitCharge', 'addUnitChargeUnit', 'addCharge', '추가단위요금']), null);
  const dayPassFee = parseFeeNumber(pick(row, ['dayCmmtkt', 'dayParkingTicketCharge', 'dayPassFee', '1일주차권요금', '일주차요금']), null);
  const feeType = resolveFeeType(feeInfo, baseFee, additionalFee);
  const pricingStatus = resolvePricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee });

  return {
    id: 'PUBLIC_' + slug(pick(row, ['prkplceNo', 'prkplceMngNo', 'parkingLotId', '주차장관리번호', '관리번호']) || `${name}_${lat}_${lng}`),
    name,
    publicPrivateType: String(publicType).includes('민영') || String(publicType).includes('민간') ? '민영' : '공영',
    parkingType: pick(row, ['prkplceType', 'parkingType', '주차장유형']) || '주차장',
    roadAddress,
    jibunAddress,
    address: roadAddress || jibunAddress,
    lat,
    lng,
    region: normalizeRegion(`${roadAddress} ${jibunAddress} ${pick(row, ['ctprvnNm', '시도명', 'region'])}`),
    district: normalizeDistrict(`${roadAddress} ${jibunAddress}`),
    capacity: parseFeeNumber(pick(row, ['prkcmprt', 'capacity', '주차구획수', '주차면수']), null),
    operatingDays: pick(row, ['operDay', '운영요일']) || '공공데이터 기준',
    weekdayOpen: formatHHMM(pick(row, ['weekdayOperOpenHhmm', 'weekdayOpenTime', '평일운영시작시각'])) || '00:00',
    weekdayClose: formatHHMM(pick(row, ['weekdayOperColseHhmm', 'weekdayOperCloseHhmm', 'weekdayCloseTime', '평일운영종료시각'])) || '23:59',
    saturdayOpen: formatHHMM(pick(row, ['satOperOperOpenHhmm', 'satOperOpenHhmm', 'saturdayOpenTime', '토요일운영시작시각'])) || '00:00',
    saturdayClose: formatHHMM(pick(row, ['satOperCloseHhmm', 'satOperColseHhmm', 'saturdayCloseTime', '토요일운영종료시각'])) || '23:59',
    holidayOpen: formatHHMM(pick(row, ['holidayOperOpenHhmm', 'holidayOpenTime', '공휴일운영시작시각'])) || '00:00',
    holidayClose: formatHHMM(pick(row, ['holidayCloseOpenHhmm', 'holidayOperCloseHhmm', 'holidayOperColseHhmm', 'holidayCloseTime', '공휴일운영종료시각'])) || '23:59',
    feeType,
    baseMinutes,
    baseFee,
    additionalMinutes,
    additionalFee,
    unitMinutes: additionalMinutes,
    unitFee: additionalFee,
    dayPassMinutes: parseFeeNumber(pick(row, ['dayCmmtktAdjTime', '1일주차권요금적용시간']), null),
    dayPassFee,
    dailyMaxFee: dayPassFee,
    monthlyFee: parseFeeNumber(pick(row, ['monthCmmtkt', 'monthlyFee', '월정기권요금']), null),
    freeMinutes: feeType === '무료' ? 1440 : null,
    paymentMethods: pick(row, ['metpay', 'paymentMethods', '결제방법']) || '현장 확인',
    notes: pick(row, ['spcmnt', '특기사항']) || '공공데이터포털 주차장 데이터 후보입니다. 실제 운영시간과 요금은 현장 기준을 확인하세요.',
    agencyName: pick(row, ['institutionNm', 'institutionName', '관리기관명']) || '공공데이터포털',
    phone: pick(row, ['phoneNumber', '전화번호']) || '',
    hasDisabledSpaces: normalizeBoolean(pick(row, ['pwdbsPpkZoneYn', '장애인전용주차구역보유여부'])),
    dataDate: pick(row, ['referenceDate', 'dataDate', '데이터기준일자']) || new Date().toISOString().slice(0, 10),
    source: '공공데이터포털 전국주차장정보표준데이터',
    sourceUpdatedAt: pick(row, ['referenceDate', 'dataDate', '데이터기준일자']) || new Date().toISOString().slice(0, 10),
    pricingStatus,
    realtimeAvailable: null,
    realtimeKey: null,
    disabledDiscountRate: 50,
    compactDiscountRate: 50,
    evDiscountRate: 50
  };
}

function normalizeParkingLotLike(lot, { source = '전국 주차장 캐시' } = {}) {
  const lat = parseCoordinate(lot.lat ?? lot.latitude);
  const lng = parseCoordinate(lot.lng ?? lot.longitude);
  if (!lot.name || !isValidLatLng(lat, lng)) return null;
  const baseMinutes = parseFeeNumber(lot.baseMinutes ?? lot.parkingBasicTime, null);
  const baseFee = parseFeeNumber(lot.baseFee ?? lot.parkingBasicCharge, null);
  const additionalMinutes = parseFeeNumber(lot.additionalMinutes ?? lot.unitMinutes, null);
  const additionalFee = parseFeeNumber(lot.additionalFee ?? lot.unitFee, null);
  const dayPassFee = parseFeeNumber(lot.dayPassFee ?? lot.dailyMaxFee, null);
  const feeType = resolveFeeType(lot.feeType, baseFee, additionalFee);
  return {
    ...lot,
    id: lot.id || 'CACHE_' + slug(`${lot.name}_${lat}_${lng}`),
    lat,
    lng,
    roadAddress: lot.roadAddress || lot.address || '',
    jibunAddress: lot.jibunAddress || '',
    address: lot.address || lot.roadAddress || lot.jibunAddress || '',
    region: lot.region || normalizeRegion(`${lot.roadAddress || lot.address || ''} ${lot.jibunAddress || ''}`),
    district: lot.district || normalizeDistrict(`${lot.roadAddress || lot.address || ''} ${lot.jibunAddress || ''}`),
    feeType,
    baseMinutes,
    baseFee,
    additionalMinutes,
    additionalFee,
    unitMinutes: additionalMinutes,
    unitFee: additionalFee,
    dayPassFee,
    dailyMaxFee: dayPassFee,
    pricingStatus: lot.pricingStatus || resolvePricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee }),
    source: lot.source || source,
    sourceUpdatedAt: lot.sourceUpdatedAt || lot.dataDate || '',
    realtimeAvailable: lot.realtimeAvailable ?? null
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

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

function pick(row, keys) {
  if (!row) return '';
  const keyMap = buildLooseKeyMap(row);
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
    const looseKey = normalizeKey(key);
    const matchedKey = keyMap.get(looseKey);
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') return String(row[matchedKey]).trim();
  }
  return '';
}

function buildLooseKeyMap(row) {
  const map = new Map();
  for (const key of Object.keys(row || {})) map.set(normalizeKey(key), key);
  return map;
}

function normalizeKey(key) {
  return String(key || '').replace(/[\s_\-()\[\].]/g, '').toLowerCase();
}

function toNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function parseFeeNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!text || text === '-' || /없음|해당없음|무료/.test(text)) return /무료/.test(text) ? 0 : fallback;
  const number = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function parseCoordinate(value) {
  if (value == null || value === '') return NaN;
  const number = Number(String(value).trim().replace(/,/g, ''));
  return Number.isFinite(number) ? number : NaN;
}

function resolveFeeType(feeInfo, baseFee, additionalFee) {
  const text = String(feeInfo || '').trim();
  if (/무료/.test(text)) return '무료';
  if (Number(baseFee) === 0 && Number(additionalFee) === 0) return '무료';
  return '유료';
}

function resolvePricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee }) {
  if (String(feeType || '').includes('무료')) return 'free';
  if (hasNumber(baseMinutes) && hasNumber(baseFee) && hasNumber(additionalMinutes) && hasNumber(additionalFee)) return 'complete';
  if (hasNumber(baseMinutes) && hasNumber(baseFee)) return 'partial';
  if (hasNumber(dayPassFee)) return 'partial';
  return 'unknown';
}

function normalizeBoolean(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/Y|YES|TRUE|있|보유|유/i.test(text)) return true;
  if (/N|NO|FALSE|없|미보유|무/i.test(text)) return false;
  return null;
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

function normalizeRegion(value) {
  const text = String(value || '');
  if (/세종|세종특별자치시|세종시/.test(text)) return '세종';
  if (/서울|서울특별시/.test(text)) return '서울';
  if (/부산|부산광역시/.test(text)) return '부산';
  if (/대구|대구광역시/.test(text)) return '대구';
  if (/인천|인천광역시/.test(text)) return '인천';
  if (/광주|광주광역시/.test(text)) return '광주';
  if (/대전|대전광역시/.test(text)) return '대전';
  if (/울산|울산광역시/.test(text)) return '울산';
  if (/경기|경기도/.test(text)) return '경기';
  if (/강원|강원특별자치도|강원도/.test(text)) return '강원';
  if (/충북|충청북도/.test(text)) return '충북';
  if (/충남|충청남도/.test(text)) return '충남';
  if (/전북|전북특별자치도|전라북도/.test(text)) return '전북';
  if (/전남|전라남도/.test(text)) return '전남';
  if (/경북|경상북도/.test(text)) return '경북';
  if (/경남|경상남도/.test(text)) return '경남';
  if (/제주|제주특별자치도/.test(text)) return '제주';
  return '';
}

function normalizeDistrict(value) {
  const text = String(value || '');
  const match = text.match(/([가-힣]+(?:시|군|구))/);
  return match ? match[1] : '';
}

function normalizeName(value) {
  return String(value || '').replace(/[\s·・\-_()\[\]]+/g, '').toLowerCase();
}

function dedupeLots(lots) {
  const result = [];
  const seenIds = new Set();
  for (const lot of lots) {
    if (!lot) continue;
    const id = String(lot.id || '').trim();
    if (id && seenIds.has(id)) continue;
    const duplicate = result.some((existing) => {
      const sameName = normalizeName(existing.name) && normalizeName(existing.name) === normalizeName(lot.name);
      if (!sameName) return false;
      if (!isValidLatLng(existing.lat, existing.lng) || !isValidLatLng(lot.lat, lot.lng)) return true;
      return distanceKm(existing, lot) <= 0.05;
    });
    if (duplicate) continue;
    if (id) seenIds.add(id);
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

function roundDistance(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function valueOrMax(value) {
  return value == null ? Number.MAX_SAFE_INTEGER : Number(value);
}

export const __parkingAdapterTest = {
  normalizeSeoulParkInfoRow,
  normalizeSeoulRealtimeRow,
  normalizePublicDataParkingRow,
  normalizeParkingLotLike,
  unwrapPublicDataRows,
  unwrapPublicDataPayload,
  matchRealtimeStatuses,
  parseMaybeJsonOrXml,
  parseSimpleXmlPayload,
  parseObservedTime,
  formatHHMM,
  dedupeLots,
  filterByRadius,
  addDistances,
  loadNationalParkingCache,
  fetchPublicParkingLots,
  fetchAllPublicParkingPages
};
