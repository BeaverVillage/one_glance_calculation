#!/usr/bin/env node
/*
 * 생활지도 3종 배포 직전 프리플라이트 검증
 * 실행:
 *   node scripts/verify-life-map-release-preflight.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];
const ok = [];
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const stat = (rel) => fs.statSync(path.join(root, rel));
const assert = (condition, message) => condition ? ok.push(message) : errors.push(message);

const VERSION = '20260623-v129-location-search-ui-refine';
const RUNTIME = 'v129-location-search-ui-refine';
const tools = [
  { name: '낚시터', html: 'tools/fishing-spot-map.html', js: 'assets/js/fishing-spot-map.js', dataRoot: 'assets/data/life/fishing-spots' },
  { name: '무료 와이파이', html: 'tools/free-wifi-map.html', js: 'assets/js/free-wifi-map.js', dataRoot: 'assets/data/life/free-wifi' },
  { name: '공중화장실', html: 'tools/public-toilet-map.html', js: 'assets/js/public-toilet-map.js', dataRoot: 'assets/data/life/public-toilets' },
];

assert(exists('_headers'), '_headers exists');
if (exists('_headers')) {
  const headers = read('_headers');
  assert(headers.includes('/assets/data/life/*'), '_headers covers life JSON cache');
  assert(headers.includes('Cache-Control: public, max-age=31536000, immutable'), '_headers gives life JSON long immutable cache');
  assert(headers.includes('/api/*') && headers.includes('Cache-Control: no-store'), '_headers keeps API uncached');
  assert(headers.includes('X-Content-Type-Options: nosniff'), '_headers keeps security headers');
}

for (const tool of tools) {
  assert(exists(tool.html), `${tool.name}: html exists`);
  assert(exists(tool.js), `${tool.name}: js exists`);
  assert(exists(`${tool.dataRoot}/index.json`), `${tool.name}: data index exists`);
  if (!exists(tool.html) || !exists(tool.js) || !exists(`${tool.dataRoot}/index.json`)) continue;
  const html = read(tool.html);
  const js = read(tool.js);
  assert(html.includes(VERSION), `${tool.name}: html cache-busting query is v129-location-search-ui-refine`);
  assert(js.includes(`const VERSION = '${RUNTIME}'`), `${tool.name}: runtime version is v129-location-search-ui-refine`);
  assert(js.includes("fetch(url, { cache: options.cache || 'default' })"), `${tool.name}: static JSON fetch uses browser cache by default`);
  assert(js.includes("fetchJson('/api/config', { cache: 'no-store' })"), `${tool.name}: API config fetch remains no-store`);
  assert(!js.includes("fetch(url, { cache: 'no-store' })"), `${tool.name}: no global no-store on static JSON fetch`);
  assert(!/return `https:\/\/map\.kakao\.com\/link\/search[^\n]+`;\s*return `https:\/\/map\.kakao\.com\/link\/search/.test(js), `${tool.name}: no duplicated Kakao search return`);
  assert(js.includes('MAX_MARKERS'), `${tool.name}: marker limit safeguard exists`);
  assert(js.includes('requestId'), `${tool.name}: region request race guard exists`);
}

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};
const files = walk('.');
const maxSize = 25 * 1024 * 1024;
let largest = { file: '', size: 0 };
for (const file of files) {
  const size = stat(file).size;
  if (size > largest.size) largest = { file, size };
  assert(size <= maxSize, `file within 25MB deploy limit: ${file}`);
}
ok.push(`largest file: ${largest.file} (${(largest.size / 1024 / 1024).toFixed(2)}MB)`);

const forbidden = [
  'cache/public-toilets/geocode-success.json',
  'cache/public-toilets/geocode-targets.json',
  'cache/public-toilets/prepared-items.json',
  'data/source/fishing-spots.csv',
  'data/source/free-wifi.csv',
  'data/source/public-toilets.csv',
  'data/source/낚시터정보.csv',
  'data/source/무료와이파이정보.csv',
  'data/source/공중화장실정보.csv',
];
for (const file of forbidden) assert(!exists(file), `deploy excludes build-only file: ${file}`);

if (errors.length) {
  console.error('[verify-life-map-release-preflight] failed');
  errors.slice(0, 120).forEach((message) => console.error(`- ${message}`));
  if (errors.length > 120) console.error(`... and ${errors.length - 120} more`);
  process.exit(1);
}
console.log('[verify-life-map-release-preflight] passed');
ok.forEach((message) => console.log(`- ${message}`));
