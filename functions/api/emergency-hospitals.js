import {
  buildApiFailure,
  buildApiSuccess,
  cleanText,
  createRequestId,
  fetchTextWithTimeout,
  getEnv,
  haversineDistanceM,
  jsonResponse,
  toNumber,
} from './_lib/check-core.js';

const SERVER_VERSION = 'v102-night-medical-kakao-manual-patch';
const NMC_SOURCE = 'NMC EMERGENCY MEDICAL DATA';
const NMC_HOSPITAL_SOURCE = 'NMC HOSPITAL CLINIC DATA';
const NMC_PHARMACY_SOURCE = 'NMC PHARMACY DATA';
const NMC_SERVICE_BASE_HTTPS = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService';
const NMC_SERVICE_BASE_HTTP = 'http://apis.data.go.kr/B552657/ErmctInfoInqireService';
const NMC_HOSPITAL_BASE_HTTPS = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService';
const NMC_HOSPITAL_BASE_HTTP = 'http://apis.data.go.kr/B552657/HsptlAsembySearchService';
const NMC_INSTT_BASE_HTTPS = 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService';
const NMC_INSTT_BASE_HTTP = 'http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService';

const REGION_ALIASES = {
  all: '', 전국: '',
  서울: '서울특별시', 서울특별시: '서울특별시',
  부산: '부산광역시', 부산광역시: '부산광역시',
  대구: '대구광역시', 대구광역시: '대구광역시',
  인천: '인천광역시', 인천광역시: '인천광역시',
  광주: '광주광역시', 광주광역시: '광주광역시',
  대전: '대전광역시', 대전광역시: '대전광역시',
  울산: '울산광역시', 울산광역시: '울산광역시',
  세종: '세종특별자치시', 세종특별자치시: '세종특별자치시',
  경기: '경기도', 경기도: '경기도',
  강원: '강원특별자치도', 강원도: '강원특별자치도', 강원특별자치도: '강원특별자치도',
  충북: '충청북도', 충청북도: '충청북도',
  충남: '충청남도', 충청남도: '충청남도',
  전북: '전북특별자치도', 전라북도: '전북특별자치도', 전북특별자치도: '전북특별자치도',
  전남: '전라남도', 전라남도: '전라남도',
  경북: '경상북도', 경상북도: '경상북도',
  경남: '경상남도', 경상남도: '경상남도',
  제주: '제주특별자치도', 제주도: '제주특별자치도', 제주특별자치도: '제주특별자치도',
};

const SHORT_REGION = Object.fromEntries(Object.entries(REGION_ALIASES).map(([short, full]) => [full, short]));

const SERIOUS_STATUS_FIELDS = [
  { label: '뇌출혈 수술', keys: ['MKioskTy1', 'mkioskTy1', 'mKioskTy1'] },
  { label: '뇌경색 재관류', keys: ['MKioskTy2', 'mkioskTy2', 'mKioskTy2'] },
  { label: '심근경색 재관류', keys: ['MKioskTy3', 'mkioskTy3', 'mKioskTy3'] },
  { label: '복부손상 수술', keys: ['MKioskTy4', 'mkioskTy4', 'mKioskTy4'] },
  { label: '사지접합 수술', keys: ['MKioskTy5', 'mkioskTy5', 'mKioskTy5'] },
  { label: '응급내시경', keys: ['MKioskTy6', 'mkioskTy6', 'mKioskTy6'] },
  { label: '응급투석', keys: ['MKioskTy7', 'mkioskTy7', 'mKioskTy7'] },
  { label: '조산산모', keys: ['MKioskTy8', 'mkioskTy8', 'mKioskTy8'] },
  { label: '정신질환', keys: ['MKioskTy9', 'mkioskTy9', 'mKioskTy9'] },
  { label: '신생아', keys: ['MKioskTy10', 'mkioskTy10', 'mKioskTy10'] },
  { label: '중증화상', keys: ['MKioskTy11', 'mkioskTy11', 'mKioskTy11'] },
];

const FACILITY_STATUS_FIELDS = [
  { label: 'CT', keys: ['hvctayn', 'HVCTAYN', 'ctAvailable'] },
  { label: 'MRI', keys: ['hvmriayn', 'HVMRIAYN', 'mriAvailable'] },
  { label: '조영촬영', keys: ['hvangioayn', 'HVANGIOAYN'] },
  { label: '인공호흡기', keys: ['hvventiayn', 'HVVENTIAYN'] },
  { label: '구급차', keys: ['hvamyn', 'HVAMYN'] },
  { label: '수술실', keys: ['hvoc', 'HVOC'] },
  { label: '일반중환자실', keys: ['hvicc', 'HVICC'] },
  { label: '흉부중환자실', keys: ['hvccc', 'HVCCC'] },
];

