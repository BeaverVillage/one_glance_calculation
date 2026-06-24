#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const ok = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const pass = (message) => ok.push(message);
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stat = (file) => fs.statSync(path.join(root, file));

const LIFE_TOOLS = [
  {
    name: '낚시터 찾기',
    slug: 'fishing-spot-map',
    url: '/tools/fishing-spot-map.html',
    js: 'assets/js/fishing-spot-map.js',
    dataIndex: 'assets/data/life/fishing-spots/index.json',
    dataDir: 'assets/data/life/fishing-spots',
    needles: ['fishing-spot-map.html', '낚시터 찾기'],
    assetVersion: '20260623-v129-location-search-ui-refine',
    runtimeVersion: 'v129-location-search-ui-refine',
  },
  {
    name: '무료 와이파이 찾기',
    slug: 'free-wifi-map',
    url: '/tools/free-wifi-map.html',
    js: 'assets/js/free-wifi-map.js',
    dataIndex: 'assets/data/life/free-wifi/index.json',
    dataDir: 'assets/data/life/free-wifi',
    needles: ['free-wifi-map.html', '무료 와이파이 찾기'],
    assetVersion: '20260623-v129-location-search-ui-refine',
    runtimeVersion: 'v129-location-search-ui-refine',
  },
  {
    name: '공중화장실 찾기',
    slug: 'public-toilet-map',
    url: '/tools/public-toilet-map.html',
    js: 'assets/js/public-toilet-map.js',
    dataIndex: 'assets/data/life/public-toilets/index.json',
    dataDir: 'assets/data/life/public-toilets',
    needles: ['public-toilet-map.html', '공중화장실 찾기'],
    assetVersion: '20260623-v129-location-search-ui-refine',
    runtimeVersion: 'v129-location-search-ui-refine',
  },
];

const requiredSharedFiles = [
  'assets/css/life-map.css',
  'assets/js/check-toolkit.js',
  'assets/config/public-config.js',
  'index.html',
  'sitemap.xml',
  'data-sources.html',
];

requiredSharedFiles.forEach((file) => {
  if (!exists(file)) fail(`missing shared file: ${file}`);
  else pass(`shared file exists: ${file}`);
});

for (const tool of LIFE_TOOLS) {
  const htmlPath = `tools/${tool.slug}.html`;
  if (!exists(htmlPath)) fail(`missing tool html: ${htmlPath}`);
  if (!exists(tool.js)) fail(`missing tool js: ${tool.js}`);
  if (!exists(tool.dataIndex)) fail(`missing data index: ${tool.dataIndex}`);
  if (!exists(tool.dataDir)) fail(`missing data dir: ${tool.dataDir}`);
  if (errors.length) continue;

  const html = read(htmlPath);
  const js = read(tool.js);
  const dataIndex = JSON.parse(read(tool.dataIndex));

  if (!html.includes(tool.url)) fail(`${tool.name}: canonical/self url missing`);
  if (!html.includes('life-map.css')) fail(`${tool.name}: shared life css missing`);
  if (!html.includes(`${tool.slug.replace(/-/g, '-')}.js`) && !html.includes(path.basename(tool.js))) fail(`${tool.name}: js include missing`);
  if (!html.includes(tool.assetVersion)) fail(`${tool.name}: asset version query is not v124`);
  if (!js.includes(tool.runtimeVersion)) fail(`${tool.name}: runtime cache version is not v124`);
  if (!js.includes('MAX_MARKERS')) fail(`${tool.name}: marker limit safeguard missing`);
  if (!js.includes("state.selectedId = ''")) fail(`${tool.name}: no-auto-select reset missing`);
  if (!js.includes('requestId')) fail(`${tool.name}: request race guard missing`);

  if (!Array.isArray(dataIndex.regions) || !dataIndex.regions.length) fail(`${tool.name}: data index regions missing`);
  if (!Number.isFinite(Number(dataIndex.totalItems)) || Number(dataIndex.totalItems) < 1) fail(`${tool.name}: totalItems invalid`);

  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!jsonLdMatches.length) fail(`${tool.name}: JSON-LD missing`);
  jsonLdMatches.forEach((match, index) => {
    try { JSON.parse(match[1]); }
    catch (error) { fail(`${tool.name}: JSON-LD parse failed #${index + 1}: ${error.message}`); }
  });
  pass(`${tool.name}: html/js/data/index checks`);
}

if (!errors.length) {
  const indexHtml = read('index.html');
  const sitemap = read('sitemap.xml');
  const dataSources = read('data-sources.html');
  for (const tool of LIFE_TOOLS) {
    if (!indexHtml.includes(tool.url)) fail(`index missing link: ${tool.url}`);
    if (!sitemap.includes(`https://hannuncheck.com${tool.url}`)) fail(`sitemap missing url: ${tool.url}`);
    if (!dataSources.includes(tool.name.replace(' 찾기', '')) && !dataSources.includes(tool.name)) fail(`data-sources missing tool name: ${tool.name}`);
  }
  pass('homepage/sitemap/data-sources links checked');
}

const MAX_DEPLOY_FILE_BYTES = 25 * 1024 * 1024;
const BUILD_ONLY_PATHS = [
  'cache/public-toilets/prepared-items.json',
  'cache/public-toilets/geocode-targets.json',
  'cache/public-toilets/geocode-success.json',
  'cache/public-toilets/geocode-failed.json',
  'cache/public-toilets/geocode-progress.json',
  'data/source/public-toilets.csv',
  'data/source/free-wifi.csv',
  'data/source/fishing-spots.csv',
  'data/source/공중화장실정보.csv',
  'data/source/무료와이파이정보.csv',
  'data/source/낚시터정보.csv',
];

BUILD_ONLY_PATHS.forEach((file) => {
  if (exists(file)) fail(`build-only file still present: ${file}`);
});

const allFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(rel);
    else allFiles.push(rel);
  }
};
walk('.');

let largest = { file: '', size: 0 };
for (const file of allFiles) {
  const size = stat(file).size;
  if (size > largest.size) largest = { file, size };
  if (size > MAX_DEPLOY_FILE_BYTES) fail(`file exceeds 25MB deploy limit: ${file} (${(size / 1024 / 1024).toFixed(2)}MB)`);
}
pass(`largest file: ${largest.file} (${(largest.size / 1024 / 1024).toFixed(2)}MB)`);

const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
for (const htmlFile of htmlFiles) {
  const html = read(htmlFile);
  const refs = [];
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) refs.push(match[1]);
  for (const ref of refs) {
    if (!ref || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('#') || ref.startsWith('javascript:')) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean || clean === '/') continue;
    const local = clean.startsWith('/') ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(htmlFile), clean));
    if (!exists(local)) fail(`${htmlFile}: local reference missing -> ${ref}`);
  }
}
pass(`local html references checked: ${htmlFiles.length} html files`);

if (errors.length) {
  console.error('[verify-life-maps-deployment] failed');
  errors.slice(0, 80).forEach((error) => console.error(`- ${error}`));
  if (errors.length > 80) console.error(`... and ${errors.length - 80} more`);
  if (warnings.length) {
    console.warn('[verify-life-maps-deployment] warnings');
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  }
  process.exit(1);
}

console.log('[verify-life-maps-deployment] passed');
ok.forEach((message) => console.log(`- ${message}`));
if (warnings.length) {
  console.warn('[verify-life-maps-deployment] warnings');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}
