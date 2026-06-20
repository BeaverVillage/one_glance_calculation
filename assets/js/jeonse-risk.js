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
    resultPanel: root.querySelector("#jeonse-risk-result-panel"),
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
    tradeAddress: root.querySelector("#jeonse-place-query"),
    placeSearchButton: root.querySelector("#jeonse-place-search"),
    placeResults: root.querySelector("#jeonse-place-results"),
    selectedRegion: root.querySelector("#jeonse-selected-region"),
    lawdCd: root.querySelector("#jeonse-lawd-cd"),
    placeModal: root.querySelector("#jeonse-place-modal"),
    placeModalSummary: root.querySelector("#jeonse-place-modal-summary"),
    placeModalCloseButtons: root.querySelectorAll("[data-jeonse-place-close]"),
    tradeAptName: root.querySelector("#jeonse-apt-name"),
    tradeMonths: root.querySelector("#jeonse-trade-months"),
    tradeDealYmd: root.querySelector("#jeonse-trade-deal-ymd"),
    tradeSearchButton: root.querySelector("#jeonse-trade-search-button"),
    tradeMessage: root.querySelector("#jeonse-trade-message"),
    tradeResults: root.querySelector("#jeonse-trade-results"),
    tradeModal: root.querySelector("#jeonse-trade-modal"),
    tradeModalSummary: root.querySelector("#jeonse-trade-modal-summary"),
    tradeModalCloseButtons: root.querySelectorAll("[data-jeonse-trade-close]"),
    selectedTrade: root.querySelector("#jeonse-selected-trade"),
    selectedTradeSummary: root.querySelector("#jeonse-selected-trade-summary"),
    clearSelectedTradeButton: root.querySelector("#jeonse-clear-selected-trade")
  };

  if (Object.values(els).some((element) => !element)) return;

  form.dataset.calculatorReady = "jeonse-risk";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update(els, { scrollToResult: true });
  });

  form.addEventListener("input", () => {
    clearMessage(els);
  });

  form.addEventListener("change", () => {
    clearMessage(els);
  });

  els.exampleButton.addEventListener("click", () => {
    fillExample(els);
    update(els, { scrollToResult: false });
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      renderPlaceholder(els);
      clearMessage(els);
      clearTradeLookup(els);
    }, 0);
  });

  if (els.placeSearchButton && els.tradeAddress) {
    els.placeSearchButton.addEventListener("click", () => {
      fetchPlaceCandidates(els);
    });
    els.tradeAddress.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      fetchPlaceCandidates(els);
    });
  }

  els.tradeSearchButton.addEventListener("click", () => {
    lookupAptTrades(els);
  });

  els.tradeAptName.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    lookupAptTrades(els);
  });

  els.tradeDealYmd.addEventListener("input", () => {
    els.tradeDealYmd.value = String(els.tradeDealYmd.value || "").replace(/\D/g, "").slice(0, 6);
  });

  els.tradeDealYmd.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    lookupAptTrades(els);
  });

  if (els.placeModalCloseButtons?.length) {
    els.placeModalCloseButtons.forEach((button) => {
      button.addEventListener("click", () => closePlaceModal(els));
    });
  }

  if (els.tradeModalCloseButtons?.length) {
    els.tradeModalCloseButtons.forEach((button) => {
      button.addEventListener("click", () => closeTradeModal(els));
    });
  }

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closePlaceModal(els);
    closeTradeModal(els);
  });

  form.addEventListener("click", (event) => {
    const exampleButton = event.target.closest("[data-jeonse-fill-query]");
    if (!exampleButton) return;
    els.tradeAddress.value = exampleButton.dataset.address || "";
    els.tradeAptName.value = exampleButton.dataset.aptName || "";
    if (els.lawdCd) els.lawdCd.value = "";
    if (els.selectedRegion) {
      els.selectedRegion.textContent = "선택된 지역이 없습니다. 지역/단지를 검색해 선택해 주세요.";
      delete els.selectedRegion.dataset.regionLabel;
    }
    showTradeMessage(els, "예시 검색어를 입력했습니다. 검색 버튼을 눌러 지역을 선택해 주세요.", "default");
    clearTradeResults(els);
    els.tradeAddress.focus({ preventScroll: true });
  });

  els.tradeResults.addEventListener("click", (event) => {
    const expandButton = event.target.closest("[data-jeonse-expand-months]");
    if (expandButton) {
      applyTradeMonthExpansion(els, expandButton);
      return;
    }

    const focusButton = event.target.closest("[data-jeonse-focus-input]");
    if (focusButton) {
      focusTradeInput(els, focusButton.dataset.jeonseFocusInput);
      return;
    }

    const candidateButton = event.target.closest("[data-jeonse-use-candidate]");
    if (candidateButton) {
      applyAptCandidate(els, candidateButton);
      return;
    }

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

function update(els, options = {}) {
  const validation = validate(els.form);
  if (!validation.ok) {
    showMessage(els, validation.message, "error");
    renderPlaceholder(els);
    focusFirstInvalidInput(els, validation.message);
    return;
  }

  const result = calculateJeonseRisk(validation.values);
  renderResult(els, result);
  if (options.scrollToResult) {
    scrollToResultPanelIfNeeded(els);
  }
}


function focusFirstInvalidInput(els, message = "") {
  const target = message.includes("매매가격")
    ? els.marketPrice
    : message.includes("전세보증금")
      ? els.deposit
      : message.includes("선순위채권")
        ? els.priorityDebt
        : message.includes("낙찰가율")
          ? els.auctionRate
          : null;

  if (target && typeof target.focus === "function") {
    target.focus({ preventScroll: false });
  }
}

function scrollToResultPanelIfNeeded(els) {
  const panel = els.resultPanel;
  if (!panel || typeof panel.scrollIntoView !== "function") return;

  window.requestAnimationFrame(() => {
    const shouldAlwaysScroll = window.matchMedia("(max-width: 860px)").matches;
    const shouldScroll = shouldAlwaysScroll || !isMostlyInViewport(panel);
    if (!shouldScroll) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });

    window.setTimeout(() => {
      if (typeof panel.focus === "function") panel.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : 280);
  });
}

function isMostlyInViewport(element) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
  const minHeight = Math.min(rect.height * 0.65, 260);
  const minWidth = Math.min(rect.width * 0.65, 260);
  return visibleHeight >= minHeight && visibleWidth >= minWidth;
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

function normalizeDealYmdInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 6);
  if (!digits) return "";
  if (digits.length !== 6) return "";
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  if (!Number.isInteger(year) || year < 2006 || year > 2099) return "";
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return digits;
}

