#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const fail = (msg) => { console.error(`[verify-v128] ${msg}`); process.exit(1); };
const assert = (cond, msg) => { if (!cond) fail(msg); };
const pages = ['tools/fishing-spot-map.html','tools/free-wifi-map.html','tools/public-toilet-map.html'];
const jsFiles = ['assets/js/fishing-spot-map.js','assets/js/free-wifi-map.js','assets/js/public-toilet-map.js'];
pages.forEach((p) => { assert(exists(p), `${p} missing`); assert(read(p).includes('20260623-v129-location-search-ui-refine'), `${p} v128 query missing`); });
jsFiles.forEach((p) => { const t = read(p); assert(t.includes("v129-location-search-ui-refine"), `${p} v128 runtime missing`); assert(t.includes('useCurrentLocation'), `${p} current location handler missing`); assert(t.includes('handlePlaceSearch'), `${p} place search handler missing`); assert(t.includes('life-reference-marker'), `${p} reference marker missing`); assert(t.includes('keywordSearch'), `${p} Kakao keyword search missing`); assert(t.includes('addressSearch'), `${p} Kakao address search missing`); });
const css = read('assets/css/life-map.css');
assert(css.includes('v128 recovered layout'), 'v128 CSS recovery block missing');
assert(css.includes('grid-template-columns: 1fr !important'), 'parent dashboard one-column recovery missing');
assert(css.includes('minmax(320px, 380px) minmax(0, 1fr)'), 'desktop list/map grid recovery missing');
assert(css.includes('background: #101820 !important'), 'navy footer recovery missing');
assert(css.includes('box-shadow: none !important'), 'marker shadow removal missing');
assert(css.includes('life-search-results-panel'), 'search result panel CSS missing');
assert(css.includes('life-reference-marker'), 'current/search marker CSS missing');
const wifiHtml = read('tools/free-wifi-map.html');
const wifiJs = read('assets/js/free-wifi-map.js');
assert(!/SSID|와이파이 이름 있음|와이파이 이름 있는/.test(wifiHtml), 'free wifi HTML still exposes SSID/name-exists wording');
assert(!/SSID|와이파이 이름 있음|와이파이 이름 있는/.test(wifiJs), 'free wifi JS still exposes SSID/name-exists wording');
const idx = JSON.parse(read('assets/data/life/fishing-spots/index.json'));
let fixed = [];
for (const r of idx.regions || []) {
  const payload = JSON.parse(read(`assets/data/life/fishing-spots/${r.file}`));
  for (const item of payload.items || []) {
    if ((item.address || '').includes('서산시 대산읍 화곡리 1891')) fixed.push(item);
    if (r.key === 'chungnam' && Number(item.lng) > 128.5) fail(`suspicious chungnam lng: ${item.name} ${item.lng}`);
  }
}
assert(fixed.length >= 1, 'Seosan fishing coordinate target missing');
fixed.forEach((item) => {
  assert(Math.abs(Number(item.lat) - 37.0044351477144) < 1e-9, `Seosan lat not fixed: ${item.name}`);
  assert(Math.abs(Number(item.lng) - 126.452296151466) < 1e-9, `Seosan lng not fixed: ${item.name}`);
});
console.log('[verify-life-maps-v128-recovery] passed');
