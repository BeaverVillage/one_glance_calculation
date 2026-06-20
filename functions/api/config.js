const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...init.headers
  }
});

export async function onRequestGet({ env }) {
  return json({
    kakaoMapJsKey: getEnv(env, ['KAKAO_MAP_JS_KEY', 'KAKAO_JS_KEY'])
  });
}

function getEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
