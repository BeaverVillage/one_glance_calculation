const KAMIS_BASE_ENDPOINT = 'https://www.kamis.or.kr/service/price/xml.do';
const KAMIS_GROCERY_API_VERSION = 'v70-source-tag-fix';
const PRICE_GO_ENDPOINTS = [
  'https://openapi.price.go.kr/openApiImpl/ProductPriceInfoService',
  'http://openapi.price.go.kr/openApiImpl/ProductPriceInfoService',
  'http://openapi.price.go.kr/ProductPriceInfoService',
];
const PRICE_GO_KEY_PARAM_NAMES = ['ServiceKey', 'serviceKey'];

const ACTIONS = {
  dailySales: 'dailySalesList',
  priceTrend: 'recentlyPriceTrendList',
  productInfo: 'productInfo',
  retailPeriod: 'periodRetailProductList',
  wholesalePeriod: 'periodWholesaleProductList',
  categoryDaily: 'dailyPriceByCategoryList',
};

const CATEGORY_LABELS = {
  '100': '식량작물',
  '200': '채소류',
  '300': '특용작물',
  '400': '과일류',
  '500': '축산물',
  '600': '수산물',
};

const MARKET_TYPES = {
  retail: { code: '01', label: '소매가격', periodAction: ACTIONS.retailPeriod },
  wholesale: { code: '02', label: '도매가격', periodAction: ACTIONS.wholesalePeriod },
};

const REGION_CODES = {
  전국: '',
  서울: '1101',
  부산: '2100',
  대구: '2200',
  인천: '2300',
  광주: '2401',
  대전: '2501',
  울산: '2601',
  세종: '2701',
  경기: '3111',
  강원: '3214',
  충북: '3311',
  충남: '3411',
  전북: '3511',
  전남: '3613',
  경북: '3714',
  경남: '3814',
  제주: '3911',
};

const WHOLESALE_REGION_CODES = new Set(['', '1101', '2100', '2200', '2401', '2501']);

const AMBIGUOUS_QUERY_HINTS = new Set(['파', '고기', '생선', '쌀류', '과일', '채소', '야채']);

const ITEM_ALIASES = {
  계란: ['계란', '달걀', '난류'],
  달걀: ['달걀', '계란', '난류'],
  무: ['무', '무우'],
  무우: ['무우', '무'],
  대파: ['대파', '파'],
  쪽파: ['쪽파', '파'],
  실파: ['실파', '파'],
  파: ['파', '대파', '쪽파', '실파'],
  소고기: ['소고기', '쇠고기'],
  쇠고기: ['쇠고기', '소고기'],
  돼지고기: ['돼지고기', '돈육'],
  닭고기: ['닭고기', '닭'],
  오징어: ['오징어', '물오징어'],
  물오징어: ['물오징어', '오징어'],
  멸치: ['멸치', '건멸치'],
  건멸치: ['건멸치', '멸치'],
  미역: ['미역', '건미역'],
  건미역: ['건미역', '미역'],
  배: ['배', '신고배'],
  사과: ['사과', '후지', '홍로'],
  고등어: ['고등어'],
  밀가루: ['밀가루', '소맥분', '중력분', '박력분', '강력분'],
  소맥분: ['소맥분', '밀가루'],
  식용유: ['식용유', '콩기름', '대두유', '카놀라유'],
  라면: ['라면', '봉지라면'],
  두부: ['두부'],
};

const DANGEROUS_ONE_CHAR_QUERY = new Set(['배', '무', '파', '김']);
const KAMIS_MIN_RESOLVED_SCORE = 70;
const KAMIS_STRONG_MATCH_SCORE = 95;
const PRICE_GO_MIN_MATCH_SCORE = 92;
const PRICE_GO_MAX_PRODUCT_CANDIDATES = 8;
const KAMIS_SOURCE_LABEL = 'KAMIS 농산물유통정보 가격정보 Open API';
const KAMIS_SOURCE_TAG = 'KAMIS PRICE DATA';
const PRICE_GO_SOURCE_LABEL = '한국소비자원 참가격 생필품 가격 정보 OpenAPI';
const PRICE_GO_SOURCE_TAG = '참가격 생필품 가격';
const PRICE_GO_HTTPS_ERROR_STATUSES = new Set([525, 526]);

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': init.cacheControl || 'no-store, no-cache, must-revalidate, max-age=0',
    'pragma': 'no-cache',
    'expires': '0',
    ...init.headers,
  },
});

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet({ request, env }) {
  const startedAt = Date.now();
  const requestId = createRequestId();
  try {
    const certKey = getEnv(env, ['KAMIS_API_KEY', 'KAMIS_CERT_KEY']);
    const certId = getEnv(env, ['KAMIS_CERT_ID', 'KAMIS_USER_ID', 'KAMIS_API_ID']);
    const priceGoKey = getEnv(env, ['PRICE_GO_KR_API_KEY', 'PRICE_GO_API_KEY', 'GOODPRICE_API_KEY', 'KCA_PRICE_API_KEY']);
    if (!certKey || !certId) {
      return json({
        ok: false,
        code: 'missing_key',
        message: 'KAMIS API 인증 정보가 설정되지 않았습니다. Cloudflare 환경변수 KAMIS_API_KEY와 KAMIS_CERT_ID를 확인해 주세요.',
        requestId,
        serverVersion: KAMIS_GROCERY_API_VERSION,
      }, { status: 500, cacheControl: 'no-store' });
    }

    const url = new URL(request.url);
    const item = clean(url.searchParams.get('item'), 40);
    const region = normalizeRegion(url.searchParams.get('region') || '전국');
    const market = normalizeMarket(url.searchParams.get('market') || 'retail');
    const period = normalizePeriod(url.searchParams.get('period') || 'latest');
    const selectedProductNo = clean(url.searchParams.get('productNo') || url.searchParams.get('productno'), 30);
    const selectedItemCode = clean(url.searchParams.get('itemCode') || url.searchParams.get('itemcode'), 30);
    const selectedKindCode = clean(url.searchParams.get('kindCode') || url.searchParams.get('kindcode'), 30);
    const selectedRankCode = clean(url.searchParams.get('rankCode') || url.searchParams.get('rankcode'), 30);
    const selectedCategoryCode = clean(url.searchParams.get('categoryCode') || url.searchParams.get('category') || url.searchParams.get('itemcategorycode'), 3);
    const regday = normalizeDate(url.searchParams.get('regday'));

    console.log('[KAMIS grocery request]', {
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      region,
      market,
      period,
      selectedProductNo: selectedProductNo || '',
      regday: regday || 'latest-default',
    });

    if (!item && !selectedProductNo && !selectedItemCode) {
      return json({ ok: false, code: 'missing_item', message: '품목명을 입력해 주세요.', requestId, serverVersion: KAMIS_GROCERY_API_VERSION }, { status: 400, cacheControl: 'no-store' });
    }

    const marketTypes = market === 'all' ? ['retail', 'wholesale'] : [market];
    const warnings = [];
    const dailySalesPayload = await fetchKamisPayloadWithFallback({ certKey, certId, action: ACTIONS.dailySales, requestId });
    const dailyRows = normalizeDailySalesRows(dailySalesPayload, requestId);
    const dailyPriceRows = dailyRows.filter((row) => marketTypes.includes(row.marketType));
    const productCatalogPayload = await safeFetchProductInfo({ certKey, certId, requestId });
    const productCatalogRows = productCatalogPayload ? normalizeProductCatalogRows(productCatalogPayload) : [];
    const indexEntries = buildCodeIndex(dailyRows, productCatalogRows);

    let resolution = resolveItemCandidate({
      query: item,
      selectedProductNo,
      selectedItemCode,
      selectedKindCode,
      selectedRankCode,
      selectedCategoryCode,
      indexEntries,
      marketTypes,
    });

    const directDailyRows = filterDailyRowsByQuery(dailyPriceRows, item);
    if (resolution.status === 'unsupported' && directDailyRows.length) {
      resolution = { status: 'resolved', candidates: directDailyRows.map(candidateFromRow).map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, item), matchLabel: buildMatchLabel(candidate) })).slice(0, 8), reason: 'daily_sales_direct_match' };
    } else if (resolution.status === 'ambiguous' && directDailyRows.length === 1 && scoreCandidate(candidateFromRow(directDailyRows[0]), item) >= 125) {
      const candidate = candidateFromRow(directDailyRows[0]);
      resolution = { status: 'resolved', candidates: [{ ...candidate, score: scoreCandidate(candidate, item), matchLabel: buildMatchLabel(candidate) }], reason: 'daily_sales_single_strong_match' };
    }

    logCodeIndexDiagnostics({
      requestId,
      item,
      market,
      region,
      dailySalesPayload,
      dailyRows,
      productCatalogPayload,
      productCatalogRows,
      resolution,
    });

    if (resolution.status === 'unsupported') {
      const priceGoResponse = await tryBuildPriceGoFallbackResponse({ priceGoKey, requestId, item, region, market, warnings, reason: resolution.reason });
      if (priceGoResponse) return json(priceGoResponse);
      const missingPriceGoWarning = priceGoKey ? [] : ['한국소비자원 참가격 API 키가 설정되지 않아 생필품 보조 조회를 건너뛰었습니다.'];
      const finalWarnings = [...warnings, ...missingPriceGoWarning];
      return json(buildNoPriceResponse({
        requestId,
        item,
        region,
        market,
        warnings: finalWarnings,
        code: 'unsupported_item',
        message: buildUnsupportedPriceGoMessage({ item, priceGoKey, warnings: finalWarnings }),
        sourceTag: '공공데이터 조회 결과',
      }));
    }

    if (resolution.status === 'ambiguous') {
      return json({
        ok: true,
        code: 'ambiguous_item',
        needsSelection: true,
        requestId,
        serverVersion: KAMIS_GROCERY_API_VERSION,
        checkedAt: new Date().toISOString(),
        item,
        region,
        market,
        count: 0,
        candidates: resolution.candidates.slice(0, 8).map(publicCandidate),
        summary: {
          tone: 'choice',
          title: '조회할 품목을 선택해 주세요',
          message: `'${item}'와 관련된 KAMIS 품목 후보가 여러 개 있습니다. 정확한 품목을 선택하면 가격을 다시 확인합니다.`,
          requestId,
          version: KAMIS_GROCERY_API_VERSION,
          item,
          region,
          market,
        },
        results: [],
        warnings: ['입력어가 여러 품목과 연결될 수 있어 자동 조회하지 않았습니다.'],
        source: 'KAMIS 농산물유통정보 가격정보 Open API',
        sourceTag: KAMIS_SOURCE_TAG,
        sourceLabel: KAMIS_SOURCE_LABEL,
      });
    }

    const resolvedCandidates = resolution.candidates.length ? resolution.candidates : [];
    const matchedDailyRows = dedupeResults([
      ...directDailyRows,
      ...filterDailyRowsByCandidates(dailyPriceRows, resolvedCandidates, item),
    ]);
    console.log('[KAMIS grocery daily-sales match]', {
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      directDailyRowCount: directDailyRows.length,
      matchedDailyRowCount: matchedDailyRows.length,
      firstMatchedDailyRow: matchedDailyRows[0] ? {
        productNo: matchedDailyRows[0].productNo,
        productName: matchedDailyRows[0].productName,
        itemName: matchedDailyRows[0].itemName,
        categoryCode: matchedDailyRows[0].categoryCode,
        marketType: matchedDailyRows[0].marketType,
        unit: matchedDailyRows[0].unit,
        day: matchedDailyRows[0].day,
        hasPrice: Number.isFinite(matchedDailyRows[0].price),
      } : null,
    });
    const periodRows = [];

    if (region !== '전국' && resolvedCandidates.length) {
      const periodCandidates = resolvedCandidates
        .filter((candidate) => candidate.itemCategoryCode && candidate.itemCode && candidate.kindCode)
        .slice(0, 3);
      for (const marketType of marketTypes) {
        for (const candidate of periodCandidates) {
          const fetched = await safeFetchPeriodPriceRows({ certKey, certId, requestId, region, marketType, candidate, regday });
          periodRows.push(...fetched);
        }
      }
      if (!periodRows.length) warnings.push(`${region} 지역의 품목별 가격자료가 없어 최근 상품 기준 가격을 함께 확인했습니다.`);
    }

    let results = dedupeResults([...periodRows, ...matchedDailyRows])
      .filter(hasUsablePriceRow)
      .sort(compareResult);

    if (!results.length && resolvedCandidates.length && dailyRows.length < 1) {
      const categoryFallbackRows = await safeFetchCategoryFallbackRows({ certKey, certId, requestId, region, marketTypes, candidates: resolvedCandidates, item, regday });
      results = dedupeResults(categoryFallbackRows).filter(hasUsablePriceRow).sort(compareResult);
      if (categoryFallbackRows.length) warnings.push('상품 기준 가격에서 찾지 못해 부류별 가격 API를 보조 조회했습니다.');
    } else if (!results.length && resolvedCandidates.length) {
      warnings.push('최근 상품 기준 가격 목록에서 현재 품목의 가격값을 찾지 못해 부류별 보조 조회는 생략했습니다.');
    }

    let trend = null;
    if (period === 'trend' && results[0]?.productNo) {
      trend = await safeFetchTrend({ certKey, certId, requestId, productNo: results[0].productNo, regday });
      if (trend?.points?.length) results[0].trend = trend;
    }

    if (!results.length) {
      const priceGoResponse = await tryBuildPriceGoFallbackResponse({ priceGoKey, requestId, item, region, market, warnings, reason: 'kamis_no_price' });
      if (priceGoResponse) return json(priceGoResponse);
      const candidateMessage = resolvedCandidates.length
        ? 'KAMIS 코드표에서 품목은 찾았지만 현재 조건의 실제 가격값을 확인하지 못했습니다. 시장 유형 또는 지역 기준을 바꿔 다시 확인해 주세요.'
        : '현재 조건의 실제 가격값을 확인하지 못했습니다.';
      const missingPriceGoWarning = priceGoKey ? [] : ['한국소비자원 참가격 API 키가 설정되지 않아 생필품 보조 조회를 건너뛰었습니다.'];
      const finalWarnings = [...warnings, ...missingPriceGoWarning];
      const finalMessage = priceGoKey
        ? buildNoRecentPriceGoMessage({ item, baseMessage: candidateMessage, warnings: finalWarnings })
        : candidateMessage;
      return json(buildNoPriceResponse({
        requestId,
        item,
        region,
        market,
        warnings: finalWarnings,
        code: 'no_recent_price',
        message: finalMessage,
        candidates: resolvedCandidates.slice(0, 5).map(publicCandidate),
        sourceTag: '공공데이터 조회 결과',
      }));
    }

    const summary = buildSummary({ requestId, item, region, market, results, warnings, resolution, elapsedMs: Date.now() - startedAt });
    return json({
      ok: true,
      code: 'price_found',
      requestId,
      serverVersion: KAMIS_GROCERY_API_VERSION,
      checkedAt: new Date().toISOString(),
      item,
      region,
      market,
      matchedItem: publicCandidate(resolvedCandidates[0] || candidateFromRow(results[0])),
      candidates: resolvedCandidates.slice(0, 5).map(publicCandidate),
      count: results.length,
      summary,
      results: results.slice(0, 40),
      warnings: [...new Set(warnings)].slice(0, 8),
      source: KAMIS_SOURCE_LABEL,
      sourceTag: KAMIS_SOURCE_TAG,
      sourceLabel: KAMIS_SOURCE_LABEL,
    });
  } catch (error) {
    console.log('[KAMIS grocery fatal]', { requestId, version: KAMIS_GROCERY_API_VERSION, message: error?.message || String(error) });
    return json({ ok: false, requestId, message: error?.message || '장보기 물가 정보를 불러오지 못했습니다.', serverVersion: KAMIS_GROCERY_API_VERSION }, { status: 500, cacheControl: 'no-store' });
  }
}

