import { formatWon } from "./utils.js";

const RISK_LEVELS = [
  {
    key: "low",
    label: "낮은 위험",
    tone: "good",
    detail: "입력값 기준으로 전세가율과 총 부담 비율이 낮은 편입니다.",
    copy: "입력값 기준으로 주요 비율이 낮은 편입니다. 다만 실제 안전성은 등기부등본, 전입세대열람, 보증보험 가능 여부, 주변 시세에 따라 달라질 수 있습니다."
  },
  {
    key: "normal",
    label: "보통",
    tone: "neutral",
    detail: "입력값 기준으로 아직 과도한 구간은 아니지만 기본 확인이 필요합니다.",
    copy: "전세가율과 총 부담 비율이 보통 구간입니다. 계약 전 선순위 권리, 전입신고와 확정일자, 보증보험 가능 여부를 함께 확인하세요."
  },
  {
    key: "caution",
    label: "주의 필요",
    tone: "warn",
    detail: "전세가율 또는 총 부담 비율이 높아지는 구간입니다.",
    copy: "전세가율 또는 총 부담 비율이 높아지고 있습니다. 계약 전 등기부등본의 선순위 권리, 보증보험 가능 여부, 주변 실거래가를 반드시 함께 확인하세요."
  },
  {
    key: "high",
    label: "높은 위험",
    tone: "danger",
    detail: "보증금 회수 위험이 커질 수 있는 조건으로 계산됩니다.",
    copy: "입력값 기준으로 보증금 회수 위험이 커질 수 있는 구간입니다. 전세보증금과 선순위채권이 주택가격 대비 높은 편이므로, 계약 전 보증기관 가입 가능 여부와 권리관계를 반드시 확인해야 합니다."
  },
  {
    key: "very-high",
    label: "매우 높은 위험",
    tone: "danger",
    detail: "보증금 회수 위험이 매우 높게 계산됩니다.",
    copy: "입력값 기준으로 보증금 회수 위험이 매우 높게 계산됩니다. 이 결과는 참고용이며, 계약 전 공인중개사, 보증기관, 법률 상담 등 추가 확인이 필요합니다."
  }
];

const EXAMPLE_VALUES = {
  marketPrice: "50000",
  deposit: "40000",
  priorityDebt: "5000",
  auctionRate: "75",
  homeType: "apartment",
  guaranteeStatus: "unknown"
};

