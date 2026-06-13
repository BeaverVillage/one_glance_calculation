import { formatWon, getFormNumber } from "./utils.js";

export function initCigaretteCostCalculator(root = document) {
  const form = root.querySelector("#cigarette-cost-form");
  if (!form) return;

  const els = {
    annual: root.querySelector("#cigarette-annual-cost"),
    monthly: root.querySelector("#cigarette-monthly-cost"),
    packs: root.querySelector("#cigarette-annual-packs"),
    fiveYear: root.querySelector("#cigarette-five-year-cost"),
    detail: root.querySelector("#cigarette-detail")
  };

  const update = () => {
    const result = calculateCigaretteCost({
      cigarettesPerDay: getFormNumber(form, "cigarettesPerDay", 10),
      packPrice: getFormNumber(form, "packPrice", 4500),
      cigarettesPerPack: getFormNumber(form, "cigarettesPerPack", 20)
    });
    renderCigaretteCost(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  update();
}

export function calculateCigaretteCost(values) {
  const cigarettesPerDay = Math.max(0, values.cigarettesPerDay);
  const packPrice = Math.max(0, values.packPrice);
  const cigarettesPerPack = Math.max(1, values.cigarettesPerPack);
  const annualCigarettes = cigarettesPerDay * 365;
  const annualPacks = annualCigarettes / cigarettesPerPack;
  const annualCost = annualPacks * packPrice;
  return {
    annualPacks,
    annualCost,
    monthlyCost: annualCost / 12,
    fiveYearCost: annualCost * 5
  };
}

function renderCigaretteCost(els, result) {
  els.annual.textContent = formatWon(result.annualCost);
  els.monthly.textContent = formatWon(result.monthlyCost);
  els.packs.textContent = `${Math.round(result.annualPacks).toLocaleString("ko-KR")}갑`;
  els.fiveYear.textContent = formatWon(result.fiveYearCost);
  els.detail.textContent = "하루 평균 흡연량이 유지된다고 가정한 단순 비용 계산입니다. 병원비나 보험료 같은 간접 비용은 포함하지 않았습니다.";
}
