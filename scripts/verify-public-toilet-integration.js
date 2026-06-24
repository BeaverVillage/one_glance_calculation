#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fail = [];
const ok = [];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const assert = (condition, message) => condition ? ok.push(message) : fail.push(message);

const index = read('index.html');
const sitemap = read('sitemap.xml');
const sources = read('data-sources.html');
const cacheIndex = JSON.parse(read('assets/data/life/public-toilets/index.json'));
assert(index.includes('/tools/public-toilet-map.html'), 'index.html links public toilet page');
assert(index.includes('공중화장실 찾기'), 'index.html names public toilet feature');
assert(sitemap.includes('https://hannuncheck.com/tools/public-toilet-map.html'), 'sitemap includes public toilet url');
assert(sources.includes('지방행정 인허가 데이터 공중화장실정보'), 'data-sources includes public toilet source');
assert(sources.includes('주소 지오코딩'), 'data-sources explains address geocoding');
assert(cacheIndex.version === 'v117-life-public-toilet-region-repair', 'public toilet cache index is v117');
assert(cacheIndex.totalItems === 52177, 'public toilet cache total item count matches expected');
assert((cacheIndex.regions || []).length === 17, 'public toilet cache has 17 public regions');
const suspicious = [];
for (const region of cacheIndex.regions || []) {
  for (const district of region.districts || []) {
    if (/대로|번길|지하|\?|^\d+$/.test(String(district.label || ''))) suspicious.push(`${region.key}/${district.label}`);
  }
}
assert(suspicious.length === 0, `public toilet district labels normalized (${suspicious.slice(0, 5).join(', ')})`);
const seoul = (cacheIndex.regions || []).find((region) => region.key === 'seoul');
const gyeonggi = (cacheIndex.regions || []).find((region) => region.key === 'gyeonggi');
const gyeongbuk = (cacheIndex.regions || []).find((region) => region.key === 'gyeongbuk');
const gangwon = (cacheIndex.regions || []).find((region) => region.key === 'gangwon');
const seoulLabels = new Set((seoul?.districts || []).map((district) => district.label));
assert(!seoulLabels.has('시흥시') && !seoulLabels.has('김천시') && !seoulLabels.has('홍천군'), '서울 지역에 다른 시도 시군구가 섞이지 않음');
assert((gyeonggi?.districts || []).some((district) => district.label === '시흥시'), '경기 지역에 시흥시 공중화장실 포함');
assert((gyeongbuk?.districts || []).some((district) => district.label === '김천시'), '경북 지역에 김천시 휴게소 공중화장실 포함');
assert((gangwon?.districts || []).some((district) => district.label === '홍천군'), '강원 지역에 홍천군 휴게소 공중화장실 포함');

const jsonMatch = index.match(/<script data-schema="home-2" type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (jsonMatch) {
  const home = JSON.parse(jsonMatch[1]);
  assert(home.itemListElement?.some((item) => item.url === 'https://hannuncheck.com/tools/public-toilet-map.html'), 'home JSON-LD includes public toilet url');
} else fail.push('home JSON-LD not found');

console.log('[verify-public-toilet-integration] ok:', ok.length);
if (fail.length) {
  console.error('[verify-public-toilet-integration] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-public-toilet-integration] passed');
