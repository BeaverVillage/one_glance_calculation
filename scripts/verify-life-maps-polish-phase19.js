const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (cond, msg) => {
  if (!cond) {
    console.error(`[verify-life-maps-polish-phase19] FAIL: ${msg}`);
    process.exit(1);
  }
};
const checks = [];
const ok = (msg) => checks.push(msg);

const version = '20260623-v129-location-search-ui-refine';
const runtime = 'v129-location-search-ui-refine';
const tools = [
  ['낚시터', 'tools/fishing-spot-map.html', 'assets/js/fishing-spot-map.js'],
  ['무료 와이파이', 'tools/free-wifi-map.html', 'assets/js/free-wifi-map.js'],
  ['공중화장실', 'tools/public-toilet-map.html', 'assets/js/public-toilet-map.js'],
];
const css = read('assets/css/life-map.css');

for (const [name, htmlFile, jsFile] of tools) {
  const html = read(htmlFile);
  const js = read(jsFile);
  assert(html.includes(version), `${name}: v126 cache-busting query missing`);
  assert(js.includes(`const VERSION = '${runtime}'`), `${name}: v126 runtime missing`);
  assert(js.includes('life-list-card'), `${name}: compact list card class missing`);
  assert(js.includes('life-list-summary'), `${name}: compact list summary missing`);
  assert(!js.includes('카카오맵 검색'), `${name}: duplicate Kakao search button text still present`);
  assert(js.includes('카카오맵 바로가기'), `${name}: Kakao map shortcut text missing`);
  assert(js.includes('life-detail-grid--compact'), `${name}: compact detail grid missing`);
  assert(js.includes("elements.mobileSheet.classList.toggle('is-collapsed'"), `${name}: collapsed mobile sheet state missing`);
  assert(js.includes("event.target.closest('.parking-sheet-handle')"), `${name}: drag must start from handle only`);
  ok(`${name}: js/html polish contract passed`);
}

const wifiHtml = read('tools/free-wifi-map.html');
const wifiJs = read('assets/js/free-wifi-map.js');
assert(!wifiHtml.includes('SSID'), '무료 와이파이 HTML: user-facing SSID text should be removed');
assert(!wifiJs.includes('와이파이 이름(SSID)'), '무료 와이파이 JS: technical SSID label remains');
assert(!wifiJs.includes('SSID 제공'), '무료 와이파이 JS: SSID 제공 text remains');
assert(wifiJs.includes('와이파이 이름'), '무료 와이파이 JS: user-facing wifi name text missing');
ok('무료 와이파이 terminology cleaned');

assert(css.includes('grid-template-columns: minmax(300px, 360px)'), 'PC list/map grid compact override missing');
assert(css.includes('.life-results-panel .parking-result-metrics') && css.includes('display: none !important'), 'list metric boxes are not hidden');
assert(css.includes('.life-mobile-bottom-sheet.is-collapsed'), 'mobile bottom sheet collapsed CSS missing');
assert(css.includes('transform: translateY(calc(100% - 70px))'), 'mobile bottom sheet bottom bar transform missing');
assert(css.includes('.life-mobile-bottom-sheet.is-expanded') && css.includes('transform: translateY(0)'), 'mobile bottom sheet expanded transform missing');
assert(css.includes('.life-marker::before') && css.includes('content: none !important'), 'marker pseudo shadow removal missing');
assert(css.includes('.site-footer') && css.includes('background: #f8fafc'), 'footer light standard override missing');
ok('CSS polish contract passed');

// Footer markup should be consistent on core pages.
const footerPages = [
  'index.html',
  'tools/ev-charger-map.html',
  'tools/parking-fee-check.html',
  'tools/emergency-hospital-check.html',
  'tools/fishing-spot-map.html',
  'tools/free-wifi-map.html',
  'tools/public-toilet-map.html',
];
for (const file of footerPages) {
  const html = read(file);
  assert(html.includes('<footer class="site-footer">'), `${file}: footer missing`);
  assert(html.includes('문의·정정 요청'), `${file}: standard footer links missing`);
}
ok('standard footer markup checked');

console.log(`[verify-life-maps-polish-phase19] passed (${checks.length} groups)`);
for (const line of checks) console.log(`- ${line}`);
