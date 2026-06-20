const RTMS_APT_TRADE_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const MAX_MONTHS = 12;
const MAX_NUM_OF_ROWS = 100;
const MAX_RESULT_ITEMS = 50;
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_SECONDS = 21600;
const CONCURRENT_MONTH_REQUESTS = 2;

class UpstreamApiError extends Error {
  constructor(message, code = 'RTMS_UPSTREAM_ERROR') {
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
      'cache-control': init.cacheControl || `public, max-age=${CACHE_SECONDS}`,
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
  const lawdCd = normalizeLawdCd(url.searchParams.get('lawdCd') || url.searchParams.get('LAWD_CD'));
  const aptName = normalizePublicText(url.searchParams.get('aptName') || url.searchParams.get('apt') || '');
  const normalizedAptName = normalizeText(aptName);
  const months = clampNumber(url.searchParams.get('months'), 1, MAX_MONTHS, 3);
  const dealYmd = normalizeDealYmd(url.searchParams.get('dealYmd') || url.searchParams.get('DEAL_YMD'));
  const numOfRows = clampNumber(url.searchParams.get('numOfRows'), 10, MAX_NUM_OF_ROWS, MAX_NUM_OF_ROWS);
  const serviceKey = normalizeServiceKey(env.MOLIT_RTMS_API_KEY || env.PUBLIC_DATA_API_KEY || '');

  if (!serviceKey) return error('실거래가 조회 설정을 확인하는 중 문제가 발생했습니다.', 503, 'MISSING_PUBLIC_DATA_KEY');
  if (!lawdCd) return error('법정동코드 앞 5자리 LAWD_CD가 필요합니다. 예: 서울 강서구 11500', 400, 'MISSING_LAWD_CD');
  if (aptName.length > 60) return error('아파트명은 60자 이내로 입력해 주세요.', 400, 'APT_NAME_TOO_LONG');

  const dealYmds = dealYmd ? [dealYmd] : getRecentDealYmds(months);
  const cacheRequest = buildCacheRequest(request, { lawdCd, aptName, months: dealYmd ? 1 : months, dealYmd, numOfRows });

  const cached = await readCache(cacheRequest);
  if (cached) return withHeader(cached, 'x-hannun-cache', 'HIT');

  try {
    const results = await mapLimit(dealYmds, CONCURRENT_MONTH_REQUESTS, (ymd) =>
      fetchAptTrades({ lawdCd, dealYmd: ymd, numOfRows, serviceKey })
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
      return error('실거래가 조회 응답이 일시적으로 지연되거나 공공데이터 응답을 처리하지 못했습니다. 조회 기간을 줄이거나 단지명을 더 구체적으로 입력해 주세요. 매매가격 직접 입력도 가능합니다.', 200, 'RTMS_ALL_MONTHS_FAILED', {
        query: { lawdCd, aptName, months: dealYmd ? 1 : months, dealYmd: dealYmd || null, numOfRows },
        monthsQueried: dealYmds,
        failedMonths,
        failureDetails
      });
    }

    const successful = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value.items);

    const allDedupedItems = dedupeTrades(successful);
    const matchResult = buildAptMatchResult(allDedupedItems, aptName);
    const dedupedItems = matchResult.items;
    const sortedItems = dedupedItems
      .sort((a, b) => String(b.dealDate).localeCompare(String(a.dealDate)))
      .slice(0, MAX_RESULT_ITEMS);
    const candidates = sortedItems.length ? [] : matchResult.candidates;

    const responseData = {
      ok: true,
      query: { lawdCd, aptName, normalizedAptName, months: dealYmd ? 1 : months, dealYmd: dealYmd || null, numOfRows },
      monthsQueried: dealYmds,
      successfulMonths,
      failedMonths,
      failureDetails,
      partialFailure: failedMonths.length > 0,
      count: sortedItems.length,
      totalMatchedBeforeLimit: dedupedItems.length,
      totalFetchedBeforeFilter: successful.length,
      totalUniqueFetchedBeforeFilter: allDedupedItems.length,
      match: {
        mode: matchResult.mode,
        tokens: matchResult.tokens,
        candidateCount: candidates.length
      },
      stats: buildStats(sortedItems),
      items: sortedItems,
      candidates,
      source: {
        name: '국토교통부_아파트 매매 실거래가 자료',
        url: 'https://www.data.go.kr/data/15126469/openapi.do'
      },
      note: '공공데이터포털 아파트 매매 실거래가 자료를 조회한 참고 정보입니다. 동/호 정보는 제공되지 않으며 거래 신고·공개 시점에 따라 실제 시세와 차이가 있을 수 있습니다.',
      noDataMessage: buildNoDataMessage({
        hasItems: sortedItems.length > 0,
        hasCandidates: candidates.length > 0,
        aptName,
        months: dealYmd ? 1 : months
      })
    };

    const response = json(responseData, { headers: { 'x-hannun-cache': 'MISS' } });
    writeCache(cacheRequest, response.clone(), waitUntil);
    return response;
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    const status = isTimeout ? 504 : 502;
    const code = isTimeout ? 'RTMS_TIMEOUT' : err?.code || 'RTMS_LOOKUP_FAILED';
    const message = isTimeout
      ? '실거래가 조회 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 주세요.'
      : '아파트 매매 실거래가 조회 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 주세요.';
    return error(message, status, code, {
      noDataMessage: '실거래가 보조 조회가 실패했습니다. 조회 기간을 줄이거나 단지명을 더 구체적으로 입력해 보세요. 매매가격을 직접 입력해 계산할 수도 있습니다.'
    });
  }
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

async function fetchAptTrades({ lawdCd, dealYmd, numOfRows, serviceKey }) {
  const apiUrl = new URL(RTMS_APT_TRADE_ENDPOINT);
  apiUrl.searchParams.set('serviceKey', serviceKey);
  apiUrl.searchParams.set('LAWD_CD', lawdCd);
  apiUrl.searchParams.set('DEAL_YMD', dealYmd);
  apiUrl.searchParams.set('pageNo', '1');
  apiUrl.searchParams.set('numOfRows', String(numOfRows));

  const response = await fetchWithTimeout(apiUrl.toString(), {
    headers: { accept: 'application/xml,text/xml,*/*' }
  });
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
  if (params.dealYmd) url.searchParams.set('dealYmd', params.dealYmd);
  else url.searchParams.set('months', String(params.months));
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

function normalizeLawdCd(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 5 ? digits : '';
}

function normalizeDealYmd(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 6) return '';
  const month = Number(digits.slice(4, 6));
  return month >= 1 && month <= 12 ? digits : '';
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

function normalizePublicText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeText(value) {
  return String(value || '').trim().replace(/[\s\-_.·]/g, '').toLowerCase();
}


function buildAptMatchResult(items, aptName) {
  const query = normalizePublicText(aptName);
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return { mode: 'all', tokens: [], items, candidates: [] };
  }

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
  const sourceEntries = scoredEntries.length
    ? scoredEntries
    : allItems.map((item) => ({ item, score: 0, reason: 'recent' }));
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
      note: query
        ? `'${query}'와 정확히 일치하지는 않지만 같은 지역·기간에서 비슷하게 찾은 단지 후보입니다.`
        : '같은 지역·기간에서 거래가 확인된 단지 후보입니다.'
    }));
}

