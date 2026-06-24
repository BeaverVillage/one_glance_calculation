const AIR_SIDO_ENDPOINT = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty';
const KMA_WARNING_ENDPOINT = 'https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList';
const KMA_FORECAST_ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const KMA_LIVING_INDEX_BASE = 'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4';

const SERVER_VERSION = 'v86-final-qa';

const SIDO_ALIASES = {
  서울특별시: '서울', 서울: '서울', 부산광역시: '부산', 부산: '부산', 대구광역시: '대구', 대구: '대구', 인천광역시: '인천', 인천: '인천', 광주광역시: '광주', 광주: '광주', 대전광역시: '대전', 대전: '대전', 울산광역시: '울산', 울산: '울산', 세종특별자치시: '세종', 세종: '세종', 경기도: '경기', 경기: '경기', 강원특별자치도: '강원', 강원도: '강원', 강원: '강원', 충청북도: '충북', 충북: '충북', 충청남도: '충남', 충남: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전북: '전북', 전라남도: '전남', 전남: '전남', 경상북도: '경북', 경북: '경북', 경상남도: '경남', 경남: '경남', 제주특별자치도: '제주', 제주도: '제주', 제주: '제주'
};


const KMA_LIVING_AREA_NO = {
  서울: '1100000000', 부산: '2600000000', 대구: '2700000000', 인천: '2800000000', 광주: '2900000000', 대전: '3000000000', 울산: '3100000000', 세종: '3600000000', 경기: '4100000000', 강원: '4200000000', 충북: '4300000000', 충남: '4400000000', 전북: '4500000000', 전남: '4600000000', 경북: '4700000000', 경남: '4800000000', 제주: '5000000000'
};

