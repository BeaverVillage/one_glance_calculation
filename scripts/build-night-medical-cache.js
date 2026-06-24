#!/usr/bin/env node
/*
 * 한눈체크 야간 병원·야간 약국 기본정보 로컬 캐시 생성 스크립트
 *
 * 필요한 환경변수:
 *   NMC_HOSPITAL_API_KEY=국립중앙의료원 병의원 API 키
 *   NMC_PHARMACY_API_KEY=국립중앙의료원 약국 API 키
 *   또는 NMC_EMERGENCY_API_KEY / DATA_GO_KR_SERVICE_KEY / PUBLIC_DATA_SERVICE_KEY / PUBLIC_DATA_API_KEY
 *
 * 기본 출력:
 *   assets/data/medical/night-hospital-cache.json
 *   assets/data/medical/night-pharmacy-cache.json
 *
 * 이 스크립트는 변동성이 낮은 기본정보와 제공기관 운영시간만 캐시합니다.
 * 당일 실제 진료·조제 가능 여부, 접수 마감, 임시 휴무는 캐시하지 않습니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v101-night-medical-local-cache';
const DEFAULT_ROWS = 200;
const DEFAULT_DELAY_MS = 180;
const HOSPITAL_BASES = [
  'https://apis.data.go.kr/B552657/HsptlAsembySearchService',
  'http://apis.data.go.kr/B552657/HsptlAsembySearchService',
];
const PHARMACY_BASES = [
  'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService',
  'http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService',
];

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

const NATIONAL_REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

const SERVICE_CONFIG = {
  hospital: {
    type: 'hospital',
    label: '야간 병원',
    endpoint: 'getHsptlMdcncListInfoInqire',
    bases: HOSPITAL_BASES,
    output: 'assets/data/medical/night-hospital-cache.json',
    envKeys: ['NMC_HOSPITAL_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY', 'PUBLIC_DATA_API_KEY'],
    note: '야간 병원 기본정보와 제공기관 운영시간 캐시입니다. 실제 야간 진료·접수 가능 여부는 방문 전 전화 확인이 필요합니다.',
  },
  pharmacy: {
    type: 'pharmacy',
    label: '야간 약국',
    endpoint: 'getParmacyListInfoInqire',
    bases: PHARMACY_BASES,
    output: 'assets/data/medical/night-pharmacy-cache.json',
    envKeys: ['NMC_PHARMACY_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY', 'PUBLIC_DATA_API_KEY'],
    note: '야간 약국 기본정보와 제공기관 운영시간 캐시입니다. 실제 야간 조제·영업 가능 여부는 방문 전 전화 확인이 필요합니다.',
  },
};

loadDotEnv(path.join(ROOT, '.env.local'));
loadDotEnv(path.join(ROOT, '.env'));

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error('[night-medical-cache] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});

async function main() {
  const modes = args.mode === 'all' ? ['hospital', 'pharmacy'] : [args.mode || 'all'].filter((mode) => SERVICE_CONFIG[mode]);
  if (!modes.length) throw new Error('--mode는 hospital, pharmacy, all 중 하나여야 합니다.');

  for (const mode of modes) {
    await buildModeCache(SERVICE_CONFIG[mode]);
  }
}

async function buildModeCache(config) {
  const key = firstEnv(config.envKeys);
  if (!key) throw new Error(`${config.label} API 키가 필요합니다. 필요 키: ${config.envKeys.join(', ')}`);

  const output = path.resolve(ROOT, String(args.output || config.output));
  const selectedRegions = getSelectedRegions(args.region);
  const district = cleanText(args.district || '', 40);
  const keyword = cleanText(args.keyword || '', 80);
  const department = cleanText(args.department || '', 30);
  const qt = cleanText(args.qt || args.day || '', 2);
  const rows = Number.isFinite(args.rows) ? Math.max(20, Math.min(args.rows, 1000)) : DEFAULT_ROWS;
  const delayMs = Number.isFinite(args.delay) ? Math.max(0, args.delay) : DEFAULT_DELAY_MS;
  const limit = args.limit > 0 ? args.limit : Number.POSITIVE_INFINITY;
  const dryRun = Boolean(args.dryRun);
  const entries = {};
  const stats = { fetchedRows: 0, normalized: 0, skipped: 0, noCoordinates: 0, apiError: 0 };

  for (const region of selectedRegions) {
    if (Object.keys(entries).length >= limit) break;
    const regionRows = await fetchRegionRows({ config, key, region, district, keyword, department, qt, rows }).catch((error) => {
      stats.apiError += 1;
      console.warn(`[${config.type}:${region || '전국'}] 수집 실패:`, error?.message || String(error));
      return [];
    });
    stats.fetchedRows += regionRows.length;
    for (const row of regionRows) {
      if (Object.keys(entries).length >= limit) break;
      const item = normalizeNightMedicalItem(row, config.type);
      if (!item.sourceId || !item.name) {
        stats.skipped += 1;
        continue;
      }
      const cacheKey = `${config.type}:${item.sourceId}`;
      if (entries[cacheKey]) continue;
      if (!item.hasCoordinates) stats.noCoordinates += 1;
      entries[cacheKey] = item;
      stats.normalized += 1;
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  const now = new Date().toISOString();
  const payload = {
    version: VERSION,
    generatedAt: now,
    meta: {
      version: VERSION,
      type: config.type === 'pharmacy' ? 'night-pharmacy' : 'night-hospital',
      source: config.type === 'pharmacy' ? 'NMC Pharmacy API' : 'NMC Hospital Clinic API',
      endpoint: config.endpoint,
      updatedAt: now,
      regions: selectedRegions,
      district,
      keyword,
      department,
      dayCode: qt,
      totalEntries: Object.keys(entries).length,
      fetchedRows: stats.fetchedRows,
      normalizedRows: stats.normalized,
      skippedRows: stats.skipped,
      noCoordinateRows: stats.noCoordinates,
      apiErrorCount: stats.apiError,
      note: config.note,
    },
    entries,
  };

  if (!dryRun) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(payload, null, 2), 'utf8');
  }
  console.log(`[night-medical-cache:${config.type}] done:`, payload.meta);
  if (dryRun) console.log('[night-medical-cache] dry-run 모드라 파일을 쓰지 않았습니다.');
}

async function fetchRegionRows({ config, key, region, district, keyword, department, qt, rows }) {
  const firstPage = await fetchNmcPage({ config, key, region, district, keyword, department, qt, pageNo: 1, rows });
  const items = [...firstPage.items];
  const total = Number(firstPage.totalCount || items.length || 0);
  const pageCount = Math.max(1, Math.ceil(total / rows));
  console.log(`[${config.type}:${region || '전국'}] total=${total || items.length}, pages=${pageCount}`);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await fetchNmcPage({ config, key, region, district, keyword, department, qt, pageNo: page, rows });
    items.push(...result.items);
  }
  return items;
}

async function fetchNmcPage({ config, key, region, district, keyword, department, qt, pageNo, rows }) {
  const params = {
    ServiceKey: key,
    pageNo: String(pageNo),
    numOfRows: String(rows),
    _type: 'json',
    Q0: region,
    Q1: district,
    QT: qt,
    QN: keyword,
    ORD: 'NAME',
  };
  if (config.type === 'hospital' && department) params.QD = department;
  const errors = [];
  for (const base of config.bases) {
    const url = new URL(`${base}/${config.endpoint}`);
    Object.entries(params).forEach(([paramKey, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') url.searchParams.set(paramKey, String(value));
    });
    console.log('[NMC night fetch]', url.toString().replace(/(ServiceKey=)[^&]+/i, '$1****'));
    const response = await fetch(url, { headers: { Accept: 'application/json, text/xml;q=0.9, */*;q=0.8' } }).catch((error) => ({ ok: false, status: 0, text: async () => error?.message || String(error) }));
    const text = await response.text();
    if (!response.ok) {
      errors.push(`${base} ${response.status} ${text.slice(0, 160)}`);
      continue;
    }
    const data = parsePayload(text);
    const condition = normalizeCondition(data);
    if (condition.code && !['00', '0', 'NORMAL_CODE'].includes(condition.code) && !/normal|success|정상/i.test(condition.message)) {
      errors.push(`${condition.code} ${condition.message}`);
      continue;
    }
    return { items: extractItems(data), totalCount: extractTotalCount(data) };
  }
  throw new Error(errors.join(' / ') || `${config.label} API 응답을 확인하지 못했습니다.`);
}

