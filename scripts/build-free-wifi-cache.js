#!/usr/bin/env node
/*
 * 한눈체크 무료와이파이정보 CSV → 로컬 JSON 캐시 생성 스크립트
 *
 * 기본 입력:
 *   data/source/free-wifi.csv
 *   data/source/무료와이파이정보.csv
 *   무료와이파이정보.csv
 *
 * 실행 예시:
 *   node scripts/build-free-wifi-cache.js
 *   node scripts/build-free-wifi-cache.js --input="C:\\Users\\kjw39\\Desktop\\무료와이파이정보.csv"
 *
 * 기본 출력:
 *   assets/data/life/free-wifi/index.json
 *   assets/data/life/free-wifi/{region}/{district}.json
 */

const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v111-life-free-wifi-cache-phase5';
const args = parseArgs(process.argv.slice(2));
const DEFAULT_INPUTS = [
  path.join(ROOT, 'data/source/free-wifi.csv'),
  path.join(ROOT, 'data/source/무료와이파이정보.csv'),
  path.join(ROOT, '무료와이파이정보.csv'),
];
const OUTPUT_DIR = path.resolve(ROOT, args.output || 'assets/data/life/free-wifi');
const MAX_FILTER_VALUES = 200;

const REGION_MAP = {
  '서울특별시': { key: 'seoul', label: '서울', full: '서울특별시' },
  '서울': { key: 'seoul', label: '서울', full: '서울특별시' },
  '부산광역시': { key: 'busan', label: '부산', full: '부산광역시' },
  '부산': { key: 'busan', label: '부산', full: '부산광역시' },
  '대구광역시': { key: 'daegu', label: '대구', full: '대구광역시' },
  '대구': { key: 'daegu', label: '대구', full: '대구광역시' },
  '인천광역시': { key: 'incheon', label: '인천', full: '인천광역시' },
  '인천': { key: 'incheon', label: '인천', full: '인천광역시' },
  '광주광역시': { key: 'gwangju', label: '광주', full: '광주광역시' },
  '광주': { key: 'gwangju', label: '광주', full: '광주광역시' },
  '대전광역시': { key: 'daejeon', label: '대전', full: '대전광역시' },
  '대전': { key: 'daejeon', label: '대전', full: '대전광역시' },
  '울산광역시': { key: 'ulsan', label: '울산', full: '울산광역시' },
  '울산': { key: 'ulsan', label: '울산', full: '울산광역시' },
  '세종특별자치시': { key: 'sejong', label: '세종', full: '세종특별자치시' },
  '세종시': { key: 'sejong', label: '세종', full: '세종특별자치시' },
  '세종': { key: 'sejong', label: '세종', full: '세종특별자치시' },
  '경기도': { key: 'gyeonggi', label: '경기', full: '경기도' },
  '경기': { key: 'gyeonggi', label: '경기', full: '경기도' },
  '강원특별자치도': { key: 'gangwon', label: '강원', full: '강원특별자치도' },
  '강원도': { key: 'gangwon', label: '강원', full: '강원특별자치도' },
  '강원': { key: 'gangwon', label: '강원', full: '강원특별자치도' },
  '충청북도': { key: 'chungbuk', label: '충북', full: '충청북도' },
  '충북': { key: 'chungbuk', label: '충북', full: '충청북도' },
  '충청남도': { key: 'chungnam', label: '충남', full: '충청남도' },
  '충남': { key: 'chungnam', label: '충남', full: '충청남도' },
  '전북특별자치도': { key: 'jeonbuk', label: '전북', full: '전북특별자치도' },
  '전라북도': { key: 'jeonbuk', label: '전북', full: '전북특별자치도' },
  '전북': { key: 'jeonbuk', label: '전북', full: '전북특별자치도' },
  '전라남도': { key: 'jeonnam', label: '전남', full: '전라남도' },
  '전남': { key: 'jeonnam', label: '전남', full: '전라남도' },
  '경상북도': { key: 'gyeongbuk', label: '경북', full: '경상북도' },
  '경북': { key: 'gyeongbuk', label: '경북', full: '경상북도' },
  '경상남도': { key: 'gyeongnam', label: '경남', full: '경상남도' },
  '경남': { key: 'gyeongnam', label: '경남', full: '경상남도' },
  '제주특별자치도': { key: 'jeju', label: '제주', full: '제주특별자치도' },
  '제주도': { key: 'jeju', label: '제주', full: '제주특별자치도' },
  '제주': { key: 'jeju', label: '제주', full: '제주특별자치도' },
};

const ORDERED_REGIONS = [
  'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
  'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju', 'unknown',
];

main();

