function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=300' } });
}

export async function onRequestGet({ env }) {
  const kakaoMapJsKey = env.KAKAO_MAP_JS_KEY || env.KAKAO_JS_KEY || '';
  return json({
    kakaoMapJsKey,
    hasKakaoMapJsKey: Boolean(kakaoMapJsKey),
    hasKakaoRestApiKey: Boolean(env.KAKAO_REST_API_KEY),
    hasPublicDataApiKey: Boolean(env.PUBLIC_DATA_API_KEY || env.DATA_GO_KR_SERVICE_KEY),
    hasSeoulOpenApiKey: Boolean(env.SEOUL_OPEN_API_KEY),
    hasHolidayApiKey: Boolean(env.HOLIDAY_API_KEY || env.PUBLIC_DATA_API_KEY || env.DATA_GO_KR_SERVICE_KEY),
    message: kakaoMapJsKey
      ? 'Kakao Maps JavaScript key is configured. If the map still fails, check Kakao Developers Web platform domains.'
      : '카카오맵 키가 없어 기본 지도 표시 모드로 표시합니다.'
  });
}
