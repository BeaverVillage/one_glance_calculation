#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const VERSION = '20260623-v129-location-search-ui-refine';
const RUNTIME = 'v129-location-search-ui-refine';
const tools = [
  {
    key: 'fishing',
    name: '낚시터',
    html: 'tools/fishing-spot-map.html',
    js: 'assets/js/fishing-spot-map.js',
    cache: 'assets/data/life/fishing-spots/index.json',
    defaultData: 'assets/data/life/fishing-spots/seoul.json',
    root: 'data-fishing-map-tool',
    list: 'fishing-result-list',
    selected: 'fishing-selected-card',
    mobileToggle: 'fishing-mobile-list-toggle',
    mobileSheet: 'fishing-mobile-bottom-sheet',
    markerLimit: 'const MAX_MARKERS = 220',
  },
  {
    key: 'wifi',
    name: '무료 와이파이',
    html: 'tools/free-wifi-map.html',
    js: 'assets/js/free-wifi-map.js',
    cache: 'assets/data/life/free-wifi/index.json',
    root: 'data-wifi-map-tool',
    list: 'wifi-result-list',
    selected: 'wifi-selected-card',
    mobileToggle: 'wifi-mobile-list-toggle',
    mobileSheet: 'wifi-mobile-bottom-sheet',
    markerLimit: 'const MAX_MARKERS = 300',
    district: true,
  },
  {
    key: 'toilet',
    name: '공중화장실',
    html: 'tools/public-toilet-map.html',
    js: 'assets/js/public-toilet-map.js',
    cache: 'assets/data/life/public-toilets/index.json',
    root: 'data-public-toilet-map-tool',
    list: 'toilet-result-list',
    selected: 'toilet-selected-card',
    mobileToggle: 'toilet-mobile-list-toggle',
    mobileSheet: 'toilet-mobile-bottom-sheet',
    markerLimit: 'const MAX_MARKERS = 300',
    district: true,
  },
];

let failures = 0;
const notes = [];

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const json = (file) => JSON.parse(read(file));
const assert = (condition, message) => {
  if (!condition) {
    failures += 1;
    console.error(`[fail] ${message}`);
  } else {
    notes.push(`[ok] ${message}`);
  }
};

const extractIds = (html) => new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));

const checkBasicContracts = (tool) => {
  assert(exists(tool.html), `${tool.name}: HTML exists`);
  assert(exists(tool.js), `${tool.name}: JS exists`);
  assert(exists(tool.cache), `${tool.name}: cache index exists`);
  const html = read(tool.html);
  const js = read(tool.js);
  const ids = extractIds(html);
  assert(html.includes(VERSION), `${tool.name}: v124 asset query applied`);
  assert(js.includes(`const VERSION = '${RUNTIME}'`), `${tool.name}: v129 runtime version applied`);
  assert(html.includes(tool.root), `${tool.name}: root data attribute exists`);
  [tool.list, tool.selected, tool.mobileToggle, tool.mobileSheet].forEach((id) => assert(ids.has(id), `${tool.name}: #${id} exists`));
  assert(new RegExp(`<[^>]*id="${tool.selected}"[^>]*hidden|<[^>]*hidden[^>]*id="${tool.selected}"`).test(html), `${tool.name}: selected card hidden by default`);
  assert(new RegExp(`id="${tool.mobileToggle}"[^>]*aria-expanded="false"`).test(html), `${tool.name}: mobile toggle starts collapsed`);
  assert(!new RegExp(`id="${tool.mobileSheet}"[^>]*is-open`).test(html), `${tool.name}: mobile sheet not open in HTML`);
  assert(js.includes('selectedId: \'\''), `${tool.name}: selectedId initial value is empty`);
  assert(!js.includes('state.items[0]?.id') && !js.includes('state.items[0].id'), `${tool.name}: first item auto-select pattern absent`);
  assert(js.includes(tool.markerLimit), `${tool.name}: marker limit safeguard exists`);
  assert(js.includes('requestId') && js.includes('state.requestId'), `${tool.name}: requestId race guard exists`);
  assert(js.includes("fetchJson('/api/config', { cache: 'no-store' })"), `${tool.name}: /api/config remains no-store`);
  assert(!js.includes("fetchJson(`${CACHE_BASE}/index.json" + ", { cache: 'no-store'"), `${tool.name}: static cache index not forced no-store`);
};

const checkDesktopContracts = (tool, css) => {
  const html = read(tool.html);
  assert(html.includes('parking-dashboard__main'), `${tool.name} PC: dashboard main exists`);
  assert(html.includes('parking-dashboard__results'), `${tool.name} PC: desktop result panel exists`);
  assert(html.includes('parking-dashboard__map'), `${tool.name} PC: map column exists`);
  assert(css.includes('.life-map-dashboard.parking-dashboard') && css.includes('grid-template-columns'), `${tool.name} PC: life grid layout CSS exists`);
  assert(css.includes('.life-map-card') && css.includes('min-height'), `${tool.name} PC: map card sizing CSS exists`);
  assert(html.includes('life-selected-card'), `${tool.name} PC: map selected overlay exists`);
};