export function initJeonseRiskCalculator(root = document) {
  const form = root.querySelector("#jeonse-risk-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "jeonse-risk") return;

  const els = {
    form,
    marketPrice: form.elements.marketPrice,
    deposit: form.elements.deposit,
    priorityDebt: form.elements.priorityDebt,
    auctionRate: form.elements.auctionRate,
    homeType: form.elements.homeType,
    guaranteeStatus: form.elements.guaranteeStatus,
    exampleButton: root.querySelector("#jeonse-example-button"),
    resetButton: root.querySelector("#jeonse-reset-button"),
    formMessage: root.querySelector("#jeonse-form-message"),
    riskLevel: root.querySelector("#jeonse-risk-level"),
    riskDetail: root.querySelector("#jeonse-risk-detail"),
    jeonseRatio: root.querySelector("#jeonse-ratio"),
    totalRatio: root.querySelector("#jeonse-total-ratio"),
    guaranteeLimit: root.querySelector("#jeonse-guarantee-limit"),
    recoveryAmount: root.querySelector("#jeonse-recovery-amount"),
    shortfall: root.querySelector("#jeonse-shortfall"),
    prioritySummary: root.querySelector("#jeonse-priority-summary"),
    decisionBadge: root.querySelector("#jeonse-decision-badge"),
    decisionCopy: root.querySelector("#jeonse-decision-copy"),
    tradeAddress: root.querySelector("#jeonse-address-query"),
    tradeAptName: root.querySelector("#jeonse-apt-name"),
    tradeMonths: root.querySelector("#jeonse-trade-months"),
    tradeSearchButton: root.querySelector("#jeonse-trade-search-button"),
    tradeMessage: root.querySelector("#jeonse-trade-message"),
    tradeResults: root.querySelector("#jeonse-trade-results"),
    selectedTrade: root.querySelector("#jeonse-selected-trade"),
    selectedTradeSummary: root.querySelector("#jeonse-selected-trade-summary"),
    clearSelectedTradeButton: root.querySelector("#jeonse-clear-selected-trade")
  };

  if (Object.values(els).some((element) => !element)) return;

  form.dataset.calculatorReady = "jeonse-risk";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update(els);
  });

  form.addEventListener("input", () => {
    clearMessage(els);
  });

  form.addEventListener("change", () => {
    clearMessage(els);
  });

  els.exampleButton.addEventListener("click", () => {
    fillExample(els);
    update(els);
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      renderPlaceholder(els);
      clearMessage(els);
      clearTradeLookup(els);
    }, 0);
  });

  els.tradeSearchButton.addEventListener("click", () => {
    lookupAptTrades(els);
  });

  [els.tradeAddress, els.tradeAptName].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      lookupAptTrades(els);
    });
  });

  els.tradeResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-jeonse-use-trade]");
    if (!button) return;
    applyTradePrice(els, button);
  });

  els.clearSelectedTradeButton.addEventListener("click", () => {
    clearSelectedTrade(els, { keepMarketPrice: true });
    els.marketPrice.dataset.priceSource = "manual";
    showTradeMessage(els, "선택한 실거래가 표시를 해제했습니다. 현재 매매가격 입력값은 유지되며 직접 수정할 수 있습니다.", "default");
    els.marketPrice.focus({ preventScroll: true });
  });

  els.marketPrice.addEventListener("input", () => {
    handleMarketPriceManualEdit(els);
  });

  renderPlaceholder(els);
  clearTradeLookup(els);
}

export function calculateJeonseRisk(input) {
  const marketPrice = sanitizeNumber(input.marketPrice);
  const deposit = sanitizeNumber(input.deposit);
  const priorityDebt = sanitizeNumber(input.priorityDebt);
  const auctionRate = sanitizeNumber(input.auctionRate);

  const totalExposure = deposit + priorityDebt;
  const jeonseRatio = safePercent(deposit, marketPrice);
  const totalRatio = safePercent(totalExposure, marketPrice);
  const guaranteeLimit = Math.max(0, marketPrice * 0.9 - priorityDebt);
  const recoveryAmount = Math.max(0, marketPrice * (auctionRate / 100) - priorityDebt);
  const shortfall = Math.max(0, deposit - recoveryAmount);
  const guaranteeExceeded = deposit > guaranteeLimit;
  const auctionRateWarning = auctionRate > 100;

  const riskScore = getRiskScore({
    jeonseRatio,
    totalRatio,
    deposit,
    shortfall,
    guaranteeExceeded,
    guaranteeLimit,
    auctionRateWarning,
    guaranteeStatus: input.guaranteeStatus
  });

  return {
    marketPrice,
    deposit,
    priorityDebt,
    auctionRate,
    homeType: input.homeType || "unknown",
    guaranteeStatus: input.guaranteeStatus || "unknown",
    totalExposure,
    jeonseRatio,
    totalRatio,
    guaranteeLimit,
    recoveryAmount,
    shortfall,
    guaranteeExceeded,
    auctionRateWarning,
    risk: RISK_LEVELS[riskScore],
    notes: buildNotes({
      marketPrice,
      deposit,
      priorityDebt,
      auctionRate,
      homeType: input.homeType,
      guaranteeStatus: input.guaranteeStatus,
      totalRatio,
      guaranteeExceeded,
      shortfall,
      auctionRateWarning
    })
  };
}

function update(els) {
  const validation = validate(els.form);
  if (!validation.ok) {
    showMessage(els, validation.message, "error");
    renderPlaceholder(els);
    return;
  }

  const result = calculateJeonseRisk(validation.values);
  renderResult(els, result);
}

