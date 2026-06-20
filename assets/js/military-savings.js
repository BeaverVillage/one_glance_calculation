import { formatWon, getFormNumber } from "./utils.js?v=20260614-cache-fix";

const INTEREST_TAX_RATE = 0.154;

const YEAR_RULES = [
  { from: 2022, to: 2022, matchRate: 0.33, monthlyLimit: 400000 },
  { from: 2023, to: 2023, matchRate: 0.71, monthlyLimit: 400000 },
  { from: 2024, to: 2024, matchRate: 1.0, monthlyLimit: 400000 },
  { from: 2025, to: 9999, matchRate: 1.0, monthlyLimit: 550000 }
];

export function initMilitarySavingsCalculator(root = document) {
  const form = root.querySelector("#military-savings-form");
  if (!form) return;

  const els = {
    total: root.querySelector("#savings-total"),
    summary: root.querySelector("#savings-summary"),
    principal: root.querySelector("#savings-principal"),
    interest: root.querySelector("#savings-interest"),
    support: root.querySelector("#savings-support"),
    average: root.querySelector("#savings-average"),
    months: root.querySelector("#savings-months-result"),
    breakdown: root.querySelector("#savings-support-breakdown")
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
  const annualRate = clampNumber(values.annualRate, 0, 100);
  const enlistDate = parseDateInput(values.enlistDate);
  const dischargeDate = parseDateInput(values.dischargeDate);
  const months = buildServiceDepositMonths(enlistDate, dischargeDate);

  if (!months.length) {
    return {
      isValid: false,
      principal: 0,
      interestBeforeTax: 0,
      tax: 0,
      interestAfterTax: 0,
      governmentSupport: 0,
      total: 0,
      averagePerMonth: 0,
      months: 0,
      supportRows: []
    };
  }

  const monthlyRate = annualRate / 100 / 12;
  let principal = 0;
  let interestBeforeTax = 0;
  const supportByYear = new Map();

  months.forEach((monthInfo, index) => {
    const rule = getYearRule(monthInfo.year);
    const deposit = Math.min(monthlyDeposit, rule.monthlyLimit);
    const support = deposit * rule.matchRate;
    const remainingMonths = months.length - index;

    principal += deposit;
    interestBeforeTax += deposit * monthlyRate * remainingMonths;

    const row = supportByYear.get(monthInfo.year) || {
      year: monthInfo.year,
      months: 0,
      principal: 0,
      matchRate: rule.matchRate,
      monthlyLimit: rule.monthlyLimit,
      support: 0
    };

    row.months += 1;
    row.principal += deposit;
    row.support += support;
    row.matchRate = rule.matchRate;
    row.monthlyLimit = rule.monthlyLimit;
    supportByYear.set(monthInfo.year, row);
  });

  const tax = values.taxFree ? 0 : interestBeforeTax * INTEREST_TAX_RATE;
  const interestAfterTax = Math.max(0, interestBeforeTax - tax);
  const governmentSupport = Array.from(supportByYear.values()).reduce((sum, row) => sum + row.support, 0);
  const total = principal + interestAfterTax + governmentSupport;

  return {
    isValid: true,
    principal,
    interestBeforeTax,
    tax,
    interestAfterTax,
    governmentSupport,
    total,
    averagePerMonth: total / months.length,
    months: months.length,
    supportRows: Array.from(supportByYear.values()).sort((a, b) => a.year - b.year),
    capped: monthlyDeposit > Math.min(...months.map((monthInfo) => getYearRule(monthInfo.year).monthlyLimit))
  };
}

function readSavingsForm(form) {
  return {
    monthlyDeposit: getFormNumber(form, "monthlyDeposit", 0),
    enlistDate: form.elements.enlistDate?.value || "",
    dischargeDate: form.elements.dischargeDate?.value || "",
    annualRate: getFormNumber(form, "annualRate", 0),
    taxFree: form.elements.taxFree.checked
  };
}

function renderSavingsResult(els, result, values) {
  if (!result.isValid) {
    els.total.textContent = "-";
    els.summary.textContent = "입대일과 전역일을 올바르게 입력하면 예상액을 계산합니다.";
    els.principal.textContent = "-";
    els.interest.textContent = "-";
    els.support.textContent = "-";
    els.average.textContent = "-";
    if (els.months) els.months.textContent = "-";
    if (els.breakdown) els.breakdown.innerHTML = "<p class=\"fine-print\">연도별 지원금 내역이 여기에 표시됩니다.</p>";
    return;
  }

  els.total.textContent = formatWon(result.total);
  els.summary.textContent = `${formatDate(values.enlistDate)}부터 ${formatDate(values.dischargeDate)}까지 ${result.months}개월 납입 기준입니다.`;
  els.principal.textContent = formatWon(result.principal);
  els.interest.textContent = values.taxFree
    ? formatWon(result.interestAfterTax)
    : `${formatWon(result.interestAfterTax)} (세금 ${formatWon(result.tax)} 반영)`;
  els.support.textContent = formatWon(result.governmentSupport);
  els.average.textContent = formatWon(result.averagePerMonth);
  if (els.months) els.months.textContent = `${result.months.toLocaleString("ko-KR")}개월`;
  renderSupportBreakdown(els.breakdown, result);
}

function renderSupportBreakdown(container, result) {
  if (!container) return;

  const rows = result.supportRows.map((row) => `
    <tr>
      <td>${row.year}년</td>
      <td>${row.months}개월</td>
      <td>${formatWon(row.monthlyLimit)}</td>
      <td>${Math.round(row.matchRate * 100)}%</td>
      <td>${formatWon(row.support)}</td>
    </tr>
  `).join("");

  container.innerHTML = `
    <div class="section-heading-row compact-row">
      <h3>연도별 지원금 계산</h3>
      <span>${result.capped ? "연도별 월 납입 한도를 넘는 금액은 지원 계산에서 제외했습니다." : "입대·전역 기간에 걸친 월별 지원율을 반영했습니다."}</span>
    </div>
    <div class="table-scroll">
      <table class="mini-table">
        <thead>
          <tr>
            <th>연도</th>
            <th>납입 월</th>
            <th>월 한도</th>
            <th>지원율</th>
            <th>지원 예상액</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildServiceDepositMonths(enlistDate, dischargeDate) {
  if (!enlistDate || !dischargeDate || dischargeDate < enlistDate) return [];

  const months = [];
  const current = new Date(enlistDate.getFullYear(), enlistDate.getMonth(), 1);
  const end = new Date(dischargeDate.getFullYear(), dischargeDate.getMonth(), 1);

  while (current <= end && months.length < 120) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getYearRule(year) {
  return YEAR_RULES.find((rule) => year >= rule.from && year <= rule.to) || {
    matchRate: 0,
    monthlyLimit: 0
  };
}

function formatDate(value) {
  const date = parseDateInput(value);
  if (!date) return "입력일";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