function buildNoPriceResponse({ requestId, item, region, market, warnings = [], code = 'no_price', message, candidates = [], sourceTag = KAMIS_SOURCE_TAG }) {
  return {
    ok: true,
    code,
    requestId,
    serverVersion: KAMIS_GROCERY_API_VERSION,
    checkedAt: new Date().toISOString(),
    item,
    region,
    market,
    count: 0,
    candidates,
    summary: {
      tone: code === 'unsupported_item' ? 'unsupported' : 'empty',
      title: code === 'unsupported_item' ? '조사대상 품목을 찾지 못했습니다' : '조회 가능한 가격정보를 찾지 못했습니다',
      message,
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      region,
      market,
    },
    results: [],
    warnings: [...new Set(warnings)].slice(0, 8),
    source: KAMIS_SOURCE_LABEL,
    sourceTag,
    sourceLabel: KAMIS_SOURCE_LABEL,
  };
}


async function tryBuildPriceGoFallbackResponse({ priceGoKey, requestId, item, region, market, warnings = [], reason = '' }) {
  if (!priceGoKey) return null;
  if (market === 'wholesale') return null;
  try {
    const fallback = await fetchPriceGoFallback({ apiKey: priceGoKey, requestId, item, region });
    if (!fallback?.results?.length) {
      console.log('[PRICE_GO grocery fallback empty]', {
        requestId,
        version: KAMIS_GROCERY_API_VERSION,
        item,
        region,
        reason,
        productCandidateCount: fallback?.candidateCount || 0,
        latestCheckedDays: fallback?.checkedDays || [],
      });
      return null;
    }
    const priceGoWarnings = [
      ...warnings,
      'KAMIS 농축수산물 가격에서 강한 매칭을 찾지 못해 한국소비자원 참가격 생필품 가격으로 보조 조회했습니다.',
      ...(fallback.warnings || []),
    ];
    const summary = buildPriceGoSummary({ requestId, item, region, market, fallback, warnings: priceGoWarnings, reason });
    return {
      ok: true,
      code: 'price_found_price_go_kr',
      requestId,
      serverVersion: KAMIS_GROCERY_API_VERSION,
      checkedAt: new Date().toISOString(),
      item,
      region,
      market: 'retail',
      matchedItem: fallback.matchedItem,
      candidates: fallback.candidates.slice(0, 5),
      count: fallback.results.length,
      summary,
      results: fallback.results.slice(0, 40),
      warnings: [...new Set(priceGoWarnings)].slice(0, 8),
      source: PRICE_GO_SOURCE_LABEL,
      sourceTag: PRICE_GO_SOURCE_TAG,
      sourceLabel: PRICE_GO_SOURCE_LABEL,
    };
  } catch (error) {
    const message = normalizePriceGoErrorMessage(error);
    console.log('[PRICE_GO grocery fallback failed]', {
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      region,
      reason,
      message,
      rawMessage: error?.message || String(error),
    });
    warnings.push(message);
    return null;
  }
}

async function fetchPriceGoFallback({ apiKey, requestId, item, region }) {
  const checkedDays = buildPriceGoInspectDays(8);
  const productPayload = await fetchPriceGoPayload({ apiKey, endpoint: 'getProductInfoSvc.do', requestId, preferRows: true });
  const productRows = normalizePriceGoProducts(productPayload);
  const productCandidates = findPriceGoProductCandidates(productRows, item);

  if (productCandidates.length) {
    const candidateResult = await fetchPriceGoPricesForCandidates({
      apiKey,
      requestId,
      item,
      region,
      productCandidates,
      checkedDays,
    });
    if (candidateResult.results.length) return candidateResult;
  }

  const directResult = await fetchPriceGoPricesBySearch({
    apiKey,
    requestId,
    item,
    region,
    checkedDays,
  });

  if (directResult.results.length) return directResult;

  return {
    results: [],
    candidates: productCandidates.slice(0, PRICE_GO_MAX_PRODUCT_CANDIDATES).map(publicPriceGoCandidate),
    candidateCount: productCandidates.length || directResult.candidateCount || 0,
    checkedDays,
    warnings: directResult.warnings || [],
  };
}

async function fetchPriceGoPricesForCandidates({ apiKey, requestId, item, region, productCandidates, checkedDays }) {
  const selectedCandidates = productCandidates.slice(0, PRICE_GO_MAX_PRODUCT_CANDIDATES);
  const candidateIds = new Set(selectedCandidates.map((candidate) => candidate.goodId).filter(Boolean));
  let priceRows = [];
  let usedDay = '';

  for (const day of checkedDays) {
    const payload = await fetchPriceGoPayload({
      apiKey,
      endpoint: 'getProductPriceInfoSvc.do',
      requestId,
      extraParams: { goodInspectDay: day },
      preferRows: true,
    });
    const normalized = normalizePriceGoPriceRows(payload, selectedCandidates)
      .filter((row) => candidateIds.has(row.productNo));
    if (normalized.length) {
      priceRows = normalized;
      usedDay = day;
      break;
    }
  }

  if (!priceRows.length) {
    return {
      results: [],
      candidates: selectedCandidates.map(publicPriceGoCandidate),
      candidateCount: productCandidates.length,
      checkedDays,
      warnings: [],
    };
  }

  return buildPriceGoResultFromRows({
    requestId,
    item,
    region,
    priceRows,
    candidates: selectedCandidates,
    checkedDays,
    usedDay,
    candidateCount: productCandidates.length,
    matchMode: 'product-info-candidate',
  });
}

async function fetchPriceGoPricesBySearch({ apiKey, requestId, item, region, checkedDays }) {
  let priceRows = [];
  let usedDay = '';
  let rawRowCount = 0;

  for (const day of checkedDays) {
    const payload = await fetchPriceGoPayload({
      apiKey,
      endpoint: 'getProductPriceInfoSvc.do',
      requestId,
      extraParams: { goodInspectDay: day },
      preferRows: true,
    });
    const normalized = normalizePriceGoPriceRows(payload, [])
      .map((row) => ({ ...row, _matchScore: scorePriceGoProduct(candidateFromPriceGoResult(row), item) }))
      .filter((row) => row._matchScore >= PRICE_GO_MIN_MATCH_SCORE);
    rawRowCount = Math.max(rawRowCount, payload?.data?.length || 0);
    if (normalized.length) {
      priceRows = normalized;
      usedDay = day;
      break;
    }
  }

  if (!priceRows.length) {
    console.log('[PRICE_GO grocery direct price search empty]', {
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      region,
      checkedDays,
      rawRowCount,
    });
    return { results: [], candidates: [], candidateCount: 0, checkedDays, warnings: [] };
  }

  const candidates = buildPriceGoCandidatesFromPriceRows(priceRows, item);
  return buildPriceGoResultFromRows({
    requestId,
    item,
    region,
    priceRows,
    candidates,
    checkedDays,
    usedDay,
    candidateCount: candidates.length,
    matchMode: 'direct-price-row-search',
  });
}

