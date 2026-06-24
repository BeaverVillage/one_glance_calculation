const NTS_STATUS_ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const NTS_VALIDATE_ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';
const FTC_DETAIL_ENDPOINT = 'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3';

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...init.headers
  }
});

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestPost({ request, env }) {
  try {
    const input = await safeJson(request);
    const businessNumber = onlyDigits(input.businessNumber);
    const storeName = cleanText(input.storeName, 80);
    const representativeName = cleanText(input.representativeName, 40);
    const startDate = onlyDigits(input.startDate).slice(0, 8);
    const permitNumber = cleanText(input.permitNumber, 60);
    const storeUrl = cleanText(input.storeUrl, 180);
    const mode = normalizeMode(input.mode);

    if (!/^\d{10}$/.test(businessNumber)) {
      return json({ message: '사업자등록번호는 숫자 10자리로 입력해야 합니다.' }, { status: 400 });
    }

    const dataKey = getEnv(env, ['DATA_GO_KR_SERVICE_KEY', 'PUBLIC_DATA_SERVICE_KEY']);
    const ntsKey = getEnv(env, ['NTS_SERVICE_KEY', 'NTS_API_KEY']) || dataKey;
    const ftcKey = getEnv(env, ['FTC_SERVICE_KEY', 'FTC_API_KEY']) || dataKey;

    const wantsStatus = ['status', 'validate', 'compare', 'checklist', 'full'].includes(mode);
    const wantsValidate = ['validate', 'compare', 'full'].includes(mode) && startDate && representativeName;
    const wantsFtc = ['mail-order', 'compare', 'checklist', 'full'].includes(mode);

    const [statusResult, validateResult, ftcResult] = await Promise.all([
      wantsStatus
        ? (ntsKey ? fetchNtsStatus(ntsKey, businessNumber) : missingApi('국세청 API 키가 설정되지 않았습니다.'))
        : { skipped: true, summary: '이번 기능에서는 사업자등록 상태조회를 생략했습니다.' },
      wantsValidate
        ? (ntsKey ? fetchNtsValidate(ntsKey, { businessNumber, startDate, representativeName, storeName }) : missingApi('국세청 API 키가 설정되지 않았습니다.'))
        : { checked: false, summary: '대표자명과 개업일자를 입력하는 기능에서 진위확인을 시도합니다.' },
      wantsFtc
        ? (ftcKey ? fetchFtcDetail(ftcKey, { businessNumber, permitNumber }) : missingApi('공정위 API 키가 설정되지 않았습니다.'))
        : { skipped: true, summary: '이번 기능에서는 통신판매업 조회를 생략했습니다.' }
    ]);

    const normalizedStatus = normalizeNtsStatus(statusResult, businessNumber);
    const normalizedValidate = normalizeNtsValidate(validateResult);
    const normalizedMailOrder = normalizeFtc(ftcResult);
    const official = normalizedMailOrder.item || {};

    const comparisons = buildComparisons({
      input: { storeName, representativeName, storeUrl, permitNumber },
      official
    });

    const messages = [];
    if (normalizedStatus.rawError) messages.push(normalizedStatus.rawError);
    else messages.push('조회가 완료되었습니다. 이 결과는 공식 등록정보 확인용이며, 사기 여부나 거래 안전성을 판정하지 않습니다.');
    if (normalizedMailOrder.error) messages.push(normalizedMailOrder.error);

    return json({
      ok: true,
      mode,
      checkedAt: new Date().toISOString(),
      businessNumberMasked: maskBusinessNumber(businessNumber),
      businessStatus: normalizedStatus,
      businessValidate: normalizedValidate,
      mailOrder: normalizedMailOrder,
      comparisons,
      checklist: buildChecklist(normalizedStatus, normalizedMailOrder, comparisons),
      messages
    });
  } catch (error) {
    return json({
      message: error?.message || '조회 중 오류가 발생했습니다.',
      detail: 'Cloudflare 환경변수와 공공데이터포털 활용신청 상태를 확인해 주세요.'
    }, { status: 500 });
  }
}

function normalizeMode(value) {
  const mode = String(value || 'full').trim();
  const allowed = ['status', 'validate', 'mail-order', 'compare', 'checklist', 'full'];
  return allowed.includes(mode) ? mode : 'full';
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('요청 형식이 올바르지 않습니다.');
  }
}

function getEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanText(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function withServiceKey(endpoint, key, params = {}) {
  const query = new URLSearchParams(params);
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}serviceKey=${key}&${query.toString()}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...options.headers
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(`공식 API 응답 오류가 발생했습니다. (${response.status})`);
  }
  return data;
}