export async function onRequestGet({ request, env }) {
  const requestId = createRequestId('er');
  try {
    const url = new URL(request.url);
    const mode = cleanText(url.searchParams.get('mode') || 'emergency', 20);
    const modeConfig = getServiceModeConfig(mode);
    const key = getEnv(env, modeConfig.envKeys);
    if (!key) {
      return jsonResponse(buildApiFailure({
        code: 'api_key_missing',
        message: `${modeConfig.primaryEnv}가 설정되지 않았습니다. Cloudflare Pages Production 환경변수를 확인해 주세요.`,
        status: 200,
        source: modeConfig.source,
        requestId,
      }), { status: 200 });
    }

    const regionInput = cleanText(url.searchParams.get('region') || '서울', 30);
    const region = normalizeRegion(regionInput);
    const district = cleanText(url.searchParams.get('district') || '', 40);
    const sort = cleanText(url.searchParams.get('sort') || 'distance', 20);
    const lat = toNumber(url.searchParams.get('lat'), NaN);
    const lng = toNumber(url.searchParams.get('lng'), NaN);
    const useLocation = Number.isFinite(lat) && Number.isFinite(lng);
    const warnings = [];

    console.log('[NMC emergency request]', {
      requestId,
      version: SERVER_VERSION,
      mode,
      region,
      district,
      sort,
      hasCoordinates: useLocation,
    });

    if (modeConfig.kind === 'hospital' || modeConfig.kind === 'pharmacy') {
      return handleNightCareRequest({ url, key, modeConfig, region, district, sort, lat, lng, useLocation, requestId });
    }

    const listPromise = useLocation
      ? fetchNearbyEmergency({ key, lat, lng, requestId }).catch(async (error) => {
        warnings.push('현재 위치 기준 조회가 원활하지 않아 지역 기준 응급실 정보를 함께 확인합니다.');
        console.log('[NMC nearby fallback]', { requestId, message: error?.message || String(error) });
        return fetchRealtimeBeds({ key, region, district, requestId });
      })
      : fetchRealtimeBeds({ key, region, district, requestId });

    const locationPromise = fetchEmergencyLocationList({ key, region, district, requestId }).catch((error) => {
      console.log('[NMC emergency location merge unavailable]', { requestId, message: error?.message || String(error) });
      return { items: [], sourceMode: 'location_merge_unavailable' };
    });

    const statusPromise = fetchStatusEnhancements({ key, region, district, requestId }).catch((error) => {
      warnings.push('중증질환 수용가능정보와 응급실 메시지 일부를 불러오지 못했습니다. 병상·전화 정보 중심으로 확인해 주세요.');
      console.log('[NMC emergency status fallback]', { requestId, message: error?.message || String(error) });
      return { seriousItems: [], messages: [], warnings: ['status_unavailable'] };
    });

    const [listResult, locationResult, statusResult] = await Promise.all([listPromise, locationPromise, statusPromise]);
    const statusMaps = buildStatusMaps(statusResult);

    let items = mergeEmergencyLocationData(listResult.items, locationResult.items, useLocation ? { lat, lng } : null)
      .map((item) => enhanceEmergencyItem(item, statusMaps));

    if (sort === 'beds') {
      items = [...items].sort((a, b) => numberOrNeg(b.emergencyBeds) - numberOrNeg(a.emergencyBeds) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM));
    } else if (sort === 'phone') {
      items = [...items].sort((a, b) => Number(Boolean(b.emergencyTel)) - Number(Boolean(a.emergencyTel)) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM));
    } else if (sort === 'critical') {
      items = [...items].sort((a, b) => numberOrNeg(b.criticalAvailableCount) - numberOrNeg(a.criticalAvailableCount) || numberOrNeg(b.emergencyBeds) - numberOrNeg(a.emergencyBeds) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM));
    } else {
      items = [...items].sort((a, b) => numberOrMax(a.distanceM) - numberOrMax(b.distanceM));
    }

    if (statusResult.seriousItems?.length) {
      warnings.push('중증질환 수용가능정보는 공공데이터 제공 시점 기준입니다. 실제 수용 가능 여부는 병원 전화나 119 안내로 확인해야 합니다.');
    }
    const noCoordinateCount = items.filter((item) => !item.hasCoordinates).length;
    const coordinateCount = items.length - noCoordinateCount;
    if (coordinateCount && locationResult.items?.length) {
      warnings.push(`지도 좌표는 응급의료기관 위치정보를 병합해 표시했습니다. 실제 길찾기는 카카오맵에서 다시 확인해 주세요.`);
    }
    if (noCoordinateCount) {
      warnings.push(`지도 좌표가 제공되지 않은 ${noCoordinateCount.toLocaleString('ko-KR')}곳은 목록과 상세 정보에서 확인해 주세요.`);
    }

    if (!useLocation && sort === 'distance') {
      warnings.push('거리순 정렬은 현재 위치를 사용하면 더 정확합니다. 지역 기준 조회에서는 제공기관 좌표가 있는 항목만 참고 거리로 표시됩니다.');
    }
    if (!items.length) {
      warnings.push('조건에 맞는 응급의료기관 정보를 찾지 못했습니다. 지역을 바꾸거나 119 또는 응급의료포털을 확인해 주세요.');
    }

    const summary = buildSummary({ items, region, district, sort, useLocation, mode, listResult, statusResult });
    console.log('[NMC emergency result]', {
      requestId,
      version: SERVER_VERSION,
      count: items.length,
      sourceMode: listResult.sourceMode,
      firstItem: items[0] ? { id: items[0].id, name: items[0].name, emergencyBeds: items[0].emergencyBeds, emergencyTel: items[0].emergencyTel } : null,
    });

    return jsonResponse(buildApiSuccess({
      code: items.length ? 'emergency_rooms_found' : 'empty',
      source: NMC_SOURCE,
      requestId,
      summary,
      items: items.slice(0, 40),
      warnings,
      extra: {
        serverVersion: SERVER_VERSION,
        mode,
        checkedAt: new Date().toISOString(),
      },
    }));
  } catch (error) {
    console.log('[NMC emergency fatal]', { requestId, version: SERVER_VERSION, message: error?.message || String(error) });
    return jsonResponse(buildApiFailure({
      code: 'server_error',
      message: '응급실 정보를 불러오는 중 오류가 발생했습니다. 응급 상황이면 119에 먼저 연락해 주세요.',
      status: 200,
      source: NMC_SOURCE,
      requestId,
      detail: error?.message || String(error),
    }), { status: 200 });
  }
}


function getServiceModeConfig(mode) {
  const normalized = cleanText(mode || 'emergency', 20);
  if (normalized === 'hospital' || normalized === 'clinic' || normalized === 'night-hospital') {
    return {
      kind: 'hospital',
      label: '야간 병원',
      source: NMC_HOSPITAL_SOURCE,
      primaryEnv: 'NMC_HOSPITAL_API_KEY',
      envKeys: ['NMC_HOSPITAL_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'],
    };
  }
  if (normalized === 'pharmacy' || normalized === 'night-pharmacy') {
    return {
      kind: 'pharmacy',
      label: '야간 약국',
      source: NMC_PHARMACY_SOURCE,
      primaryEnv: 'NMC_PHARMACY_API_KEY',
      envKeys: ['NMC_PHARMACY_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'],
    };
  }
  return {
    kind: 'emergency',
    label: '응급실',
    source: NMC_SOURCE,
    primaryEnv: 'NMC_EMERGENCY_API_KEY',
    envKeys: ['NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'],
  };
}