function buildPriceGoResultFromRows({ requestId, item, region, priceRows, candidates, checkedDays, usedDay, candidateCount, matchMode }) {
  const warnings = [];
  let scopedRows = filterPriceGoRowsByRegion(priceRows, region);
  if (region !== '전국' && !scopedRows.length) {
    scopedRows = priceRows;
    warnings.push(`${region} 지역 참가격 판매점 자료가 충분하지 않아 전국 판매점 기준으로 표시했습니다.`);
  }

  const aggregateRows = buildPriceGoAggregateRows(scopedRows, candidates, region, usedDay);
  const storeRows = scopedRows
    .sort((a, b) => a.price - b.price || normalizeText(a.region).localeCompare(normalizeText(b.region), 'ko'))
    .slice(0, 24);
  const results = [...aggregateRows, ...storeRows];
  const primary = aggregateRows[0] || storeRows[0];

  console.log('[PRICE_GO grocery fallback match]', {
    requestId,
    version: KAMIS_GROCERY_API_VERSION,
    item,
    region,
    matchMode,
    productCandidateCount: candidateCount,
    selectedCandidates: candidates.map((candidate) => ({ goodId: candidate.goodId, goodName: candidate.goodName, score: candidate.score })).slice(0, 8),
    checkedDays,
    usedDay,
    priceRowCount: priceRows.length,
    scopedRowCount: scopedRows.length,
    firstResult: primary ? { productNo: primary.productNo, itemName: primary.itemName, price: primary.price, unit: primary.unit, region: primary.region } : null,
  });

  return {
    results,
    candidates: candidates.map(publicPriceGoCandidate),
    matchedItem: primary ? publicPriceGoCandidate(candidateFromPriceGoResult(primary)) : publicPriceGoCandidate(candidates[0]),
    candidateCount,
    checkedDays,
    usedDay,
    warnings,
  };
}

function buildPriceGoCandidatesFromPriceRows(rows, query) {
  const byProduct = new Map();
  for (const row of rows) {
    if (!row.productNo && !row.itemName) continue;
    const key = row.productNo || normalizeText(row.itemName);
    const existing = byProduct.get(key);
    const candidate = candidateFromPriceGoResult(row);
    candidate.score = Math.max(scorePriceGoProduct(candidate, query), existing?.score || 0);
    candidate.matchLabel = buildPriceGoMatchLabel(candidate);
    if (!existing || candidate.score > existing.score) byProduct.set(key, candidate);
  }
  return [...byProduct.values()]
    .filter((candidate) => candidate.score >= PRICE_GO_MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score || normalizeText(a.goodName).localeCompare(normalizeText(b.goodName), 'ko'))
    .slice(0, PRICE_GO_MAX_PRODUCT_CANDIDATES);
}

async function fetchPriceGoPayload({ apiKey, endpoint, requestId, extraParams = {}, preferRows = false }) {
  const attempts = [];
  let lastError = null;
  let lastPayload = null;
  let lastEmptyPayload = null;

  for (const baseEndpoint of PRICE_GO_ENDPOINTS) {
    for (const keyParamName of PRICE_GO_KEY_PARAM_NAMES) {
      const url = new URL(`${baseEndpoint}/${endpoint}`);
      url.searchParams.set(keyParamName, apiKey);
      for (const [key, value] of Object.entries(extraParams || {})) {
        if (isPresentValue(value)) url.searchParams.set(key, value);
      }

      const attemptMeta = {
        requestId,
        version: KAMIS_GROCERY_API_VERSION,
        endpoint,
        protocol: url.protocol.replace(':', ''),
        host: url.host,
        path: url.pathname,
        keyParamName,
        params: maskPriceGoParams(url.searchParams),
      };

      try {
        const response = await fetch(url.toString(), {
          headers: {
            accept: 'application/xml,text/xml,text/plain,*/*',
            'cache-control': 'no-cache',
            'user-agent': 'hannuncheck-pricego-fallback/1.1',
          },
          cf: { cacheTtl: 0, cacheEverything: false },
        });
        const text = await response.text();
        const contentType = response.headers.get('content-type') || '';
        attempts.push({ ...attemptMeta, status: response.status, ok: response.ok, contentType, preview: previewText(text) });

        if (!response.ok) {
          console.log('[PRICE_GO grocery fetch status]', { ...attemptMeta, status: response.status, contentType, preview: previewText(text) });
          lastError = createPriceGoFetchError(response.status, text, attemptMeta);
          if (PRICE_GO_HTTPS_ERROR_STATUSES.has(response.status) && url.protocol === 'https:') continue;
          continue;
        }

        const payload = parsePriceGoXml(text);
        const condition = readPriceGoCondition(payload);
        const rowCount = payload?.data?.length || 0;
        lastPayload = payload;

        console.log('[PRICE_GO grocery fetch ok]', {
          requestId,
          version: KAMIS_GROCERY_API_VERSION,
          endpoint,
          protocol: attemptMeta.protocol,
          host: attemptMeta.host,
          keyParamName,
          status: response.status,
          condition,
          rowCount,
          xmlShape: payload?._xmlShape || null,
        });

        if (condition.code && condition.code !== '00') {
          console.log('[PRICE_GO grocery condition]', { requestId, version: KAMIS_GROCERY_API_VERSION, endpoint, protocol: attemptMeta.protocol, keyParamName, condition });
          lastError = new Error(`참가격 API 응답 오류: ${condition.code} ${condition.message || ''}`.trim());
          if (/auth|key|인증|service|승인|denied|register/i.test(condition.message || condition.code)) continue;
          continue;
        }

        if (!preferRows || rowCount > 0) return payload;

        lastEmptyPayload = payload;
        // The endpoint responded but returned only resultCode/resultMsg or no item rows.
        // Try the next documented path/key variant before deciding that the data is empty.
      } catch (error) {
        lastError = error;
        attempts.push({ ...attemptMeta, error: error?.message || String(error) });
        console.log('[PRICE_GO grocery fetch error]', { ...attemptMeta, message: error?.message || String(error) });
      }
    }
  }

  if (lastEmptyPayload) return lastEmptyPayload;
  if (lastPayload) return lastPayload;

  const detail = attempts.map((attempt) => {
    if (attempt.status) return `${attempt.protocol}:${attempt.status}:${attempt.keyParamName || 'key'}`;
    if (attempt.error) return `${attempt.protocol}:error:${attempt.keyParamName || 'key'}`;
    return `${attempt.protocol}:unknown:${attempt.keyParamName || 'key'}`;
  }).join(', ');
  const error = new Error(`${normalizePriceGoErrorMessage(lastError)} 시도 결과: ${detail}`);
  error.attempts = attempts;
  throw error;
}

function createPriceGoFetchError(status, text, meta) {
  const preview = previewText(text);
  if (PRICE_GO_HTTPS_ERROR_STATUSES.has(status) && meta?.protocol === 'https') {
    return new Error(`참가격 API HTTPS 연결 오류가 발생했습니다. (${status})`);
  }
  return new Error(`참가격 API 응답 오류가 발생했습니다. (${status})${preview ? ` - ${preview}` : ''}`);
}

function normalizePriceGoErrorMessage(error) {
  const raw = error?.message || String(error || '');
  if (/\b526\b/.test(raw) || /HTTPS 연결 오류/.test(raw)) {
    return '한국소비자원 참가격 API HTTPS 연결 오류가 발생했습니다. HTTP 대체 경로까지 확인했지만 응답을 받지 못했습니다.';
  }
  if (/인증키|활용신청|ServiceKey|SERVICE_KEY|key/i.test(raw)) {
    return '한국소비자원 참가격 API 인증키 또는 활용신청 반영 상태를 확인해 주세요.';
  }
  if (/fetch failed|network|timeout|TLS|SSL/i.test(raw)) {
    return '한국소비자원 참가격 API 연결 중 네트워크 또는 SSL 오류가 발생했습니다.';
  }
  return raw || '한국소비자원 참가격 API 보조 조회 중 오류가 발생했습니다.';
}

function buildUnsupportedPriceGoMessage({ item, priceGoKey, warnings = [] }) {
  if (!priceGoKey) {
    return `'${item}'은 현재 연결된 KAMIS 가격 목록에서 강하게 매칭되지 않았습니다. 생필품 가격까지 확인하려면 PRICE_GO_KR_API_KEY 설정을 확인해 주세요.`;
  }
  if (hasPriceGoConnectionWarning(warnings)) {
    return `'${item}'은 KAMIS 농축수산물 가격 목록에서 찾지 못했고, 참가격 생필품 API 연결 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.`;
  }
  return `'${item}'은 KAMIS 농축수산물 가격 목록과 참가격 생필품 목록에서 현재 가격정보를 확인하지 못했습니다. 품목명을 조금 다르게 입력해 보세요.`;
}

function buildNoRecentPriceGoMessage({ item, baseMessage, warnings = [] }) {
  if (hasPriceGoConnectionWarning(warnings)) {
    return `${baseMessage} 또한 참가격 생필품 API 연결 중 오류가 발생해 보조 가격을 확인하지 못했습니다.`;
  }
  return `${baseMessage} 참가격 생필품 보조 조회에서도 현재 조건의 가격정보를 확인하지 못했습니다.`;
}

function hasPriceGoConnectionWarning(warnings = []) {
  return warnings.some((warning) => /참가격 API.*(오류|연결|HTTPS|SSL|네트워크|응답)/.test(String(warning || '')));
}

function previewText(text, maxLength = 180) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function maskPriceGoParams(searchParams) {
  const masked = {};
  for (const [key, value] of searchParams.entries()) {
    masked[key] = /servicekey/i.test(key) ? maskSecret(value) : value;
  }
  return masked;
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '****';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function parsePriceGoXml(text) {
  const source = String(text || '');
  const rows = extractPriceGoRowsFromXml(source);
  const root = parseXmlFlatObject(source);
  return {
    data: rows,
    resultCode: root.resultCode || root.resultcode || '',
    resultMsg: root.resultMsg || root.resultmsg || root.resultMessage || '',
    _priceGoFormat: 'xml',
    _xmlShape: {
      itemBlockCount: allXmlBlocks(source, 'item').length,
      rowBlockCount: allXmlBlocks(source, 'row').length,
      rowCount: rows.length,
      previewTags: extractXmlTagNames(source).slice(0, 80),
      sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 40) : [],
    },
  };
}

function extractPriceGoRowsFromXml(source) {
  const rows = [];
  const seen = new Set();
  const tagNames = extractXmlTagNames(source);
  const preferredTags = ['item', 'row', 'data', 'list'];
  const skipTags = new Set(['response', 'header', 'body', 'items', 'rows', 'result', 'resultCode', 'resultMsg']);
  const candidates = [...new Set([...preferredTags, ...tagNames])];

  for (const tag of candidates) {
    if (!tag || skipTags.has(tag)) continue;
    for (const block of allXmlBlocks(source, tag)) {
      const row = parseXmlFlatObject(block);
      if (!isPotentialPriceGoRow(row)) continue;
      const signature = JSON.stringify(Object.keys(row).sort().map((key) => [key, row[key]]));
      if (seen.has(signature)) continue;
      seen.add(signature);
      rows.push(row);
    }
  }
  return rows;
}

function isPotentialPriceGoRow(row) {
  return Boolean(firstValue(row, ['goodId', 'goodName', 'goodPrice', 'goodInspectDay', 'entpId', 'entpName', 'goodSmlclsCode']));
}

function readPriceGoCondition(payload) {
  const code = clean(payload?.resultCode || firstValue(payload?.data?.[0], ['resultCode']), 10);
  const message = clean(payload?.resultMsg || firstValue(payload?.data?.[0], ['resultMsg']), 120);
  return { code, message };
}

