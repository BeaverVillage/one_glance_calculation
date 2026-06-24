#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`[verify-home-menu-navigation] ${message}`);
  process.exit(1);
};
const assert = (cond, message) => { if (!cond) fail(message); };

const index = read('index.html');
const app = read('assets/js/app.js');

const heroMatch = index.match(/<div class="tool-card-stack compact">([\s\S]*?)<\/div>/);
assert(heroMatch, 'home frequent feature stack exists');
const heroCards = [...heroMatch[1].matchAll(/<a class="tool-card/g)].length;
assert(heroCards === 5, `home frequent features must be 5, got ${heroCards}`);
assert(!heroMatch[1].includes('/tools/fishing-spot-map.html'), 'fishing is not in frequent 5');
assert(!heroMatch[1].includes('/tools/free-wifi-map.html'), 'free wifi is not in frequent 5');
assert(!heroMatch[1].includes('/tools/public-toilet-map.html'), 'public toilet is not in frequent 5');

const gridMatch = index.match(/<div class="compact-tool-grid">([\s\S]*?)<\/div>/);
assert(gridMatch, 'feature grid exists');
for (const href of ['/tools/public-toilet-map.html', '/tools/free-wifi-map.html', '/tools/fishing-spot-map.html']) {
  assert(gridMatch[1].includes(href), `feature grid contains ${href}`);
}
assert(gridMatch[1].indexOf('/tools/public-toilet-map.html') < gridMatch[1].indexOf('/tools/free-wifi-map.html'), 'public toilet appears before free wifi');
assert(gridMatch[1].indexOf('/tools/free-wifi-map.html') < gridMatch[1].indexOf('/tools/fishing-spot-map.html'), 'free wifi appears before fishing');

const schemaText = (index.match(/<script data-schema="home-2" type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
assert(schemaText, 'home ItemList JSON-LD exists');
const schema = JSON.parse(schemaText);
const names = schema.itemListElement.map((item) => item.name);
assert(names[5] === '공중화장실 찾기', 'JSON-LD position 6 is public toilet');
assert(names[6] === '무료 와이파이 찾기', 'JSON-LD position 7 is free wifi');
assert(names[7] === '낚시터 찾기', 'JSON-LD position 8 is fishing');

assert(app.includes("label: '생활 지도'"), 'tool drawer has 생활 지도 group');
for (const label of ['공중화장실 찾기', '무료 와이파이 찾기', '낚시터 찾기']) {
  assert(app.includes(label), `tool drawer includes ${label}`);
}
for (const file of fs.readdirSync(path.join(root, 'tools')).filter((name) => name.endsWith('.html'))) {
  const html = read(`tools/${file}`);
  if (html.includes('/assets/js/app.js')) {
    assert(html.includes('/assets/js/app.js?v=20260623-v129-location-search-ui-refine'), `${file} uses v129-location-search-ui-refine app.js`);
  }
}
assert(index.includes('/assets/js/app.js?v=20260623-v129-location-search-ui-refine'), 'index uses v129-location-search-ui-refine app.js');
console.log('[verify-home-menu-navigation] passed');
