#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const endpoint = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const serviceKey = process.env.PUBLIC_DATA_API_KEY;
const numOfRows = 1000;
const maxPages = Number(process.env.PUBLIC_DATA_MAX_PAGES || 100);

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
function coord(value) { const parsed = Number(String(value || '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : NaN; }
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
function slug(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 80); }
function normalize(row) {
  const name = pick(row, ['prkplceNm', 'parkingLotName', '주차장명', 'name']);
  const roadAddress = pick(row, ['rdnmadr', 'roadAddress', '소재지도로명주소']);
  const jibunAddress = pick(row, ['lnmadr', 'jibunAddress', '소재지지번주소']);
  const lat = coord(pick(row, ['latitude', 'lat', '위도']));
  const lng = coord(pick(row, ['longitude', 'lng', '경도']));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const feeText = pick(row, ['parkingchrgeInfo', 'feeType', '요금정보']);
  const baseFee = num(pick(row, ['basicCharge', 'parkingBasicCharge', '주차기본요금']), null);
  const additionalFee = num(pick(row, ['addUnitCharge', '추가단위요금']), null);
  const free = /무료/.test(feeText) || (baseFee === 0 && additionalFee === 0);
  return {
    id: 'PUBLIC_' + slug(pick(row, ['prkplceNo', 'prkplceMngNo', '주차장관리번호']) || `${name}_${lat}_${lng}`),
    name,
    publicPrivateType: String(pick(row, ['prkplceSe', '주차장구분']) || '공영').includes('민영') ? '민영' : '공영',
    parkingType: pick(row, ['prkplceType', '주차장유형']) || '주차장',
    roadAddress,
    jibunAddress,
    address: roadAddress || jibunAddress,
    lat,
    lng,
    region: region(`${roadAddress} ${jibunAddress}`),
    capacity: num(pick(row, ['prkcmprt', '주차구획수']), null),
    operatingDays: pick(row, ['operDay', '운영요일']) || '공공데이터 기준',
    feeType: free ? '무료' : '유료',
    baseMinutes: num(pick(row, ['basicTime', '주차기본시간']), null),
    baseFee,
    additionalMinutes: num(pick(row, ['addUnitTime', '추가단위시간']), null),
    additionalFee,
    dayPassFee: num(pick(row, ['dayCmmtkt', '1일주차권요금']), null),
    monthlyFee: num(pick(row, ['monthCmmtkt', '월정기권요금']), null),
    paymentMethods: pick(row, ['metpay', '결제방법']) || '현장 확인',
    agencyName: pick(row, ['institutionNm', '관리기관명']) || '공공데이터포털',
    phone: pick(row, ['phoneNumber', '전화번호']) || '',
    dataDate: pick(row, ['referenceDate', '데이터기준일자']) || '',
    source: '공공데이터포털 전국주차장정보표준데이터',
    realtimeKey: null,
    disabledDiscountRate: 50,
    compactDiscountRate: 50,
    evDiscountRate: 50
  };
}
async function fetchPage(pageNo) {
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(numOfRows));
  url.searchParams.set('type', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${pageNo}페이지 호출 실패: ${res.status}`);
  const data = await res.json();
  const body = data?.response?.body || {};
  const items = body?.items?.item || [];
  return { rows: Array.isArray(items) ? items : [items].filter(Boolean), totalCount: Number(body?.totalCount || 0) };
}
const first = await fetchPage(1);
const pages = Math.min(maxPages, Math.max(1, Math.ceil((first.totalCount || first.rows.length) / numOfRows)));
const raw = [...first.rows];
for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
  const page = await fetchPage(pageNo);
  raw.push(...page.rows);
  if (!first.totalCount && page.rows.length < numOfRows) break;
}
const normalizedRows = raw.map(normalize);
const lots = normalizedRows.filter(Boolean);
const missingCoordinates = normalizedRows.length - lots.length;
const payload = {
  version: new Date().toISOString().slice(0, 10),
  sourceName: '공공데이터포털 전국주차장정보표준데이터',
  disclaimer: '정규화 캐시입니다. 실제 요금과 운영시간은 현장 기준을 확인하세요.',
  meta: {
    pagesFetched: pages,
    rawItems: raw.length,
    normalizedItems: lots.length,
    withCoordinates: lots.length,
    missingCoordinates
  },
  lots
};
for (const out of ['functions/api/parking/_data/national-parking-lots.json', 'assets/data/parking/national-parking-lots.json']) {
  await writeFile(path.resolve(out), JSON.stringify(payload, null, 2), 'utf8');
  console.log('[parking-cache] output:', out);
}
console.log('[parking-cache] pagesFetched:', pages);
console.log('[parking-cache] rawItems:', raw.length);
console.log('[parking-cache] normalizedItems:', lots.length);
console.log('[parking-cache] withCoordinates:', lots.length);
console.log('[parking-cache] missingCoordinates:', missingCoordinates);