function normalizePriceGoProducts(payload) {
  return (payload?.data || [])
    .map((row) => {
      const goodId = clean(firstValue(row, ['goodId', 'GOOD_ID', '상품아이디']), 30);
      const goodName = clean(firstValue(row, ['goodName', 'GOOD_NAME', '상품명']), 120);
      const detail = clean(firstValue(row, ['detailMean', 'DETAIL_MEAN', '상품설명상세']), 200);
      const categoryCode = clean(firstValue(row, ['goodSmlclsCode', 'GOOD_SMLCLS_CODE', '상품소분류코드']), 30);
      const unit = buildPriceGoUnit(row);
      const makerCode = clean(firstValue(row, ['productEntpCode', 'PRODUCT_ENTP_CODE', '제조업체코드']), 30);
      return {
        goodId,
        goodName,
        detail,
        categoryCode,
        itemCategoryName: '생필품',
        unit,
        makerCode,
        normalizedTokens: buildPriceGoTokens({ goodName, detail, unit }),
        source: 'priceGoProductInfo',
      };
    })
    .filter((row) => row.goodId && row.goodName);
}

function buildPriceGoUnit(row) {
  const baseCnt = clean(firstValue(row, ['goodBaseCnt', 'GOOD_BASE_CNT', '상품단위량']), 20);
  const baseCode = clean(firstValue(row, ['goodUnitDivCode', 'GOOD_UNIT_DIV_CODE', '상품단위구분코드']), 20);
  const totalCnt = clean(firstValue(row, ['goodTotalCnt', 'GOOD_TOTAL_CNT', '상품용량']), 20);
  const totalCode = clean(firstValue(row, ['goodTotalDivCode', 'GOOD_TOTAL_DIV_CODE', '상품용량구분코드']), 20);
  const unit = [totalCnt, normalizePriceGoUnitCode(totalCode)].filter(Boolean).join('') || [baseCnt, normalizePriceGoUnitCode(baseCode)].filter(Boolean).join('');
  return unit || '상품 단위';
}

function normalizePriceGoUnitCode(value) {
  const text = clean(value, 20).toUpperCase();
  const map = { G: 'g', KG: 'kg', ML: 'ml', L: 'L', EA: '개', M: 'm' };
  return map[text] || text;
}

function findPriceGoProductCandidates(products, query) {
  return products
    .map((product) => ({ ...product, score: scorePriceGoProduct(product, query), matchLabel: buildPriceGoMatchLabel(product) }))
    .filter((product) => product.score >= PRICE_GO_MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score || normalizeText(a.goodName).localeCompare(normalizeText(b.goodName), 'ko'));
}

function scorePriceGoProduct(product, query) {
  const q = normalizeText(query);
  if (!q) return 0;
  const aliases = getItemAliases(query).map(normalizeText).filter(Boolean);
  const name = normalizeText(product.goodName);
  const detail = normalizeText(product.detail);
  const tokens = new Set([name, detail, ...(product.normalizedTokens || [])].filter(Boolean));
  let score = 0;

  if (name === q) score = Math.max(score, 170);
  if (tokens.has(q)) score = Math.max(score, 150);
  if (q.length >= 2 && name.includes(q)) score = Math.max(score, 132);
  if (q.length >= 2 && detail.includes(q)) score = Math.max(score, 112);

  for (const alias of aliases) {
    if (!alias || alias === q) continue;
    if (name === alias) score = Math.max(score, 145);
    if (tokens.has(alias)) score = Math.max(score, 125);
    if (alias.length >= 2 && name.includes(alias)) score = Math.max(score, 108);
    if (alias.length >= 2 && detail.includes(alias)) score = Math.max(score, 96);
  }

  if (product.goodId) score += 5;
  if (product.unit && product.unit !== '상품 단위') score += 2;
  return score;
}

function buildPriceGoTokens({ goodName, detail, unit }) {
  const raw = [goodName, detail, unit].filter(Boolean).join(' ');
  const chunks = raw
    .split(/[\s,()\[\]{}·ㆍ\/]+/)
    .map(normalizeText)
    .filter((token) => token.length >= 2);
  return [...new Set([normalizeText(goodName), ...chunks])];
}

function buildPriceGoMatchLabel(product) {
  return ['생필품', product.goodName, product.unit].filter(Boolean).join(' · ');
}

function normalizePriceGoPriceRows(payload, candidates) {
  const productMap = new Map(candidates.map((candidate) => [candidate.goodId, candidate]));
  return (payload?.data || [])
    .map((row) => {
      const goodId = clean(firstValue(row, ['goodId', 'GOOD_ID', '상품아이디']), 30);
      const product = productMap.get(goodId);
      const goodName = clean(firstValue(row, ['goodName', 'GOOD_NAME', '상품명']) || product?.goodName || '', 120);
      const priceRaw = firstValue(row, ['goodPrice', 'GOOD_PRICE', 'price', '가격', '판매가격']);
      const price = parsePrice(priceRaw);
      const inspectDay = clean(firstValue(row, ['goodInspectDay', 'GOOD_INSPECT_DAY', '조사일']), 20);
      const entpName = clean(firstValue(row, ['entpName', 'ENTP_NAME', '판매업소', '업체명']), 80);
      const entpId = clean(firstValue(row, ['entpId', 'ENTP_ID', '판매점아이디']), 30);
      const regionName = clean(firstValue(row, ['entpAreaName', 'areaName', 'cityName', 'regionName', 'ENTP_AREA_NAME', '지역명']), 40);
      const saleYn = clean(firstValue(row, ['plusoneYn', 'PLUSONE_YN', 'saleYn', 'SALE_YN', '세일여부', '원플러스원']), 20);
      return {
        id: ['priceGo', goodId, entpId, inspectDay, price].join('-'),
        sourceApi: 'priceGoProductPriceInfo',
        dataSource: 'price.go.kr',
        marketType: 'retail',
        marketLabel: '생필품 가격',
        region: regionName || '전국',
        categoryCode: product?.categoryCode || '',
        categoryLabel: '생필품',
        productNo: goodId,
        itemName: goodName,
        productName: goodName,
        itemCode: goodId,
        kindName: entpName || '판매점 가격',
        kindCode: entpId,
        rank: saleYn ? `행사정보 ${saleYn}` : '',
        unit: product?.unit || '상품 단위',
        day: formatInspectDay(inspectDay),
        price,
        priceText: formatPrice(price, priceRaw),
        oneDayAgo: null,
        weekAgo: null,
        monthAgo: null,
        yearAgo: null,
        average: null,
        weekChange: buildChange(null, null),
        monthChange: buildChange(null, null),
        yearChange: buildChange(null, null),
        raw: row,
      };
    })
    .filter(hasUsablePriceRow);
}

function filterPriceGoRowsByRegion(rows, region) {
  if (region === '전국') return rows;
  const targets = getPriceGoRegionAliases(region);
  if (!targets.length) return rows;
  return rows.filter((row) => targets.some((target) => normalizeText(row.region).includes(normalizeText(target))));
}

function getPriceGoRegionAliases(region) {
  const map = {
    서울: ['서울', '서울특별시'], 부산: ['부산', '부산광역시'], 대구: ['대구', '대구광역시'], 인천: ['인천', '인천광역시'],
    광주: ['광주', '광주광역시'], 대전: ['대전', '대전광역시'], 울산: ['울산', '울산광역시'], 세종: ['세종', '세종특별자치시'],
    경기: ['경기', '경기도'], 강원: ['강원', '강원특별자치도', '강원도'], 충북: ['충북', '충청북도'], 충남: ['충남', '충청남도'],
    전북: ['전북', '전라북도', '전북특별자치도'], 전남: ['전남', '전라남도'], 경북: ['경북', '경상북도'], 경남: ['경남', '경상남도'], 제주: ['제주', '제주특별자치도'],
  };
  return map[region] || [];
}

function buildPriceGoAggregateRows(rows, candidates, region, usedDay) {
  const byProduct = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.price)) continue;
    const group = byProduct.get(row.productNo) || [];
    group.push(row);
    byProduct.set(row.productNo, group);
  }
  const candidateMap = new Map(candidates.map((candidate) => [candidate.goodId, candidate]));
  return [...byProduct.entries()].map(([goodId, group]) => {
    const product = candidateMap.get(goodId);
    const prices = group.map((row) => row.price).filter(Number.isFinite);
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const representative = group[0];
    return {
      ...representative,
      id: ['priceGoAverage', goodId, usedDay, region].join('-'),
      sourceApi: 'priceGoAverage',
      region: region === '전국' ? '전국' : `${region} 또는 전국 판매점`,
      kindName: `${group.length}개 판매점 평균`,
      rank: `최저 ${formatPrice(min)} · 최고 ${formatPrice(max)}`,
      price: Math.round(average),
      priceText: formatPrice(Math.round(average)),
      average: Math.round(average),
      productName: product?.goodName || representative.productName,
      itemName: product?.goodName || representative.itemName,
      raw: { rows: group.map((row) => row.raw), min, max, count: group.length },
    };
  }).sort((a, b) => a.price - b.price);
}

function candidateFromPriceGoResult(row) {
  return {
    goodId: row?.productNo || '',
    goodName: row?.itemName || row?.productName || '',
    unit: row?.unit || '',
    categoryCode: row?.categoryCode || '',
    score: 0,
    matchLabel: ['생필품', row?.itemName || row?.productName, row?.unit].filter(Boolean).join(' · '),
  };
}

function publicPriceGoCandidate(candidate) {
  if (!candidate) return null;
  return {
    productNo: candidate.goodId || '',
    itemCategoryCode: candidate.categoryCode || '',
    itemCategoryName: '생필품',
    itemCode: candidate.goodId || '',
    itemName: candidate.goodName || '',
    kindCode: '',
    kindName: '',
    retailRankCode: '',
    wholesaleRankCode: '',
    displayName: candidate.goodName || '',
    label: candidate.goodName || '',
    marketTypes: ['retail'],
    score: candidate.score || 0,
    matchLabel: candidate.matchLabel || buildPriceGoMatchLabel(candidate),
  };
}

function buildPriceGoSummary({ requestId, item, region, market, fallback, warnings, reason }) {
  const first = fallback.results[0];
  return {
    tone: 'normal',
    title: `${first.itemName || item} 참가격 기준`,
    message: `${first.day || fallback.usedDay || '최근 조사일'} 기준 한국소비자원 참가격 생필품 판매가격입니다. 판매점·행사 여부에 따라 실제 가격과 차이가 있을 수 있습니다.`,
    primaryPrice: first.priceText,
    unit: first.unit,
    day: first.day,
    representative: first,
    warning: warnings[0] || '',
    resolution: `price_go_fallback:${reason || 'kamis_no_match'}`,
    requestId,
    version: KAMIS_GROCERY_API_VERSION,
    item,
    region,
    market,
  };
}

function buildPriceGoInspectDays(count = 8) {
  const seoulNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  seoulNow.setUTCHours(0, 0, 0, 0);
  const day = seoulNow.getUTCDay();
  const daysBack = (day - 5 + 7) % 7;
  const latestFriday = new Date(seoulNow.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(latestFriday.getTime() - index * 7 * 24 * 60 * 60 * 1000);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  });
}

function formatInspectDay(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return clean(value, 20) || '최근 조사일';
}

