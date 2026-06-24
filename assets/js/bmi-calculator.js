export function initBmiCalculator(root = document) {
  const form = root.querySelector("#bmi-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "bmi") return;

  const els = {
    resultPanel: root.querySelector("#bmi-result-panel"),
    scoreCard: root.querySelector("#bmi-score-card"),
    score: root.querySelector("#bmi-score"),
    scoreCaption: root.querySelector("#bmi-score-caption"),
    category: root.querySelector("#bmi-category"),
    markerLine: root.querySelector("#bmi-marker-line"),
    markerDot: root.querySelector("#bmi-marker-dot"),
    markerText: root.querySelector("#bmi-marker-text"),
    koreaStandard: root.querySelector("#bmi-korea-standard"),
    koreaNote: root.querySelector("#bmi-korea-note"),
    whoStandard: root.querySelector("#bmi-who-standard"),
    whoNote: root.querySelector("#bmi-who-note"),
    healthyRange: root.querySelector("#bmi-healthy-range"),
    healthyNote: root.querySelector("#bmi-healthy-note"),
    difference: root.querySelector("#bmi-difference"),
    differenceNote: root.querySelector("#bmi-difference-note"),
    targetWeight: root.querySelector("#bmi-target-weight"),
    targetNote: root.querySelector("#bmi-target-note"),
    waistRatio: root.querySelector("#bmi-waist-ratio"),
    waistNote: root.querySelector("#bmi-waist-note"),
    detail: root.querySelector("#bmi-detail"),
    advisoryList: root.querySelector("#bmi-advisory-list"),
    koreaTile: root.querySelector("#bmi-korea-tile"),
    whoTile: root.querySelector("#bmi-who-tile"),
    healthyTile: root.querySelector("#bmi-healthy-tile"),
    differenceTile: root.querySelector("#bmi-difference-tile"),
    targetTile: root.querySelector("#bmi-target-tile"),
    waistTile: root.querySelector("#bmi-waist-tile"),
    optionalToggle: root.querySelector("#bmi-optional-toggle"),
    optionalPanel: root.querySelector("#bmi-optional-panel"),
    exampleButton: root.querySelector("#bmi-example"),
    resetButton: root.querySelector("#bmi-reset")
  };
  const requiredEls = [
    els.score,
    els.scoreCaption,
    els.category,
    els.markerLine,
    els.markerDot,
    els.markerText,
    els.koreaStandard,
    els.koreaNote,
    els.whoStandard,
    els.whoNote,
    els.healthyRange,
    els.healthyNote,
    els.difference,
    els.differenceNote,
    els.targetWeight,
    els.targetNote,
    els.waistRatio,
    els.waistNote,
    els.detail,
    els.advisoryList
  ];
  if (requiredEls.some((element) => !element)) return;

  form.dataset.calculatorReady = "bmi";

  const setOptionalOpen = (isOpen) => {
    if (!els.optionalToggle || !els.optionalPanel) return;
    els.optionalPanel.hidden = !isOpen;
    els.optionalToggle.setAttribute("aria-expanded", String(isOpen));
    els.optionalToggle.textContent = isOpen ? "추가 선택 입력 닫기" : "추가 선택 입력 열기";
  };

  const update = ({ scrollToResult = false } = {}) => {
    const heightCm = readNumber(form.elements.heightCm, null);
    const weightKg = readNumber(form.elements.weightKg, null);
    const targetBmi = readNumber(form.elements.targetBmi, 22);
    const waistCm = readOptionalNumber(form.elements.waistCm);
    const sex = String(form.elements.sex?.value || "");
    const age = readOptionalNumber(form.elements.age);
    const validationMessage = getBmiValidationMessage({ heightCm, weightKg, targetBmi, waistCm, age });
    if (validationMessage) {
      renderBmiPlaceholder(els, validationMessage);
    } else {
      renderBmi(els, calculateBmi({ heightCm, weightKg, targetBmi, waistCm, sex, age }));
    }
    if (scrollToResult) {
      scrollResultIntoView(els.resultPanel);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update({ scrollToResult: true });
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);

  els.optionalToggle?.addEventListener("click", () => {
    const isOpen = els.optionalToggle.getAttribute("aria-expanded") === "true";
    setOptionalOpen(!isOpen);
    if (!isOpen) {
      form.elements.waistCm?.focus({ preventScroll: true });
    }
  });

  els.exampleButton?.addEventListener("click", () => {
    form.elements.heightCm.value = "170";
    form.elements.weightKg.value = "70";
    form.elements.targetBmi.value = "22.0";
    if (form.elements.waistCm) form.elements.waistCm.value = "82";
    if (form.elements.sex) form.elements.sex.value = "";
    if (form.elements.age) form.elements.age.value = "35";
    setOptionalOpen(true);
    update({ scrollToResult: true });
  });

  els.resetButton?.addEventListener("click", () => {
    form.elements.heightCm.value = "170";
    form.elements.weightKg.value = "70";
    form.elements.targetBmi.value = "22.0";
    if (form.elements.waistCm) form.elements.waistCm.value = "";
    if (form.elements.sex) form.elements.sex.value = "";
    if (form.elements.age) form.elements.age.value = "";
    setOptionalOpen(false);
    update();
  });

  setOptionalOpen(false);
  update();
}

export function calculateBmi({ heightCm, weightKg, targetBmi = 22, waistCm = null, sex = "", age = null }) {
  const safeHeightCm = clamp(heightCm, 80, 230);
  const safeWeightKg = clamp(weightKg, 20, 250);
  const safeTargetBmi = clamp(targetBmi, 18.5, 30);
  const heightM = safeHeightCm / 100;
  const heightSquare = heightM * heightM;
  const bmi = safeWeightKg / heightSquare;
  const minHealthyWeight = 18.5 * heightSquare;
  const maxHealthyWeight = 23 * heightSquare;
  const targetWeight = safeTargetBmi * heightSquare;
  const waistToHeightRatio = Number.isFinite(waistCm) && waistCm > 0 ? waistCm / safeHeightCm : null;
  const koreaCategory = getKoreaBmiCategory(bmi);
  const whoCategory = getWhoBmiCategory(bmi);
  const healthyRange = getHealthyRangeStatus(safeWeightKg, minHealthyWeight, maxHealthyWeight);
  const targetWeightStatus = getTargetWeightStatus(safeWeightKg, targetWeight);
  const waistRatioCategory = getWaistRatioCategory(waistToHeightRatio);
  const advisories = getAdvisories({ bmi, koreaCategory, healthyRange, targetWeightStatus, waistRatioCategory, sex, age });

  return {
    bmi,
    weight: safeWeightKg,
    heightCm: safeHeightCm,
    minHealthyWeight,
    maxHealthyWeight,
    targetWeight,
    targetBmi: safeTargetBmi,
    healthyRange,
    targetWeightStatus,
    waistToHeightRatio,
    waistRatioCategory,
    category: koreaCategory,
    whoCategory,
    advisories,
    markerPercent: getMarkerPercent(bmi)
  };
}

function renderBmiPlaceholder(els, message) {
  els.score.textContent = "-";
  els.scoreCaption.textContent = "입력값 확인이 필요합니다.";
  els.category.textContent = "입력값 확인";
  els.category.className = "bmi-category neutral";
  setToneClass(els.scoreCard, "neutral");

  const markerX = 16;
  els.markerLine.setAttribute("x1", markerX);
  els.markerLine.setAttribute("x2", markerX);
  els.markerLine.setAttribute("stroke", getToneColor("neutral"));
  els.markerDot.setAttribute("cx", markerX);
  els.markerDot.setAttribute("stroke", getToneColor("neutral"));
  els.markerText.setAttribute("x", 42);
  els.markerText.setAttribute("fill", getToneColor("neutral"));
  els.markerText.textContent = "BMI -";

  els.koreaStandard.textContent = "-";
  els.koreaNote.textContent = "키와 몸무게를 범위 안에서 입력하면 계산됩니다.";
  els.whoStandard.textContent = "-";
  els.whoNote.textContent = "입력값을 확인한 뒤 국제 기준과 함께 비교합니다.";
  els.healthyRange.textContent = "-";
  els.healthyNote.textContent = "키를 입력하면 참고 체중 범위를 계산합니다.";
  els.difference.textContent = "-";
  els.differenceNote.textContent = "몸무게를 입력하면 정상 범위와의 차이를 표시합니다.";
  els.targetWeight.textContent = "-";
  els.targetNote.textContent = "목표 BMI를 입력하면 참고 체중을 계산합니다.";
  els.waistRatio.textContent = "선택 입력 시 표시";
  els.waistNote.textContent = "허리둘레를 입력하면 키 대비 허리둘레를 함께 참고합니다.";

  [els.koreaTile, els.whoTile, els.healthyTile, els.differenceTile, els.targetTile, els.waistTile].forEach((tile) => setToneClass(tile, "neutral"));
  els.detail.textContent = message;
  renderAdvisories(els.advisoryList, ["키는 80~230cm, 몸무게는 20~250kg 범위에서 입력해 주세요.", "허리둘레, 성별, 나이는 선택 입력이며 비워도 BMI 계산이 가능합니다."]);
}

function renderBmi(els, result) {
  const tone = result.category.tone;
  const markerColor = getToneColor(tone);

  els.score.textContent = formatNumber(result.bmi, 1);
  els.scoreCaption.textContent = `현재 위치: ${result.category.shortLabel || result.category.label}`;
  els.category.textContent = result.category.label;
  els.category.className = `bmi-category ${tone}`;
  setToneClass(els.scoreCard, tone);

  els.koreaStandard.textContent = result.category.shortLabel || result.category.label;
  els.koreaNote.textContent = result.category.note;
  els.whoStandard.textContent = result.whoCategory.label;
  els.whoNote.textContent = result.whoCategory.note;

  const markerX = 16 + 388 * result.markerPercent / 100;
  els.markerLine.setAttribute("x1", markerX);
  els.markerLine.setAttribute("x2", markerX);
  els.markerLine.setAttribute("stroke", markerColor);
  els.markerDot.setAttribute("cx", markerX);
  els.markerDot.setAttribute("stroke", markerColor);
  els.markerText.setAttribute("x", clamp(markerX, 42, 378));
  els.markerText.setAttribute("fill", markerColor);
  els.markerText.textContent = `BMI ${formatNumber(result.bmi, 1)}`;

  els.healthyRange.textContent = `${formatNumber(result.minHealthyWeight, 1)} ~ ${formatNumber(result.maxHealthyWeight, 1)} kg`;
  els.healthyNote.textContent = "한국 성인 정상 BMI 18.5 이상 23 미만 기준입니다.";
  els.difference.textContent = result.healthyRange.label;
  els.differenceNote.textContent = result.healthyRange.note;
  els.targetWeight.textContent = `${formatNumber(result.targetWeight, 1)} kg`;
  els.targetNote.textContent = result.targetWeightStatus.note;

  if (result.waistToHeightRatio !== null) {
    els.waistRatio.textContent = `${formatNumber(result.waistToHeightRatio, 2)} · ${result.waistRatioCategory.label}`;
    els.waistNote.textContent = result.waistRatioCategory.note;
  } else {
    els.waistRatio.textContent = "선택 입력 시 표시";
    els.waistNote.textContent = "허리둘레를 입력하면 키 대비 허리둘레를 함께 참고합니다.";
  }

  setToneClass(els.koreaTile, tone);
  setToneClass(els.whoTile, getWhoTone(result.whoCategory.label));
  setToneClass(els.healthyTile, result.healthyRange.type === "inside" ? "normal" : result.healthyRange.type === "above" ? "watch" : "low");
  setToneClass(els.differenceTile, result.healthyRange.type === "inside" ? "normal" : result.healthyRange.type === "above" ? "watch" : "low");
  setToneClass(els.targetTile, result.targetWeightStatus.type === "same" ? "normal" : "neutral");
  setToneClass(els.waistTile, result.waistToHeightRatio === null ? "neutral" : getWaistTone(result.waistRatioCategory.label));

  els.detail.textContent = buildDetailText(result);
  renderAdvisories(els.advisoryList, result.advisories);
}


function setToneClass(element, tone) {
  if (!element) return;
  element.classList.remove("is-low", "is-normal", "is-watch", "is-high", "is-danger", "is-neutral");
  element.classList.add(`is-${tone || "neutral"}`);
}

function getToneColor(tone) {
  const colors = {
    low: "#5f8fd8",
    normal: "#146c5f",
    watch: "#b7791f",
    high: "#c05621",
    danger: "#b42318",
    neutral: "#5b6472"
  };
  return colors[tone] || colors.neutral;
}

function getWhoTone(label) {
  if (label.includes("저체중")) return "low";
  if (label.includes("정상")) return "normal";
  if (label.includes("과체중")) return "watch";
  return "high";
}

function getWaistTone(label) {
  if (label.includes("낮은")) return "low";
  if (label.includes("참고")) return "normal";
  if (label.includes("매우")) return "danger";
  if (label.includes("높은")) return "watch";
  return "neutral";
}

function scrollResultIntoView(panel) {
  if (!panel) return;
  window.requestAnimationFrame(() => {
    const rect = panel.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const isMostlyVisible = rect.top >= 80 && rect.bottom <= viewportHeight - 24;
    if (!isMostlyVisible) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    panel.focus({ preventScroll: true });
  });
}

function getKoreaBmiCategory(bmi) {
  if (bmi < 18.5) {
    return {
      label: "저체중",
      shortLabel: "저체중",
      tone: "low",
      note: "한국 성인 기준 정상 범위보다 낮은 구간입니다.",
      description: "현재 BMI는 한국 성인 기준에서 저체중 구간입니다."
    };
  }
  if (bmi < 23) {
    return {
      label: "정상",
      shortLabel: "정상",
      tone: "normal",
      note: "한국 성인 기준 정상 범위에 해당합니다.",
      description: "현재 BMI는 한국 성인 기준에서 정상 범위입니다."
    };
  }
  if (bmi < 25) {
    return {
      label: "과체중(비만 전단계)",
      shortLabel: "비만 전단계",
      tone: "watch",
      note: "한국 성인 기준으로 체중 관리가 필요한 전단계입니다.",
      description: "현재 BMI는 한국 성인 기준에서 비만 전단계 구간입니다."
    };
  }
  if (bmi < 30) {
    return {
      label: "비만",
      shortLabel: "비만",
      tone: "high",
      note: "한국 성인 기준 비만 구간입니다.",
      description: "현재 BMI는 한국 성인 기준에서 비만 구간입니다."
    };
  }
  return {
    label: "고도비만",
    shortLabel: "고도비만",
    tone: "danger",
    note: "건강 위험을 함께 확인해야 하는 높은 BMI 구간입니다.",
    description: "현재 BMI는 한국 성인 기준에서 고도비만 구간입니다."
  };
}

function getWhoBmiCategory(bmi) {
  if (bmi < 18.5) {
    return { label: "저체중", note: "WHO 성인 기준에서도 저체중 범위입니다." };
  }
  if (bmi < 25) {
    return { label: "정상 범위", note: "WHO 성인 기준에서는 정상 범위입니다." };
  }
  if (bmi < 30) {
    return { label: "과체중", note: "WHO 성인 기준에서는 과체중 범위입니다." };
  }
  return { label: "비만", note: "WHO 성인 기준에서는 비만 범위입니다." };
}

function getHealthyRangeStatus(weight, minHealthyWeight, maxHealthyWeight) {
  if (weight < minHealthyWeight) {
    const diff = minHealthyWeight - weight;
    return {
      type: "below",
      diff,
      label: `정상 하한보다 -${formatNumber(diff, 1)} kg`,
      note: `정상 범위 하한까지 약 ${formatNumber(diff, 1)} kg 차이가 있습니다.`
    };
  }
  if (weight > maxHealthyWeight) {
    const diff = weight - maxHealthyWeight;
    return {
      type: "above",
      diff,
      label: `정상 상한보다 +${formatNumber(diff, 1)} kg`,
      note: `정상 범위 상한보다 약 ${formatNumber(diff, 1)} kg 높습니다.`
    };
  }
  return {
    type: "inside",
    diff: 0,
    label: "정상 범위 내",
    note: "현재 체중은 한국 기준 정상 BMI 범위 안에 있습니다."
  };
}

function getTargetWeightStatus(weight, targetWeight) {
  const diff = weight - targetWeight;
  if (Math.abs(diff) < 0.05) {
    return {
      type: "same",
      diff,
      note: "현재 체중이 목표 BMI 기준 체중과 거의 같습니다."
    };
  }
  if (diff > 0) {
    return {
      type: "lower",
      diff,
      note: `현재 체중보다 약 ${formatNumber(diff, 1)} kg 낮은 참고 체중입니다.`
    };
  }
  return {
    type: "higher",
    diff,
    note: `현재 체중보다 약 ${formatNumber(Math.abs(diff), 1)} kg 높은 참고 체중입니다.`
  };
}

function getWaistRatioCategory(ratio) {
  if (ratio === null) {
    return {
      label: "미입력",
      note: "허리둘레를 입력하면 보조 지표를 계산합니다."
    };
  }
  if (ratio < 0.4) {
    return {
      label: "낮은 편",
      note: "허리둘레가 키에 비해 낮게 입력되었습니다. 측정값을 한 번 더 확인해 보세요."
    };
  }
  if (ratio < 0.5) {
    return {
      label: "참고 범위",
      note: "키 대비 허리둘레가 비교적 낮은 편입니다. BMI와 함께 참고하세요."
    };
  }
  if (ratio < 0.6) {
    return {
      label: "높은 편",
      note: "키 대비 허리둘레가 높은 편일 수 있습니다. BMI와 함께 참고하세요."
    };
  }
  return {
    label: "매우 높은 편",
    note: "입력한 허리둘레가 키에 비해 매우 높게 계산됩니다. 측정값과 건강검진 결과를 함께 확인하세요."
  };
}

function getAdvisories({ bmi, koreaCategory, healthyRange, targetWeightStatus, waistRatioCategory, sex, age }) {
  const advisories = [];
  advisories.push(koreaCategory.description);

  if (healthyRange.type === "inside") {
    advisories.push("정상 체중 범위 안에 있더라도 허리둘레, 혈압, 혈액검사, 생활습관을 함께 확인하는 것이 좋습니다.");
  } else if (healthyRange.type === "above") {
    advisories.push("정상 체중 범위와의 차이는 참고값이며, 단기간 감량 목표가 아니라 생활습관 점검용으로 보세요.");
  } else {
    advisories.push("저체중 구간에서는 체중 증가 여부보다 영양 상태와 건강 상태를 함께 확인하는 것이 중요합니다.");
  }

  if (targetWeightStatus.type !== "same") {
    advisories.push("목표 BMI 기준 체중은 참고값입니다. 개인의 근육량, 질환, 생활습관에 따라 적정 체중은 달라질 수 있습니다.");
  }

  if (waistRatioCategory.label !== "미입력") {
    advisories.push(`허리-신장비는 ${waistRatioCategory.label}으로 표시됩니다. BMI가 놓칠 수 있는 복부 지방 분포를 보완하는 참고 지표입니다.`);
  } else {
    advisories.push("허리둘레를 추가로 입력하면 BMI만으로 보기 어려운 복부 비율을 함께 참고할 수 있습니다.");
  }

  if (Number.isFinite(age)) {
    if (age < 19) {
      advisories.push("청소년은 성장 단계별 기준이 달라 성인 BMI 기준만으로 해석하지 않는 것이 좋습니다.");
    } else if (age >= 65) {
      advisories.push("고령자는 근감소, 질환, 복용 약물 등으로 BMI 해석이 달라질 수 있습니다.");
    }
  }

  if (sex === "male" || sex === "female") {
    advisories.push("성별은 이번 계산식에 직접 반영하지 않았습니다. BMI 공식은 키와 몸무게만 사용합니다.");
  }

  if (bmi >= 25) {
    advisories.push("BMI가 높은 구간이라도 이 계산기는 진단 도구가 아닙니다. 건강검진 결과와 전문가 상담을 함께 확인하세요.");
  }

  return [...new Set(advisories)].slice(0, 6);
}

function buildDetailText(result) {
  return [
    result.category.description,
    `현재 키 기준 한국 정상 체중 범위는 ${formatNumber(result.minHealthyWeight, 1)}~${formatNumber(result.maxHealthyWeight, 1)}kg입니다.`,
    `목표 BMI ${formatNumber(result.targetBmi, 1)} 기준 체중은 ${formatNumber(result.targetWeight, 1)}kg입니다.`
  ].join(" ");
}

function renderAdvisories(list, advisories) {
  list.replaceChildren();
  advisories.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  });
}

