#!/usr/bin/env node
/*
 * 한눈체크 낚시터 찾기 4차 좌표 보정 검증 스크립트
 * 실행:
 *   node scripts/verify-fishing-map.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fail = [];
const warn = [];
const ok = [];
const GUNJA_EXPECTED = { name: '군자 낚시터', lat: 37.3596892325045, lng: 126.807925280972 };
const COORDINATE_EPSILON = 0.00001;

function readText(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    fail.push(`missing: ${rel}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

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

const html = readText('tools/fishing-spot-map.html');
const js = readText('assets/js/fishing-spot-map.js');
const css = readText('assets/css/life-map.css');
const index = readJson('assets/data/life/fishing-spots/index.json');

const requiredIds = [
  'fishing-map-tool', 'fishing-form', 'fishing-region', 'fishing-district', 'fishing-keyword',
  'fishing-type', 'fishing-fish', 'fishing-sort', 'fishing-use-location', 'fishing-status',
  'fishing-result-list', 'fishing-map', 'fishing-map-markers', 'fishing-selected-card',
  'fishing-map-toolbar-search', 'fishing-map-keyword', 'fishing-map-region', 'fishing-map-location',
  'fishing-mobile-list-toggle', 'fishing-mobile-bottom-sheet', 'fishing-mobile-results',
];
for (const id of requiredIds) {
  assert(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `html has #${id}`);
}

assert(js.includes("state.selectedId = ''"), 'js clears selectedId before region load');
assert(js.includes('requestId'), 'js guards async region-loading race');
assert(js.includes('syncMobileSheet'), 'js syncs mobile sheet open state');
assert(css.includes('.life-mobile-bottom-sheet.is-open'), 'css keeps mobile sheet closed until explicitly opened');
assert(css.includes('.life-mobile-bottom-sheet { display: none; }') || css.includes('.life-mobile-bottom-sheet { display: none'), 'mobile result sheet remains hidden by default');

if (index) {
  assert(index.type === 'fishing-spots', 'cache index type is fishing-spots');
  assert(Array.isArray(index.regions) && index.regions.length > 0, 'cache index has regions');
  assert(Number(index.totalItems) > 0, 'cache index has totalItems');

  const seenIds = new Set();
  let counted = 0;
  let invalidCoords = 0;
  let suspiciousCoords = 0;
  let missingName = 0;
  let missingRegionFile = 0;
  let gunjaItem = null;
  for (const region of index.regions || []) {
    const rel = `assets/data/life/fishing-spots/${region.file || `${region.key}.json`}`;
    const payload = readJson(rel);
    if (!payload) {
      missingRegionFile += 1;
      continue;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    counted += items.length;
    if (items.length !== region.count) warn.push(`${region.key}: index count ${region.count}, file count ${items.length}`);
    for (const item of items) {
      if (!item?.name) missingName += 1;
      const lat = Number(item?.lat);
      const lng = Number(item?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 39.5 || lng < 123 || lng > 132.5) invalidCoords += 1;
      if (['seoul', 'gyeonggi', 'incheon'].includes(item?.regionKey) && (lng < 124.5 || lng > 128.5)) {
        suspiciousCoords += 1;
        warn.push(`${region.key}: suspicious coordinate ${item?.name || '(unnamed)'} ${lat},${lng}`);
      }
      if (item?.name === GUNJA_EXPECTED.name && String(item?.address || '').includes('시흥')) gunjaItem = item;
      if (!item?.id) fail.push(`${region.key}: item id missing`);
      else if (seenIds.has(item.id)) fail.push(`duplicate item id: ${item.id}`);
      else seenIds.add(item.id);
    }
  }
  assert(missingRegionFile === 0, 'all region cache files exist');
  assert(counted === index.totalItems, `cache total count matches (${counted})`);
  assert(invalidCoords === 0, 'all coordinates are valid Korea-range WGS84');
  assert(missingName === 0, 'all items have names');
  assert(suspiciousCoords === 0, 'no suspicious 수도권 coordinates');
  assert(Boolean(gunjaItem), '군자 낚시터 exists in cache');
  if (gunjaItem) {
    assert(Math.abs(Number(gunjaItem.lat) - GUNJA_EXPECTED.lat) < COORDINATE_EPSILON, '군자 낚시터 latitude is manually fixed');
    assert(Math.abs(Number(gunjaItem.lng) - GUNJA_EXPECTED.lng) < COORDINATE_EPSILON, '군자 낚시터 longitude is manually fixed');
    assert(gunjaItem.coordinateFixed === true, '군자 낚시터 has coordinateFixed flag');
  }
}

console.log('[verify-fishing-map] ok:', ok.length);
if (warn.length) {
  console.warn('[verify-fishing-map] warnings');
  warn.forEach((message) => console.warn(`- ${message}`));
}
if (fail.length) {
  console.error('[verify-fishing-map] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-fishing-map] passed');