function missingApi(message) {
  return { apiMissing: true, message };
}

async function fetchNtsStatus(key, businessNumber) {
  return fetchJson(withServiceKey(NTS_STATUS_ENDPOINT, key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ b_no: [businessNumber] })
  });
}

async function fetchNtsValidate(key, { businessNumber, startDate, representativeName, storeName }) {
  return fetchJson(withServiceKey(NTS_VALIDATE_ENDPOINT, key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businesses: [{
        b_no: businessNumber,
        start_dt: startDate,
        p_nm: representativeName,
        p_nm2: '',
        b_nm: storeName || '',
        corp_no: '',
        b_sector: '',
        b_type: ''
      }]
    })
  });
}

async function fetchFtcDetail(key, { businessNumber, permitNumber }) {
  const params = {
    pageNo: '1',
    numOfRows: '10',
    resultType: 'json',
    brno: businessNumber
  };
  if (permitNumber) params.prmmiMnno = permitNumber;
  return fetchJson(withServiceKey(FTC_DETAIL_ENDPOINT, key, params));
}

function normalizeNtsStatus(result, businessNumber) {
  if (result?.skipped) {
    return { tone: 'neutral', label: '생략', summary: result.summary || '사업자등록 상태조회를 생략했습니다.' };
  }
  if (result?.apiMissing) {
    return {
      tone: 'warning',
      label: '설정 필요',
      summary: result.message,
      rawError: result.message
    };
  }

  const item = Array.isArray(result?.data) ? result.data[0] : null;
  if (!item) {
    return {
      tone: 'warning',
      label: '정보 없음',
      summary: '사업자등록 상태조회 결과가 없습니다.',
      raw: result
    };
  }

  const state = item.b_stt || item.b_stt_nm || '상태 정보 없음';
  const taxType = item.tax_type || '과세유형 정보 없음';
  const closedDate = formatDate(item.end_dt);
  const tone = /계속/.test(state) ? 'success' : (/폐업|휴업/.test(state) ? 'warning' : 'neutral');

  return {
    tone,
    label: state,
    summary: `${maskBusinessNumber(item.b_no || businessNumber)} · ${state} · ${taxType}${closedDate ? ` · 폐업일 ${closedDate}` : ''}`,
    businessNumber: maskBusinessNumber(item.b_no || businessNumber),
    state,
    stateCode: item.b_stt_cd || '',
    taxType,
    taxTypeCode: item.tax_type_cd || '',
    closedDate,
    raw: item
  };
}

function normalizeNtsValidate(result) {
  if (result?.apiMissing) {
    return { checked: false, valid: false, summary: result.message };
  }
  if (!result || result.checked === false) return result || { checked: false };
  const item = Array.isArray(result?.data) ? result.data[0] : null;
  if (!item) return { checked: false, summary: '진위확인 결과가 없습니다.' };
  const valid = item.valid === '01' || item.valid_msg === '확인되었습니다.' || item.valid === true;
  return {
    checked: true,
    valid,
    summary: item.valid_msg || (valid ? '입력한 사업자 정보가 국세청 정보와 일치합니다.' : '입력한 사업자 정보와 국세청 정보의 일치 여부를 확인해 주세요.'),
    raw: item
  };
}

function normalizeFtc(result) {
  if (result?.skipped) {
    return { found: false, count: 0, summary: result.summary || '통신판매업 조회를 생략했습니다.' };
  }
  if (result?.apiMissing) {
    return {
      found: false,
      count: 0,
      summary: result.message,
      error: result.message
    };
  }

  const items = extractItems(result);
  const item = items[0] || null;
  const count = Number(getDeep(result, ['response', 'body', 'totalCount']) || items.length || 0);
  const resultCode = getDeep(result, ['response', 'header', 'resultCode']);
  const resultMsg = getDeep(result, ['response', 'header', 'resultMsg']);

  if (!item) {
    return {
      found: false,
      count,
      summary: resultMsg && resultCode && resultCode !== '00'
        ? `통신판매업 API 응답: ${resultMsg}`
        : '통신판매업 등록상세 정보가 확인되지 않았습니다.',
      raw: result
    };
  }

  const businessName = firstValue(item, ['bzmnNm', 'bplcNm', 'entrpsNm', 'cmpnyNm', 'crnoNm', '상호', '법인명', 'companyName']);
  const permitNumber = firstValue(item, ['prmmiMnno', 'prmmiNo', 'mllBsnsRegno', '통신판매번호', '신고번호']);
  const status = firstValue(item, ['opertnSttusCdNm', 'bizSttusNm', 'operSttusNm', '업소상태', '영업상태명']);
  const reportDate = formatDate(firstValue(item, ['dclrDate', 'reportDate', '신고일자']));
  const representative = firstValue(item, ['rprsntvNm', 'reprsntvNm', '대표자명', 'representativeName']);
  const address = firstValue(item, ['bplcAddr', 'rnBplcAddr', '사업장소재지', '사업장소재지도로명', 'address']);
  const domain = firstValue(item, ['intnetDomn', 'internetDomain', '인터넷도메인', 'domain']);

  return {
    found: true,
    count,
    summary: `${businessName || '상호 정보 없음'}${permitNumber ? ` · ${permitNumber}` : ''}${status ? ` · ${status}` : ''}`,
    item: {
      businessName,
      permitNumber,
      status,
      reportDate,
      representative,
      address,
      domain,
      raw: item
    }
  };
}

