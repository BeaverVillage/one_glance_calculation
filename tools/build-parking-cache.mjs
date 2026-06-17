#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const endpoint = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const serviceKey = process.env.PUBLIC_DATA_API_KEY;
const numOfRows = Number(process.env.PUBLIC_DATA_NUM_OF_ROWS || 1000);
const maxPages = Number(process.env.PUBLIC_DATA_MAX_PAGES || 200);
const hardMaxPages = Number(process.env.PUBLIC_DATA_HARD_MAX_PAGES || 500);

if (!serviceKey) {
  console.error('PUBLIC_DATA_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

function normalizeKey(key) { return String(key || '').replace(/[\s_\-()\[\].]/g, '').toLowerCase(); }
function pick(row, keys) {
  const map = new Map(Object.keys(row || {}).map((key) => [normalizeKey(key), key]));
  for (const key of keys) {
    const exact = row?.[key];
    if (exact !== undefined && exact !== null && String(exact).trim() !== '') return String(exact).trim();
    const loose = map.get(normalizeKey(key));
    if (loose && row[loose] !== undefined && row[loose] !== null && String(row[loose]).trim() !== '') return String(row[loose]).trim();
  }
  return '';
}
function num(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!text || text === '-' || /없음|해당없음/.test(text)) return fallback;
  if (/무료/.test(text)) return 0;
  const parsed = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function coord(value) {
  const parsed = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}
function region(value) {
  const text = String(value || '');
  for (const [name, pattern] of [
    ['서울', /서울|서울특별시/], ['부산', /부산|부산광역시/], ['대구', /대구|대구광역시/], ['인천', /인천|인천광역시/],
    ['광주', /광주|광주광역시/], ['대전', /대전|대전광역시/], ['울산', /울산|울산광역시/], ['세종', /세종|세종시|세종특별자치시/],
    ['경기', /경기|경기도/], ['강원', /강원|강원도|강원특별자치도/], ['충북', /충북|충청북도/], ['충남', /충남|충청남도/],
    ['전북', /전북|전라북도|전북특별자치도/], ['전남', /전남|전라남도/], ['경북', /경북|경상북도/], ['경남', /경남|경상남도/], ['제주', /제주|제주특별자치도/]
  ]) if (pattern.test(text)) return name;
  return '';
}
function district(value) {
  const match = String(value || '').match(/([가-힣]+(?:시|군|구))/);
  return match ? match[1] : '';
}
function slug(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 80) || Math.random().toString(36).slice(2); }
function resolveFeeType(feeText, baseFee, additionalFee) {
  if (/무료/.test(String(feeText || ''))) return '무료';
  if (Number(baseFee) === 0 && Number(additionalFee) === 0) return '무료';
  return '유료';
}
function pricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee }) {
  if (String(feeType || '').includes('무료')) return 'free';
  if (baseMinutes != null && baseFee != null && additionalMinutes != null && additionalFee != null) return 'complete';
  if (baseMinutes != null && baseFee != null) return 'partial';
  if (dayPassFee != null) return 'partial';
  return 'unknown';
}
function isValidLatLng(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}
function normalize(row) {
  const name = pick(row, ['prkplceNm', 'prkplce_nm', 'parkingLotName', 'parkingLotNm', 'parkNm', '주차장명', 'PARKING_NAME', 'name']);
  const roadAddress = pick(row, ['rdnmadr', 'roadAddress', 'roadNmAddress', '소재지도로명주소', 'ROAD_ADDR']);
  const jibunAddress = pick(row, ['lnmadr', 'jibunAddress', 'lotnoAddress', '소재지지번주소', 'JIBUN_ADDR']);
  const lat = coord(pick(row, ['latitude', 'lat', '위도', 'LAT', 'y', 'Y좌표', '위도값']));
  const lng = coord(pick(row, ['longitude', 'lng', '경도', 'LNG', 'x', 'X좌표', '경도값']));
  if (!name || !isValidLatLng(lat, lng)) return null;
  const feeText = pick(row, ['parkingchrgeInfo', 'parkingChargeInfo', 'parkingchrgeSe', 'feeType', '요금정보', '유무료구분']);
  const baseMinutes = num(pick(row, ['basicTime', 'parkingBasicTime', 'prkBasicTime', '주차기본시간', '기본시간']), null);
  const baseFee = num(pick(row, ['basicCharge', 'parkingBasicCharge', 'prkBasicCharge', '주차기본요금', '기본요금']), null);
  const additionalMinutes = num(pick(row, ['addUnitTime', 'addUnitTimeUnit', 'addTime', '추가단위시간']), null);
  const additionalFee = num(pick(row, ['addUnitCharge', 'addUnitChargeUnit', 'addCharge', '추가단위요금']), null);
  const dayPassFee = num(pick(row, ['dayCmmtkt', 'dayParkingTicketCharge', 'dayPassFee', '1일주차권요금', '일주차요금']), null);
  const feeType = resolveFeeType(feeText, baseFee, additionalFee);
  const status = pricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee });
  const address = roadAddress || jibunAddress;
  return {
    id: 'PUBLIC_' + slug(pick(row, ['prkplceNo', 'prkplceMngNo', 'parkingLotId', '주차장관리번호', '관리번호']) || `${name}_${lat}_${lng}`),
    name,
    publicPrivateType: String(pick(row, ['prkplceSe', 'prkplce_se', 'operSe', 'operatingSe', '운영구분', '주차장구분', 'publicPrivateType']) || '공영').includes('민영') ? '민영' : '공영',
    parkingType: pick(row, ['prkplceType', 'parkingType', '주차장유형']) || '주차장',
    roadAddress,
    jibunAddress,
    address,
    lat,
    lng,
    region: region(`${address} ${pick(row, ['ctprvnNm', '시도명', 'region'])}`),
    district: district(address),
    capacity: num(pick(row, ['prkcmprt', 'capacity', '주차구획수', '주차면수']), null),
    operatingDays: pick(row, ['operDay', '운영요일']) || '공공데이터 기준',
    feeType,
    baseMinutes,
    baseFee,
    additionalMinutes,
    additionalFee,
    unitMinutes: additionalMinutes,
    unitFee: additionalFee,
    dayPassFee,
    dailyMaxFee: dayPassFee,
    monthlyFee: num(pick(row, ['monthCmmtkt', 'monthlyFee', '월정기권요금']), null),
    paymentMethods: pick(row, ['metpay', 'paymentMethods', '결제방법']) || '현장 확인',
    agencyName: pick(row, ['institutionNm', 'institutionName', '관리기관명']) || '공공데이터포털',
    phone: pick(row, ['phoneNumber', '전화번호']) || '',
    dataDate: pick(row, ['referenceDate', 'dataDate', '데이터기준일자']) || '',
    sourceUpdatedAt: pick(row, ['referenceDate', 'dataDate', '데이터기준일자']) || '',
    source: '공공데이터포털 전국주차장정보표준데이터',
    pricingStatus: status,
    realtimeAvailable: null,
    realtimeKey: null,
    disabledDiscountRate: 50,
    compactDiscountRate: 50,
    evDiscountRate: 50
  };
}
function normalizeRows(rows) {
  const normalizedRows = rows.map(normalize);
  const withCoordinates = normalizedRows.filter(Boolean);
  return { withCoordinates, missingCoordinates: normalizedRows.length - withCoordinates.length };
}
function unwrapRows(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || body?.data || body?.rows || [];
  return {
    rows: Array.isArray(items) ? items : [items].filter(Boolean),
    totalCount: Number(body?.totalCount || data?.totalCount || 0)
  };
}
function decodeXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function parseXml(text) {
  const totalMatch = /<totalCount[^>]*>([\s\S]*?)<\/totalCount>/.exec(text);
  const totalCount = totalMatch ? Number(decodeXml(totalMatch[1])) : 0;
  const rows = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(text))) {
    const row = {};
    const fieldPattern = /<([^\/][^>\s]*)[^>]*>([\s\S]*?)<\/\1>/g;
    let field;
    while ((field = fieldPattern.exec(match[1]))) row[field[1]] = decodeXml(field[2]);
    if (Object.keys(row).length) rows.push(row);
  }
  return { rows, totalCount };
}
async function parseResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) return unwrapRows(await res.json());
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return unwrapRows(JSON.parse(trimmed));
  return parseXml(trimmed);
}
async function fetchPage(pageNo) {
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(numOfRows));
  url.searchParams.set('type', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${pageNo}페이지 호출 실패: ${res.status}`);
  return parseResponse(res);
}
async function main() {
  const first = await fetchPage(1);
  const totalCount = first.totalCount || first.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / numOfRows));
  const pages = Math.min(totalPages, Math.max(1, Math.min(maxPages || totalPages, hardMaxPages)));
  const raw = [...first.rows];
  let pagesFetched = 1;
  const failedPages = [];
  for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
    try {
      const page = await fetchPage(pageNo);
      raw.push(...page.rows);
      pagesFetched += 1;
      if (!first.totalCount && page.rows.length < numOfRows) break;
    } catch (error) {
      failedPages.push({ pageNo, message: error?.message || String(error) });
    }
  }
  const { withCoordinates, missingCoordinates } = normalizeRows(raw);
  const payload = {
    version: new Date().toISOString().slice(0, 10),
    sourceName: '공공데이터포털 전국주차장정보표준데이터',
    disclaimer: '정규화 캐시입니다. 실제 요금과 운영시간은 현장 기준을 확인하세요.',
    meta: {
      generatedAt: new Date().toISOString(),
      totalCount,
      totalPages,
      pagesFetched,
      requestedPages: pages,
      failedPages: failedPages.length,
      rawItems: raw.length,
      normalizedItems: withCoordinates.length,
      withCoordinates: withCoordinates.length,
      missingCoordinates,
      numOfRows,
      maxPages: pages
    },
    lots: withCoordinates
  };
  const jsonText = JSON.stringify(payload, null, 2);
  const moduleText = '// This file is generated by tools/build-parking-cache.mjs. Do not edit by hand.\n'
    + 'export const nationalParkingMeta = ' + JSON.stringify({ ...payload, lots: undefined }, null, 2).replace(/,\n  "lots": undefined/g, '') + ';\n'
    + 'export const nationalParkingLots = ' + JSON.stringify(withCoordinates, null, 2) + ';\n';
  const outputs = [
    'functions/api/parking/_data/national-parking-lots.json',
    'assets/data/parking/national-parking-lots.json',
    'functions/api/parking/_lib/generated-national-parking-lots.js'
  ];
  for (const out of outputs) {
    const target = path.resolve(projectRoot, out);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, out.endsWith('.js') ? moduleText : jsonText, 'utf8');
    console.log('[parking-cache] output:', out);
  }
  console.log('[parking-cache] totalCount:', totalCount);
  console.log('[parking-cache] pagesFetched:', pagesFetched);
  console.log('[parking-cache] rawItems:', raw.length);
  console.log('[parking-cache] normalizedItems:', withCoordinates.length);
  console.log('[parking-cache] withCoordinates:', withCoordinates.length);
  console.log('[parking-cache] missingCoordinates:', missingCoordinates);
}

main().catch((error) => {
  console.error('[parking-cache] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