const checkMobileContracts = (tool, css) => {
  const html = read(tool.html);
  const js = read(tool.js);
  assert(css.includes('.life-mobile-bottom-sheet { display: none; }'), `${tool.name} mobile: bottom sheet hidden by default`);
  assert(css.includes('.life-mobile-bottom-sheet.is-open { display: block; }'), `${tool.name} mobile: bottom sheet opens only with class`);
  assert(css.includes('@media (max-width: 860px)') && css.includes('.life-map-app .parking-dashboard__results { display: none; }'), `${tool.name} mobile: desktop list hidden only in mobile media query`);
  assert(html.includes('parking-mobile-list-toggle'), `${tool.name} mobile: list toggle exists`);
  assert(html.includes('지도 보기'), `${tool.name} mobile: map-return button text exists`);
  assert(js.includes('mobileOpen: false'), `${tool.name} mobile: mobileOpen defaults false`);
  assert(js.includes('state.mobileOpen = !state.mobileOpen'), `${tool.name} mobile: toggle handler exists`);
  assert(js.includes('state.mobileOpen = false'), `${tool.name} mobile: map-return closes sheet`);
};

const checkCacheContracts = (tool) => {
  const index = json(tool.cache);
  assert(Number(index.totalItems || 0) > 0, `${tool.name} cache: totalItems > 0`);
  assert(Array.isArray(index.regions) && index.regions.length >= 1, `${tool.name} cache: regions exist`);
  if (tool.district) {
    const seoul = index.regions.find((region) => region.key === 'seoul') || index.regions[0];
    assert(seoul && Array.isArray(seoul.districts) && seoul.districts.length > 0, `${tool.name} cache: default region has districts`);
    const district = seoul.districts[0];
    assert(district && exists(`assets/data/life/${tool.key === 'wifi' ? 'free-wifi' : 'public-toilets'}/${district.file}`), `${tool.name} cache: default district file exists`);
    const payload = json(`assets/data/life/${tool.key === 'wifi' ? 'free-wifi' : 'public-toilets'}/${district.file}`);
    assert(Array.isArray(payload.items) && payload.items.length > 0, `${tool.name} cache: default district has items`);
  } else {
    const payload = json(tool.defaultData);
    assert(Array.isArray(payload.items) && payload.items.length > 0, `${tool.name} cache: default region has items`);
  }
};

const checkDistrictLoadHardening = (tool) => {
  if (!tool.district) return;
  const js = read(tool.js);
  const loadDistrictStart = js.indexOf('const loadDistrict = async');
  const loadIndexPos = js.indexOf('await loadIndex();', loadDistrictStart);
  const requestIdPos = js.indexOf('const requestId = state.requestId + 1;', loadDistrictStart);
  const tryPos = js.indexOf('try {', loadDistrictStart);
  const catchPos = js.indexOf('catch (error)', loadDistrictStart);
  assert(requestIdPos > loadDistrictStart && requestIdPos < loadIndexPos, `${tool.name}: requestId is set before index fetch`);
  assert(tryPos > loadDistrictStart && tryPos < loadIndexPos && catchPos > loadIndexPos, `${tool.name}: index fetch is inside try/catch`);
  assert(js.includes('state.currentDistrict = \'\''), `${tool.name}: index/cache failure clears currentDistrict safely`);
};

const checkDeployExclusions = () => {
  ['cache/public-toilets/geocode-success.json', 'cache/public-toilets/prepared-items.json', 'data/source/fishing-spots.csv', 'data/source/free-wifi.csv', 'data/source/public-toilets.csv'].forEach((file) => {
    assert(!exists(file), `deployment: build-only file excluded: ${file}`);
  });
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((entry) => {
      const rel = path.join(dir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(rel);
      else files.push(rel);
    });
  };
  ['assets', 'tools', 'scripts', 'functions', 'docs'].forEach((dir) => exists(dir) && walk(dir));
  const tooLarge = files.filter((file) => fs.statSync(path.join(ROOT, file)).size > 25 * 1024 * 1024);
  assert(tooLarge.length === 0, `deployment: no file exceeds 25MB${tooLarge.length ? ` (${tooLarge.join(', ')})` : ''}`);
};

const css = read('assets/css/life-map.css');
for (let pass = 1; pass <= 3; pass += 1) {
  tools.forEach((tool) => {
    if (pass === 1) {
      checkBasicContracts(tool);
      checkCacheContracts(tool);
    }
    if (pass === 2) {
      checkDesktopContracts(tool, css);
      checkMobileContracts(tool, css);
      checkDistrictLoadHardening(tool);
    }
    if (pass === 3) {
      checkBasicContracts(tool);
      checkCacheContracts(tool);
      checkDesktopContracts(tool, css);
      checkMobileContracts(tool, css);
      checkDistrictLoadHardening(tool);
    }
  });
  if (pass === 3) checkDeployExclusions();
}

if (failures) {
  console.error(`[verify-life-maps-triple-stability] failed: ${failures}`);
  process.exit(1);
}
console.log('[verify-life-maps-triple-stability] passed');
console.log(`checks: ${notes.length}`);
