const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=300'
    }
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, { status, cacheControl: 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim();
  const size = clampNumber(url.searchParams.get('size'), 1, 10, 8);

  if (!q) return error('검색어를 입력해 주세요.');
  if (!env.KAKAO_REST_API_KEY) return error('KAKAO_REST_API_KEY 환경변수가 필요합니다.', 503);

  const apiUrl = new URL(KAKAO_KEYWORD_ENDPOINT);
  apiUrl.searchParams.set('query', q);
  apiUrl.searchParams.set('size', String(size));

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` }
    });
    const data = await response.json();
    if (!response.ok) return error('카카오 장소 검색에 실패했습니다.', 502);

    const items = (data.documents || [])
      .map(normalizeKakaoPlace)
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    return json({
      ok: true,
      query: { q, size },
      items,
      source: 'kakao-local-keyword'
    });
  } catch (_) {
    return error('카카오 장소 검색 중 오류가 발생했습니다.', 502);
  }
}

function normalizeKakaoPlace(doc) {
  return {
    id: String(doc.id || ''),
    name: String(doc.place_name || '').trim(),
    category: String(doc.category_name || '').trim(),
    address: String(doc.road_address_name || doc.address_name || '').trim(),
    roadAddress: String(doc.road_address_name || '').trim(),
    jibunAddress: String(doc.address_name || '').trim(),
    phone: String(doc.phone || '').trim(),
    placeUrl: String(doc.place_url || '').trim(),
    lat: Number(doc.y),
    lng: Number(doc.x)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
