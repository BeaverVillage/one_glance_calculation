const CURRENCY_DATA_URL = new URL("../data/currencies.json", import.meta.url);
const CACHE_PREFIX = "exchange-rates:";
const LAST_SUCCESS_KEY = "exchange-rates:last-success";
export const EXCHANGE_RATE_CACHE_TTL_MS = 30 * 60 * 1000;

const FALLBACK_CURRENCIES = [
  { code: "KRW", name: "대한민국 원", symbol: "₩", minorUnit: 0, popular: true },
  { code: "USD", name: "미국 달러", symbol: "$", minorUnit: 2, popular: true },
  { code: "JPY", name: "일본 엔", symbol: "¥", minorUnit: 0, popular: true },
  { code: "EUR", name: "유로", symbol: "€", minorUnit: 2, popular: true },
  { code: "AUD", name: "호주 달러", symbol: "A$", minorUnit: 2, popular: true },
  { code: "CAD", name: "캐나다 달러", symbol: "C$", minorUnit: 2, popular: true },
  { code: "GBP", name: "영국 파운드", symbol: "£", minorUnit: 2, popular: true },
  { code: "NZD", name: "뉴질랜드 달러", symbol: "NZ$", minorUnit: 2, popular: true },
  { code: "CNY", name: "중국 위안", symbol: "¥", minorUnit: 2, popular: true },
  { code: "HKD", name: "홍콩 달러", symbol: "HK$", minorUnit: 2, popular: true },
  { code: "TWD", name: "대만 달러", symbol: "NT$", minorUnit: 0, popular: true },
  { code: "SGD", name: "싱가포르 달러", symbol: "S$", minorUnit: 2, popular: true },
  { code: "THB", name: "태국 바트", symbol: "฿", minorUnit: 2, popular: true },
  { code: "VND", name: "베트남 동", symbol: "₫", minorUnit: 0, popular: true },
  { code: "PHP", name: "필리핀 페소", symbol: "₱", minorUnit: 2 },
  { code: "IDR", name: "인도네시아 루피아", symbol: "Rp", minorUnit: 0 },
  { code: "MYR", name: "말레이시아 링깃", symbol: "RM", minorUnit: 2 },
  { code: "CHF", name: "스위스 프랑", symbol: "CHF", minorUnit: 2 },
  { code: "AED", name: "아랍에미리트 디르함", symbol: "د.إ", minorUnit: 2 }
];

const state = {
  currencies: FALLBACK_CURRENCIES,
  currencyMap: new Map(FALLBACK_CURRENCIES.map((currency) => [currency.code, currency]))
};

