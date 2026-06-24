#!/usr/bin/env node
/*
 * 한눈체크 공중화장실 주소 → 좌표 변환 스크립트
 *
 * 준비:
 *   $env:KAKAO_REST_API_KEY="카카오_REST_API_키"
 *
 * 실행:
 *   node scripts/geocode-public-toilets.js
 *   node scripts/geocode-public-toilets.js --limit=1000 --delay=200
 *   node scripts/geocode-public-toilets.js --retry-failed
 *
 * 입력:
 *   cache/public-toilets/geocode-targets.json
 *
 * 출력:
 *   cache/public-toilets/geocode-success.json
 *   cache/public-toilets/geocode-failed.json
 *   cache/public-toilets/geocode-progress.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v114-public-toilet-geocode-phase8';
const args = parseArgs(process.argv.slice(2));
const CACHE_DIR = path.resolve(ROOT, args.cache || 'cache/public-toilets');
const TARGETS_FILE = path.join(CACHE_DIR, 'geocode-targets.json');
const SUCCESS_FILE = path.join(CACHE_DIR, 'geocode-success.json');
const FAILED_FILE = path.join(CACHE_DIR, 'geocode-failed.json');
const PROGRESS_FILE = path.join(CACHE_DIR, 'geocode-progress.json');
const API_KEY = process.env.KAKAO_REST_API_KEY || process.env.KAKAO_REST_KEY || '';
const DELAY_MS = Math.max(80, Number(args.delay || 180));
const LIMIT = Number(args.limit || 0);
const SAVE_EVERY = Math.max(10, Number(args['save-every'] || 50));
const RETRY_FAILED = Boolean(args['retry-failed']);

main().catch((error) => {
  console.error('[public-toilet-geocode] failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

async function main() {
  if (!API_KEY) {
    console.error('[public-toilet-geocode] KAKAO_REST_API_KEY 환경변수가 없습니다.');
    console.error('PowerShell 예: $env:KAKAO_REST_API_KEY="너의_카카오_REST_API_키"');
    process.exit(1);
  }
  const targetsPayload = readJson(TARGETS_FILE, null);
  const targets = Array.isArray(targetsPayload?.targets) ? targetsPayload.targets : [];
  if (!targets.length) {
    console.error('[public-toilet-geocode] geocode-targets.json이 비어 있습니다. 먼저 prepare-public-toilet-addresses.js를 실행하세요.');
    process.exit(1);
  }

  const success = readJson(SUCCESS_FILE, defaultStore('public-toilet-geocode-success'));
  const failed = readJson(FAILED_FILE, defaultStore('public-toilet-geocode-failed'));
  if (RETRY_FAILED) failed.items = {};
  ensureStore(success, 'public-toilet-geocode-success');
  ensureStore(failed, 'public-toilet-geocode-failed');

  const pending = targets.filter((target) => {
    if (success.items[target.targetId]) return false;
    if (!RETRY_FAILED && failed.items[target.targetId]) return false;
    return true;
  }).slice(0, LIMIT > 0 ? LIMIT : undefined);

  const progress = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    totalTargets: targets.length,
    alreadySuccess: Object.keys(success.items).length,
    alreadyFailed: Object.keys(failed.items).length,
    pendingThisRun: pending.length,
    processedThisRun: 0,
    successThisRun: 0,
    failedThisRun: 0,
    lastTargetId: '',
    delayMs: DELAY_MS,
  };
  writeJson(PROGRESS_FILE, progress);

  for (const target of pending) {
    const result = await geocodeTarget(target);
    progress.processedThisRun += 1;
    progress.lastTargetId = target.targetId;
    progress.updatedAt = new Date().toISOString();
    if (result.ok) {
      success.items[target.targetId] = result.value;
      delete failed.items[target.targetId];
      progress.successThisRun += 1;
    } else {
      failed.items[target.targetId] = result.value;
      progress.failedThisRun += 1;
    }
    if (progress.processedThisRun % SAVE_EVERY === 0) {
      flush(success, failed, progress);
      console.log(`[public-toilet-geocode] ${progress.processedThisRun}/${pending.length} processed, success +${progress.successThisRun}, failed +${progress.failedThisRun}`);
    }
    await sleep(DELAY_MS);
  }

  flush(success, failed, progress);
  console.log('[public-toilet-geocode] done');
  console.log(JSON.stringify({
    totalTargets: targets.length,
    success: Object.keys(success.items).length,
    failed: Object.keys(failed.items).length,
    processedThisRun: progress.processedThisRun,
    successThisRun: progress.successThisRun,
    failedThisRun: progress.failedThisRun,
  }, null, 2));
}

async function geocodeTarget(target) {
  const candidates = Array.isArray(target.candidateAddresses) && target.candidateAddresses.length
    ? target.candidateAddresses
    : [target.address].filter(Boolean);
  const tried = [];
  for (const address of candidates) {
    const query = String(address || '').trim();
    if (!query) continue;
    try {
      const data = await kakaoAddressSearch(query);
      tried.push({ address: query, status: data.status, documents: data.documents?.length || 0 });
      const doc = Array.isArray(data.documents) ? data.documents[0] : null;
      const lat = Number(doc?.y);
      const lng = Number(doc?.x);
      if (doc && isValidKoreaCoordinate(lat, lng)) {
        return {
          ok: true,
          value: {
            targetId: target.targetId,
            address: target.address,
            sourceAddress: query,
            lat,
            lng,
            regionKey: target.regionKey,
            region: target.region,
            district: target.district,
            matchedAddress: doc.address_name || doc.road_address?.address_name || doc.address?.address_name || '',
            roadAddress: doc.road_address?.address_name || '',
            lotAddress: doc.address?.address_name || '',
            x: doc.x,
            y: doc.y,
            itemCount: Array.isArray(target.itemIds) ? target.itemIds.length : 0,
            geocodedAt: new Date().toISOString(),
            provider: 'kakao-local-address',
          },
        };
      }
    } catch (error) {
      if (error.statusCode === 401 || error.statusCode === 403) throw error;
      tried.push({ address: query, error: error.message || String(error) });
    }
  }
  return {
    ok: false,
    value: {
      targetId: target.targetId,
      address: target.address,
      candidateAddresses: candidates,
      regionKey: target.regionKey,
      region: target.region,
      district: target.district,
      representativeName: target.representativeName,
      itemCount: Array.isArray(target.itemIds) ? target.itemIds.length : 0,
      tried,
      failedAt: new Date().toISOString(),
      reason: 'NO_KAKAO_ADDRESS_RESULT',
    },
  };
}

function kakaoAddressSearch(query) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', query);
  url.searchParams.set('analyze_type', 'similar');
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { Authorization: `KakaoAK ${API_KEY}` },
      timeout: 10000,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`Kakao API HTTP ${response.statusCode}: ${body.slice(0, 200)}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        try {
          const parsed = JSON.parse(body);
          parsed.status = response.statusCode;
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('Kakao API timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

function flush(success, failed, progress) {
  success.version = VERSION;
  success.type = 'public-toilet-geocode-success';
  success.updatedAt = new Date().toISOString();
  success.totalItems = Object.keys(success.items).length;
  failed.version = VERSION;
  failed.type = 'public-toilet-geocode-failed';
  failed.updatedAt = new Date().toISOString();
  failed.totalItems = Object.keys(failed.items).length;
  writeJson(SUCCESS_FILE, success);
  writeJson(FAILED_FILE, failed);
  writeJson(PROGRESS_FILE, progress);
}

function defaultStore(type) {
  return { version: VERSION, type, updatedAt: new Date().toISOString(), totalItems: 0, items: {} };
}

function ensureStore(store, type) {
  if (!store.items || typeof store.items !== 'object' || Array.isArray(store.items)) store.items = {};
  store.type = type;
  store.version = store.version || VERSION;
}

function isValidKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.5 && lng >= 123 && lng <= 132.5;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