async function safeFetchProductInfo({ certKey, certId, requestId }) {
  try {
    return await fetchKamisPayloadWithFallback({ certKey, certId, action: ACTIONS.productInfo, requestId });
  } catch (error) {
    console.log('[KAMIS grocery productInfo failed]', { requestId, version: KAMIS_GROCERY_API_VERSION, message: error?.message || String(error) });
    return null;
  }
}

async function safeFetchPeriodPriceRows({ certKey, certId, requestId, region, marketType, candidate, regday }) {
  try {
    const marketInfo = MARKET_TYPES[marketType] || MARKET_TYPES.retail;
    const countryCode = resolveCountryCode(region, marketType);
    const { startday, endday } = buildRecentDateRange(regday);
    const params = {
      p_startday: startday,
      p_endday: endday,
      p_itemcategorycode: candidate.itemCategoryCode,
      p_itemcode: candidate.itemCode,
      p_kindcode: candidate.kindCode,
      p_productrankcode: candidate.rankCodeForMarket?.[marketType] || candidate.rankCode || '',
      p_countrycode: countryCode,
      p_convert_kg_yn: 'N',
    };
    const payload = await fetchKamisPayloadWithFallback({ certKey, certId, action: marketInfo.periodAction, requestId, extraParams: params });
    const rows = extractRows(payload)
      .map((row) => normalizePeriodRow(row, { marketType, marketLabel: marketInfo.label, region, candidate }))
      .filter(hasUsablePriceRow);
    rows.sort((a, b) => normalizeDateNumber(b.day) - normalizeDateNumber(a.day));
    return rows;
  } catch (error) {
    console.log('[KAMIS grocery period fallback failed]', { requestId, version: KAMIS_GROCERY_API_VERSION, item: candidate.displayName, marketType, region, message: error?.message || String(error) });
    return [];
  }
}

async function safeFetchCategoryFallbackRows({ certKey, certId, requestId, region, marketTypes, candidates, item, regday }) {
  const rows = [];
  const categories = [...new Set(candidates.map((candidate) => candidate.itemCategoryCode).filter(Boolean))].slice(0, 3);
  if (!categories.length) return rows;
  for (const marketType of marketTypes) {
    for (const category of categories) {
      try {
        const marketInfo = MARKET_TYPES[marketType] || MARKET_TYPES.retail;
        const payload = await fetchKamisPayloadWithFallback({
          certKey,
          certId,
          action: ACTIONS.categoryDaily,
          requestId,
          extraParams: {
            p_product_cls_code: marketInfo.code,
            p_item_category_code: category,
            p_country_code: resolveCountryCode(region, marketType),
            p_convert_kg_yn: 'N',
            ...(regday ? { p_regday: regday } : {}),
          },
        });
        const normalizedRows = extractRows(payload)
          .map((row) => normalizeCategoryRow(row, { marketType, marketLabel: marketInfo.label, region, category }))
          .filter((row) => isItemMatch(row, item))
          .filter(hasUsablePriceRow);
        rows.push(...normalizedRows);
      } catch (error) {
        console.log('[KAMIS grocery category fallback failed]', { requestId, version: KAMIS_GROCERY_API_VERSION, category, marketType, message: error?.message || String(error) });
      }
    }
  }
  return rows;
}

async function safeFetchTrend({ certKey, certId, requestId, productNo, regday }) {
  try {
    const extraParams = { p_productno: productNo };
    if (regday) extraParams.p_regday = regday;
    const payload = await fetchKamisPayloadWithFallback({ certKey, certId, action: ACTIONS.priceTrend, requestId, extraParams });
    const row = extractRows(payload).map(normalizeTrendRow).find((entry) => entry.points.length);
    return row || null;
  } catch (error) {
    console.log('[KAMIS grocery trend failed]', { requestId, version: KAMIS_GROCERY_API_VERSION, productNo, message: error?.message || String(error) });
    return null;
  }
}

async function fetchKamisPayloadWithFallback({ certKey, certId, action, requestId, extraParams = {} }) {
  const jsonPayload = await fetchKamisPayload({ certKey, certId, action, returnType: 'json', extraParams });
  const jsonRows = extractRows(jsonPayload);
  if (jsonRows.length) return jsonPayload;

  console.log('[KAMIS grocery empty json response]', {
    requestId,
    version: KAMIS_GROCERY_API_VERSION,
    action,
    topLevelKeys: jsonPayload && typeof jsonPayload === 'object' ? Object.keys(jsonPayload).slice(0, 20) : [],
    dataShape: describeShape(jsonPayload?.data),
    priceShape: describeShape(jsonPayload?.price),
    condition: readCondition(jsonPayload),
  });

  const xmlPayload = await fetchKamisPayload({ certKey, certId, action, returnType: 'xml', extraParams });
  const xmlRows = extractRows(xmlPayload);
  return xmlRows.length ? xmlPayload : jsonPayload;
}

async function fetchKamisPayload({ certKey, certId, action, returnType = 'json', extraParams = {} }) {
  const url = new URL(KAMIS_BASE_ENDPOINT);
  url.searchParams.set('action', action);
  url.searchParams.set('p_cert_key', certKey);
  url.searchParams.set('p_cert_id', certId);
  url.searchParams.set('p_returntype', returnType);
  for (const [key, value] of Object.entries(extraParams || {})) {
    if (isPresentValue(value)) url.searchParams.set(key, value);
  }
  return returnType === 'xml' ? fetchKamisXml(url.toString()) : fetchKamisJson(url.toString());
}

async function fetchKamisJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json,text/plain,*/*', 'cache-control': 'no-cache' }, cf: { cacheTtl: 0, cacheEverything: false } });
  const text = await response.text();
  if (!response.ok) throw new Error(`KAMIS API 응답 오류가 발생했습니다. (${response.status})`);
  try {
    if (!text) return { _kamisFormat: 'json' };
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { data: parsed, _kamisFormat: 'json' };
    if (parsed && typeof parsed === 'object') return { ...parsed, _kamisFormat: 'json' };
    return { data: parsed, _kamisFormat: 'json' };
  } catch {
    if (text.includes('<OpenAPI_ServiceResponse>') || text.includes('Unauthenticated')) {
      throw new Error('KAMIS 인증 정보 또는 요청 파라미터를 확인해 주세요.');
    }
    throw new Error('KAMIS JSON 응답을 해석하지 못했습니다.');
  }
}

async function fetchKamisXml(url) {
  const response = await fetch(url, { headers: { accept: 'application/xml,text/xml,text/plain,*/*', 'cache-control': 'no-cache' }, cf: { cacheTtl: 0, cacheEverything: false } });
  const text = await response.text();
  if (!response.ok) throw new Error(`KAMIS API XML 응답 오류가 발생했습니다. (${response.status})`);
  if (text.includes('Unauthenticated')) throw new Error('KAMIS 인증 정보 또는 요청 파라미터를 확인해 주세요.');
  return parseKamisXml(text);
}

function parseKamisXml(text) {
  const source = String(text || '');
  const priceBlock = firstXmlBlock(source, 'price');
  const dataBlock = firstXmlBlock(source, 'data');
  const rowBlocks = [
    ...allXmlBlocks(priceBlock || source, 'item'),
    ...allXmlBlocks(priceBlock || source, 'row'),
    ...allXmlBlocks(dataBlock || '', 'item'),
    ...allXmlBlocks(dataBlock || '', 'row'),
  ];
  let rows = rowBlocks.map(parseXmlFlatObject).filter((row) => Object.keys(row).length);

  if (!rows.length) {
    rows = allXmlBlocks(source, 'item')
      .map(parseXmlFlatObject)
      .filter((row) => Object.keys(row).length && isPotentialDataRow(row));
  }
  if (!rows.length) {
    rows = allXmlBlocks(source, 'data')
      .map(parseXmlFlatObject)
      .filter((row) => Object.keys(row).length && isPotentialDataRow(row));
  }

  return {
    condition: parseXmlFlatObject(firstXmlBlock(source, 'condition') || ''),
    price: rows,
    data: rows,
    _kamisFormat: 'xml',
    _xmlShape: {
      itemBlockCount: allXmlBlocks(source, 'item').length,
      rowBlockCount: allXmlBlocks(source, 'row').length,
      priceBlock: Boolean(priceBlock),
      dataBlock: Boolean(dataBlock),
      rowCount: rows.length,
      previewTags: extractXmlTagNames(source).slice(0, 60),
    },
  };
}

function normalizeDailySalesRows(payload, requestId) {
  const condition = readCondition(payload);
  if (condition.code && condition.code !== '000') {
    console.log('[KAMIS grocery dailySales condition]', { requestId, version: KAMIS_GROCERY_API_VERSION, condition });
  }
  return extractRows(payload)
    .map(normalizeDailySalesRow)
    .filter(hasItemIdentity)
    .filter((row) => row.marketType === 'retail' || row.marketType === 'wholesale');
}

function normalizeDailySalesRow(row) {
  const productClsCode = clean(firstValue(row, ['product_cls_code', 'productClsCode', 'PRODUCT_CLS_CODE', '구분']), 2);
  const marketType = productClsCode === '02' ? 'wholesale' : 'retail';
  const marketLabel = firstValue(row, ['product_cls_name', 'productClsName', 'PRODUCT_CLS_NAME']) || MARKET_TYPES[marketType].label;
  const categoryCode = clean(firstValue(row, ['category_code', 'categoryCode', 'CATEGORY_CODE', 'itemcategorycode']), 3);
  const productNo = clean(firstValue(row, ['productno', 'product_no', 'productNo', 'PRODUCTNO', '품목코드']), 30);
  const productName = clean(firstValue(row, ['productName', 'product_name', 'productname', 'PRODUCT_NAME']), 80);
  const itemName = clean(firstValue(row, ['item_name', 'itemName', 'itemname', 'ITEM_NAME']) || stripKindFromProductName(productName), 50);
  const kindName = clean(firstValue(row, ['kind_name', 'kindName', 'kindname', 'KIND_NAME']) || extractKindFromProductName(productName), 50);
  const priceRaw = firstValue(row, ['dpr1', 'DPR1', 'price', 'PRICE', '최근가격', '가격']);
  const price = parsePrice(priceRaw);
  const oneDayAgo = parsePrice(firstValue(row, ['dpr2', 'DPR2']));
  const monthAgo = parsePrice(firstValue(row, ['dpr3', 'DPR3']));
  const yearAgo = parsePrice(firstValue(row, ['dpr4', 'DPR4']));
  const monthChange = buildChange(price, monthAgo);
  const yearChange = buildChange(price, yearAgo);
  const direction = clean(firstValue(row, ['direction', 'DIRECTION']), 20);
  const rate = clean(firstValue(row, ['value', 'VALUE']), 20);
  const categoryLabel = clean(firstValue(row, ['category_name', 'categoryName', 'CATEGORY_NAME']) || CATEGORY_LABELS[categoryCode] || '기타', 40);
  const day = clean(firstValue(row, ['day1', 'DAY1', 'lastest_date', 'latest_date', 'lastestDate', '최근조사일']), 20);
  const unit = clean(firstValue(row, ['unit', 'UNIT', '단위']), 30);

  return {
    id: ['dailySales', marketType, productNo, categoryCode, productName, unit, day].join('-'),
    sourceApi: 'dailySalesList',
    marketType,
    marketLabel: clean(marketLabel, 20),
    region: '전국',
    categoryCode,
    categoryLabel,
    productNo,
    itemName,
    productName,
    itemCode: productNo,
    kindName,
    kindCode: '',
    rank: '',
    unit,
    day,
    price,
    priceText: formatPrice(price, priceRaw),
    oneDayAgo,
    weekAgo: oneDayAgo,
    monthAgo,
    yearAgo,
    average: null,
    weekChange: buildDirectionChange(direction, rate, price, oneDayAgo),
    monthChange,
    yearChange,
    raw: row,
  };
}

