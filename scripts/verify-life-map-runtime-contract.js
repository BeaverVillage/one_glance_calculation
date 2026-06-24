#!/usr/bin/env node
/*
 * 생활지도 3종 런타임 계약 검증
 * 실행:
 *   node scripts/verify-life-map-runtime-contract.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const errors = [];
const ok = [];
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const assert = (condition, message) => condition ? ok.push(message) : errors.push(message);

const SHARED_VERSION = '20260623-v129-location-search-ui-refine';
const tools = [
  {
    name: '낚시터',
    html: 'tools/fishing-spot-map.html',
    js: 'assets/js/fishing-spot-map.js',
    dataIndex: 'assets/data/life/fishing-spots/index.json',
    runtimeVersion: 'v129-location-search-ui-refine',
    mapRoot: 'data-fishing-map-tool',
    defaultRegion: 'seoul',
  },
  {
    name: '무료 와이파이',
    html: 'tools/free-wifi-map.html',
    js: 'assets/js/free-wifi-map.js',
    dataIndex: 'assets/data/life/free-wifi/index.json',
    runtimeVersion: 'v129-location-search-ui-refine',
    mapRoot: 'data-wifi-map-tool',
    defaultRegion: 'seoul',
    defaultDistrictLabel: '강남구',
  },
  {
    name: '공중화장실',
    html: 'tools/public-toilet-map.html',
    js: 'assets/js/public-toilet-map.js',
    dataIndex: 'assets/data/life/public-toilets/index.json',
    runtimeVersion: 'v129-location-search-ui-refine',
    mapRoot: 'data-public-toilet-map-tool',
    defaultRegion: 'seoul',
    defaultDistrictLabel: '강남구',
  },
];

for (const tool of tools) {
  assert(exists(tool.html), `${tool.name}: html exists`);
  assert(exists(tool.js), `${tool.name}: js exists`);
  assert(exists(tool.dataIndex), `${tool.name}: index cache exists`);
  if (!exists(tool.html) || !exists(tool.js) || !exists(tool.dataIndex)) continue;
  const html = read(tool.html);
  const js = read(tool.js);
  const index = readJson(tool.dataIndex);
  assert(html.includes(SHARED_VERSION), `${tool.name}: html asset query is v129-location-search-ui-refine`);
  assert(js.includes(`const VERSION = '${tool.runtimeVersion}'`), `${tool.name}: js runtime version is v129-location-search-ui-refine`);
  assert(html.includes(tool.mapRoot), `${tool.name}: html has root marker`);
  assert(js.includes("selectedId: ''"), `${tool.name}: initial selectedId is empty`);
  assert(!/selectedId\s*=\s*state\.items\[0\]/.test(js), `${tool.name}: no first-item autoselect pattern`);
  const markerMatch = js.match(/MAX_MARKERS\s*=\s*(\d+)/);
  assert(Boolean(markerMatch) && Number(markerMatch[1]) <= 500, `${tool.name}: marker limit exists and is <= 500`);
  assert(js.includes('requestId'), `${tool.name}: request race guard exists`);
  const region = (index.regions || []).find((entry) => entry.key === tool.defaultRegion);
  assert(Boolean(region), `${tool.name}: default Seoul region exists`);
  if (tool.defaultDistrictLabel) {
    assert((region?.districts || []).some((district) => district.label === tool.defaultDistrictLabel), `${tool.name}: default Gangnam district exists`);
  }
}

const sourceFiles = [
  'data/source/fishing-spots.csv',
  'data/source/낚시터정보.csv',
  'data/source/free-wifi.csv',
  'data/source/무료와이파이정보.csv',
  'data/source/public-toilets.csv',
  'data/source/공중화장실정보.csv',
  'cache/public-toilets/prepared-items.json',
  'cache/public-toilets/geocode-targets.json',
  'cache/public-toilets/geocode-success.json',
];
sourceFiles.forEach((rel) => assert(!exists(rel), `deploy excludes build-only file: ${rel}`));

const toiletIndex = exists('assets/data/life/public-toilets/index.json') ? readJson('assets/data/life/public-toilets/index.json') : null;
if (toiletIndex) {
  assert(toiletIndex.version === 'v117-life-public-toilet-region-repair', 'public toilet cache has region repair version');
  const seoul = (toiletIndex.regions || []).find((region) => region.key === 'seoul');
  const gyeonggi = (toiletIndex.regions || []).find((region) => region.key === 'gyeonggi');
  const gyeongbuk = (toiletIndex.regions || []).find((region) => region.key === 'gyeongbuk');
  const gangwon = (toiletIndex.regions || []).find((region) => region.key === 'gangwon');
  const seoulLabels = new Set((seoul?.districts || []).map((district) => district.label));
  assert(!seoulLabels.has('시흥시'), 'public toilet: 시흥시는 서울이 아니라 경기로 분류');
  assert(!seoulLabels.has('김천시'), 'public toilet: 김천시는 서울이 아니라 경북으로 분류');
  assert(!seoulLabels.has('홍천군'), 'public toilet: 홍천군은 서울이 아니라 강원으로 분류');
  assert((gyeonggi?.districts || []).some((district) => district.label === '시흥시'), 'public toilet: 경기 시흥시 존재');
  assert((gyeongbuk?.districts || []).some((district) => district.label === '김천시'), 'public toilet: 경북 김천시 존재');
  assert((gangwon?.districts || []).some((district) => district.label === '홍천군'), 'public toilet: 강원 홍천군 존재');
}

console.log('[verify-life-map-runtime-contract] ok:', ok.length);
if (errors.length) {
  console.error('[verify-life-map-runtime-contract] failed');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-life-map-runtime-contract] passed');