function validate(form) {
  const values = {
    marketPrice: readInputNumber(form.elements.marketPrice),
    deposit: readInputNumber(form.elements.deposit),
    priorityDebt: readInputNumber(form.elements.priorityDebt, 0),
    auctionRate: readInputNumber(form.elements.auctionRate, 75),
    homeType: form.elements.homeType?.value || "unknown",
    guaranteeStatus: form.elements.guaranteeStatus?.value || "unknown"
  };

  if (!Number.isFinite(values.marketPrice) || values.marketPrice <= 0) {
    return { ok: false, message: "매매가격 또는 기준 시세를 0보다 큰 금액으로 입력해 주세요." };
  }

  if (!Number.isFinite(values.deposit) || values.deposit <= 0) {
    return { ok: false, message: "전세보증금을 0보다 큰 금액으로 입력해 주세요." };
  }

  if (!Number.isFinite(values.priorityDebt) || values.priorityDebt < 0) {
    return { ok: false, message: "선순위채권은 0 이상으로 입력해 주세요. 모르면 우선 0으로 계산할 수 있습니다." };
  }

  if (!Number.isFinite(values.auctionRate) || values.auctionRate <= 0) {
    return { ok: false, message: "예상 낙찰가율은 0보다 큰 숫자로 입력해 주세요." };
  }

  if (values.auctionRate > 120) {
    return { ok: false, message: "예상 낙찰가율은 120% 이하로 입력해 주세요. 일반적인 참고 계산은 60~80% 범위가 적합합니다." };
  }

  return { ok: true, values };
}

function renderResult(els, result) {
  const notes = result.notes.length ? ` ${result.notes.join(" ")}` : "";
  els.riskLevel.textContent = result.risk.label;
  els.riskLevel.className = `result-number jeonse-risk-level-${result.risk.key}`;
  els.riskDetail.textContent = `${result.risk.detail}${notes}`;
  els.jeonseRatio.textContent = formatPercent(result.jeonseRatio);
  els.totalRatio.textContent = formatPercent(result.totalRatio);
  els.guaranteeLimit.textContent = formatManwon(result.guaranteeLimit);
  els.recoveryAmount.textContent = formatManwon(result.recoveryAmount);
  els.shortfall.textContent = result.shortfall > 0 ? `약 ${formatManwon(result.shortfall)}` : "0원";
  els.prioritySummary.textContent = `${formatManwon(result.priorityDebt)} 반영 · 총 부담 ${formatManwon(result.totalExposure)}`;
  els.decisionBadge.textContent = result.risk.label;
  els.decisionBadge.className = `decision-badge ${result.risk.tone}`;
  els.decisionCopy.textContent = `${result.risk.copy}${buildDecisionSuffix(result)}`;
  showMessage(els, "계산이 완료되었습니다. 결과는 참고용이며 실제 계약 판단을 확정하지 않습니다.", "success");
}

function renderPlaceholder(els) {
  els.riskLevel.textContent = "-";
  els.riskLevel.className = "result-number";
  els.riskDetail.textContent = "조건을 입력하면 전세가율과 보증금 위험도를 계산합니다.";
  els.jeonseRatio.textContent = "-";
  els.totalRatio.textContent = "-";
  els.guaranteeLimit.textContent = "-";
  els.recoveryAmount.textContent = "-";
  els.shortfall.textContent = "-";
  els.prioritySummary.textContent = "-";
  els.decisionBadge.textContent = "참고용 계산";
  els.decisionBadge.className = "decision-badge neutral";
  els.decisionCopy.textContent = "이 결과는 사용자가 입력한 값을 단순 계산한 참고 지표입니다. 실제 계약 안전성, 보증보험 가입 가능 여부, 법적 권리관계를 확정하지 않습니다.";
}

function fillExample(els) {
  clearSelectedTrade(els, { keepMarketPrice: false });
  els.marketPrice.value = EXAMPLE_VALUES.marketPrice;
  els.deposit.value = EXAMPLE_VALUES.deposit;
  els.priorityDebt.value = EXAMPLE_VALUES.priorityDebt;
  els.auctionRate.value = EXAMPLE_VALUES.auctionRate;
  els.homeType.value = EXAMPLE_VALUES.homeType;
  els.guaranteeStatus.value = EXAMPLE_VALUES.guaranteeStatus;
}

