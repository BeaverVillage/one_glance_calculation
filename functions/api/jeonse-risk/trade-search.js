const KAKAO_ADDRESS_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/address.json';
const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const KAKAO_REGION_ENDPOINT = 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json';
const RTMS_APT_TRADE_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

const REQUEST_TIMEOUT_MS = 4500;
const RTMS_TIMEOUT_MS = 5000;
const MAX_MONTHS = 12;
const MAX_NUM_OF_ROWS = 100;
const MAX_RESULT_ITEMS = 50;
const CONCURRENT_MONTH_REQUESTS = 2;
const CACHE_SECONDS = 21600;

class UpstreamApiError extends Error {
  constructor(message, code = 'UPSTREAM_ERROR') {
    super(message);
    this.name = 'UpstreamApiError';
    this.code = code;
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'no-store',
      ...(init.headers || {})
    }
  });
}

function error(message, status = 400, code = 'BAD_REQUEST', detail = {}) {
  const safeStatus = status >= 500 ? 200 : status;
  return json(
    {
      ok: false,
      code,
      error: message,
      upstreamStatus: status >= 500 ? status : undefined,
      fallback: '실거래가 조회가 되지 않아도 매매가격을 직접 입력해 전세가율을 계산할 수 있습니다.',
      ...detail
    },
    { status: safeStatus, cacheControl: 'no-store' }
  );
}

