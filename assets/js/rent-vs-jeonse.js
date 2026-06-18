import { formatWon } from './utils.js';

const DEFAULTS = {
  months: 24,
  opportunityRate: 3,
  moveCost: 1000000,
  otherCost: 0
};

export function initRentVsJeonseCalculator(root = document) {
  const form = root.querySelector('#rent-vs-jeonse-form');
  if (!form) return;
  if (form.dataset.calculatorReady === 'rent-vs-jeonse') return;
  form.dataset.calculatorReady = 'rent-vs-jeonse';

  const els = {
    winner: root.querySelector('#rent-winner'),
    winnerDetail: root.querySelector('#rent-winner-detail'),
    aMonthly: root.querySelector('#rent-a-monthly'),
    bMonthly: root.querySelector('#rent-b-monthly'),
    diffMonthly: root.querySelector('#rent-diff-monthly'),
    diffTotal: root.querySelector('#rent-diff-total'),
    conversionRate: root.querySelector('#rent-conversion-rate'),
    conversionNote: root.querySelector('#rent-conversion-note'),
    breakdown: root.querySelector('#rent-breakdown-body'),
    details: root.querySelector('#rent-details'),
    apiForm: root.querySelector('#rent-market-form'),
    apiStatus: root.querySelector('#rent-market-status'),
    apiSummary: root.querySelector('#rent-market-summary'),
    apiBody: root.querySelector('#rent-market-body'),
    apiUseAvg: root.querySelector('#rent-use-average')
  };

  const update = () => {
    const result = calculateComparison(readInput(form));
    renderComparison(els, result);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();

  if (els.apiForm) {
    els.apiForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await fetchMarketData(root, els);
    });
  }
}

export function calculateComparison(input) {
  const commonFeeMonthly = (input.common.moveCost + input.common.otherCost) / input.common.months;
  const a = calculateOption(input.a, input.common, commonFeeMonthly);
  const b = calculateOption(input.b, input.common, commonFeeMonthly);
  const diff = b.monthlyTotal - a.monthlyTotal;
  const absDiff = Math.abs(diff);
  const winner = absDiff < 1 ? 'same' : diff > 0 ? 'a' : 'b';
  const totalDiff = absDiff * input.common.months;
  const conversion = calculateConversionRate(a, b);
  return { input, a, b, winner, diff, absDiff, totalDiff, conversion };
}

function readInput(form) {
  const common = {
    months: Math.max(1, Math.round(readNumber(form, 'months', DEFAULTS.months))),
    opportunityRate: Math.max(0, readNumber(form, 'opportunityRate', DEFAULTS.opportunityRate)),
    moveCost: Math.max(0, readNumber(form, 'moveCost', DEFAULTS.moveCost)),
    otherCost: Math.max(0, readNumber(form, 'otherCost', DEFAULTS.otherCost))
  };
  return {
    common,
    a: readOption(form, 'a'),
    b: readOption(form, 'b')
  };
}

function readOption(form, prefix) {
  const deposit = Math.max(0, readNumber(form, `${prefix}Deposit`, 0));
  const monthlyRent = Math.max(0, readNumber(form, `${prefix}Rent`, 0));
  const managementFee = Math.max(0, readNumber(form, `${prefix}Management`, 0));
  const loanAmount = Math.max(0, Math.min(deposit, readNumber(form, `${prefix}Loan`, 0)));
  const loanRate = Math.max(0, readNumber(form, `${prefix}LoanRate`, 0));
  const manualBrokerage = Math.max(0, readNumber(form, `${prefix}Brokerage`, 0));
  const autoBrokerage = form.elements[`${prefix}BrokerageAuto`]?.checked;
  return {
    label: prefix.toUpperCase(),
    type: form.elements[`${prefix}Type`]?.value || 'jeonse',
    deposit,
    monthlyRent,
    managementFee,
    loanAmount,
    loanRate,
    brokerageFee: autoBrokerage ? estimateBrokerageFee(deposit, monthlyRent) : manualBrokerage,
    autoBrokerage
  };
}

