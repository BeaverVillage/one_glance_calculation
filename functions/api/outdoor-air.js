const AIR_SIDO_ENDPOINT = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty';
const KMA_WARNING_ENDPOINT = 'https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList';
const SIDO_ALIASES = {
  서울특별시: '서울', 서울: '서울', 부산광역시: '부산', 부산: '부산', 대구광역시: '대구', 대구: '대구', 인천광역시: '인천', 인천: '인천', 광주광역시: '광주', 광주: '광주', 대전광역시: '대전', 대전: '대전', 울산광역시: '울산', 울산: '울산', 세종특별자치시: '세종', 세종: '세종', 경기도: '경기', 경기: '경기', 강원특별자치도: '강원', 강원도: '강원', 강원: '강원', 충청북도: '충북', 충북: '충북', 충청남도: '충남', 충남: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전북: '전북', 전라남도: '전남', 전남: '전남', 경상북도: '경북', 경북: '경북', 경상남도: '경남', 경남: '경남', 제주특별자치도: '제주', 제주도: '제주', 제주: '제주'
};

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'max-age=180',
    ...init.headers
  }
});

export async function onRequestOptions() { return new Response(null, { status: 204 }); }

export async function onRequestGet({ request, env }) {
  try {
    const key = getEnv(env, ['AIRKOREA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']);
    if (!key) return json({ ok: false, message: '에어코리아 API 키가 설정되지 않았습니다.' }, { status: 500 });

    const url = new URL(request.url);
    const sido = normalizeSido(url.searchParams.get('sido') || '서울');
    const station = clean(url.searchParams.get('station'), 40);
    const purpose = clean(url.searchParams.get('purpose') || 'walk', 20);
    const airUrl = new URL(AIR_SIDO_ENDPOINT);
    airUrl.searchParams.set('serviceKey', key);
    airUrl.searchParams.set('returnType', 'json');
    airUrl.searchParams.set('numOfRows', '100');
    airUrl.searchParams.set('pageNo', '1');
    airUrl.searchParams.set('sidoName', sido);
    airUrl.searchParams.set('ver', '1.0');

    const airData = await fetchJson(airUrl.toString(), '대기오염정보');
    const stations = extractItems(airData).map(normalizeAirItem).filter((item) => item.stationName);
    const representative = pickRepresentative(stations, station);
    const summary = buildAirSummary(representative, stations, purpose);
    const warning = await fetchKmaWarning(env, key).catch((error) => ({ ok: false, message: error?.message || '기상특보 조회를 생략했습니다.' }));

    return json({
      ok: true,
      checkedAt: new Date().toISOString(),
      sido,
      station,
      purpose,
      representative,
      summary,
      warning,
      stations: stations.slice(0, 80)
    });
  } catch (error) {
    return json({ ok: false, message: error?.message || '대기질 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}

async function fetchKmaWarning(env, fallbackKey) {
  const key = getEnv(env, ['KMA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']) || fallbackKey;
  if (!key) return { ok: false, message: '기상청 특보 API 키가 설정되지 않았습니다.' };
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const url = new URL(KMA_WARNING_ENDPOINT);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '20');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('fromTmFc', from);
  url.searchParams.set('toTmFc', ymd);
  const data = await fetchJson(url.toString(), '기상특보');
  const items = extractItems(data);
  return { ok: true, count: items.length, items: items.slice(0, 10).map(normalizeWarningItem) };
}

async function fetchJson(url, label) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`${label} API 응답 오류가 발생했습니다. (${response.status})`);
  if (typeof data?.raw === 'string' && data.raw.includes('<OpenAPI_ServiceResponse>')) throw new Error(`${label} API 키 승인 또는 요청 파라미터를 확인해 주세요.`);
  return data || {};
}

function extractItems(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || data?.items?.item || data?.items || [];
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') return [items];
  return [];
}

function normalizeAirItem(item) {
  const pm10 = toNumber(item.pm10Value, null);
  const pm25 = toNumber(item.pm25Value, null);
  const o3 = toNumber(item.o3Value, null);
  const khai = toNumber(item.khaiValue, null);
  return {
    stationName: String(item.stationName || '').trim(),
    dataTime: String(item.dataTime || '').trim(),
    pm10,
    pm25,
    o3,
    khai,
    pm10Grade: String(item.pm10Grade || '').trim(),
    pm25Grade: String(item.pm25Grade || '').trim(),
    o3Grade: String(item.o3Grade || '').trim(),
    khaiGrade: String(item.khaiGrade || '').trim(),
    pm10Label: gradeLabel(item.pm10Grade, pm10, 'pm10'),
    pm25Label: gradeLabel(item.pm25Grade, pm25, 'pm25'),
    o3Label: gradeLabel(item.o3Grade, o3, 'o3'),
    khaiLabel: gradeLabel(item.khaiGrade, khai, 'khai')
  };
}

function normalizeWarningItem(item) {
  return {
    title: item.title || item.t6 || item.wrn || '기상특보',
    time: item.tmFc || item.announceTime || '',
    area: item.area || item.zone || item.t7 || '',
    raw: item
  };
}

function pickRepresentative(stations, target) {
  if (!stations.length) return null;
  if (target) {
    const found = stations.find((item) => item.stationName.includes(target) || target.includes(item.stationName));
    if (found) return found;
  }
  return stations.find((item) => item.pm25 !== null || item.pm10 !== null || item.khai !== null) || stations[0];
}

function buildAirSummary(item, stations, purpose) {
  if (!item) return { tone: 'unknown', title: '측정정보 없음', message: '선택한 지역의 대기질 정보를 불러오지 못했습니다.' };
  const worstGrade = Math.max(gradeNumber(item.pm10Grade, item.pm10, 'pm10'), gradeNumber(item.pm25Grade, item.pm25, 'pm25'), gradeNumber(item.o3Grade, item.o3, 'o3'), gradeNumber(item.khaiGrade, item.khai, 'khai'));
  const tone = worstGrade >= 4 ? 'bad' : worstGrade === 3 ? 'warning' : worstGrade === 2 ? 'normal' : 'good';
  const title = tone === 'bad' ? '외출 전 확인이 많이 필요합니다' : tone === 'warning' ? '장시간 야외활동은 조절을 고려하세요' : tone === 'normal' ? '보통 수준으로 확인됩니다' : '외출하기 비교적 무난한 수준입니다';
  const purposeMessage = purposeAdvice(purpose, tone);
  return {
    tone,
    title,
    message: purposeMessage,
    stationName: item.stationName,
    dataTime: item.dataTime,
    count: stations.length
  };
}

function purposeAdvice(purpose, tone) {
  const bad = tone === 'bad' || tone === 'warning';
  const map = {
    commute: bad ? '출근·등교 전 마스크, 이동 동선, 실내 대기 시간을 함께 확인해 주세요.' : '출근·등교 목적이라면 일반적인 이동은 큰 부담이 적은 편으로 볼 수 있습니다.',
    child: bad ? '아이 외출은 체류 시간을 줄이고 실내 활동 대안을 함께 고려해 주세요.' : '아이 외출은 체류 시간과 장소를 함께 보며 무리 없는 범위에서 판단해 주세요.',
    exercise: bad ? '야외 고강도 운동은 줄이고 실내 운동 또는 짧은 산책으로 조절하는 것을 고려할 수 있습니다.' : '운동 목적이라면 시간대와 개인 컨디션을 함께 확인해 주세요.',
    walk: bad ? '산책은 시간을 짧게 잡고 대기질이 나아지는 시간대를 다시 확인해 보세요.' : '산책 목적이라면 현재 대기질 기준으로 비교적 무난한 편입니다.',
    drive: bad ? '운전 시 창문 개방과 장시간 외부 대기를 줄이는 것을 고려해 주세요.' : '운전 목적이라면 대기질보다 기상특보와 시야 상황을 함께 확인해 주세요.'
  };
  return map[purpose] || map.walk;
}

function gradeLabel(grade, value, type) {
  const n = gradeNumber(grade, value, type);
  return ['정보 없음', '좋음', '보통', '나쁨', '매우 나쁨'][n] || '정보 없음';
}

function gradeNumber(grade, value, type) {
  const n = Number(grade);
  if ([1, 2, 3, 4].includes(n)) return n;
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  if (type === 'pm10') return value <= 30 ? 1 : value <= 80 ? 2 : value <= 150 ? 3 : 4;
  if (type === 'pm25') return value <= 15 ? 1 : value <= 35 ? 2 : value <= 75 ? 3 : 4;
  if (type === 'o3') return value <= 0.03 ? 1 : value <= 0.09 ? 2 : value <= 0.15 ? 3 : 4;
  if (type === 'khai') return value <= 50 ? 1 : value <= 100 ? 2 : value <= 250 ? 3 : 4;
  return 0;
}

function normalizeSido(value) { return SIDO_ALIASES[String(value || '').trim()] || '서울'; }
function toNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function getEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
