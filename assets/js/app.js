import { calculateReport } from "./calculator.js?v=20260614-cache-fix";
import { initBmiCalculator } from "./bmi-calculator.js?v=20260614-cache-fix";
import { initCaffeineSleepCalculator } from "./caffeine-sleep.js?v=20260614-cache-fix";
import { initCigaretteCostCalculator } from "./cigarette-cost.js?v=20260614-cache-fix";
import { initApplianceElectricityCalculator } from "./appliance-electricity.js?v=20260614-cache-fix";
import { initAustraliaPayCalculator } from "./australia-pay.js?v=20260616-mobile-exchange-whv-final";
import { initAustraliaWhv88DaysCalculator } from "./australia-whv-88-days.js?v=20260616-mobile-exchange-whv-final";
import { initExchangeRateCalculator } from "./exchange-rate.js?v=20260616-mobile-exchange-whv-final";
import { initParkingBudgetMap } from "./parking-budget-map.js?v=20260617-parking-fix-dashboard";
import { initLoanInterestCalculator } from "./loan-interest.js?v=20260614-cache-fix";
import { initNetSalaryCalculator } from "./net-salary.js?v=20260614-cache-fix";
import { initPercentileCalculator } from "./percentile.js?v=20260614-cache-fix";
import { renderPriceChart } from "./chart.js?v=20260614-cache-fix";
import { initEvCostCalculator } from "./ev-cost.js?v=20260614-cache-fix";
import { initMilitarySavingsCalculator } from "./military-savings.js?v=20260614-cache-fix";
import { initScientificCalculator } from "./scientific.js?v=20260614-cache-fix";
import { initSpaceTravelCalculator } from "./space-travel.js?v=20260614-cache-fix";
import { initTextCounter } from "./text-counter.js?v=20260614-cache-fix";
import { formatWon, getCheckedValue, getFormNumber } from "./utils.js?v=20260614-cache-fix";
import { initWeeklyHolidayPayCalculator } from "./weekly-holiday-pay.js?v=20260614-cache-fix";

const TOOL_GROUPS = [
  {
    label: "공학·학업",
    tools: [
      ["공학용 계산기", "calculators/scientific.html"],
      ["글자수·바이트 계산기", "calculators/text-counter.html"],
      ["시험 상위 백분율 계산기", "calculators/percentile.html"]
    ]
  },
  {
    label: "돈·세금",
    tools: [
      ["월 실수령액 계산기", "calculators/net-salary.html"],
      ["대출 이자 계산기", "calculators/loan-interest.html"],
      ["실시간 환율 계산기", "calculators/exchange-rate.html"],
      ["주휴수당 계산기", "calculators/weekly-holiday-pay.html"],
      ["군적금 계산기", "calculators/military-savings.html"],
      ["담배 연간 비용 계산기", "calculators/cigarette-cost.html"]
    ]
  },
  {
    label: "해외·워킹홀리데이",
    tools: [
      ["호주 급여명세서 원화 환산 계산기", "calculators/australia-pay.html"],
      ["호주 워홀 세컨비자 88일 근무일 계산기", "calculators/australia-whv-88-days.html"]
    ]
  },
  {
    label: "생활·차량",
    tools: [
      ["전기차 충전비 vs 주유비 계산기", "calculators/ev-vs-gas.html"],
      ["가전제품 월 전기요금 계산기", "calculators/appliance-electricity.html"],
      ["중고 전자제품 가격 계산기", "calculators/used-device-price.html"],
      ["주차비 계산 지도", "calculators/parking-budget-map.html"]
    ]
  },
  {
    label: "건강·습관",
    tools: [
      ["BMI 계산기", "calculators/bmi.html"],
      ["카페인 수면 영향 계산기", "calculators/caffeine-sleep.html"]
    ]
  },
  {
    label: "재미·상상",
    tools: [
      ["우주 이동 시간 계산기", "calculators/space-travel.html"]
    ]
  }
];