async function handleNightCareRequest({ url, key, modeConfig, region, district, sort, lat, lng, useLocation, requestId }) {
  const qt = cleanText(url.searchParams.get('day') || getTodayQt(), 2);
  const keyword = cleanText(url.searchParams.get('keyword') || '', 80);
  const department = cleanText(url.searchParams.get('department') || '', 30);
  const warnings = [];
  const listResult = modeConfig.kind === 'pharmacy'
    ? await fetchNightPharmacies({ key, region, district, qt, keyword, requestId })
    : await fetchNightHospitals({ key, region, district, qt, keyword, department, requestId });

  let items = listResult.items.map((item) => ({
    ...item,
    distanceM: Number.isFinite(item.distanceM) ? item.distanceM : (useLocation ? haversineDistanceM({ lat, lng }, item) : item.distanceM),
  }));

  if (useLocation) {
    items = items.filter((item) => !Number.isFinite(item.distanceM) || item.distanceM <= 50000);
  }

  if (sort === 'phone') {
    items = [...items].sort((a, b) => Number(Boolean(b.mainTel)) - Number(Boolean(a.mainTel)) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM));
  } else if (sort === 'night') {
    items = [...items].sort((a, b) => Number(Boolean(b.isNightCandidate)) - Number(Boolean(a.isNightCandidate)) || numberOrMax(a.closeMinutes) - numberOrMax(b.closeMinutes) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM));
  } else {
    items = [...items].sort((a, b) => numberOrMax(a.distanceM) - numberOrMax(b.distanceM) || Number(Boolean(b.isNightCandidate)) - Number(Boolean(a.isNightCandidate)));
  }

  if (!items.length) {
    warnings.push(`${modeConfig.label} 정보를 찾지 못했습니다. 지역이나 시군구를 바꾸고, 긴급 상황이면 119 또는 병원·약국에 직접 확인해 주세요.`);
  }
  warnings.push(`${modeConfig.label} 운영시간은 공공데이터 기준 참고 정보입니다. 실제 야간 운영 여부와 접수 마감은 기관 사정에 따라 달라질 수 있으므로 방문 전 전화 확인이 필요합니다.`);
  if (useLocation) warnings.push('현재 위치 기준 거리는 직선거리 참고값입니다. 실제 이동시간은 지도 앱에서 다시 확인해 주세요.');

  const summary = buildNightSummary({ items, region, district, sort, qt, modeConfig, listResult, useLocation });
  console.log('[NMC night care result]', {
    requestId,
    version: SERVER_VERSION,
    mode: modeConfig.kind,
    count: items.length,
    sourceMode: listResult.sourceMode,
    firstItem: items[0] ? { id: items[0].id, name: items[0].name, time: items[0].operationTime } : null,
  });

  return jsonResponse(buildApiSuccess({
    code: items.length ? `${modeConfig.kind}_found` : 'empty',
    source: modeConfig.source,
    requestId,
    summary,
    items: items.slice(0, 40),
    warnings,
    extra: {
      serverVersion: SERVER_VERSION,
      mode: modeConfig.kind,
      checkedAt: new Date().toISOString(),
    },
  }));
}

async function fetchNightHospitals({ key, region, district, qt, keyword, department, requestId }) {
  const params = {
    ServiceKey: key,
    pageNo: '1',
    numOfRows: '60',
    Q0: region,
    Q1: district,
    QT: qt,
    QN: keyword,
    ORD: 'NAME',
  };
  if (department) params.QD = department;
  const result = await fetchNmcFrom('getHsptlMdcncListInfoInqire', params, requestId, [NMC_HOSPITAL_BASE_HTTPS, NMC_HOSPITAL_BASE_HTTP]);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'night_hospital',
    criteria: `${shortRegion(region) || region} ${district || ''} 야간 병원`,
    items: rows.map((row, index) => normalizeNightCareItem(row, index + 1, 'hospital', qt)).filter((item) => item.id || item.name),
  };
}

async function fetchNightPharmacies({ key, region, district, qt, keyword, requestId }) {
  const params = {
    ServiceKey: key,
    pageNo: '1',
    numOfRows: '60',
    Q0: region,
    Q1: district,
    QT: qt,
    QN: keyword,
    ORD: 'NAME',
  };
  const result = await fetchNmcFrom('getParmacyListInfoInqire', params, requestId, [NMC_INSTT_BASE_HTTPS, NMC_INSTT_BASE_HTTP]);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'night_pharmacy',
    criteria: `${shortRegion(region) || region} ${district || ''} 야간 약국`,
    items: rows.map((row, index) => normalizeNightCareItem(row, index + 1, 'pharmacy', qt)).filter((item) => item.id || item.name),
  };
}

