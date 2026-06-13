import { formatWon, getFormNumber } from "./utils.js";

const INCOME_BRACKETS = [
  [14000000, 0.06, 0],
  [50000000, 0.15, 1260000],
  [88000000, 0.24, 5760000],
  [150000000, 0.35, 15440000],
  [300000000, 0.38, 19940000],
  [500000000, 0.4, 25940000],
  [1000000000, 0.42, 35940000],
  [Infinity, 0.45, 65940000]
];

export function initNetSalaryCalculator(root = document) {
  const form = root.querySelector("#net-salary-form");
  if (!form) return;

  const els = {
    net: root.querySelector("#net-salary-result"),
    deduction: root.querySelector("#net-salary-deduction"),
    tax: root.querySelector("#net-salary-tax"),
    social: root.querySelector("#net-salary-social"),
    annual: root.querySelector("#net-salary-annual"),
    detail: root.querySelector("#net-salary-detail")
  };

  const update = () => {
    const result = calculateNetSalary(readSalaryForm(form));
    renderSalaryResult(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateNetSalary(values) {
  const grossMonthly = Math.max(0, values.grossMonthly);
  const taxFreeMonthly = Math.min(Math.max(0, values.taxFreeMonthly), grossMonthly);
  const taxableMonthly = Math.max(0, grossMonthly - taxFreeMonthly);
  const annualGross = taxableMonthly * 12;

  const pension = values.includePension ? taxableMonthly * 0.045 : 0;
  const health = values.includeHealth ? taxableMonthly * 0.03545 : 0;
  const longTermCare = values.includeHealth ? health * 0.1295 : 0;
  const employment = values.includeEmployment ? taxableMonthly * 0.009 : 0;
  const monthlySocial = pension + health + longTermCare + employment;

  const earnedDeduction = getEarnedIncomeDeduction(annualGross);
  const personalDeduction = Math.max(1, values.dependents) * 1500000;
  const childDeduction = Math.max(0, values.children) * 150000;
  const taxableIncome = Math.max(0, annualGross - earnedDeduction - personalDeduction - monthlySocial * 12);
  const calculatedTax = getIncomeTax(taxableIncome);
  const earnedTaxCredit = getEarnedTaxCredit(calculatedTax, annualGross);
  const annualIncomeTax = Math.max(0, calculatedTax - earnedTaxCredit - childDeduction);
  const monthlyIncomeTax = annualIncomeTax / 12;
  const localTax = monthlyIncomeTax * 0.1;
  const totalDeduction = monthlySocial + monthlyIncomeTax + localTax;

  return {
    grossMonthly,
    taxFreeMonthly,
    monthlySocial,
    monthlyIncomeTax,
    localTax,
    totalDeduction,
    netMonthly: grossMonthly - totalDeduction,
    netAnnual: (grossMonthly - totalDeduction) * 12,
    taxableIncome
  };
}

function readSalaryForm(form) {
  return {
    grossMonthly: getFormNumber(form, "grossMonthly", 3000000),
    taxFreeMonthly: getFormNumber(form, "taxFreeMonthly", 200000),
    dependents: getFormNumber(form, "dependents", 1),
    children: getFormNumber(form, "children", 0),
    includePension: form.elements.includePension.checked,
    includeHealth: form.elements.includeHealth.checked,
    includeEmployment: form.elements.includeEmployment.checked
  };
}

function renderSalaryResult(els, result) {
  els.net.textContent = formatWon(result.netMonthly);
  els.deduction.textContent = formatWon(result.totalDeduction);
  els.tax.textContent = formatWon(result.monthlyIncomeTax + result.localTax);
  els.social.textContent = formatWon(result.monthlySocial);
  els.annual.textContent = formatWon(result.netAnnual);
  els.detail.textContent = `비과세 ${formatWon(result.taxFreeMonthly)}을 제외하고 과세표준을 추정했습니다. 실제 원천징수액은 회사와 홈택스 간이세액표 기준에 따라 달라질 수 있습니다.`;
}

function getEarnedIncomeDeduction(annualGross) {
  let deduction;
  if (annualGross <= 5000000) deduction = annualGross * 0.7;
  else if (annualGross <= 15000000) deduction = 3500000 + (annualGross - 5000000) * 0.4;
  else if (annualGross <= 45000000) deduction = 7500000 + (annualGross - 15000000) * 0.15;
  else if (annualGross <= 100000000) deduction = 12000000 + (annualGross - 45000000) * 0.05;
  else deduction = 14750000 + (annualGross - 100000000) * 0.02;
  return Math.min(deduction, 20000000);
}

function getIncomeTax(taxableIncome) {
  const bracket = INCOME_BRACKETS.find(([limit]) => taxableIncome <= limit);
  return taxableIncome * bracket[1] - bracket[2];
}

function getEarnedTaxCredit(calculatedTax, annualGross) {
  const credit = calculatedTax <= 1300000
    ? calculatedTax * 0.55
    : 715000 + (calculatedTax - 1300000) * 0.3;

  if (annualGross <= 33000000) return Math.min(credit, 740000);
  if (annualGross <= 70000000) return Math.min(credit, Math.max(660000, 740000 - (annualGross - 33000000) * 0.008));
  return Math.min(credit, Math.max(500000, 660000 - (annualGross - 70000000) * 0.5));
}