const USED_DEVICE_MODEL_GROUPS = [
  {
    label: "iPhone",
    ids: [
      "iphone-15-pro-256",
      "iphone-15-128",
      "iphone-14-pro-256",
      "iphone-14-128",
      "iphone-13-pro-256",
      "iphone-13-128",
      "iphone-se-3-128"
    ]
  },
  {
    label: "Galaxy S",
    ids: [
      "galaxy-s24-ultra-256",
      "galaxy-s24-256",
      "galaxy-s23-ultra-256",
      "galaxy-s23-256",
      "galaxy-s22-ultra-256",
      "galaxy-s22-256"
    ]
  },
  {
    label: "Galaxy Z",
    ids: [
      "galaxy-z-flip5-256",
      "galaxy-z-fold5-256"
    ]
  },
  {
    label: "Galaxy A",
    ids: [
      "galaxy-a54-128"
    ]
  }
];

const CALCULATOR_CLICK_STORAGE_KEY = "hannuncalc.calculatorClicks.v1";
const DEFAULT_CALCULATOR_ORDER = new Map(
  TOOL_GROUPS
    .flatMap((group) => group.tools.map(([, href]) => href))
    .map((href, index) => [normalizeCalculatorHref(href), index])
);

const state = {
  dataset: null,
  currentReport: null
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  initResponsiveNav();
  initToolDrawer();
  initAffiliateAds();
  initCalculatorClickRanking();
  initScientificCalculator();
  initMilitarySavingsCalculator();
  initEvCostCalculator();
  initApplianceElectricityCalculator();
  initAustraliaPayCalculator();
  initAustraliaWhv88DaysCalculator();
  initExchangeRateCalculator();
  initParkingBudgetMap();
  initNetSalaryCalculator();
  initLoanInterestCalculator();
  initWeeklyHolidayPayCalculator();
  initTextCounter();
  initBmiCalculator();
  initCaffeineSleepCalculator();
  initPercentileCalculator();
  initCigaretteCostCalculator();
  initSpaceTravelCalculator();
  bindElements();

  if (!els.form) return;

  try {
    await loadDataset();
    populateModels();
    bindEvents();
    updateReport();
  } catch (error) {
    showLoadError(error);
  }
});

window.addEventListener("pageshow", () => {
  sortCalculatorRankSections();
});

function initResponsiveNav() {
  const navs = document.querySelectorAll(".site-nav");
  if (!navs.length) return;

  const mobileQuery = window.matchMedia("(max-width: 720px)");
  const prefix = location.pathname.includes("/calculators/") ? "../" : "";
  const mobileNav = `
    <a href="${prefix}index.html#calculators" data-tool-drawer>다른 계산기</a>
    <a href="${prefix}about.html">소개</a>
    <a href="${prefix}contact.html">문의</a>
  `;

  const applyNav = () => {
    navs.forEach((nav) => {
      if (!nav.dataset.desktopHtml) {
        nav.dataset.desktopHtml = nav.innerHTML;
      }

      if (mobileQuery.matches) {
        nav.innerHTML = mobileNav;
        nav.dataset.mobileNav = "true";
        return;
      }

      if (nav.dataset.mobileNav === "true") {
        nav.innerHTML = nav.dataset.desktopHtml;
        nav.dataset.mobileNav = "false";
      }
    });
  };

  applyNav();
  mobileQuery.addEventListener("change", applyNav);
}

function initAffiliateAds() {
  if (document.querySelector(".affiliate-ad")) return;

  const desktopCoupangWidget = createCoupangWidget({
    id: 997238,
    slot: "desktop",
    width: 728,
    height: 90
  });
  const mobileCoupangWidget = createCoupangWidget({
    id: 997235,
    slot: "mobile",
    width: 320,
    height: 50
  });

  const compactSection = document.querySelector(".content-band.compact");
  if (compactSection) {
    const desktopAdBand = document.createElement("section");
    desktopAdBand.className = "affiliate-ad-band desktop-affiliate-ad";
    desktopAdBand.setAttribute("aria-label", "광고");
    desktopAdBand.innerHTML = `
      <div class="container">
        <div class="affiliate-ad-note">이 페이지는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</div>
        ${desktopCoupangWidget}
      </div>
    `;
    const footer = document.querySelector(".site-footer");
    if (footer) {
      footer.before(desktopAdBand);
    } else {
      document.body.append(desktopAdBand);
    }
  }

  const mobileAd = document.createElement("aside");
  mobileAd.className = "mobile-affiliate-ad";
  mobileAd.setAttribute("aria-label", "하단 광고");
  mobileAd.innerHTML = `
    <div class="mobile-affiliate-label">이 페이지는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</div>
    ${mobileCoupangWidget}
  `;
  document.body.append(mobileAd);
}

