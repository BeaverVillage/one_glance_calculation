#!/usr/bin/env node
/*
 * 한눈체크 낚시터정보 CSV → 로컬 JSON 캐시 생성 스크립트
 *
 * 기본 입력:
 *   data/source/fishing-spots.csv
 *   data/source/낚시터정보.csv
 *   낚시터정보.csv
 *
 * 실행 예시:
 *   node scripts/build-fishing-cache.js
 *   node scripts/build-fishing-cache.js --input="C:\\data\\낚시터정보.csv"
 *
 * 기본 출력:
 *   assets/data/life/fishing-spots/index.json
 *   assets/data/life/fishing-spots/{region}.json
 */

const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v128-life-fishing-cache-location-repair';
const args = parseArgs(process.argv.slice(2));
const DEFAULT_INPUTS = [
  path.join(ROOT, 'data/source/fishing-spots.csv'),
  path.join(ROOT, 'data/source/낚시터정보.csv'),
  path.join(ROOT, '낚시터정보.csv'),
];
const OUTPUT_DIR = path.resolve(ROOT, args.output || 'assets/data/life/fishing-spots');

const MANUAL_COORDINATE_FIXES = [
  {
    sourceId: '202640100001000007',
    matchName: '군자 낚시터',
    matchAddressIncludes: '시흥',
    lat: 37.3596892325045,
    lng: 126.807925280972,
    reason: '원본 CSV 경도 오류 보정',
  },
  {
    matchAddressIncludes: '서산시 대산읍 화곡리 1891',
    lat: 37.0044351477144,
    lng: 126.452296151466,
    reason: '원본 CSV 좌표 오류 보정(서산 대산읍 화곡리 1891)',
  },
  {
    matchAddressIncludes: '서산시 대산읍 화곡리 1845',
    lat: 37.0044351477144,
    lng: 126.452296151466,
    reason: '원본 CSV 좌표 오류 보정(서산 대산읍 화곡리 1845)',
  },
];

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
    console.error('[fishing-cache] 입력 CSV를 찾지 못했습니다. --input="경로"를 지정하거나 data/source/fishing-spots.csv를 두세요.');
    process.exit(1);
  }

  const csvText = readCsvText(input);
  const rows = parseCsv(csvText);
  const grouped = new Map();
  const seen = new Set();
  const stats = { raw: rows.length, normalized: 0, skippedNoName: 0, skippedNoCoords: 0, duplicates: 0, unknownRegion: 0 };

  for (const row of rows) {
    const item = normalizeFishingRow(row, stats);
    if (!item) continue;
    if (!item.hasCoordinates) {
      stats.skippedNoCoords += 1;
      continue;
    }
    const dedupeKey = [item.name, item.address, item.lat, item.lng].map((v) => String(v || '').trim()).join('|');
    if (seen.has(dedupeKey)) {
      stats.duplicates += 1;
      continue;
    }
    seen.add(dedupeKey);
    if (!grouped.has(item.regionKey)) grouped.set(item.regionKey, []);
    grouped.get(item.regionKey).push(item);
    stats.normalized += 1;
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const regionIndex = [];

  for (const key of ORDERED_REGIONS) {
    const items = grouped.get(key) || [];
    if (!items.length) continue;
    items.sort(compareByName);
    items.forEach((item, index) => {
      item.id = `fishing-${key}-${String(index + 1).padStart(5, '0')}`;
    });
    const regionInfo = regionFromKey(key, items[0]);
    const districts = summarizeDistricts(items);
    const payload = {
      version: VERSION,
      generatedAt,
      type: 'fishing-spots',
      region: { ...regionInfo, count: items.length, districts },
      items,
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, `${key}.json`), `${JSON.stringify(payload)}\n`, 'utf8');
    regionIndex.push({ ...regionInfo, count: items.length, districts: districts.slice(0, 120), file: `${key}.json` });
  }

  const index = {
    version: VERSION,
    generatedAt,
    type: 'fishing-spots',
    source: '지방행정 인허가 데이터 낚시터정보 CSV(localdata.go.kr)',
    input: path.relative(ROOT, input).replace(/\\/g, '/'),
    totalItems: regionIndex.reduce((sum, region) => sum + region.count, 0),
    stats,
    regions: regionIndex,
    note: '좌표가 있는 낚시터만 지도용 로컬 캐시에 포함했습니다. 요금·운영·시설 정보는 원천 데이터 기준 참고 정보이며 방문 전 전화 확인이 필요합니다.',
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), `${JSON.stringify(index)}\n`, 'utf8');

  console.log('[fishing-cache] done');
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT_DIR), ...index.stats, totalItems: index.totalItems, regions: index.regions.length }, null, 2));
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
  if (utf8.includes('낚시터명') && utf8.includes('WGS84')) return utf8.replace(/^\uFEFF/, '');
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
    if (!record.some((v) => cleanText(v))) continue;
    const obj = {};
    header.forEach((key, index) => { obj[key] = record[index] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function normalizeFishingRow(row, stats) {
  const name = cleanText(row['낚시터명']);
  if (!name) {
    stats.skippedNoName += 1;
    return null;
  }
  let lat = toNumber(row['WGS84위도']);
  let lng = toNumber(row['WGS84경도']);
  const roadAddress = cleanText(row['소재지도로명주소']);
  const lotAddress = cleanText(row['소재지지번주소']);
  const address = roadAddress || lotAddress;
  const sourceId = cleanText(row['관리번호']) || cleanText(row['개방자치단체코드']);
  const coordinateFix = findManualCoordinateFix({ sourceId, name, address, roadAddress, lotAddress });
  if (coordinateFix) {
    lat = coordinateFix.lat;
    lng = coordinateFix.lng;
  }
  const regionInfo = inferRegion(address);
  if (regionInfo.key === 'unknown') stats.unknownRegion += 1;
  const phone = normalizePhone(row['낚시터전화번호']) || normalizePhone(row['관리기관전화번호']);
  const fishTypes = splitList(row['주요어종']);
  const fee = cleanText(row['이용요금']);
  const type = cleanText(row['낚시터유형']);
  const waterFacilityType = cleanText(row['수상시설물유형']);
  const capacity = cleanText(row['최대수용인원']);
  const area = cleanText(row['수면적']);
  const safetyFacilities = cleanText(row['안전시설현황']);
  const convenienceFacilities = cleanText(row['편익시설현황']);
  const nearbyTourism = cleanText(row['주변관광지']);
  const manager = cleanText(row['관리기관명']);
  const updatedAt = cleanText(row['데이터기준일자'] || row['최종수정시점']);
  const badges = buildBadges({ type, waterFacilityType, fee, phone, fishTypes, safetyFacilities, convenienceFacilities });

  return {
    id: '',
    sourceId,
    name,
    region: regionInfo.label,
    regionFull: regionInfo.full,
    regionKey: regionInfo.key,
    district: inferDistrict(address, regionInfo),
    address,
    roadAddress,
    lotAddress,
    lat,
    lng,
    hasCoordinates: isKoreaCoordinate(lat, lng),
    coordinateFixed: Boolean(coordinateFix),
    coordinateFixReason: coordinateFix?.reason || '',
    phone,
    badges,
    searchText: [name, address, type, waterFacilityType, fishTypes.join(' '), fee, safetyFacilities, convenienceFacilities, nearbyTourism, manager].join(' ').toLowerCase(),
    details: {
      type,
      waterFacilityType,
      fishTypes,
      fee,
      capacity,
      area,
      safetyFacilities,
      convenienceFacilities,
      nearbyTourism,
      manager,
      updatedAt,
    },
  };
}

function findManualCoordinateFix({ sourceId, name, address, roadAddress, lotAddress }) {
  const text = [name, address, roadAddress, lotAddress].map(cleanText).join(' ');
  return MANUAL_COORDINATE_FIXES.find((fix) => {
    const sourceMatches = fix.sourceId && sourceId === fix.sourceId;
    const nameMatches = !fix.matchName || text.includes(fix.matchName);
    const addressMatches = !fix.matchAddressIncludes || text.includes(fix.matchAddressIncludes);
    return sourceMatches || (nameMatches && addressMatches);
  }) || null;
}

function buildBadges({ type, waterFacilityType, fee, phone, fishTypes, safetyFacilities, convenienceFacilities }) {
  const badges = [];
  if (type) badges.push(type);
  if (waterFacilityType && waterFacilityType !== type) badges.push(waterFacilityType);
  if (fishTypes?.length) badges.push(`${fishTypes[0]} 어종`);
  if (fee) badges.push('요금정보');
  if (phone) badges.push('전화가능');
  if (safetyFacilities) badges.push('안전시설');
  if (convenienceFacilities) badges.push('편의시설');
  return [...new Set(badges.map(cleanText).filter(Boolean))].slice(0, 6);
}

function inferRegion(address) {
  const first = cleanText(address).split(/\s+/)[0] || '';
  return REGION_MAP[first] || REGION_MAP[first.replace(/특별자치도|특별자치시|광역시|특별시|도|시$/g, '')] || { key: 'unknown', label: '기타', full: '기타' };
}

function inferDistrict(address, regionInfo) {
  const parts = cleanText(address).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return '';
  if (regionInfo.key === 'sejong') return '세종';
  return parts[1] || '';
}

function regionFromKey(key, sample = {}) {
  if (sample?.regionKey === key) return { key, label: sample.region, full: sample.regionFull };
  const found = Object.values(REGION_MAP).find((region) => region.key === key);
  return found || { key, label: '기타', full: '기타' };
}

function summarizeDistricts(items) {
  const counts = new Map();
  for (const item of items) {
    const name = item.district || '미분류';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR')).map(([name, count]) => ({ name, count }));
}

function compareByName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR') || String(a.address || '').localeCompare(String(b.address || ''), 'ko-KR');
}

function splitList(value) {
  return cleanText(value)
    .split(/[,+·ㆍ/]|\s{2,}/)
    .map((v) => cleanText(v))
    .filter(Boolean)
    .slice(0, 10);
}

function toNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Number(number.toFixed(7)) : null;
}

function isKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.5 && lng >= 123 && lng <= 132.5;
}

function cleanHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function cleanText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();
}

function normalizePhone(value) {
  const text = cleanText(value);
  if (!text) return '';
  const first = text.split(/[\/;,]/)[0].trim();
  if (!/[0-9]/.test(first)) return '';
  return first.replace(/[^0-9+\-]/g, '').replace(/-{2,}/g, '-');
}
