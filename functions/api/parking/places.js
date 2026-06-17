import { mockPlaces } from './_lib/mock-data.js';
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': init.cacheControl || 'public, max-age=60' } });
}
function error(message, status = 400) { return json({ error: message }, { status, cacheControl: 'no-store' }); }
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return error('검색어를 입력해 주세요.');
  if (env.KAKAO_REST_API_KEY) {
    try {
      const kakao = await fetch('https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent(q) + '&size=8', { headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY } });
      if (kakao.ok) {
        const data = await kakao.json();
        return json({ places: (data.documents || []).map((doc) => ({ name: doc.place_name, address: doc.road_address_name || doc.address_name, lat: Number(doc.y), lng: Number(doc.x) })) });
      }
    } catch (_) {}
  }
  const lower = q.toLowerCase();
  const places = mockPlaces.filter((place) => (place.name + place.address).toLowerCase().includes(lower));
  return json({ places: places.length ? places : mockPlaces });
}
