#!/usr/bin/env node
/*
 * 국립중앙의료원 응급실·병의원·약국 → 카카오맵 장소 링크 로컬 캐시 생성 스크립트
 *
 * 사용 예:
 *   node scripts/enrich-medical-kakao-places.js --mode=emergency --region=대전 --limit=100
 *   node scripts/enrich-medical-kakao-places.js --mode=hospital --region=대전 --district=서구 --limit=100
 *   node scripts/enrich-medical-kakao-places.js --mode=pharmacy --region=대전 --limit=100
 *   node scripts/enrich-medical-kakao-places.js --mode=all --region=대전 --limit=300
 *
 * 필요한 환경변수:
 *   KAKAO_REST_API_KEY=카카오 REST API 키
 *   NMC_EMERGENCY_API_KEY=국립중앙의료원 응급의료기관 키
 *   NMC_HOSPITAL_API_KEY=국립중앙의료원 병의원 찾기 키
 *   NMC_PHARMACY_API_KEY=국립중앙의료원 약국 정보 키
 *
 * 출력:
 *   assets/data/medical/kakao-place-cache.json
 *
 * 전국 응급실 기본정보 캐시를 입력으로 사용할 때:
 *   node scripts/enrich-medical-kakao-places.js --mode=emergency --source=assets/data/medical/emergency-national-cache.json
 *
 * 주의:
 *   이 스크립트는 로컬/빌드 단계에서만 카카오 Local API를 호출합니다.
 *   사이트 런타임에서는 이 JSON 캐시와 카카오맵 검색 URL만 사용합니다.
 *   병상, 중증질환 수용, 야간 운영 여부 같은 상태 정보는 캐시하지 않습니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE_PATH = path.join(ROOT, 'assets/data/medical/kakao-place-cache.json');
const DEFAULT_SOURCE_CACHE_PATH = path.join(ROOT, 'assets/data/medical/emergency-national-cache.json');
const KAKAO_LOCAL_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const VERSION = 'v94-medical-kakao-place-cache';
const DEFAULT_DELAY_MS = 240;
const DEFAULT_RADIUS_METERS = 700;
const HIGH_SCORE = 82;
const MEDIUM_SCORE = 68;

const REGION_ALIASES = {
  all: '', 전국: '',
  서울: '서울특별시', 서울특별시: '서울특별시',
  부산: '부산광역시', 부산광역시: '부산광역시',
  대구: '대구광역시', 대구광역시: '대구광역시',
  인천: '인천광역시', 인천광역시: '인천광역시',
  광주: '광주광역시', 광주광역시: '광주광역시',
  대전: '대전광역시', 대전광역시: '대전광역시',
  울산: '울산광역시', 울산광역시: '울산광역시',
  세종: '세종특별자치시', 세종특별자치시: '세종특별자치시',
  경기: '경기도', 경기도: '경기도',
  강원: '강원특별자치도', 강원도: '강원특별자치도', 강원특별자치도: '강원특별자치도',
  충북: '충청북도', 충청북도: '충청북도',
  충남: '충청남도', 충청남도: '충청남도',
  전북: '전북특별자치도', 전라북도: '전북특별자치도', 전북특별자치도: '전북특별자치도',
  전남: '전라남도', 전라남도: '전라남도',
  경북: '경상북도', 경상북도: '경상북도',
  경남: '경상남도', 경상남도: '경상남도',
  제주: '제주특별자치도', 제주도: '제주특별자치도', 제주특별자치도: '제주특별자치도',
};

const SERVICE_CONFIG = {
  emergency: {
    label: '응급실',
    envKeys: ['NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY', 'PUBLIC_DATA_API_KEY'],
    endpoint: 'https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire',
    params: (ctx) => ({ ServiceKey: ctx.key, pageNo: '1', numOfRows: String(ctx.rows), _type: 'json', STAGE1: ctx.region, STAGE2: ctx.district }),
  },
  hospital: {
    label: '야간 병원',
    envKeys: ['NMC_HOSPITAL_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY', 'PUBLIC_DATA_API_KEY'],
    endpoint: 'https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire',
    params: (ctx) => ({ ServiceKey: ctx.key, pageNo: '1', numOfRows: String(ctx.rows), Q0: ctx.region, Q1: ctx.district, QT: ctx.qt, QD: ctx.department, QN: ctx.keyword, ORD: 'NAME' }),
  },
  pharmacy: {
    label: '야간 약국',
    envKeys: ['NMC_PHARMACY_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY', 'PUBLIC_DATA_API_KEY'],
    endpoint: 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire',
    params: (ctx) => ({ ServiceKey: ctx.key, pageNo: '1', numOfRows: String(ctx.rows), Q0: ctx.region, Q1: ctx.district, QT: ctx.qt, QN: ctx.keyword, ORD: 'NAME' }),
  },
};

loadDotEnv(path.join(ROOT, '.env.local'));
loadDotEnv(path.join(ROOT, '.env'));

const args = parseArgs(process.argv.slice(2));
const kakaoKey = process.env.KAKAO_REST_API_KEY || '';

if (!kakaoKey) {
  console.error('KAKAO_REST_API_KEY가 필요합니다. 루트 .env.local 또는 환경변수에 REST API 키를 넣어 주세요.');
  process.exit(1);
}

main().catch((error) => {
  console.error('[medical-kakao-cache] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});

async function main() {
  const cache = loadExistingCache();
  const entries = cache.entries || {};
  const selectedModes = args.mode === 'all' ? ['emergency', 'hospital', 'pharmacy'] : [args.mode || 'emergency'];
  const region = normalizeRegion(args.region || (args.source ? '전국' : '서울'));
  const district = String(args.district || '').trim();
  const qt = String(args.qt || getTodayQt()).replace(/[^0-9]/g, '') || getTodayQt();
  const rows = Number.isFinite(args.rows) ? Math.max(10, Math.min(args.rows, 1000)) : 200;
  const limit = args.limit > 0 ? args.limit : Number.POSITIVE_INFINITY;
  const delayMs = Number.isFinite(args.delay) ? Math.max(0, args.delay) : DEFAULT_DELAY_MS;
  const force = Boolean(args.force);
  const dryRun = Boolean(args.dryRun);
  const today = new Date().toISOString().slice(0, 10);

  const stats = { collected: 0, processed: 0, skipped: 0, high: 0, medium: 0, low: 0, notFound: 0, missingData: 0, apiError: 0 };

  const candidates = [];
  const sourcePath = args.source ? path.resolve(ROOT, String(args.source)) : '';
  if (sourcePath) {
    const sourceCandidates = loadSourceCandidates(sourcePath, { mode: args.mode || 'emergency', region, district, keyword: args.keyword || '' });
    candidates.push(...dedupeCandidates(sourceCandidates));
    console.log(`[source] ${path.relative(ROOT, sourcePath)}에서 ${sourceCandidates.length}개 후보를 읽었습니다.`);
  } else {
    for (const mode of selectedModes) {
      const config = SERVICE_CONFIG[mode];
      if (!config) throw new Error(`지원하지 않는 mode입니다: ${mode}`);
      const key = firstEnv(config.envKeys);
      if (!key) {
        console.warn(`[${mode}] API 키가 없어 수집을 건너뜁니다. 필요 키: ${config.envKeys.join(', ')}`);
        continue;
      }
      const rowsFromApi = await fetchNmcCandidates({ mode, config, key, region, district, qt, rows, department: args.department || '', keyword: args.keyword || '' });
      candidates.push(...dedupeCandidates(rowsFromApi));
    }
  }

  stats.collected = candidates.length;

  for (const item of candidates) {
    const cacheKey = buildCacheKey(item);
    if (!force && entries[cacheKey] && entries[cacheKey].matchType !== 'api_error') {
      stats.skipped += 1;
      continue;
    }
    if (stats.processed >= limit) break;

    stats.processed += 1;
    const result = await matchMedicalPlace(item, today);
    entries[cacheKey] = result;

    if (result.matchType === 'high') stats.high += 1;
    else if (result.matchType === 'medium') stats.medium += 1;
    else if (result.matchType === 'low') stats.low += 1;
    else if (result.matchType === 'not_found') stats.notFound += 1;
    else if (result.matchType === 'missing_data') stats.missingData += 1;
    else if (result.matchType === 'api_error') stats.apiError += 1;

    console.log(`${stats.processed}. [${result.matchType}] ${item.type} ${item.name} → ${result.matchedName || result.kakaoSearchUrl || result.message || ''} (${result.score || 0})`);
    if (delayMs > 0) await sleep(delayMs);
  }

  const payload = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    meta: {
      version: VERSION,
      type: 'medical',
      source: 'Kakao Local API 로컬 장소 매칭 캐시',
      updatedAt: new Date().toISOString(),
      modes: selectedModes,
      region,
      district,
      totalEntries: Object.keys(entries).length,
      collectedThisRun: stats.collected,
      processedThisRun: stats.processed,
      skippedThisRun: stats.skipped,
      matched: Object.values(entries).filter((entry) => ['high', 'medium'].includes(entry.matchType)).length,
      highThisRun: stats.high,
      mediumThisRun: stats.medium,
      lowConfidenceThisRun: stats.low,
      notFoundThisRun: stats.notFound,
      missingDataThisRun: stats.missingData,
      apiErrorThisRun: stats.apiError,
      note: '의료기관 카카오맵 장소 바로가기 캐시입니다. 병상·중증질환 수용·운영 여부는 캐시하지 않습니다.',
    },
    entries,
  };

  if (!dryRun) {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  }

  console.log('[medical-kakao-cache] done:', payload.meta);
  if (dryRun) console.log('[medical-kakao-cache] dry-run 모드라 파일을 쓰지 않았습니다.');
}


function loadSourceCandidates(sourcePath, { mode = 'emergency', region = '', district = '', keyword = '' } = {}) {
  if (!fs.existsSync(sourcePath)) throw new Error(`source 파일을 찾을 수 없습니다: ${sourcePath}`);
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const rawEntries = payload.entries || payload.items || [];
  const entries = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);
  const selectedMode = mode === 'all' ? '' : mode;
  const normalizedRegion = normalizeRegion(region || '');
  const normalizedDistrict = String(district || '').trim();
  const normalizedKeyword = normalizeForMatch(keyword || '');
  return entries
    .map((entry, index) => normalizeSourceCacheItem(entry, selectedMode || entry.type || 'emergency', index + 1))
    .filter((item) => item.sourceId && item.name)
    .filter((item) => !selectedMode || item.type === selectedMode)
    .filter((item) => {
      if (normalizedRegion && !(item.address || '').includes(normalizedRegion) && item.region !== normalizedRegion) return false;
      if (normalizedDistrict && !(item.address || '').includes(normalizedDistrict)) return false;
      if (normalizedKeyword) {
        const haystack = normalizeForMatch(`${item.name} ${item.address}`);
        if (!haystack.includes(normalizedKeyword)) return false;
      }
      return true;
    });
}

function normalizeSourceCacheItem(entry = {}, type = 'emergency', rank = 0) {
  const sourceId = firstText(entry, ['sourceId', 'id', 'hpid', 'HPID']) || `${type}-${rank}`;
  const normalizedType = entry.type || entry.kind || type || 'emergency';
  return {
    sourceId,
    type: normalizedType,
    name: firstText(entry, ['name', 'dutyName', 'hospitalName', 'pharmacyName']),
    address: firstText(entry, ['address', 'dutyAddr', 'addr']),
    region: firstText(entry, ['sido', 'region']) || extractRegion(entry.address || ''),
    lat: firstNumber(entry, ['lat', 'wgs84Lat', 'latitude', 'dutyLat']),
    lng: firstNumber(entry, ['lng', 'wgs84Lon', 'longitude', 'dutyLon']),
  };
}

async function fetchNmcCandidates({ mode, config, key, region, district, qt, rows, department, keyword }) {
  const params = config.params({ key, region, district, qt, rows, department, keyword });
  const url = new URL(config.endpoint);
  Object.entries(params).forEach(([paramKey, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') url.searchParams.set(paramKey, String(value));
  });
  console.log(`[${mode}] NMC 후보 수집:`, url.toString().replace(/ServiceKey=[^&]+/i, 'ServiceKey=****'));
  const text = await fetchText(url.toString(), { headers: { Accept: 'application/json, text/xml;q=0.9, */*;q=0.8' } });
  const apiRows = extractItems(parsePayload(text));
  return apiRows.map((row, index) => normalizeMedicalItem(row, mode, index + 1)).filter((item) => item.sourceId && item.name);
}

