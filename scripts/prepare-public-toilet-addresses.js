#!/usr/bin/env node
/*
 * 한눈체크 공중화장실정보 CSV → 주소 정리/지오코딩 대상 생성 스크립트
 *
 * 기본 입력:
 *   data/source/public-toilets.csv
 *   data/source/공중화장실정보.csv
 *   공중화장실정보.csv
 *
 * 실행 예시:
 *   node scripts/prepare-public-toilet-addresses.js
 *   node scripts/prepare-public-toilet-addresses.js --input="C:\\Users\\kjw39\\Desktop\\공중화장실정보.csv"
 *
 * 기본 출력:
 *   cache/public-toilets/prepared-items.json
 *   cache/public-toilets/geocode-targets.json
 *   cache/public-toilets/prepare-summary.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v114-public-toilet-prepare-phase8';
const args = parseArgs(process.argv.slice(2));
const DEFAULT_INPUTS = [
  path.join(ROOT, 'data/source/public-toilets.csv'),
  path.join(ROOT, 'data/source/공중화장실정보.csv'),
  path.join(ROOT, '공중화장실정보.csv'),
];
const CACHE_DIR = path.resolve(ROOT, args.output || 'cache/public-toilets');
const MAX_TARGET_SAMPLE = 20;

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

main();

function main() {
  const input = resolveInput(args.input);
  if (!input) {
    console.error('[public-toilet-prepare] 입력 CSV를 찾지 못했습니다. --input="경로"를 지정하거나 data/source/public-toilets.csv를 두세요.');
    process.exit(1);
  }

  const csvText = readCsvText(input);
  const rows = parseCsv(csvText);
  const stats = {
    raw: rows.length,
    normalized: 0,
    skippedNoName: 0,
    skippedNoAddress: 0,
    unknownRegion: 0,
    unknownDistrict: 0,
    targetCount: 0,
    itemTargetLinked: 0,
    openAlways: 0,
    openScheduled: 0,
    openUnknown: 0,
    hasDisabledToilet: 0,
    hasBabyChanging: 0,
    hasEmergencyBell: 0,
    hasCctv: 0,
  };
  const items = [];
  const targetMap = new Map();

  rows.forEach((row, index) => {
    const item = normalizeToiletRow(row, index, stats);
    if (!item) return;
    items.push(item);
    const target = targetMap.get(item.targetId) || {
      targetId: item.targetId,
      address: item.address,
      candidateAddresses: item.candidateAddresses,
      roadAddress: item.roadAddress,
      lotAddress: item.lotAddress,
      regionKey: item.regionKey,
      region: item.region,
      district: item.district,
      representativeName: item.name,
      itemIds: [],
    };
    target.itemIds.push(item.id);
    targetMap.set(item.targetId, target);
    stats.normalized += 1;
    stats.itemTargetLinked += 1;
    if (item.details.openType === '상시개방') stats.openAlways += 1;
    else if (item.details.openType === '정시개방') stats.openScheduled += 1;
    else stats.openUnknown += 1;
    if (item.details.hasDisabledToilet) stats.hasDisabledToilet += 1;
    if (item.details.hasBabyChanging) stats.hasBabyChanging += 1;
    if (item.details.hasEmergencyBell) stats.hasEmergencyBell += 1;
    if (item.details.hasCctv) stats.hasCctv += 1;
  });

  const targets = Array.from(targetMap.values())
    .sort((a, b) => compareKoreanText(a.region, b.region) || compareKoreanText(a.district, b.district) || compareKoreanText(a.address, b.address));
  stats.targetCount = targets.length;

  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  writeJson(path.join(CACHE_DIR, 'prepared-items.json'), {
    version: VERSION,
    type: 'public-toilet-prepared-items',
    generatedAt,
    input: path.relative(ROOT, input),
    totalItems: items.length,
    items,
  });
  writeJson(path.join(CACHE_DIR, 'geocode-targets.json'), {
    version: VERSION,
    type: 'public-toilet-geocode-targets',
    generatedAt,
    totalTargets: targets.length,
    targets,
  });
  writeJson(path.join(CACHE_DIR, 'prepare-summary.json'), {
    version: VERSION,
    type: 'public-toilet-prepare-summary',
    generatedAt,
    input: path.relative(ROOT, input),
    stats,
    sampleTargets: targets.slice(0, MAX_TARGET_SAMPLE),
  });

  console.log('[public-toilet-prepare] done');
  console.log(JSON.stringify({ output: path.relative(ROOT, CACHE_DIR), ...stats }, null, 2));
}

function normalizeToiletRow(row, rowIndex, stats) {
  const name = cleanText(row['화장실명']);
  if (!name) {
    stats.skippedNoName += 1;
    return null;
  }
  const roadAddress = cleanText(row['소재지도로명주소']);
  const lotAddress = cleanText(row['소재지지번주소']);
  const candidateAddresses = unique([roadAddress, lotAddress].filter(Boolean).map(normalizeAddress));
  const address = candidateAddresses[0] || '';
  if (!address) {
    stats.skippedNoAddress += 1;
    return null;
  }
  const regionInfo = inferRegion(address);
  if (regionInfo.key === 'unknown') stats.unknownRegion += 1;
  const district = inferDistrict(address) || '기타';
  if (district === '기타') stats.unknownDistrict += 1;
  const targetId = makeTargetId(address);
  const manager = cleanText(row['관리기관명']);
  const openRaw = cleanText(row['개방시간']);
  const openDetail = cleanText(row['개방시간상세']);
  const openType = normalizeOpenType(openRaw, openDetail);
  const counts = {
    maleToilets: toInt(row['남성용-대변기수']),
    maleUrinals: toInt(row['남성용-소변기수']),
    femaleToilets: toInt(row['여성용-대변기수']),
    disabledMaleToilets: toInt(row['남성용-장애인용대변기수']) + toInt(row['남성용-장애인용소변기수']),
    disabledFemaleToilets: toInt(row['여성용-장애인용대변기수']),
    childMaleToilets: toInt(row['남성용-어린이용대변기수']) + toInt(row['남성용-어린이용소변기수']),
    childFemaleToilets: toInt(row['여성용-어린이용대변기수']),
  };
  const hasDisabledToilet = counts.disabledMaleToilets + counts.disabledFemaleToilets > 0;
  const hasChildToilet = counts.childMaleToilets + counts.childFemaleToilets > 0;
  const hasEmergencyBell = isTruthy(row['비상벨설치여부']);
  const hasCctv = isTruthy(row['화장실입구CCTV설치유무']);
  const hasBabyChanging = isTruthy(row['기저귀교환대유무']);
  const phone = normalizePhone(row['전화번호']);
  const badges = buildBadges({ openType, hasDisabledToilet, hasBabyChanging, hasEmergencyBell, hasCctv });

  return {
    id: makeItemId(row, rowIndex),
    sourceId: cleanText(row['관리번호']) || cleanText(row['개방자치단체코드']) || String(rowIndex + 1),
    targetId,
    name,
    category: cleanText(row['구분명']) || '공중화장실',
    regionKey: regionInfo.key,
    region: regionInfo.label,
    regionFull: regionInfo.full,
    district,
    districtKey: '',
    address,
    roadAddress,
    lotAddress,
    candidateAddresses,
    phone,
    badges,
    details: {
      openType,
      openRaw,
      openDetail,
      manager,
      ownerType: cleanText(row['화장실소유구분명']),
      disposalType: cleanText(row['오물처리방식']),
      hasDisabledToilet,
      hasChildToilet,
      hasBabyChanging,
      babyChangingLocation: cleanText(row['기저귀교환대장소']),
      hasEmergencyBell,
      emergencyBellLocation: cleanText(row['비상벨설치장소']),
      hasCctv,
      safetyTarget: cleanText(row['안전관리시설설치대상여부']),
      installedMonth: normalizeMonth(row['설치연월']),
      remodeledMonth: normalizeMonth(row['리모델링연월']),
      dataDate: cleanText(row['데이터기준일자']),
      counts,
    },
  };
}

function buildBadges({ openType, hasDisabledToilet, hasBabyChanging, hasEmergencyBell, hasCctv }) {
  const badges = [];
  badges.push(openType || '운영시간 확인 필요');
  if (hasDisabledToilet) badges.push('장애인 가능');
  if (hasBabyChanging) badges.push('기저귀대');
  if (hasEmergencyBell) badges.push('비상벨');
  if (hasCctv) badges.push('CCTV');
  return badges.slice(0, 5);
}

function normalizeOpenType(openRaw, openDetail) {
  const source = `${cleanText(openRaw)} ${cleanText(openDetail)}`;
  if (/상시|24\s*시간|연중|종일/i.test(source)) return '상시개방';
  if (/정시|시간|\d{1,2}\s*[:시]\s*\d{0,2}|월|화|수|목|금|토|일|평일|주말/i.test(source)) return '정시개방';
  return '운영시간 확인 필요';
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
  if (utf8.includes('화장실명') && utf8.includes('소재지도로명주소')) return utf8.replace(/^\uFEFF/, '');
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
    if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); records.push(row); field = ''; row = []; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); records.push(row); }
  const header = records.shift()?.map(cleanHeader) || [];
  for (const record of records) {
    if (!record.some((value) => cleanText(value))) continue;
    const obj = {};
    header.forEach((key, index) => { obj[key] = record[index] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function makeTargetId(address) {
  return `pt-addr-${crypto.createHash('sha1').update(normalizeAddress(address)).digest('hex').slice(0, 12)}`;
}

function makeItemId(row, index) {
  const source = [cleanText(row['관리번호']), cleanText(row['개방자치단체코드']), cleanText(row['화장실명']), index + 1].join('|');
  return `toilet-${crypto.createHash('sha1').update(source).digest('hex').slice(0, 14)}`;
}

function normalizeAddress(value) {
  return cleanText(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function toInt(value) {
  const num = Number(cleanText(value).replace(/[^0-9-]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function isTruthy(value) {
  const text = cleanText(value).toUpperCase();
  return ['Y', 'YES', 'TRUE', '1', 'O', '○', '있음', '유', '설치'].includes(text) || /Y|있|설치|유/.test(text);
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

function normalizeMonth(value) {
  const text = cleanText(value).replace(/[^0-9]/g, '');
  if (text.length >= 6) return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
  if (text.length === 4) return text;
  return cleanText(value);
}

function inferRegion(text) {
  const source = cleanText(text);
  if (!source) return { key: 'unknown', label: '기타', full: '기타' };
  const firstToken = source.split(/\s+/)[0];
  return REGION_MAP[source] || REGION_MAP[firstToken] || { key: 'unknown', label: '기타', full: '기타' };
}

function inferDistrict(value) {
  const text = cleanText(value);
  if (!text) return '';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts[0]?.includes('세종')) return '세종시';
  return cleanDistrict(parts[1] || '');
}

function cleanDistrict(value) {
  return cleanText(value).replace(/[,，].*$/, '').trim();
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = cleanText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareKoreanText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'ko-KR');
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`, 'utf8');
}