async function fetchNmcFrom(endpoint, params, requestId, bases) {
  const errors = [];
  for (const base of bases) {
    const apiUrl = new URL(`${base}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') apiUrl.searchParams.set(key, value);
    });
    const safeUrl = apiUrl.toString().replace(/ServiceKey=[^&]+/i, 'ServiceKey=****');
    console.log('[NMC care fetch]', { requestId, version: SERVER_VERSION, endpoint, url: safeUrl });
    const result = await fetchTextWithTimeout(apiUrl.toString(), { timeoutMs: 9000 }).catch((error) => ({ ok: false, status: 0, text: '', error }));
    if (!result.ok || !result.text) {
      errors.push(`${endpoint} ${base} ${result.status || result.error?.message || 'fetch_error'}`);
      continue;
    }
    const data = parseNmcPayload(result.text);
    const condition = normalizeCondition(data);
    if (isAuthError(condition)) {
      throw new Error(`${endpoint} 인증키 오류: ${condition.message || condition.code}`);
    }
    if (condition.code && condition.code !== '00' && condition.code !== '0' && !/normal|success|정상/i.test(condition.message)) {
      errors.push(`${endpoint} result ${condition.code} ${condition.message}`);
      continue;
    }
    return { data, condition, endpoint, base };
  }
  throw new Error(errors.join(' | ') || `${endpoint} API 호출 실패`);
}

function normalizeNightCareItem(row, rank = 0, kind = 'hospital', qt = getTodayQt()) {
  const coords = sanitizeCoordinates(
    firstNumber(row, ['wgs84Lat', 'WGS84_LAT', 'lat', 'latitude', 'dutyLat', 'dutyMapLat', 'mapLat']),
    firstNumber(row, ['wgs84Lon', 'WGS84_LON', 'lon', 'lng', 'longitude', 'dutyLon', 'dutyMapLon', 'mapLon'])
  );
  const lat = coords.lat;
  const lng = coords.lng;
  const name = firstText(row, ['dutyName', 'DUTY_NAME', 'dutyNm', 'hospName', 'yadmNm']);
  const address = firstText(row, ['dutyAddr', 'DUTY_ADDR', 'addr', 'address']);
  const mainTel = normalizePhone(firstText(row, ['dutyTel1', 'DUTY_TEL1', 'telno', 'mainTel', 'tel1']));
  const department = firstText(row, ['dutyDivNam', 'DUTY_DIV_NAM', 'dutyDivName', 'department', 'clCdNm']);
  const hospitalType = firstText(row, ['dutyEmclsName', 'DUTY_EMCLS_NAME', 'dutyDivNam', 'clCdNm', 'kindName']);
  const [openTime, closeTime] = getOperationTimes(row, qt);
  const openMinutes = parseHHMM(openTime);
  const closeMinutes = parseHHMM(closeTime);
  const isNightCandidate = Number.isFinite(closeMinutes) && closeMinutes >= 18 * 60;
  const isAllNight = Number.isFinite(closeMinutes) && (closeMinutes >= 24 * 60 || closeTime === '2400' || closeTime === '0000');
  const timeLabel = formatOperationTime(openTime, closeTime);
  const statusLabel = isAllNight ? '심야 운영 참고' : isNightCandidate ? '야간 운영 참고' : timeLabel ? '운영시간 확인' : '전화 확인 필요';
  const statusTone = isNightCandidate || isAllNight ? 'good' : timeLabel ? 'neutral' : 'caution';
  return {
    id: firstText(row, ['hpid', 'HPID', 'id']) || `${kind}-${rank}`,
    rank,
    kind,
    name,
    address,
    region: inferRegion(address),
    lat,
    lng,
    hasCoordinates: Number.isFinite(lat) && Number.isFinite(lng),
    distanceM: null,
    emergencyBeds: null,
    totalBeds: null,
    emergencyTel: '',
    mainTel,
    hospitalType,
    department,
    operationTime: timeLabel,
    openTime,
    closeTime,
    openMinutes: Number.isFinite(openMinutes) ? openMinutes : null,
    closeMinutes: Number.isFinite(closeMinutes) ? closeMinutes : null,
    isNightCandidate,
    statusLabel,
    statusTone,
    facilityStatus: [],
    facilityAvailableCount: 0,
    criticalCare: [],
    criticalAvailableCount: 0,
    messages: [],
    sourceMode: kind === 'pharmacy' ? 'night_pharmacy' : 'night_hospital',
    source: kind === 'pharmacy' ? NMC_PHARMACY_SOURCE : NMC_HOSPITAL_SOURCE,
    updatedAt: firstText(row, ['dutyTime', 'updateDate', 'rltmUpdtDt']) || '',
    raw: {
      hpid: firstText(row, ['hpid', 'HPID', 'id']),
      dutyTime: timeLabel,
    },
  };
}

function buildNightSummary({ items, region, district, sort, qt, modeConfig, listResult, useLocation }) {
  const nightCount = items.filter((item) => item.isNightCandidate).length;
  const withPhone = items.filter((item) => item.mainTel || item.emergencyTel).length;
  const nearest = items.find((item) => Number.isFinite(item.distanceM));
  const late = [...items].filter((item) => Number.isFinite(item.closeMinutes)).sort((a, b) => numberOrNeg(b.closeMinutes) - numberOrNeg(a.closeMinutes))[0] || null;
  return {
    mode: modeConfig.kind,
    label: modeConfig.label,
    region: shortRegion(region) || region || '전국',
    district,
    sort,
    dayCode: qt,
    useLocation,
    sourceMode: listResult.sourceMode,
    criteria: listResult.criteria,
    count: items.length,
    nightCount,
    phoneCount: withPhone,
    nearestName: nearest?.name || '',
    nearestDistanceM: Number.isFinite(nearest?.distanceM) ? nearest.distanceM : null,
    bestBedName: late?.name || '',
    bestBedCount: null,
    bestCriticalName: '',
    bestCriticalCount: null,
    dataSource: modeConfig.source,
  };
}

function getTodayQt(date = new Date()) {
  const day = date.getDay();
  return String(day === 0 ? 7 : day);
}

function getOperationTimes(row, qt) {
  const code = String(qt || getTodayQt()).replace(/[^0-9]/g, '') || getTodayQt();
  const openKeys = [`dutyTime${code}s`, `DUTY_TIME${code}S`, `dutyTime${code}S`, `startTime${code}`];
  const closeKeys = [`dutyTime${code}c`, `DUTY_TIME${code}C`, `dutyTime${code}C`, `endTime${code}`];
  return [firstText(row, openKeys), firstText(row, closeKeys)];
}

function parseHHMM(value) {
  const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
  if (digits.length < 3) return NaN;
  const padded = digits.padStart(4, '0');
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  return hour * 60 + minute;
}

function formatOperationTime(openTime, closeTime) {
  const format = (value) => {
    const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
    if (!digits) return '';
    const padded = digits.padStart(4, '0');
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  };
  const open = format(openTime);
  const close = format(closeTime);
  if (open && close) return `${open} ~ ${close}`;
  if (open) return `${open} 시작`;
  if (close) return `${close} 종료`;
  return '';
}

async function fetchRealtimeBeds({ key, region, district, requestId }) {
  const params = {
    ServiceKey: key,
    pageNo: '1',
    numOfRows: '80',
    _type: 'json',
  };
  if (region) params.STAGE1 = region;
  if (district) params.STAGE2 = district;
  const result = await fetchNmc('getEmrrmRltmUsefulSckbdInfoInqire', params, requestId);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'realtime_beds',
    criteria: `${shortRegion(region) || '전국'}${district ? ` ${district}` : ''} 응급실 가용 병상`,
    items: rows.map((row, index) => normalizeEmergencyItem(row, index + 1, 'realtime_beds')).filter((item) => item.id || item.name),
  };
}

async function fetchNearbyEmergency({ key, lat, lng, requestId }) {
  const params = {
    ServiceKey: key,
    WGS84_LAT: String(lat),
    WGS84_LON: String(lng),
    pageNo: '1',
    numOfRows: '40',
    _type: 'json',
  };
  const result = await fetchNmc('getEgytLcinfoInqire', params, requestId);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'nearby_location',
    criteria: '현재 위치 기준 응급의료기관',
    items: rows.map((row, index) => normalizeEmergencyItem(row, index + 1, 'nearby_location', { lat, lng })).filter((item) => item.id || item.name),
  };
}


async function fetchEmergencyLocationList({ key, region, district, requestId }) {
  const params = {
    ServiceKey: key,
    pageNo: '1',
    numOfRows: '120',
    _type: 'json',
  };
  if (region) params.STAGE1 = region;
  if (district) params.STAGE2 = district;
  const result = await fetchNmc('getEgytListInfoInqire', params, requestId);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'emergency_location_list',
    criteria: `${shortRegion(region) || '전국'}${district ? ` ${district}` : ''} 응급의료기관 위치정보`,
    items: rows.map((row, index) => normalizeEmergencyLocationItem(row, index + 1)).filter((item) => item.id || item.name),
  };
}

function normalizeEmergencyLocationItem(row, rank = 0) {
  const coords = sanitizeCoordinates(
    firstNumber(row, ['wgs84Lat', 'WGS84_LAT', 'lat', 'latitude', 'dutyLat', 'dutyMapLat', 'mapLat']),
    firstNumber(row, ['wgs84Lon', 'WGS84_LON', 'lon', 'lng', 'longitude', 'dutyLon', 'dutyMapLon', 'mapLon'])
  );
  const name = firstText(row, ['dutyName', 'DUTY_NAME', 'dutyNm', 'hospName', 'yadmNm']);
  const address = firstText(row, ['dutyAddr', 'DUTY_ADDR', 'addr', 'address']);
  return {
    id: firstText(row, ['hpid', 'HPID', 'id']) || `nmc-location-${rank}`,
    rank,
    name,
    address,
    region: inferRegion(address),
    lat: coords.lat,
    lng: coords.lng,
    hasCoordinates: coords.hasCoordinates,
    emergencyTel: normalizePhone(firstText(row, ['dutyTel3', 'DUTY_TEL3', 'emergencyTel', 'tel3'])),
    mainTel: normalizePhone(firstText(row, ['dutyTel1', 'DUTY_TEL1', 'telno', 'mainTel', 'tel1'])),
    sourceMode: 'emergency_location_list',
  };
}

function mergeEmergencyLocationData(items = [], locationItems = [], origin = null) {
  const byId = new Map();
  const byName = new Map();
  for (const location of locationItems) {
    if (location.id) byId.set(location.id, location);
    if (location.name) byName.set(normalizeNameKey(location.name), location);
  }
  return items.map((item) => {
    const match = byId.get(item.id) || byName.get(normalizeNameKey(item.name)) || null;
    const mergedLat = item.hasCoordinates ? item.lat : match?.lat;
    const mergedLng = item.hasCoordinates ? item.lng : match?.lng;
    const coords = sanitizeCoordinates(mergedLat, mergedLng);
    const distanceM = Number.isFinite(Number(item.distanceM)) && Number(item.distanceM) > 0
      ? Number(item.distanceM)
      : (origin && coords.hasCoordinates ? haversineDistanceM(origin, { lat: coords.lat, lng: coords.lng }) : null);
    return {
      ...item,
      address: item.address || match?.address || '',
      emergencyTel: item.emergencyTel || match?.emergencyTel || '',
      mainTel: item.mainTel || match?.mainTel || '',
      lat: coords.lat,
      lng: coords.lng,
      hasCoordinates: coords.hasCoordinates,
      distanceM: Number.isFinite(distanceM) && distanceM > 0 ? Math.round(distanceM) : null,
      locationSourceMode: match?.sourceMode || item.locationSourceMode || '',
    };
  });
}

async function fetchStatusEnhancements({ key, region, district, requestId }) {
  const [seriousResult, messageResult] = await Promise.allSettled([
    fetchSeriousDiseaseStatus({ key, region, district, requestId }),
    fetchEmergencyMessages({ key, region, district, requestId }),
  ]);
  const warnings = [];
  if (seriousResult.status === 'rejected') {
    warnings.push('serious_status_unavailable');
    console.log('[NMC serious status unavailable]', { requestId, message: seriousResult.reason?.message || String(seriousResult.reason) });
  }
  if (messageResult.status === 'rejected') {
    warnings.push('message_status_unavailable');
    console.log('[NMC emergency message unavailable]', { requestId, message: messageResult.reason?.message || String(messageResult.reason) });
  }
  return {
    seriousItems: seriousResult.status === 'fulfilled' ? seriousResult.value.items : [],
    messages: messageResult.status === 'fulfilled' ? messageResult.value.items : [],
    warnings,
  };
}

async function fetchSeriousDiseaseStatus({ key, region, district, requestId }) {
  const params = {
    ServiceKey: key,
    pageNo: '1',
    numOfRows: '80',
    _type: 'json',
  };
  if (region) params.STAGE1 = region;
  if (district) params.STAGE2 = district;
  const result = await fetchNmc('getSrsillDissAceptncPosblInfoInqire', params, requestId);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'serious_disease_status',
    items: rows.map((row, index) => normalizeSeriousStatusItem(row, index + 1)).filter((item) => item.id || item.name),
  };
}

async function fetchEmergencyMessages({ key, region, district, requestId }) {
  const params = {
    ServiceKey: key,
    pageNo: '1',
    numOfRows: '80',
    _type: 'json',
  };
  if (region) params.STAGE1 = region;
  if (district) params.STAGE2 = district;
  const result = await fetchNmc('getEmrrmSrsillDissMsgInqire', params, requestId);
  const rows = extractItems(result.data);
  return {
    sourceMode: 'emergency_messages',
    items: rows.map((row, index) => normalizeMessageItem(row, index + 1)).filter((item) => item.id || item.name || item.message),
  };
}

async function fetchNmc(endpoint, params, requestId) {
  const errors = [];
  for (const base of [NMC_SERVICE_BASE_HTTPS, NMC_SERVICE_BASE_HTTP]) {
    const apiUrl = new URL(`${base}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') apiUrl.searchParams.set(key, String(value));
    });
    const safeUrl = apiUrl.toString().replace(/(ServiceKey=)[^&]+/i, '$1***');
    console.log('[NMC emergency fetch]', { requestId, version: SERVER_VERSION, endpoint, url: safeUrl });
    const result = await fetchTextWithTimeout(apiUrl.toString(), { timeoutMs: 9000 }).catch((error) => ({ ok: false, status: 0, text: '', error }));
    if (!result.ok) {
      errors.push(`${endpoint} ${base} ${result.status || result.error?.message || 'fetch_error'}`);
      continue;
    }
    const data = parseNmcPayload(result.text);
    const condition = normalizeCondition(data);
    if (condition.code && !['00', '0', 'NORMAL_CODE'].includes(condition.code)) {
      if (isAuthError(condition)) {
        throw new Error(`국립중앙의료원 API 인증 오류: ${condition.message || condition.code}`);
      }
      errors.push(`${endpoint} result ${condition.code} ${condition.message}`);
      continue;
    }
    return { data, rawText: result.text };
  }
  throw new Error(errors.join(' / ') || '국립중앙의료원 API 응답을 확인하지 못했습니다.');
}