function getRiskScore({ jeonseRatio, totalRatio, deposit, shortfall, guaranteeExceeded, guaranteeLimit, auctionRateWarning, guaranteeStatus }) {
  let score = Math.max(scoreJeonseRatio(jeonseRatio), scoreTotalRatio(totalRatio));

  if (guaranteeExceeded) score = Math.max(score, 2);
  if (guaranteeExceeded && guaranteeLimit > 0 && deposit > guaranteeLimit * 1.1) score = Math.max(score, 3);
  if (shortfall > 0) score = Math.max(score, 3);
  if (shortfall > deposit * 0.25) score = Math.max(score, 4);
  if (totalRatio >= 100 || jeonseRatio >= 90) score = Math.max(score, 4);
  if (guaranteeStatus === "difficult") score = Math.max(score, 3);
  if (auctionRateWarning && score < 3) score = 3;

  return Math.min(score, RISK_LEVELS.length - 1);
}

function scoreJeonseRatio(value) {
  if (value < 60) return 0;
  if (value < 70) return 1;
  if (value < 80) return 2;
  if (value < 90) return 3;
  return 4;
}

function scoreTotalRatio(value) {
  if (value < 70) return 0;
  if (value < 80) return 1;
  if (value < 90) return 2;
  if (value < 100) return 3;
  return 4;
}

function buildNotes({ priorityDebt, homeType, guaranteeStatus, guaranteeExceeded, shortfall, auctionRateWarning }) {
  const notes = [];
  if (priorityDebt === 0) {
    notes.push("선순위채권을 0원으로 둔 경우 실제 권리관계 확인 후 결과가 달라질 수 있습니다.");
  }
  if (homeType === "single") {
    notes.push("단독·다가구주택은 다른 세입자의 선순위 보증금 확인이 특히 중요합니다.");
  }
  if (guaranteeExceeded) {
    notes.push("전세보증금이 보증 기준 참고 한도를 초과할 수 있습니다.");
  }
  if (shortfall > 0) {
    notes.push("보수적 회수 가정에서 부족 가능 금액이 발생합니다.");
  }
  if (auctionRateWarning) {
    notes.push("예상 낙찰가율이 100%를 넘으면 회수 가능 금액이 낙관적으로 계산될 수 있습니다.");
  }
  if (guaranteeStatus === "possible") {
    notes.push("보증보험 가능 안내를 받았더라도 실제 가입 조건은 기관 심사에서 다시 확인해야 합니다.");
  }
  if (guaranteeStatus === "difficult") {
    notes.push("보증보험 가입이 어려울 수 있다는 안내를 받았다면 보증기관에 세부 사유를 확인하세요.");
  }
  return notes;
}

function buildDecisionSuffix(result) {
  const items = [];
  if (result.guaranteeExceeded) {
    items.push("보증 기준 참고 한도 초과 가능성이 있으므로 보증기관 기준을 별도로 확인하세요.");
  }
  if (result.shortfall > 0) {
    items.push(`보수적 가정에서는 약 ${formatManwon(result.shortfall)}의 부족 가능성이 계산됩니다.`);
  }
  if (result.homeType === "single") {
    items.push("단독·다가구주택은 선순위 임차보증금 확인이 누락되기 쉽습니다.");
  }
  return items.length ? ` ${items.join(" ")}` : "";
}

