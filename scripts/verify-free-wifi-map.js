#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];
const fail = (message) => errors.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'tools/free-wifi-map.html',
  'assets/js/free-wifi-map.js',
  'assets/css/life-map.css',
  'assets/data/life/free-wifi/index.json',
];
requiredFiles.forEach((file) => { if (!exists(file)) fail(`missing required file: ${file}`); });

if (errors.length) {
  console.error('[verify-free-wifi-map] failed');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const html = read('tools/free-wifi-map.html');
const js = read('assets/js/free-wifi-map.js');
const css = read('assets/css/life-map.css');
const index = JSON.parse(read('assets/data/life/free-wifi/index.json'));

[
  'wifi-map-tool', 'wifi-form', 'wifi-region', 'wifi-district', 'wifi-keyword',
  'wifi-facility', 'wifi-provider', 'wifi-sort', 'wifi-result-list', 'wifi-map',
  'wifi-map-markers', 'wifi-selected-card', 'wifi-mobile-list-toggle', 'wifi-mobile-bottom-sheet',
  'wifi-map-region', 'wifi-map-district', 'wifi-map-keyword'
].forEach((id) => {
  if (!html.includes(`id="${id}"`)) fail(`missing html id: ${id}`);
});

[
  "const CACHE_BASE = '/assets/data/life/free-wifi'",
  "const VERSION = 'v129-location-search-ui-refine'",
  'const MAX_LIST = 50',
  'const MAX_MARKERS = 300',
  'const MAX_DISTRICT_CACHE = 12',
  'prepareRuntimeItem',
  'rememberDistrictCache',
  'scheduleRender',
  'mapAutoFitPending',
  "state.selectedId = ''",
  'requestId',
  'populateDistrictOptions',
  "loadDistrict('seoul')",
  'data-wifi-select',
  '현장 확인 필요',
  'groupWifiInstallations',
  'data-wifi-installations'
].forEach((needle) => {
  if (!js.includes(needle)) fail(`missing js safeguard: ${needle}`);
});

[
  '.wifi-hero-band', '.wifi-map-app', '.wifi-marker'
].forEach((needle) => {
  if (!css.includes(needle)) fail(`missing css selector: ${needle}`);
});

if (index.type !== 'free-wifi') fail('free-wifi index type mismatch');
if (!Array.isArray(index.regions) || index.regions.length < 10) fail('free-wifi regions are missing');
if (!Number.isFinite(Number(index.totalItems)) || Number(index.totalItems) < 90000) fail('free-wifi totalItems looks too small');

let fileCount = 0;
let itemCount = 0;
const ids = new Set();
for (const region of index.regions || []) {
  if (!Array.isArray(region.districts) || !region.districts.length) fail(`missing districts for region: ${region.key}`);
  for (const district of region.districts || []) {
    const file = path.join('assets/data/life/free-wifi', district.file || '');
    if (!district.file || !exists(file)) {
      fail(`missing district cache: ${district.file || `${region.key}/${district.key}`}`);
      continue;
    }
    fileCount += 1;
    const payload = JSON.parse(read(file));
    if (!Array.isArray(payload.items)) fail(`items missing in ${file}`);
    itemCount += payload.items.length;
    payload.items.forEach((item) => {
      if (!item.id) fail(`missing id in ${file}`);
      if (ids.has(item.id)) fail(`duplicated id: ${item.id}`);
      ids.add(item.id);
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 39.5 || lng < 123 || lng > 132.5) {
        fail(`invalid coordinate: ${item.id} ${lat},${lng}`);
      }
    });
  }
}

if (fileCount < 200) fail(`district file count looks too small: ${fileCount}`);
if (itemCount !== index.totalItems) fail(`total item mismatch: index ${index.totalItems}, files ${itemCount}`);

if (errors.length) {
  console.error('[verify-free-wifi-map] failed');
  errors.slice(0, 50).forEach((error) => console.error(`- ${error}`));
  if (errors.length > 50) console.error(`... and ${errors.length - 50} more`);
  process.exit(1);
}

console.log('[verify-free-wifi-map] passed');
console.log(`regions: ${index.regions.length}, district files: ${fileCount}, items: ${itemCount}`);