export async function onRequestGet(context) {
  const { request, env = {}, waitUntil } = context || {};
  const url = new URL(request.url);
  const rawAddress = normalizePublicText(url.searchParams.get('address') || url.searchParams.get('addr') || '');
  const rawAptName = normalizePublicText(url.searchParams.get('aptName') || url.searchParams.get('apt') || '');
  const rawQuery = normalizePublicText(url.searchParams.get('query') || url.searchParams.get('q') || '');
  const months = clampNumber(url.searchParams.get('months'), 1, MAX_MONTHS, 3);
  const numOfRows = clampNumber(url.searchParams.get('numOfRows'), 10, MAX_NUM_OF_ROWS, MAX_NUM_OF_ROWS);
  const kakaoKey = env.KAKAO_REST_API_KEY || '';
  const serviceKey = normalizeServiceKey(env.MOLIT_RTMS_API_KEY || env.PUBLIC_DATA_API_KEY || '');

  const combinedQuery = normalizePublicText(rawQuery || [rawAddress, rawAptName].filter(Boolean).join(' '));
  if (!combinedQuery) return error('주소 또는 동 이름과 단지명을 입력해 주세요.', 400, 'MISSING_QUERY');
  if (!kakaoKey) return error('주소 검색 설정을 확인하는 중 문제가 발생했습니다.', 503, 'MISSING_KAKAO_KEY');
  if (!serviceKey) return error('실거래가 조회 설정을 확인하는 중 문제가 발생했습니다.', 503, 'MISSING_PUBLIC_DATA_KEY');
  if (combinedQuery.length > 120) return error('검색어는 120자 이내로 입력해 주세요.', 400, 'QUERY_TOO_LONG');
  if (rawAptName.length > 60) return error('아파트명은 60자 이내로 입력해 주세요.', 400, 'APT_NAME_TOO_LONG');

  try {
    const addressResolution = await resolveAddress({ address: rawAddress, aptName: rawAptName, query: combinedQuery, size: 6, kakaoKey });
    const addressItem = addressResolution.item;
    if (!addressItem?.lawdCd) {
      return error('주소를 찾지 못했습니다. 시·군·구와 동 이름을 함께 입력해 주세요.', 404, 'ADDRESS_NOT_FOUND', {
        query: { address: rawAddress, aptName: rawAptName, query: combinedQuery, months }
      });
    }

    const inferredAptName = inferAptName({ address: rawAddress, aptName: rawAptName, query: combinedQuery, addressItem });
    const dealYmds = getRecentDealYmds(months);
    const cacheRequest = buildCacheRequest(request, { lawdCd: addressItem.lawdCd, aptName: inferredAptName, months, numOfRows });
    const cached = await readCache(cacheRequest);
    if (cached) return withHeader(cached, 'x-hannun-cache', 'HIT');

    const results = await mapLimit(dealYmds, CONCURRENT_MONTH_REQUESTS, (dealYmd) =>
      fetchAptTrades({ lawdCd: addressItem.lawdCd, dealYmd, numOfRows, serviceKey })
    );

    const successfulMonths = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value.dealYmd);
    const failedMonths = results
      .map((result, index) => (result.status === 'rejected' ? dealYmds[index] : null))
      .filter(Boolean);
    const failureDetails = results
      .map((result, index) => (result.status === 'rejected' ? { dealYmd: dealYmds[index], code: result.reason?.code || 'RTMS_MONTH_FAILED' } : null))
      .filter(Boolean);

    if (!successfulMonths.length) {
      return error('실거래가 조회 응답이 일시적으로 지연되거나 공공데이터 응답을 처리하지 못했습니다. 조회 기간을 줄이거나 단지명을 더 구체적으로 입력해 주세요.', 200, 'RTMS_ALL_MONTHS_FAILED', {
        addressItem,
        addressCandidates: addressResolution.candidates,
        inferredAptName,
        query: { address: rawAddress, aptName: rawAptName, query: combinedQuery, months, numOfRows },
        monthsQueried: dealYmds,
        failedMonths,
        failureDetails,
        noDataMessage: '실거래가 보조 조회가 실패했습니다. 기간을 줄이거나 단지명을 더 구체적으로 입력해 보세요. 매매가격 직접 입력도 가능합니다.'
      });
    }

    const fetchedItems = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value.items);
    const allItems = dedupeTrades(fetchedItems);
    const matchResult = buildAptMatchResult(allItems, inferredAptName);
    const matchedItems = matchResult.items
      .sort((a, b) => String(b.dealDate).localeCompare(String(a.dealDate)))
      .slice(0, MAX_RESULT_ITEMS);
    const candidates = matchedItems.length ? [] : matchResult.candidates;

    const responseData = {
      ok: true,
      query: {
        address: rawAddress,
        aptName: rawAptName,
        query: combinedQuery,
        inferredAptName,
        lawdCd: addressItem.lawdCd,
        months,
        numOfRows
      },
      addressItem,
      addressCandidates: addressResolution.candidates,
      addressQueryTried: addressResolution.queryTried,
      monthsQueried: dealYmds,
      successfulMonths,
      failedMonths,
      failureDetails,
      partialFailure: failedMonths.length > 0,
      count: matchedItems.length,
      totalMatchedBeforeLimit: matchResult.items.length,
      totalFetchedBeforeFilter: fetchedItems.length,
      totalUniqueFetchedBeforeFilter: allItems.length,
      match: {
        mode: matchResult.mode,
        tokens: matchResult.tokens,
        candidateCount: candidates.length
      },
      stats: buildStats(matchedItems),
      items: matchedItems,
      candidates,
      source: {
        address: 'kakao-local-address',
        trades: '국토교통부_아파트 매매 실거래가 자료',
        url: 'https://www.data.go.kr/data/15126469/openapi.do'
      },
      note: '카카오 주소 검색과 공공데이터포털 아파트 매매 실거래가 자료를 연결해 정리한 참고 정보입니다. 동/호 정보는 제공되지 않으며 거래 신고·공개 시점에 따라 실제 시세와 차이가 있을 수 있습니다.',
      noDataMessage: buildNoDataMessage({
        hasItems: matchedItems.length > 0,
        hasCandidates: candidates.length > 0,
        aptName: inferredAptName || rawAptName || combinedQuery,
        months
      })
    };

    const response = json(responseData, {
      cacheControl: `public, max-age=${CACHE_SECONDS}`,
      headers: { 'x-hannun-cache': 'MISS' }
    });
    writeCache(cacheRequest, response.clone(), waitUntil);
    return response;
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    return error(
      isTimeout
        ? '실거래가 통합 조회 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 주세요.'
        : '실거래가 통합 조회 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 주세요.',
      isTimeout ? 504 : 502,
      isTimeout ? 'TRADE_SEARCH_TIMEOUT' : err?.code || 'TRADE_SEARCH_FAILED',
      { noDataMessage: '실거래가 보조 조회가 실패했습니다. 기간을 줄이거나 단지명을 더 구체적으로 입력해 보세요. 매매가격 직접 입력도 가능합니다.' }
    );
  }
}

