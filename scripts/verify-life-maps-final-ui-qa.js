#!/usr/bin/env node
/* 17차 생활지도 3종 PC/모바일 최종 UI QA 검증 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const errors = [];
const ok = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const assert = (condition, message) => (condition ? ok.push(message) : errors.push(message));
const version = '20260623-v129-location-search-ui-refine';
const runtime = 'v129-location-search-ui-refine';
const tools = [
  { name: '낚시터', html: 'tools/fishing-spot-map.html', js: 'assets/js/fishing-spot-map.js', close: 'data-fishing-close', select: 'data-life-card-select', mapText: '카카오맵 바로가기' },
  { name: '무료 와이파이', html: 'tools/free-wifi-map.html', js: 'assets/js/free-wifi-map.js', close: 'data-wifi-close', select: 'data-life-card-select', mapText: '카카오맵 바로가기' },
  { name: '공중화장실', html: 'tools/public-toilet-map.html', js: 'assets/js/public-toilet-map.js', close: 'data-toilet-close', select: 'data-life-card-select', mapText: '카카오맵 바로가기' },
];
for (const tool of tools) {
  assert(exists(tool.html), `${tool.name}: html exists`);
  assert(exists(tool.js), `${tool.name}: js exists`);
  const html = read(tool.html);
  const js = read(tool.js);
  assert(html.includes(version), `${tool.name}: v129-location-search-ui-refine cache busting applied`);
  assert(js.includes(`const VERSION = '${runtime}'`), `${tool.name}: v129-location-search-ui-refine runtime version applied`);
  assert(html.includes('life-dashboard-main'), `${tool.name}: map/list dashboard exists`);
  assert(html.includes('life-mobile-bottom-sheet'), `${tool.name}: mobile bottom sheet exists`);
  assert(html.includes('data-life-filter-toggle'), `${tool.name}: mobile filter button exists`);
  assert(js.includes('attachDragToSheet'), `${tool.name}: drag sheet handler exists`);
  assert(js.includes('resetAdvancedFilters'), `${tool.name}: filter reset exists`);
  assert(js.includes(tool.select), `${tool.name}: whole-card selection hook exists`);
  assert(js.includes(tool.close), `${tool.name}: selected card close hook exists`);
  assert(js.includes(tool.mapText), `${tool.name}: Kakao map button text exists`);
  assert(!js.includes('지도 확인</a>') && !js.includes('카카오맵 확인</a>'), `${tool.name}: old map button wording removed`);
  assert(js.includes('recommend'), `${tool.name}: recommend sort exists`);
  assert(js.includes('distanceSourceLabel'), `${tool.name}: distance basis label exists`);
  assert(js.includes('MAX_MARKERS'), `${tool.name}: marker limit safeguard exists`);
  assert(js.includes('requestId'), `${tool.name}: race guard exists`);
}
const css = read('assets/css/life-map.css');
for (const snippet of [
  'grid-template-columns: var(--life-left-width) minmax(0, 1fr) !important',
  'min-height: 640px',
  '.life-mobile-bottom-sheet .parking-mobile-results',
  'touch-action: pan-y',
  '.life-map-toolbar',
  'max-height: 56vh',
  'content-visibility: auto',
]) {
  assert(css.includes(snippet), `css contains final UI QA rule: ${snippet}`);
}
const wifiHtml = read('tools/free-wifi-map.html');
const wifiJs = read('assets/js/free-wifi-map.js');
assert(!wifiHtml.includes('와이파이 이름 있는 곳만'), 'wifi: name-exists filter label removed');
assert(!wifiHtml.includes('와이파이 이름 있음') && !wifiHtml.includes('와이파이 이름 제공'), 'wifi: name-exists summary label removed');
assert(wifiJs.includes('비밀번호'), 'wifi: password guidance in selected card');
assert(!wifiHtml.includes('SSID 있는 곳만'), 'wifi: old SSID-only filter label removed');
const fishingJs = read('assets/js/fishing-spot-map.js');
assert(fishingJs.includes('distanceSourceLabel()} 직선거리'), 'fishing: status shows explicit distance basis');
const appVersionMisses = [];
for (const file of fs.readdirSync(path.join(root, 'tools')).filter((name) => name.endsWith('.html'))) {
  const html = read(`tools/${file}`);
  if (html.includes('/assets/js/app.js') && !html.includes(`/assets/js/app.js?v=${version}`)) appVersionMisses.push(file);
}
assert(appVersionMisses.length === 0, `all tool app.js references use v129-location-search-ui-refine (${appVersionMisses.join(', ') || 'ok'})`);
assert(read('index.html').includes(`/assets/js/app.js?v=${version}`), 'index app.js reference uses v129-location-search-ui-refine');
if (errors.length) {
  console.error('[verify-life-maps-final-ui-qa] failed');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}
console.log('[verify-life-maps-final-ui-qa] passed');
console.log(`checks: ${ok.length}`);