function extractItems(result) {
  const candidates = [
    getDeep(result, ['response', 'body', 'items', 'item']),
    getDeep(result, ['response', 'body', 'items']),
    getDeep(result, ['items', 'item']),
    getDeep(result, ['items']),
    result?.item
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(Boolean);
    if (candidate && typeof candidate === 'object') return [candidate];
  }
  return [];
}

function getDeep(obj, path) {
  return path.reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : undefined, obj);
}

function firstValue(obj, keys) {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') return String(obj[key]).trim();
  }
  const normalized = Object.entries(obj).find(([key, value]) => {
    const lower = key.toLowerCase();
    return keys.some((candidate) => lower.includes(String(candidate).toLowerCase())) && value;
  });
  return normalized ? String(normalized[1]).trim() : '';
}

function buildComparisons({ input, official }) {
  const rows = [];
  if (input.storeName) rows.push(compareText('상호명', input.storeName, official.businessName));
  if (input.representativeName) rows.push(compareText('대표자명', input.representativeName, official.representative));
  if (input.permitNumber) rows.push(compareText('통신판매업 신고번호', input.permitNumber, official.permitNumber));
  if (input.storeUrl) rows.push(compareDomain('쇼핑몰 도메인', input.storeUrl, official.domain));
  return rows;
}

function compareText(label, input, official) {
  if (!official) return { label, input, official: '', status: '공식 정보 없음', tone: 'neutral' };
  const a = normalizeKorean(input);
  const b = normalizeKorean(official);
  if (a === b || a.includes(b) || b.includes(a)) return { label, input, official, status: '일치 또는 포함', tone: 'success' };
  return { label, input, official, status: '확인 필요', tone: 'warning' };
}

function compareDomain(label, inputUrl, officialDomain) {
  const inputDomain = normalizeDomain(inputUrl);
  const official = normalizeDomain(officialDomain);
  if (!official) return { label, input: inputDomain || inputUrl, official: '', status: '공식 정보 없음', tone: 'neutral' };
  if (inputDomain && (inputDomain === official || inputDomain.endsWith(`.${official}`) || official.endsWith(`.${inputDomain}`))) {
    return { label, input: inputDomain, official, status: '일치 또는 포함', tone: 'success' };
  }
  return { label, input: inputDomain || inputUrl, official, status: '확인 필요', tone: 'warning' };
}

function buildChecklist(status, mailOrder, comparisons) {
  const list = [
    '사이트 하단의 사업자번호, 상호명, 대표자명, 주소를 조회 결과와 비교하세요.',
    '결제 전 환불정책, 배송정책, 고객센터 연락 가능 여부를 함께 확인하세요.',
    '등록정보가 정상이어도 거래 안전을 보장하지 않는다는 점을 기억하세요.'
  ];
  if (status.state && /폐업|휴업/.test(status.state)) list.unshift('사업자등록 상태가 휴업 또는 폐업으로 보이면 거래 전 추가 확인이 필요합니다.');
  if (!mailOrder.found) list.unshift('통신판매업 정보가 확인되지 않으면 쇼핑몰 하단 신고번호와 공정위 공개 정보를 직접 추가 확인하세요.');
  if (comparisons.some((item) => item.tone === 'warning')) list.unshift('입력한 쇼핑몰 정보와 공식 등록정보가 다른 항목은 거래 전 반드시 확인하세요.');
  return list;
}

function normalizeKorean(value) {
  return String(value || '').toLowerCase().replace(/[\s\-_.()㈜주식회사]/g, '');
}

function normalizeDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function maskBusinessNumber(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 10) return value || '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-*****`;
}

function formatDate(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 8) return value || '';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
