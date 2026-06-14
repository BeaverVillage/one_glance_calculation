import { formatWon, getFormNumber } from "./utils.js?v=20260614-cache-fix";

const MINUTES_LOST_PER_CIGARETTE = 20;

const VALUE_COMPARISONS = [
  {
    limit: 50000,
    label: "5만 원 이하",
    items: "영화 3~4번, 치킨 2마리, 카페 음료 여러 잔",
    comment: "이 돈이면 주말 영화나 치킨 몇 번은 충분히 즐길 수 있어요."
  },
  {
    limit: 100000,
    label: "10만 원",
    items: "운동화, 헤드셋, 키보드, 독서대",
    comment: "이 돈이면 매일 쓰는 생활용품 하나를 꽤 괜찮은 걸로 바꿀 수 있어요."
  },
  {
    limit: 200000,
    label: "20만 원",
    items: "무선 이어폰, 책상 의자, 가방, 전자책 리더기 일부",
    comment: "이 정도면 공부나 일상에 오래 쓰는 물건 하나를 살 수 있는 금액이에요."
  },
  {
    limit: 300000,
    label: "30만 원",
    items: "태블릿 주변기기 세트, 헬스장 2~3개월, 모니터",
    comment: "이 돈이면 건강이나 작업 환경에 투자할 수 있어요."
  },
  {
    limit: 500000,
    label: "50만 원",
    items: "괜찮은 모니터, 사무용 의자, 국내 1박 여행",
    comment: "이 정도면 하루 소비가 아니라 생활의 질을 바꾸는 지출이 가능해요."
  },
  {
    limit: 800000,
    label: "80만 원",
    items: "태블릿, 중급 스마트워치, 국내 여행, 자격증 강의",
    comment: "이 돈이면 자기계발이나 여행에 꽤 크게 투자할 수 있어요."
  },
  {
    limit: 1000000,
    label: "100만 원",
    items: "노트북 일부 모델, 태블릿 고급형, 헬스장 1년권",
    comment: "이 정도면 전자기기 하나나 1년짜리 자기관리 비용이 됩니다."
  },
  {
    limit: 1500000,
    label: "150만 원",
    items: "노트북, 해외여행 항공권, 고급 의자·책상 세트",
    comment: "이 돈이면 매일 쓰는 장비를 바꾸거나 여행을 계획할 수 있어요."
  },
  {
    limit: 2000000,
    label: "200만 원",
    items: "고성능 노트북, 해외여행, 운동·PT 패키지",
    comment: "이 정도면 단순 소비가 아니라 경험이나 생산성에 투자할 수 있는 금액이에요."
  },
  {
    limit: 3000000,
    label: "300만 원 이상",
    items: "해외여행, 중고 오토바이, 고급 PC, 큰 가전",
    comment: "이 돈이면 꽤 큰 구매나 장기 계획을 세울 수 있는 수준이에요."
  },
  {
    limit: 5000000,
    label: "500만 원 이상",
    items: "보증금 일부, 장기 여행, 고사양 컴퓨터, 가전 세트",
    comment: "이 정도면 생활이나 자산 형성에도 영향을 줄 수 있는 금액이에요."
  }
];