function createCoupangWidget({ id, slot, width, height }) {
  const widgetUrl = `https://ads-partners.coupang.com/widgets.html?id=${id}&template=carousel&trackingCode=AF5055363&width=${width}&height=${height}&tsource=&tag=js`;

  return `
    <iframe
      class="affiliate-ad coupang-widget"
      data-coupang-slot="${slot}"
      data-coupang-id="${id}"
      title="쿠팡 파트너스 광고"
      width="${width}"
      height="${height}"
      loading="lazy"
      referrerpolicy="unsafe-url"
      scrolling="no"
      aria-label="쿠팡 파트너스 광고"
      src="${widgetUrl}"
    ></iframe>
  `;
}

function initToolDrawer() {
  if (document.querySelector(".tool-drawer")) return;

  const prefix = location.pathname.includes("/calculators/") ? "../" : "";
  const drawer = document.createElement("aside");
  drawer.className = "tool-drawer";
  drawer.setAttribute("aria-label", "계산기 바로가기");
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = `
    <div class="tool-drawer-head">
      <strong>다른 계산기</strong>
      <button type="button" class="tool-drawer-close" aria-label="계산기 바로가기 닫기">×</button>
    </div>
    <div class="tool-search-row">
      <span aria-hidden="true">⌕</span>
      <input type="search" id="tool-search" placeholder="계산기 검색..." autocomplete="off">
    </div>
    <nav class="tool-drawer-list" aria-label="계산기 분류">
      ${TOOL_GROUPS.map((group) => `
        <section class="tool-group">
          <h2>${group.label}</h2>
          ${group.tools.map(([name, href]) => `
            <a href="${prefix}${href}" data-tool-name="${name.toLowerCase()}">${name}</a>
          `).join("")}
        </section>
      `).join("")}
    </nav>
  `;

  const backdrop = document.createElement("button");
  backdrop.className = "drawer-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "계산기 바로가기 닫기");

  document.body.append(drawer, backdrop);

  const openDrawer = () => {
    drawer.setAttribute("aria-hidden", "false");
    drawer.style.transition = "none";
    drawer.style.transform = "none";
    document.body.classList.add("drawer-open");
    if (!window.matchMedia("(max-width: 720px)").matches) {
      drawer.querySelector("#tool-search")?.focus();
    }
  };

  const closeDrawer = () => {
    drawer.setAttribute("aria-hidden", "true");
    drawer.style.transition = "";
    drawer.style.transform = "";
    document.body.classList.remove("drawer-open");
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest("[data-tool-drawer]");
    if (!trigger) return;
    event.preventDefault();
    openDrawer();
  });

  drawer.querySelector(".tool-drawer-close")?.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  drawer.querySelector("#tool-search")?.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    drawer.querySelectorAll("[data-tool-name]").forEach((link) => {
      const visible = !query || link.dataset.toolName.includes(query);
      link.hidden = !visible;
    });
  });
}

function initCalculatorClickRanking() {
  sortCalculatorRankSections();

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    const calculatorKey = getCalculatorKey(link);
    if (!calculatorKey) return;
    incrementCalculatorClick(calculatorKey);
    sortCalculatorRankSections();
  });
}

function sortCalculatorRankSections() {
  const clicks = readCalculatorClicks();
  sortCalculatorLinkGroup(document.querySelector(".calculator-cards"), clicks, {
    itemSelector: ".calculator-card"
  });
  sortCalculatorLinkGroup(document.querySelector(".mini-command-list"), clicks, {
    itemSelector: "a",
    updateNumbers: true
  });
}