function normalizeNightMedicalItem(row, type) {
  const sourceId = firstText(row, ['hpid', 'HPID', 'id']);
  const name = firstText(row, ['dutyName', 'DUTY_NAME', 'dutyNm', 'hospName', 'yadmNm']);
  const address = firstText(row, ['dutyAddr', 'DUTY_ADDR', 'addr', 'address']);
  const coords = sanitizeCoordinates(
    firstNumber(row, ['wgs84Lat', 'WGS84_LAT', 'lat', 'latitude', 'dutyLat', 'dutyMapLat', 'mapLat']),
    firstNumber(row, ['wgs84Lon', 'WGS84_LON', 'lon', 'lng', 'longitude', 'dutyLon', 'dutyMapLon', 'mapLon'])
  );
  const region = inferRegion(address);
  const district = inferDistrict(address);
  const operationByDay = buildOperationByDay(row);
  const todayCode = getTodayQt();
  const today = operationByDay[todayCode] || {};
  return {
    cacheKey: sourceId ? `${type}:${sourceId}` : '',
    sourceKey: sourceId ? `${type}:${sourceId}` : '',
    sourceId,
    id: sourceId,
    type,
    kind: type,
    name,
    address,
    sido: region,
    sigungu: district,
    mainTel: normalizePhone(firstText(row, ['dutyTel1', 'DUTY_TEL1', 'telno', 'mainTel', 'tel1'])),
    emergencyTel: '',
    lat: coords.lat,
    lng: coords.lng,
    hasCoordinates: coords.hasCoordinates,
    hospitalType: firstText(row, ['dutyEmclsName', 'DUTY_EMCLS_NAME', 'dutyDivNam', 'clCdNm', 'kindName']),
    department: firstText(row, ['dutyDivNam', 'DUTY_DIV_NAM', 'dutyDivName', 'department', 'clCdNm']),
    operationByDay,
    operationTime: today.label || '',
    openTime: today.open || '',
    closeTime: today.close || '',
    isNightCandidate: Boolean(today.isNightCandidate),
    isAllNight: Boolean(today.isAllNight),
    statusLabel: today.statusLabel || '전화 확인 필요',
    statusTone: today.statusTone || 'caution',
    updatedAt: new Date().toISOString().slice(0, 10),
    raw: { hpid: sourceId },
  };
}

