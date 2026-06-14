export function initBmiCalculator(root = document) {
  const form = root.querySelector("#bmi-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "bmi") return;

  const els = {
    score: root.querySelector("#bmi-score"),
    category: root.querySelector("#bmi-category"),
    markerLine: root.querySelector("#bmi-marker-line"),
    markerDot: root.querySelector("#bmi-marker-dot"),
    markerText: root.querySelector("#bmi-marker-text"),
    healthyRange: root.querySelector("#bmi-healthy-range"),
    difference: root.querySelector("#bmi-difference"),
    detail: root.querySelector("#bmi-detail")
  };
  if (Object.values(els).some((element) => !element)) return;

  form.dataset.calculatorReady = "bmi";

  const update = () => {
    const heightCm = readNumber(form.elements.heightCm, 170);
    const weightKg = readNumber(form.elements.weightKg, 70);
    renderBmi(els, calculateBmi({ heightCm, weightKg }));
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  update();
}

export function calculateBmi({ heightCm, weightKg }) {
  const heightM = Math.max(0.5, heightCm / 100);
  const weight = Math.max(0, weightKg);
  const bmi = weight / (heightM * heightM);
  const minHealthyWeight = 18.5 * heightM * heightM;
  const maxHealthyWeight = 23 * heightM * heightM;
  const category = getBmiCategory(bmi);
  const targetDiff = weight < minHealthyWeight
    ? weight - minHealthyWeight
    : weight > maxHealthyWeight
      ? weight - maxHealthyWeight
      : 0;

  return {
    bmi,
    weight,
    minHealthyWeight,
    maxHealthyWeight,
    targetDiff,
    category,
    markerPercent: getMarkerPercent(bmi)
  };
}

function renderBmi(els, result) {
  els.score.textContent = formatNumber(result.bmi, 1);
  els.category.textContent = result.category.label;
  els.category.className = `bmi-category ${result.category.tone}`;
  const markerX = 16 + 388 * result.markerPercent / 100;
  els.markerLine.setAttribute("x1", markerX);
  els.markerLine.setAttribute("x2", markerX);
  els.markerDot.setAttribute("cx", markerX);
  els.markerText.setAttribute("x", clamp(markerX, 42, 378));
  els.markerText.textContent = `BMI ${formatNumber(result.bmi, 1)}`;
  els.healthyRange.textContent = `${formatNumber(result.minHealthyWeight, 1)} ~ ${formatNumber(result.maxHealthyWeight, 1)} kg`;

  if (result.targetDiff > 0) {
    els.difference.textContent = `정상 범위보다 +${formatNumber(result.targetDiff, 1)} kg`;
  } else if (result.targetDiff < 0) {
    els.difference.textContent = `정상 범위보다 ${formatNumber(result.targetDiff, 1)} kg`;
  } else {
    els.difference.textContent = "정상 범위 내";
  }

  els.detail.textContent = `${result.category.description} BMI는 참고 지표이므로 근육량, 체지방률, 질환 여부와 함께 해석하세요.`;
}

function getBmiCategory(bmi) {
  if (bmi < 18.5) {
    return { label: "저체중", tone: "low", description: "체중이 낮은 구간입니다." };
  }
  if (bmi < 23) {
    return { label: "정상", tone: "normal", description: "일반적인 정상 체중 구간입니다." };
  }
  if (bmi < 25) {
    return { label: "과체중(비만 전단계)", tone: "watch", description: "정상 범위를 넘어 관리가 필요한 구간입니다." };
  }
  if (bmi < 30) {
    return { label: "비만", tone: "high", description: "비만으로 분류되는 구간입니다." };
  }
  return { label: "고도비만", tone: "danger", description: "건강 위험이 커질 수 있는 구간입니다." };
}

function getMarkerPercent(bmi) {
  const min = 14;
  const max = 35;
  const clamped = Math.min(max, Math.max(min, bmi));
  return ((clamped - min) / (max - min)) * 100;
}

function readNumber(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 0) {
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function bootBmiCalculator() {
  initBmiCalculator();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootBmiCalculator, { once: true });
  } else {
    bootBmiCalculator();
  }
}
