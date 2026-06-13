import { formatWon, getFormNumber } from "./utils.js";

const INTEREST_TAX_RATE = 0.154;

export function initMilitarySavingsCalculator(root = document) {
  const form = root.querySelector("#military-savings-form");
  if (!form) return;

  const els = {
    total: root.querySelector("#savings-total"),
    summary: root.querySelector("#savings-summary"),
    principal: root.querySelector("#savings-principal"),
    interest: root.querySelector("#savings-interest"),
    support: root.querySelector("#savings-support"),
    average: root.querySelector("#savings-average")
  };

  const update = () => {
    const values = readSavingsForm(form);
    const result = calculateMilitarySavings(values);
    renderSavingsResult(els, result, values);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateMilitarySavings(values) {
  const monthlyDeposit = clampNumber(values.monthlyDeposit, 0, 10000000);
  const months = Math.max(1, Math.floor(clampNumber(values.months, 1, 120)));
  const annualRate = clampNumber(values.annualRate, 0, 100);
  const matchRate = clampNumber(values.matchRate, 0, 300);
  const monthlyRate = annualRate / 100 / 12;
  const principal = monthlyDeposit * months;

  let interestBeforeTax = 0;
  for (let month = 0; month < months; month += 1) {
    const remainingMonths = months - month;
    interestBeforeTax += monthlyDeposit * monthlyRate * remainingMonths;
  }

  const tax = values.taxFree ? 0 : interestBeforeTax * INTEREST_TAX_RATE;
  const interestAfterTax = Math.max(0, interestBeforeTax - tax);
  const governmentSupport = principal * (matchRate / 100);
  const total = principal + interestAfterTax + governmentSupport;

  return {
    principal,
    interestBeforeTax,
    tax,
    interestAfterTax,
    governmentSupport,
    total,
    averagePerMonth: total / months
  };
}

function readSavingsForm(form) {
  return {
    monthlyDeposit: getFormNumber(form, "monthlyDeposit", 0),
    months: getFormNumber(form, "months", 1),
    annualRate: getFormNumber(form, "annualRate", 0),
    matchRate: getFormNumber(form, "matchRate", 0),
    taxFree: form.elements.taxFree.checked
  };
}

function renderSavingsResult(els, result, values) {
  els.total.textContent = formatWon(result.total);
  els.summary.textContent = `${values.months}개월 동안 매월 ${formatWon(values.monthlyDeposit)} 납입 기준입니다.`;
  els.principal.textContent = formatWon(result.principal);
  els.interest.textContent = values.taxFree
    ? formatWon(result.interestAfterTax)
    : `${formatWon(result.interestAfterTax)} (세금 ${formatWon(result.tax)} 반영)`;
  els.support.textContent = formatWon(result.governmentSupport);
  els.average.textContent = formatWon(result.averagePerMonth);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