function calculateOption(option, common, commonFeeMonthly) {
  const selfFund = Math.max(0, option.deposit - option.loanAmount);
  const monthlyLoanInterest = option.loanAmount * option.loanRate / 100 / 12;
  const monthlyOpportunityCost = selfFund * common.opportunityRate / 100 / 12;
  const monthlyBrokerage = option.brokerageFee / common.months;
  const monthlyTotal = option.monthlyRent + option.managementFee + monthlyLoanInterest + monthlyOpportunityCost + monthlyBrokerage + commonFeeMonthly;
  const cashFlowMonthly = option.monthlyRent + option.managementFee + monthlyLoanInterest + monthlyBrokerage + commonFeeMonthly;
  return {
    ...option,
    selfFund,
    monthlyLoanInterest,
    monthlyOpportunityCost,
    monthlyBrokerage,
    commonFeeMonthly,
    monthlyTotal,
    cashFlowMonthly,
    totalCost: monthlyTotal * common.months,
    transactionAmount: getRentTransactionAmount(option.deposit, option.monthlyRent)
  };
}

function calculateConversionRate(a, b) {
  const depositDiff = Math.abs(a.deposit - b.deposit);
  const rentDiff = Math.abs(a.monthlyRent - b.monthlyRent);
  if (depositDiff <= 0 || rentDiff <= 0) return null;
  return rentDiff * 12 / depositDiff * 100;
}

function estimateBrokerageFee(deposit, monthlyRent) {
  const amount = getRentTransactionAmount(deposit, monthlyRent);
  let rate = 0.003;
  let cap = Infinity;
  if (amount < 50000000) {
    rate = 0.005;
    cap = 200000;
  } else if (amount < 100000000) {
    rate = 0.004;
    cap = 300000;
  } else if (amount < 600000000) {
    rate = 0.003;
  } else if (amount < 1200000000) {
    rate = 0.004;
  } else if (amount < 1500000000) {
    rate = 0.005;
  } else {
    rate = 0.006;
  }
  return Math.min(amount * rate, cap);
}

function getRentTransactionAmount(deposit, monthlyRent) {
  const base = deposit + monthlyRent * 100;
  return base < 50000000 ? deposit + monthlyRent * 70 : base;
}

function renderComparison(els, result) {
  const winnerName = result.winner === 'a' ? 'A안' : result.winner === 'b' ? 'B안' : '두 조건';
  els.winner.textContent = result.winner === 'same' ? '두 조건이 거의 비슷합니다' : `${winnerName}이 더 유리합니다`;
  els.winnerDetail.textContent = result.winner === 'same'
    ? '월 실부담 차이가 거의 없습니다. 보증금 규모, 대출 가능 여부, 실제 관리비를 함께 확인하세요.'
    : `${winnerName}이 월 ${formatWon(result.absDiff)} 정도 낮습니다. ${result.input.common.months}개월 기준 약 ${formatWon(result.totalDiff)} 차이입니다.`;
  els.aMonthly.textContent = formatWon(result.a.monthlyTotal);
  els.bMonthly.textContent = formatWon(result.b.monthlyTotal);
  els.diffMonthly.textContent = result.winner === 'same' ? '거의 동일' : `${formatWon(result.absDiff)} 차이`;
  els.diffTotal.textContent = formatWon(result.totalDiff);
  els.conversionRate.textContent = result.conversion ? `${result.conversion.toFixed(2)}%` : '-';
  els.conversionNote.textContent = result.conversion
    ? '두 조건의 보증금 차이를 월세 차이로 환산한 연 기준 전환율입니다.'
    : '보증금 또는 월세 차이가 없으면 전월세 전환율을 계산하지 않습니다.';

  els.breakdown.innerHTML = [renderRow('A안', result.a), renderRow('B안', result.b)].join('');
  els.details.innerHTML = renderDetails(result);
}

function renderRow(label, option) {
  return `<tr>
    <td data-label="구분">${label}</td>
    <td data-label="월세">${formatWon(option.monthlyRent)}</td>
    <td data-label="관리비">${formatWon(option.managementFee)}</td>
    <td data-label="대출이자">${formatWon(option.monthlyLoanInterest)}</td>
    <td data-label="기회비용">${formatWon(option.monthlyOpportunityCost)}</td>
    <td data-label="중개보수 월환산">${formatWon(option.monthlyBrokerage)}</td>
    <td data-label="총 월 실부담"><strong>${formatWon(option.monthlyTotal)}</strong></td>
  </tr>`;
}

function renderDetails(result) {
  return `<div class="rent-detail-grid">
    ${renderOptionDetail('A안', result.a, result.input.common.months)}
    ${renderOptionDetail('B안', result.b, result.input.common.months)}
  </div>`;
}