export function initCigaretteCostCalculator(root = document) {
  const form = root.querySelector("#cigarette-cost-form");
  if (!form) return;

  const els = {
    annual: root.querySelector("#cigarette-annual-cost"),
    monthly: root.querySelector("#cigarette-monthly-cost"),
    packs: root.querySelector("#cigarette-annual-packs"),
    fiveYear: root.querySelector("#cigarette-five-year-cost"),
    tenYear: root.querySelector("#cigarette-ten-year-cost"),
    twentyYear: root.querySelector("#cigarette-twenty-year-cost"),
    thirtyYear: root.querySelector("#cigarette-thirty-year-cost"),
    fiftyYear: root.querySelector("#cigarette-fifty-year-cost"),
    valueComment: root.querySelector("#cigarette-value-comment"),
    lifeAnnual: root.querySelector("#cigarette-life-annual"),
    lifeTenYear: root.querySelector("#cigarette-life-ten-year"),
    lifeTwentyYear: root.querySelector("#cigarette-life-twenty-year"),
    lifeThirtyYear: root.querySelector("#cigarette-life-thirty-year"),
    lifeFiftyYear: root.querySelector("#cigarette-life-fifty-year"),
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
  const annualLifeLossMinutes = annualCigarettes * MINUTES_LOST_PER_CIGARETTE;

  return {
    cigarettesPerDay,
    annualCigarettes,
    annualPacks,
    annualCost,
    monthlyCost: annualCost / 12,
    fiveYearCost: annualCost * 5,
    tenYearCost: annualCost * 10,
    twentyYearCost: annualCost * 20,
    thirtyYearCost: annualCost * 30,
    fiftyYearCost: annualCost * 50,
    annualLifeLossMinutes,
    tenYearLifeLossMinutes: annualLifeLossMinutes * 10,
    twentyYearLifeLossMinutes: annualLifeLossMinutes * 20,
    thirtyYearLifeLossMinutes: annualLifeLossMinutes * 30,
    fiftyYearLifeLossMinutes: annualLifeLossMinutes * 50,
    comparison: getValueComparison(annualCost)
  };
}

function renderCigaretteCost(els, result) {
  els.annual.textContent = formatWon(result.annualCost);
  els.monthly.textContent = formatWon(result.monthlyCost);
  els.packs.textContent = `${Math.round(result.annualPacks).toLocaleString("ko-KR")}갑`;
  els.fiveYear.textContent = formatWon(result.fiveYearCost);
  if (els.tenYear) els.tenYear.textContent = formatWon(result.tenYearCost);
  if (els.twentyYear) els.twentyYear.textContent = formatWon(result.twentyYearCost);
  if (els.thirtyYear) els.thirtyYear.textContent = formatWon(result.thirtyYearCost);
  if (els.fiftyYear) els.fiftyYear.textContent = formatWon(result.fiftyYearCost);

  if (els.valueComment) {
    els.valueComment.innerHTML = `
      <strong>${result.comparison.label}: ${result.comparison.items}</strong>
      <span>${result.comparison.comment}</span>
    `;
  }

  if (els.lifeAnnual) els.lifeAnnual.textContent = formatLifeLoss(result.annualLifeLossMinutes);
  if (els.lifeTenYear) els.lifeTenYear.textContent = formatLifeLoss(result.tenYearLifeLossMinutes);
  if (els.lifeTwentyYear) els.lifeTwentyYear.textContent = formatLifeLoss(result.twentyYearLifeLossMinutes);
  if (els.lifeThirtyYear) els.lifeThirtyYear.textContent = formatLifeLoss(result.thirtyYearLifeLossMinutes);
  if (els.lifeFiftyYear) els.lifeFiftyYear.textContent = formatLifeLoss(result.fiftyYearLifeLossMinutes);

  els.detail.textContent = `하루 ${result.cigarettesPerDay.toLocaleString("ko-KR")}개비 기준입니다. 병원비나 보험료 같은 간접 비용은 포함하지 않았습니다.`;
}

function getValueComparison(annualCost) {
  return VALUE_COMPARISONS.find((item) => annualCost <= item.limit) || VALUE_COMPARISONS[VALUE_COMPARISONS.length - 1];
}

function formatLifeLoss(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  const days = minutes / 60 / 24;
  const months = days / 30.437;
  const years = days / 365.2425;

  if (years >= 1) {
    return `약 ${years.toFixed(1)}년 (${Math.round(days).toLocaleString("ko-KR")}일)`;
  }
  if (months >= 1) {
    return `약 ${months.toFixed(1)}개월 (${Math.round(days).toLocaleString("ko-KR")}일)`;
  }
  return `약 ${days.toFixed(1)}일`;
}
