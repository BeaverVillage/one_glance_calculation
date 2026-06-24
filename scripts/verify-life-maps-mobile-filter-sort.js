#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const assert = (condition, message) => {
  if (!condition) {
    console.error(`[verify-life-maps-mobile-filter-sort] failed: ${message}`);
    process.exit(1);
  }
  checks.push(message);
};
const version = '20260623-v129-location-search-ui-refine';
const runtime = 'v129-location-search-ui-refine';
const features = [
  { name: '낚시터', html: 'tools/fishing-spot-map.html', js: 'assets/js/fishing-spot-map.js', sortAttr: 'data-fishing-sort', score: 'fishingRecommendScore' },
  { name: '무료 와이파이', html: 'tools/free-wifi-map.html', js: 'assets/js/free-wifi-map.js', sortAttr: 'data-wifi-sort', score: 'wifiRecommendScore' },
  { name: '공중화장실', html: 'tools/public-toilet-map.html', js: 'assets/js/public-toilet-map.js', sortAttr: 'data-toilet-sort', score: 'toiletRecommendScore' },
];
const css = read('assets/css/life-map.css');
assert(css.includes('.life-map-app.is-filter-open .parking-dashboard__controls'), 'mobile filter action sheet CSS exists');
assert(css.includes('.life-mobile-bottom-sheet.is-expanded'), 'mobile result sheet expanded state CSS exists');
assert(css.includes('.life-filter-toggle-button'), 'mobile filter button CSS exists');
for (const feature of features) {
  const html = read(feature.html);
  const js = read(feature.js);
  assert(html.includes(version), `${feature.name}: v129-location-search-ui-refine cache-busting version applied`);
  assert(js.includes(runtime), `${feature.name}: v129-location-search-ui-refine runtime version applied`);
  assert(html.includes('value="recommend"'), `${feature.name}: recommend sort option exists`);
  assert(html.includes(`${feature.sortAttr}="recommend"`), `${feature.name}: recommend sort tab exists`);
  assert(html.includes('data-life-filter-toggle'), `${feature.name}: mobile filter toggle exists`);
  assert(js.includes(feature.score), `${feature.name}: recommendation score algorithm exists`);
  assert(js.includes("|| 'recommend'") || js.includes("|| 'recommend';"), `${feature.name}: recommend fallback sort exists`);
  assert(js.includes('openMobileFilterSheet'), `${feature.name}: mobile filter open handler exists`);
  assert(js.includes('closeMobileFilterSheet'), `${feature.name}: mobile filter close handler exists`);
  assert(js.includes('resetAdvancedFilters'), `${feature.name}: mobile filter reset handler exists`);
  assert(js.includes('attachDragToSheet'), `${feature.name}: draggable mobile sheet helper exists`);
  assert(js.includes('initMobileInteractions();'), `${feature.name}: mobile interactions initialized`);
}
console.log(`[verify-life-maps-mobile-filter-sort] passed (${checks.length} checks)`);