async function matchMedicalPlace(item, today) {
  const searchUrl = buildKakaoSearchUrl(item);
  if (!item.name || !item.address) {
    return baseCacheEntry(item, { type: 'missing_data', today, searchUrl, message: 'name-or-address-missing' });
  }
  const queries = buildKakaoPlaceQueries(item);
  let best = null;
  try {
    for (const query of queries) {
      const docs = await fetchKakaoCandidates(query, item);
      for (const doc of docs) {
        const scored = scoreKakaoCandidate(item, doc);
        if (!scored) continue;
        if (!best || scored.score > best.score) best = { ...scored, query };
      }
      if (best?.score >= HIGH_SCORE) break;
    }
  } catch (error) {
    return baseCacheEntry(item, { type: 'api_error', today, searchUrl, message: error?.message || String(error) });
  }
  if (!best) return baseCacheEntry(item, { type: 'not_found', today, searchUrl, message: 'no-candidate' });

  const confidence = best.score >= HIGH_SCORE ? 'high' : best.score >= MEDIUM_SCORE ? 'medium' : 'low';
  return {
    ...baseCacheEntry(item, { type: confidence, today, searchUrl }),
    kakaoPlaceId: String(best.doc.id || ''),
    kakaoPlaceUrl: confidence === 'high' || confidence === 'medium' ? best.doc.place_url || '' : '',
    matchedName: best.doc.place_name || '',
    matchedAddress: best.doc.road_address_name || best.doc.address_name || '',
    matchedCategory: best.doc.category_name || '',
    matchQuery: best.query,
    score: best.score,
    distanceM: best.distanceM,
    confidence,
  };
}