function buildNoDataMessage({ hasItems, hasCandidates, aptName, months }) {
  const hasAptName = Boolean(normalizeText(aptName));
  if (hasItems) return '';
  if (hasCandidates) {
    return `입력한 단지명 '${aptName || '미입력'}'과 정확히 일치하는 거래는 찾지 못했습니다. 아래 후보 단지를 선택해 다시 조회하거나, 기간을 늘려 보세요. 매매가격 직접 입력도 가능합니다.`;
  }
  if (!hasAptName) {
    return `최근 ${months}개월 내 선택 지역의 아파트 매매 실거래가를 찾지 못했습니다. 기간을 늘리거나 매매가격을 직접 입력해 계산할 수 있습니다.`;
  }
  return `최근 ${months}개월 내 입력한 지역·단지명과 일치하는 매매 실거래가가 없습니다. 기간을 늘리거나 단지명을 조정한 뒤, 그래도 없으면 매매가격을 직접 입력해 주세요.`;
}

function parseAptTradeXml(xml) {
  const resultCode = getTag(xml, 'resultCode');
  const resultMsg = getTag(xml, 'resultMsg');
  const totalCount = parseNumber(getTag(xml, 'totalCount')) || 0;
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const items = itemBlocks.map((block) => normalizeAptTradeItem(block)).filter(Boolean);
  const serviceErrorCode = getTag(xml, 'returnReasonCode') || getTag(xml, 'errMsg') || '';
  const serviceErrorMessage = getTag(xml, 'returnAuthMsg') || getTag(xml, 'returnAuthMsg') || getTag(xml, 'resultMsg') || '';
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
    dealAmountLabel: formatKoreanMoneyFromManwon(dealAmountManwon),
    area,
    areaLabel: Number.isFinite(area) ? `${formatNumber(area)}㎡` : '',
    floor: decodeXml(floor),
    buildYear: decodeXml(buildYear),
    umdNm: decodeXml(umdNm),
    jibun: decodeXml(jibun),
    aptDong: decodeXml(aptDong),
    dealingGbn: decodeXml(dealingGbn),
    estateAgentSggNm: decodeXml(estateAgentSggNm)
  };
}