export function initExchangeRateCalculator(root = document) {
  const form = root.querySelector("#exchange-rate-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "exchange-rate") return;
  form.dataset.calculatorReady = "exchange-rate";

  const els = getElements(root, form);
  populateCurrencySelects(els).then(() => {
    bindEvents(els);
    updateModeVisibility(els);
    updateFeeVisibility(els);
    calculateAndRender(els);
  });
}

function getElements(root, form) {
  return {
    root,
    form,
    amount: root.querySelector("#exchange-amount"),
    from: root.querySelector("#exchange-from"),
    to: root.querySelector("#exchange-to"),
    swap: root.querySelector("#exchange-swap"),
    refresh: root.querySelector("#exchange-refresh-rate"),
    manualRate: root.querySelector("#exchange-manual-rate"),
    manualDate: root.querySelector("#exchange-manual-date"),
    manualPanel: root.querySelector("#exchange-manual-panel"),
    modeInputs: Array.from(root.querySelectorAll('input[name="exchange-rate-mode"]')),
    feeEnabled: root.querySelector("#exchange-fee-enabled"),
    feePanel: root.querySelector("#exchange-fee-panel"),
    feeRate: root.querySelector("#exchange-fee-rate"),
    discountRate: root.querySelector("#exchange-discount-rate"),
    fixedFee: root.querySelector("#exchange-fixed-fee"),
    quickPairs: Array.from(root.querySelectorAll("[data-exchange-pair]")),
    status: root.querySelector("#exchange-status"),
    result: root.querySelector("#exchange-result"),
    resultDetail: root.querySelector("#exchange-result-detail"),
    baseConverted: root.querySelector("#exchange-base-converted"),
    finalAmount: root.querySelector("#exchange-final-amount"),
    appliedRate: root.querySelector("#exchange-applied-rate"),
    reverseRate: root.querySelector("#exchange-reverse-rate"),
    rateDate: root.querySelector("#exchange-rate-date"),
    rateSource: root.querySelector("#exchange-rate-source"),
    feeSummary: root.querySelector("#exchange-fee-summary"),
    attribution: root.querySelector("#exchange-rate-attribution")
  };
}

async function populateCurrencySelects(els) {
  state.currencies = await loadCurrencies();
  state.currencyMap = new Map(state.currencies.map((currency) => [currency.code, currency]));
  const popular = state.currencies.filter((currency) => currency.popular);
  const others = state.currencies.filter((currency) => !currency.popular);
  const html = `${renderOptionGroup("자주 쓰는 통화", popular)}${renderOptionGroup("전체 통화", others)}`;
  els.from.innerHTML = html;
  els.to.innerHTML = html;
  els.from.value = "AUD";
  els.to.value = "KRW";
}

async function loadCurrencies() {
  try {
    const response = await fetch(CURRENCY_DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Currency data ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.currencies) && data.currencies.length ? data.currencies : FALLBACK_CURRENCIES;
  } catch (error) {
    console.warn("통화 목록을 불러오지 못해 기본 목록을 사용합니다.", error);
    return FALLBACK_CURRENCIES;
  }
}

function renderOptionGroup(label, currencies) {
  if (!currencies.length) return "";
  const options = currencies.map((currency) => `<option value="${currency.code}">${currency.code} - ${escapeHtml(currency.name)}</option>`).join("");
  return `<optgroup label="${escapeHtml(label)}">${options}</optgroup>`;
}

function bindEvents(els) {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculateAndRender(els);
  });

  [els.amount, els.manualRate, els.manualDate, els.feeRate, els.discountRate, els.fixedFee].forEach((input) => {
    input?.addEventListener("input", () => calculateAndRender(els));
  });

  els.from.addEventListener("change", () => calculateAndRender(els));
  els.to.addEventListener("change", () => calculateAndRender(els));
  els.swap.addEventListener("click", () => {
    const from = els.from.value;
    els.from.value = els.to.value;
    els.to.value = from;
    calculateAndRender(els);
  });
  els.refresh.addEventListener("click", () => {
    setMode(els, "today");
    calculateAndRender(els, { forceFetch: true });
  });
  els.modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updateModeVisibility(els);
      calculateAndRender(els);
    });
  });
  els.feeEnabled.addEventListener("change", () => {
    updateFeeVisibility(els);
    calculateAndRender(els);
  });
  els.quickPairs.forEach((button) => {
    button.addEventListener("click", () => {
      const [from, to] = button.dataset.exchangePair.split("/");
      els.from.value = from;
      els.to.value = to;
      calculateAndRender(els);
    });
  });
}

function updateModeVisibility(els) {
  const mode = getMode(els);
  els.manualPanel.hidden = mode !== "manual";
  els.refresh.disabled = mode === "manual";
}

function updateFeeVisibility(els) {
  els.feePanel.hidden = !els.feeEnabled.checked;
}

async function calculateAndRender(els, options = {}) {
  const amount = readNumber(els.amount.value);
  const from = els.from.value;
  const to = els.to.value;

  if (!amount || amount < 0) {
    renderEmpty(els, "환산할 금액을 입력해 주세요.");
    return;
  }

  if (from === to) {
    const rateInfo = { base: from, rates: { [to]: 1 }, updatedAt: new Date().toISOString(), source: "동일 통화", fetchedAt: Date.now() };
    renderQuote(els, buildQuote({ amount, from, to, rateInfo, els }));
    setStatus(els, "같은 통화끼리는 1:1로 계산합니다.", "muted");
    return;
  }

  try {
    const rateInfo = await getRateInfo({ from, to, mode: getMode(els), forceFetch: options.forceFetch });
    if (!rateInfo?.rates?.[to]) {
      renderEmpty(els, `${from}/${to} 환율을 찾지 못했습니다. 수동 입력 모드를 사용해 주세요.`);
      setStatus(els, "선택한 통화쌍은 현재 API 또는 캐시에서 확인하지 못했습니다.", "warn");
      return;
    }
    const quote = buildQuote({ amount, from, to, rateInfo, els });
    renderQuote(els, quote);
    setStatus(els, `${rateInfo.source} 기준 환율을 적용했습니다.`, "good");
  } catch (error) {
    console.warn(error);
    renderEmpty(els, "환율을 불러오지 못했습니다. 수동 입력 모드 또는 최근 조회 환율을 사용해 주세요.");
    setStatus(els, error.message || "환율 조회에 실패했습니다.", "warn");
  }
}

async function getRateInfo({ from, to, mode, forceFetch }) {
  if (mode === "manual") return getManualRateInfo(from, to);
  if (mode === "recent") return getRecentRateInfo(from, to);

  const cached = forceFetch ? null : readCachedRates(from);
  if (cached?.rates?.[to]) return { ...cached, source: `${cached.source} · 30분 캐시` };

  const fetched = await fetchRatesWithFallback(from);
  writeCachedRates(fetched);
  return fetched;
}

