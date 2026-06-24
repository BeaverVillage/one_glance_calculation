#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const VERSION = '20260623-v129-location-search-ui-refine';
const RUNTIME = 'v129-location-search-ui-refine';
const tools = [
  { name: '낚시터', html: 'tools/fishing-spot-map.html', js: 'assets/js/fishing-spot-map.js', mapSearchDisallowed: true },
  { name: '무료 와이파이', html: 'tools/free-wifi-map.html', js: 'assets/js/free-wifi-map.js' },
  { name: '공중화장실', html: 'tools/public-toilet-map.html', js: 'assets/js/public-toilet-map.js' },
];
for (const tool of tools) {
  assert(exists(tool.html), `${tool.name}: html exists`);
  assert(exists(tool.js), `${tool.name}: js exists`);
  const html = read(tool.html);
  const js = read(tool.js);
  assert(html.includes(VERSION), `${tool.name}: v129 cache busting applied`);
  assert(js.includes(`const VERSION = '${RUNTIME}'`), `${tool.name}: v129 runtime applied`);
  assert(js.includes('카카오맵 바로가기'), `${tool.name}: single Kakao map button text exists`);
  assert(!js.includes('카카오맵 검색'), `${tool.name}: duplicate Kakao search button removed`);
  assert(js.includes('life-selected-close'), `${tool.name}: top close button exists`);
  assert(js.includes('attachDragToSheet'), `${tool.name}: mobile drag handler exists`);
  assert(js.includes('pointermove'), `${tool.name}: smooth drag move handler exists`);
  assert(js.includes('style.setProperty(\'--life-sheet-y\''), `${tool.name}: drag transform variable exists`);
  assert(!html.includes('와이파이 이름(SSID)'), `${tool.name}: technical SSID label not shown in html`);
  assert(!js.includes('와이파이 이름(SSID)'), `${tool.name}: technical SSID label not shown in js`);
}
const css = read('assets/css/life-map.css');
for (const token of [
  '생활지도 3종 UI 완성 안정화',
  'minmax(320px, 380px) minmax(0, 1fr)',
  '.life-results-panel .parking-result-metrics',
  'display: none !important',
  'max-height: min(58%, 440px)',
  'box-shadow: none !important',
  'transform: translateY(var(--life-sheet-y, 42%))',
  'transform: translateY(var(--life-sheet-y, 7%))',
  'touch-action: pan-x pan-y',
]) {
  assert(css.includes(token), `css final rule exists: ${token}`);
}
// footer standardization: every html has container/footer-grid and no bare site-footer content.
const htmlFiles = [];
for (const dir of ['.', 'tools']) {
  for (const name of fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.html'))) htmlFiles.push(path.join(dir, name).replace(/^\.\//, ''));
}
for (const rel of htmlFiles) {
  const html = read(rel);
  const footerMatch = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/);
  assert(!!footerMatch, `${rel}: footer exists`);
  if (footerMatch) {
    assert(footerMatch[1].includes('container footer-grid'), `${rel}: footer uses standard container grid`);
    assert(footerMatch[1].includes('문의·정정 요청'), `${rel}: footer uses standard links`);
  }
}
// Life map UI should not expose old wording.
const lifeText = tools.map((t) => read(t.html) + read(t.js)).join('\n');
assert(!lifeText.includes('SSID 제공'), 'life maps: SSID provided badge removed');
assert(!lifeText.includes('SSID 확인 필요'), 'life maps: SSID missing badge removed');
assert(!lifeText.includes('>지도 확인</a>'), 'life maps: old map-check link removed');
assert(!lifeText.includes('>카카오맵 확인</a>'), 'life maps: old Kakao-check link removed');
if (errors.length) {
  console.error('[verify-life-maps-ui-complete] failed');
  errors.forEach((e) => console.error('- ' + e));
  process.exit(1);
}
console.log('[verify-life-maps-ui-complete] passed');
console.log(`checks: ${tools.length * 11 + 9 + htmlFiles.length * 3 + 4}`);
