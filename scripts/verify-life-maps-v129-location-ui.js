const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const pages = ['tools/fishing-spot-map.html', 'tools/free-wifi-map.html', 'tools/public-toilet-map.html'];
const scripts = ['assets/js/fishing-spot-map.js', 'assets/js/free-wifi-map.js', 'assets/js/public-toilet-map.js'];
pages.forEach((p) => {
  const html = read(p);
  assert(html.includes('20260623-v129-location-search-ui-refine'), `${p} v129 query missing`);
});
scripts.forEach((p) => {
  const js = read(p);
  assert(js.includes('v129-location-search-ui-refine'), `${p} v129 version missing`);
  assert(js.includes('kakaoCoordToAdmin'), `${p} reverse geocode admin resolver missing`);
  assert(js.includes('coord2RegionCode'), `${p} coord2RegionCode missing`);
  assert(js.includes('현재 위치'), `${p} current location label missing`);
  assert(js.includes('검색 위치'), `${p} search location label missing`);
  assert(js.includes('handlePlaceSearch'), `${p} place search handler missing`);
  assert(js.includes('life-reference-marker'), `${p} reference marker missing`);
});
const css = read('assets/css/life-map.css');
assert(css.includes('v129: 위치·검색·목록·모바일/푸터 최종 보정'), 'v129 css block missing');
assert(css.includes('grid-template-columns: minmax(260px, 1fr) minmax(160px, 190px) minmax(160px, 190px) auto'), 'desktop one-row toolbar grid missing');
assert(css.includes('bottom: calc(82px + env(safe-area-inset-bottom))'), 'mobile current button floating position missing');
assert(css.includes('life-reference-marker.is-search'), 'search marker label style missing');
assert(css.includes('width: 100vw'), 'full-width footer fix missing');
const wifiJs = read('assets/js/free-wifi-map.js');
assert(wifiJs.includes('groupWifiInstallations'), 'wifi duplicate grouping missing');
assert(wifiJs.includes('data-wifi-installations'), 'wifi installation popup button missing');
assert(!read('tools/free-wifi-map.html').includes('SSID'), 'SSID visible in wifi html');
const fishing = JSON.parse(read('assets/data/life/fishing-spots/chungnam.json'));
const fixed = fishing.items.filter((item) => (item.address || '').includes('서산시 대산읍 화곡리 1891'));
assert(fixed.length > 0, 'Seosan corrected fishing item missing');
fixed.forEach((item) => {
  assert(Math.abs(Number(item.lat) - 37.0044351477144) < 1e-9, `Seosan lat not fixed: ${item.name}`);
  assert(Math.abs(Number(item.lng) - 126.452296151466) < 1e-9, `Seosan lng not fixed: ${item.name}`);
});
console.log('[verify-life-maps-v129-location-ui] passed');
