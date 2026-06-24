const fs = require('fs');
const path = require('path');
const root = process.cwd();

const checks = [
  {
    file: 'tools/fishing-spot-map.html',
    name: '낚시터 찾기',
    must: ['life-adsense-content-v123', '낚시터 정보 해석', '방문 전 체크리스트', '거리 기준 확인', '요금·예약 확인', '공중화장실 찾기', '무료 와이파이 찾기'],
    faqMin: 6,
  },
  {
    file: 'tools/free-wifi-map.html',
    name: '무료 와이파이 찾기',
    must: ['life-adsense-content-v123', '무료 와이파이 정보 해석', '와이파이 이름', '비밀번호', '보안 주의', '공중화장실 찾기'],
    faqMin: 6,
  },
  {
    file: 'tools/public-toilet-map.html',
    name: '공중화장실 찾기',
    must: ['life-adsense-content-v123', '공중화장실 정보 해석', '개방시간', '장애인 화장실', '비상벨·CCTV', '지도 위치 재확인'],
    faqMin: 6,
  },
  {
    file: 'tools/emergency-hospital-check.html',
    name: '응급실·야간 병원 확인',
    must: ['life-adsense-content-v123', '응급의료 정보 해석', '위급 상황에서는 119', '중증 항목', '전화로 수용 확인', '야간 약국'],
    faqMin: 6,
  },
];

function fail(message) {
  console.error(`[verify-adsense-content-phase16] ${message}`);
  process.exit(1);
}

for (const check of checks) {
  const filePath = path.join(root, check.file);
  if (!fs.existsSync(filePath)) fail(`${check.file} missing`);
  const html = fs.readFileSync(filePath, 'utf8');
  for (const token of check.must) {
    if (!html.includes(token)) fail(`${check.name}: required text missing: ${token}`);
  }
  const match = html.match(/<script data-schema="faqpage" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) fail(`${check.name}: FAQPage JSON-LD missing`);
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    fail(`${check.name}: FAQPage JSON-LD parse error: ${error.message}`);
  }
  if (data['@type'] !== 'FAQPage') fail(`${check.name}: FAQPage type invalid`);
  if (!Array.isArray(data.mainEntity) || data.mainEntity.length < check.faqMin) {
    fail(`${check.name}: FAQ item count too small`);
  }
  const detailCount = (html.match(/<details>/g) || []).length;
  if (detailCount < 3) fail(`${check.name}: visible FAQ details too small`);
}

const linkChecks = [
  ['tools/fishing-spot-map.html', '/tools/public-toilet-map.html'],
  ['tools/fishing-spot-map.html', '/tools/free-wifi-map.html'],
  ['tools/free-wifi-map.html', '/tools/public-toilet-map.html'],
  ['tools/public-toilet-map.html', '/tools/free-wifi-map.html'],
  ['tools/emergency-hospital-check.html', '/tools/parking-fee-check.html'],
];
for (const [file, link] of linkChecks) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (!html.includes(`href="${link}"`)) fail(`${file}: related link missing: ${link}`);
}

console.log('[verify-adsense-content-phase16] passed');
