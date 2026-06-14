import { formatWon } from "./utils.js";

const METHOD_LABELS = {
  equalPayment: "원리금균등",
  equalPrincipal: "원금균등",
  bullet: "만기일시"
};

export function initLoanInterestCalculator(root = document) {
  const form = root.querySelector("#loan-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "loan") return;

  const els = {
    monthlyPayment: root.querySelector("#loan-monthly-payment"),
    principalAmount: root.querySelector("#loan-principal-amount"),
    totalPayment: root.querySelector("#loan-total-payment"),
    totalInterest: root.querySelector("#loan-total-interest"),
    detail: root.querySelector("#loan-detail"),
    principalRatio: root.querySelector("#loan-principal-ratio"),
    interestRatio: root.querySelector("#loan-interest-ratio"),
    balanceBar: root.querySelector("#loan-balance-bar"),
    scheduleBody: root.querySelector("#loan-schedule-body")
  };
  if (Object.values(els).some((element) => !element)) return;

  form.dataset.calculatorReady = "loan";

  const update = () => {
    const result = calculateLoan({
      principal: readNumber(form.elements.principal, 100000000),
      annualRate: readNumber(form.elements.annualRate, 4.5),
      months: readNumber(form.elements.months, 360),
      method: getSelectedMethod(form)
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

  const totalInterest = schedule.reduce((sum, item) => sum + item.interest, 0);
  const totalPayment = loanPrincipal + totalInterest;
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
  els.principalAmount.textContent = formatWon(result.principal);
  els.totalPayment.textContent = formatWon(result.totalPayment);
  els.totalInterest.textContent = formatWon(result.totalInterest);
  els.detail.textContent = `${result.methodLabel} 방식으로 ${result.months}개월 동안 상환하는 조건입니다.`;

  if (result.totalPayment <= 0) {
    els.principalRatio.textContent = "원금 -";
    els.interestRatio.textContent = "이자 -";
    els.balanceBar.classList.add("empty");
    els.balanceBar.removeAttribute("style");
    els.balanceBar.textContent = "대출 조건을 입력하면 비율 그래프가 표시됩니다.";
    els.balanceBar.setAttribute("aria-label", "원금과 이자 비율 그래프 대기 중");
    els.scheduleBody.innerHTML = "";
    return;
  }

  const principalRatio = result.principal / result.totalPayment * 100;
  const interestRatio = result.totalInterest / result.totalPayment * 100;
  els.principalRatio.textContent = `원금 ${formatPercent(principalRatio)}`;
  els.interestRatio.textContent = `이자 ${formatPercent(interestRatio)}`;
  els.balanceBar.classList.remove("empty");
  els.balanceBar.innerHTML = "<span></span><span></span>";
  els.balanceBar.style.gridTemplateColumns = `${Math.max(0, principalRatio)}fr ${Math.max(0, interestRatio)}fr`;
  els.balanceBar.setAttribute("aria-label", `총 상환액 중 원금 ${formatPercent(principalRatio)}, 이자 ${formatPercent(interestRatio)}`);

  els.scheduleBody.innerHTML = result.schedule.map((item) => `
    <tr>
      <td data-label="회차">${item.month}</td>
      <td data-label="월 납입액">${formatWon(item.payment)}</td>
      <td data-label="상환 원금">${formatWon(item.principal)}</td>
      <td data-label="이자">${formatWon(item.interest)}</td>
      <td data-label="남은 잔액">${formatWon(item.balance)}</td>
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

function getSelectedMethod(form) {
  return form.querySelector('input[name="method"]:checked')?.value || "equalPayment";
}

function formatPercent(value) {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function bootLoanInterestCalculator() {
  initLoanInterestCalculator();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLoanInterestCalculator, { once: true });
  } else {
    bootLoanInterestCalculator();
  }
}
