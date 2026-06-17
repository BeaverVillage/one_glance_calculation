function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=300' } });
}
export async function onRequestGet({ env }) {
  return json({ kakaoMapJsKey: env.KAKAO_MAP_JS_KEY || '' });
}