function getManualRateInfo(from, to) {
  const rate = readNumber(document.querySelector("#exchange-manual-rate")?.value || "");
  const manualDate = document.querySelector("#exchange-manual-date")?.value || "직접 입력";
  if (!rate || rate <= 0) throw new Error("수동 입력 모드에서는 직접 환율을 입력해 주세요.");
  return { base: from, rates: { [to]: rate }, updatedAt: manualDate, source: "사용자 직접 입력 환율", fetchedAt: Date.now(), manual: true };
}

function getRecentRateInfo(from, to) {
  const cached = readCachedRates(from, { ignoreTtl: true });
  if (cached?.rates?.[to]) return { ...cached, source: `${cached.source} · 최근 조회 저장값` };
  const last = readStorageJson(LAST_SUCCESS_KEY);
  if (last?.base === from && last?.rates?.[to]) return { ...last, source: `${last.source} · 마지막 성공 환율` };
  throw new Error("선택한 기준 통화의 최근 조회 환율이 없습니다. 오늘 환율을 조회하거나 수동 입력을 사용해 주세요.");
}

async function fetchRatesWithFallback(base) {
  const providers = [
    {
      source: "ExchangeRate-API Open Access",
      url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
      parse: (data) => {
        if (data.result && data.result !== "success") throw new Error("ExchangeRate-API 응답 실패");
        return { base: data.base_code, rates: normalizeRates(data.rates), updatedAt: data.time_last_update_utc, source: "ExchangeRate-API Open Access" };
      }
    },
    {
      source: "Fawaz Ahmed Currency API jsDelivr",
      url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`,
      parse: (data) => parseFawazCurrencyData(data, base, "Fawaz Ahmed Currency API jsDelivr")
    },
    {
      source: "Fawaz Ahmed Currency API Cloudflare fallback",
      url: `https://latest.currency-api.pages.dev/v1/currencies/${base.toLowerCase()}.json`,
      parse: (data) => parseFawazCurrencyData(data, base, "Fawaz Ahmed Currency API Cloudflare fallback")
    },
    {
      source: "Frankfurter API fallback",
      url: `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`,
      parse: (data) => ({ base: data.base, rates: normalizeRates(data.rates), updatedAt: data.date, source: "Frankfurter API fallback" })
    }
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      const response = await fetchWithTimeout(provider.url);
      if (!response.ok) throw new Error(`${provider.source} ${response.status}`);
      const parsed = provider.parse(await response.json());
      if (!parsed.base || !parsed.rates || !Object.keys(parsed.rates).length) throw new Error(`${provider.source} 응답에 환율이 없습니다.`);
      const result = { ...parsed, base: String(parsed.base).toUpperCase(), fetchedAt: Date.now() };
      writeStorageJson(LAST_SUCCESS_KEY, result);
      return result;
    } catch (error) {
      errors.push(`${provider.source}: ${error.message}`);
    }
  }
  throw new Error(`환율 API 조회에 실패했습니다. ${errors.join(" / ")}`);
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-cache" });
  } finally {
    clearTimeout(timer);
  }
}

function parseFawazCurrencyData(data, base, source) {
  const rates = data[base.toLowerCase()];
  if (!rates) throw new Error(`${source} 응답에 ${base} 기준 환율이 없습니다.`);
  return { base, rates: normalizeRates(rates), updatedAt: data.date, source };
}

function normalizeRates(rates) {
  return Object.fromEntries(Object.entries(rates || {}).map(([code, value]) => [code.toUpperCase(), Number(value)]).filter(([, value]) => Number.isFinite(value) && value > 0));
}

function buildQuote({ amount, from, to, rateInfo, els = null }) {
  const rate = Number(rateInfo.rates[to]);
  const feeEnabled = Boolean(els?.feeEnabled?.checked);
  const feeRate = feeEnabled ? readNumber(els.feeRate.value) : 0;
  const discountRate = feeEnabled ? readNumber(els.discountRate.value) : 0;
  const fixedFee = feeEnabled ? readNumber(els.fixedFee.value) : 0;
  const quote = calculateExchangeQuote({ amount, rate, feeRate, discountRate, fixedFee });
  return { ...quote, amount, from, to, rate, reverseRate: rate > 0 ? 1 / rate : 0, rateInfo, feeEnabled };
}

export function calculateExchangeQuote({ amount, rate, feeRate = 0, discountRate = 0, fixedFee = 0 }) {
  const baseConverted = Number(amount) * Number(rate);
  const fees = applyExchangeFees({ baseConverted, feeRate, discountRate, fixedFee });
  return { baseConverted, ...fees };
}

