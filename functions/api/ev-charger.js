const EV_ENDPOINT = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const EV_ENDPOINT_HTTP = 'http://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const MAX_ROWS = 9000;
const REGION_CACHE_TTL_SECONDS = 300;
const API_TIMEOUT_MS = 8000;
const ZCODE_MAP = {
  서울: '11', 부산: '26', 대구: '27', 인천: '28', 광주: '29', 대전: '30', 울산: '31', 세종: '36', 경기: '41', 강원: '51', 충북: '43', 충남: '44', 전북: '52', 전남: '46', 경북: '47', 경남: '48', 제주: '50'
};
const STATUS_LABELS = { '0': '알수없음', '1': '통신이상', '2': '충전대기', '3': '충전 중', '4': '운영중지', '5': '점검중', '6': '예약중', '9': '상태 미확인' };
const TYPE_LABELS = { '01': 'DC차데모', '02': 'AC완속', '03': 'DC차데모+AC3상', '04': 'DC콤보', '05': 'DC차데모+DC콤보', '06': 'DC차데모+AC3상+DC콤보', '07': 'AC3상', '08': 'DC콤보(완속)', '09': 'NACS', '10': 'DC콤보+NACS', '11': 'DC콤보2(버스전용)' };

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'max-age=60',
    ...init.headers
  }
});

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet({ request, env, waitUntil }) {
  try {
    const key = getEnv(env, ['EV_CHARGER_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']);
    if (!key) return json({ ok: false, message: '전기차 충전소 API 키가 설정되지 않았습니다.' }, { status: 500 });

    const url = new URL(request.url);
    const lat = toNumber(url.searchParams.get('lat'), 37.5665);
    const lng = toNumber(url.searchParams.get('lng'), 126.9780);
    const radius = Math.min(Math.max(toNumber(url.searchParams.get('radius'), 3000), 500), 20000);
    const sido = normalizeSido(url.searchParams.get('sido') || '서울');
    const zcode = url.searchParams.get('zcode') || ZCODE_MAP[sido] || '11';
    const chargerType = clean(url.searchParams.get('chargerType'), 20);
    const speed = clean(url.searchParams.get('speed'), 12);
    const freeParking = url.searchParams.get('freeParking') === 'true';
    const noLimit = url.searchParams.get('noLimit') === 'true';
    const zscode = clean(url.searchParams.get('zscode'), 10);

    // PowerShell 실측 성공 URL과 동일하게 raw query string 방식으로 호출합니다.
    // 일부 공공데이터 Gateway에서 URLSearchParams 조립 URL은 401을 반환하는 사례가 있어,
    // 인증키는 추가 인코딩하지 않고 servicekey(raw) 우선으로 사용합니다.
    const apiUrl = buildEvApiUrl({ endpoint: EV_ENDPOINT, key, keyParam: 'servicekey', pageNo: 1, numOfRows: MAX_ROWS, zcode, zscode, dataType: 'JSON' });

    const regionResult = await fetchRegionData(apiUrl, { key, zcode, zscode, waitUntil });
    const data = regionResult.data;
    const items = extractItems(data).map((item) => normalizeCharger(item, { lat, lng }));
    const filtered = items
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .filter((item) => item.distanceM <= radius)
      .filter((item) => !chargerType || item.typeCode === chargerType || item.typeLabel.includes(chargerType))
      .filter((item) => speed !== 'rapid' || item.isRapid)
      .filter((item) => speed !== 'slow' || !item.isRapid)
      .filter((item) => !freeParking || item.parkingFree === true)
      .filter((item) => !noLimit || item.limitYn === false)
      .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM)
      .slice(0, 120);

    return json({
      ok: true,
      checkedAt: new Date().toISOString(),
      center: { lat, lng, radius, sido, zcode, zscode },
      cache: regionResult.cache,
      totalInRegion: items.length,
      count: filtered.length,
      chargers: groupByStation(filtered).slice(0, 60),
      rawItems: filtered.slice(0, 80)
    });
  } catch (error) {
    return json({ ok: false, message: error?.message || '전기차 충전소 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}

function normalizeCharger(item, center) {
  const lat = toNumber(item.lat || item.LAT, NaN);
  const lng = toNumber(item.lng || item.LNG, NaN);
  const stat = String(item.stat ?? item.STAT ?? '').trim();
  const typeCode = String(item.chgerType ?? item.CHGER_TYPE ?? '').padStart(2, '0');
  const output = toNumber(item.output || item.OUTPUT, 0);
  const distanceM = distance(center.lat, center.lng, lat, lng);
  const isAvailable = stat === '2';
  const isRapid = output >= 40 || ['01', '03', '04', '05', '06'].includes(typeCode);
  const parkingFree = normalizeBoolean(item.parkingFree || item.PARKING_FREE);
  const limitYn = normalizeBoolean(item.limitYn || item.LIMIT_YN);
  const updatedAt = String(item.statUpdDt || item.STAT_UPD_DT || '').trim();
  const score = buildScore({ isAvailable, stat, distanceM, isRapid, parkingFree, limitYn, updatedAt });
  return {
    stationId: String(item.statId || item.STAT_ID || ''),
    chargerId: String(item.chgerId || item.CHGER_ID || ''),
    name: String(item.statNm || item.STAT_NM || '충전소').trim(),
    address: String(item.addr || item.ADDR || '').trim(),
    locationDetail: String(item.location || item.LOCATION || '').trim(),
    useTime: String(item.useTime || item.USE_TIME || '').trim(),
    business: String(item.bnm || item.BNM || item.busiNm || '').trim(),
    operator: String(item.busiNm || item.BUSI_NM || item.bnm || '').trim(),
    typeCode,
    typeLabel: TYPE_LABELS[typeCode] || `타입 ${typeCode}`,
    output,
    method: String(item.method || item.METHOD || '').trim(),
    stat,
    statLabel: STATUS_LABELS[stat] || '상태 정보 없음',
    isAvailable,
    isRapid,
    parkingFree,
    limitYn,
    note: String(item.note || item.NOTE || '').trim(),
    lat,
    lng,
    distanceM,
    updatedAt: formatDateTime(updatedAt),
    score,
    raw: item
  };
}

function groupByStation(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.stationId || `${item.name}-${item.address}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: item.name,
        address: item.address,
        useTime: item.useTime,
        business: item.business || item.operator,
        lat: item.lat,
        lng: item.lng,
        distanceM: item.distanceM,
        parkingFree: item.parkingFree,
        limitYn: item.limitYn,
        updatedAt: item.updatedAt,
        chargers: [],
        availableCount: 0,
        chargingCount: 0,
        troubleCount: 0,
        unknownCount: 0,
        rapidCount: 0,
        slowCount: 0,
        bestScore: item.score
      });
    }
    const group = map.get(key);
    group.chargers.push(item);
    group.distanceM = Math.min(group.distanceM, item.distanceM);
    group.bestScore = Math.max(group.bestScore, item.score);
    group.availableCount += item.isAvailable ? 1 : 0;
    group.chargingCount += item.stat === '3' ? 1 : 0;
    group.troubleCount += ['1', '4', '5'].includes(item.stat) ? 1 : 0;
    group.unknownCount += item.stat === '9' || !item.stat ? 1 : 0;
    group.rapidCount += item.isRapid ? 1 : 0;
    group.slowCount += item.isRapid ? 0 : 1;
    if (!group.updatedAt && item.updatedAt) group.updatedAt = item.updatedAt;
  }
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      statusTone: group.availableCount > 0 ? 'good' : (group.chargingCount > 0 ? 'busy' : (group.troubleCount > 0 ? 'bad' : 'unknown')),
      availabilityLabel: group.availableCount > 0 ? '사용 가능성 높음' : (group.chargingCount > 0 ? '충전 중 확인 필요' : '상태 확인 필요')
    }))
    .sort((a, b) => b.bestScore - a.bestScore || a.distanceM - b.distanceM);
}

function buildScore({ isAvailable, stat, distanceM, isRapid, parkingFree, limitYn, updatedAt }) {
  let score = 60;
  if (isAvailable) score += 35;
  if (stat === '3') score += 8;
  if (['1', '4', '5'].includes(stat)) score -= 35;
  if (stat === '9' || !stat) score -= 18;
  if (isRapid) score += 8;
  if (parkingFree) score += 5;
  if (limitYn === false) score += 5;
  if (limitYn === true) score -= 8;
  if (Number.isFinite(distanceM)) score += Math.max(-25, 18 - distanceM / 250);
  if (updatedAt) score += 3;
  return Math.round(score);
}


async function fetchRegionData(apiUrl, { key, zcode, zscode, waitUntil }) {
  const cacheId = `zcode=${encodeURIComponent(zcode || '')}&zscode=${encodeURIComponent(zscode || '')}&rows=${MAX_ROWS}`;
  const cacheKey = new Request(`https://hannuncheck.internal/ev-charger-region?${cacheId}`);
  const canUseCache = typeof caches !== 'undefined' && caches.default;

  if (canUseCache) {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const cachedText = await cached.text();
      try {
        return { data: JSON.parse(cachedText), cache: { hit: true, ttlSeconds: REGION_CACHE_TTL_SECONDS, scope: zscode ? 'sigungu' : 'sido' } };
      } catch {
        // 손상된 캐시는 무시하고 최신 데이터를 다시 요청합니다.
      }
    }
  }

  const data = await fetchJsonWithFallback(apiUrl, { key, zcode, zscode, timeoutMs: API_TIMEOUT_MS });
  if (canUseCache) {
    const response = new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${REGION_CACHE_TTL_SECONDS}`,
        'x-hannuncheck-cache-scope': zscode ? 'sigungu' : 'sido',
        'x-hannuncheck-cache-created-at': new Date().toISOString()
      }
    });
    // 캐시 저장 실패가 사용자 응답을 막지 않도록 백그라운드로 처리합니다.
    try {
      if (typeof waitUntil === 'function') waitUntil(caches.default.put(cacheKey, response.clone()));
      else await caches.default.put(cacheKey, response.clone());
    } catch {
      try { await caches.default.put(cacheKey, response.clone()); } catch {}
    }
  }
  return { data, cache: { hit: false, ttlSeconds: REGION_CACHE_TTL_SECONDS, scope: zscode ? 'sigungu' : 'sido' } };
}

function buildEvApiUrl({ endpoint, key, keyParam, pageNo, numOfRows, zcode, zscode, dataType }) {
  const params = [
    `${keyParam}=${cleanApiKey(key)}`,
    `pageNo=${encodeURIComponent(String(pageNo || 1))}`,
    `numOfRows=${encodeURIComponent(String(numOfRows || MAX_ROWS))}`,
    zcode ? `zcode=${encodeURIComponent(String(zcode))}` : '',
    zscode ? `zscode=${encodeURIComponent(String(zscode))}` : '',
    `dataType=${encodeURIComponent(String(dataType || 'JSON'))}`
  ].filter(Boolean).join('&');
  return `${endpoint}?${params}`;
}

async function fetchJsonWithFallback(primaryUrl, { key, zcode, zscode, timeoutMs }) {
  const candidates = [
    primaryUrl,
    buildEvApiUrl({ endpoint: EV_ENDPOINT, key, keyParam: 'serviceKey', pageNo: 1, numOfRows: MAX_ROWS, zcode, zscode, dataType: 'JSON' }),
    buildEvApiUrl({ endpoint: EV_ENDPOINT_HTTP, key, keyParam: 'servicekey', pageNo: 1, numOfRows: MAX_ROWS, zcode, zscode, dataType: 'JSON' }),
    buildEvApiUrl({ endpoint: EV_ENDPOINT_HTTP, key, keyParam: 'serviceKey', pageNo: 1, numOfRows: MAX_ROWS, zcode, zscode, dataType: 'JSON' })
  ];
  let lastError = null;
  for (const url of unique(candidates)) {
    try {
      return await fetchJson(url, { timeoutMs });
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      if (!/401|Unauthorized|SERVICE_KEY|인증|KEY/i.test(message)) break;
    }
  }
  throw lastError || new Error('전기차 충전소 API 요청에 실패했습니다.');
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || API_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  let response;
  try {
    // PowerShell 성공 호출과 최대한 비슷하게 만들기 위해 불필요한 custom header를 넣지 않습니다.
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError' || String(error?.message || '').includes('timeout')) {
      throw new Error('전기차 충전소 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const preview = typeof text === 'string' ? text.replace(/\s+/g, ' ').slice(0, 400) : '';
    throw new Error(`전기차 충전소 API 응답 오류가 발생했습니다. (${response.status}) ${preview}`);
  }
  if (typeof data?.raw === 'string' && data.raw.includes('<OpenAPI_ServiceResponse>')) {
    throw new Error('공공데이터포털 API 키 승인 또는 요청 파라미터를 확인해 주세요.');
  }
  return data || {};
}

function extractItems(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || data?.items?.item || data?.items || [];
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') return [items];
  return [];
}

function normalizeBoolean(value) {
  const text = String(value ?? '').trim().toUpperCase();
  if (['Y', 'YES', 'TRUE', '1', '무료', '가능'].includes(text)) return true;
  if (['N', 'NO', 'FALSE', '0', '유료', '불가'].includes(text)) return false;
  return null;
}

function normalizeSido(value) {
  const text = String(value || '').trim();
  const aliases = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원', 강원도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주' };
  return aliases[text] || text || '서울';
}

function distance(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDateTime(value) {
  const text = String(value || '').replace(/\D/g, '');
  if (text.length < 12) return value || '';
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}`;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function getEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function cleanApiKey(value) { return String(value || '').trim().replace(/^['\"]|['\"]$/g, ''); }
function unique(list) { return Array.from(new Set(list.filter(Boolean))); }
