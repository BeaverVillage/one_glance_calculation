const KAKAO_KEYWORDS_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const KAKAO_ADDRESS_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/address.json';
const KAKAO_COORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...init.headers
  }
});

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet({ request, env }) {
  try {
    const key = getEnv(env, ['KAKAO_REST_API_KEY']);
    if (!key) return json({ ok: false, message: 'KAKAO_REST_API_KEY가 설정되지 않았습니다.' }, { status: 500 });

    const url = new URL(request.url);
    const query = clean(url.searchParams.get('query'), 80);
    const address = clean(url.searchParams.get('address'), 120);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const data = await kakaoFetch(`${KAKAO_COORD_ENDPOINT}?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`, key);
      const docs = Array.isArray(data.documents) ? data.documents : [];
      const first = docs[0] || {};
      const addr = first.road_address || first.address || {};
      return json({
        ok: true,
        mode: 'coord2address',
        addressName: addr.address_name || '',
        region1: addr.region_1depth_name || '',
        region2: addr.region_2depth_name || '',
        region3: addr.region_3depth_name || '',
        raw: docs.slice(0, 3)
      });
    }

    if (!query && !address) {
      return json({ ok: false, message: '검색어 또는 주소를 입력해 주세요.' }, { status: 400 });
    }

    const q = address || query;
    const documents = [];
    const seen = new Set();
    const add = (items) => {
      (Array.isArray(items) ? items : []).map((item) => normalizePlace(item)).forEach((place) => {
        const id = place.id || `${place.lng},${place.lat}`;
        if (seen.has(id)) return;
        seen.add(id);
        documents.push(place);
      });
    };

    const primaryEndpoint = address ? KAKAO_ADDRESS_ENDPOINT : KAKAO_KEYWORDS_ENDPOINT;
    const primary = await kakaoFetch(`${primaryEndpoint}?query=${encodeURIComponent(q)}&size=10`, key);
    add(primary.documents);

    if (!address && documents.length === 0) {
      const secondary = await kakaoFetch(`${KAKAO_ADDRESS_ENDPOINT}?query=${encodeURIComponent(q)}&size=10`, key);
      add(secondary.documents);
    }

    return json({ ok: true, query: q, documents: documents.slice(0, 10) });
  } catch (error) {
    return json({ ok: false, message: error?.message || '카카오 지역 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

async function kakaoFetch(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}`, accept: 'application/json' }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`카카오 Local API 응답 오류가 발생했습니다. (${response.status})`);
  return data || {};
}

function normalizePlace(item) {
  const address = item.road_address_name || item.address_name || item.address?.address_name || '';
  const lat = Number(item.y || item.address?.y);
  const lng = Number(item.x || item.address?.x);
  const parts = inferRegionParts(address);
  return {
    id: item.id || `${lng},${lat}`,
    name: item.place_name || item.address_name || address || '검색 결과',
    address,
    roadAddress: item.road_address_name || '',
    category: item.category_name || '',
    phone: item.phone || '',
    lat,
    lng,
    region1: parts.region1,
    region2: parts.region2,
    region3: parts.region3
  };
}

function inferRegionParts(address) {
  const parts = String(address || '').trim().split(/\s+/).filter(Boolean);
  const token = parts[0] || '';
  const aliases = {
    서울특별시: '서울', 서울: '서울', 부산광역시: '부산', 부산: '부산', 대구광역시: '대구', 대구: '대구', 인천광역시: '인천', 인천: '인천', 광주광역시: '광주', 광주: '광주', 대전광역시: '대전', 대전: '대전', 울산광역시: '울산', 울산: '울산', 세종특별자치시: '세종', 세종: '세종', 경기도: '경기', 경기: '경기', 강원특별자치도: '강원', 강원도: '강원', 강원: '강원', 충청북도: '충북', 충북: '충북', 충청남도: '충남', 충남: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전북: '전북', 전라남도: '전남', 전남: '전남', 경상북도: '경북', 경북: '경북', 경상남도: '경남', 경남: '경남', 제주특별자치도: '제주', 제주도: '제주', 제주: '제주'
  };
  return { region1: aliases[token] || token, region2: parts[1] || '', region3: parts[2] || '' };
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function getEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