function formatDealYmdLabel(dealYmd) {
  const normalized = normalizeDealYmdInput(dealYmd);
  if (!normalized) return "계약년월 직접 조회";
  return `${normalized.slice(0, 4)}년 ${Number(normalized.slice(4, 6))}월`;
}

const TRADE_LOOKUP_DEFAULT_MESSAGE = "계약년월을 입력하면 해당 월 1회 조회로 더 안정적으로 확인합니다.";
const MAX_RENDERED_TRADES = 25;
const TRADE_LOOKUP_TIMEOUT_MS = 12000;
let activeTradeLookupController = null;

async function fetchPlaceCandidates(els) {
  const query = String(els.tradeAddress?.value || "").trim();
  if (!query) {
    showTradeMessage(els, "검색할 지역이나 단지명을 입력해 주세요.", "error");
    els.tradeAddress.focus();
    return;
  }

  showTradeMessage(els, "장소 후보를 검색하는 중입니다.", "loading");
  if (els.placeModalSummary) els.placeModalSummary.textContent = "";
  if (els.placeSearchButton) els.placeSearchButton.disabled = true;

  try {
    const response = await fetch(`/api/real-estate/place-search?q=${encodeURIComponent(query)}&size=8`, {
      headers: { accept: "application/json" },
      credentials: "same-origin"
    });
    const data = await response.json();
    if (!response.ok || data?.ok === false) throw new Error(data?.error || "장소 검색 실패");
    renderPlaceCandidates(els, data.items || []);
  } catch (error) {
    showTradeMessage(els, error?.message || "장소 검색에 실패했습니다. 지역명을 더 구체적으로 입력해 주세요.", "error");
    closePlaceModal(els);
  } finally {
    if (els.placeSearchButton) els.placeSearchButton.disabled = false;
  }
}