function normalizeProductCatalogRows(payload) {
  return extractRows(payload)
    .map((row) => {
      const itemCategoryCode = clean(firstValue(row, ['itemcategorycode', 'item_category_code', 'itemCategoryCode', 'category_code']), 3);
      const itemCategoryName = clean(firstValue(row, ['itemcategoryname', 'item_category_name', 'itemCategoryName', 'category_name']) || CATEGORY_LABELS[itemCategoryCode] || '', 40);
      const itemCode = clean(firstValue(row, ['itemcode', 'item_code', 'itemCode']), 20);
      const itemName = clean(firstValue(row, ['itemname', 'item_name', 'itemName']), 50);
      const kindCode = clean(firstValue(row, ['kindcode', 'kind_code', 'kindCode']), 20);
      const kindName = clean(firstValue(row, ['kindname', 'kind_name', 'kindName']), 50);
      const retailRankCode = clean(firstValue(row, ['retail_productrankcode', 'retailProductrankcode', 'retail_rank_code', 'retailRankCode']), 20);
      const wholesaleRankCode = clean(firstValue(row, ['whole_productrankcode', 'wholesale_productrankcode', 'wholeProductrankcode', 'whole_rank_code', 'wholesaleRankCode']), 20);
      const retailUnit = clean(firstValue(row, ['retail_unit', 'retailUnit']), 30);
      const wholesaleUnit = clean(firstValue(row, ['wholesale_unit', 'wholesaleUnit']), 30);
      return {
        source: 'productInfo',
        itemCategoryCode,
        itemCategoryName,
        itemCode,
        itemName,
        kindCode,
        kindName,
        rankCodeForMarket: { retail: retailRankCode, wholesale: wholesaleRankCode },
        retailUnit,
        wholesaleUnit,
        displayName: buildDisplayName(itemName, kindName),
        normalizedTokens: buildSearchTokens({ itemName, kindName, productName: buildDisplayName(itemName, kindName) }),
      };
    })
    .filter((row) => row.itemName && row.itemCode);
}

function normalizePeriodRow(row, { marketType, marketLabel, region, candidate }) {
  const priceRaw = firstValue(row, ['price', 'PRICE', '가격', 'dpr1', 'DPR1']);
  const price = parsePrice(priceRaw);
  const day = clean(firstValue(row, ['regday', 'REGDAY', 'date', '날짜', 'day1', 'DAY1']), 20);
  const countyName = clean(firstValue(row, ['countyname', 'county_name', 'countyName', '시군구']), 30);
  const marketName = clean(firstValue(row, ['marketname', 'market_name', 'marketName', '마켓명']), 40);
  const unit = marketType === 'retail' ? candidate.retailUnit : candidate.wholesaleUnit;
  return {
    id: ['period', marketType, candidate.itemCategoryCode, candidate.itemCode, candidate.kindCode, candidate.rankCodeForMarket?.[marketType], region, countyName, marketName, day].join('-'),
    sourceApi: marketType === 'retail' ? ACTIONS.retailPeriod : ACTIONS.wholesalePeriod,
    marketType,
    marketLabel,
    region: [region, countyName, marketName].filter(Boolean).join(' · ') || region,
    categoryCode: candidate.itemCategoryCode,
    categoryLabel: candidate.itemCategoryName || CATEGORY_LABELS[candidate.itemCategoryCode] || '기타',
    productNo: candidate.productNo || '',
    itemName: clean(firstValue(row, ['itemname', 'item_name', 'itemName']) || candidate.itemName, 50),
    productName: candidate.displayName,
    itemCode: candidate.itemCode,
    kindName: clean(firstValue(row, ['kindname', 'kind_name', 'kindName']) || candidate.kindName, 50),
    kindCode: candidate.kindCode,
    rank: '',
    unit,
    day,
    price,
    priceText: formatPrice(price, priceRaw),
    oneDayAgo: null,
    weekAgo: null,
    monthAgo: null,
    yearAgo: null,
    average: null,
    weekChange: buildChange(null, null),
    monthChange: buildChange(null, null),
    yearChange: buildChange(null, null),
    raw: row,
  };
}

function normalizeCategoryRow(row, meta) {
  const priceRaw = firstValue(row, PRICE_KEYS);
  const price = parsePrice(priceRaw);
  const weekAgo = parsePrice(firstValue(row, WEEK_PRICE_KEYS));
  const monthAgo = parsePrice(firstValue(row, MONTH_PRICE_KEYS));
  const yearAgo = parsePrice(firstValue(row, YEAR_PRICE_KEYS));
  const itemName = clean(firstValue(row, ITEM_NAME_KEYS), 50);
  const kindName = clean(firstValue(row, KIND_NAME_KEYS), 50);
  const itemCode = clean(firstValue(row, ITEM_CODE_KEYS), 20);
  const kindCode = clean(firstValue(row, KIND_CODE_KEYS), 20);
  const rank = clean(firstValue(row, RANK_KEYS), 20);
  const unit = clean(firstValue(row, UNIT_KEYS), 30);
  const day = clean(firstValue(row, DAY_KEYS), 20);
  return {
    id: ['category', meta.marketType, meta.category, itemCode, kindCode, rank, unit, day].join('-'),
    sourceApi: ACTIONS.categoryDaily,
    marketType: meta.marketType,
    marketLabel: meta.marketLabel,
    region: meta.region,
    categoryCode: meta.category,
    categoryLabel: CATEGORY_LABELS[meta.category] || '기타',
    productNo: '',
    itemName,
    productName: buildDisplayName(itemName, kindName),
    itemCode,
    kindName,
    kindCode,
    rank,
    unit,
    day,
    price,
    priceText: formatPrice(price, priceRaw),
    oneDayAgo: null,
    weekAgo,
    monthAgo,
    yearAgo,
    average: parsePrice(firstValue(row, AVERAGE_PRICE_KEYS)),
    weekChange: buildChange(price, weekAgo),
    monthChange: buildChange(price, monthAgo),
    yearChange: buildChange(price, yearAgo),
    raw: row,
  };
}

function normalizeTrendRow(row) {
  const points = [
    ['40일전', firstValue(row, ['d40', 'D40'])],
    ['30일전', firstValue(row, ['d30', 'D30'])],
    ['20일전', firstValue(row, ['d20', 'D20'])],
    ['10일전', firstValue(row, ['d10', 'D10'])],
    ['당일', firstValue(row, ['d0', 'D0'])],
  ].map(([label, raw]) => ({ label, price: parsePrice(raw), priceText: formatPrice(parsePrice(raw), raw) })).filter((point) => Number.isFinite(point.price));
  return {
    year: clean(firstValue(row, ['yyyy', 'YYYY', 'year']), 10),
    max: parsePrice(firstValue(row, ['mx', 'MX'])),
    min: parsePrice(firstValue(row, ['mn', 'MN'])),
    points,
    raw: row,
  };
}

function buildCodeIndex(dailyRows, productCatalogRows) {
  const map = new Map();
  for (const row of productCatalogRows) {
    const key = ['catalog', row.itemCategoryCode, row.itemCode, row.kindCode, row.displayName].join('|');
    map.set(key, { ...row, source: 'productInfo', productNo: '' });
  }
  for (const row of dailyRows) {
    const key = row.productNo ? `productno|${row.productNo}` : ['daily', row.categoryCode, row.productName, row.marketType].join('|');
    const previous = map.get(key) || {};
    map.set(key, {
      ...previous,
      source: previous.source ? `${previous.source}+dailySales` : 'dailySales',
      productNo: row.productNo || previous.productNo || '',
      itemCategoryCode: row.categoryCode || previous.itemCategoryCode || '',
      itemCategoryName: row.categoryLabel || previous.itemCategoryName || '',
      itemCode: previous.itemCode || '',
      itemName: row.itemName || previous.itemName || row.productName || '',
      kindCode: previous.kindCode || '',
      kindName: row.kindName || previous.kindName || '',
      rankCodeForMarket: previous.rankCodeForMarket || {},
      retailUnit: row.marketType === 'retail' ? row.unit : previous.retailUnit || '',
      wholesaleUnit: row.marketType === 'wholesale' ? row.unit : previous.wholesaleUnit || '',
      displayName: row.productName || previous.displayName || buildDisplayName(row.itemName, row.kindName),
      normalizedTokens: buildSearchTokens({ itemName: row.itemName, kindName: row.kindName, productName: row.productName }),
      marketTypes: [...new Set([...(previous.marketTypes || []), row.marketType])],
    });
  }
  return [...map.values()].filter((entry) => entry.itemName || entry.displayName || entry.productNo);
}

function resolveItemCandidate({ query, selectedProductNo, selectedItemCode, selectedKindCode, selectedRankCode, selectedCategoryCode, indexEntries, marketTypes }) {
  const selected = indexEntries.filter((entry) => {
    if (selectedProductNo && entry.productNo === selectedProductNo) return true;
    if (selectedItemCode && entry.itemCode === selectedItemCode) {
      if (selectedKindCode && entry.kindCode !== selectedKindCode) return false;
      if (selectedCategoryCode && entry.itemCategoryCode !== selectedCategoryCode) return false;
      return true;
    }
    return false;
  });
  if (selected.length) return { status: 'resolved', candidates: enrichCandidates(selected, query).slice(0, 8), reason: 'selected_code' };

  const scored = enrichCandidates(indexEntries, query)
    .filter((candidate) => candidate.score > 0)
    .filter((candidate) => !candidate.marketTypes?.length || candidate.marketTypes.some((type) => marketTypes.includes(type)) || candidate.source.includes('productInfo'))
    .sort((a, b) => b.score - a.score || candidatePriority(a) - candidatePriority(b));

  if (!scored.length) return { status: 'unsupported', candidates: [], reason: 'no_code_match' };

  const topScore = scored[0].score;
  if (topScore < KAMIS_MIN_RESOLVED_SCORE) {
    return { status: 'unsupported', candidates: [], reason: 'low_score_no_strong_match' };
  }
  const strong = scored.filter((candidate) => candidate.score >= Math.max(KAMIS_MIN_RESOLVED_SCORE, topScore - 15));
  const distinctNames = [...new Set(strong.map((candidate) => canonicalCandidateName(candidate)).filter(Boolean))];
  const normalizedQuery = normalizeText(query);

  if (distinctNames.length > 1 && (AMBIGUOUS_QUERY_HINTS.has(normalizedQuery) || normalizedQuery.length <= 1 || topScore < 92)) {
    return { status: 'ambiguous', candidates: uniqueCandidateChoices(strong).slice(0, 8), reason: 'multiple_item_names' };
  }

  const chosenName = canonicalCandidateName(scored[0]);
  if (topScore < KAMIS_STRONG_MATCH_SCORE && strong.length > 1) {
    return { status: 'ambiguous', candidates: uniqueCandidateChoices(strong).slice(0, 8), reason: 'weak_multiple_candidates' };
  }
  const sameItemCandidates = scored.filter((candidate) => canonicalCandidateName(candidate) === chosenName || candidate.score >= topScore + 1).slice(0, 12);
  return { status: 'resolved', candidates: sameItemCandidates, reason: 'best_match' };
}

function enrichCandidates(entries, query) {
  return entries.map((entry) => ({ ...entry, score: scoreCandidate(entry, query), matchLabel: buildMatchLabel(entry) }));
}

