const RTMS_APT_RENT_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
const MAX_NUM_OF_ROWS = 100;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'public, max-age=3600'
    }
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, { status, cacheControl: 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lawdCd = normalizeLawdCd(url.searchParams.get('lawdCd') || url.searchParams.get('LAWD_CD'));
  const dealYmd = normalizeDealYmd(url.searchParams.get('dealYmd') || url.searchParams.get('DEAL_YMD'));
  const aptName = normalizeText(url.searchParams.get('aptName') || '');
  const numOfRows = clampNumber(url.searchParams.get('numOfRows'), 10, MAX_NUM_OF_ROWS, 50);
  const pageNo = clampNumber(url.searchParams.get('pageNo'), 1, 30, 1);
  const serviceKey = env.MOLIT_RTMS_API_KEY || env.PUBLIC_DATA_API_KEY;

  if (!serviceKey) return error('MOLIT_RTMS_API_KEY 또는 PUBLIC_DATA_API_KEY 환경변수가 필요합니다.', 503);
  if (!lawdCd) return error('법정동코드 앞 5자리 LAWD_CD가 필요합니다. 예: 서울 광진구 11215');
  if (!dealYmd) return error('계약년월 DEAL_YMD가 필요합니다. 예: 202605');

  const apiUrl = new URL(RTMS_APT_RENT_ENDPOINT);
  apiUrl.searchParams.set('serviceKey', serviceKey);
  apiUrl.searchParams.set('LAWD_CD', lawdCd);
  apiUrl.searchParams.set('DEAL_YMD', dealYmd);
  apiUrl.searchParams.set('pageNo', String(pageNo));
  apiUrl.searchParams.set('numOfRows', String(numOfRows));

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: { accept: 'application/xml,text/xml,*/*' }
    });
    const text = await response.text();
    if (!response.ok) {
      return error(`실거래가 API 호출에 실패했습니다. (${response.status})`, 502);
    }

    const parsed = parseAptRentXml(text);
    const filteredItems = aptName
      ? parsed.items.filter((item) => normalizeText(item.aptName).includes(aptName))
      : parsed.items;

    return json({
      ok: true,
      query: { lawdCd, dealYmd, aptName, pageNo, numOfRows },
      totalCount: parsed.totalCount,
      resultCount: filteredItems.length,
      items: filteredItems,
      source: {
        name: '국토교통부_아파트 전월세 실거래가 자료',
        url: 'https://www.data.go.kr/data/15126474/openapi.do'
      },
      note: '공공데이터포털 아파트 전월세 실거래가 자료를 조회한 참고 정보입니다. 동/호 정보는 제공되지 않습니다.'
    });
  } catch (err) {
    return error('실거래가 API 조회 중 오류가 발생했습니다.', 502);
  }
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function parseAptRentXml(xml) {
  const resultCode = getTag(xml, 'resultCode');
  const resultMsg = getTag(xml, 'resultMsg');
  const totalCount = parseNumber(getTag(xml, 'totalCount')) || 0;
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const items = itemBlocks.map((block) => normalizeAptRentItem(block)).filter(Boolean);
  return { resultCode, resultMsg, totalCount, items };
}

function normalizeAptRentItem(block) {
  const dealYear = getTag(block, 'dealYear') || getTag(block, '년');
  const dealMonth = getTag(block, 'dealMonth') || getTag(block, '월');
  const dealDay = getTag(block, 'dealDay') || getTag(block, '일');
  const deposit = parseMoney(getTag(block, 'deposit') || getTag(block, '보증금액'));
  const monthlyRent = parseMoney(getTag(block, 'monthlyRent') || getTag(block, '월세금액'));
  const aptName = getTag(block, 'aptNm') || getTag(block, '아파트') || getTag(block, '단지명') || '';
  const area = parseNumber(getTag(block, 'excluUseAr') || getTag(block, '전용면적'));
  const floor = getTag(block, 'floor') || getTag(block, '층') || '';
  const buildYear = getTag(block, 'buildYear') || getTag(block, '건축년도') || '';
  const umdNm = getTag(block, 'umdNm') || getTag(block, '법정동') || '';
  const jibun = getTag(block, 'jibun') || getTag(block, '지번') || '';
  const contractTerm = getTag(block, 'contractTerm') || getTag(block, '계약기간') || '';
  const contractType = getTag(block, 'contractType') || getTag(block, '계약구분') || '';

  return {
    aptName: decodeXml(aptName),
    dealDate: formatDealDate(dealYear, dealMonth, dealDay),
    dealYear: parseNumber(dealYear),
    dealMonth: parseNumber(dealMonth),
    dealDay: parseNumber(dealDay),
    deposit,
    monthlyRent,
    area,
    floor: decodeXml(floor),
    buildYear: decodeXml(buildYear),
    umdNm: decodeXml(umdNm),
    jibun: decodeXml(jibun),
    contractTerm: decodeXml(contractTerm),
    contractType: decodeXml(contractType)
  };
}

function getTag(xml, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : '';
}

function parseMoney(value) {
  const cleaned = String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number * 10000 : 0;
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
  const y = String(parseNumber(year) || '').padStart(4, '0');
  const m = String(parseNumber(month) || '').padStart(2, '0');
  const d = String(parseNumber(day) || '').padStart(2, '0');
  return y && m && d ? `${y}-${m}-${d}` : '';
}
