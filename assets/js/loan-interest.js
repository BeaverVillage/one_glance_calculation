import { formatWon } from "./utils.js";

const METHOD_LABELS = {
  equalPayment: "원리금균등",
  equalPrincipal: "원금균등",
  bullet: "만기일시"
};

export function initLoanInterestCalculator(root = document) {
  const form = root.querySelector("#loan-form");
  if (!form) return;

  const els = {
    monthlyPayment: root.querySelector("#loan-monthly-payment"),
    totalPayment: root.querySelector("#loan-total-payment"),
    totalInterest: root.querySelector("#loan-total-interest"),
    detail: root.querySelector("#loan-detail"),
    principalRatio: root.querySelector("#loan-principal-ratio"),
    interestRatio: root.querySelector("#loan-interest-ratio"),
    balanceBar: root.querySelector("#loan-balance-bar"),
    scheduleBody: root.querySelector("#loan-schedule-body")
  };

  const update = () => {
    const result = calculateLoan({
      principal: readNumber(form.elements.principal, 100000000),
      annualRate: readNumber(form.elements.annualRate, 4.5),
      months: readNumber(form.elements.months, 360),
      method: form.elements.method.value
    });
    renderLoan(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateLoan({ principal, annualRate, months, method }) {
  const loanPrincipal = Math.max(0, principal);
  const period = Math.max(1, Math.round(months));
  const monthlyRate = Math.max(0, annualRate) / 100 / 12;
  const repaymentMethod = METHOD_LABELS[method] ? method : "equalPayment";
  const schedule = [];

  if (repaymentMethod === "equalPayment") {
    const payment = monthlyRate === 0
      ? loanPrincipal / period
      : loanPrincipal * monthlyRate * (1 + monthlyRate) ** period / ((1 + monthlyRate) ** period - 1);
    let balance = loanPrincipal;
    for (let month = 1; month <= period; month += 1) {
      const interest = balance * monthlyRate;
      const principalPayment = month === period ? balance : Math.min(balance, payment - interest);
      const monthlyPayment = principalPayment + interest;
      balance = Math.max(0, balance - principalPayment);
      schedule.push(row(month, monthlyPayment, principalPayment, interest, balance));
    }
  }

  if (repaymentMethod === "equalPrincipal") {
    const fixedPrincipal = loanPrincipal / period;
    let balance = loanPrincipal;
    for (let month = 1; month <= period; month += 1) {
      const interest = balance * monthlyRate;
      const principalPayment = month === period ? balance : Math.min(balance, fixedPrincipal);
      const monthlyPayment = principalPayment + interest;
      balance = Math.max(0, balance - principalPayment);
      schedule.push(row(month, monthlyPayment, principalPayment, interest, balance));
    }
  }

  if (repaymentMethod === "bullet") {
    let balance = loanPrincipal;
    for (let month = 1; month <= period; month += 1) {
      const interest = loanPrincipal * monthlyRate;
      const principalPayment = month === period ? loanPrincipal : 0;
      const monthlyPayment = interest + principalPayment;
      balance = month === period ? 0 : loanPrincipal;
      schedule.push(row(month, monthlyPayment, principalPayment, interest, balance));
    }
  }

  const totalPayment = schedule.reduce((sum, item) => sum + item.payment, 0);
  const totalInterest = schedule.reduce((sum, item) => sum + item.interest, 0);
  const firstPayment = schedule[0]?.payment || 0;
  const lastPayment = schedule[schedule.length - 1]?.payment || 0;

  return {
    method: repaymentMethod,
    methodLabel: METHOD_LABELS[repaymentMethod],
    principal: loanPrincipal,
    months: period,
    annualRate,
    totalPayment,
    totalInterest,
    firstPayment,
    lastPayment,
    schedule
  };
}

function renderLoan(els, result) {
  els.monthlyPayment.textContent = result.method === "equalPayment"
    ? formatWon(result.firstPayment)
    : `${formatWon(result.firstPayment)} → ${formatWon(result.lastPayment)}`;
  els.totalPayment.textContent = formatWon(result.totalPayment);
  els.totalInterest.textContent = formatWon(result.totalInterest);
  els.detail.textContent = `${result.methodLabel} 방식으로 ${result.months}개월 동안 상환하는 조건입니다.`;

  const principalRatio = result.totalPayment ? result.principal / result.totalPayment * 100 : 0;
  const interestRatio = 100 - principalRatio;
  els.principalRatio.textContent = `원금 ${formatPercent(principalRatio)}`;
  els.interestRatio.textContent = `이자 ${formatPercent(interestRatio)}`;
  els.balanceBar.style.gridTemplateColumns = `${Math.max(0, principalRatio)}fr ${Math.max(0, interestRatio)}fr`;

  els.scheduleBody.innerHTML = result.schedule.map((item) => `
    <tr>
      <td>${item.month}</td>
      <td>${formatWon(item.payment)}</td>
      <td>${formatWon(item.principal)}</td>
      <td>${formatWon(item.interest)}</td>
      <td>${formatWon(item.balance)}</td>
    </tr>
  `).join("");
}

function row(month, payment, principal, interest, balance) {
  return {
    month,
    payment: Math.round(payment),
    principal: Math.round(principal),
    interest: Math.round(interest),
    balance: Math.round(balance)
  };
}

function readNumber(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function formatPercent(value) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}