function scoreCandidate(entry, query) {
  const q = normalizeText(query);
  if (!q) return 0;
  const aliases = getItemAliases(query).map(normalizeText).filter(Boolean);
  const aliasOnly = aliases.filter((alias) => alias && alias !== q);
  const item = normalizeText(entry.itemName);
  const kind = normalizeText(entry.kindName);
  const display = normalizeText(entry.displayName);
  const product = normalizeText(entry.productName || entry.displayName);
  const tokens = new Set([item, kind, display, product, ...(entry.normalizedTokens || [])].filter(Boolean));
  let score = 0;

  if (display === q || product === q) score = Math.max(score, 150);
  if (item === q) score = Math.max(score, 135);
  if (kind === q) score = Math.max(score, 130);
  if (tokens.has(q)) score = Math.max(score, 115);

  if (!DANGEROUS_ONE_CHAR_QUERY.has(q) && q.length >= 2) {
    if (display.includes(q) || product.includes(q)) score = Math.max(score, 108);
    if (item.includes(q)) score = Math.max(score, 105);
    if (kind.includes(q)) score = Math.max(score, 100);
    if (q.includes(item) && item.length >= 2) score = Math.max(score, 80);
  }

  for (const alias of aliasOnly) {
    if (!alias) continue;
    if (DANGEROUS_ONE_CHAR_QUERY.has(alias)) {
      if (display === alias || product === alias) score = Math.max(score, 68);
      if (item === alias) score = Math.max(score, 64);
      if (kind === alias) score = Math.max(score, 60);
      continue;
    }
    if (display === alias || product === alias) score = Math.max(score, 90);
    if (item === alias) score = Math.max(score, 82);
    if (kind === alias) score = Math.max(score, 78);
    if (tokens.has(alias)) score = Math.max(score, 74);
    if (alias.length >= 2) {
      if (display.includes(alias) || product.includes(alias)) score = Math.max(score, 62);
      if (item.includes(alias) || kind.includes(alias)) score = Math.max(score, 58);
    }
  }

  if (entry.productNo) score += 20;
  if (entry.source?.includes('dailySales')) score += 12;
  if (entry.itemCategoryCode) score += 3;
  if (entry.retailUnit || entry.wholesaleUnit) score += 2;
  if (isDangerousFalsePositive(q, entry)) score = 0;
  return score;
}

function isDangerousFalsePositive(query, entry) {
  const item = normalizeText(entry.itemName);
  const display = normalizeText(entry.displayName);
  if (query === '배' && (item.includes('배추') || display.includes('배추'))) return true;
  if (query === '무' && (item.includes('무화과') || display.includes('무화과'))) return true;
  if (query === '파' && (item.includes('양파') || display.includes('양파'))) return true;
  return false;
}

function filterDailyRowsByCandidates(rows, candidates, query) {
  const directRows = filterDailyRowsByQuery(rows, query);
  if (!candidates.length) return directRows;
  const productNos = new Set(candidates.map((candidate) => candidate.productNo).filter(Boolean));
  const linkedRows = rows.filter((row) => {
    const rowCandidate = candidateFromRow(row);
    if (row.productNo && productNos.has(row.productNo)) return true;
    if (filterDailyRowsByQuery([row], query).length) return true;
    return candidates.some((candidate) => candidateMatchesDailyRow(candidate, rowCandidate));
  });
  return dedupeResults([...directRows, ...linkedRows]);
}

function filterDailyRowsByQuery(rows, query) {
  const q = normalizeText(query);
  if (!q || AMBIGUOUS_QUERY_HINTS.has(q) || q.length <= 1) return [];
  return rows
    .filter(hasUsablePriceRow)
    .map((row) => ({ row, score: scoreCandidate(candidateFromRow(row), query) }))
    .filter(({ score }) => score >= 115)
    .sort((a, b) => b.score - a.score || compareResult(a.row, b.row))
    .map(({ row }) => row);
}

function candidateMatchesDailyRow(candidate, rowCandidate) {
  if (!candidate || !rowCandidate) return false;
  if (candidate.productNo && rowCandidate.productNo && candidate.productNo === rowCandidate.productNo) return true;
  if (candidate.itemCategoryCode && rowCandidate.itemCategoryCode && candidate.itemCategoryCode !== rowCandidate.itemCategoryCode) return false;

  const candidateItem = normalizeText(candidate.itemName);
  const candidateKind = normalizeText(candidate.kindName);
  const candidateDisplay = normalizeText(candidate.displayName);
  const rowTexts = [
    rowCandidate.itemName,
    rowCandidate.kindName,
    rowCandidate.displayName,
    rowCandidate.productName,
  ].map(normalizeText).filter(Boolean);

  if (candidateKind && candidateKind !== '전체') {
    if (rowTexts.some((text) => text === candidateKind || (candidateKind.length >= 2 && text.includes(candidateKind)))) return true;
    return false;
  }

  if (candidateDisplay && candidateDisplay.length >= 2 && rowTexts.some((text) => text === candidateDisplay || text.includes(candidateDisplay))) return true;
  if (candidateItem && candidateItem.length >= 2 && rowTexts.some((text) => text === candidateItem || text.includes(candidateItem))) return true;
  return false;
}

function isItemMatch(row, query) {
  const candidate = candidateFromRow(row);
  return scoreCandidate(candidate, query) >= 60;
}

function candidateFromRow(row) {
  return {
    productNo: row?.productNo || '',
    itemCategoryCode: row?.categoryCode || row?.itemCategoryCode || '',
    itemCategoryName: row?.categoryLabel || row?.itemCategoryName || '',
    itemCode: row?.itemCode || '',
    itemName: row?.itemName || '',
    kindCode: row?.kindCode || '',
    kindName: row?.kindName || '',
    displayName: row?.productName || buildDisplayName(row?.itemName, row?.kindName),
    normalizedTokens: buildSearchTokens({ itemName: row?.itemName, kindName: row?.kindName, productName: row?.productName }),
    marketTypes: row?.marketType ? [row.marketType] : [],
    source: row?.sourceApi || 'row',
  };
}

function publicCandidate(candidate) {
  if (!candidate) return null;
  return {
    productNo: candidate.productNo || '',
    itemCategoryCode: candidate.itemCategoryCode || '',
    itemCategoryName: candidate.itemCategoryName || CATEGORY_LABELS[candidate.itemCategoryCode] || '',
    itemCode: candidate.itemCode || '',
    itemName: candidate.itemName || '',
    kindCode: candidate.kindCode || '',
    kindName: candidate.kindName || '',
    retailRankCode: candidate.rankCodeForMarket?.retail || '',
    wholesaleRankCode: candidate.rankCodeForMarket?.wholesale || '',
    displayName: candidate.displayName || buildDisplayName(candidate.itemName, candidate.kindName),
    label: candidate.displayName || buildDisplayName(candidate.itemName, candidate.kindName) || candidate.productNo || '',
    marketTypes: candidate.marketTypes || [],
    score: candidate.score || 0,
    matchLabel: candidate.matchLabel || buildMatchLabel(candidate),
  };
}

function uniqueCandidateChoices(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    const key = canonicalCandidateName(candidate) || candidate.productNo || candidate.displayName;
    if (!key) continue;
    const previous = map.get(key);
    if (!previous || candidate.score > previous.score || candidatePriority(candidate) < candidatePriority(previous)) map.set(key, candidate);
  }
  return [...map.values()].sort((a, b) => b.score - a.score || candidatePriority(a) - candidatePriority(b));
}

function canonicalCandidateName(candidate) {
  const item = clean(candidate?.itemName, 50);
  const kind = clean(candidate?.kindName, 50);
  const display = clean(candidate?.displayName || candidate?.productName || '', 80);
  if (display && normalizeText(display) !== normalizeText(item)) return display;
  if (kind && kind !== '전체' && normalizeText(kind) !== normalizeText(item)) return kind;
  return item || stripKindFromProductName(display);
}

function candidatePriority(candidate) {
  if (candidate.productNo) return 0;
  if (candidate.source?.includes('dailySales')) return 1;
  return 2;
}

function buildSearchTokens({ itemName, kindName, productName }) {
  const values = [itemName, kindName, productName, stripKindFromProductName(productName), extractKindFromProductName(productName)];
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function buildMatchLabel(candidate) {
  return [candidate.itemCategoryName || CATEGORY_LABELS[candidate.itemCategoryCode], candidate.displayName || buildDisplayName(candidate.itemName, candidate.kindName), candidate.retailUnit || candidate.wholesaleUnit].filter(Boolean).join(' · ');
}

function buildDisplayName(itemName, kindName) {
  const item = clean(itemName, 50);
  const kind = clean(kindName, 50);
  if (!item) return kind;
  if (!kind || normalizeText(kind) === normalizeText(item) || kind === '전체') return item;
  return `${item} ${kind}`;
}

function stripKindFromProductName(value) {
  const text = clean(value, 80);
  if (!text) return '';
  return text.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim() || text;
}

function extractKindFromProductName(value) {
  const text = clean(value, 80);
  const match = text.match(/[\(\[]([^\)\]]+)[\)\]]/);
  return match ? clean(match[1], 50) : '';
}

function compareResult(a, b) {
  const sourceWeight = (value) => value === ACTIONS.retailPeriod || value === ACTIONS.wholesalePeriod ? 0 : value === 'dailySalesList' ? 1 : 2;
  const marketWeight = (value) => value === 'retail' ? 0 : 1;
  return sourceWeight(a.sourceApi) - sourceWeight(b.sourceApi)
    || marketWeight(a.marketType) - marketWeight(b.marketType)
    || normalizeDateNumber(b.day) - normalizeDateNumber(a.day)
    || normalizeText(a.itemName).localeCompare(normalizeText(b.itemName), 'ko')
    || normalizeText(a.kindName).localeCompare(normalizeText(b.kindName), 'ko');
}

function dedupeResults(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [row.sourceApi, row.marketType, row.productNo, row.categoryCode, row.itemCode, row.kindCode, row.region, row.unit, row.day, row.price].join('|');
    const previous = map.get(key);
    if (!previous || compareResult(row, previous) < 0) map.set(key, row);
  }
  return [...map.values()];
}

function buildSummary({ requestId, item, region, market, results, warnings, resolution, elapsedMs }) {
  if (!results.length) {
    return {
      tone: 'empty',
      title: '조회 가능한 가격정보를 찾지 못했습니다',
      message: '품목명을 조금 더 짧게 입력하거나 인기 품목을 선택해 다시 확인해 주세요.',
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      region,
      market,
    };
  }
  const first = results[0];
  const mainChange = first.monthChange?.direction !== 'unknown' ? first.monthChange : first.weekChange;
  const change = mainChange?.direction === 'up' ? '비교 기준 대비 상승' : mainChange?.direction === 'down' ? '비교 기준 대비 하락' : mainChange?.direction === 'same' ? '비교 기준과 비슷' : '비교 정보 없음';
  return {
    tone: mainChange?.direction || 'normal',
    title: `${first.itemName || item} ${first.marketLabel} 기준`,
    message: `${first.region || region} ${first.marketLabel} 조사 가격 기준으로 ${change} 흐름을 참고할 수 있습니다.`,
    primaryPrice: first.priceText,
    unit: first.unit,
    day: first.day,
    representative: first,
    warning: warnings[0] || '',
    resolution: resolution?.reason || '',
    elapsedMs,
  };
}