function baseCacheEntry(item, { type, today, searchUrl, message = '' }) {
  return {
    cacheKey: buildCacheKey(item),
    sourceKey: `${item.type}:${item.sourceId}`,
    sourceId: item.sourceId,
    type: item.type,
    name: item.name,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    kakaoPlaceId: '',
    kakaoPlaceUrl: '',
    kakaoSearchUrl: searchUrl || buildKakaoSearchUrl(item),
    matchedName: '',
    matchedAddress: '',
    matchedCategory: '',
    matchType: type,
    confidence: type,
    score: 0,
    matchedAt: today,
    message,
  };
}

function buildKakaoPlaceQueries(item) {
  const name = normalizeText(item.name);
  const address = normalizeText(item.address);
  const district = extractDistrict(address);
  const region = extractRegion(address) || item.region || '';
  const suffix = item.type === 'pharmacy' ? '약국' : '병원';
  const normalizedName = name.includes(suffix) ? name : `${name} ${suffix}`;
  const queries = [
    [region, district, normalizedName].filter(Boolean).join(' '),
    [district, normalizedName].filter(Boolean).join(' '),
    [address, normalizedName].filter(Boolean).join(' '),
    normalizedName,
    name,
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 5);
}

async function fetchKakaoCandidates(query, item) {
  const url = new URL(KAKAO_LOCAL_ENDPOINT);
  url.searchParams.set('query', query);
  if (isValidLatLng(item.lat, item.lng)) {
    url.searchParams.set('x', String(item.lng));
    url.searchParams.set('y', String(item.lat));
    url.searchParams.set('radius', String(DEFAULT_RADIUS_METERS));
    url.searchParams.set('sort', 'distance');
  }
  url.searchParams.set('page', '1');
  url.searchParams.set('size', '10');
  const text = await fetchText(url.toString(), { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
  const data = JSON.parse(text);
  return Array.isArray(data.documents) ? data.documents : [];
}

function scoreKakaoCandidate(item, doc) {
  const candidateName = normalizeText(doc.place_name || '');
  const candidateAddress = normalizeText(doc.road_address_name || doc.address_name || '');
  if (!candidateName) return null;
  const category = normalizeText(doc.category_name || '');
  const targetName = normalizeText(item.name);
  const targetAddress = normalizeText(item.address);
  const nameScore = similarity(normalizeForMatch(targetName), normalizeForMatch(candidateName));
  const distanceM = isValidLatLng(item.lat, item.lng) && isValidLatLng(Number(doc.y), Number(doc.x))
    ? haversineDistanceM(Number(item.lat), Number(item.lng), Number(doc.y), Number(doc.x))
    : Number.POSITIVE_INFINITY;

  let score = Math.round(nameScore * 62);
  if (sameDistrict(targetAddress, candidateAddress)) score += 18;
  else if (sameRegion(targetAddress, candidateAddress)) score += 9;
  if (/병원|의원|의료|약국/.test(category)) score += 10;
  if (item.type === 'pharmacy' && /약국/.test(category + candidateName)) score += 10;
  if (item.type !== 'pharmacy' && /병원|의원|의료/.test(category + candidateName)) score += 10;
  if (Number.isFinite(distanceM)) {
    if (distanceM <= 150) score += 12;
    else if (distanceM <= 300) score += 8;
    else if (distanceM <= 500) score += 4;
    else if (distanceM > 1000) score -= 14;
  }
  if (item.type === 'emergency' && score < HIGH_SCORE) score -= 4;
  return { doc, score: Math.max(0, Math.min(100, score)), distanceM: Number.isFinite(distanceM) ? Math.round(distanceM) : null };
}

function normalizeMedicalItem(row, type, rank) {
  const name = firstText(row, ['dutyName', 'DUTY_NAME', 'dutyNm', 'hospName', 'yadmNm']);
  const address = firstText(row, ['dutyAddr', 'DUTY_ADDR', 'addr', 'address']);
  const sourceId = firstText(row, ['hpid', 'HPID', 'id']) || `${type}-${rank}`;
  return {
    sourceId,
    type,
    name,
    address,
    region: extractRegion(address),
    lat: firstNumber(row, ['wgs84Lat', 'WGS84_LAT', 'lat', 'latitude', 'dutyLat']),
    lng: firstNumber(row, ['wgs84Lon', 'WGS84_LON', 'lon', 'lng', 'longitude', 'dutyLon']),
  };
}

function buildCacheKey(item) {
  return `${item.type}:${item.sourceId}`;
}

function buildKakaoSearchUrl(item) {
  return `https://map.kakao.com/link/search/${encodeURIComponent(`${item.name || ''} ${item.address || ''}`.trim())}`;
}

function loadExistingCache() {
  if (!fs.existsSync(CACHE_PATH)) return { entries: {} };
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) || { entries: {} };
  } catch {
    return { entries: {} };
  }
}

function dedupeCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.sourceId || item.name}:${item.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parsePayload(text) {
  const body = String(text || '').trim();
  if (!body) return {};
  try { return JSON.parse(body); } catch (_) {}
  const itemBlocks = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return { response: { body: { items: { item: itemBlocks.map(xmlItemToObject) } } } };
}

function xmlItemToObject(block) {
  const object = {};
  for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) object[match[1]] = decodeXml(match[2]);
  return object;
}

function extractItems(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || data?.items?.item || data?.items || [];
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') return [items];
  return [];
}

function decodeXml(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function firstText(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = Number(String(row?.[key] ?? '').replace(/,/g, ''));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function normalizeRegion(value) {
  const raw = String(value || '').trim();
  return REGION_ALIASES[raw] ?? raw;
}

function extractRegion(address) {
  const raw = String(address || '');
  return Object.values(REGION_ALIASES).filter(Boolean).find((region) => raw.includes(region)) || Object.keys(REGION_ALIASES).find((region) => region && raw.includes(region)) || '';
}

function extractDistrict(address) {
  const match = String(address || '').match(/([가-힣]+(?:시|군|구))/);
  return match ? match[1] : '';
}

function sameRegion(a, b) {
  const ar = extractRegion(a);
  const br = extractRegion(b);
  return ar && br && ar === br;
}

function sameDistrict(a, b) {
  const ad = extractDistrict(a);
  const bd = extractDistrict(b);
  return ad && bd && ad === bd;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeForMatch(value) {
  return normalizeText(value).replace(/[\s()\[\]{}·.,-]/g, '').replace(/의료법인|사회복지법인|학교법인|재단법인|병원|의원|약국|응급실/g, '');
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.88;
  const bigrams = (text) => {
    const result = new Set();
    for (let i = 0; i < text.length - 1; i += 1) result.add(text.slice(i, i + 2));
    return result;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  const intersection = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size || 1;
  return intersection / union;
}

function isValidLatLng(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  return Number.isFinite(y) && Number.isFinite(x) && y >= 30 && y <= 45 && x >= 120 && x <= 135;
}

function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTodayQt(date = new Date()) {
  const day = date.getDay();
  return String(day === 0 ? 7 : day);
}

function firstEnv(keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return '';
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 120)}`);
  return text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = { mode: 'emergency' };
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const raw = match[2] === undefined ? true : match[2];
    if (['limit', 'delay', 'rows'].includes(key)) out[key] = Number(raw);
    else out[key] = raw;
  }
  if (!['all', 'emergency', 'hospital', 'pharmacy'].includes(out.mode)) out.mode = 'emergency';
  return out;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
