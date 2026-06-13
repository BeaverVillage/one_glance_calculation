import { calculateReport } from "./calculator.js";
import { renderPriceChart } from "./chart.js";
import { initMilitarySavingsCalculator } from "./military-savings.js";
import { initScientificCalculator } from "./scientific.js";
import { formatWon, getCheckedValue, getFormNumber } from "./utils.js";

const state = {
  dataset: null,
  currentReport: null
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  initScientificCalculator();
  initMilitarySavingsCalculator();
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
  const models = Object.values(state.dataset.models);
  els.modelSelect.innerHTML = models.map((model) => (
    `<option value="${model.id}">${model.name}</option>`
  )).join("");
}

function bindEvents() {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateReport();
  });

  els.form.addEventListener("change", updateReport);
  els.batteryInput.addEventListener("input", updateReport);

  document.querySelectorAll("[data-quick-model]").forEach((button) => {
    button.addEventListener("click", () => {
      els.modelSelect.value = button.dataset.quickModel;
      updateReport();
      els.form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

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
  els.daangnLink.href = report.model.current.searchUrls.daangn;
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
  const floorPrice = formatWon(report.range.low);
  const title = `${report.model.name} 배터리 ${values.battery}% ${conditionLabel} 판매합니다`;
  const body = [
    title,
    "",
    `희망가: ${suggestedPrice}`,
    `빠른 거래 가능 가격: ${floorPrice} 전후`,
    `배터리 성능: ${values.battery}%`,
    `외관 상태: ${conditionLabel}`,
    `수리 이력: ${repairLabel}`,
    `구성품: ${accessoryText}`,
    "",
    "사진으로 전면, 후면, 모서리, 카메라 부분 확인 가능하게 올릴 예정입니다.",
    "거래 전 초기화 및 계정 로그아웃 완료 후 전달합니다."
  ].join("\n");

  els.listingText.value = body;
}

function showLoadError(error) {
  const message = error?.message || "가격 정보를 불러오지 못했습니다.";
  els.estimatedPrice.textContent = "불러오기 실패";
  els.estimatedRange.textContent = message;
  els.decisionBadge.textContent = "확인 필요";
  els.decisionBadge.className = "decision-badge warn";
  els.decisionCopy.textContent = "잠시 후 다시 시도해 주세요. 문제가 계속되면 문의 페이지로 알려 주세요.";
}