function buildOperationByDay(row) {
  const out = {};
  for (let day = 1; day <= 7; day += 1) {
    const open = firstText(row, [`dutyTime${day}s`, `DUTY_TIME${day}S`, `dutyTime${day}S`, `startTime${day}`]);
    const close = firstText(row, [`dutyTime${day}c`, `DUTY_TIME${day}C`, `dutyTime${day}C`, `endTime${day}`]);
    const openMinutes = parseHHMM(open);
    const closeMinutes = parseHHMM(close);
    const isNightCandidate = Number.isFinite(closeMinutes) && closeMinutes >= 18 * 60;
    const isAllNight = Number.isFinite(closeMinutes) && (closeMinutes >= 24 * 60 || close === '2400' || close === '0000');
    const label = formatOperationTime(open, close);
    if (!open && !close && !label) continue;
    out[String(day)] = {
      open,
      close,
      label,
      openMinutes: Number.isFinite(openMinutes) ? openMinutes : null,
      closeMinutes: Number.isFinite(closeMinutes) ? closeMinutes : null,
      isNightCandidate,
      isAllNight,
      statusLabel: isAllNight ? '심야 운영 참고' : isNightCandidate ? '야간 운영 참고' : label ? '운영시간 확인' : '전화 확인 필요',
      statusTone: isNightCandidate || isAllNight ? 'good' : label ? 'neutral' : 'caution',
    };
  }
  return out;
}

