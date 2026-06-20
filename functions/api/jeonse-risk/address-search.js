const KAKAO_ADDRESS_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/address.json';
const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const KAKAO_REGION_ENDPOINT = 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json';
const REQUEST_TIMEOUT_MS = 4500;
const MAX_QUERY_LENGTH = 80;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'no-store'
    }
  });
}

function error(message, status = 400, code = 'BAD_REQUEST', detail = {}) {
  return json(
    {
      ok: false,
      code,
      error: message,
      fallback: '주소 검색이 되지 않아도 매매가격을 직접 입력해 전세가율을 계산할 수 있습니다.',
      ...detail
    },
    { status, cacheControl: 'no-store' }
  );
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const query = normalizeQuery(url.searchParams.get('query') || url.searchParams.get('q') || '');
  const size = clampNumber(url.searchParams.get('size'), 1, 10, 8);
  const kakaoKey = env.KAKAO_REST_API_KEY;

  if (!query) return error('주소 또는 동 이름을 입력해 주세요.', 400, 'MISSING_QUERY');
  if (query.length > MAX_QUERY_LENGTH) return error('주소 검색어는 80자 이내로 입력해 주세요.', 400, 'QUERY_TOO_LONG');
  if (!kakaoKey) return error('주소 검색 설정을 확인하는 중 문제가 발생했습니다.', 503, 'MISSING_KAKAO_KEY');

  try {
    const addressItems = await searchKakaoAddress(query, size, kakaoKey);
    let items = addressItems;

    if (!items.length) {
      items = await searchKakaoKeywordAsRegion(query, size, kakaoKey);
    }

    const uniqueItems = dedupeRegions(items).slice(0, size);
    if (!uniqueItems.length) {
      return error('주소를 찾지 못했습니다. 시·군·구와 동 이름을 함께 입력해 주세요.', 404, 'ADDRESS_NOT_FOUND', {
        query: { query, size }
      });
    }

    return json({
      ok: true,
      query: { query, size },
      count: uniqueItems.length,
      items: uniqueItems,
      source: 'kakao-local-address',
      note: '카카오 Local API 주소 검색 결과를 전세가율 계산용 법정동 코드로 정리한 참고 정보입니다.'
    });
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? '주소 검색 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 주세요.'
      : '주소 검색 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 주세요.';
    return error(message, 502, err?.name === 'AbortError' ? 'ADDRESS_TIMEOUT' : 'ADDRESS_LOOKUP_FAILED');
  }
}

async function searchKakaoAddress(query, size, kakaoKey) {
  const apiUrl = new URL(KAKAO_ADDRESS_ENDPOINT);
  apiUrl.searchParams.set('query', query);
  apiUrl.searchParams.set('size', String(size));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` }
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error('Kakao address API failed');

  return (data.documents || [])
    .map(normalizeAddressDocument)
    .filter((item) => item.bCode && item.lawdCd);
}

async function searchKakaoKeywordAsRegion(query, size, kakaoKey) {
  const apiUrl = new URL(KAKAO_KEYWORD_ENDPOINT);
  apiUrl.searchParams.set('query', query);
  apiUrl.searchParams.set('size', String(size));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` }
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error('Kakao keyword API failed');

  const docs = (data.documents || []).slice(0, size);
  const resolved = await Promise.allSettled(
    docs.map(async (doc) => {
      const x = Number(doc.x);
      const y = Number(doc.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const region = await coordToRegion(x, y, kakaoKey);
      if (!region?.bCode) return null;
      return {
        label: region.label || String(doc.address_name || doc.place_name || '').trim(),
        addressName: String(doc.address_name || '').trim(),
        roadAddressName: String(doc.road_address_name || '').trim(),
        bCode: region.bCode,
        lawdCd: region.bCode.slice(0, 5),
        region1: region.region1,
        region2: region.region2,
        region3: region.region3,
        lat: y,
        lng: x,
        source: 'kakao-keyword-coord2regioncode'
      };
    })
  );

  return resolved
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);
}

async function coordToRegion(x, y, kakaoKey) {
  const apiUrl = new URL(KAKAO_REGION_ENDPOINT);
  apiUrl.searchParams.set('x', String(x));
  apiUrl.searchParams.set('y', String(y));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` }
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error('Kakao coord2regioncode API failed');

  const doc = (data.documents || []).find((item) => item.region_type === 'B') || data.documents?.[0] || null;
  if (!doc?.code) return null;
  const region1 = String(doc.region_1depth_name || '').trim();
  const region2 = String(doc.region_2depth_name || '').trim();
  const region3 = String(doc.region_3depth_name || '').trim();
  return {
    bCode: String(doc.code || '').replace(/\D/g, ''),
    region1,
    region2,
    region3,
    label: [region1, region2, region3].filter(Boolean).join(' ')
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return {};
  }
}

function normalizeAddressDocument(doc) {
  const address = doc.address || null;
  const roadAddress = doc.road_address || null;
  const bCode = String(address?.b_code || roadAddress?.b_code || '').replace(/\D/g, '');
  const region1 = String(address?.region_1depth_name || roadAddress?.region_1depth_name || '').trim();
  const region2 = String(address?.region_2depth_name || roadAddress?.region_2depth_name || '').trim();
  const region3 = String(address?.region_3depth_name || roadAddress?.region_3depth_name || '').trim();
  const fallbackLabel = String(doc.address_name || roadAddress?.address_name || address?.address_name || '').trim();
  const label = [region1, region2, region3].filter(Boolean).join(' ') || fallbackLabel;

  return {
    label,
    addressName: String(address?.address_name || doc.address_name || '').trim(),
    roadAddressName: String(roadAddress?.address_name || '').trim(),
    bCode,
    lawdCd: bCode.length >= 5 ? bCode.slice(0, 5) : '',
    region1,
    region2,
    region3,
    lat: parseNumber(doc.y),
    lng: parseNumber(doc.x),
    source: 'kakao-address'
  };
}

function dedupeRegions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.bCode}-${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