async function resolveAddress({ address, aptName, query, size, kakaoKey }) {
  const queries = buildAddressQueries({ address, aptName, query });
  let lastCandidates = [];
  for (const candidateQuery of queries) {
    const items = await searchRegion(candidateQuery, size, kakaoKey);
    lastCandidates = mergeAddressCandidates(lastCandidates, items);
    const selected = selectBestAddress(items, query);
    if (selected?.lawdCd) {
      return { item: selected, candidates: lastCandidates.slice(0, size), queryTried: candidateQuery };
    }
  }
  return { item: null, candidates: lastCandidates.slice(0, size), queryTried: queries[0] || '' };
}

function buildAddressQueries({ address, aptName, query }) {
  const values = [];
  const add = (value) => {
    const normalized = normalizePublicText(value);
    if (normalized && !values.includes(normalized)) values.push(normalized);
  };

  add(address);
  if (address && aptName) add(address.replace(aptName, ''));
  add(query);
  if (aptName && query) add(query.replace(aptName, ''));

  const tokens = normalizePublicText(query).split(/\s+/).filter(Boolean);
  for (let length = Math.min(4, tokens.length); length >= 1; length -= 1) {
    add(tokens.slice(0, length).join(' '));
  }

  const dongTokens = tokens.filter((token) => /[동읍면리가]$/.test(token) || /특별자치시|특별시|광역시|시|군|구/.test(token));
  if (dongTokens.length) add(dongTokens.join(' '));
  const lastDong = [...tokens].reverse().find((token) => /[동읍면리]$/.test(token));
  if (lastDong) add(lastDong);

  return values.slice(0, 8);
}

async function searchRegion(query, size, kakaoKey) {
  if (!query) return [];
  const addressItems = await searchKakaoAddress(query, size, kakaoKey);
  if (addressItems.length) return dedupeRegions(addressItems).slice(0, size);
  const keywordItems = await searchKakaoKeywordAsRegion(query, size, kakaoKey);
  return dedupeRegions(keywordItems).slice(0, size);
}

async function searchKakaoAddress(query, size, kakaoKey) {
  const apiUrl = new URL(KAKAO_ADDRESS_ENDPOINT);
  apiUrl.searchParams.set('query', query);
  apiUrl.searchParams.set('size', String(size));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` }
  }, REQUEST_TIMEOUT_MS);
  const data = await safeJson(response);
  if (!response.ok) throw new UpstreamApiError('Kakao address API failed', 'KAKAO_ADDRESS_FAILED');

  return (data.documents || []).map(normalizeAddressDocument).filter((item) => item.bCode && item.lawdCd);
}

async function searchKakaoKeywordAsRegion(query, size, kakaoKey) {
  const apiUrl = new URL(KAKAO_KEYWORD_ENDPOINT);
  apiUrl.searchParams.set('query', query);
  apiUrl.searchParams.set('size', String(size));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` }
  }, REQUEST_TIMEOUT_MS);
  const data = await safeJson(response);
  if (!response.ok) throw new UpstreamApiError('Kakao keyword API failed', 'KAKAO_KEYWORD_FAILED');

  const docs = (data.documents || []).slice(0, size);
  const resolved = await Promise.allSettled(
    docs.map(async (doc) => {
      const x = Number(doc.x);
      const y = Number(doc.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const region = await coordToRegion(x, y, kakaoKey);
      if (!region?.bCode) return null;
      return {
        label: region.label || String(doc.address_name || doc.place_name || '').trim(),
        addressName: String(doc.address_name || '').trim(),
        roadAddressName: String(doc.road_address_name || '').trim(),
        bCode: region.bCode,
        lawdCd: region.bCode.slice(0, 5),
        region1: region.region1,
        region2: region.region2,
        region3: region.region3,
        lat: y,
        lng: x,
        source: 'kakao-keyword-coord2regioncode'
      };
    })
  );

  return resolved.filter((result) => result.status === 'fulfilled' && result.value).map((result) => result.value);
}

