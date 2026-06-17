function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=300' } });
}

export async function onRequestGet({ env }) {
  const kakaoMapJsKey = env.KAKAO_MAP_JS_KEY || '';
  return json({
    kakaoMapJsKey,
    hasKakaoMapJsKey: Boolean(kakaoMapJsKey),
    hasSeoulOpenApiKey: Boolean(env.SEOUL_OPEN_API_KEY),
    hasPublicDataApiKey: Boolean(env.PUBLIC_DATA_API_KEY),
    hasPublicDataParkingEndpoint: Boolean(env.PUBLIC_DATA_PARKING_API_URL || env.PUBLIC_DATA_PARKING_ENDPOINT),
    hasSeoulRealtimeParkingAdapter: Boolean(env.SEOUL_OPEN_API_KEY || env.SEOUL_REALTIME_PARKING_API_KEY),
    hasHolidayApiKey: Boolean(env.HOLIDAY_API_KEY || env.PUBLIC_DATA_API_KEY),
    hasKakaoMobilityApiKey: Boolean(env.KAKAO_MOBILITY_API_KEY || env.KAKAO_REST_API_KEY),
    seoulRealtimeParkingApiName: env.SEOUL_REALTIME_PARKING_API_NAME || 'GetParkingInfo',
    parkingApiCacheTtlSeconds: Number(env.PARKING_API_CACHE_TTL_SECONDS || 300),
    parkingRealtimeCacheTtlSeconds: Number(env.PARKING_REALTIME_CACHE_TTL_SECONDS || 60),
    holidayApiName: env.HOLIDAY_API_NAME || 'getRestDeInfo',
    holidayApiCacheTtlSeconds: Number(env.HOLIDAY_API_CACHE_TTL_SECONDS || 86400),
    kakaoMobilityCacheTtlSeconds: Number(env.KAKAO_MOBILITY_CACHE_TTL_SECONDS || env.PARKING_ROUTE_CACHE_TTL_SECONDS || 120),
    message: kakaoMapJsKey
      ? 'Kakao Maps JavaScript key is configured. If the map still fails, check Kakao Developers Web platform domains.'
      : '카카오맵 키가 없어 샘플 지도 계산 모드로 표시합니다.'
  });
}