function dedupeTrades(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.aptName, item.dealDate, item.area, item.floor, item.dealAmountManwon, item.umdNm, item.jibun].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildStats(items) {
  const amounts = items
    .map((item) => Number(item.dealAmountManwon))
    .filter((amount) => Number.isFinite(amount) && amount > 0)
    .sort((a, b) => a - b);
  if (!amounts.length) return null;
  const latest = items.find((item) => Number.isFinite(Number(item.dealAmountManwon))) || null;
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const middle = Math.floor(amounts.length / 2);
  const median = amounts.length % 2 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2;
  return {
    latestAmountManwon: latest ? Number(latest.dealAmountManwon) : null,
    latestAmountLabel: latest ? latest.dealAmountLabel : '',
    averageAmountManwon: Math.round(average),
    averageAmountLabel: formatKoreanMoneyFromManwon(Math.round(average)),
    medianAmountManwon: Math.round(median),
    medianAmountLabel: formatKoreanMoneyFromManwon(Math.round(median)),
    minAmountManwon: amounts[0],
    minAmountLabel: formatKoreanMoneyFromManwon(amounts[0]),
    maxAmountManwon: amounts[amounts.length - 1],
    maxAmountLabel: formatKoreanMoneyFromManwon(amounts[amounts.length - 1])
  };
}

function getTag(xml, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : '';
}

function parseMoneyManwon(value) {
  const cleaned = String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function parseNumber(value) {
  const cleaned = String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatDealDate(year, month, day) {
  const yNumber = parseNumber(year);
  const mNumber = parseNumber(month);
  const dNumber = parseNumber(day);
  if (!yNumber || !mNumber || !dNumber) return '';
  return `${String(yNumber).padStart(4, '0')}-${String(mNumber).padStart(2, '0')}-${String(dNumber).padStart(2, '0')}`;
}

function formatKoreanMoneyFromManwon(manwon) {
  const amount = Math.round(Number(manwon) || 0);
  if (!amount) return '0원';
  const eok = Math.floor(amount / 10000);
  const rest = amount % 10000;
  if (eok && rest) return `${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만 원`;
  if (eok) return `${eok.toLocaleString('ko-KR')}억 원`;
  return `${rest.toLocaleString('ko-KR')}만 원`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