export function applyExchangeFees({ baseConverted, feeRate = 0, discountRate = 0, fixedFee = 0 }) {
  const normalizedFeeRate = clamp(Number(feeRate) || 0, 0, 100);
  const normalizedDiscountRate = clamp(Number(discountRate) || 0, 0, 100);
  const normalizedFixedFee = Math.max(0, Number(fixedFee) || 0);
  const effectiveFeeRate = normalizedFeeRate * (1 - normalizedDiscountRate / 100);
  const percentFeeAmount = Number(baseConverted) * (effectiveFeeRate / 100);
  const totalFeeAmount = percentFeeAmount + normalizedFixedFee;
  const finalAmount = Math.max(0, Number(baseConverted) - totalFeeAmount);
  return { effectiveFeeRate, percentFeeAmount, fixedFee: normalizedFixedFee, totalFeeAmount, finalAmount };
}

function renderQuote(els, quote) {
  const toCurrency = getCurrency(quote.to);
  const fromAmount = formatCurrencyAmount(quote.amount, getCurrency(quote.from));
  const converted = formatCurrencyAmount(quote.baseConverted, toCurrency);
  const final = formatCurrencyAmount(quote.finalAmount, toCurrency);
  els.result.textContent = `${fromAmount} = ${converted}`;
  els.resultDetail.textContent = quote.feeEnabled ? `수수료 반영 후 예상 수령액은 ${final}입니다.` : "수수료를 반영하지 않은 기준 환산 금액입니다.";
  els.baseConverted.textContent = converted;
  els.finalAmount.textContent = final;
  els.appliedRate.textContent = `1 ${quote.from} = ${formatRate(quote.rate, getCurrency(quote.to))} ${quote.to}`;
  els.reverseRate.textContent = `1 ${quote.to} = ${formatRate(quote.reverseRate, getCurrency(quote.from))} ${quote.from}`;
  els.rateDate.textContent = formatRateDate(quote.rateInfo.updatedAt);
  els.rateSource.textContent = quote.rateInfo.source || "-";
  els.feeSummary.textContent = quote.feeEnabled
    ? `수수료율 ${formatPercent(readNumber(els.feeRate.value))}, 우대율 ${formatPercent(readNumber(els.discountRate.value))}, 실제 적용 수수료율 ${formatPercent(quote.effectiveFeeRate)}, 수수료 합계 ${formatCurrencyAmount(quote.totalFeeAmount, toCurrency)}`
    : "수수료 미포함";
  els.attribution.innerHTML = quote.rateInfo.source?.includes("ExchangeRate-API")
    ? '<a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a>'
    : "환율 출처는 위에 표시된 공개 API 또는 직접 입력값입니다.";
}

function renderEmpty(els, message) {
  els.result.textContent = message;
  els.resultDetail.textContent = "통화, 금액, 환율 방식을 확인해 주세요.";
  [els.baseConverted, els.finalAmount, els.appliedRate, els.reverseRate, els.rateDate, els.rateSource, els.feeSummary].forEach((element) => {
    element.textContent = "-";
  });
  els.attribution.textContent = "";
}

function getCurrency(code) {
  return state.currencyMap.get(code) || { code, name: code, symbol: code, minorUnit: 2 };
}

function formatCurrencyAmount(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  const fractionDigits = currency.minorUnit === 0 ? 0 : 2;
  return `${amount.toLocaleString("ko-KR", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} ${currency.code}`;
}

function formatRate(rate, currency) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const digits = currency.minorUnit === 0 ? 2 : abs < 0.01 ? 8 : abs < 1 ? 6 : 4;
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function formatRateDate(value) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return `${date.toISOString().slice(0, 10)} (${value})`;
  return value;
}

function formatPercent(value) {
  return `${(Number(value) || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

function readNumber(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function getMode(els) {
  return els.modeInputs.find((input) => input.checked)?.value || "today";
}

function setMode(els, mode) {
  const target = els.modeInputs.find((input) => input.value === mode);
  if (target) target.checked = true;
  updateModeVisibility(els);
}

function setStatus(els, message, tone = "muted") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function readCachedRates(base, options = {}) {
  const cached = readStorageJson(`${CACHE_PREFIX}${base}`);
  if (!cached) return null;
  if (!options.ignoreTtl && Date.now() - Number(cached.fetchedAt || 0) > EXCHANGE_RATE_CACHE_TTL_MS) return null;
  return cached;
}

function writeCachedRates(rateInfo) {
  writeStorageJson(`${CACHE_PREFIX}${rateInfo.base}`, rateInfo);
}

function readStorageJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // 저장소가 막힌 환경에서는 계산만 계속 진행합니다.
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => initExchangeRateCalculator(), { once: true });
}
