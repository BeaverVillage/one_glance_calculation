#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fail = [];
const ok = [];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const assert = (condition, message) => condition ? ok.push(message) : fail.push(message);

const html = read('tools/public-toilet-map.html');
const js = read('assets/js/public-toilet-map.js');
const css = read('assets/css/life-map.css');
const requiredIds = [
  'public-toilet-map-tool','toilet-form','toilet-region','toilet-district','toilet-keyword','toilet-category','toilet-open-type','toilet-sort',
  'toilet-open-always','toilet-disabled','toilet-baby','toilet-bell','toilet-cctv','toilet-use-location','toilet-status','toilet-result-list',
  'toilet-map','toilet-map-markers','toilet-selected-card','toilet-mobile-list-toggle','toilet-mobile-bottom-sheet','toilet-map-region','toilet-map-district',
];
requiredIds.forEach((id) => assert(html.includes(`id="${id}"`), `html has #${id}`));
assert(html.includes('data-public-toilet-map-tool'), 'html has public toilet root marker');
assert(html.includes('/assets/js/public-toilet-map.js?v=20260623-v129-location-search-ui-refine'), 'html uses v129 public toilet js');
assert(html.includes('/assets/data/life/public-toilets') === false, 'html does not hardcode cache payload path');
assert(css.includes('.toilet-map-app'), 'life-map.css has toilet styles');
assert(css.includes('.toilet-marker'), 'life-map.css has toilet marker styles');
assert(js.includes("const CACHE_BASE = '/assets/data/life/public-toilets'"), 'js uses public toilet cache base');
assert(js.includes("const VERSION = 'v129-location-search-ui-refine'"), 'js uses v129 runtime version');
assert(js.includes('MAX_MARKERS = 300'), 'js limits markers');
assert(js.includes('MAX_DISTRICT_CACHE = 12'), 'js limits district cache');
assert(js.includes('state.selectedId = \'\''), 'js clears selectedId while loading/filtering');
assert(js.includes('requestId'), 'js has requestId race guard');
assert(js.includes('mobileSheet') && js.includes('is-open'), 'js supports mobile bottom sheet');
assert(js.includes('hasDisabledToilet'), 'js reads disabled toilet field');
assert(js.includes('hasBabyChanging'), 'js reads baby changing field');
assert(js.includes('hasEmergencyBell'), 'js reads emergency bell field');

const jsonBlocks = Array.from(html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g));
assert(jsonBlocks.length >= 3, 'public toilet page has JSON-LD blocks');
for (const match of jsonBlocks) {
  try { JSON.parse(match[1]); ok.push('JSON-LD block parses'); }
  catch (error) { fail.push(`JSON-LD parse failed: ${error.message}`); }
}

console.log('[verify-public-toilet-map] ok:', ok.length);
if (fail.length) {
  console.error('[verify-public-toilet-map] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-public-toilet-map] passed');
