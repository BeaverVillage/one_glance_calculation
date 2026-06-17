function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=120'
    }
  });
}

function error(message, status = 400) {
  return json({ error: message }, { status, cacheControl: 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = normalizeRadiusMeters(url.searchParams.get('radius') || 1500);
  const query = (url.searchParams.get('query') || '주차장').trim() || '주차장';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return error('목적지 좌표가 필요합니다.');
  if (!env.KAKAO_REST_API_KEY) {
    return json({ places: [], dataMode: 'missing-key', note: 'KAKAO_REST_API_KEY가 없어 카카오 Local 주차장 후보 보강을 건너뜁니다.' }, { cacheControl: 'no-store' });
  }
  try {
    const places = [];
    for (let page = 1; page <= 3; page += 1) {
      const kakaoUrl = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      kakaoUrl.searchParams.set('query', query);
      kakaoUrl.searchParams.set('x', String(lng));
      kakaoUrl.searchParams.set('y', String(lat));
      kakaoUrl.searchParams.set('radius', String(radius));
      kakaoUrl.searchParams.set('sort', 'distance');
      kakaoUrl.searchParams.set('size', '15');
      kakaoUrl.searchParams.set('page', String(page));
      const res = await fetch(kakaoUrl.toString(), {
        headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY },
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      if (!res.ok) throw new Error(`카카오 Local API 호출 실패: ${res.status}`);
      const data = await res.json();
      const docs = data.documents || [];
      places.push(...docs.map(normalizeKakaoPlace).filter(Boolean));
      if (data.meta?.is_end || docs.length < 15) break;
    }
    return json({ places: dedupePlaces(places).slice(0, 45), dataMode: 'kakao-local', radius, query });
  } catch (err) {
    return json({ places: [], dataMode: 'kakao-local-error', error: err?.message || String(err), note: '카카오 Local 후보 보강에 실패했습니다.' }, { cacheControl: 'no-store' });
  }
}

function normalizeKakaoPlace(doc) {
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  if (!doc.place_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: doc.id ? 'KAKAO_' + String(doc.id) : 'KAKAO_' + slug(doc.place_name),
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name || '',
    lat,
    lng,
    category: doc.category_name || '',
    phone: doc.phone || '',
    source: '카카오 Local API',
    pricingStatus: 'needs-check'
  };
}

function dedupePlaces(places) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${normalizeName(place.name)}|${normalizeName(place.address)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRadiusMeters(radius) {
  const value = Number(radius);
  if (!Number.isFinite(value) || value <= 0) return 1500;
  return Math.min(20000, Math.max(300, Math.round(value)));
}
function normalizeName(value) { return String(value || '').replace(/[\s·・\-_()\[\]]+/g, '').toLowerCase(); }
function slug(value) { return String(value || '').replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 80) || Math.random().toString(36).slice(2); }