function getMarkerPercent(bmi) {
  const min = 14;
  const max = 35;
  const clamped = Math.min(max, Math.max(min, bmi));
  return ((clamped - min) / (max - min)) * 100;
}

function getBmiValidationMessage({ heightCm, weightKg, targetBmi, waistCm, age }) {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) {
    return "키와 몸무게를 입력하면 BMI 결과가 표시됩니다.";
  }
  if (heightCm < 80 || heightCm > 230) {
    return "키는 80cm 이상 230cm 이하로 입력해 주세요.";
  }
  if (weightKg < 20 || weightKg > 250) {
    return "몸무게는 20kg 이상 250kg 이하로 입력해 주세요.";
  }
  if (!Number.isFinite(targetBmi) || targetBmi < 18.5 || targetBmi > 30) {
    return "목표 BMI는 18.5 이상 30 이하의 참고값으로 입력해 주세요.";
  }
  if (waistCm !== null && (waistCm < 40 || waistCm > 180)) {
    return "허리둘레는 선택 입력이며, 입력할 경우 40cm 이상 180cm 이하로 입력해 주세요.";
  }
  if (age !== null && (age < 1 || age > 120)) {
    return "나이는 선택 입력이며, 입력할 경우 1세 이상 120세 이하로 입력해 주세요.";
  }
  return "";
}

function readNumber(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(input) {
  const raw = input?.value?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
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