function readCondition(data) {
  const condition = data?.condition || data?.response?.condition || data?.data?.condition || null;
  const first = Array.isArray(condition) ? condition[0] : condition;
  const code = String(first?.code || first?.CODE || data?.error_code || data?.data?.error_code || '').trim();
  const message = String(first?.message || first?.Message || first?.msg || data?.error_msg || data?.data?.error_msg || '').trim();
  if (!code && typeof data?.error === 'string') return { code: 'error', message: data.error };
  return { code, message };
}

function extractRows(data) {
  const candidates = [
    data?.price,
    data?.prices,
    data?.data,
    data?.list,
    data?.result,
    data?.response?.body?.items?.item,
    data?.response?.body?.items,
    data?.items?.item,
    data?.items,
  ];
  const rows = [];
  for (const value of candidates) rows.push(...collectRows(value));
  if (!rows.length) rows.push(...collectRows(data));
  return rows.filter(isPotentialDataRow);
}

function collectRows(value, depth = 0) {
  if (!value || depth > 6) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => collectRows(entry, depth + 1));
  if (typeof value !== 'object') return [];

  const nestedKeys = ['price', 'prices', 'data', 'list', 'result', 'rows', 'row', 'items', 'item', 'body'];
  const nestedRows = [];
  for (const key of nestedKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) nestedRows.push(...collectRows(value[key], depth + 1));
  }
  if (nestedRows.length) return nestedRows;

  const childRows = [];
  for (const [key, child] of Object.entries(value)) {
    if (nestedKeys.includes(key)) continue;
    if (child && typeof child === 'object') childRows.push(...collectRows(child, depth + 1));
  }
  if (childRows.length) return childRows;
  return [value];
}

function isPotentialDataRow(row) {
  if (!row || typeof row !== 'object') return false;
  const keys = Object.keys(row);
  if (!keys.length) return false;
  if (keys.length === 1 && keys[0] === 'item') return false;
  return Boolean(
    firstValue(row, [...ITEM_NAME_KEYS, 'productName', 'productname', 'itemname'])
    || firstValue(row, [...PRICE_KEYS, 'price'])
    || firstValue(row, ['productno', 'product_no'])
    || firstValue(row, ['itemcode', 'itemcategorycode'])
    || firstValue(row, ['regday', 'yyyy'])
  );
}

function hasItemIdentity(row) {
  return Boolean(row?.itemName || row?.kindName || row?.productName || row?.productNo);
}

function hasUsablePriceRow(row) {
  return Boolean(hasItemIdentity(row) && Number.isFinite(row.price));
}

function firstXmlBlock(text, tag) {
  return allXmlBlocks(text, tag)[0] || '';
}


function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allXmlBlocks(text, tag) {
  const blocks = [];
  const escaped = escapeRegExp(tag);
  const pattern = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  let match;
  while ((match = pattern.exec(String(text || '')))) blocks.push(match[1]);
  return blocks;
}

function extractXmlTagNames(text) {
  const tags = [];
  const pattern = /<\/?([A-Za-z0-9_.:-]+)\b/g;
  let match;
  while ((match = pattern.exec(String(text || ''))) && tags.length < 100) {
    if (!match[1].startsWith('?')) tags.push(match[1]);
  }
  return [...new Set(tags)];
}

function parseXmlFlatObject(xml) {
  const output = {};
  const simpleTagRegex = /<([A-Za-z0-9_.:-]+)\b[^>]*>([^<>]*)<\/\1>/g;
  let match;
  while ((match = simpleTagRegex.exec(String(xml || '')))) {
    const key = match[1];
    const value = decodeXml(match[2].trim());
    if (isPresentValue(value)) output[key] = value;
  }
  return output;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstValue(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const value = row[key];
    if (isPresentValue(value)) return value;
  }
  const normalizedMap = getNormalizedKeyMap(row);
  for (const key of keys) {
    const actualKey = normalizedMap.get(normalizeKey(key));
    if (!actualKey) continue;
    const value = row[actualKey];
    if (isPresentValue(value)) return value;
  }
  return '';
}

function getNormalizedKeyMap(row) {
  const map = new Map();
  for (const key of Object.keys(row || {})) map.set(normalizeKey(key), key);
  return map;
}

function normalizeKey(value) {
  return String(value || '').replace(/[\s_\-\.]/g, '').toLowerCase();
}

function isPresentValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value) || typeof value === 'object') return false;
  return String(value).trim() !== '';
}

function parsePrice(value) {
  const text = String(value ?? '').replace(/원/g, '').trim();
  if (!text || text === '-' || text.toLowerCase() === 'null' || text === '가격 정보 없음') return null;
  const matched = text.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!matched) return null;
  const number = Number(matched[0].replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function formatPrice(number, fallback) {
  if (Number.isFinite(number)) return `${number.toLocaleString('ko-KR')}원`;
  const text = String(fallback || '').trim();
  return text && text !== '-' ? text : '가격 정보 없음';
}

function buildChange(current, past) {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past === 0) return { direction: 'unknown', amount: null, rate: null, label: '비교 정보 없음' };
  const amount = current - past;
  const rate = amount / past * 100;
  const direction = amount > 0 ? 'up' : amount < 0 ? 'down' : 'same';
  const sign = amount > 0 ? '+' : '';
  return {
    direction,
    amount,
    rate,
    label: direction === 'same' ? '변동 없음' : `${sign}${Math.round(amount).toLocaleString('ko-KR')}원 (${sign}${rate.toFixed(1)}%)`,
  };
}

function buildDirectionChange(direction, rate, current, past) {
  const fallback = buildChange(current, past);
  const code = String(direction || '').trim();
  if (!code) return fallback;
  const mapped = code === '1' ? 'up' : code === '0' ? 'down' : code === '2' ? 'same' : fallback.direction;
  const textRate = String(rate || '').trim();
  return {
    ...fallback,
    direction: mapped,
    label: mapped === 'same' ? '변동 없음' : textRate ? `${mapped === 'up' ? '상승' : mapped === 'down' ? '하락' : '변동'} ${textRate}` : fallback.label,
  };
}

function getItemAliases(value) {
  const text = normalizeText(value);
  if (!text) return [];
  const direct = ITEM_ALIASES[text] || [];
  const reverse = Object.entries(ITEM_ALIASES)
    .filter(([, aliases]) => aliases.map(normalizeText).includes(text))
    .map(([key]) => key);
  return [...new Set([text, ...direct, ...reverse].map(normalizeText).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s\u00A0]+/g, '')
    .replace(/[()\[\]{}·ㆍ,._\-\/]/g, '')
    .toLowerCase();
}

function clean(value, max = 80) {
  return String(value || '').trim().slice(0, max);
}

function normalizeRegion(value) {
  const text = String(value || '전국').trim();
  return Object.prototype.hasOwnProperty.call(REGION_CODES, text) ? text : '전국';
}

function normalizeMarket(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'wholesale') return 'wholesale';
  if (text === 'all') return 'all';
  return 'retail';
}

function normalizePeriod(value) {
  const text = String(value || '').toLowerCase();
  return text === 'trend' ? 'trend' : 'latest';
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeDateNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? Number(digits.slice(0, 8)) : 0;
}

function resolveCountryCode(region, marketType) {
  const code = REGION_CODES[region] ?? '';
  if (marketType === 'wholesale' && !WHOLESALE_REGION_CODES.has(code)) return '';
  return code;
}

function buildRecentDateRange(regday) {
  const end = regday ? parseDate(regday) : new Date();
  const start = new Date(end.getTime());
  start.setDate(start.getDate() - 21);
  return { startday: formatDate(start), endday: formatDate(end) };
}

function parseDate(value) {
  const parsed = new Date(`${value}T00:00:00+09:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function logCodeIndexDiagnostics({ requestId, item, market, region, dailySalesPayload, dailyRows, productCatalogPayload, productCatalogRows, resolution }) {
  try {
    console.log('[KAMIS grocery code-index diagnostics]', {
      requestId,
      version: KAMIS_GROCERY_API_VERSION,
      item,
      market,
      region,
      dailySalesFormat: dailySalesPayload?._kamisFormat || 'unknown',
      dailySalesShape: describeShape(dailySalesPayload?.price || dailySalesPayload?.data),
      dailyRowCount: dailyRows.length,
      productInfoFormat: productCatalogPayload?._kamisFormat || 'none',
      productInfoShape: describeShape(productCatalogPayload?.price || productCatalogPayload?.data),
      productCatalogCount: productCatalogRows.length,
      resolutionStatus: resolution.status,
      resolutionReason: resolution.reason,
      candidateCount: resolution.candidates.length,
      firstCandidate: resolution.candidates[0] ? publicCandidate(resolution.candidates[0]) : null,
    });
  } catch (error) {
    console.log('[KAMIS grocery code-index diagnostics failed]', error?.message || error);
  }
}

function describeShape(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    return { type: 'array', length: value.length, firstKeys: first && typeof first === 'object' ? Object.keys(first).slice(0, 20) : [] };
  }
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 30) };
  if (typeof value === 'string') return { type: 'string', length: value.length, preview: value.slice(0, 120) };
  return { type: value === null ? 'null' : typeof value };
}

function createRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `grocery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const ITEM_NAME_KEYS = ['item_name', 'itemName', 'itemname', 'ITEM_NAME', 'productName', 'product_name', 'product_name_kor', 'productname', 'itemname', '품목명', '품목'];
const KIND_NAME_KEYS = ['kind_name', 'kindName', 'kindname', 'KIND_NAME', 'kind', 'variety_name', 'varietyName', 'kindnm', 'kindname', '품종명', '품종', '규격'];
const ITEM_CODE_KEYS = ['itemcode', 'item_code', 'itemCode', 'ITEM_CODE', 'productno', 'product_no', 'productNo', '품목코드'];
const KIND_CODE_KEYS = ['kindcode', 'kind_code', 'kindCode', 'KIND_CODE', 'kindno', 'kind_no', '품종코드'];
const RANK_KEYS = ['rank', 'product_rank_name', 'productRankName', 'rank_name', 'RANK', '등급'];
const UNIT_KEYS = ['unit', 'UNIT', 'unit_name', 'unitName', 'units', 'retail_unit', 'wholesale_unit', '단위', '거래단위'];
const DAY_KEYS = ['day1', 'DAY1', 'regday', 'REGDAY', 'latest_day', 'latestDay', 'lastest_date', 'lastestDate', 'date', 'base_date', 'baseDate', '조사일', '기준일'];
const PRICE_KEYS = ['dpr1', 'DPR1', 'dpr_1', 'price', 'PRICE', 'price_value', 'priceValue', 'latest_price', 'latestPrice', 'recent_price', 'recentPrice', 'amount', 'amt', 'value', '조사가격', '가격', '최근가격'];
const WEEK_PRICE_KEYS = ['dpr2', 'DPR2', 'dpr_2', 'oneDayAgo', 'one_day_ago', 'previous_price', 'previousPrice', '전일가격'];
const MONTH_PRICE_KEYS = ['dpr3', 'DPR3', 'dpr_3', 'monthAgo', 'month_ago', 'oneMonthAgo', 'one_month_ago', '전월가격'];
const YEAR_PRICE_KEYS = ['dpr4', 'DPR4', 'dpr_4', 'yearAgo', 'year_ago', 'oneYearAgo', 'one_year_ago', '전년가격'];
const AVERAGE_PRICE_KEYS = ['dpr7', 'DPR7', 'dpr_7', 'average', 'avg_price', 'avgPrice', '평균가격', '평년가격'];
