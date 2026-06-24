#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const errors = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => errors.push(message);

const indexHtml = read('index.html');
const sitemap = read('sitemap.xml');
const dataSources = read('data-sources.html');
const toolHtml = read('tools/free-wifi-map.html');

if (!indexHtml.includes('/tools/free-wifi-map.html')) fail('index.html missing free wifi link');
if (!indexHtml.includes('무료 와이파이 찾기')) fail('index.html missing free wifi label');
if (!sitemap.includes('https://hannuncheck.com/tools/free-wifi-map.html')) fail('sitemap.xml missing free wifi url');
if (!dataSources.includes('무료와이파이정보')) fail('data-sources.html missing free wifi source');
if (!toolHtml.includes('20260623-v129-location-search-ui-refine')) fail('free wifi page cache version query missing');
if (!toolHtml.includes('/assets/js/free-wifi-map.js')) fail('free wifi page missing js');

const match = indexHtml.match(/<script data-schema="home-2" type="application\/ld\+json">(.*?)<\/script>/);
if (!match) fail('home JSON-LD missing');
else {
  try {
    const json = JSON.parse(match[1]);
    const found = (json.itemListElement || []).some((item) => item.url === 'https://hannuncheck.com/tools/free-wifi-map.html');
    if (!found) fail('home JSON-LD missing free wifi item');
  } catch (error) {
    fail(`home JSON-LD parse failed: ${error.message}`);
  }
}

if (errors.length) {
  console.error('[verify-free-wifi-integration] failed');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log('[verify-free-wifi-integration] passed');
