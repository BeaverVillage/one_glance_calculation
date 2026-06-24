#!/usr/bin/env node
/*
 * 한눈체크 무료 와이파이 로컬 캐시 검증 스크립트
 * 실행:
 *   node scripts/verify-free-wifi-cache.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fail = [];
const warn = [];
const ok = [];
const MAX_DISTRICT_FILE_BYTES = 1024 * 1024 * 3;

function readJson(rel) {
  const file = path.join(ROOT, rel);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail.push(`json parse failed: ${rel} (${error.message})`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) fail.push(message);
  else ok.push(message);
}

function isValidKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.5 && lng >= 123 && lng <= 132.5;
}

const index = readJson('assets/data/life/free-wifi/index.json');
if (index) {
  assert(index.version === 'v111-life-free-wifi-cache-phase5', 'free-wifi cache version is v111 phase5');
  assert(index.type === 'free-wifi', 'cache index type is free-wifi');
  assert(Number(index.totalItems) > 0, 'cache index has totalItems');
  assert(Array.isArray(index.regions) && index.regions.length > 0, 'cache index has regions');
  assert(index.filters && Array.isArray(index.filters.facilityTypes), 'cache index has facility filter values');
  assert(index.filters && Array.isArray(index.filters.providers), 'cache index has provider filter values');

  const seenIds = new Set();
  let counted = 0;
  let invalidCoords = 0;
  let missingName = 0;
  let missingRegion = 0;
  let missingDistrict = 0;
  let missingFiles = 0;
  let districtFiles = 0;
  let ssidCount = 0;
  let noSsidCount = 0;

  for (const region of index.regions || []) {
    assert(Boolean(region.key), 'region has key');
    assert(Boolean(region.label), `${region.key || 'region'} has label`);
    assert(Array.isArray(region.districts) && region.districts.length > 0, `${region.key} has district files`);
    let regionCount = 0;
    for (const district of region.districts || []) {
      const rel = `assets/data/life/free-wifi/${district.file}`;
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        fail.push(`missing district file: ${rel}`);
        missingFiles += 1;
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.size > MAX_DISTRICT_FILE_BYTES) warn.push(`${district.file}: large district cache ${(stat.size / 1024 / 1024).toFixed(2)}MB`);
      const payload = readJson(rel);
      if (!payload) continue;
      districtFiles += 1;
      assert(payload.type === 'free-wifi', `${district.file} type is free-wifi`);
      assert(payload.region?.key === region.key, `${district.file} region key matches`);
      assert(payload.district?.key === district.key, `${district.file} district key matches`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      counted += items.length;
      regionCount += items.length;
      if (items.length !== district.count) warn.push(`${district.file}: index count ${district.count}, file count ${items.length}`);
      for (const item of items) {
        if (!item?.id) fail.push(`${district.file}: item id missing`);
        else if (seenIds.has(item.id)) fail.push(`duplicate item id: ${item.id}`);
        else seenIds.add(item.id);
        if (!item?.name) missingName += 1;
        if (!item?.regionKey || !item?.region) missingRegion += 1;
        if (!item?.district || !item?.districtKey) missingDistrict += 1;
        const lat = Number(item?.lat);
        const lng = Number(item?.lng);
        if (!isValidKoreaCoordinate(lat, lng)) invalidCoords += 1;
        if (item?.details?.ssid) ssidCount += 1;
        else noSsidCount += 1;
      }
    }
    if (regionCount !== region.count) warn.push(`${region.key}: index count ${region.count}, district sum ${regionCount}`);
  }

  assert(missingFiles === 0, 'all district cache files exist');
  assert(districtFiles > 0, 'district cache files are readable');
  assert(counted === index.totalItems, `cache total count matches (${counted})`);
  assert(invalidCoords === 0, 'all coordinates are valid Korea-range WGS84');
  assert(missingName === 0, 'all items have names');
  assert(missingRegion === 0, 'all items have region labels');
  assert(missingDistrict === 0, 'all items have district labels');
  assert((index.stats?.hasSsid || 0) === ssidCount, 'SSID count matches index stats');
  assert((index.stats?.noSsid || 0) === noSsidCount, 'missing SSID count matches index stats');
  assert(districtFiles <= 280, `district file count is controlled (${districtFiles})`);
}

console.log('[verify-free-wifi-cache] ok:', ok.length);
if (warn.length) {
  console.warn('[verify-free-wifi-cache] warnings');
  warn.forEach((message) => console.warn(`- ${message}`));
}
if (fail.length) {
  console.error('[verify-free-wifi-cache] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-free-wifi-cache] passed');
