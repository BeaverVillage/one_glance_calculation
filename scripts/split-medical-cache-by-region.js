#!/usr/bin/env node
/**
 * 의료기관 대용량 캐시를 Cloudflare Pages 단일 파일 제한에 맞게 지역별/파티션별로 분할합니다.
 * v104부터 배포 경로 안정성을 위해 파일명은 한글 대신 ASCII slug를 사용합니다.
 *
 * 실행 예:
 *   node scripts/split-medical-cache-by-region.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MEDICAL_DIR = path.join(ROOT, 'assets/data/medical');
const VERSION = 'v104-medical-cache-slug-map-copy-init-fix';
const PARTITION_THRESHOLD = 20 * 1024 * 1024;
const PARTITION_TARGET = 12 * 1024 * 1024;
const REGIONS = [
  ['서울', '서울특별시', 'seoul'], ['부산', '부산광역시', 'busan'], ['대구', '대구광역시', 'daegu'], ['인천', '인천광역시', 'incheon'], ['광주', '광주광역시', 'gwangju'], ['대전', '대전광역시', 'daejeon'], ['울산', '울산광역시', 'ulsan'], ['세종', '세종특별자치시', 'sejong'],
  ['경기', '경기도', 'gyeonggi'], ['강원', '강원특별자치도', 'gangwon'], ['충북', '충청북도', 'chungbuk'], ['충남', '충청남도', 'chungnam'], ['전북', '전북특별자치도', 'jeonbuk'], ['전남', '전라남도', 'jeonnam'], ['경북', '경상북도', 'gyeongbuk'], ['경남', '경상남도', 'gyeongnam'], ['제주', '제주특별자치도', 'jeju'],
];
const alias = new Map();
REGIONS.forEach(([short, full]) => { alias.set(short, full); alias.set(full, full); });
alias.set('강원도', '강원특별자치도');
alias.set('전라북도', '전북특별자치도');
alias.set('제주도', '제주특별자치도');
const slugOf = (region) => (REGIONS.find(([, full]) => full === region) || [null, region, 'other'])[2];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};
const removeDir = (dir) => { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); };

const inferRegion = (entry = {}) => {
  for (const key of ['sido', 'region', 'province']) {
    const value = String(entry[key] || '').trim();
    if (alias.has(value)) return alias.get(value);
    for (const [short, full] of REGIONS) {
      if (value.includes(full) || value.startsWith(short)) return full;
    }
  }
  const haystack = `${entry.address || ''} ${entry.matchedAddress || ''} ${entry.name || ''}`;
  for (const [short, full] of REGIONS) {
    if (haystack.includes(full) || haystack.startsWith(short) || haystack.includes(` ${short}`)) return full;
  }
  return '기타';
};

const writePayload = (file, oldPayload, entries, region, type, sourceFile) => {
  const meta = {
    ...(oldPayload.meta || {}),
    version: VERSION,
    splitVersion: VERSION,
    type,
    region,
    regionSlug: slugOf(region),
    totalEntries: Object.keys(entries).length,
    sourceFile,
    note: `${oldPayload.meta?.note || ''} 지역별 분할 배포 캐시입니다.`.trim(),
  };
  writeJson(file, { version: VERSION, meta, entries });
};

const partitionIfNeeded = (file) => {
  if (!fs.existsSync(file) || fs.statSync(file).size <= PARTITION_THRESHOLD) return;
  const old = readJson(file);
  const entries = old.entries || {};
  const items = Object.entries(entries);
  const partCount = Math.max(2, Math.ceil(fs.statSync(file).size / PARTITION_TARGET));
  const chunkSize = Math.ceil(items.length / partCount);
  const partDir = file.replace(/\.json$/i, '');
  removeDir(partDir);
  fs.mkdirSync(partDir, { recursive: true });
  const parts = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const partEntries = Object.fromEntries(items.slice(i, i + chunkSize));
    const partName = `part-${String(parts.length + 1).padStart(2, '0')}.json`;
    const partPath = path.join(partDir, partName);
    writeJson(partPath, {
      version: old.version || VERSION,
      meta: { ...(old.meta || {}), version: VERSION, partitionOf: path.basename(file), partitionIndex: parts.length + 1, totalEntries: Object.keys(partEntries).length },
      entries: partEntries,
    });
    parts.push({ file: `${path.basename(partDir)}/${partName}`, count: Object.keys(partEntries).length, bytes: fs.statSync(partPath).size });
  }
  writeJson(file, {
    version: old.version || VERSION,
    meta: { ...(old.meta || {}), version: VERSION, partitioned: true, totalEntries: items.length, partCount: parts.length, note: `${old.meta?.note || ''} 파일 크기 제한 대응을 위해 파티션으로 분할된 매니페스트입니다.`.trim() },
    parts,
    entries: {},
  });
};

const splitNightCache = (sourceFile, outputDir, type) => {
  const source = path.join(MEDICAL_DIR, sourceFile);
  if (!fs.existsSync(source)) return null;
  const old = readJson(source);
  const buckets = new Map();
  Object.entries(old.entries || {}).forEach(([key, entry]) => {
    const region = inferRegion(entry);
    if (!buckets.has(region)) buckets.set(region, {});
    buckets.get(region)[key] = entry;
  });
  const output = path.join(MEDICAL_DIR, outputDir);
  removeDir(output);
  fs.mkdirSync(output, { recursive: true });
  const manifest = { version: VERSION, meta: { type, sourceFile, totalEntries: Object.keys(old.entries || {}).length, splitVersion: VERSION }, regions: {} };
  REGIONS.forEach(([, full, slug]) => {
    const entries = buckets.get(full) || {};
    const file = path.join(output, `${slug}.json`);
    writePayload(file, old, entries, full, type, sourceFile);
    partitionIfNeeded(file);
    manifest.regions[full] = { file: `${slug}.json`, slug, count: Object.keys(entries).length };
  });
  if (buckets.has('기타')) {
    const entries = buckets.get('기타');
    const file = path.join(output, 'other.json');
    writePayload(file, old, entries, '기타', type, sourceFile);
    partitionIfNeeded(file);
    manifest.regions['기타'] = { file: 'other.json', slug: 'other', count: Object.keys(entries).length };
  }
  writeJson(path.join(output, 'index.json'), manifest);
  fs.unlinkSync(source);
  return manifest;
};

const splitKakaoCache = () => {
  const sourceFile = 'kakao-place-cache.json';
  const source = path.join(MEDICAL_DIR, sourceFile);
  if (!fs.existsSync(source)) return null;
  const old = readJson(source);
  const output = path.join(MEDICAL_DIR, 'kakao-place');
  removeDir(output);
  fs.mkdirSync(path.join(output, 'hospital'), { recursive: true });
  fs.mkdirSync(path.join(output, 'pharmacy'), { recursive: true });
  const emergency = {};
  const buckets = { hospital: new Map(), pharmacy: new Map() };
  Object.entries(old.entries || {}).forEach(([key, entry]) => {
    const type = String(entry.type || '').trim();
    if (type === 'emergency') emergency[key] = entry;
    if (type === 'hospital' || type === 'pharmacy') {
      const region = inferRegion(entry);
      if (!buckets[type].has(region)) buckets[type].set(region, {});
      buckets[type].get(region)[key] = entry;
    }
  });
  writePayload(path.join(output, 'emergency.json'), old, emergency, '전국', 'medical-kakao-emergency', sourceFile);
  const manifest = { version: VERSION, meta: { type: 'medical-kakao-place', sourceFile, totalEntries: Object.keys(old.entries || {}).length, splitVersion: VERSION }, emergency: { file: 'emergency.json', count: Object.keys(emergency).length }, hospital: {}, pharmacy: {} };
  for (const type of ['hospital', 'pharmacy']) {
    REGIONS.forEach(([, full, slug]) => {
      const entries = buckets[type].get(full) || {};
      const file = path.join(output, type, `${slug}.json`);
      writePayload(file, old, entries, full, `medical-kakao-${type}`, sourceFile);
      partitionIfNeeded(file);
      manifest[type][full] = { file: `${type}/${slug}.json`, slug, count: Object.keys(entries).length };
    });
  }
  writeJson(path.join(output, 'index.json'), manifest);
  fs.unlinkSync(source);
  return manifest;
};

splitNightCache('night-hospital-cache.json', 'night-hospital', 'night-hospital');
splitNightCache('night-pharmacy-cache.json', 'night-pharmacy', 'night-pharmacy');
splitKakaoCache();
console.log('[medical-cache-split] done');
