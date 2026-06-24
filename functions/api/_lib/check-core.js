const DEFAULT_JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      ...DEFAULT_JSON_HEADERS,
      ...(init.cacheControl ? { 'cache-control': init.cacheControl } : null),
      ...(init.headers || {}),
    },
  });
}

export function optionsResponse(headers = {}) {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      ...headers,
    },
  });
}

export function getEnv(env, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function hasEnv(env, keys) {
  return Boolean(getEnv(env, keys));
}

export function createRequestId(prefix = '') {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${random}` : random;
}

export function cleanText(value, maxLength = 120) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function compactText(value, maxLength = 120) {
  return cleanText(value, maxLength).replace(/[\s\-_/.,()\[\]{}·:;|]+/g, '');
}

export function onlyDigits(value, maxLength = 20) {
  return String(value ?? '').replace(/\D+/g, '').slice(0, maxLength);
}

export function toNumber(value, fallback = NaN) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).replace(/,/g, '').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(number, min, max) {
  const value = Number(number);
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function maskSecret(value, visibleStart = 4, visibleEnd = 4) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= visibleStart + visibleEnd) return '****';
  return `${text.slice(0, visibleStart)}…${text.slice(-visibleEnd)}`;
}

export function safeJsonParse(text, fallback = null) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch (_) {
    return fallback;
  }
}

export async function readJsonRequest(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

export function haversineDistanceM(a, b) {
  const lat1 = toNumber(a?.lat, NaN);
  const lng1 = toNumber(a?.lng, NaN);
  const lat2 = toNumber(b?.lat, NaN);
  const lng2 = toNumber(b?.lng, NaN);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function normalizePublicApiCondition(data) {
  const response = data?.response || data;
  const header = response?.header || response?.cmmMsgHeader || data?.header || {};
  const body = response?.body || data?.body || {};
  const code = cleanText(header.resultCode || header.returnReasonCode || data?.resultCode || data?.RESULT_CODE || '', 80);
  const message = cleanText(header.resultMsg || header.returnAuthMsg || data?.resultMsg || data?.RESULT_MSG || data?.message || '', 240);
  return { code, message, body };
}

export function buildApiFailure({ code = 'api_error', message = '정보를 불러오지 못했습니다.', status = 500, detail = null, source = '', requestId = '' } = {}) {
  return {
    ok: false,
    code,
    message,
    status,
    source,
    requestId,
    detail,
    checkedAt: new Date().toISOString(),
  };
}

export function buildApiSuccess({ code = 'success', source = '', summary = {}, items = [], warnings = [], requestId = '', extra = {} } = {}) {
  return {
    ok: true,
    code,
    source,
    requestId,
    checkedAt: new Date().toISOString(),
    summary,
    count: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : [],
    warnings: Array.isArray(warnings) ? warnings : [],
    ...extra,
  };
}

export async function fetchTextWithTimeout(url, options = {}) {
  const timeoutMs = clamp(options.timeoutMs || 8000, 1000, 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text,
      contentType: response.headers.get('content-type') || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function featureEnvStatus(env) {
  return {
    outdoorRisk: {
      label: '외출 위험 종합 체크',
      ready: hasEnv(env, ['AIRKOREA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'])
        && hasEnv(env, ['KMA_FORECAST_API_KEY', 'KMA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'])
        && hasEnv(env, ['KMA_LIVING_INDEX_API_KEY', 'KMA_LIVING_API_KEY', 'KMA_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']),
      requiredEnv: ['AIRKOREA_API_KEY', 'KMA_FORECAST_API_KEY', 'KMA_LIVING_INDEX_API_KEY'],
    },
    emergencyHospital: {
      label: '응급실·야간 병원·약국 확인',
      ready: hasEnv(env, ['NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'])
        && hasEnv(env, ['NMC_HOSPITAL_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY'])
        && hasEnv(env, ['NMC_PHARMACY_API_KEY', 'NMC_EMERGENCY_API_KEY', 'DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']),
      requiredEnv: ['NMC_EMERGENCY_API_KEY', 'NMC_HOSPITAL_API_KEY', 'NMC_PHARMACY_API_KEY'],
    },
  };
}
