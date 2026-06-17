#!/usr/bin/env node
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const endpoint = process.env.PUBLIC_DATA_ENDPOINT || 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const serviceKey = process.env.PUBLIC_DATA_API_KEY || '';
const sourceCsv = process.env.PARKING_SOURCE_CSV || process.argv.find((arg) => arg.startsWith('--csv='))?.slice(6) || '';
const numOfRows = Number(process.env.PUBLIC_DATA_NUM_OF_ROWS || 1000);
const hardMaxPages = Number(process.env.PUBLIC_DATA_HARD_MAX_PAGES || 300);
const maxPages = Number(process.env.PUBLIC_DATA_MAX_PAGES || hardMaxPages);
const cellSize = Number(process.env.PARKING_CACHE_CELL_SIZE || 0.1);

function pick(row, keys) { for (const key of keys) if (row[key] != null && String(row[key]).trim() !== '') return row[key]; return ''; }
function num(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!text || text === '-' || /없음|해당없음|nan/i.test(text)) return fallback;
  if (/무료/.test(text)) return 0;
  const parsed = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function coord(value) { const parsed = Number(String(value || '').replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : NaN; }
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
function district(value) { const match = String(value || '').match(/([가-힣]+(?:시|군|구))/); return match ? match[1] : ''; }
function slug(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 80) || Math.random().toString(36).slice(2); }
function formatHHMM(value, fallback = '') {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${String(Math.min(23, Number(match[1]))).padStart(2, '0')}:${String(Math.min(59, Number(match[2]))).padStart(2, '0')}`;
  return fallback;
}
function resolveFeeType(feeText, baseFee, additionalFee) { if (/무료/.test(String(feeText || ''))) return '무료'; if (Number(baseFee) === 0 && (additionalFee == null || Number(additionalFee) === 0)) return '무료'; return '유료'; }
function pricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee }) { if (String(feeType || '').includes('무료')) return 'free'; if (baseMinutes != null && baseFee != null && additionalMinutes != null && additionalFee != null) return 'complete'; if (baseMinutes != null && baseFee != null) return 'partial'; if (dayPassFee != null) return 'partial'; return 'unknown'; }
function isValidLatLng(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  return Number.isFinite(y) && Number.isFinite(x) && y >= 32 && y <= 39.5 && x >= 124 && x <= 132.5;
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
  const address = roadAddress || jibunAddress;
  return {
    id: 'PUBLIC_' + slug(pick(row, ['prkplceNo', 'prkplceMngNo', 'parkingLotId', '주차장관리번호', '관리번호']) || `${name}_${lat}_${lng}`),
    name,
    publicPrivateType: String(pick(row, ['prkplceSe', 'prkplce_se', 'operSe', 'operatingSe', '운영구분', '주차장구분', 'publicPrivateType']) || '공영').includes('민영') ? '민영' : '공영',
    parkingType: pick(row, ['prkplceType', 'parkingType', '주차장유형']) || '주차장',
    roadAddress, jibunAddress, address, lat, lng,
    region: region(`${address} ${pick(row, ['ctprvnNm', '시도명', 'region', '제공기관명'])}`),
    district: district(address),
    capacity: num(pick(row, ['prkcmprt', 'capacity', '주차구획수', '주차면수']), null),
    operatingDays: pick(row, ['operDay', '운영요일']) || '공공데이터 기준',
    weekdayOpen: formatHHMM(pick(row, ['평일운영시작시각', 'weekdayOpen']), '00:00'),
    weekdayClose: formatHHMM(pick(row, ['평일운영종료시각', 'weekdayClose']), '23:59'),
    saturdayOpen: formatHHMM(pick(row, ['토요일운영시작시각', 'saturdayOpen']), '00:00'),
    saturdayClose: formatHHMM(pick(row, ['토요일운영종료시각', 'saturdayClose']), '23:59'),
    holidayOpen: formatHHMM(pick(row, ['공휴일운영시작시각', 'holidayOpen']), '00:00'),
    holidayClose: formatHHMM(pick(row, ['공휴일운영종료시각', 'holidayClose']), '23:59'),
    feeType, baseMinutes, baseFee, additionalMinutes, additionalFee,
    unitMinutes: additionalMinutes, unitFee: additionalFee,
    dayPassFee, dailyMaxFee: dayPassFee,
    monthlyFee: num(pick(row, ['monthCmmtkt', 'monthlyFee', '월정기권요금']), null),
    paymentMethods: pick(row, ['metpay', 'paymentMethods', '결제방법']) || '현장 확인',
    agencyName: pick(row, ['institutionNm', 'institutionName', '관리기관명', '제공기관명']) || '공공데이터포털',
    phone: pick(row, ['phoneNumber', '전화번호']) || '',
    dataDate: pick(row, ['referenceDate', 'dataDate', '데이터기준일자']) || '',
    sourceUpdatedAt: pick(row, ['referenceDate', 'dataDate', '데이터기준일자']) || '',
    source: '공공데이터포털 전국주차장정보표준데이터',
    pricingStatus: pricingStatus({ feeType, baseMinutes, baseFee, additionalMinutes, additionalFee, dayPassFee }),
    realtimeAvailable: null,
    realtimeKey: null,
    disabledDiscountRate: 50,
    compactDiscountRate: 50,
    evDiscountRate: 50
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((value) => value !== '')) rows.push(row);
  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}
async function readCsvRows(file) {
  const buffer = await readFile(path.resolve(projectRoot, file));
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch (_) { text = new TextDecoder('euc-kr').decode(buffer); }
  return parseCsv(text.replace(/^\uFEFF/, ''));
}
function unwrapRows(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || body?.data || body?.rows || [];
  return { rows: Array.isArray(items) ? items : [items].filter(Boolean), totalCount: Number(body?.totalCount || data?.totalCount || 0) };
}
function decodeXml(value) { return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }
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
async function fetchApiRows() {
  if (!serviceKey) throw new Error('PUBLIC_DATA_API_KEY 또는 --csv= 경로가 필요합니다.');
  const first = await fetchPage(1);
  const totalCount = first.totalCount || first.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / numOfRows));
  const pages = Math.min(totalPages, Math.max(1, Math.min(maxPages || totalPages, hardMaxPages)));
  const raw = [...first.rows];
  const failedPages = [];
  for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
    try { raw.push(...(await fetchPage(pageNo)).rows); }
    catch (error) { failedPages.push({ pageNo, message: error?.message || String(error) }); }
  }
  return { raw, totalCount, pagesFetched: pages - failedPages.length, failedPages };
}
function dedupe(lots) {
  const seen = new Set();
  const out = [];
  for (const lot of lots) {
    if (!lot?.id || seen.has(lot.id)) continue;
    seen.add(lot.id);
    out.push(lot);
  }
  return out;
}
async function writeOutputs(lots, meta) {
  const outBase = path.resolve(projectRoot, 'assets/data/parking');
  const cellsDir = path.join(outBase, 'cells');
  await rm(cellsDir, { recursive: true, force: true });
  await mkdir(cellsDir, { recursive: true });
  const chunks = {};
  for (const lot of lots) {
    const latCell = Math.floor(Number(lot.lat) / cellSize);
    const lngCell = Math.floor(Number(lot.lng) / cellSize);
    const key = `${latCell}_${lngCell}`;
    if (!chunks[key]) chunks[key] = [];
    chunks[key].push(lot);
  }
  const chunkMeta = {};
  for (const [key, arr] of Object.entries(chunks).sort()) {
    const file = `cells/${key}.json`;
    await writeFile(path.join(outBase, file), JSON.stringify({ key, cellSize, count: arr.length, lots: arr }), 'utf8');
    const lats = arr.map((lot) => Number(lot.lat));
    const lngs = arr.map((lot) => Number(lot.lng));
    chunkMeta[key] = { file, count: arr.length, bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)] };
  }
  const index = { ...meta, chunkType: 'grid', cellSize, totalLots: lots.length, normalizedItems: lots.length, withCoordinates: lots.length, radiusDefaultMeters: 1500, chunks: chunkMeta };
  await writeFile(path.join(outBase, 'index.json'), JSON.stringify(index), 'utf8');
  const smallMeta = { ...index, chunks: undefined, chunkCount: Object.keys(chunkMeta).length, lots: [] };
  await mkdir(path.resolve(projectRoot, 'functions/api/parking/_data'), { recursive: true });
  await writeFile(path.resolve(projectRoot, 'functions/api/parking/_data/national-parking-lots.json'), JSON.stringify(smallMeta, null, 2), 'utf8');
  await writeFile(path.join(outBase, 'national-parking-lots.json'), JSON.stringify(smallMeta, null, 2), 'utf8');
  await writeFile(path.resolve(projectRoot, 'functions/api/parking/_lib/generated-national-parking-lots.js'), '// This file is generated metadata only. Large parking lot data lives in /assets/data/parking/cells/*.json.\nexport const nationalParkingMeta = ' + JSON.stringify(smallMeta, null, 2) + ';\n', 'utf8');
  return { chunkCount: Object.keys(chunkMeta).length, largestChunk: Math.max(...Object.values(chunks).map((arr) => arr.length)) };
}
async function main() {
  const rawResult = sourceCsv ? { raw: await readCsvRows(sourceCsv), totalCount: 0, pagesFetched: 0, failedPages: [] } : await fetchApiRows();
  const normalizedRows = rawResult.raw.map(normalize);
  const lots = dedupe(normalizedRows.filter(Boolean));
  const missingCoordinates = normalizedRows.length - lots.length;
  const meta = {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    sourceName: '공공데이터포털 전국주차장정보표준데이터',
    sourceUrl: 'https://www.data.go.kr/data/15012896/standard.do',
    totalRows: rawResult.raw.length,
    totalCount: rawResult.totalCount || rawResult.raw.length,
    pagesFetched: rawResult.pagesFetched,
    failedPages: rawResult.failedPages.length,
    missingCoordinates,
    sourceMode: sourceCsv ? 'csv' : 'openapi'
  };
  const output = await writeOutputs(lots, meta);
  console.log('[parking-cache] rawItems:', rawResult.raw.length);
  console.log('[parking-cache] normalizedItems:', lots.length);
  console.log('[parking-cache] withCoordinates:', lots.length);
  console.log('[parking-cache] missingCoordinates:', missingCoordinates);
  console.log('[parking-cache] chunkCount:', output.chunkCount);
  console.log('[parking-cache] largestChunkLots:', output.largestChunk);
}
main().catch((error) => { console.error('[parking-cache] failed:', error?.stack || error?.message || String(error)); process.exit(1); });