function main() {
  const input = resolveInput(args.input);
  if (!input) {
    console.error('[free-wifi-cache] 입력 CSV를 찾지 못했습니다. --input="경로"를 지정하거나 data/source/free-wifi.csv를 두세요.');
    process.exit(1);
  }

  const csvText = readCsvText(input);
  const rows = parseCsv(csvText);
  const grouped = new Map();
  const seen = new Set();
  const stats = {
    raw: rows.length,
    normalized: 0,
    skippedNoName: 0,
    skippedNoCoords: 0,
    invalidCoords: 0,
    duplicates: 0,
    unknownRegion: 0,
    unknownDistrict: 0,
    hasSsid: 0,
    noSsid: 0,
  };
  const facilityCounter = new Map();
  const providerCounter = new Map();

  for (const row of rows) {
    const item = normalizeWifiRow(row, stats);
    if (!item) continue;
    if (!item.hasCoordinates) {
      stats.skippedNoCoords += 1;
      continue;
    }
    if (!isValidKoreaCoordinate(item.lat, item.lng)) {
      stats.invalidCoords += 1;
      continue;
    }
    const dedupeKey = [
      item.sourceId || '',
      item.name,
      item.placeDetail,
      item.details.ssid,
      item.lat,
      item.lng,
    ].map((v) => String(v || '').trim()).join('|');
    if (seen.has(dedupeKey)) {
      stats.duplicates += 1;
      continue;
    }
    seen.add(dedupeKey);
    if (!grouped.has(item.regionKey)) grouped.set(item.regionKey, new Map());
    const regionDistricts = grouped.get(item.regionKey);
    const districtBucketKey = item.district || '기타';
    if (!regionDistricts.has(districtBucketKey)) regionDistricts.set(districtBucketKey, []);
    regionDistricts.get(districtBucketKey).push(item);
    incrementCounter(facilityCounter, item.details.facilityType || '시설 구분 확인 필요');
    incrementCounter(providerCounter, item.details.provider || '제공사 확인 필요');
    if (item.details.ssid) stats.hasSsid += 1;
    else stats.noSsid += 1;
    stats.normalized += 1;
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const regionIndex = [];

  for (const regionKey of ORDERED_REGIONS) {
    const districtMap = grouped.get(regionKey);
    if (!districtMap || !districtMap.size) continue;
    const regionInfo = regionFromKey(regionKey, districtMap);
    const regionDir = path.join(OUTPUT_DIR, regionKey);
    fs.mkdirSync(regionDir, { recursive: true });
    const districts = [];
    const districtNames = Array.from(districtMap.keys()).sort(compareKoreanText);
    districtNames.forEach((districtName, districtIndex) => {
      const districtKey = `d${String(districtIndex + 1).padStart(3, '0')}`;
      const items = districtMap.get(districtName) || [];
      items.sort(compareByPlace);
      items.forEach((item, index) => {
        item.id = `wifi-${regionKey}-${districtKey}-${String(index + 1).padStart(5, '0')}`;
        item.districtKey = districtKey;
      });
      const file = `${regionKey}/${districtKey}.json`;
      const payload = {
        version: VERSION,
        generatedAt,
        type: 'free-wifi',
        region: regionInfo,
        district: { key: districtKey, label: districtName, count: items.length },
        items,
      };
      fs.writeFileSync(path.join(OUTPUT_DIR, file), `${JSON.stringify(payload)}\n`, 'utf8');
      districts.push({ key: districtKey, label: districtName, count: items.length, file });
    });
    const count = districts.reduce((sum, district) => sum + district.count, 0);
    regionIndex.push({ ...regionInfo, count, districts });
  }

  const index = {
    version: VERSION,
    generatedAt,
    type: 'free-wifi',
    source: '지방행정 인허가 데이터 무료와이파이정보 CSV(localdata.go.kr)',
    input: path.relative(ROOT, input).replace(/\\/g, '/'),
    totalItems: regionIndex.reduce((sum, region) => sum + region.count, 0),
    stats,
    filters: {
      facilityTypes: topCounterValues(facilityCounter, MAX_FILTER_VALUES),
      providers: topCounterValues(providerCounter, MAX_FILTER_VALUES),
      ssid: { has: stats.hasSsid, missing: stats.noSsid },
    },
    regions: regionIndex,
    note: '좌표가 유효한 무료 와이파이 지점만 지도용 로컬 캐시에 포함했습니다. 와이파이 이름·운영 상태·접속 가능 여부는 현장 상황에 따라 달라질 수 있습니다.',
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), `${JSON.stringify(index)}\n`, 'utf8');

  console.log('[free-wifi-cache] done');
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_DIR),
    ...index.stats,
    totalItems: index.totalItems,
    regions: index.regions.length,
    districtFiles: index.regions.reduce((sum, region) => sum + region.districts.length, 0),
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

function resolveInput(inputArg) {
  const candidates = inputArg ? [path.resolve(ROOT, inputArg)] : DEFAULT_INPUTS;
  return candidates.find((file) => fs.existsSync(file)) || '';
}