function renderOptionDetail(label, option, months) {
  return `<article class="rent-detail-card">
    <h3>${label} 상세</h3>
    <ul class="plain-list">
      <li>보증금: <strong>${formatWon(option.deposit)}</strong></li>
      <li>대출금: <strong>${formatWon(option.loanAmount)}</strong> / 자기자금: <strong>${formatWon(option.selfFund)}</strong></li>
      <li>월 대출이자: <strong>${formatWon(option.monthlyLoanInterest)}</strong></li>
      <li>보증금 기회비용: <strong>${formatWon(option.monthlyOpportunityCost)}</strong></li>
      <li>중개보수 추정: <strong>${formatWon(option.brokerageFee)}</strong> (${months}개월 월환산 ${formatWon(option.monthlyBrokerage)})</li>
      <li>실제 현금 지출 기준 월 부담: <strong>${formatWon(option.cashFlowMonthly)}</strong></li>
    </ul>
  </article>`;
}

async function fetchMarketData(root, els) {
  const form = els.apiForm;
  const lawdCd = String(form.elements.lawdCd.value || '').replace(/\D/g, '').slice(0, 5);
  const dealYmd = String(form.elements.dealYmd.value || '').replace(/\D/g, '').slice(0, 6);
  const aptName = String(form.elements.aptName.value || '').trim();
  if (lawdCd.length !== 5 || dealYmd.length !== 6) {
    els.apiStatus.textContent = '법정동코드 5자리와 계약년월 6자리를 입력해 주세요.';
    return;
  }
  els.apiStatus.textContent = '실거래가 자료를 조회하는 중입니다.';
  els.apiSummary.textContent = '';
  els.apiBody.innerHTML = '';
  try {
    const params = new URLSearchParams({ lawdCd, dealYmd, aptName, numOfRows: '80' });
    const response = await fetch(`/api/real-estate/apt-rent?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '조회 실패');
    renderMarketData(root, els, data);
  } catch (error) {
    els.apiStatus.textContent = error.message || '실거래가 조회에 실패했습니다.';
  }
}

function renderMarketData(root, els, data) {
  const items = data.items || [];
  els.apiStatus.textContent = items.length ? '조회 완료' : '조건에 맞는 실거래가 자료가 없습니다.';
  if (!items.length) {
    els.apiSummary.textContent = '다른 계약년월, 시군구 코드 또는 아파트명을 입력해 보세요.';
    return;
  }
  const avgDeposit = average(items.map((item) => item.deposit));
  const avgRent = average(items.map((item) => item.monthlyRent));
  const rents = items.filter((item) => item.monthlyRent > 0).length;
  const jeonse = items.length - rents;
  els.apiSummary.textContent = `${data.query.dealYmd} 기준 ${items.length}건 조회 · 평균 보증금 ${formatWon(avgDeposit)} · 평균 월세 ${formatWon(avgRent)} · 전세 ${jeonse}건 / 월세 ${rents}건`;
  els.apiUseAvg.disabled = false;
  els.apiUseAvg.onclick = () => applyAverageToOptionB(root, avgDeposit, avgRent);
  els.apiBody.innerHTML = items.slice(0, 25).map((item) => `<tr>
    <td data-label="계약일">${item.dealDate || '-'}</td>
    <td data-label="아파트">${escapeHtml(item.aptName || '-')}</td>
    <td data-label="동/지번">${escapeHtml([item.umdNm, item.jibun].filter(Boolean).join(' ') || '-')}</td>
    <td data-label="면적">${item.area ? item.area + '㎡' : '-'}</td>
    <td data-label="보증금">${formatWon(item.deposit)}</td>
    <td data-label="월세">${formatWon(item.monthlyRent)}</td>
  </tr>`).join('');
}

function applyAverageToOptionB(root, deposit, rent) {
  const form = root.querySelector('#rent-vs-jeonse-form');
  if (!form) return;
  form.elements.bDeposit.value = Math.round(deposit / 10000) * 10000;
  form.elements.bRent.value = Math.round(rent / 10000) * 10000;
  form.dispatchEvent(new Event('input', { bubbles: true }));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function readNumber(form, name, fallback = 0) {
  const raw = form.elements[name]?.value;
  if (raw === '' || raw == null) return fallback;
  const number = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initRentVsJeonseCalculator(), { once: true });
} else {
  initRentVsJeonseCalculator();
}
