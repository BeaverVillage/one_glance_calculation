const KAKAO_REGION_ENDPOINT = 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=86400'
    }
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, { status, cacheControl: 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return error('좌표가 필요합니다.');
  if (!env.KAKAO_REST_API_KEY) return error('KAKAO_REST_API_KEY 환경변수가 필요합니다.', 503);

  const apiUrl = new URL(KAKAO_REGION_ENDPOINT);
  apiUrl.searchParams.set('x', String(lng));
  apiUrl.searchParams.set('y', String(lat));

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` }
    });
    const data = await response.json();
    if (!response.ok) return error('법정동 코드 변환에 실패했습니다.', 502);

    const documents = data.documents || [];
    const legalRegion = documents.find((doc) => doc.region_type === 'B') || documents[0] || null;
    if (!legalRegion?.code) return error('선택한 위치의 법정동 코드를 찾지 못했습니다.', 404);

    const bCode = String(legalRegion.code || '');
    return json({
      ok: true,
      region1: legalRegion.region_1depth_name || '',
      region2: legalRegion.region_2depth_name || '',
      region3: legalRegion.region_3depth_name || '',
      bCode,
      lawdCd: bCode.slice(0, 5),
      source: 'kakao-coord2regioncode'
    });
  } catch (_) {
    return error('법정동 코드 변환 중 오류가 발생했습니다.', 502);
  }
}
