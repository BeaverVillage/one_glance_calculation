#!/usr/bin/env node
/*
 * 한눈체크 공중화장실 최종 지도 캐시 생성 스크립트
 *
 * 실행 순서:
 *   node scripts/prepare-public-toilet-addresses.js
 *   $env:KAKAO_REST_API_KEY="카카오_REST_API_키"
 *   node scripts/geocode-public-toilets.js
 *   node scripts/build-public-toilet-cache.js
 *
 * 출력:
 *   assets/data/life/public-toilets/index.json
 *   assets/data/life/public-toilets/{region}/{district}.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v117-life-public-toilet-region-repair';
const args = parseArgs(process.argv.slice(2));
const CACHE_DIR = path.resolve(ROOT, args.cache || 'cache/public-toilets');
const OUTPUT_DIR = path.resolve(ROOT, args.output || 'assets/data/life/public-toilets');
const PREPARED_FILE = path.join(CACHE_DIR, 'prepared-items.json');
const SUCCESS_FILE = path.join(CACHE_DIR, 'geocode-success.json');
const FAILED_FILE = path.join(CACHE_DIR, 'geocode-failed.json');
const ALLOW_PARTIAL = Boolean(args['allow-partial']);
const MAX_FILTER_VALUES = 200;

const ORDERED_REGIONS = [
  'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
  'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju', 'unknown',
];

const REGION_LABELS = {
  seoul: { key: 'seoul', label: '서울', full: '서울특별시' },
  busan: { key: 'busan', label: '부산', full: '부산광역시' },
  daegu: { key: 'daegu', label: '대구', full: '대구광역시' },
  incheon: { key: 'incheon', label: '인천', full: '인천광역시' },
  gwangju: { key: 'gwangju', label: '광주', full: '광주광역시' },
  daejeon: { key: 'daejeon', label: '대전', full: '대전광역시' },
  ulsan: { key: 'ulsan', label: '울산', full: '울산광역시' },
  sejong: { key: 'sejong', label: '세종', full: '세종특별자치시' },
  gyeonggi: { key: 'gyeonggi', label: '경기', full: '경기도' },
  gangwon: { key: 'gangwon', label: '강원', full: '강원특별자치도' },
  chungbuk: { key: 'chungbuk', label: '충북', full: '충청북도' },
  chungnam: { key: 'chungnam', label: '충남', full: '충청남도' },
  jeonbuk: { key: 'jeonbuk', label: '전북', full: '전북특별자치도' },
  jeonnam: { key: 'jeonnam', label: '전남', full: '전라남도' },
  gyeongbuk: { key: 'gyeongbuk', label: '경북', full: '경상북도' },
  gyeongnam: { key: 'gyeongnam', label: '경남', full: '경상남도' },
  jeju: { key: 'jeju', label: '제주', full: '제주특별자치도' },
  unknown: { key: 'unknown', label: '기타', full: '기타' },
};

const REGION_TOKEN_MAP = new Map([
  ['서울', 'seoul'], ['서울특별시', 'seoul'],
  ['부산', 'busan'], ['부산광역시', 'busan'],
  ['대구', 'daegu'], ['대구광역시', 'daegu'],
  ['인천', 'incheon'], ['인천광역시', 'incheon'],
  ['광주', 'gwangju'], ['광주광역시', 'gwangju'],
  ['대전', 'daejeon'], ['대전광역시', 'daejeon'],
  ['울산', 'ulsan'], ['울산광역시', 'ulsan'],
  ['세종', 'sejong'], ['세종특별자치시', 'sejong'],
  ['경기', 'gyeonggi'], ['경기도', 'gyeonggi'],
  ['강원', 'gangwon'], ['강원도', 'gangwon'], ['강원특별자치도', 'gangwon'],
  ['충북', 'chungbuk'], ['충청북도', 'chungbuk'],
  ['충남', 'chungnam'], ['충청남도', 'chungnam'],
  ['전북', 'jeonbuk'], ['전라북도', 'jeonbuk'], ['전북특별자치도', 'jeonbuk'],
  ['전남', 'jeonnam'], ['전라남도', 'jeonnam'],
  ['경북', 'gyeongbuk'], ['경상북도', 'gyeongbuk'],
  ['경남', 'gyeongnam'], ['경상남도', 'gyeongnam'],
  ['제주', 'jeju'], ['제주도', 'jeju'], ['제주특별자치도', 'jeju'],
]);

main();

function main() {
  const prepared = readJson(PREPARED_FILE, null);
  const success = readJson(SUCCESS_FILE, null);
  const failed = readJson(FAILED_FILE, { items: {} });
  const items = Array.isArray(prepared?.items) ? prepared.items : [];
  const geocoded = success?.items && typeof success.items === 'object' ? success.items : {};

  if (!items.length) {
    console.error('[public-toilet-cache] prepared-items.json이 없습니다. 먼저 prepare-public-toilet-addresses.js를 실행하세요.');
    process.exit(1);
  }
  const successCount = Object.keys(geocoded).length;
  if (!successCount && !ALLOW_PARTIAL) {
    console.error('[public-toilet-cache] geocode-success.json에 성공 좌표가 없습니다. 먼저 geocode-public-toilets.js를 실행하세요.');
    console.error('테스트용 빈 캐시가 필요한 경우에만 --allow-partial을 붙이세요.');
    process.exit(1);
  }

  const grouped = new Map();
  const stats = {
    preparedItems: items.length,
    geocodeSuccessTargets: successCount,
    geocodeFailedTargets: Object.keys(failed?.items || {}).length,
    normalized: 0,
    skippedNoGeocode: 0,
    invalidCoords: 0,
    openAlways: 0,
    openScheduled: 0,
    openUnknown: 0,
    hasDisabledToilet: 0,
    hasBabyChanging: 0,
    hasEmergencyBell: 0,
    hasCctv: 0,
  };
  const categoryCounter = new Map();
  const openCounter = new Map();

  for (const source of items) {
    const point = geocoded[source.targetId];
    if (!point) {
      stats.skippedNoGeocode += 1;
      continue;
    }
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!isValidKoreaCoordinate(lat, lng)) {
      stats.invalidCoords += 1;
      continue;
    }
    const locationSource = [
      point.matchedAddress,
      point.roadAddress,
      point.lotAddress,
      point.sourceAddress,
      point.address,
      source.roadAddress,
      source.lotAddress,
      source.address,
    ].filter(Boolean).join(' ');
    const resolvedRegion = inferRegionFromAddress(locationSource) || REGION_LABELS[source.regionKey] || REGION_LABELS.unknown;
    const resolvedDistrict = inferDistrictFromAddress(locationSource, resolvedRegion.key) || sanitizeDistrict(source.district, resolvedRegion.key) || '기타';
    const item = {
      ...source,
      regionKey: resolvedRegion.key,
      region: resolvedRegion.label,
      regionFull: resolvedRegion.full,
      district: resolvedDistrict,
      lat,
      lng,
      geocode: {
        provider: point.provider || 'kakao-local-address',
        sourceAddress: point.sourceAddress || point.address || source.address,
        matchedAddress: point.matchedAddress || '',
      },
    };
    if (!grouped.has(item.regionKey)) grouped.set(item.regionKey, new Map());
    const regionDistricts = grouped.get(item.regionKey);
    const districtName = item.district || '기타';
    if (!regionDistricts.has(districtName)) regionDistricts.set(districtName, []);
    regionDistricts.get(districtName).push(item);
    incrementCounter(categoryCounter, item.category || '구분 확인 필요');
    incrementCounter(openCounter, item.details?.openType || '운영시간 확인 필요');
    if (item.details?.openType === '상시개방') stats.openAlways += 1;
    else if (item.details?.openType === '정시개방') stats.openScheduled += 1;
    else stats.openUnknown += 1;
    if (item.details?.hasDisabledToilet) stats.hasDisabledToilet += 1;
    if (item.details?.hasBabyChanging) stats.hasBabyChanging += 1;
    if (item.details?.hasEmergencyBell) stats.hasEmergencyBell += 1;
    if (item.details?.hasCctv) stats.hasCctv += 1;
    stats.normalized += 1;
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const regionIndex = [];

  for (const regionKey of ORDERED_REGIONS) {
    const districtMap = grouped.get(regionKey);
    if (!districtMap || !districtMap.size) continue;
    const regionInfo = REGION_LABELS[regionKey] || REGION_LABELS.unknown;
    const regionDir = path.join(OUTPUT_DIR, regionKey);
    fs.mkdirSync(regionDir, { recursive: true });
    const districts = [];
    const districtNames = Array.from(districtMap.keys()).sort(compareKoreanText);
    districtNames.forEach((districtName, districtIndex) => {
      const districtKey = `d${String(districtIndex + 1).padStart(3, '0')}`;
      const districtFile = `${regionKey}/${districtKey}.json`;
      const districtItems = (districtMap.get(districtName) || []).sort(compareByPlace).map((item, itemIndex) => ({
        ...item,
        districtKey,
        id: item.id || `toilet-${regionKey}-${districtKey}-${String(itemIndex + 1).padStart(6, '0')}`,
      }));
      writeJson(path.join(OUTPUT_DIR, districtFile), {
        version: VERSION,
        type: 'public-toilet-district',
        generatedAt,
        region: regionInfo,
        district: { key: districtKey, label: districtName },
        count: districtItems.length,
        items: districtItems,
      });
      districts.push({ key: districtKey, label: districtName, file: districtFile, count: districtItems.length });
    });
    const regionCount = districts.reduce((sum, district) => sum + district.count, 0);
    regionIndex.push({ ...regionInfo, count: regionCount, districts });
  }

  const index = {
    version: VERSION,
    type: 'public-toilet',
    generatedAt,
    totalItems: stats.normalized,
    regions: regionIndex,
    filters: {
      categories: topCounterValues(categoryCounter, MAX_FILTER_VALUES),
      openTypes: topCounterValues(openCounter, MAX_FILTER_VALUES),
    },
    stats,
  };
  writeJson(path.join(OUTPUT_DIR, 'index.json'), index);
  console.log('[public-toilet-cache] done');
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_DIR),
    totalItems: index.totalItems,
    regions: index.regions.length,
    districtFiles: index.regions.reduce((sum, region) => sum + region.districts.length, 0),
    ...stats,
  }, null, 2));
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.length ? rest.join('=') : true;
  }
  return out;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`, 'utf8');
}

function isValidKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.5 && lng >= 123 && lng <= 132.5;
}

function inferRegionFromAddress(value) {
  const tokens = normalizeAddressText(value).split(/\s+/).filter(Boolean);
  for (const token of tokens.slice(0, 4)) {
    const key = REGION_TOKEN_MAP.get(token);
    if (key) return REGION_LABELS[key];
  }
  return null;
}

function inferDistrictFromAddress(value, regionKey) {
  const text = normalizeAddressText(value);
  if (!text) return '';
  if (regionKey === 'sejong') return '세종시';
  const tokens = text.split(/\s+/).map((token) => sanitizeDistrict(token, regionKey)).filter(Boolean);
  const candidates = tokens.filter((token) => isLikelyDistrict(token, regionKey));
  if (!candidates.length) return '';
  if (['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan'].includes(regionKey)) {
    return candidates.find((token) => /[구군]$/.test(token)) || candidates[0];
  }
  if (regionKey === 'jeju') return candidates.find((token) => /시$/.test(token)) || candidates[0];
  return candidates.find((token) => /[시군]$/.test(token)) || candidates[0];
}

function sanitizeDistrict(value, regionKey = '') {
  const text = normalizeAddressText(value).split(/\s+/)[0] || '';
  if (!text) return '';
  if (regionKey === 'sejong' && /세종/.test(text)) return '세종시';
  const cleaned = text
    .replace(/^[\[({<]+/, '')
    .replace(/[\])}>.,，].*$/, '')
    .replace(/[^가-힣0-9·]/g, '')
    .trim();
  if (!cleaned || cleaned.length < 2 || /^\d+$/.test(cleaned)) return '';
  if (/^(서울|부산|대구|인천|광주|대전|울산|경기|강원|충북|충남|전북|전남|경북|경남|제주|기타|경기도|강원도|경상남도|제주특별자치도)$/.test(cleaned)) return '';
  if (/대로|로\d|길\d|번길|지하|\d/.test(cleaned) && !/[시군구]$/.test(cleaned)) return '';
  if (!isLikelyDistrict(cleaned, regionKey)) return '';
  return cleaned;
}

function isLikelyDistrict(value, regionKey = '') {
  const text = String(value || '').trim();
  if (!text || text.length > 12) return false;
  if (regionKey === 'sejong' && text === '세종시') return true;
  if (/[시군구]$/.test(text)) return true;
  return false;
}

function normalizeAddressText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[?]+/g, ' ')
    .replace(/[(),，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareKoreanText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'ko-KR');
}

function compareByPlace(a, b) {
  return compareKoreanText(a.name, b.name) || compareKoreanText(a.address, b.address);
}

function incrementCounter(counter, label) {
  const key = String(label || '').trim() || '확인 필요';
  counter.set(key, (counter.get(key) || 0) + 1);
}

function topCounterValues(counter, limit) {
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || compareKoreanText(a.label, b.label))
    .slice(0, limit);
}