function parseNmcPayload(text) {
  const body = String(text || '').trim();
  if (!body) return {};
  try { return JSON.parse(body); } catch (_) {}
  if (body.includes('<OpenAPI_ServiceResponse>')) {
    return {
      response: {
        header: {
          resultCode: getFirstTag(body, 'returnReasonCode') || getFirstTag(body, 'resultCode'),
          resultMsg: getFirstTag(body, 'returnAuthMsg') || getFirstTag(body, 'resultMsg') || getFirstTag(body, 'errMsg'),
        },
        body: { items: { item: [] } },
      },
    };
  }
  const itemBlocks = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return {
    response: {
      header: {
        resultCode: getFirstTag(body, 'resultCode') || getFirstTag(body, 'returnReasonCode'),
        resultMsg: getFirstTag(body, 'resultMsg') || getFirstTag(body, 'returnAuthMsg'),
      },
      body: {
        totalCount: getFirstTag(body, 'totalCount'),
        items: {
          item: itemBlocks.map((block) => xmlItemToObject(block)),
        },
      },
    },
  };
}

function xmlItemToObject(block) {
  const object = {};
  for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
    object[match[1]] = decodeXml(match[2]);
  }
  return object;
}

function getFirstTag(text, tag) {
  const match = String(text || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeCondition(data) {
  const header = data?.response?.header || data?.header || {};
  return {
    code: cleanText(header.resultCode || header.returnReasonCode || data?.resultCode || data?.RESULT_CODE || '', 80),
    message: cleanText(header.resultMsg || header.returnAuthMsg || data?.resultMsg || data?.RESULT_MSG || data?.message || '', 240),
  };
}

function isAuthError(condition) {
  return /SERVICE_KEY|AUTH|인증|KEY|INVALID/i.test(`${condition.code} ${condition.message}`);
}

function extractItems(data) {
  const body = data?.response?.body || data?.body || data;
  const items = body?.items?.item || body?.items || data?.items?.item || data?.items || [];
  if (Array.isArray(items)) return items;
  if (items && typeof items === 'object') return [items];
  return [];
}

function normalizeEmergencyItem(row, rank = 0, sourceMode = '', origin = null) {
  const coords = sanitizeCoordinates(
    firstNumber(row, ['wgs84Lat', 'WGS84_LAT', 'lat', 'latitude', 'dutyLat', 'dutyMapLat', 'mapLat']),
    firstNumber(row, ['wgs84Lon', 'WGS84_LON', 'lon', 'lng', 'longitude', 'dutyLon', 'dutyMapLon', 'mapLon'])
  );
  const lat = coords.lat;
  const lng = coords.lng;
  const emergencyBeds = firstNumber(row, ['hvec', 'HVEC', 'emergencyBeds']);
  const totalBeds = firstNumber(row, ['hvgc', 'HVGC', 'inpatientBeds']);
  const distanceRaw = firstNumber(row, ['distance', 'DISTANCE', 'rnumDistance']);
  const distanceM = normalizeDistance(distanceRaw, origin, { lat, lng });
  const name = firstText(row, ['dutyName', 'DUTY_NAME', 'dutyNm', 'hospName', 'yadmNm']);
  const address = firstText(row, ['dutyAddr', 'DUTY_ADDR', 'addr', 'address']);
  const emergencyTel = normalizePhone(firstText(row, ['dutyTel3', 'DUTY_TEL3', 'emergencyTel', 'tel3']));
  const mainTel = normalizePhone(firstText(row, ['dutyTel1', 'DUTY_TEL1', 'telno', 'mainTel', 'tel1']));
  const facilityStatus = buildFacilityStatus(row);
  const facilityAvailableCount = facilityStatus.filter((item) => item.tone === 'good').length;
  const statusTone = emergencyBeds > 0 ? 'good' : emergencyBeds === 0 ? 'caution' : 'neutral';
  return {
    id: firstText(row, ['hpid', 'HPID', 'id']) || `nmc-${rank}`,
    rank,
    name,
    address,
    region: inferRegion(address),
    lat,
    lng,
    hasCoordinates: Number.isFinite(lat) && Number.isFinite(lng),
    distanceM: Number.isFinite(distanceM) ? distanceM : null,
    emergencyBeds: Number.isFinite(emergencyBeds) ? emergencyBeds : null,
    totalBeds: Number.isFinite(totalBeds) ? totalBeds : null,
    emergencyTel,
    mainTel,
    statusLabel: emergencyBeds > 0 ? '가용 병상 있음' : emergencyBeds === 0 ? '전화 확인 필요' : '병상 정보 확인 필요',
    statusTone,
    facilityStatus,
    facilityAvailableCount,
    criticalCare: [],
    criticalAvailableCount: 0,
    messages: [],
    sourceMode,
    source: NMC_SOURCE,
    updatedAt: firstText(row, ['hvidate', 'HVIDATE', 'dutyTime', 'updateDate', 'rltmUpdtDt']),
    raw: summarizeRaw(row),
  };
}

function buildSummary({ items, region, district, sort, useLocation, mode, listResult, statusResult = {} }) {
  const withBeds = items.filter((item) => Number.isFinite(item.emergencyBeds) && item.emergencyBeds > 0).length;
  const withPhone = items.filter((item) => item.emergencyTel || item.mainTel).length;
  const withCritical = items.filter((item) => Number(item.criticalAvailableCount) > 0).length;
  const withMessages = items.filter((item) => Array.isArray(item.messages) && item.messages.length).length;
  const withFacility = items.filter((item) => Number(item.facilityAvailableCount) > 0).length;
  const nearest = items.find((item) => Number.isFinite(item.distanceM));
  const bestBeds = [...items].sort((a, b) => numberOrNeg(b.emergencyBeds) - numberOrNeg(a.emergencyBeds))[0] || null;
  const bestCritical = [...items].sort((a, b) => numberOrNeg(b.criticalAvailableCount) - numberOrNeg(a.criticalAvailableCount))[0] || null;
  return {
    mode,
    region: shortRegion(region) || region || '전국',
    district,
    sort,
    useLocation,
    sourceMode: listResult.sourceMode,
    criteria: listResult.criteria,
    count: items.length,
    availableBedCount: withBeds,
    phoneCount: withPhone,
    criticalInfoCount: withCritical,
    facilityInfoCount: withFacility,
    messageCount: withMessages,
    seriousSourceCount: Array.isArray(statusResult.seriousItems) ? statusResult.seriousItems.length : 0,
    messageSourceCount: Array.isArray(statusResult.messages) ? statusResult.messages.length : 0,
    nearestName: nearest?.name || '',
    nearestDistanceM: Number.isFinite(nearest?.distanceM) ? nearest.distanceM : null,
    bestBedName: bestBeds?.name || '',
    bestBedCount: Number.isFinite(bestBeds?.emergencyBeds) ? bestBeds.emergencyBeds : null,
    bestCriticalName: bestCritical?.name || '',
    bestCriticalCount: Number.isFinite(bestCritical?.criticalAvailableCount) ? bestCritical.criticalAvailableCount : null,
    dataSource: NMC_SOURCE,
  };
}



function buildStatusMaps(statusResult = {}) {
  const seriousById = new Map();
  const seriousByName = new Map();
  const messagesById = new Map();
  const messagesByName = new Map();
  for (const item of statusResult.seriousItems || []) {
    if (item.id) seriousById.set(item.id, item);
    if (item.name) seriousByName.set(normalizeNameKey(item.name), item);
  }
  for (const message of statusResult.messages || []) {
    const targetMaps = [];
    if (message.id) targetMaps.push([messagesById, message.id]);
    if (message.name) targetMaps.push([messagesByName, normalizeNameKey(message.name)]);
    for (const [map, key] of targetMaps) {
      const list = map.get(key) || [];
      list.push(message);
      map.set(key, list);
    }
  }
  return { seriousById, seriousByName, messagesById, messagesByName };
}

function enhanceEmergencyItem(item, maps) {
  const serious = maps.seriousById.get(item.id) || maps.seriousByName.get(normalizeNameKey(item.name)) || null;
  const messages = [
    ...(maps.messagesById.get(item.id) || []),
    ...(maps.messagesByName.get(normalizeNameKey(item.name)) || []),
  ].filter((message, index, array) => array.findIndex((other) => `${other.type}:${other.message}` === `${message.type}:${message.message}`) === index).slice(0, 3);
  const criticalCare = serious?.criticalCare || [];
  const criticalAvailableCount = Number(serious?.availableCount || 0);
  const facilityAvailableCount = Number(item.facilityAvailableCount || 0);
  const hasBeds = Number(item.emergencyBeds) > 0;
  const hasCritical = criticalAvailableCount > 0;
  const hasMessage = messages.length > 0;
  let statusLabel = item.statusLabel || '전화 확인 필요';
  let statusTone = item.statusTone || 'neutral';
  if (hasBeds && hasCritical) {
    statusLabel = '병상·중증 정보 있음';
    statusTone = 'good';
  } else if (hasBeds) {
    statusLabel = '가용 병상 있음';
    statusTone = 'good';
  } else if (hasCritical) {
    statusLabel = '중증 정보 확인';
    statusTone = 'caution';
  } else if (hasMessage) {
    statusLabel = '상태 메시지 확인';
    statusTone = 'warning';
  }
  return {
    ...item,
    criticalCare,
    criticalAvailableCount,
    facilityStatus: item.facilityStatus || [],
    facilityAvailableCount,
    messages,
    statusLabel,
    statusTone,
    statusUpdatedAt: serious?.updatedAt || item.updatedAt || '',
  };
}

function normalizeSeriousStatusItem(row, rank = 0) {
  const name = firstText(row, ['dutyName', 'dutyname', 'DUTY_NAME', 'hospName', 'yadmNm']);
  const criticalCare = SERIOUS_STATUS_FIELDS.map((field) => {
    const raw = firstText(row, field.keys);
    const normalized = normalizeAvailability(raw);
    if (!normalized) return null;
    return { label: field.label, value: raw, statusLabel: normalized.label, tone: normalized.tone };
  }).filter(Boolean);
  return {
    id: firstText(row, ['hpid', 'HPID', 'id']) || `serious-${rank}`,
    name,
    address: firstText(row, ['dutyAddr', 'DUTY_ADDR', 'addr', 'address']),
    updatedAt: firstText(row, ['hvidate', 'HVIDATE', 'dutyTime', 'updateDate', 'rltmUpdtDt']),
    criticalCare,
    availableCount: criticalCare.filter((item) => item.tone === 'good').length,
  };
}

function normalizeMessageItem(row, rank = 0) {
  const message = firstText(row, ['symBlkMsg', 'SYM_BLK_MSG', 'emrrmMsg', 'EMRRM_MSG', 'srsillDissMsg', 'SRSILL_DISS_MSG', 'msg', 'message', 'MESSAGE', 'dutyMsg']);
  const type = firstText(row, ['msgTyp', 'MSG_TYP', 'msgType', 'type']) || '상태 메시지';
  return {
    id: firstText(row, ['hpid', 'HPID', 'id']) || '',
    name: firstText(row, ['dutyName', 'dutyname', 'DUTY_NAME', 'hospName', 'yadmNm']),
    type: cleanText(type, 40),
    message: cleanText(message, 240),
    updatedAt: firstText(row, ['hvidate', 'HVIDATE', 'updateDate', 'rltmUpdtDt']) || '',
    rank,
  };
}

function buildFacilityStatus(row) {
  return FACILITY_STATUS_FIELDS.map((field) => {
    const raw = firstText(row, field.keys);
    const normalized = normalizeAvailability(raw);
    if (!normalized) return null;
    return { label: field.label, value: raw, statusLabel: normalized.label, tone: normalized.tone };
  }).filter(Boolean);
}

function normalizeAvailability(raw) {
  const text = cleanText(raw, 60);
  if (!text || text === '-' || /정보없음|미상|unknown/i.test(text)) return null;
  if (/^(Y|YES|O|가능|가|정상|TRUE)$/i.test(text)) return { label: '가능', tone: 'good' };
  if (/^(N|NO|X|불가|부|FALSE)$/i.test(text)) return { label: '전화 확인', tone: 'caution' };
  const numeric = toNumber(text, NaN);
  if (Number.isFinite(numeric)) {
    if (numeric > 0) return { label: `${numeric.toLocaleString('ko-KR')}개`, tone: 'good' };
    if (numeric === 0) return { label: '전화 확인', tone: 'caution' };
  }
  if (/가능|운영|가용|있음/i.test(text)) return { label: text, tone: 'good' };
  if (/불가|마감|중지|없음|폐쇄/i.test(text)) return { label: '전화 확인', tone: 'caution' };
  return { label: text, tone: 'neutral' };
}

function normalizeNameKey(value) {
  return cleanText(value, 120).replace(/\s+/g, '').toLowerCase();
}

function getCaseValue(row, key) {
  if (!row || typeof row !== 'object') return undefined;
  if (row[key] !== undefined) return row[key];
  const wanted = String(key).toLowerCase();
  const actual = Object.keys(row).find((candidate) => candidate.toLowerCase() === wanted);
  return actual ? row[actual] : undefined;
}


function sanitizeCoordinates(lat, lng) {
  let safeLat = Number(lat);
  let safeLng = Number(lng);
  // Some providers or sample rows can arrive swapped. Accept only plausible Korea WGS84 coordinates.
  if (isKoreaLatLng(safeLat, safeLng)) return { lat: safeLat, lng: safeLng, hasCoordinates: true };
  if (isKoreaLatLng(safeLng, safeLat)) return { lat: safeLng, lng: safeLat, hasCoordinates: true };
  return { lat: NaN, lng: NaN, hasCoordinates: false };
}

function isKoreaLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.8 && lng >= 123 && lng <= 132.5;
}

function firstText(row, keys) {
  for (const key of keys) {
    const value = getCaseValue(row, key);
    if (value !== undefined && value !== null && String(value).trim() !== '') return cleanText(value, 200);
  }
  return '';
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = toNumber(getCaseValue(row, key), NaN);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function normalizeDistance(distance, origin, point) {
  if (Number.isFinite(distance)) {
    if (distance > 0 && distance < 200) return Math.round(distance * 1000);
    if (distance >= 200) return Math.round(distance);
  }
  if (origin && Number.isFinite(point.lat) && Number.isFinite(point.lng)) return haversineDistanceM(origin, point);
  return NaN;
}

function normalizePhone(value) {
  const text = cleanText(value, 40);
  return text.replace(/[^0-9+\-]/g, '');
}

function inferRegion(address) {
  const text = String(address || '');
  for (const [short, full] of Object.entries(REGION_ALIASES)) {
    if (!full || short === 'all') continue;
    if (text.includes(full) || text.includes(short)) return short;
  }
  return '';
}

function normalizeRegion(value) {
  const key = cleanText(value || '서울', 30);
  return REGION_ALIASES[key] ?? key;
}

function shortRegion(full) {
  if (!full) return '';
  return SHORT_REGION[full] || full.replace(/특별시|광역시|특별자치시|특별자치도|도/g, '');
}

function numberOrMax(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 999999999;
}

function numberOrNeg(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : -1;
}

function summarizeRaw(row) {
  return {
    hpid: getCaseValue(row, 'hpid') || getCaseValue(row, 'HPID') || '',
    hvec: getCaseValue(row, 'hvec') || getCaseValue(row, 'HVEC') || '',
    hvgc: getCaseValue(row, 'hvgc') || getCaseValue(row, 'HVGC') || '',
    hvidate: getCaseValue(row, 'hvidate') || getCaseValue(row, 'HVIDATE') || '',
  };
}
