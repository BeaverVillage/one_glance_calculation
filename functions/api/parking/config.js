function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=300' } });
}

export async function onRequestGet({ env }) {
  const kakaoMapJsKey = env.KAKAO_MAP_JS_KEY || '';
  return json({
    kakaoMapJsKey,
    hasKakaoMapJsKey: Boolean(kakaoMapJsKey),
    message: kakaoMapJsKey
      ? 'Kakao Maps JavaScript key is configured. If the map still fails, check Kakao Developers Web platform domains.'
      : 'KAKAO_MAP_JS_KEY is not configured. The page will use the sample fallback map.'
  });
}