function renderPlaceCandidates(els, items) {
  if (!els.placeResults) return;
  if (!items.length) {
    showTradeMessage(els, "검색 결과가 없습니다. 시·군·구와 동 이름을 함께 입력해 보세요.", "warning");
    closePlaceModal(els);
    return;
  }

  const query = String(els.tradeAddress?.value || "").trim();
  if (els.placeModalSummary) {
    els.placeModalSummary.textContent = query ? `검색어: ${query} · 결과 ${items.length}개` : `검색 결과 ${items.length}개`;
  }

  els.placeResults.replaceChildren();
  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "rent-place-result";
    button.type = "button";
    button.dataset.placeIndex = String(index);

    const title = document.createElement("strong");
    title.textContent = item.name || "이름 없음";
    const address = document.createElement("span");
    address.textContent = item.address || "주소 정보 없음";
    button.append(title, address);
    if (item.category) {
      const category = document.createElement("em");
      category.textContent = item.category;
      button.append(category);
    }
    const pick = document.createElement("b");
    pick.textContent = "이 지역 선택";
    button.append(pick);
    button.addEventListener("click", async () => {
      await selectPlaceCandidate(els, item);
    });
    els.placeResults.append(button);
  });

  showTradeMessage(els, "팝업에서 조회할 지역을 선택해 주세요.", "default");
  openPlaceModal(els);
}

async function selectPlaceCandidate(els, item) {
  if (!item || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) {
    showTradeMessage(els, "선택한 장소의 좌표를 확인할 수 없습니다.", "error");
    return;
  }

  showTradeMessage(els, "선택한 위치의 법정동코드를 확인하는 중입니다.", "loading");
  try {
    const params = new URLSearchParams({ lat: String(item.lat), lng: String(item.lng) });
    const response = await fetch(`/api/real-estate/region-code?${params.toString()}`, {
      headers: { accept: "application/json" },
      credentials: "same-origin"
    });
    const data = await response.json();
    if (!response.ok || data?.ok === false) throw new Error(data?.error || "법정동 코드 변환 실패");

    const regionLabel = [data.region1, data.region2, data.region3].filter(Boolean).join(" ") || item.address || item.name || "선택 지역";
    els.lawdCd.value = data.lawdCd || "";
    els.selectedRegion.textContent = `${regionLabel} · 법정동코드 ${data.lawdCd} 자동 적용`;
    els.selectedRegion.dataset.regionLabel = regionLabel;

    const inferredName = inferApartmentNameFromPlace(item, els.tradeAddress.value);
    if (inferredName && !String(els.tradeAptName.value || "").trim()) {
      els.tradeAptName.value = inferredName;
    }

    closePlaceModal(els);
    showTradeMessage(els, "지역이 선택되었습니다. 단지명을 비워두면 선택 지역의 최근 거래를 조회합니다.", "success");
    window.setTimeout(() => els.tradeSearchButton?.focus({ preventScroll: true }), 120);
  } catch (error) {
    showTradeMessage(els, error?.message || "법정동코드 확인에 실패했습니다.", "error");
  }
}

function inferApartmentNameFromPlace(item, query) {
  const name = String(item?.name || "").trim();
  const category = String(item?.category || "").trim();
  const looksResidential = /아파트|주상복합|오피스텔|빌라|맨션|타운|마을|단지|자이|래미안|푸르지오|힐스테이트|아이파크|리센츠|센트럴/i.test(`${name} ${category}`);
  if (looksResidential && name) return name.replace(/\s+/g, " ");

  const raw = String(query || "").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const maybeApt = tokens.filter((token) => /\d+단지|마을|아파트|자이|래미안|푸르지오|힐스테이트|아이파크|리센츠|센트럴|파크|타운/i.test(token)).join(" ");
  return maybeApt || "";
}

