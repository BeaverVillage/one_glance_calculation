#!/usr/bin/env node
/*
 * 공공데이터 주차장 → 카카오맵 장소 링크 로컬 캐시 생성 스크립트
 *
 * 사용 예:
 *   KAKAO_REST_API_KEY="..." node scripts/enrich-parking-kakao-places.js --limit=10
 *   node scripts/enrich-parking-kakao-places.js --region=대전 --limit=100
 *   node scripts/enrich-parking-kakao-places.js --force --limit=50
 *
 * 출력:
 *   assets/data/parking/kakao-place-cache.json
 *
 * 주의:
 *   이 스크립트는 로컬/빌드 단계에서만 카카오 Local API를 호출합니다.
 *   사이트 런타임에서는 이 JSON 캐시와 카카오맵 검색 URL만 사용합니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'assets/data/parking/index.json');
const CACHE_PATH = path.join(ROOT, 'assets/data/parking/kakao-place-cache.json');
const KAKAO_LOCAL_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const VERSION = 'v66-parking-kakao-place-cache';
const DEFAULT_DELAY_MS = 220;
const DEFAULT_RADIUS_METERS = 500;
const MATCHED_SCORE = 80;
const LOW_CONFIDENCE_SCORE = 60;

loadDotEnv(path.join(ROOT, '.env.local'));
loadDotEnv(path.join(ROOT, '.env'));

const args = parseArgs(process.argv.slice(2));
const apiKey = process.env.KAKAO_REST_API_KEY || '';

if (!apiKey) {
  console.error('KAKAO_REST_API_KEY가 필요합니다. 루트 .env.local 또는 환경변수에 REST API 키를 넣어 주세요.');
  process.exit(1);
}

main().catch((error) => {
  console.error('[parking-kakao-cache] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});

async function main() {
  const lots = loadParkingLots();
  const existing = loadExistingCache();
  const entries = existing.entries || {};
  const today = new Date().toISOString().slice(0, 10);
  const limit = args.limit > 0 ? args.limit : Number.POSITIVE_INFINITY;
  const delayMs = Number.isFinite(args.delay) ? Math.max(0, args.delay) : DEFAULT_DELAY_MS;
  const regionFilter = normalizeText(args.region || '');
  const force = Boolean(args.force);
  const dryRun = Boolean(args.dryRun);

  let processed = 0;
  let skipped = 0;
  let matched = 0;
  let lowConfidence = 0;
  let notFound = 0;
  let missingData = 0;
  let apiError = 0;

  for (const lot of lots) {
    if (regionFilter) {
      const target = normalizeText(`${lot.region || ''} ${lot.district || ''} ${lot.address || ''} ${lot.roadAddress || ''} ${lot.jibunAddress || ''}`);
      if (!target.includes(regionFilter)) continue;
    }

    const key = buildKakaoPlaceLinkCacheKey(lot);
    if (!force && entries[key] && entries[key].kakaoMatchType !== 'api_error') {
      skipped += 1;
      continue;
    }
    if (processed >= limit) break;

    processed += 1;
    const result = await matchParkingLot(lot, today);
    entries[key] = result;
    if (result.kakaoMatchType === 'matched') matched += 1;
    else if (result.kakaoMatchType === 'low_confidence') lowConfidence += 1;
    else if (result.kakaoMatchType === 'not_found') notFound += 1;
    else if (result.kakaoMatchType === 'missing_data') missingData += 1;
    else if (result.kakaoMatchType === 'api_error') apiError += 1;

    console.log(`${processed}. [${result.kakaoMatchType}] ${lot.name} → ${result.kakaoPlaceName || result.kakaoSearchUrl || result.message || ''} (${result.kakaoMatchScore || 0})`);
    if (delayMs > 0) await sleep(delayMs);
  }

  const payload = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    meta: {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      source: '카카오 Local API 키워드 장소 검색 로컬 매칭 캐시',
      totalParkingLots: lots.length,
      totalEntries: Object.keys(entries).length,
      processedThisRun: processed,
      skippedThisRun: skipped,
      matchedThisRun: matched,
      lowConfidenceThisRun: lowConfidence,
      notFoundThisRun: notFound,
      missingDataThisRun: missingData,
      apiErrorThisRun: apiError,
      regionFilter: args.region || '',
      limit: Number.isFinite(limit) ? limit : null
    },
    entries
  };

  if (!dryRun) {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  }

  console.log('[parking-kakao-cache] done:', payload.meta);
  if (dryRun) console.log('[parking-kakao-cache] dry-run 모드라 파일을 쓰지 않았습니다.');
}

function loadParkingLots() {
  const index = readJson(INDEX_PATH);
  const chunks = index.chunks || {};
  const lots = [];
  for (const info of Object.values(chunks)) {
    if (!info?.file) continue;
    const chunkPath = path.join(ROOT, 'assets/data/parking', info.file);
    if (!fs.existsSync(chunkPath)) continue;
    const chunk = readJson(chunkPath);
    const rows = Array.isArray(chunk?.lots) ? chunk.lots : (Array.isArray(chunk) ? chunk : []);
    rows.forEach((lot) => {
      if (lot && lot.name && isValidLatLng(lot.lat, lot.lng)) lots.push(lot);
    });
  }
  const seen = new Set();
  return lots.filter((lot) => {
    const key = buildKakaoPlaceLinkCacheKey(lot);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadExistingCache() {
  if (!fs.existsSync(CACHE_PATH)) return { entries: {} };
  try {
    const payload = readJson(CACHE_PATH);
    return { entries: payload.entries || payload.matches || {} };
  } catch {
    return { entries: {} };
  }
}

async function matchParkingLot(lot, today) {
  const searchUrl = buildKakaoSearchUrlForParking(lot);
  if (!lot.name || !isValidLatLng(lot.lat, lot.lng)) {
    return baseCacheEntry(lot, { type: 'missing_data', today, searchUrl, message: 'name-or-coordinate-missing' });
  }

  const queries = buildKakaoPlaceQueries(lot);
  let best = null;
  try {
    for (const query of queries) {
      const docs = await fetchKakaoCandidates(query, lot);
      for (const doc of docs) {
        const scored = scoreKakaoCandidate(lot, doc);
        if (!scored) continue;
        if (!best || scored.score > best.score) best = { ...scored, query };
      }
      if (best?.score >= MATCHED_SCORE) break;
    }
  } catch (error) {
    return baseCacheEntry(lot, { type: 'api_error', today, searchUrl, message: error?.message || String(error) });
  }

  if (!best) return baseCacheEntry(lot, { type: 'not_found', today, searchUrl, message: 'no-candidate' });
  if (best.score >= MATCHED_SCORE) {
    return {
      ...baseCacheEntry(lot, { type: 'matched', today, searchUrl }),
      kakaoPlaceId: String(best.doc.id || ''),
      kakaoPlaceName: best.doc.place_name || '',
      kakaoPlaceUrl: best.doc.place_url || '',
      kakaoMatchScore: best.score,
      kakaoMatchDistanceMeters: best.distanceMeters,
      kakaoMatchQuery: best.query,
      kakaoCategoryName: best.doc.category_name || '',
      kakaoAddressName: best.doc.address_name || '',
      kakaoRoadAddressName: best.doc.road_address_name || ''
    };
  }

  if (best.score >= LOW_CONFIDENCE_SCORE) {
    return {
      ...baseCacheEntry(lot, { type: 'low_confidence', today, searchUrl }),
      kakaoPlaceId: String(best.doc.id || ''),
      kakaoPlaceName: best.doc.place_name || '',
      kakaoMatchScore: best.score,
      kakaoMatchDistanceMeters: best.distanceMeters,
      kakaoMatchQuery: best.query,
      kakaoCategoryName: best.doc.category_name || '',
      kakaoAddressName: best.doc.address_name || '',
      kakaoRoadAddressName: best.doc.road_address_name || ''
    };
  }

  return {
    ...baseCacheEntry(lot, { type: 'not_found', today, searchUrl, message: 'low-score' }),
    kakaoPlaceName: best.doc.place_name || '',
    kakaoMatchScore: best.score,
    kakaoMatchDistanceMeters: best.distanceMeters,
    kakaoCategoryName: best.doc.category_name || ''
  };
}

function baseCacheEntry(lot, { type, today, searchUrl, message = '' }) {
  return {
    parkingId: lot.id || '',
    parkingName: lot.name || '',
    parkingAddress: lot.roadAddress || lot.jibunAddress || lot.address || '',
    parkingLat: Number(lot.lat),
    parkingLng: Number(lot.lng),
    kakaoPlaceId: '',
    kakaoPlaceName: '',
    kakaoPlaceUrl: '',
    kakaoSearchUrl: searchUrl || buildKakaoSearchUrlForParking(lot),
    kakaoMatchType: type,
    kakaoMatchScore: 0,
    kakaoMatchedAt: today,
    message
  };
}

function buildKakaoPlaceQueries(lot) {
  const name = String(lot.name || '').trim();
  const address = String(lot.roadAddress || lot.jibunAddress || lot.address || '').trim();
  const district = String(lot.district || extractDistrict(address) || '').trim();
  const region = String(lot.region || '').trim();
  const nameWithParking = /주차/.test(name) ? name : `${name} 주차장`;
  const addressHint = [region, district].filter(Boolean).join(' ').trim();
  const queries = [
    [addressHint, nameWithParking].filter(Boolean).join(' '),
    [district, nameWithParking].filter(Boolean).join(' '),
    nameWithParking,
    name,
    [address, '주차장'].filter(Boolean).join(' ')
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 5);
}

async function fetchKakaoCandidates(query, lot) {
  const url = new URL(KAKAO_LOCAL_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('x', String(lot.lng));
  url.searchParams.set('y', String(lot.lat));
  url.searchParams.set('radius', String(DEFAULT_RADIUS_METERS));
  url.searchParams.set('sort', 'distance');
  url.searchParams.set('page', '1');
  url.searchParams.set('size', '10');

  const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Kakao Local API ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.documents) ? data.documents : [];
}

function scoreKakaoCandidate(lot, doc) {
  const distanceMeters = Number(doc.distance);
  if (Number.isFinite(distanceMeters) && distanceMeters > DEFAULT_RADIUS_METERS) return null;
  const categoryName = String(doc.category_name || '');
  if (categoryName && !/주차|교통|자동차/.test(categoryName)) return null;

  const lotNameRaw = String(lot.name || '');
  const docNameRaw = String(doc.place_name || '');
  const lotName = normalizeParkingName(lotNameRaw);
  const docName = normalizeParkingName(docNameRaw);
  const lotCore = normalizeParkingCoreName(lotNameRaw);
  const docCore = normalizeParkingCoreName(docNameRaw);
  const lotAddress = normalizeAddress(`${lot.roadAddress || ''} ${lot.jibunAddress || ''} ${lot.address || ''}`);
  const docAddress = normalizeAddress(`${doc.road_address_name || ''} ${doc.address_name || ''}`);

  let score = 0;
  if (Number.isFinite(distanceMeters)) {
    if (distanceMeters <= 80) score += 40;
    else if (distanceMeters <= 150) score += 32;
    else if (distanceMeters <= 300) score += 24;
    else if (distanceMeters <= 500) score += 12;
  }

  if (lotName && docName && lotName === docName) score += 45;
  else if (lotCore && docCore && lotCore === docCore) score += 36;
  else if (lotCore.length >= 3 && docCore.length >= 3 && (lotCore.includes(docCore) || docCore.includes(lotCore))) score += 24;
  else if (lotName.length >= 4 && docName.length >= 4 && (lotName.includes(docName) || docName.includes(lotName))) score += 18;
  else if (Number.isFinite(distanceMeters) && distanceMeters <= 60) score += 8;
  else score -= 35;

  const lotDistrict = normalizeText(lot.district || extractDistrict(lot.roadAddress || lot.jibunAddress || lot.address || ''));
  const docDistrict = normalizeText(extractDistrict(`${doc.road_address_name || ''} ${doc.address_name || ''}`));
  if (lotDistrict && docDistrict && lotDistrict === docDistrict) score += 12;
  if (lotAddress && docAddress && addressTokensOverlap(lotAddress, docAddress)) score += 10;
  if (/주차/.test(categoryName)) score += 18;

  if (score < 0) return null;
  return { doc, score, distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null };
}

function addressTokensOverlap(a, b) {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const tokensA = a.split(/(?=\d|[가-힣]{2,})/).filter((t) => t.length >= 2);
  return tokensA.some((token) => b.includes(token));
}

function buildKakaoPlaceLinkCacheKey(lot) {
  return [
    String(lot.id || '').trim(),
    normalizeParkingName(lot.name),
    Number(lot.lat).toFixed(5),
    Number(lot.lng).toFixed(5)
  ].join('|');
}

function buildKakaoSearchUrlForParking(lot = {}) {
  const query = buildKakaoSearchQueryForParking(lot);
  return query ? `https://map.kakao.com/link/search/${encodeURIComponent(query)}` : '';
}

function buildKakaoSearchQueryForParking(lot = {}) {
  const name = String(lot.name || '').trim();
  const address = String(lot.roadAddress || lot.jibunAddress || lot.address || '').trim();
  const label = name && /주차/.test(name) ? name : [name, '주차장'].filter(Boolean).join(' ').trim();
  return [label, address].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || label || address;
}

function normalizeParkingName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s()\[\]{}·,._\-]/g, '')
    .trim();
}

function normalizeParkingCoreName(value) {
  return normalizeParkingName(value)
    .replace(/주차장|공영|공용|민영|노상|노외|부설|공공|무료|유료|주차타워|타워|주차빌딩|제\d+/g, '')
    .trim();
}

function normalizeAddress(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[(),.]/g, '');
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
}

function extractDistrict(value) {
  const text = String(value || '');
  const match = text.match(/([가-힣]+(?:시|군|구|읍|면|동))/);
  return match ? match[1] : '';
}

function isValidLatLng(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  return Number.isFinite(y) && Number.isFinite(x) && y >= 32 && y <= 39.5 && x >= 124 && x <= 132;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const options = { limit: 0, region: '', delay: DEFAULT_DELAY_MS, force: false, dryRun: false };
  argv.forEach((arg) => {
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.split('=')[1]) || 0;
    else if (arg.startsWith('--region=')) options.region = arg.slice('--region='.length).trim();
    else if (arg.startsWith('--delay=')) options.delay = Number(arg.split('=')[1]);
  });
  return options;
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}