function readInputNumber(input, fallback = NaN) {
  if (!input) return fallback;
  const rawValue = String(input.value || "").replaceAll(",", "").trim();
  if (rawValue === "") return fallback;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safePercent(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator * 100;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatManwon(value) {
  const won = Math.round(Math.max(0, value) * 10000);
  if (won === 0) return "0원";
  if (won < 100000000) return formatWon(won);

  const eok = Math.floor(won / 100000000);
  const restManwon = Math.round((won % 100000000) / 10000);
  if (restManwon === 0) return `${eok.toLocaleString("ko-KR")}억 원`;
  return `${eok.toLocaleString("ko-KR")}억 ${restManwon.toLocaleString("ko-KR")}만 원`;
}

function showMessage(els, message, type = "default") {
  els.formMessage.textContent = message;
  els.formMessage.dataset.messageType = type;
}

function clearMessage(els) {
  els.formMessage.textContent = "계산 결과는 사용자가 입력한 금액과 비율을 바탕으로 한 참고용 지표입니다. 실제 계약 전에는 공식 자료와 전문가 확인이 필요합니다.";
  els.formMessage.dataset.messageType = "default";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

const TRADE_LOOKUP_DEFAULT_MESSAGE = "실거래가 조회 결과는 기준 매매가격 입력을 돕는 참고 정보입니다. 조회 결과가 없으면 매매가격을 직접 입력해 계산할 수 있습니다.";
const MAX_RENDERED_TRADES = 25;
const TRADE_LOOKUP_TIMEOUT_MS = 12000;
let activeTradeLookupController = null;

async function lookupAptTrades(els) {
  const addressQuery = String(els.tradeAddress.value || "").trim();
  const aptName = String(els.tradeAptName.value || "").trim();
  const months = clampNumber(els.tradeMonths.value, 1, 12, 12);

  if (!addressQuery) {
    showTradeMessage(els, "주소 또는 동 이름을 입력해 주세요. 예: 서울 강서구 화곡동", "error");
    clearTradeResults(els);
    els.tradeAddress.focus();
    return;
  }

  if (!aptName) {
    showTradeMessage(els, "아파트명을 입력해 주세요. 단지명 일부만 입력해도 검색할 수 있습니다.", "error");
    clearTradeResults(els);
    els.tradeAptName.focus();
    return;
  }

  if (activeTradeLookupController) activeTradeLookupController.abort();
  const controller = new AbortController();
  activeTradeLookupController = controller;

  setTradeLoading(els, true);
  clearTradeResults(els);
  showTradeMessage(els, "주소를 확인하고 최근 매매 실거래가를 조회하는 중입니다. 조회가 지연되면 매매가격을 직접 입력해도 됩니다.", "loading");

  try {
    const addressData = await fetchJson(`/api/jeonse-risk/address-search?query=${encodeURIComponent(addressQuery)}&size=5`, {
      signal: controller.signal,
      timeoutMs: TRADE_LOOKUP_TIMEOUT_MS
    });
    const addressItem = selectAddressItem(addressData.items);

    if (!addressItem?.lawdCd) {
      showTradeMessage(els, "주소를 찾지 못했습니다. 시·군·구와 동 이름을 함께 입력해 주세요. 매매가격 직접 입력도 가능합니다.", "error");
      return;
    }

    const tradeUrl = `/api/jeonse-risk/apt-trades?lawdCd=${encodeURIComponent(addressItem.lawdCd)}&aptName=${encodeURIComponent(aptName)}&months=${months}`;
    const tradeData = await fetchJson(tradeUrl, {
      signal: controller.signal,
      timeoutMs: TRADE_LOOKUP_TIMEOUT_MS
    });
    const items = Array.isArray(tradeData.items) ? tradeData.items : [];

    if (!items.length) {
      showTradeMessage(
        els,
        tradeData.noDataMessage || `${addressItem.label || addressQuery} 기준 최근 ${months}개월 내 입력한 아파트명과 일치하는 매매 실거래가를 찾지 못했습니다. 기간을 늘리거나 아파트명을 줄여 조회해 보세요. 매매가격을 직접 입력해 계산할 수도 있습니다.`,
        "error"
      );
      clearTradeResults(els);
      return;
    }

    renderTradeResults(els, {
      addressItem,
      aptName,
      months,
      count: tradeData.count || items.length,
      failedMonths: Array.isArray(tradeData.failedMonths) ? tradeData.failedMonths : [],
      partialFailure: Boolean(tradeData.partialFailure),
      stats: tradeData.stats || null,
      items
    });

    const failNotice = tradeData.failedMonths?.length
      ? ` 일부 월(${tradeData.failedMonths.join(", ")})은 조회에 실패했지만 가능한 결과를 표시했습니다.`
      : "";
    showTradeMessage(
      els,
      `${addressItem.label || addressQuery} 기준 최근 ${months}개월 매매 실거래가 ${items.length}건을 찾았습니다.${failNotice}`,
      tradeData.failedMonths?.length ? "warning" : "success"
    );
  } catch (error) {
    if (error?.name === "AbortError" && controller.signal.aborted) {
      return;
    }
    showTradeMessage(els, getLookupErrorMessage(error), "error");
    clearTradeResults(els);
  } finally {
    if (activeTradeLookupController === controller) {
      activeTradeLookupController = null;
      setTradeLoading(els, false);
    }
  }
}

async function fetchJson(url, { signal, timeoutMs = TRADE_LOOKUP_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
      signal: controller.signal
    });
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    if (!response.ok || data?.ok === false) {
      const message = data?.error || `조회 요청이 실패했습니다. (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.code = data?.code || "LOOKUP_FAILED";
      error.fallback = data?.fallback || "매매가격을 직접 입력해 계산할 수 있습니다.";
      throw error;
    }
    return data || { ok: true, items: [] };
  } finally {
    window.clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortFromParent);
  }
}

function selectAddressItem(items) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => item?.lawdCd) || null;
}

function renderTradeResults(els, { addressItem, aptName, months, count, failedMonths, partialFailure, stats, items }) {
  clearTradeResults(els);
  const visibleItems = items.slice(0, MAX_RENDERED_TRADES);
  const wrapper = document.createElement("div");
  wrapper.className = "jeonse-trade-results-inner";

  const heading = document.createElement("div");
  heading.className = "jeonse-trade-results-heading";
  const title = document.createElement("strong");
  title.textContent = "최근 아파트 매매 실거래가";
  const summary = document.createElement("span");
  summary.textContent = `${addressItem.label || "선택 지역"} · ${aptName} · 최근 ${months}개월 · ${count}건`;
  heading.append(title, summary);
  wrapper.append(heading);

  if (stats) {
    wrapper.append(createTradeStats(stats));
  }

  if (partialFailure || failedMonths?.length) {
    const warning = document.createElement("p");
    warning.className = "fine-print jeonse-trade-warning";
    warning.textContent = failedMonths?.length ? `일부 월(${failedMonths.join(", ")})은 조회에 실패했습니다. 표시된 거래만 참고하세요.` : "일부 조회가 지연되어 가능한 결과만 표시했습니다.";
    wrapper.append(warning);
  }

  const list = document.createElement("div");
  list.className = "jeonse-trade-card-list";
  visibleItems.forEach((item, index) => {
    list.append(createTradeCard(item, index));
  });
  wrapper.append(list);

  if (items.length > visibleItems.length) {
    const limitNotice = document.createElement("p");
    limitNotice.className = "fine-print";
    limitNotice.textContent = `화면에는 최신 거래 ${visibleItems.length}건만 표시합니다. 아파트명을 더 구체적으로 입력하면 결과를 줄일 수 있습니다.`;
    wrapper.append(limitNotice);
  }

  const notice = document.createElement("p");
  notice.className = "fine-print";
  notice.textContent = "선택한 거래금액은 기준 매매가격 입력칸에만 반영됩니다. 보증금과 선순위채권을 확인한 뒤 직접 계산 버튼을 눌러 주세요.";
  wrapper.append(notice);

  els.tradeResults.append(wrapper);
  els.tradeResults.hidden = false;
}

function createTradeStats(stats) {
  const statsBox = document.createElement("div");
  statsBox.className = "jeonse-trade-stats";

  const pairs = [
    ["최신", stats.latestAmountLabel],
    ["중간값", stats.medianAmountLabel],
    ["평균", stats.averageAmountLabel]
  ].filter(([, value]) => value);

  pairs.forEach(([label, value]) => {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, document.createTextNode(` ${value}`));
    statsBox.append(item);
  });

  const notice = document.createElement("small");
  notice.textContent = "요약값은 화면에 표시된 거래 기준이며, 면적·층·거래 조건 차이를 반영하지 않는 참고값입니다.";
  statsBox.append(notice);
  return statsBox;
}

function createTradeCard(item, index) {
  const card = document.createElement("article");
  card.className = "jeonse-trade-card";

  const body = document.createElement("div");
  body.className = "jeonse-trade-card-body";

  const amount = document.createElement("strong");
  amount.textContent = item.dealAmountLabel || formatManwon(item.dealAmountManwon || 0);

  const name = document.createElement("span");
  name.textContent = [item.aptName, item.umdNm].filter(Boolean).join(" · ") || "아파트 거래";

  const meta = document.createElement("small");
  meta.textContent = formatTradeMeta(item);

  body.append(amount, name, meta);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "subtle-button jeonse-use-trade-button";
  button.textContent = "이 가격 사용";
  button.dataset.jeonseUseTrade = "true";
  button.dataset.amountManwon = String(Math.round(Number(item.dealAmountManwon) || 0));
  button.dataset.amountLabel = item.dealAmountLabel || formatManwon(item.dealAmountManwon || 0);
  button.dataset.tradeSummary = `${item.dealDate || "거래일 미상"} ${item.aptName || "아파트"}`;
  button.dataset.tradeDetail = buildTradeDetail(item);
  button.dataset.tradeIndex = String(index);
  button.setAttribute("aria-label", `${index + 1}번째 거래금액 ${button.dataset.amountLabel}을 매매가격으로 사용`);

  card.append(body, button);
  return card;
}

function formatTradeMeta(item) {
  const parts = [];
  if (item.dealDate) parts.push(item.dealDate.replaceAll("-", "."));
  if (item.areaLabel) parts.push(item.areaLabel);
  if (item.floor) parts.push(`${item.floor}층`);
  if (item.buildYear) parts.push(`${item.buildYear}년식`);
  return parts.join(" · ") || "거래 상세 정보 없음";
}

function buildTradeDetail(item) {
  const parts = [];
  if (item.aptName) parts.push(item.aptName);
  if (item.umdNm) parts.push(item.umdNm);
  const meta = formatTradeMeta(item);
  if (meta) parts.push(meta);
  return parts.join(" · ") || "거래 상세 정보 없음";
}

function renderSelectedTrade(els, { amountLabel, amountManwon, tradeSummary, tradeDetail }) {
  els.selectedTrade.hidden = false;
  els.selectedTrade.dataset.amountManwon = String(amountManwon);
  els.selectedTradeSummary.textContent = `${amountLabel} · ${tradeSummary} · ${tradeDetail}. 선택한 거래금액은 기준 매매가격 입력칸에만 반영되며, 보증금 안전성이나 보증보험 가입 가능 여부를 확정하지 않습니다.`;
}

function handleMarketPriceManualEdit(els) {
  if (els.marketPrice.dataset.priceSource !== "trade") return;
  const selectedAmount = els.marketPrice.dataset.selectedTradeAmount;
  if (!selectedAmount || String(els.marketPrice.value || "").trim() === selectedAmount) return;
  clearSelectedTrade(els, { keepMarketPrice: true });
  els.marketPrice.dataset.priceSource = "manual";
  showTradeMessage(els, "매매가격을 직접 수정했습니다. 실거래가 선택 표시는 해제되고 현재 입력값을 기준으로 계산할 수 있습니다.", "default");
}

function clearSelectedTrade(els, { keepMarketPrice = true } = {}) {
  clearTradeCardSelection(els);
  els.selectedTrade.hidden = true;
  els.selectedTrade.removeAttribute("data-amount-manwon");
  els.selectedTradeSummary.textContent = "거래를 선택하면 매매가격 입력칸에 반영됩니다.";
  delete els.marketPrice.dataset.priceSource;
  delete els.marketPrice.dataset.selectedTradeAmount;
  if (!keepMarketPrice) els.marketPrice.value = "";
}

function clearTradeCardSelection(els) {
  els.tradeResults.querySelectorAll(".jeonse-trade-card.is-selected").forEach((card) => {
    card.classList.remove("is-selected");
  });
  els.tradeResults.querySelectorAll("[data-jeonse-use-trade]").forEach((tradeButton) => {
    tradeButton.setAttribute("aria-pressed", "false");
    tradeButton.textContent = "이 가격 사용";
  });
}

function applyTradePrice(els, button) {
  const amountManwon = Number(button.dataset.amountManwon);
  if (!Number.isFinite(amountManwon) || amountManwon <= 0) {
    showTradeMessage(els, "선택한 거래금액을 읽지 못했습니다. 매매가격을 직접 입력해 주세요.", "error");
    return;
  }

  clearTradeCardSelection(els);
  const card = button.closest(".jeonse-trade-card");
  if (card) card.classList.add("is-selected");
  button.setAttribute("aria-pressed", "true");
  button.textContent = "선택됨";

  const roundedAmount = Math.round(amountManwon);
  els.marketPrice.value = String(roundedAmount);
  els.marketPrice.dataset.priceSource = "trade";
  els.marketPrice.dataset.selectedTradeAmount = String(roundedAmount);
  if (els.homeType) els.homeType.value = "apartment";

  renderSelectedTrade(els, {
    amountLabel: button.dataset.amountLabel || formatManwon(amountManwon),
    amountManwon: roundedAmount,
    tradeSummary: button.dataset.tradeSummary || "선택한 아파트 매매 실거래가",
    tradeDetail: button.dataset.tradeDetail || "거래 상세 정보 없음"
  });

  els.marketPrice.dispatchEvent(new Event("input", { bubbles: true }));
  showTradeMessage(
    els,
    `${button.dataset.amountLabel || formatManwon(amountManwon)}을 기준 매매가격에 반영했습니다. 전세보증금과 선순위채권을 확인한 뒤 계산 버튼을 눌러 주세요.`,
    "success"
  );
  els.marketPrice.focus({ preventScroll: true });
}

function setTradeLoading(els, isLoading) {
  els.tradeSearchButton.disabled = isLoading;
  els.tradeSearchButton.textContent = isLoading ? "조회 중..." : "최근 매매가 조회";
  els.tradeSearchButton.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function showTradeMessage(els, message, type = "default") {
  els.tradeMessage.textContent = message;
  els.tradeMessage.dataset.messageType = type;
}

function clearTradeLookup(els) {
  clearSelectedTrade(els, { keepMarketPrice: true });
  if (els.tradeAddress) els.tradeAddress.value = "";
  if (els.tradeAptName) els.tradeAptName.value = "";
  if (els.tradeMonths) els.tradeMonths.value = "12";
  showTradeMessage(els, TRADE_LOOKUP_DEFAULT_MESSAGE, "default");
  clearTradeResults(els);
  setTradeLoading(els, false);
}

function clearTradeResults(els) {
  els.tradeResults.replaceChildren();
  els.tradeResults.hidden = true;
}

function getLookupErrorMessage(error) {
  if (error?.name === "AbortError") return "실거래가 조회 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 계산해 주세요.";
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  if (code === "MISSING_KAKAO_KEY" || message.includes("KAKAO_REST_API_KEY")) return "주소 검색 설정을 확인하는 중 문제가 발생했습니다. 매매가격을 직접 입력해 계산할 수 있습니다.";
  if (code === "MISSING_PUBLIC_DATA_KEY" || message.includes("MOLIT_RTMS_API_KEY") || message.includes("PUBLIC_DATA_API_KEY")) return "실거래가 조회 설정을 확인하는 중 문제가 발생했습니다. 매매가격을 직접 입력해 계산할 수 있습니다.";
  if (code.includes("TIMEOUT") || message.includes("지연")) return "실거래가 조회 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 계산해 주세요.";
  if (code === "RTMS_ALL_MONTHS_FAILED") return "최근 매매 실거래가 조회가 일시적으로 실패했습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 계산할 수 있습니다.";
  if (message.includes("주소")) return message;
  if (message.includes("실거래가") || message.includes("조회")) return `${message} 매매가격을 직접 입력해 계산할 수 있습니다.`;
  return "실거래가 조회 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 매매가격을 직접 입력해 계산해 주세요.";
}

function bootJeonseRiskCalculator() {
  initJeonseRiskCalculator();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootJeonseRiskCalculator, { once: true });
  } else {
    bootJeonseRiskCalculator();
  }
}