function openPlaceModal(els) {
  if (!els.placeModal) return;
  els.placeModal.hidden = false;
  els.placeModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closePlaceModal(els) {
  if (!els.placeModal || els.placeModal.hidden) return;
  els.placeModal.hidden = true;
  els.placeModal.setAttribute("aria-hidden", "true");
  if (!els.tradeModal || els.tradeModal.hidden) document.body.classList.remove("modal-open");
}

function openTradeModal(els, summary = "") {
  if (!els.tradeModal) return;
  if (els.tradeModalSummary) els.tradeModalSummary.textContent = summary || "거래를 선택하면 매매가격 입력칸에 반영됩니다.";
  els.tradeModal.hidden = false;
  els.tradeModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeTradeModal(els) {
  if (!els.tradeModal || els.tradeModal.hidden) return;
  els.tradeModal.hidden = true;
  els.tradeModal.setAttribute("aria-hidden", "true");
  if (!els.placeModal || els.placeModal.hidden) document.body.classList.remove("modal-open");
}

async function lookupAptTrades(els) {
  const aptName = String(els.tradeAptName.value || "").trim();
  const months = clampNumber(els.tradeMonths.value, 1, 12, 3);
  const rawDealYmd = String(els.tradeDealYmd?.value || "").trim();
  const dealYmd = normalizeDealYmdInput(rawDealYmd);
  const lawdCd = getSelectedLawdCd(els);
  const selectedLabel = els.selectedRegion?.dataset.regionLabel || "선택 지역";

  if (!lawdCd) {
    showTradeMessage(els, "먼저 지역/단지를 검색하고 팝업에서 지역을 선택해 주세요.", "error");
    clearTradeResults(els);
    els.tradeAddress.focus();
    return;
  }

  if (rawDealYmd && !dealYmd) {
    showTradeMessage(els, "계약년월은 YYYYMM 형식으로 입력해 주세요. 예: 202505", "error");
    els.tradeDealYmd.focus();
    return;
  }

  const periodLabel = dealYmd ? formatDealYmdLabel(dealYmd) : `최근 ${months}개월`;

  if (activeTradeLookupController) activeTradeLookupController.abort();
  const controller = new AbortController();
  activeTradeLookupController = controller;

  setTradeLoading(els, true);
  clearTradeResults(els);
  showTradeMessage(
    els,
    `${selectedLabel} 기준 ${periodLabel} 매매 실거래가를 조회하는 중입니다.${aptName ? "" : " 단지명 없이 지역 전체 거래를 확인합니다."}`,
    "loading"
  );

  try {
    const tradeUrl = buildAptTradesUrl({ lawdCd, aptName, months, dealYmd });
    const tradeData = await fetchJson(tradeUrl, {
      signal: controller.signal,
      timeoutMs: TRADE_LOOKUP_TIMEOUT_MS
    });
    const addressItem = {
      label: selectedLabel,
      lawdCd
    };
    const resolvedAptName = aptName;
    const items = Array.isArray(tradeData.items) ? tradeData.items : [];
    const candidates = Array.isArray(tradeData.candidates) ? tradeData.candidates : [];

    if (!items.length) {
      if (candidates.length) {
        renderTradeCandidateResults(els, {
          addressItem,
          aptName: resolvedAptName,
          months,
          dealYmd,
          periodLabel,
          candidates,
          noDataMessage: tradeData.noDataMessage || "정확히 일치하는 거래는 없지만 비슷한 단지 후보를 찾았습니다."
        });
        openTradeModal(els, `${selectedLabel} · ${resolvedAptName || "지역 전체"} · 후보 ${candidates.length}개`);
        showTradeMessage(
          els,
          tradeData.noDataMessage || `${selectedLabel} 기준으로 비슷한 단지 후보 ${candidates.length}개를 찾았습니다. 찾는 단지를 선택해 다시 조회해 주세요.`,
          "warning"
        );
        return;
      }

      const noDataMessage = tradeData.noDataMessage || (resolvedAptName ? `${selectedLabel} 기준 ${periodLabel} 내 ${resolvedAptName} 매매 실거래가를 찾지 못했습니다. 조회 기간을 늘리거나 계약년월을 직접 입력해 보세요. 매매가격을 직접 입력할 수도 있습니다.` : `${selectedLabel} 기준 ${periodLabel} 내 아파트 매매 실거래가를 찾지 못했습니다. 조회 기간을 늘리거나 계약년월을 직접 입력해 보세요.`);
      renderTradeNoDataActions(els, {
        title: "일치하는 매매 거래가 없습니다",
        message: noDataMessage,
        months,
        dealYmd,
        addressQuery: selectedLabel,
        aptName: resolvedAptName
      });
      openTradeModal(els, `${selectedLabel} · ${resolvedAptName || "지역 전체"} · ${periodLabel}`);
      showTradeMessage(els, noDataMessage, "warning");
      return;
    }

    renderTradeResults(els, {
      addressItem,
      aptName: resolvedAptName,
      months,
      dealYmd,
      periodLabel,
      count: tradeData.count || items.length,
      failedMonths: Array.isArray(tradeData.failedMonths) ? tradeData.failedMonths : [],
      partialFailure: Boolean(tradeData.partialFailure),
      stats: tradeData.stats || null,
      items
    });
    openTradeModal(els, `${selectedLabel} · ${resolvedAptName || "지역 전체"} · ${periodLabel} · ${items.length}건`);

    const failNotice = tradeData.failedMonths?.length
      ? ` 일부 월(${tradeData.failedMonths.join(", ")})은 조회에 실패했지만 가능한 결과를 표시했습니다.`
      : "";
    showTradeMessage(
      els,
      `${selectedLabel} 기준 ${periodLabel} ${resolvedAptName ? `${resolvedAptName} ` : ""}매매 실거래가 ${items.length}건을 찾았습니다.${failNotice}`,
      tradeData.failedMonths?.length ? "warning" : "success"
    );
  } catch (error) {
    if (error?.name === "AbortError" && controller.signal.aborted) {
      return;
    }
    const message = getLookupErrorMessage(error, { dealYmd });
    showTradeMessage(els, message, "warning");
    renderTradeNoDataActions(els, {
      title: dealYmd ? "해당 계약년월 조회가 지연되고 있습니다" : "실거래가 보조 조회가 지연되고 있습니다",
      message,
      months,
      dealYmd,
      addressQuery: selectedLabel,
      aptName
    });
    openTradeModal(els, `${selectedLabel} · ${aptName || "지역 전체"} · 조회 지연`);
  } finally {
    if (activeTradeLookupController === controller) {
      activeTradeLookupController = null;
      setTradeLoading(els, false);
    }
  }
}

function buildAptTradesUrl({ lawdCd, aptName, months, dealYmd }) {
  const params = new URLSearchParams();
  params.set("lawdCd", lawdCd);
  params.set("aptName", aptName || "");
  if (dealYmd) params.set("dealYmd", dealYmd);
  else params.set("months", String(months));
  params.set("numOfRows", "100");
  return `/api/jeonse-risk/apt-trades?${params.toString()}`;
}

function getSelectedLawdCd(els) {
  return String(els.lawdCd?.value || "").replace(/\D/g, "").slice(0, 5);
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
      const message = data?.error || buildHttpLookupMessage(response.status);
      const error = new Error(message);
      error.status = response.status;
      error.code = data?.code || "LOOKUP_FAILED";
      error.fallback = data?.fallback || "매매가격을 직접 입력해 계산할 수 있습니다.";
      error.noDataMessage = data?.noDataMessage || "";
      throw error;
    }
    return data || { ok: true, items: [] };
  } finally {
    window.clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortFromParent);
  }
}