function readCsvText(file) {
  const buffer = fs.readFileSync(file);
  const utf8 = buffer.toString('utf8');
  if (utf8.includes('설치장소명') && utf8.includes('와이파이SSID')) return utf8.replace(/^\uFEFF/, '');
  return new TextDecoder('windows-949').decode(buffer).replace(/^\uFEFF/, '');
}

function parseCsv(text) {
  const rows = [];
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      records.push(row);
      field = '';
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  const header = records.shift()?.map(cleanHeader) || [];
  for (const record of records) {
    if (!record.some((value) => cleanText(value))) continue;
    const obj = {};
    header.forEach((key, index) => { obj[key] = record[index] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function normalizeWifiRow(row, stats) {
  const name = cleanText(row['설치장소명']);
  if (!name) {
    stats.skippedNoName += 1;
    return null;
  }
  const lat = toNumber(row['WGS84위도']);
  const lng = toNumber(row['WGS84경도']);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  const regionInfo = inferRegion(cleanText(row['설치시도명']) || cleanText(row['소재지도로명주소']) || cleanText(row['소재지지번주소']));
  if (regionInfo.key === 'unknown') stats.unknownRegion += 1;
  const district = cleanDistrict(row['설치시군구명']) || inferDistrict(row['소재지도로명주소']) || inferDistrict(row['소재지지번주소']) || '기타';
  if (district === '기타') stats.unknownDistrict += 1;
  const roadAddress = cleanText(row['소재지도로명주소']);
  const lotAddress = cleanText(row['소재지지번주소']);
  const address = roadAddress || lotAddress || [regionInfo.full, district, cleanText(row['설치장소상세'])].filter(Boolean).join(' ');
  const ssid = normalizeSsid(row['와이파이SSID']);
  const facilityType = cleanText(row['설치시설구분명']);
  const provider = cleanText(row['서비스제공사명']);
  const phone = normalizePhone(row['관리기관전화번호']);
  const badges = buildBadges({ ssid, facilityType, provider });

  return {
    id: '',
    sourceId: cleanText(row['관리번호']) || cleanText(row['개방자치단체코드']),
    name,
    placeDetail: cleanText(row['설치장소상세']),
    regionKey: regionInfo.key,
    region: regionInfo.label,
    regionFull: regionInfo.full,
    district,
    districtKey: '',
    address,
    roadAddress,
    lotAddress,
    lat,
    lng,
    hasCoordinates,
    phone,
    badges,
    details: {
      ssid,
      facilityType,
      provider,
      manager: cleanText(row['관리기관명']),
      installedMonth: normalizeInstallMonth(row['설치연월']),
      dataDate: cleanText(row['데이터기준일자']),
    },
  };
}

function buildBadges({ ssid, facilityType, provider }) {
  const badges = [];
  badges.push(ssid ? '와이파이 이름 있음' : '와이파이 이름 확인 필요');
  if (facilityType) badges.push(facilityType);
  if (provider) badges.push(provider.length > 16 ? `${provider.slice(0, 16)}…` : provider);
  return badges.slice(0, 4);
}

function normalizeSsid(value) {
  return cleanText(value)
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ');
}

function normalizeInstallMonth(value) {
  const text = cleanText(value).replace(/[^0-9]/g, '');
  if (text.length === 6) return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
  if (text.length === 4) return text;
  return cleanText(value);
}

function cleanHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  const text = cleanText(value).replace(/,/g, '');
  if (!text) return NaN;
  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

function isValidKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.5 && lng >= 123 && lng <= 132.5;
}

function normalizePhone(value) {
  const text = cleanText(value);
  if (!text) return '';
  const first = text.split(/[\/,;]/)[0].trim();
  const digits = first.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return first;
}

function inferRegion(text) {
  const source = cleanText(text);
  if (!source) return { key: 'unknown', label: '기타', full: '기타' };
  const firstToken = source.split(/\s+/)[0];
  return REGION_MAP[source] || REGION_MAP[firstToken] || { key: 'unknown', label: '기타', full: '기타' };
}

function regionFromKey(key) {
  return Object.values(REGION_MAP).find((region) => region.key === key) || { key, label: '기타', full: '기타' };
}

function cleanDistrict(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text.replace(/[,，].*$/, '').trim();
}

function inferDistrict(value) {
  const text = cleanText(value);
  if (!text) return '';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts[0]?.includes('세종')) return '세종시';
  return cleanDistrict(parts[1] || '');
}

function compareKoreanText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'ko-KR');
}

function compareByPlace(a, b) {
  return compareKoreanText(a.name, b.name) || compareKoreanText(a.placeDetail, b.placeDetail) || compareKoreanText(a.details.ssid, b.details.ssid);
}

function incrementCounter(counter, label) {
  const key = cleanText(label) || '확인 필요';
  counter.set(key, (counter.get(key) || 0) + 1);
}

function topCounterValues(counter, limit) {
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || compareKoreanText(a.label, b.label))
    .slice(0, limit);
}