function parseHHMM(value) {
  const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
  if (digits.length < 3) return NaN;
  const padded = digits.padStart(4, '0');
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  return hour * 60 + minute;
}

function formatOperationTime(openTime, closeTime) {
  const format = (value) => {
    const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
    if (!digits) return '';
    const padded = digits.padStart(4, '0');
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  };
  const open = format(openTime);
  const close = format(closeTime);
  if (open && close) return `${open} ~ ${close}`;
  if (open) return `${open} 시작`;
  if (close) return `${close} 종료`;
  return '';
}

function getTodayQt(date = new Date()) {
  const day = date.getDay();
  return String(day === 0 ? 7 : day);
}

function parsePayload(text) {
  const body = String(text || '').trim();
  if (!body) return {};
  try { return JSON.parse(body); } catch (_) {}
  if (body.includes('<OpenAPI_ServiceResponse>')) {
    return { response: { header: { resultCode: getFirstTag(body, 'returnReasonCode') || getFirstTag(body, 'resultCode'), resultMsg: getFirstTag(body, 'returnAuthMsg') || getFirstTag(body, 'resultMsg') || getFirstTag(body, 'errMsg') }, body: { totalCount: 0, items: { item: [] } } } };
  }
  const itemBlocks = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return { response: { header: { resultCode: getFirstTag(body, 'resultCode'), resultMsg: getFirstTag(body, 'resultMsg') }, body: { totalCount: getFirstTag(body, 'totalCount'), items: { item: itemBlocks.map(xmlItemToObject) } } } };
}

function xmlItemToObject(block) {
  const object = {};
  for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) object[match[1]] = decodeXml(match[2]);
  return object;
}

function normalizeCondition(data) {
  const header = data?.response?.header || data?.header || {};
  return { code: cleanText(header.resultCode || header.returnReasonCode || data?.resultCode || '', 80), message: cleanText(header.resultMsg || header.returnAuthMsg || data?.resultMsg || data?.message || '', 240) };
}

function extractItems(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || data?.items?.item || data?.items || [];
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') return [items];
  return [];
}

function extractTotalCount(data) {
  const body = data?.response?.body || data?.body || data;
  return Number(body?.totalCount || data?.totalCount || 0);
}

function getFirstTag(text, tag) {
  const match = String(text || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function firstText(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return cleanText(value, 240);
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

function sanitizeCoordinates(latInput, lngInput) {
  let lat = Number(latInput);
  let lng = Number(lngInput);
  if (!isKoreaLatLng(lat, lng) && isKoreaLatLng(lng, lat)) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (!isKoreaLatLng(lat, lng)) return { lat: null, lng: null, hasCoordinates: false };
  return { lat, lng, hasCoordinates: true };
}

function isKoreaLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 30 && lat <= 45 && lng >= 120 && lng <= 135;
}

function inferRegion(address) {
  const raw = String(address || '');
  return Object.values(REGION_ALIASES).filter(Boolean).find((region) => raw.includes(region)) || Object.keys(REGION_ALIASES).find((region) => region && raw.includes(region)) || '';
}

function inferDistrict(address) {
  const match = String(address || '').match(/([가-힣]+(?:시|군|구))/);
  return match ? match[1] : '';
}

function normalizePhone(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanText(value, max = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function getSelectedRegions(regionArg) {
  const normalized = normalizeRegion(regionArg || 'all');
  if (!normalized) return NATIONAL_REGIONS;
  return [normalized];
}

function normalizeRegion(value) {
  const raw = String(value || '').trim();
  return REGION_ALIASES[raw] ?? raw;
}

function firstEnv(keys) {
  for (const envKey of keys) {
    if (process.env[envKey]) return process.env[envKey];
  }
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = { mode: 'all' };
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const raw = match[2] === undefined ? true : match[2];
    if (['limit', 'delay', 'rows'].includes(key)) out[key] = Number(raw);
    else out[key] = raw;
  }
  if (!['all', 'hospital', 'pharmacy'].includes(out.mode)) out.mode = 'all';
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
    const envKey = trimmed.slice(0, index).trim();
    const envValue = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[envKey]) process.env[envKey] = envValue;
  }
}