function buildHttpLookupMessage(status) {
  if (status >= 500) {
    return "실거래가 보조 조회가 일시적으로 지연되고 있습니다. 조회 기간을 줄이거나 단지명을 더 구체적으로 입력해 주세요. 매매가격을 직접 입력해 계산할 수도 있습니다.";
  }
  if (status === 404) {
    return "실거래가 조회 경로를 찾지 못했습니다. 매매가격을 직접 입력해 계산할 수 있습니다.";
  }
  return `조회 요청이 실패했습니다. 매매가격을 직접 입력해 계산할 수 있습니다.`;
}

function selectAddressItem(items) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => item?.lawdCd) || null;
}

function renderTradeResults(els, { addressItem, aptName, months, dealYmd, periodLabel, count, failedMonths, partialFailure, stats, items }) {
  clearTradeResults(els);
  const visibleItems = items.slice(0, MAX_RENDERED_TRADES);
  const wrapper = document.createElement("div");
  wrapper.className = "jeonse-trade-results-inner";

  const heading = document.createElement("div");
  heading.className = "jeonse-trade-results-heading";
  const title = document.createElement("strong");
  title.textContent = "최근 아파트 매매 실거래가";
  const summary = document.createElement("span");
  summary.textContent = [addressItem.label || "선택 지역", aptName || "지역 전체", periodLabel || (dealYmd ? formatDealYmdLabel(dealYmd) : `최근 ${months}개월`), `${count}건`].filter(Boolean).join(" · ");
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
    limitNotice.textContent = aptName ? `화면에는 최신 거래 ${visibleItems.length}건만 표시합니다. 단지명을 더 구체적으로 입력하면 결과를 줄일 수 있습니다.` : `화면에는 최신 거래 ${visibleItems.length}건만 표시합니다. 단지명으로 좁히면 원하는 거래를 더 빨리 찾을 수 있습니다.`;
    wrapper.append(limitNotice);
  }

  const notice = document.createElement("p");
  notice.className = "fine-print";
  notice.textContent = "선택한 거래금액은 기준 매매가격 입력칸에만 반영됩니다. 보증금과 선순위채권을 확인한 뒤 직접 계산 버튼을 눌러 주세요.";
  wrapper.append(notice);

  els.tradeResults.append(wrapper);
  els.tradeResults.hidden = false;
}