const SIDO_CENTER = {
  서울: { lat: 37.5665, lng: 126.9780 }, 부산: { lat: 35.1796, lng: 129.0756 }, 대구: { lat: 35.8714, lng: 128.6014 }, 인천: { lat: 37.4563, lng: 126.7052 }, 광주: { lat: 35.1595, lng: 126.8526 }, 대전: { lat: 36.3504, lng: 127.3845 }, 울산: { lat: 35.5384, lng: 129.3114 }, 세종: { lat: 36.4800, lng: 127.2890 }, 경기: { lat: 37.4138, lng: 127.5183 }, 강원: { lat: 37.8228, lng: 128.1555 }, 충북: { lat: 36.6357, lng: 127.4913 }, 충남: { lat: 36.6588, lng: 126.6728 }, 전북: { lat: 35.8203, lng: 127.1088 }, 전남: { lat: 34.8161, lng: 126.4629 }, 경북: { lat: 36.4919, lng: 128.8889 }, 경남: { lat: 35.4606, lng: 128.2132 }, 제주: { lat: 33.4996, lng: 126.5312 }
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
    const airKey = getEnv(env, ['AIRKOREA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']);
    if (!airKey) return json({ ok: false, message: '에어코리아 API 키가 설정되지 않았습니다.' }, { status: 500 });

    const url = new URL(request.url);
    const sido = normalizeSido(url.searchParams.get('sido') || '서울');
    const station = clean(url.searchParams.get('station'), 40);
    const purpose = clean(url.searchParams.get('purpose') || 'walk', 20);
    const timeSlot = clean(url.searchParams.get('time') || 'now', 20);
    const lat = toNumber(url.searchParams.get('lat'), null);
    const lng = toNumber(url.searchParams.get('lng'), null);

    const airUrl = new URL(AIR_SIDO_ENDPOINT);
    airUrl.searchParams.set('serviceKey', airKey);
    airUrl.searchParams.set('returnType', 'json');
    airUrl.searchParams.set('numOfRows', '100');
    airUrl.searchParams.set('pageNo', '1');
    airUrl.searchParams.set('sidoName', sido);
    airUrl.searchParams.set('ver', '1.0');

    const [airData, forecastResult, livingResult, warningResult] = await Promise.allSettled([
      fetchJson(airUrl.toString(), '대기오염정보'),
      fetchKmaForecast(env, { sido, lat, lng, timeSlot }),
      fetchKmaLivingIndex(env, { sido, timeSlot }),
      fetchKmaWarning(env, airKey)
    ]);

    if (airData.status === 'rejected') throw airData.reason;

    const stations = extractItems(airData.value).map(normalizeAirItem).filter((item) => item.stationName);
    const representative = pickRepresentative(stations, station);
    const forecast = forecastResult.status === 'fulfilled'
      ? forecastResult.value
      : { ok: false, message: forecastResult.reason?.message || '기상청 단기예보 조회를 생략했습니다.' };
    const livingIndex = livingResult.status === 'fulfilled'
      ? livingResult.value
      : { ok: false, message: livingResult.reason?.message || '생활기상지수 조회를 생략했습니다.' };
    const warning = warningResult.status === 'fulfilled'
      ? warningResult.value
      : { ok: false, message: '기상특보 정보는 제공기관 응답 상태에 따라 일부 생략될 수 있습니다.' };
    const summary = buildAirSummary(representative, stations, purpose, forecast, livingIndex);
    const risk = buildOutdoorRisk(representative, purpose, timeSlot, forecast, livingIndex);

    return json({
      ok: true,
      serverVersion: SERVER_VERSION,
      checkedAt: new Date().toISOString(),
      sido,
      station,
      purpose,
      timeSlot,
      representative,
      summary,
      risk,
      forecast,
      livingIndex,
      warning,
      stations: stations.slice(0, 80)
    });
  } catch (error) {
    return json({ ok: false, serverVersion: SERVER_VERSION, message: error?.message || '대기질 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}

async function fetchKmaForecast(env, context) {
  const key = getEnv(env, ['KMA_FORECAST_API_KEY', 'KMA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']);
  if (!key) return { ok: false, code: 'api_key_missing', message: 'KMA_FORECAST_API_KEY가 설정되지 않아 강수확률·기온·풍속을 반영하지 못했습니다.' };
  const center = resolveForecastPoint(context.sido, context.lat, context.lng);
  const grid = dfsGrid(center.lat, center.lng);
  const base = getVillageForecastBase(new Date());
  const target = getTargetForecastDateTime(context.timeSlot, new Date());
  const forecastUrl = new URL(KMA_FORECAST_ENDPOINT);
  forecastUrl.searchParams.set('serviceKey', key);
  forecastUrl.searchParams.set('pageNo', '1');
  forecastUrl.searchParams.set('numOfRows', '1000');
  forecastUrl.searchParams.set('dataType', 'JSON');
  forecastUrl.searchParams.set('base_date', base.date);
  forecastUrl.searchParams.set('base_time', base.time);
  forecastUrl.searchParams.set('nx', String(grid.nx));
  forecastUrl.searchParams.set('ny', String(grid.ny));

  const data = await fetchJson(forecastUrl.toString(), '기상청 단기예보');
  const rows = extractItems(data).map(normalizeForecastItem).filter((item) => item.category && item.fcstDate && item.fcstTime);
  const selected = selectForecastByTime(rows, target);
  if (!selected) {
    return {
      ok: false,
      code: 'forecast_empty',
      message: '기상청 단기예보에서 선택한 시간대의 예보값을 찾지 못했습니다.',
      grid,
      baseDate: base.date,
      baseTime: base.time,
      targetDate: target.date,
      targetTime: target.time
    };
  }
  const weather = buildWeatherSummary(selected.values, context.timeSlot);
  return {
    ok: true,
    source: 'KMA_SHORT_FORECAST',
    grid,
    point: center,
    baseDate: base.date,
    baseTime: base.time,
    targetDate: selected.date,
    targetTime: selected.time,
    targetLabel: `${formatDateLabel(selected.date)} ${formatHourLabel(selected.time)}`,
    values: selected.values,
    summary: weather.summary,
    cards: weather.cards,
    penalties: weather.penalties,
    actions: weather.actions,
    rowCount: rows.length
  };
}


async function fetchKmaLivingIndex(env, context) {
  const key = getEnv(env, ['KMA_LIVING_INDEX_API_KEY', 'KMA_LIVING_API_KEY', 'KMA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']);
  if (!key) return { ok: false, code: 'api_key_missing', message: 'KMA_LIVING_INDEX_API_KEY가 설정되지 않아 자외선지수·대기정체지수를 반영하지 못했습니다.' };
  const areaNo = KMA_LIVING_AREA_NO[context.sido] || KMA_LIVING_AREA_NO.서울;
  const requestTime = getLivingIndexRequestTime(context.timeSlot, new Date());

  const [uvResult, diffusionResult] = await Promise.allSettled([
    fetchLivingIndexEndpoint(key, 'getUVIdxV4', '자외선지수', areaNo, requestTime),
    fetchLivingIndexEndpoint(key, 'getAirDiffusionIdxV4', '대기정체지수', areaNo, requestTime)
  ]);

  const uv = uvResult.status === 'fulfilled' ? uvResult.value : { ok: false, key: 'uv', title: '자외선지수', message: uvResult.reason?.message || '자외선지수를 확인하지 못했습니다.' };
  const diffusion = diffusionResult.status === 'fulfilled' ? diffusionResult.value : { ok: false, key: 'airDiffusion', title: '대기정체지수', message: diffusionResult.reason?.message || '대기정체지수를 확인하지 못했습니다.' };
  const cards = [];
  const actions = [];
  const penalties = { uv: 0, stagnation: 0 };

  if (uv.ok) {
    cards.push({ key: 'uv', title: '자외선지수', value: uv.displayValue, unit: '', label: uv.label, tone: uv.tone, sourceLabel: uv.targetLabel });
    penalties.uv = uv.penalty;
    actions.push(...uv.actions);
  }
  if (diffusion.ok) {
    cards.push({ key: 'airDiffusion', title: '대기정체지수', value: diffusion.displayValue, unit: '', label: diffusion.label, tone: diffusion.tone, sourceLabel: diffusion.targetLabel });
    penalties.stagnation = diffusion.penalty;
    actions.push(...diffusion.actions);
  }

  return {
    ok: Boolean(uv.ok || diffusion.ok),
    source: 'KMA_LIVING_INDEX',
    areaNo,
    requestTime,
    targetLabel: formatLivingTimeLabel(requestTime),
    uv,
    airDiffusion: diffusion,
    cards,
    penalties,
    actions: uniqueStrings(actions),
    message: uv.ok || diffusion.ok ? '기상청 생활기상지수를 반영했습니다.' : [uv.message, diffusion.message].filter(Boolean).join(' / ')
  };
}

async function fetchLivingIndexEndpoint(key, operation, title, areaNo, requestTime) {
  const url = new URL(`${KMA_LIVING_INDEX_BASE}/${operation}`);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '10');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('areaNo', areaNo);
  url.searchParams.set('time', requestTime);
  const data = await fetchJson(url.toString(), `기상청 ${title}`);
  const item = extractItems(data)[0] || {};
  const selected = pickLivingIndexValue(item);
  if (!selected) throw new Error(`기상청 ${title} 응답에서 예측값을 찾지 못했습니다.`);
  if (operation === 'getUVIdxV4') return normalizeUvIndex(selected, item, requestTime);
  return normalizeAirDiffusionIndex(selected, item, requestTime);
}

function pickLivingIndexValue(item) {
  if (!item || typeof item !== 'object') return null;
  const hourKeys = Object.keys(item)
    .filter((key) => /^h\d+$/i.test(key) && String(item[key] ?? '').trim() !== '')
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const key = hourKeys[0];
  if (!key) return null;
  return { key, value: item[key] };
}

function normalizeUvIndex(selected, raw, requestTime) {
  const number = toNumber(selected.value, null);
  const valueText = String(selected.value ?? '').trim();
  const label = uvIndexLabel(number, valueText);
  const tone = number === null ? 'unknown' : number >= 8 ? 'bad' : number >= 6 ? 'warning' : number >= 3 ? 'normal' : 'good';
  const penalty = number === null ? 4 : number >= 11 ? 22 : number >= 8 ? 18 : number >= 6 ? 12 : number >= 3 ? 4 : 0;
  const actions = [];
  if (number !== null && number >= 6) actions.push('자외선 차단제·모자 준비');
  if (number !== null && number >= 8) actions.push('한낮 장시간 외출 피하기');
  if (!actions.length) actions.push('자외선 부담은 비교적 낮은 편');
  return {
    ok: true,
    key: 'uv',
    title: '자외선지수',
    value: number,
    displayValue: number ?? valueText,
    label,
    tone,
    penalty,
    actions,
    targetHour: selected.key,
    targetLabel: `${formatLivingTimeLabel(requestTime)} · ${selected.key.toUpperCase()}`,
    raw
  };
}

function normalizeAirDiffusionIndex(selected, raw, requestTime) {
  const valueText = String(selected.value ?? '').trim();
  const number = toNumber(valueText.replace(/[^0-9.\-]/g, ''), null);
  const label = airDiffusionLabel(valueText, number);
  const isBad = /낮|나쁨|매우나쁨|정체/.test(valueText) || (number !== null && number <= 25);
  const isNormal = /보통/.test(valueText) || (number !== null && number > 25 && number < 75);
  const tone = isBad ? 'warning' : isNormal ? 'normal' : 'good';
  const penalty = isBad ? 12 : isNormal ? 4 : 0;
  const actions = isBad
    ? ['대기정체 가능성 확인', '오염물질이 머무를 수 있어 대기질 재확인']
    : ['대기 확산 조건은 큰 부담이 낮은 편'];
  return {
    ok: true,
    key: 'airDiffusion',
    title: '대기정체지수',
    value: number,
    displayValue: valueText || number,
    label,
    tone,
    penalty,
    actions,
    targetHour: selected.key,
    targetLabel: `${formatLivingTimeLabel(requestTime)} · ${selected.key.toUpperCase()}`,
    raw
  };
}

async function fetchKmaWarning(env, fallbackKey) {
  const key = getEnv(env, ['KMA_API_KEY', 'KMA_FORECAST_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']) || fallbackKey;
  if (!key) return { ok: false, message: '기상청 특보 API 키가 설정되지 않았습니다.' };
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const from = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
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
  const header = data?.response?.header;
  if (header?.resultCode && String(header.resultCode) !== '00') {
    throw new Error(`${label} API 오류: ${header.resultMsg || header.resultCode}`);
  }
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

function normalizeForecastItem(item) {
  return {
    category: String(item.category || '').trim(),
    fcstDate: String(item.fcstDate || '').trim(),
    fcstTime: String(item.fcstTime || '').padStart(4, '0'),
    value: String(item.fcstValue ?? '').trim()
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

function buildAirSummary(item, stations, purpose, forecast, livingIndex) {
  if (!item) return { tone: 'unknown', title: '측정정보 없음', message: '선택한 지역의 대기질 정보를 불러오지 못했습니다.' };
  const worstGrade = Math.max(gradeNumber(item.pm10Grade, item.pm10, 'pm10'), gradeNumber(item.pm25Grade, item.pm25, 'pm25'), gradeNumber(item.o3Grade, item.o3, 'o3'), gradeNumber(item.khaiGrade, item.khai, 'khai'));
  const tone = worstGrade >= 4 ? 'bad' : worstGrade === 3 ? 'warning' : worstGrade === 2 ? 'normal' : 'good';
  const hasWeatherConcern = forecast?.ok && (toNumber(forecast.values?.pop, 0) >= 60 || toNumber(forecast.values?.pty, 0) > 0 || Math.abs(toNumber(forecast.values?.wsd, 0)) >= 9);
  const hasLivingConcern = livingIndex?.ok && ((livingIndex.penalties?.uv || 0) >= 12 || (livingIndex.penalties?.stagnation || 0) >= 8);
  const title = hasLivingConcern ? '자외선·대기정체까지 함께 확인하세요' : hasWeatherConcern ? '대기질과 날씨를 함께 확인하세요' : tone === 'bad' ? '외출 전 확인이 많이 필요합니다' : tone === 'warning' ? '장시간 야외활동은 조절을 고려하세요' : tone === 'normal' ? '보통 수준으로 확인됩니다' : '외출하기 비교적 무난한 수준입니다';
  const purposeMessage = purposeAdvice(purpose, tone, forecast);
  return {
    tone,
    title,
    message: purposeMessage,
    stationName: item.stationName,
    dataTime: item.dataTime,
    count: stations.length
  };
}

function buildOutdoorRisk(item, purpose, timeSlot, forecast, livingIndex) {
  if (!item) {
    return {
      score: null,
      tone: 'unknown',
      gradeLabel: '정보 확인',
      title: '외출 위험도를 계산하지 못했습니다',
      message: '선택한 지역의 대표 대기질 정보가 부족합니다.',
      actions: ['지역을 바꿔 다시 조회', '측정소별 세부 정보 확인'],
      readiness: ['대기질 데이터 부족', forecast?.ok ? '기상청 단기예보 반영' : '기상청 단기예보 미반영', livingIndex?.ok ? '생활기상지수 반영' : '생활기상지수 미반영'],
      weather: forecast?.ok ? forecast : null
    };
  }
  const grades = {
    pm25: gradeNumber(item.pm25Grade, item.pm25, 'pm25'),
    pm10: gradeNumber(item.pm10Grade, item.pm10, 'pm10'),
    o3: gradeNumber(item.o3Grade, item.o3, 'o3'),
    khai: gradeNumber(item.khaiGrade, item.khai, 'khai')
  };
  let score = 100;
  score -= penaltyByGrade(grades.pm25, 28);
  score -= penaltyByGrade(grades.pm10, 18);
  score -= penaltyByGrade(grades.o3, 22);
  score -= Math.round(penaltyByGrade(grades.khai, 16) * 0.6);
  if (['exercise', 'hiking', 'bike', 'child'].includes(purpose)) score -= 5;
  if (forecast?.ok) {
    score -= forecast.penalties?.rain || 0;
    score -= forecast.penalties?.temperature || 0;
    score -= forecast.penalties?.wind || 0;
    score -= forecast.penalties?.humidity || 0;
  }
  if (livingIndex?.ok) {
    score -= livingIndex.penalties?.uv || 0;
    score -= livingIndex.penalties?.stagnation || 0;
  }
  score = Math.max(0, Math.min(100, score));
  const tone = riskTone(score);
  const actions = purposeActions(purpose, tone);
  if (forecast?.ok) actions.push(...forecast.actions.slice(0, 3));
  if (livingIndex?.ok) actions.push(...livingIndex.actions.slice(0, 3));
  return {
    score,
    tone,
    gradeLabel: riskGradeLabel(score),
    title: riskTitle(score, forecast),
    message: purposeRiskMessage(purpose, tone, forecast),
    actions: uniqueStrings(actions).slice(0, 6),
    readiness: [
      '에어코리아 대기질 데이터 반영',
      forecast?.ok ? `기상청 단기예보 반영 · ${forecast.targetLabel}` : '기상청 단기예보 미반영',
      livingIndex?.ok ? `생활기상지수 반영 · ${livingIndex.targetLabel}` : '생활기상지수 미반영',
      `${timeLabel(timeSlot)} 기준 참고 문구 적용`
    ],
    reasons: {
      pm25: metricReason(item.pm25Label),
      pm10: metricReason(item.pm10Label),
      o3: metricReason(item.o3Label),
      khai: metricReason(item.khaiLabel)
    },
    weather: forecast?.ok ? forecast : null,
    livingIndex: livingIndex?.ok ? livingIndex : null,
    forecastMessage: forecast?.ok ? forecast.summary?.message : forecast?.message,
    livingIndexMessage: livingIndex?.ok ? livingIndex.message : livingIndex?.message
  };
}

function buildWeatherSummary(values, timeSlot) {
  const pop = toNumber(values.POP, null);
  const tmp = toNumber(values.TMP, null);
  const reh = toNumber(values.REH, null);
  const wsd = toNumber(values.WSD, null);
  const sky = toNumber(values.SKY, null);
  const pty = toNumber(values.PTY, null);
  const pcp = values.PCP || '';
  const rainPenalty = (pty && pty > 0) ? 18 : pop >= 70 ? 20 : pop >= 40 ? 12 : pop >= 20 ? 4 : 0;
  const tempPenalty = tmp >= 33 ? 18 : tmp >= 30 ? 9 : tmp <= -10 ? 18 : tmp <= 0 ? 8 : 0;
  const windPenalty = wsd >= 9 ? 12 : wsd >= 4 ? 5 : 0;
  const humidityPenalty = reh >= 85 ? 4 : 0;
  const actions = [];
  if (rainPenalty >= 12) actions.push('우산 또는 우비 준비');
  if (tempPenalty >= 12 && tmp >= 30) actions.push('더위 노출 시간 줄이기');
  if (tempPenalty >= 12 && tmp <= 0) actions.push('보온 준비');
  if (windPenalty >= 10) actions.push('강한 바람에 대비');
  if (!actions.length) actions.push('날씨 예보는 큰 부담이 낮은 편');
  const skyText = skyLabel(sky, pty);
  const message = [
    pop !== null ? `강수확률 ${pop}%` : '',
    tmp !== null ? `기온 ${tmp}℃` : '',
    wsd !== null ? `풍속 ${wsd}m/s` : '',
    skyText ? skyText : ''
  ].filter(Boolean).join(' · ');
  return {
    summary: {
      title: `${timeLabel(timeSlot)} 날씨 예보`,
      message: message || '기상청 단기예보 값을 확인했습니다.'
    },
    values: { pop, tmp, reh, wsd, sky, pty, pcp },
    cards: [
      { key: 'pop', title: '강수확률', value: pop, unit: '%', label: popLabel(pop, pty), tone: rainPenalty >= 12 ? 'warning' : 'normal' },
      { key: 'tmp', title: '예상 기온', value: tmp, unit: '℃', label: tempLabel(tmp), tone: tempPenalty >= 12 ? 'warning' : 'normal' },
      { key: 'reh', title: '습도', value: reh, unit: '%', label: humidityLabel(reh), tone: humidityPenalty > 0 ? 'warning' : 'normal' },
      { key: 'wsd', title: '풍속', value: wsd, unit: 'm/s', label: windLabel(wsd), tone: windPenalty >= 10 ? 'warning' : 'normal' },
      { key: 'sky', title: '하늘상태', value: skyText, unit: '', label: pcp && pcp !== '강수없음' ? String(pcp) : '기상청 예보', tone: rainPenalty >= 12 ? 'warning' : 'normal' }
    ],
    penalties: { rain: rainPenalty, temperature: tempPenalty, wind: windPenalty, humidity: humidityPenalty },
    actions: uniqueStrings(actions)
  };
}

function selectForecastByTime(rows, target) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.fcstDate}${row.fcstTime}`;
    if (!groups.has(key)) groups.set(key, { date: row.fcstDate, time: row.fcstTime, values: {} });
    groups.get(key).values[row.category] = row.value;
  }
  const targetKey = Number(`${target.date}${target.time}`);
  const sorted = Array.from(groups.values())
    .filter((group) => group.values.POP !== undefined || group.values.TMP !== undefined || group.values.SKY !== undefined)
    .sort((a, b) => Number(`${a.date}${a.time}`) - Number(`${b.date}${b.time}`));
  return sorted.find((group) => Number(`${group.date}${group.time}`) >= targetKey) || sorted[0] || null;
}

function resolveForecastPoint(sido, lat, lng) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, source: 'selected_place' };
  const center = SIDO_CENTER[sido] || SIDO_CENTER.서울;
  return { ...center, source: 'sido_center' };
}

function dfsGrid(lat, lng) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

function getVillageForecastBase(now) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // 단기예보 발표시각은 02/05/08/11/14/17/20/23시 기준이다. 제공 지연을 고려해 약 1시간 10분 이전 시각을 기준으로 잡는다.
  const safe = new Date(kst.getTime() - 70 * 60 * 1000);
  const times = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  const hhmm = `${pad2(safe.getUTCHours())}${pad2(safe.getUTCMinutes())}`;
  let baseTime = times.filter((time) => time <= hhmm).pop();
  let baseDateObj = safe;
  if (!baseTime) {
    baseDateObj = new Date(safe.getTime() - 24 * 60 * 60 * 1000);
    baseTime = '2300';
  }
  return { date: ymd(baseDateObj), time: baseTime };
}

function getTargetForecastDateTime(timeSlot, now) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const target = new Date(kst.getTime());
  const normalized = String(timeSlot || 'now');
  if (normalized === 'tomorrow') {
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(12, 0, 0, 0);
  } else if (normalized === 'morning') {
    target.setUTCHours(9, 0, 0, 0);
  } else if (normalized === 'afternoon') {
    target.setUTCHours(15, 0, 0, 0);
  } else if (normalized === 'evening') {
    target.setUTCHours(19, 0, 0, 0);
  } else {
    target.setUTCMinutes(0, 0, 0);
    target.setUTCHours(target.getUTCHours() + 1);
  }
  return { date: ymd(target), time: `${pad2(target.getUTCHours())}00` };
}

function ymd(date) { return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`; }
function pad2(value) { return String(value).padStart(2, '0'); }
function formatDateLabel(value) { return `${value.slice(4, 6)}/${value.slice(6, 8)}`; }
function formatHourLabel(value) { return `${value.slice(0, 2)}시`; }

function penaltyByGrade(grade, base) {
  if (grade >= 4) return base + 12;
  if (grade === 3) return base;
  if (grade === 2) return Math.round(base * 0.3);
  if (grade === 1) return 0;
  return 6;
}

function riskTone(score) { return score >= 85 ? 'good' : score >= 70 ? 'normal' : score >= 50 ? 'warning' : 'bad'; }
function riskGradeLabel(score) { return score >= 85 ? '좋음' : score >= 70 ? '보통' : score >= 50 ? '주의' : score >= 30 ? '나쁨' : '외출 자제'; }
function riskTitle(score, forecast) {
  const weatherSuffix = forecast?.ok ? ' · 날씨 반영' : '';
  return (score >= 85 ? '외출 부담이 낮은 편입니다' : score >= 70 ? '일반 외출은 보통 수준입니다' : score >= 50 ? '장시간 야외활동은 조절이 필요합니다' : score >= 30 ? '외출 전 확인이 많이 필요합니다' : '야외활동을 줄이는 편이 좋습니다') + weatherSuffix;
}

function purposeRiskMessage(purpose, tone, forecast) {
  const careful = tone === 'warning' || tone === 'bad';
  const weatherMessage = forecast?.ok ? ` ${forecast.summary?.message || ''}` : '';
  const map = {
    commute: careful ? '출근·등교는 가능하더라도 마스크, 우산, 이동 동선을 함께 확인해 주세요.' : '출근·등교 목적의 일반 이동은 현재 기준으로 큰 부담이 낮은 편입니다.',
    child: careful ? '아이와 외출은 체류 시간을 줄이고 실내 활동 대안을 함께 고려해 주세요.' : '아이와 외출은 체류 시간과 장소를 함께 보며 무리 없는 범위에서 판단해 주세요.',
    exercise: careful ? '러닝·고강도 운동은 줄이고 실내 운동이나 짧은 산책으로 조절하는 것을 고려해 주세요.' : '러닝·운동은 개인 컨디션과 시간대를 함께 확인하면 무난한 편입니다.',
    walk: careful ? '산책은 시간을 짧게 잡고 대기질과 강수확률이 나아지는 시간대를 다시 확인해 보세요.' : '산책 목적이라면 현재 기준으로 비교적 무난한 편입니다.',
    hiking: careful ? '등산은 노출 시간이 길어질 수 있으므로 일정 단축이나 실내 대안을 고려해 주세요.' : '등산은 가능해 보이지만 장시간 노출과 개인 컨디션을 함께 확인해 주세요.',
    bike: careful ? '자전거는 호흡량과 날씨 영향을 함께 받아 짧은 이동 위주로 조절하는 편이 좋습니다.' : '자전거 이동은 현재 기준으로 비교적 무난한 편입니다.',
    drive: careful ? '차량 이동 시 창문 개방과 장시간 외부 대기를 줄이고 강수·풍속을 함께 확인해 주세요.' : '차량 이동은 대기질보다 강수, 풍속, 시야 상황을 함께 확인해 주세요.'
  };
  return `${map[purpose] || map.walk}${weatherMessage}`.trim();
}

function purposeActions(purpose, tone) {
  const base = tone === 'good' || tone === 'normal'
    ? ['외출 전 최신 측정 시각 확인', '장시간 외출이면 중간에 대기질 재확인']
    : ['마스크 착용 여부 확인', '야외 체류 시간 줄이기', '실내 활동 대안 준비'];
  const extra = {
    child: ['아이 컨디션과 민감군 여부 확인'],
    exercise: ['고강도 운동은 짧게 조절'],
    hiking: ['장시간 노출과 고도 변화 고려'],
    bike: ['호흡량 증가를 고려해 속도 조절'],
    drive: ['창문 개방 줄이기']
  }[purpose] || [];
  return [...base, ...extra];
}

function metricReason(label) {
  if (/매우/.test(label)) return '야외활동 부담 큼';
  if (/나쁨/.test(label)) return '장시간 노출 주의';
  if (/보통/.test(label)) return '민감군은 확인';
  if (/좋음/.test(label)) return '부담 낮음';
  return '자료 확인 필요';
}

function skyLabel(sky, pty) {
  if (pty && pty > 0) return { 1: '비', 2: '비/눈', 3: '눈', 4: '소나기' }[pty] || '강수 가능';
  return { 1: '맑음', 3: '구름 많음', 4: '흐림' }[sky] || '하늘상태 확인';
}
function popLabel(pop, pty) { if (pty && pty > 0) return '강수 예보'; if (pop === null) return '정보 없음'; return pop >= 70 ? '우산 권장' : pop >= 40 ? '비 가능성 확인' : '비 가능성 낮음'; }
function tempLabel(tmp) { if (tmp === null) return '정보 없음'; return tmp >= 33 ? '더위 주의' : tmp >= 30 ? '더운 편' : tmp <= -10 ? '한파 주의' : tmp <= 0 ? '추운 편' : '보통'; }
function humidityLabel(reh) { if (reh === null) return '정보 없음'; return reh >= 85 ? '습도 높음' : reh <= 30 ? '건조한 편' : '보통'; }
function windLabel(wsd) { if (wsd === null) return '정보 없음'; return wsd >= 9 ? '강한 바람' : wsd >= 4 ? '바람 확인' : '약한 바람'; }


function getLivingIndexRequestTime(timeSlot, now) {
  const target = getTargetForecastDateTime(timeSlot, now);
  return `${target.date}${target.time.slice(0, 2)}`;
}

function formatLivingTimeLabel(value) {
  const text = String(value || '');
  if (text.length < 10) return '생활기상지수';
  return `${text.slice(4, 6)}/${text.slice(6, 8)} ${text.slice(8, 10)}시`;
}

function uvIndexLabel(number, fallbackText) {
  if (number === null) return fallbackText || '정보 없음';
  if (number >= 11) return '위험';
  if (number >= 8) return '매우 높음';
  if (number >= 6) return '높음';
  if (number >= 3) return '보통';
  return '낮음';
}

function airDiffusionLabel(valueText, number) {
  if (valueText && /낮|보통|높|나쁨|정체/.test(valueText)) return valueText;
  if (number === null) return valueText || '정보 없음';
  if (number <= 25) return '낮음';
  if (number < 75) return '보통';
  return '높음';
}

function timeLabel(value) { return { now: '지금', morning: '오전', afternoon: '오후', evening: '저녁', tomorrow: '내일' }[value] || '지금'; }

function purposeAdvice(purpose, tone, forecast) {
  const bad = tone === 'bad' || tone === 'warning';
  const weatherTail = forecast?.ok ? ` ${forecast.summary?.message || ''}` : '';
  const map = {
    commute: bad ? '출근·등교 전 마스크, 우산, 이동 동선, 실내 대기 시간을 함께 확인해 주세요.' : '출근·등교 목적이라면 일반적인 이동은 큰 부담이 적은 편으로 볼 수 있습니다.',
    child: bad ? '아이 외출은 체류 시간을 줄이고 실내 활동 대안을 함께 고려해 주세요.' : '아이 외출은 체류 시간과 장소를 함께 보며 무리 없는 범위에서 판단해 주세요.',
    exercise: bad ? '야외 고강도 운동은 줄이고 실내 운동 또는 짧은 산책으로 조절하는 것을 고려할 수 있습니다.' : '운동 목적이라면 시간대와 개인 컨디션을 함께 확인해 주세요.',
    walk: bad ? '산책은 시간을 짧게 잡고 대기질과 날씨가 나아지는 시간대를 다시 확인해 보세요.' : '산책 목적이라면 현재 기준으로 비교적 무난한 편입니다.',
    drive: bad ? '운전 시 창문 개방과 장시간 외부 대기를 줄이고 강수·풍속 상황을 함께 확인해 주세요.' : '운전 목적이라면 대기질보다 기상특보와 시야 상황을 함께 확인해 주세요.'
  };
  return `${map[purpose] || map.walk}${weatherTail}`.trim();
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
function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