function sortCalculatorLinkGroup(container, clicks, options = {}) {
  if (!container) return;
  const items = Array.from(container.querySelectorAll(options.itemSelector || "a"))
    .map((link, index) => {
      const key = getCalculatorKey(link);
      return {
        link,
        index,
        key,
        count: clicks[key] || 0,
        defaultOrder: getDefaultCalculatorOrder(key)
      };
    })
    .filter((item) => item.key);

  if (!items.length) return;

  items
    .sort((a, b) => b.count - a.count || a.defaultOrder - b.defaultOrder || a.index - b.index)
    .forEach((item, index) => {
      container.append(item.link);
      if (options.updateNumbers) {
        const number = item.link.querySelector("span");
        if (number) number.textContent = String(index + 1).padStart(2, "0");
      }
    });
}

function incrementCalculatorClick(key) {
  const clicks = readCalculatorClicks();
  clicks[key] = (clicks[key] || 0) + 1;
  writeCalculatorClicks(clicks);
}

function readCalculatorClicks() {
  try {
    return JSON.parse(localStorage.getItem(CALCULATOR_CLICK_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCalculatorClicks(clicks) {
  try {
    localStorage.setItem(CALCULATOR_CLICK_STORAGE_KEY, JSON.stringify(clicks));
  } catch {
    // 저장 공간이 막혀도 계산기 이동 자체는 그대로 동작해야 합니다.
  }
}

function getCalculatorKey(link) {
  if (!(link instanceof HTMLAnchorElement)) return "";
  const rawHref = link.getAttribute("href") || "";
  if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:")) return "";

  let url;
  try {
    url = new URL(rawHref, location.href);
  } catch {
    return "";
  }

  return normalizeCalculatorHref(url.pathname);
}

function getDefaultCalculatorOrder(key) {
  return DEFAULT_CALCULATOR_ORDER.get(key) ?? Number.MAX_SAFE_INTEGER;
}

function normalizeCalculatorHref(rawHref) {
  const path = String(rawHref)
    .split(/[?#]/)[0]
    .replaceAll("\\", "/")
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\.\//, "")
    .replace(/^\//, "");
  const match = path.match(/(?:^|.*\/)(calculators\/[^/#?]+\.html)$/);
  return match ? match[1] : "";
}

function bindElements() {
  els.form = document.querySelector("#calculator-form");
  els.modelSelect = document.querySelector("#model-select");
  els.batteryInput = document.querySelector("#battery-input");
  els.estimatedPrice = document.querySelector("#estimated-price");
  els.estimatedRange = document.querySelector("#estimated-range");
  els.decisionBadge = document.querySelector("#decision-badge");
  els.decisionCopy = document.querySelector("#decision-copy");
  els.lossAvoidance = document.querySelector("#loss-avoidance");
  els.timingScore = document.querySelector("#timing-score");
  els.inspectionList = document.querySelector("#inspection-list");
  els.priceMonth = document.querySelector("#price-month");
  els.priceChart = document.querySelector("#price-chart");
  els.listingText = document.querySelector("#listing-text");
  els.copyListing = document.querySelector("#copy-listing");
  els.bunjangLink = document.querySelector("#bunjang-link");
  els.daangnLink = document.querySelector("#daangn-link");
}

async function loadDataset() {
  const dataUrl = new URL("../../data/market-prices-draft.json", import.meta.url);
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("가격 정보를 불러오지 못했습니다.");
  state.dataset = await response.json();
}

function populateModels() {
  const models = state.dataset.models;
  const groupedIds = new Set(USED_DEVICE_MODEL_GROUPS.flatMap((group) => group.ids));
  const groups = USED_DEVICE_MODEL_GROUPS.map((group) => {
    const options = group.ids
      .map((id) => models[id])
      .filter(Boolean)
      .map(modelOption)
      .join("");
    return options ? `<optgroup label="${group.label}">${options}</optgroup>` : "";
  });
  const remaining = Object.values(models)
    .filter((model) => !groupedIds.has(model.id))
    .map(modelOption)
    .join("");

  els.modelSelect.innerHTML = `${groups.join("")}${remaining ? `<optgroup label="기타">${remaining}</optgroup>` : ""}`;
}

function modelOption(model) {
  return `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name)}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bindEvents() {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateReport();
  });

  els.form.addEventListener("change", updateReport);
  els.batteryInput.addEventListener("input", updateReport);

  els.copyListing.addEventListener("click", async () => {
    if (!state.currentReport) return;
    await navigator.clipboard.writeText(els.listingText.value);
    els.copyListing.textContent = "복사됨";
    window.setTimeout(() => {
      els.copyListing.textContent = "복사";
    }, 1400);
  });
}

function readFormValues() {
  return {
    modelId: els.modelSelect.value,
    battery: getFormNumber(els.form, "battery", 86),
    condition: getCheckedValue(els.form, "condition", "a"),
    repair: getCheckedValue(els.form, "repair", "none"),
    accessories: {
      box: els.form.elements.box.checked,
      charger: els.form.elements.charger.checked,
      receipt: els.form.elements.receipt.checked
    }
  };
}

function updateReport() {
  if (!state.dataset) return;
  const values = readFormValues();
  const model = state.dataset.models[values.modelId];
  if (!model) return;

  const report = calculateReport(model, values);
  state.currentReport = report;
  renderSummary(report);
  renderInspection(report, values);
  renderListing(report, values);
  renderPriceChart(els.priceChart, report.projection);
}

function renderSummary(report) {
  els.estimatedPrice.textContent = formatWon(report.estimate);
  els.estimatedRange.textContent = `예상 범위 ${formatWon(report.range.low)} ~ ${formatWon(report.range.high)}`;
  els.decisionBadge.textContent = report.decision.label;
  els.decisionBadge.className = `decision-badge ${report.decision.tone}`;
  els.decisionCopy.textContent = report.decision.text;
  els.lossAvoidance.textContent = formatWon(report.lossInThreeMonths);
  els.timingScore.textContent = `${report.timingScore}점`;
  els.priceMonth.textContent = `시세 업데이트: ${report.model.current.month}`;
  els.bunjangLink.href = report.model.current.searchUrls.bunjang;
  els.daangnLink.href = buildDaangnSearchUrl(report.model.name);
}

function renderInspection(report, values) {
  const rows = [
    ["모델", report.model.name],
    ["배터리", `${values.battery}% · ${report.factors.battery.label}`],
    ["외관", `${report.factors.condition.label} · ${report.factors.condition.note}`],
    ["수리", `${report.factors.repair.label} · ${report.factors.repair.note}`],
    ["구성품", `${report.factors.accessories.label}`],
    ["하락 위험", report.risk.note]
  ];

  els.inspectionList.innerHTML = rows.map(([term, desc]) => `
    <dt>${term}</dt>
    <dd>${desc}</dd>
  `).join("");
}

function renderListing(report, values) {
  const conditionLabel = report.factors.condition.label;
  const repairLabel = report.factors.repair.label;
  const accessoryText = report.factors.accessories.label;
  const suggestedPrice = formatWon(report.range.high);
  const title = `${report.model.name} 배터리 ${values.battery}% ${conditionLabel} 판매합니다`;
  const body = [
    title,
    "",
    `희망가: ${suggestedPrice}`,
    `배터리 성능: ${values.battery}%`,
    `외관 상태: ${conditionLabel}`,
    `수리 이력: ${repairLabel}`,
    `구성품: ${accessoryText}`,
    "",
    "전면, 후면, 모서리, 카메라 부분 사진을 함께 올려 두었습니다.",
    "거래 전 초기화와 계정 로그아웃을 완료한 뒤 전달하겠습니다."
  ].join("\n");

  els.listingText.value = body;
}

function buildDaangnSearchUrl(modelName) {
  const query = `site:daangn.com ${modelName} 중고`;
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
}

function showLoadError(error) {
  const message = error?.message || "가격 정보를 불러오지 못했습니다.";
  els.estimatedPrice.textContent = "불러오기 실패";
  els.estimatedRange.textContent = message;
  els.decisionBadge.textContent = "확인 필요";
  els.decisionBadge.className = "decision-badge warn";
  els.decisionCopy.textContent = "잠시 후 다시 시도해 주세요. 문제가 계속되면 문의 페이지로 알려 주세요.";
}