function renderTradeCandidateResults(els, { addressItem, aptName, months, dealYmd, periodLabel, candidates, noDataMessage }) {
  clearTradeResults(els);
  const wrapper = document.createElement("div");
  wrapper.className = "jeonse-trade-results-inner";

  const heading = document.createElement("div");
  heading.className = "jeonse-trade-results-heading";
  const title = document.createElement("strong");
  title.textContent = "비슷한 단지 후보";
  const summary = document.createElement("span");
  summary.textContent = [addressItem.label || "선택 지역", aptName || "지역 전체", periodLabel || (dealYmd ? formatDealYmdLabel(dealYmd) : `최근 ${months}개월`)].filter(Boolean).join(" · ");
  heading.append(title, summary);
  wrapper.append(heading);

  const notice = document.createElement("p");
  notice.className = "fine-print jeonse-trade-warning";
  notice.textContent = noDataMessage || "정확히 일치하는 매매 실거래가는 없지만 비슷한 단지 후보를 찾았습니다. 찾는 단지를 선택해 다시 조회해 주세요.";
  wrapper.append(notice);

  const list = document.createElement("div");
  list.className = "jeonse-trade-card-list jeonse-candidate-card-list";
  candidates.slice(0, 10).forEach((candidate, index) => {
    list.append(createCandidateCard(candidate, index));
  });
  wrapper.append(list);

  wrapper.append(createLookupActionPanel({
    message: "후보가 맞는데 거래가 보이지 않으면 조회 기간을 늘리거나 계약년월로 다시 확인해 보세요.",
    months,
    dealYmd,
    showAptFocus: true
  }));

  const fallbackNotice = document.createElement("p");
  fallbackNotice.className = "fine-print";
  fallbackNotice.textContent = "후보 단지를 선택해도 거래가 없으면 조회 기간을 6개월 또는 12개월로 늘리거나, 매매가격을 직접 입력해 계산할 수 있습니다.";
  wrapper.append(fallbackNotice);

  els.tradeResults.append(wrapper);
  els.tradeResults.hidden = false;
}

function renderTradeNoDataActions(els, { title, message, months, dealYmd, addressQuery, aptName }) {
  clearTradeResults(els);
  const wrapper = document.createElement("div");
  wrapper.className = "jeonse-trade-results-inner";

  const panel = document.createElement("div");
  panel.className = "jeonse-lookup-action-panel";

  const heading = document.createElement("strong");
  heading.textContent = title || "실거래가 조회 결과가 없습니다";

  const copy = document.createElement("p");
  copy.className = "fine-print";
  copy.textContent = message || "조회 기간을 늘리거나 단지명을 더 구체적으로 입력해 보세요. 매매가격을 직접 입력해 계산할 수도 있습니다.";

  panel.append(heading, copy);
  panel.append(createLookupActionPanel({
    message: buildLookupActionHint({ months, dealYmd, addressQuery, aptName }),
    months,
    dealYmd,
    showAptFocus: true,
    showAddressFocus: true
  }));

  wrapper.append(panel);
  els.tradeResults.append(wrapper);
  els.tradeResults.hidden = false;
}

