#!/usr/bin/env node
/*
 * 공중화장실 주소 정리/지오코딩 대상 검증 스크립트
 * 실행:
 *   node scripts/verify-public-toilet-prep.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fail = [];
const warn = [];
const ok = [];

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

const prepared = readJson('cache/public-toilets/prepared-items.json');
const targetsPayload = readJson('cache/public-toilets/geocode-targets.json');
const summary = readJson('cache/public-toilets/prepare-summary.json');

if (prepared && targetsPayload && summary) {
  assert(prepared.version === 'v114-public-toilet-prepare-phase8', 'prepared version is v114 phase8');
  assert(targetsPayload.version === 'v114-public-toilet-prepare-phase8', 'targets version is v114 phase8');
  assert(prepared.type === 'public-toilet-prepared-items', 'prepared type is public-toilet-prepared-items');
  assert(targetsPayload.type === 'public-toilet-geocode-targets', 'targets type is public-toilet-geocode-targets');
  const items = Array.isArray(prepared.items) ? prepared.items : [];
  const targets = Array.isArray(targetsPayload.targets) ? targetsPayload.targets : [];
  assert(items.length > 10000, `prepared item count is large enough (${items.length})`);
  assert(targets.length > 10000, `geocode target count is large enough (${targets.length})`);
  assert(prepared.totalItems === items.length, 'prepared totalItems matches items length');
  assert(targetsPayload.totalTargets === targets.length, 'target totalTargets matches targets length');
  assert(summary.stats?.normalized === items.length, 'summary normalized count matches prepared items');
  assert(summary.stats?.targetCount === targets.length, 'summary target count matches targets');

  const targetIds = new Set();
  const itemIds = new Set();
  let missingAddress = 0;
  let missingRegion = 0;
  let missingTarget = 0;
  let missingName = 0;
  let missingDetails = 0;
  let linked = 0;

  for (const target of targets) {
    if (!target.targetId) fail.push('target id missing');
    else if (targetIds.has(target.targetId)) fail.push(`duplicate target id: ${target.targetId}`);
    else targetIds.add(target.targetId);
    if (!target.address) missingAddress += 1;
    if (!target.regionKey || !target.region) missingRegion += 1;
    if (!Array.isArray(target.itemIds) || !target.itemIds.length) fail.push(`target has no itemIds: ${target.targetId}`);
    else linked += target.itemIds.length;
    if (!Array.isArray(target.candidateAddresses) || !target.candidateAddresses.length) fail.push(`target has no candidate addresses: ${target.targetId}`);
  }

  for (const item of items) {
    if (!item.id) fail.push('item id missing');
    else if (itemIds.has(item.id)) fail.push(`duplicate item id: ${item.id}`);
    else itemIds.add(item.id);
    if (!item.name) missingName += 1;
    if (!item.address) missingAddress += 1;
    if (!item.regionKey || !item.region) missingRegion += 1;
    if (!item.targetId || !targetIds.has(item.targetId)) missingTarget += 1;
    if (!item.details || typeof item.details !== 'object') missingDetails += 1;
  }

  assert(missingName === 0, 'all prepared items have names');
  assert(missingAddress === 0, 'all prepared records have addresses');
  assert(missingRegion === 0, 'all prepared records have region labels');
  assert(missingTarget === 0, 'all prepared items link to geocode targets');
  assert(missingDetails === 0, 'all prepared items have details');
  assert(linked === items.length, 'target itemIds cover all prepared items');

  if ((summary.stats?.skippedNoAddress || 0) > 0) warn.push(`rows skipped because address missing: ${summary.stats.skippedNoAddress}`);
  if ((summary.stats?.unknownRegion || 0) > 0) warn.push(`unknown region rows: ${summary.stats.unknownRegion}`);
  if (targets.length > items.length) warn.push('target count is larger than item count; check address dedupe logic');
}

console.log('[verify-public-toilet-prep] ok:', ok.length);
if (warn.length) {
  console.warn('[verify-public-toilet-prep] warnings');
  warn.forEach((message) => console.warn(`- ${message}`));
}
if (fail.length) {
  console.error('[verify-public-toilet-prep] failed');
  fail.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('[verify-public-toilet-prep] passed');
