#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const css = read('assets/css/life-map.css');
const tools = [
  { name: 'fishing', js: 'assets/js/fishing-spot-map.js', html: 'tools/fishing-spot-map.html', close: 'data-fishing-close' },
  { name: 'wifi', js: 'assets/js/free-wifi-map.js', html: 'tools/free-wifi-map.html', close: 'data-wifi-close' },
  { name: 'toilet', js: 'assets/js/public-toilet-map.js', html: 'tools/public-toilet-map.html', close: 'data-toilet-close' },
];

assert(css.includes('생활지도 3종 UI 완성 안정화'), 'PC/mobile final UI stabilization styles exist');
assert(css.includes('min-height: 640px'), 'PC map has enlarged minimum height');
assert(css.includes('.life-selected-close'), 'selected card top close style exists');
assert(css.includes('.life-distance-pill'), 'distance source pill style exists');
assert(css.includes('max-height: min(58%, 440px)'), 'selected card has compact max-height guard');
assert(css.includes('overflow: auto'), 'selected/list panels include overflow guard');

tools.forEach((tool) => {
  const js = read(tool.js);
  const html = read(tool.html);
  assert(html.includes('20260623-v129-location-search-ui-refine'), `${tool.name}: v129-location-search-ui-refine html cache busting applied`);
  assert(js.includes("const VERSION = 'v129-location-search-ui-refine'"), `${tool.name}: v129-location-search-ui-refine runtime version applied`);
  assert(js.includes('data-life-card-select'), `${tool.name}: whole list-card click target exists`);
  assert(js.includes('addEventListener(\'keydown\''), `${tool.name}: keyboard selection support exists`);
  assert(js.includes('renderDistanceBadge'), `${tool.name}: distance badge renderer exists`);
  assert(js.includes('distanceSourceLabel'), `${tool.name}: distance source label exists`);
  assert(js.includes('life-selected-close'), `${tool.name}: top close button rendered`);
  assert(js.includes(`querySelectorAll('[${tool.close}]')`), `${tool.name}: every close button is wired`);
  assert(js.includes('카카오맵 바로가기'), `${tool.name}: map button label is user-facing`);
  assert(!js.includes('>지도 확인</a>'), `${tool.name}: old ambiguous map label removed`);
});

const fishing = read('assets/js/fishing-spot-map.js');
assert(!fishing.includes('카카오맵 검색'), 'fishing: Kakao search button label removed from life map UI');

const wifi = read('assets/js/free-wifi-map.js');
assert(wifi.includes('와이파이 이름'), 'wifi: user-facing wifi name label exists');
assert(wifi.includes('비밀번호'), 'wifi: password field is exposed as confirmation-needed information');
assert(wifi.includes('현장 확인 필요'), 'wifi: password/access confirmation wording exists');
assert(!wifi.includes('SSID 확인 필요'), 'wifi: technical-only missing SSID label removed');

if (failures.length) {
  console.error('[verify-life-maps-pc-interaction] failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('[verify-life-maps-pc-interaction] passed');
console.log(`checks: ${6 + tools.length * 9 + 6}`);