function createLookupActionPanel({ message, months, dealYmd, showAptFocus = false, showAddressFocus = false }) {
  const panel = document.createElement("div");
  panel.className = "jeonse-lookup-action-list";

  const help = document.createElement("p");
  help.className = "fine-print";
  help.textContent = message || "아래 방법으로 다시 조회할 수 있습니다.";
  panel.append(help);

  const actions = document.createElement("div");
  actions.className = "jeonse-lookup-action-buttons";

  [6, 12].forEach((targetMonths) => {
    if (Number(months) >= targetMonths && !dealYmd) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subtle-button jeonse-lookup-action-button";
    button.textContent = `최근 ${targetMonths}개월로 다시 조회`;
    button.dataset.jeonseExpandMonths = String(targetMonths);
    actions.append(button);
  });

  const dealButton = document.createElement("button");
  dealButton.type = "button";
  dealButton.className = "subtle-button jeonse-lookup-action-button";
  dealButton.textContent = "계약년월 직접 입력";
  dealButton.dataset.jeonseFocusInput = "dealYmd";
  actions.append(dealButton);

  if (showAptFocus) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subtle-button jeonse-lookup-action-button";
    button.textContent = "단지명 수정";
    button.dataset.jeonseFocusInput = "apt";
    actions.append(button);
  }

  if (showAddressFocus) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subtle-button jeonse-lookup-action-button";
    button.textContent = "주소 수정";
    button.dataset.jeonseFocusInput = "address";
    actions.append(button);
  }

  const manual = document.createElement("button");
  manual.type = "button";
  manual.className = "subtle-button jeonse-lookup-action-button";
  manual.textContent = "매매가격 직접 입력";
  manual.dataset.jeonseFocusInput = "market";
  actions.append(manual);

  panel.append(actions);
  return panel;
}

function buildLookupActionHint({ months, dealYmd, aptName }) {
  const parts = [];
  if (dealYmd) parts.push("다른 계약년월을 입력하거나 최근 기간 조회로 다시 확인할 수 있습니다.");
  else if (Number(months) < 12) parts.push("거래가 드문 단지는 조회 기간을 늘리면 찾을 수 있습니다.");
  if (aptName) parts.push("단지명을 줄이거나 핵심 단어로 바꿔 다시 조회할 수 있습니다."); else parts.push("단지명으로 좁히면 원하는 거래를 더 빨리 찾을 수 있습니다.");
  parts.push("조회가 계속 안 되면 매매가격을 직접 입력해 전세가율 계산을 이어갈 수 있습니다.");
  return parts.join(" ");
}

function applyTradeMonthExpansion(els, button) {
  const nextMonths = clampNumber(button.dataset.jeonseExpandMonths, 1, 12, 3);
  els.tradeMonths.value = String(nextMonths);
  if (els.tradeDealYmd) els.tradeDealYmd.value = "";
  showTradeMessage(els, `최근 ${nextMonths}개월 기준으로 다시 조회합니다.`, "loading");
  lookupAptTrades(els);
}

function focusTradeInput(els, target) {
  const map = {
    address: els.tradeAddress,
    apt: els.tradeAptName,
    market: els.marketPrice,
    dealYmd: els.tradeDealYmd
  };
  const input = map[target] || els.tradeAptName || els.marketPrice;
  closeTradeModal(els);
  window.setTimeout(() => {
    input.focus({ preventScroll: false });
    if (typeof input.select === "function") input.select();
  }, 80);
  if (target === "market") {
    showTradeMessage(els, "매매가격을 직접 입력해도 전세가율 계산을 계속할 수 있습니다.", "default");
  }
}

function createCandidateCard(candidate, index) {
  const card = document.createElement("article");
  card.className = "jeonse-trade-card jeonse-candidate-card";

  const body = document.createElement("div");
  body.className = "jeonse-trade-card-body";

  const title = document.createElement("strong");
  title.textContent = candidate.aptName || "단지명 후보";

  const location = document.createElement("span");
  const locationParts = [candidate.umdNm, candidate.lastAmountLabel ? `최근 ${candidate.lastAmountLabel}` : ""].filter(Boolean);
  location.textContent = locationParts.join(" · ") || "같은 지역에서 찾은 단지 후보";

  const meta = document.createElement("small");
  meta.textContent = formatCandidateMeta(candidate);

  body.append(title, location, meta);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "subtle-button jeonse-use-candidate-button";
  button.textContent = "이 단지명으로 조회";
  button.dataset.jeonseUseCandidate = "true";
  button.dataset.aptName = candidate.searchValue || candidate.aptName || "";
  button.setAttribute("aria-label", `${index + 1}번째 후보 ${candidate.aptName || "단지"}명으로 다시 조회`);

  card.append(body, button);
  return card;
}

