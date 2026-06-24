#!/usr/bin/env node
/*
 * 공중화장실 지도 캐시 지역/시군구 라벨 보정 스크립트
 *
 * 목적:
 * - 고속도로 휴게소명, 도로명 등에 포함된 "서울" 문자열 때문에 서울 지역으로 오분류된 항목을 보정한다.
 * - 이미 생성된 assets/data/life/public-toilets 캐시를 읽어 지역/시군구별 파일을 다시 쓴다.
 * - 카카오 지오코딩을 다시 실행하지 않고, 기존 좌표 캐시 결과만 재분류한다.
 *
 * 실행:
 *   node scripts/repair-public-toilet-cache-region-labels.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'assets/data/life/public-toilets');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');
const VERSION = 'v117-life-public-toilet-region-repair';
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
  if (!fs.existsSync(INDEX_FILE)) {
    console.error('[repair-public-toilet-cache] index.json을 찾지 못했습니다.');
    process.exit(1);
  }
  const oldIndex = readJson(INDEX_FILE);
  const allItems = [];
  for (const region of oldIndex.regions || []) {
    for (const district of region.districts || []) {
      const file = path.join(CACHE_DIR, district.file);
      if (!fs.existsSync(file)) continue;
      const payload = readJson(file);
      for (const item of payload.items || []) allItems.push(item);
    }
  }
  if (!allItems.length) {
    console.error('[repair-public-toilet-cache] 재분류할 항목이 없습니다.');
    process.exit(1);
  }

  const grouped = new Map();
  const categoryCounter = new Map();
  const openCounter = new Map();
  const stats = {
    ...(oldIndex.stats || {}),
    normalized: 0,
    openAlways: 0,
    openScheduled: 0,
    openUnknown: 0,
    hasDisabledToilet: 0,
    hasBabyChanging: 0,
    hasEmergencyBell: 0,
    hasCctv: 0,
    repairedRegionLabels: 0,
  };

  for (const source of allItems) {
    const locationSource = buildLocationSource(source);
    const resolvedRegion = inferRegionFromAddress(locationSource) || REGION_LABELS[source.regionKey] || REGION_LABELS.unknown;
    const resolvedDistrict = inferDistrictFromAddress(locationSource, resolvedRegion.key) || sanitizeDistrict(source.district, resolvedRegion.key) || '기타';
    if (source.regionKey !== resolvedRegion.key || source.district !== resolvedDistrict) stats.repairedRegionLabels += 1;
    const item = {
      ...source,
      regionKey: resolvedRegion.key,
      region: resolvedRegion.label,
      regionFull: resolvedRegion.full,
      district: resolvedDistrict,
    };
    if (!grouped.has(item.regionKey)) grouped.set(item.regionKey, new Map());
    const regionDistricts = grouped.get(item.regionKey);
    if (!regionDistricts.has(item.district)) regionDistricts.set(item.district, []);
    regionDistricts.get(item.district).push(item);
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

  const generatedAt = new Date().toISOString();
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const regionIndex = [];

  for (const regionKey of ORDERED_REGIONS) {
    const districtMap = grouped.get(regionKey);
    if (!districtMap || !districtMap.size) continue;
    const regionInfo = REGION_LABELS[regionKey] || REGION_LABELS.unknown;
    const regionDir = path.join(CACHE_DIR, regionKey);
    fs.mkdirSync(regionDir, { recursive: true });
    const districts = [];
    const districtNames = Array.from(districtMap.keys()).sort(compareKoreanText);
    districtNames.forEach((districtName, districtIndex) => {
      const districtKey = `d${String(districtIndex + 1).padStart(3, '0')}`;
      const districtFile = `${regionKey}/${districtKey}.json`;
      const districtItems = (districtMap.get(districtName) || []).sort(compareByPlace).map((item, itemIndex) => ({
        ...item,
        districtKey,
        id: `toilet-${regionKey}-${districtKey}-${String(itemIndex + 1).padStart(6, '0')}`,
      }));
      writeJson(path.join(CACHE_DIR, districtFile), {
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
    ...oldIndex,
    version: VERSION,
    generatedAt,
    totalItems: stats.normalized,
    regions: regionIndex,
    filters: {
      categories: topCounterValues(categoryCounter, MAX_FILTER_VALUES),
      openTypes: topCounterValues(openCounter, MAX_FILTER_VALUES),
    },
    stats,
  };
  writeJson(INDEX_FILE, index);
  console.log('[repair-public-toilet-cache] done');
  console.log(JSON.stringify({
    output: path.relative(ROOT, CACHE_DIR),
    totalItems: index.totalItems,
    regions: index.regions.length,
    districtFiles: index.regions.reduce((sum, region) => sum + region.districts.length, 0),
    repairedRegionLabels: stats.repairedRegionLabels,
  }, null, 2));
}

function buildLocationSource(item) {
  return [
    item?.geocode?.matchedAddress,
    item?.geocode?.sourceAddress,
    item?.roadAddress,
    item?.lotAddress,
    item?.address,
  ].filter(Boolean).join(' ');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`, 'utf8');
}

function inferRegionFromAddress(value) {
  const tokens = tokenizeAddress(value);
  for (const token of tokens.slice(0, 4)) {
    const key = REGION_TOKEN_MAP.get(token);
    if (key) return REGION_LABELS[key];
  }
  return null;
}

function inferDistrictFromAddress(value, regionKey) {
  const tokens = tokenizeAddress(value);
  if (!tokens.length) return '';
  if (regionKey === 'sejong') return '세종시';
  const cleanedTokens = tokens.map((token) => sanitizeDistrict(token, regionKey)).filter(Boolean);
  if (['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan'].includes(regionKey)) {
    return cleanedTokens.find((token) => /[구군]$/.test(token)) || '';
  }
  if (regionKey === 'jeju') return cleanedTokens.find((token) => /시$/.test(token)) || cleanedTokens.find((token) => /[시군]$/.test(token)) || '';
  return cleanedTokens.find((token) => /[시군]$/.test(token)) || '';
}

function sanitizeDistrict(value, regionKey = '') {
  const text = String(value || '').trim()
    .replace(/^[\[({<]+/, '')
    .replace(/[\])}>.,，].*$/, '')
    .replace(/[^가-힣0-9·]/g, '')
    .trim();
  if (!text || text.length < 2 || /^\d+$/.test(text)) return '';
  if (regionKey === 'sejong' && /세종/.test(text)) return '세종시';
  if (REGION_TOKEN_MAP.has(text)) return '';
  if (/^(기타|특별시|광역시|특별자치시|특별자치도)$/.test(text)) return '';
  if (/대로|로\d|길\d|번길|지하|휴게소|방향/.test(text) && !/[시군구]$/.test(text)) return '';
  if (!isLikelyDistrict(text, regionKey)) return '';
  return text;
}

function isLikelyDistrict(value, regionKey = '') {
  const text = String(value || '').trim();
  if (!text || text.length > 12) return false;
  if (regionKey === 'sejong' && text === '세종시') return true;
  return /[시군구]$/.test(text);
}

function tokenizeAddress(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[?]+/g, ' ')
    .replace(/[(),，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
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