async function coordToRegion(x, y, kakaoKey) {
  const apiUrl = new URL(KAKAO_REGION_ENDPOINT);
  apiUrl.searchParams.set('x', String(x));
  apiUrl.searchParams.set('y', String(y));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` }
  }, REQUEST_TIMEOUT_MS);
  const data = await safeJson(response);
  if (!response.ok) throw new UpstreamApiError('Kakao coord2regioncode API failed', 'KAKAO_REGION_FAILED');

  const doc = (data.documents || []).find((item) => item.region_type === 'B') || data.documents?.[0] || null;
  if (!doc?.code) return null;
  const region1 = String(doc.region_1depth_name || '').trim();
  const region2 = String(doc.region_2depth_name || '').trim();
  const region3 = String(doc.region_3depth_name || '').trim();
  return {
    bCode: String(doc.code || '').replace(/\D/g, ''),
    region1,
    region2,
    region3,
    label: [region1, region2, region3].filter(Boolean).join(' ')
  };
}

function normalizeAddressDocument(doc) {
  const address = doc.address || null;
  const roadAddress = doc.road_address || null;
  const bCode = String(address?.b_code || roadAddress?.b_code || '').replace(/\D/g, '');
  const region1 = String(address?.region_1depth_name || roadAddress?.region_1depth_name || '').trim();
  const region2 = String(address?.region_2depth_name || roadAddress?.region_2depth_name || '').trim();
  const region3 = String(address?.region_3depth_name || roadAddress?.region_3depth_name || '').trim();
  const fallbackLabel = String(doc.address_name || roadAddress?.address_name || address?.address_name || '').trim();
  const label = [region1, region2, region3].filter(Boolean).join(' ') || fallbackLabel;

  return {
    label,
    addressName: String(address?.address_name || doc.address_name || '').trim(),
    roadAddressName: String(roadAddress?.address_name || '').trim(),
    bCode,
    lawdCd: bCode.length >= 5 ? bCode.slice(0, 5) : '',
    region1,
    region2,
    region3,
    lat: parseNumber(doc.y),
    lng: parseNumber(doc.x),
    source: 'kakao-address'
  };
}

function mergeAddressCandidates(previous, next) {
  return dedupeRegions([...(previous || []), ...(next || [])]);
}

function dedupeRegions(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = `${item.bCode}-${item.label}`;
    if (!item?.bCode || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectBestAddress(items, query) {
  if (!Array.isArray(items) || !items.length) return null;
  const normalizedQuery = normalizeText(query);
  return [...items].sort((a, b) => scoreAddress(b, normalizedQuery) - scoreAddress(a, normalizedQuery))[0] || null;
}

function scoreAddress(item, normalizedQuery) {
  const label = normalizeText([item.region1, item.region2, item.region3, item.label].filter(Boolean).join(' '));
  let score = 0;
  if (item.region3 && normalizedQuery.includes(normalizeText(item.region3))) score += 60;
  if (item.region2 && normalizedQuery.includes(normalizeText(item.region2))) score += 25;
  if (item.region1 && normalizedQuery.includes(normalizeText(item.region1))) score += 15;
  if (label && normalizedQuery.includes(label)) score += 10;
  return score;
}

function inferAptName({ address, aptName, query, addressItem }) {
  const direct = normalizePublicText(aptName);
  if (direct) return direct;

  let result = normalizePublicText(query || '');
  const removals = buildRegionRemovalTerms(addressItem, address)
    .filter(Boolean)
    .sort((a, b) => String(b).length - String(a).length);
  for (const value of removals) {
    result = normalizePublicText(result.replace(value, ' '));
  }

  result = result
    .split(/\s+/)
    .filter((token) => !/[시군구동읍면리]$/.test(token) || /마을|단지|아파트|타운|빌|힐|파크|자이|래미안|푸르지오|아이파크/i.test(token))
    .join(' ');

  return normalizePublicText(result);
}


function buildRegionRemovalTerms(addressItem, address) {
  const terms = new Set([address, addressItem?.label, addressItem?.region1, addressItem?.region2, addressItem?.region3].filter(Boolean));
  const region1 = String(addressItem?.region1 || '').trim();
  const aliases = [
    region1.replace(/특별자치시|특별시|광역시|자치도|도$/g, ''),
    region1.slice(0, 2)
  ].filter((value) => value && value.length >= 2);
  aliases.forEach((value) => terms.add(value));
  return [...terms];
}

async function fetchAptTrades({ lawdCd, dealYmd, numOfRows, serviceKey }) {
  const apiUrl = new URL(RTMS_APT_TRADE_ENDPOINT);
  apiUrl.searchParams.set('serviceKey', serviceKey);
  apiUrl.searchParams.set('LAWD_CD', lawdCd);
  apiUrl.searchParams.set('DEAL_YMD', dealYmd);
  apiUrl.searchParams.set('pageNo', '1');
  apiUrl.searchParams.set('numOfRows', String(numOfRows));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { accept: 'application/xml,text/xml,*/*' }
  }, RTMS_TIMEOUT_MS);
  const text = await response.text();
  if (!response.ok) throw new UpstreamApiError(`RTMS API failed: ${response.status}`, 'RTMS_HTTP_ERROR');

  const parsed = parseAptTradeXml(text);
  if (parsed.serviceErrorCode) {
    throw new UpstreamApiError(parsed.serviceErrorMessage || '공공데이터 인증 또는 조회 조건을 확인할 수 없습니다.', parsed.serviceErrorCode);
  }
  if (parsed.resultCode && parsed.resultCode !== '00') {
    throw new UpstreamApiError(parsed.resultMsg || '공공데이터 응답이 정상 처리되지 않았습니다.', `RTMS_RESULT_${parsed.resultCode}`);
  }

  return {
    dealYmd,
    totalCount: parsed.totalCount,
    items: parsed.items.map((item) => ({ ...item, lawdCd, dealYmd }))
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return {};
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function buildCacheRequest(request, params) {
  const url = new URL(request.url);
  url.search = '';
  url.searchParams.set('lawdCd', params.lawdCd);
  if (params.aptName) url.searchParams.set('aptName', params.aptName);
  url.searchParams.set('months', String(params.months));
  url.searchParams.set('numOfRows', String(params.numOfRows));
  return new Request(url.toString(), { method: 'GET' });
}

async function readCache(cacheRequest) {
  if (typeof caches === 'undefined' || !caches.default) return null;
  try {
    return await caches.default.match(cacheRequest);
  } catch (_) {
    return null;
  }
}

function writeCache(cacheRequest, response, waitUntil) {
  if (typeof caches === 'undefined' || !caches.default) return;
  try {
    const putTask = caches.default.put(cacheRequest, response);
    if (typeof waitUntil === 'function') waitUntil(putTask);
  } catch (_) {
    // Cache failures should never block the calculator.
  }
}

function withHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function normalizeServiceKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const decoded = decodeURIComponent(raw);
    return decoded || raw;
  } catch (_) {
    return raw;
  }
}

function normalizePublicText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeText(value) {
  return String(value || '').trim().replace(/[\s\-_.·]/g, '').toLowerCase();
}

function getRecentDealYmds(months) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: months }, (_, index) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - index, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function parseAptTradeXml(xml) {
  const resultCode = getTag(xml, 'resultCode');
  const resultMsg = getTag(xml, 'resultMsg');
  const totalCount = parseNumber(getTag(xml, 'totalCount')) || 0;
  const itemBlocks = [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const items = itemBlocks.map((block) => normalizeAptTradeItem(block)).filter(Boolean);
  const serviceErrorCode = getTag(xml, 'returnReasonCode') || getTag(xml, 'errMsg') || '';
  const serviceErrorMessage = getTag(xml, 'returnAuthMsg') || getTag(xml, 'resultMsg') || '';
  return { resultCode, resultMsg, totalCount, items, serviceErrorCode, serviceErrorMessage };
}

function normalizeAptTradeItem(block) {
  const dealYear = getTag(block, 'dealYear') || getTag(block, '년');
  const dealMonth = getTag(block, 'dealMonth') || getTag(block, '월');
  const dealDay = getTag(block, 'dealDay') || getTag(block, '일');
  const dealAmountManwon = parseMoneyManwon(getTag(block, 'dealAmount') || getTag(block, '거래금액'));
  const aptName = getTag(block, 'aptNm') || getTag(block, '아파트') || getTag(block, '단지명') || '';
  const area = parseNumber(getTag(block, 'excluUseAr') || getTag(block, '전용면적'));
  const floor = getTag(block, 'floor') || getTag(block, '층') || '';
  const buildYear = getTag(block, 'buildYear') || getTag(block, '건축년도') || '';
  const umdNm = getTag(block, 'umdNm') || getTag(block, '법정동') || '';
  const jibun = getTag(block, 'jibun') || getTag(block, '지번') || '';
  const aptDong = getTag(block, 'aptDong') || getTag(block, '동') || '';
  const dealingGbn = getTag(block, 'dealingGbn') || getTag(block, '거래유형') || '';
  const estateAgentSggNm = getTag(block, 'estateAgentSggNm') || getTag(block, '중개사소재지') || '';

  if (!aptName && !dealAmountManwon) return null;

  return {
    aptName: decodeXml(aptName),
    dealDate: formatDealDate(dealYear, dealMonth, dealDay),
    dealYear: parseNumber(dealYear),
    dealMonth: parseNumber(dealMonth),
    dealDay: parseNumber(dealDay),
    dealAmountManwon,
    dealAmountKrw: dealAmountManwon * 10000,
    dealAmountLabel: formatManwon(dealAmountManwon),
    area,
    areaLabel: area ? `${area.toLocaleString('ko-KR')}㎡` : '',
    floor: decodeXml(floor),
    buildYear: parseNumber(buildYear),
    umdNm: decodeXml(umdNm).trim(),
    jibun: decodeXml(jibun).trim(),
    aptDong: decodeXml(aptDong).trim(),
    dealingGbn: decodeXml(dealingGbn).trim(),
    estateAgentSggNm: decodeXml(estateAgentSggNm).trim()
  };
}

function buildAptMatchResult(items, aptName) {
  const query = normalizePublicText(aptName);
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return { mode: 'all', tokens: [], items, candidates: [] };

  const tokens = buildAptSearchTokens(query);
  const scored = items
    .map((item) => {
      const scoreInfo = scoreAptName(item.aptName, query, tokens);
      return { item, ...scoreInfo };
    })
    .filter((entry) => entry.score > 0)
    .sort(sortScoredAptEntry);

  const matched = scored.filter((entry) => entry.score >= 70);
  if (matched.length) {
    return {
      mode: 'matched',
      tokens,
      items: matched.map((entry) => ({ ...entry.item, matchScore: entry.score, matchedBy: entry.reason })),
      candidates: []
    };
  }

  return {
    mode: 'candidates',
    tokens,
    items: [],
    candidates: buildAptCandidates(scored, items, query)
  };
}

function buildAptSearchTokens(value) {
  const source = String(value || '').trim();
  const compact = normalizeText(source);
  const tokens = new Set();
  String(source)
    .replace(/[()\[\]{}]/g, ' ')
    .split(/[\s,\/|+]+/)
    .map(normalizeText)
    .filter((token) => token.length >= 2)
    .forEach((token) => tokens.add(token));

  const villageMatches = compact.match(/[가-힣A-Za-z0-9]+?마을/g) || [];
  villageMatches.forEach((token) => {
    if (token.length >= 2) tokens.add(token);
    const withoutMaeul = token.replace(/마을$/, '');
    if (withoutMaeul.length >= 2) tokens.add(withoutMaeul);
  });

  const danjiMatches = compact.match(/\d+단지/g) || [];
  danjiMatches.forEach((token) => tokens.add(token));

  const prefixBeforeDanji = compact.match(/^(.+?)(\d+단지)$/);
  if (prefixBeforeDanji) {
    const prefix = prefixBeforeDanji[1];
    if (prefix.length >= 2) tokens.add(prefix);
    tokens.add(prefixBeforeDanji[2]);
  }

  if (!tokens.size && compact.length >= 2) tokens.add(compact);
  return [...tokens].filter((token) => token.length >= 2 && token.length <= 30);
}

function scoreAptName(aptName, query, tokens = buildAptSearchTokens(query)) {
  const apt = normalizeText(aptName);
  const normalizedQuery = normalizeText(query);
  if (!apt || !normalizedQuery) return { score: 0, reason: 'empty' };
  if (apt === normalizedQuery) return { score: 100, reason: 'exact' };
  if (apt.includes(normalizedQuery)) return { score: 94, reason: 'contains' };
  if (normalizedQuery.includes(apt) && apt.length >= 4) return { score: 78, reason: 'query-contains-apt' };

  const meaningfulTokens = tokens.filter((token) => token.length >= 2 && token !== normalizedQuery);
  const fallbackTokens = meaningfulTokens.length ? meaningfulTokens : tokens;
  if (!fallbackTokens.length) return { score: 0, reason: 'no-token' };

  const matchedTokens = fallbackTokens.filter((token) => apt.includes(token));
  if (!matchedTokens.length) return { score: 0, reason: 'no-token-match' };

  const ratio = matchedTokens.length / fallbackTokens.length;
  const hasDanjiToken = matchedTokens.some((token) => /\d+단지/.test(token));
  const hasNameToken = matchedTokens.some((token) => !/\d+단지/.test(token));
  let score = Math.round(ratio * 78);
  if (matchedTokens.length === fallbackTokens.length) score = Math.max(score, 86);
  if (hasDanjiToken && hasNameToken) score = Math.max(score, 78);
  if (hasDanjiToken && !hasNameToken) score = Math.max(score, 68);
  return { score, reason: 'token', matchedTokens };
}

function sortScoredAptEntry(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return String(b.item.dealDate).localeCompare(String(a.item.dealDate));
}

function buildAptCandidates(scoredEntries, allItems, query) {
  const sourceEntries = scoredEntries.length ? scoredEntries : allItems.map((item) => ({ item, score: 0, reason: 'recent' }));
  const grouped = new Map();
  for (const entry of sourceEntries) {
    const item = entry.item || {};
    const key = [normalizeText(item.aptName), normalizeText(item.umdNm)].join('|');
    if (!item.aptName || !key.trim()) continue;
    const previous = grouped.get(key);
    const candidate = previous || {
      aptName: item.aptName,
      umdNm: item.umdNm || '',
      searchValue: item.aptName,
      dealCount: 0,
      matchScore: 0,
      lastDealDate: '',
      lastAmountManwon: 0,
      lastAmountLabel: '',
      areaLabels: new Set(),
      floors: new Set()
    };
    candidate.dealCount += 1;
    candidate.matchScore = Math.max(candidate.matchScore, entry.score || 0);
    if (item.areaLabel) candidate.areaLabels.add(item.areaLabel);
    if (item.floor) candidate.floors.add(String(item.floor));
    if (!candidate.lastDealDate || String(item.dealDate).localeCompare(candidate.lastDealDate) > 0) {
      candidate.lastDealDate = item.dealDate || '';
      candidate.lastAmountManwon = item.dealAmountManwon || 0;
      candidate.lastAmountLabel = item.dealAmountLabel || '';
    }
    grouped.set(key, candidate);
  }

  return [...grouped.values()]
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.dealCount !== a.dealCount) return b.dealCount - a.dealCount;
      return String(b.lastDealDate).localeCompare(String(a.lastDealDate));
    })
    .slice(0, 10)
    .map((candidate) => ({
      aptName: candidate.aptName,
      umdNm: candidate.umdNm,
      searchValue: candidate.searchValue,
      dealCount: candidate.dealCount,
      matchScore: candidate.matchScore,
      lastDealDate: candidate.lastDealDate,
      lastAmountManwon: candidate.lastAmountManwon,
      lastAmountLabel: candidate.lastAmountLabel,
      areaLabels: [...candidate.areaLabels].slice(0, 4),
      floorLabels: [...candidate.floors].slice(0, 4),
      note: query ? `'${query}'와 정확히 일치하지는 않지만 같은 지역·기간에서 비슷하게 찾은 단지 후보입니다.` : '같은 지역·기간에서 거래가 확인된 단지 후보입니다.'
    }));
}

function buildNoDataMessage({ hasItems, hasCandidates, aptName, months }) {
  if (hasItems) return '';
  if (hasCandidates) {
    return `입력한 단지명 '${aptName || '미입력'}'과 정확히 일치하는 거래는 찾지 못했습니다. 아래 후보 단지를 선택해 다시 조회하거나, 기간을 늘려 보세요. 매매가격 직접 입력도 가능합니다.`;
  }
  return `최근 ${months}개월 내 입력한 지역·아파트명과 일치하는 매매 실거래가가 없습니다. 기간을 늘리거나 단지명을 더 구체적으로 입력한 뒤, 그래도 없으면 매매가격을 직접 입력해 주세요.`;
}

function dedupeTrades(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.dealDate, item.aptName, item.area, item.floor, item.dealAmountManwon, item.umdNm, item.jibun].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildStats(items) {
  const amounts = (items || []).map((item) => Number(item.dealAmountManwon)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!amounts.length) return null;
  const average = Math.round(amounts.reduce((sum, value) => sum + value, 0) / amounts.length);
  const mid = Math.floor(amounts.length / 2);
  const median = amounts.length % 2 === 0 ? Math.round((amounts[mid - 1] + amounts[mid]) / 2) : amounts[mid];
  const latest = [...items].sort((a, b) => String(b.dealDate).localeCompare(String(a.dealDate)))[0];
  return {
    count: amounts.length,
    latestAmountManwon: latest?.dealAmountManwon || null,
    latestAmountLabel: latest?.dealAmountLabel || '',
    medianAmountManwon: median,
    medianAmountLabel: formatManwon(median),
    averageAmountManwon: average,
    averageAmountLabel: formatManwon(average),
    minAmountManwon: amounts[0],
    minAmountLabel: formatManwon(amounts[0]),
    maxAmountManwon: amounts[amounts.length - 1],
    maxAmountLabel: formatManwon(amounts[amounts.length - 1])
  };
}

function getTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(xml || '').match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseMoneyManwon(value) {
  const digits = String(value || '').replace(/[^0-9.-]/g, '');
  const number = Number(digits);
  return Number.isFinite(number) ? number : 0;
}

function parseNumber(value) {
  const number = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function formatDealDate(year, month, day) {
  const y = String(year || '').padStart(4, '0');
  const m = String(month || '').padStart(2, '0');
  const d = String(day || '').padStart(2, '0');
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return '';
  return `${y}-${m}-${d}`;
}

function formatManwon(manwon) {
  const value = Math.round(Number(manwon) || 0);
  if (!value) return '0원';
  const eok = Math.floor(value / 10000);
  const rest = value % 10000;
  if (eok > 0 && rest > 0) return `${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만 원`;
  if (eok > 0) return `${eok.toLocaleString('ko-KR')}억 원`;
  return `${value.toLocaleString('ko-KR')}만 원`;
}
