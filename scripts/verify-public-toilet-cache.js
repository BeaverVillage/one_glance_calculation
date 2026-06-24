#!/usr/bin/env node
/*
 * 공중화장실 최종 지도 캐시 검증 스크립트
 * 실행:
 *   node scripts/verify-public-toilet-cache.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fail = [];
const warn = [];
const ok = [];
const MAX_DISTRICT_FILE_BYTES = 1024 * 1024 * 3;
const REGION_TOKEN_MAP = new Map([
  ['서울', 'seoul'], ['서울특별시', 'seoul'],
  ['부산', 'busan'], ['부산광역시', 'busan'],
  ['대구', 'daegu'], ['대구광역시', 'daegu'],
  ['인천', 'incheon'], ['인천광역시', 'incheon'],
  ['광주', 'gwangju'], ['광주광역시', 'gwangju'],
  ['대전', 'daejeon'], ['대전광역시', 'daejeon'],
  ['울산', 'ulsan'], ['울산광역시', 'ulsan'],
  ['세종', 'sejong'], ['세종특별자치시', 'sejong'],
  ['경기', 'gyeonggi'], ['경기도', 'gyeonggi'],
  ['강원', 'gangwon'], ['강원도', 'gangwon'], ['강원특별자치도', 'gangwon'],
  ['충북', 'chungbuk'], ['충청북도', 'chungbuk'],
  ['충남', 'chungnam'], ['충청남도', 'chungnam'],
  ['전북', 'jeonbuk'], ['전라북도', 'jeonbuk'], ['전북특별자치도', 'jeonbuk'],
  ['전남', 'jeonnam'], ['전라남도', 'jeonnam'],
  ['경북', 'gyeongbuk'], ['경상북도', 'gyeongbuk'],
  ['경남', 'gyeongnam'], ['경상남도', 'gyeongnam'],
  ['제주', 'jeju'], ['제주도', 'jeju'], ['제주특별자치도', 'jeju'],
]);

function readJson(rel) {
  const file = path.join(ROOT, rel);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail.push(`json parse failed: ${rel} (${error.message})`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) fail.push(message);
  else ok.push(message);
}

function isValidKoreaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.5 && lng >= 123 && lng <= 132.5;
}

const index = readJson('assets/data/life/public-toilets/index.json');
if (index) {
  assert(index.version === 'v117-life-public-toilet-region-repair', 'public-toilet cache version is v117 region repair');
  assert(index.type === 'public-toilet', 'cache index type is public-toilet');
  assert(Number(index.totalItems) > 0, 'cache index has totalItems');
  assert(Array.isArray(index.regions) && index.regions.length > 0, 'cache index has regions');
  assert(index.filters && Array.isArray(index.filters.categories), 'cache index has category filter values');
  assert(index.filters && Array.isArray(index.filters.openTypes), 'cache index has open type filter values');

  const seenIds = new Set();
  let counted = 0;
  let invalidCoords = 0;
  let missingName = 0;
  let missingAddress = 0;
  let missingRegion = 0;
  let missingDistrict = 0;
  let missingFiles = 0;
  let districtFiles = 0;
  let hasDisabled = 0;
  let hasBaby = 0;
  let hasBell = 0;
  let hasCctv = 0;
  let suspiciousDistricts = 0;
  let regionAddressMismatches = 0;

  for (const region of index.regions || []) {
    assert(Boolean(region.key), 'region has key');
    assert(Boolean(region.label), `${region.key || 'region'} has label`);
    assert(Array.isArray(region.districts) && region.districts.length > 0, `${region.key} has district files`);
    for (const district of region.districts || []) {
      if (/대로|번길|지하|\?|^\d+$/.test(String(district.label || ''))) suspiciousDistricts += 1;
    }
    let regionCount = 0;
    for (const district of region.districts || []) {
      const rel = `assets/data/life/public-toilets/${district.file}`;
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        fail.push(`missing district file: ${rel}`);
        missingFiles += 1;
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.size > MAX_DISTRICT_FILE_BYTES) warn.push(`${district.file}: large district cache ${(stat.size / 1024 / 1024).toFixed(2)}MB`);
      const payload = readJson(rel);
      if (!payload) continue;
      districtFiles += 1;
      assert(payload.type === 'public-toilet-district', `${district.file} type is public-toilet-district`);
      assert(payload.region?.key === region.key, `${district.file} region key matches`);
      assert(payload.district?.key === district.key, `${district.file} district key matches`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      counted += items.length;
      regionCount += items.length;
      if (items.length !== district.count) warn.push(`${district.file}: index count ${district.count}, file count ${items.length}`);
      for (const item of items) {
        if (!item?.id) fail.push(`${district.file}: item id missing`);
        else if (seenIds.has(item.id)) fail.push(`duplicate item id: ${item.id}`);
        else seenIds.add(item.id);
        if (!item?.name) missingName += 1;
        if (!item?.address) missingAddress += 1;
        if (!item?.regionKey || !item?.region) missingRegion += 1;
        if (!item?.district || !item?.districtKey) missingDistrict += 1;
        const lat = Number(item?.lat);
        const lng = Number(item?.lng);
        if (!isValidKoreaCoordinate(lat, lng)) invalidCoords += 1;
        const inferredRegionKey = inferRegionKeyFromItem(item);
        if (inferredRegionKey && inferredRegionKey !== item.regionKey) {
          regionAddressMismatches += 1;
          if (regionAddressMismatches <= 10) fail.push(`${district.file}: address/geocode region mismatch ${item.name || item.id} -> ${item.regionKey}, expected ${inferredRegionKey}`);
        }
        if (item?.details?.hasDisabledToilet) hasDisabled += 1;
        if (item?.details?.hasBabyChanging) hasBaby += 1;
        if (item?.details?.hasEmergencyBell) hasBell += 1;
        if (item?.details?.hasCctv) hasCctv += 1;
      }
    }
    if (regionCount !== region.count) warn.push(`${region.key}: index count ${region.count}, district sum ${regionCount}`);
  }

  assert(missingFiles === 0, 'all district cache files exist');
  assert(districtFiles > 0, 'district cache files are readable');
  assert(counted === index.totalItems, `cache total count matches (${counted})`);
  assert(invalidCoords === 0, 'all coordinates are valid Korea-range WGS84');
  assert(missingName === 0, 'all items have names');
  assert(missingAddress === 0, 'all items have addresses');
  assert(missingRegion === 0, 'all items have region labels');
  assert(missingDistrict === 0, 'all items have district labels');
  assert(suspiciousDistricts === 0, 'district labels are normalized admin districts');
  assert(regionAddressMismatches === 0, 'item region labels match geocoded/source addresses');
  assert((index.stats?.hasDisabledToilet || 0) === hasDisabled, 'disabled toilet count matches index stats');
  assert((index.stats?.hasBabyChanging || 0) === hasBaby, 'baby changing count matches index stats');
  assert((index.stats?.hasEmergencyBell || 0) === hasBell, 'emergency bell count matches index stats');
  assert((index.stats?.hasCctv || 0) === hasCctv, 'CCTV count matches index stats');
}


function inferRegionKeyFromItem(item) {
  const text = [
    item?.geocode?.matchedAddress,
    item?.geocode?.sourceAddress,
    item?.roadAddress,
    item?.lotAddress,
    item?.address,
  ].filter(Boolean).join(' ');
  const tokens = String(text || '')
    .replace(/^﻿/, '')
    .replace(/[?]+/g, ' ')
    .replace(/[(),，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens.slice(0, 4)) {
    const key = REGION_TOKEN_MAP.get(token);
    if (key) return key;
  }
  return '';
}

console.log('[verify-public-toilet-cache] ok:', ok.length);
if (warn.length) {
  console.warn('[verify-public-toilet-cache] warnings');
  warn.forEach((message) => console.warn(`- ${message}`));
}
if (fail.length) {
  console.error('[verify-public-toilet-cache] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-public-toilet-cache] passed');
