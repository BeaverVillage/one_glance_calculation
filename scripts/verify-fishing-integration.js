#!/usr/bin/env node
/*
 * 한눈체크 낚시터 찾기 4차 좌표 보정 통합 검증 스크립트
 * 실행:
 *   node scripts/verify-fishing-integration.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fail = [];
const ok = [];

function readText(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    fail.push(`missing: ${rel}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}
function assert(condition, message) {
  if (condition) ok.push(message);
  else fail.push(message);
}

const index = readText('index.html');
const sitemap = readText('sitemap.xml');
const dataSources = readText('data-sources.html');
const page = readText('tools/fishing-spot-map.html');
const appJs = readText('assets/js/fishing-spot-map.js');
const css = readText('assets/css/life-map.css');
const cacheIndexPath = 'assets/data/life/fishing-spots/index.json';
const cacheIndexText = readText(cacheIndexPath);

assert(index.includes('/tools/fishing-spot-map.html'), 'index links fishing page');
assert(index.includes('낚시터 찾기'), 'index displays fishing feature name');
assert(index.includes('https://hannuncheck.com/tools/fishing-spot-map.html'), 'home JSON-LD includes fishing url');
assert(sitemap.includes('https://hannuncheck.com/tools/fishing-spot-map.html'), 'sitemap includes fishing page');
assert(dataSources.includes('지방행정 인허가 데이터 낚시터정보'), 'data-sources includes fishing source');
assert(dataSources.includes('로컬 JSON 캐시'), 'data-sources explains local JSON cache');
assert(page.includes('20260623-v129-location-search-ui-refine'), 'fishing page has v129 cache-busting query');
assert(appJs.includes('MAX_MARKERS'), 'fishing JS contains marker limit guard');
assert(css.includes('life-mobile-bottom-sheet'), 'life map css includes mobile sheet styles');

let cacheIndex = null;
try {
  cacheIndex = JSON.parse(cacheIndexText);
  ok.push('cache index parses');
} catch (error) {
  fail.push(`cache index parse failed: ${error.message}`);
}
if (cacheIndex) {
  assert(['v110-life-fishing-cache-coordinate-fix','v128-life-fishing-cache-location-repair'].includes(cacheIndex.version), 'cache index version is supported');
  assert(cacheIndex.totalItems > 0, 'cache index has items');
  assert(Array.isArray(cacheIndex.regions) && cacheIndex.regions.length >= 10, 'cache index has region list');
}

console.log('[verify-fishing-integration] ok:', ok.length);
if (fail.length) {
  console.error('[verify-fishing-integration] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-fishing-integration] passed');