function formatCandidateMeta(candidate) {
  const parts = [];
  if (candidate.lastDealDate) parts.push(`최근 거래일 ${candidate.lastDealDate.replaceAll("-", ".")}`);
  if (candidate.dealCount) parts.push(`표시 기간 내 ${candidate.dealCount}건`);
  if (Array.isArray(candidate.areaLabels) && candidate.areaLabels.length) parts.push(`면적 ${candidate.areaLabels.join(", ")}`);
  if (candidate.matchScore) parts.push(`유사도 ${Math.round(candidate.matchScore)}`);
  return parts.join(" · ") || "후보 단지를 선택하면 해당 단지명으로 다시 조회합니다.";
}

function applyAptCandidate(els, button) {
  const aptName = String(button.dataset.aptName || "").trim();
  if (!aptName) {
    showTradeMessage(els, "선택한 후보 단지명을 읽지 못했습니다. 단지명을 직접 입력해 주세요.", "error");
    return;
  }
  els.tradeAptName.value = aptName;
  showTradeMessage(els, `${aptName} 단지명으로 다시 조회합니다.`, "loading");
  lookupAptTrades(els);
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
  closeTradeModal(els);
  showTradeMessage(
    els,
    `${button.dataset.amountLabel || formatManwon(amountManwon)}을 기준 매매가격에 반영했습니다. 전세보증금과 선순위채권을 확인한 뒤 계산 버튼을 눌러 주세요.`,
    "success"
  );
  els.marketPrice.focus({ preventScroll: true });
}

function setTradeLoading(els, isLoading) {
  els.tradeSearchButton.disabled = isLoading;
  els.tradeSearchButton.textContent = isLoading ? "조회 중..." : "매매 실거래가 조회";
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
  if (els.tradeMonths) els.tradeMonths.value = "3";
  if (els.tradeDealYmd) els.tradeDealYmd.value = "";
  if (els.lawdCd) els.lawdCd.value = "";
  if (els.selectedRegion) {
    els.selectedRegion.textContent = "선택된 지역이 없습니다. 지역/단지를 검색해 선택해 주세요.";
    delete els.selectedRegion.dataset.regionLabel;
  }
  if (els.placeResults) els.placeResults.replaceChildren();
  closePlaceModal(els);
  closeTradeModal(els);
  showTradeMessage(els, TRADE_LOOKUP_DEFAULT_MESSAGE, "default");
  clearTradeResults(els);
  setTradeLoading(els, false);
}

function clearTradeResults(els) {
  els.tradeResults.replaceChildren();
  els.tradeResults.hidden = true;
  if (els.tradeModalSummary) els.tradeModalSummary.textContent = "";
}

function getLookupErrorMessage(error, options = {}) {
  const fallback = error?.fallback || "매매가격을 직접 입력해 계산할 수 있습니다.";
  const message = String(error?.message || "").trim();
  const code = String(error?.code || "");
  const status = Number(error?.status || 0);

  if (error?.name === "AbortError") {
    return "실거래가 조회 응답이 지연되고 있습니다. 조회 기간을 줄이거나 잠시 후 다시 시도해 주세요. " + fallback;
  }

  if (code === "MISSING_KAKAO_KEY" || message.includes("KAKAO_REST_API_KEY")) {
    return "주소 검색 설정을 확인하는 중 문제가 발생했습니다. " + fallback;
  }

  if (code === "MISSING_PUBLIC_DATA_KEY" || message.includes("MOLIT_RTMS_API_KEY") || message.includes("PUBLIC_DATA_API_KEY")) {
    return "실거래가 조회 설정을 확인하는 중 문제가 발생했습니다. " + fallback;
  }

  if (code === "RTMS_ALL_MONTHS_FAILED" || code === "RTMS_TIMEOUT" || status >= 500 || code.includes("TIMEOUT")) {
    const extra = options.dealYmd
      ? " 다른 계약년월을 입력하거나 최근 기간 조회로 다시 확인해 주세요. "
      : " 조회 기간을 3개월로 줄이거나 계약년월 직접 조회를 사용해 보세요. ";
    return (message || "실거래가 보조 조회가 일시적으로 실패했습니다.") + extra + fallback;
  }

  if (message.includes("주소")) return message + " " + fallback;
  if (message.includes("실거래가") || message.includes("조회")) return `${message} ${fallback}`;
  return "실거래가 조회 중 문제가 발생했습니다. 조회 기간을 줄이거나 단지명을 더 구체적으로 입력해 주세요. " + fallback;
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
