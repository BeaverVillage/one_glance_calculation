import { getFormNumber } from "./utils.js";

const CUSTOM_DRINKS_KEY = "hannuncalc.caffeine.customDrinks.v1";
const MAX_CUSTOM_DRINKS = 20;
const MAX_INTAKE_RECORDS = 12;

const CAFFEINE_PRESETS = {
  coffee: [
    { id: "americano", label: "아메리카노", amountMg: 120, servingLabel: "1잔", note: "샷 수와 매장에 따라 80~150mg 이상 차이가 날 수 있습니다." },
    { id: "latte", label: "카페라떼", amountMg: 100, servingLabel: "1잔", note: "에스프레소 샷 수에 따라 달라질 수 있습니다." },
    { id: "espresso-shot", label: "에스프레소 1샷", amountMg: 65, servingLabel: "1샷", note: "샷 크기와 원두에 따라 달라질 수 있습니다." },
    { id: "cold-brew", label: "콜드브루", amountMg: 150, servingLabel: "1잔", note: "콜드브루는 제품과 용량에 따라 카페인 편차가 큰 편입니다." },
    { id: "mix-coffee", label: "믹스커피", amountMg: 50, servingLabel: "1봉", note: "제품별 함량 차이가 있으니 포장 표기를 확인하세요." },
    { id: "decaf-coffee", label: "디카페인 커피", amountMg: 5, servingLabel: "1잔", note: "디카페인도 소량의 카페인이 남아 있을 수 있습니다." },
    { id: "coffee-custom", label: "직접 입력", amountMg: null, servingLabel: "직접 입력", note: "카페인 양을 직접 입력하세요." }
  ],
  energy: [
    { id: "redbull-250", label: "레드불 250ml", amountMg: 80, servingLabel: "250ml 1캔", note: "일반적으로 알려진 250ml 1캔 기준 대표값입니다." },
    { id: "redbull-355", label: "레드불 355ml", amountMg: 114, servingLabel: "355ml 1캔", note: "용량이 큰 제품은 카페인 양도 함께 늘어납니다." },
    { id: "redbull-473", label: "레드불 473ml", amountMg: 151, servingLabel: "473ml 1캔", note: "제품과 국가별 라벨에 따라 달라질 수 있습니다." },
    { id: "monster-355", label: "몬스터 355ml", amountMg: 120, servingLabel: "355ml 1캔", note: "몬스터는 라인업별 차이가 커서 제품 라벨 확인이 좋습니다." },
    { id: "monster-473", label: "몬스터 473ml", amountMg: 160, servingLabel: "473ml 1캔", note: "대표적인 473ml 캔 기준 참고값입니다." },
    { id: "hot6-250", label: "핫식스 250ml", amountMg: 60, servingLabel: "250ml 1캔", note: "제품별 리뉴얼과 용량에 따라 달라질 수 있습니다." },
    { id: "energy-custom", label: "직접 입력", amountMg: null, servingLabel: "직접 입력", note: "제품 라벨의 카페인 mg 값을 입력하세요." }
  ],
  tea: [
    { id: "green-tea", label: "녹차", amountMg: 30, servingLabel: "1잔", note: "찻잎 양과 우리는 시간에 따라 달라질 수 있습니다." },
    { id: "black-tea", label: "홍차", amountMg: 45, servingLabel: "1잔", note: "브랜드와 우리는 시간에 따라 차이가 있습니다." },
    { id: "matcha-latte", label: "말차라떼", amountMg: 70, servingLabel: "1잔", note: "말차 가루와 샷 추가 여부에 따라 달라질 수 있습니다." },
    { id: "milk-tea", label: "밀크티", amountMg: 50, servingLabel: "1잔", note: "홍차 농도와 제품 용량에 따라 달라집니다." },
    { id: "tea-custom", label: "직접 입력", amountMg: null, servingLabel: "직접 입력", note: "차 종류와 용량에 맞게 직접 입력하세요." }
  ],
  soda: [
    { id: "cola", label: "콜라", amountMg: 35, servingLabel: "355ml 1캔", note: "제품과 용량에 따라 달라질 수 있습니다." },
    { id: "zero-cola", label: "제로콜라", amountMg: 35, servingLabel: "355ml 1캔", note: "일반 콜라와 비슷한 수준일 수 있으나 제품별로 다릅니다." },
    { id: "chocolate-drink", label: "초콜릿 음료", amountMg: 10, servingLabel: "1잔", note: "초콜릿 함량과 제품에 따라 달라질 수 있습니다." },
    { id: "soda-custom", label: "직접 입력", amountMg: null, servingLabel: "직접 입력", note: "음료 라벨의 카페인 함량을 입력하세요." }
  ],
  custom: [
    { id: "custom", label: "직접 입력", amountMg: null, servingLabel: "직접 입력", note: "카페인 양을 직접 입력하세요." }
  ]
};

const CATEGORY_LABELS = {
  coffee: "커피",
  energy: "에너지드링크",
  tea: "차·티",
  soda: "탄산·기타",
  my: "내 음료",
  custom: "직접 입력"
};

export function initCaffeineSleepCalculator(root = document) {
  const form = root.querySelector("#caffeine-sleep-form");
  if (!form) return;

  const intakeRecords = [];

  const controls = {
    category: form.querySelector("#caffeine-category"),
    preset: form.querySelector("#caffeine-preset"),
    note: form.querySelector("#caffeine-preset-note"),
    caffeineMg: form.querySelector("#caffeine-mg"),
    consumedAt: form.querySelector("#consumed-at"),
    bedtime: form.querySelector("#bedtime"),
    halfLifeHours: form.querySelector("#half-life-hours"),
    quickButtons: [...form.querySelectorAll("[data-caffeine-quick]")],
    customToggle: form.querySelector("#caffeine-custom-toggle"),
    customPanel: form.querySelector("#caffeine-custom-panel"),
    customName: form.querySelector("#caffeine-custom-name"),
    customMg: form.querySelector("#caffeine-custom-mg"),
    customServing: form.querySelector("#caffeine-custom-serving"),
    customSave: form.querySelector("#caffeine-custom-save"),
    customCancel: form.querySelector("#caffeine-custom-cancel"),
    customMessage: form.querySelector("#caffeine-custom-message"),
    customList: form.querySelector("#caffeine-custom-list"),
    addIntake: form.querySelector("#caffeine-add-intake"),
    clearIntakes: form.querySelector("#caffeine-clear-intakes"),
    intakeMessage: form.querySelector("#caffeine-intake-message"),
    intakeList: form.querySelector("#caffeine-intake-list")
  };

  const els = {
    remaining: root.querySelector("#caffeine-remaining"),
    percent: root.querySelector("#caffeine-percent"),
    risk: root.querySelector("#caffeine-risk"),
    time: root.querySelector("#caffeine-time"),
    detail: root.querySelector("#caffeine-detail"),
    visual: root.querySelector("#caffeine-visual"),
    breakdown: root.querySelector("#caffeine-breakdown"),
    resultPanel: root.querySelector("#caffeine-result-panel")
  };

  const buildCurrentIntake = () => {
    const preset = getSelectedPreset(controls);
    return {
      id: `current-${Date.now()}`,
      drinkLabel: preset ? preset.label : "직접 입력",
      categoryLabel: CATEGORY_LABELS[controls.category?.value] || "직접 입력",
      caffeineMg: getFormNumber(form, "caffeineMg", 120),
      consumedAt: form.elements.consumedAt.value
    };
  };

  const update = () => {
    const currentIntake = buildCurrentIntake();
    const activeRecords = intakeRecords.length ? intakeRecords : [currentIntake];
    const result = calculateCaffeineSleep({
      intakes: activeRecords,
      bedtime: form.elements.bedtime.value,
      halfLifeHours: getFormNumber(form, "halfLifeHours", 5),
      isAggregate: intakeRecords.length > 0
    });
    renderCaffeineSleep(els, result);
    renderIntakeList(controls, intakeRecords, ({ id, action }) => {
      if (action === "delete") {
        const index = intakeRecords.findIndex((item) => item.id === id);
        if (index >= 0) intakeRecords.splice(index, 1);
        setIntakeMessage(controls, intakeRecords.length ? "섭취 기록을 삭제했습니다." : "목록이 비어 있으면 현재 입력한 음료 1잔 기준으로 계산합니다.", intakeRecords.length ? "success" : "");
        update();
      }
    });
  };

  const applyPreset = (preset, { updateCategory = false, category = "" } = {}) => {
    if (!preset) return;
    if (updateCategory && controls.category && category) {
      controls.category.value = category;
      renderPresetOptions(controls, category);
      controls.preset.value = preset.id;
    }
    if (preset.amountMg !== null && controls.caffeineMg) {
      controls.caffeineMg.value = preset.amountMg;
    }
    renderPresetNote(controls, preset);
    updateQuickButtonState(controls, preset.id, controls.category?.value);
    update();
  };

  const refreshCustomUi = ({ selectId = "" } = {}) => {
    renderCustomList(controls, ({ id, action }) => {
      if (action === "select") {
        const preset = findPreset("my", id);
        if (preset) applyPreset(preset, { updateCategory: true, category: "my" });
      }
      if (action === "delete") {
        deleteCustomDrink(id);
        if (controls.category?.value === "my") {
          renderPresetOptions(controls, "my");
          applyPreset(getSelectedPreset(controls));
        }
        refreshCustomUi();
        setCustomMessage(controls, "저장한 음료를 삭제했습니다.", "success");
      }
    });

    if (controls.category?.value === "my") {
      renderPresetOptions(controls, "my");
      if (selectId && controls.preset) controls.preset.value = selectId;
      applyPreset(getSelectedPreset(controls));
    }
  };

  renderPresetOptions(controls, controls.category?.value || "coffee");
  refreshCustomUi();
  applyPreset(getSelectedPreset(controls));

  controls.category?.addEventListener("change", () => {
    const category = controls.category.value;
    renderPresetOptions(controls, category);
    applyPreset(getSelectedPreset(controls));
  });

  controls.preset?.addEventListener("change", () => {
    applyPreset(getSelectedPreset(controls));
  });

  controls.quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const [category, presetId] = String(button.dataset.caffeineQuick || "").split(":");
      const preset = findPreset(category, presetId);
      applyPreset(preset, { updateCategory: true, category });
    });
  });

  controls.customToggle?.addEventListener("click", () => {
    const expanded = controls.customToggle.getAttribute("aria-expanded") === "true";
    setCustomPanelOpen(controls, !expanded);
  });

  controls.customCancel?.addEventListener("click", () => {
    clearCustomDrinkForm(controls);
    setCustomPanelOpen(controls, false);
  });

  controls.customSave?.addEventListener("click", () => {
    const drink = buildCustomDrinkFromForm(controls);
    if (!drink.ok) {
      setCustomMessage(controls, drink.message, "error");
      return;
    }
    const saved = saveCustomDrink(drink.value);
    setCustomMessage(controls, `${saved.label} · ${saved.amountMg}mg을 내 음료에 저장했습니다.`, "success");
    clearCustomDrinkForm(controls);
    if (controls.category) controls.category.value = "my";
    renderPresetOptions(controls, "my");
    if (controls.preset) controls.preset.value = saved.id;
    refreshCustomUi({ selectId: saved.id });
    setCustomPanelOpen(controls, false);
  });

  controls.caffeineMg?.addEventListener("input", () => {
    const preset = getSelectedPreset(controls);
    if (preset && preset.amountMg !== null && Number(controls.caffeineMg.value) !== preset.amountMg) {
      controls.note.textContent = `${preset.label} 프리셋을 선택했지만 카페인 양을 직접 수정했습니다. 제품 라벨 기준으로 입력하면 더 좋습니다.`;
    }
  });

  controls.addIntake?.addEventListener("click", () => {
    const intake = buildCurrentIntake();
    const validation = validateIntake(intake);
    if (!validation.ok) {
      setIntakeMessage(controls, validation.message, "error");
      return;
    }
    if (intakeRecords.length >= MAX_INTAKE_RECORDS) {
      setIntakeMessage(controls, `섭취 기록은 최대 ${MAX_INTAKE_RECORDS}개까지 추가할 수 있습니다.`, "error");
      return;
    }
    intakeRecords.push({ ...intake, id: `intake-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` });
    setIntakeMessage(controls, `${intake.drinkLabel} ${Math.round(intake.caffeineMg).toLocaleString("ko-KR")}mg을 목록에 추가했습니다.`, "success");
    update();
  });

  controls.clearIntakes?.addEventListener("click", () => {
    intakeRecords.splice(0, intakeRecords.length);
    setIntakeMessage(controls, "목록을 비웠습니다. 현재 입력한 음료 1잔 기준으로 계산합니다.", "success");
    update();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
    els.resultPanel?.focus({ preventScroll: true });
    els.resultPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateCaffeineSleep(values) {
  const halfLifeHours = clampNumber(values.halfLifeHours, 1, 12, 5);
  const bedtime = values.bedtime || "23:30";
  const intakes = Array.isArray(values.intakes) && values.intakes.length ? values.intakes : [
    {
      caffeineMg: values.caffeineMg,
      consumedAt: values.consumedAt,
      drinkLabel: values.drinkLabel || "직접 입력",
      categoryLabel: values.categoryLabel || "직접 입력"
    }
  ];

  const itemResults = intakes.map((intake, index) => {
    const caffeineMg = Math.max(0, Number(intake.caffeineMg) || 0);
    const consumedAt = intake.consumedAt || "15:00";
    const hoursUntilBed = getHoursBetween(consumedAt, bedtime);
    const consumedOffsetHours = -hoursUntilBed;
    const remainingMg = caffeineMg * Math.pow(0.5, hoursUntilBed / halfLifeHours);
    return {
      id: intake.id || `item-${index}`,
      drinkLabel: intake.drinkLabel || "직접 입력",
      categoryLabel: intake.categoryLabel || "직접 입력",
      caffeineMg,
      consumedAt,
      consumedOffsetHours,
      hoursUntilBed,
      remainingMg,
      remainingPercent: caffeineMg ? remainingMg / caffeineMg * 100 : 0
    };
  });

  const caffeineMg = itemResults.reduce((sum, item) => sum + item.caffeineMg, 0);
  const remainingMg = itemResults.reduce((sum, item) => sum + item.remainingMg, 0);
  const remainingPercent = caffeineMg ? remainingMg / caffeineMg * 100 : 0;
  const risk = getCaffeineRisk(remainingMg, remainingPercent);
  const count = itemResults.length;
  const timeline = buildCaffeineTimeline({ itemResults, caffeineMg, halfLifeHours, bedtime, remainingPercent });

  return {
    caffeineMg,
    halfLifeHours,
    bedtime,
    hoursUntilBed: count === 1 ? itemResults[0].hoursUntilBed : null,
    remainingMg,
    remainingPercent,
    risk,
    drinkLabel: count === 1 ? itemResults[0].drinkLabel : `${count}개 섭취 기록`,
    categoryLabel: count === 1 ? itemResults[0].categoryLabel : "여러 잔 합산",
    count,
    isAggregate: Boolean(values.isAggregate) || count > 1,
    itemResults,
    timeline
  };
}

function renderPresetOptions(controls, category) {
  if (!controls.preset) return;
  const presets = getPresets(category);
  controls.preset.textContent = "";
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.label}${preset.amountMg !== null ? ` · ${preset.amountMg}mg` : ""}`;
    controls.preset.append(option);
  });
}

function getSelectedPreset(controls) {
  const category = controls.category?.value || "coffee";
  const presetId = controls.preset?.value || "";
  return findPreset(category, presetId) || getPresets(category)[0] || CAFFEINE_PRESETS.custom[0];
}

function findPreset(category, presetId) {
  return getPresets(category).find((preset) => preset.id === presetId) || null;
}

function getPresets(category) {
  if (category === "my") {
    const customDrinks = loadCustomDrinks();
    return customDrinks.length ? customDrinks : [
      { id: "my-empty", label: "저장한 음료 없음", amountMg: null, servingLabel: "내 음료 추가 필요", note: "내 음료 추가 버튼으로 자주 마시는 음료를 저장해 보세요." }
    ];
  }
  return CAFFEINE_PRESETS[category] || CAFFEINE_PRESETS.custom;
}

function renderPresetNote(controls, preset) {
  if (!controls.note || !preset) return;
  const amountText = preset.amountMg !== null ? `${preset.amountMg}mg · ${preset.servingLabel}` : preset.servingLabel;
  controls.note.textContent = `${preset.label}: ${amountText}. ${preset.note} 자동 입력값은 참고값이며 직접 수정할 수 있습니다.`;
}

function updateQuickButtonState(controls, presetId, category) {
  controls.quickButtons.forEach((button) => {
    const isActive = button.dataset.caffeineQuick === `${category}:${presetId}`;
    button.classList.toggle("is-active", isActive);
  });
}

function renderCaffeineSleep(els, result) {
  if (!result.caffeineMg) {
    els.remaining.textContent = "-";
    els.percent.textContent = "-";
    els.risk.textContent = "입력 확인";
    els.time.textContent = "-";
    els.detail.textContent = "카페인 양을 1mg 이상으로 입력하거나 음료 프리셋을 선택해 주세요.";
    els.visual.textContent = "";
    els.breakdown.textContent = "";
    return;
  }
  els.remaining.textContent = `${Math.round(result.remainingMg).toLocaleString("ko-KR")}mg`;
  els.percent.textContent = `${Math.round(result.remainingPercent)}%`;
  els.risk.textContent = result.risk;
  els.time.textContent = result.count > 1 ? `${result.count}개 합산` : `${round(result.hoursUntilBed, 1)}시간`;
  if (result.count > 1) {
    els.detail.textContent = `${result.count}개 섭취 기록, 총 ${Math.round(result.caffeineMg).toLocaleString("ko-KR")}mg 기준으로 취침 시점의 총 잔존량을 추정했습니다. 제품별 함량과 개인 민감도는 다를 수 있습니다.`;
  } else {
    els.detail.textContent = `${result.drinkLabel} ${Math.round(result.caffeineMg).toLocaleString("ko-KR")}mg 기준으로 취침 시점의 잔존량을 추정했습니다. 제품별 함량과 개인 민감도는 다를 수 있습니다.`;
  }
  renderCaffeineVisual(els.visual, result);
  renderBreakdown(els.breakdown, result);
}

function renderCaffeineVisual(container, result) {
  if (!container) return;
  container.textContent = "";

  const visualCard = document.createElement("div");
  visualCard.className = "caffeine-visual-card";

  const heading = document.createElement("div");
  heading.className = "caffeine-visual-heading";
  const title = document.createElement("strong");
  title.textContent = "카페인 감소 흐름";
  const summary = document.createElement("span");
  summary.textContent = result.count > 1
    ? `총 ${Math.round(result.caffeineMg).toLocaleString("ko-KR")}mg 중 취침 시 약 ${Math.round(result.remainingPercent)}%가 남는 것으로 추정됩니다.`
    : `${result.drinkLabel} 기준으로 취침 시 약 ${Math.round(result.remainingPercent)}%가 남는 것으로 추정됩니다.`;
  heading.append(title, summary);

  const bar = document.createElement("div");
  bar.className = "caffeine-residual-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `취침 시 잔존 비율 ${Math.round(result.remainingPercent)}%`);
  const fill = document.createElement("span");
  fill.style.width = `${clampNumber(result.remainingPercent, 0, 100, 0)}%`;
  bar.append(fill);

  const barLabels = document.createElement("div");
  barLabels.className = "caffeine-bar-labels";
  ["0%", "25%", "50%", "75%", "100%"].forEach((label) => {
    const item = document.createElement("span");
    item.textContent = label;
    barLabels.append(item);
  });

  const timeline = document.createElement("div");
  timeline.className = "caffeine-timeline";
  timeline.setAttribute("role", "img");
  timeline.setAttribute("aria-label", "섭취 시간, 취침 시간, 잔존 비율 기준 시점 타임라인");
  const track = document.createElement("div");
  track.className = "caffeine-timeline-track";
  timeline.append(track);

  result.timeline.nodes.forEach((node) => {
    const marker = document.createElement("div");
    marker.className = `caffeine-timeline-node ${node.kind ? `is-${node.kind}` : ""}`;
    marker.style.left = `${node.position}%`;
    const dot = document.createElement("span");
    dot.className = "caffeine-timeline-dot";
    const text = document.createElement("span");
    text.className = "caffeine-timeline-label";
    text.textContent = `${node.label} · ${node.timeLabel}`;
    marker.append(dot, text);
    timeline.append(marker);
  });

  const caption = document.createElement("p");
  caption.className = "helper-text caffeine-visual-caption";
  caption.textContent = result.timeline.caption;

  visualCard.append(heading, bar, barLabels, timeline, caption);
  container.append(visualCard);
}

function renderBreakdown(container, result) {
  if (!container) return;
  container.textContent = "";
  const heading = document.createElement("div");
  heading.className = "caffeine-breakdown-heading";
  const title = document.createElement("strong");
  title.textContent = result.count > 1 ? "음료별 잔존량" : "현재 음료 기준";
  const description = document.createElement("span");
  description.textContent = result.count > 1 ? "각 음료가 취침 시점에 어느 정도 남는지 나눠서 보여줍니다." : "목록에 음료를 추가하면 여러 잔을 합산할 수 있습니다.";
  heading.append(title, description);
  container.append(heading);

  result.itemResults.forEach((item) => {
    const card = document.createElement("div");
    card.className = "caffeine-breakdown-item";
    const main = document.createElement("div");
    main.className = "caffeine-breakdown-main";
    const name = document.createElement("strong");
    name.textContent = item.drinkLabel;
    const meta = document.createElement("span");
    meta.textContent = `${formatTimeLabel(item.consumedAt)} 섭취 · ${Math.round(item.caffeineMg).toLocaleString("ko-KR")}mg · 취침까지 ${round(item.hoursUntilBed, 1)}시간`;
    const miniBar = document.createElement("div");
    miniBar.className = "caffeine-breakdown-bar";
    const miniFill = document.createElement("span");
    miniFill.style.width = `${clampNumber(item.remainingPercent, 0, 100, 0)}%`;
    miniBar.append(miniFill);
    main.append(name, meta, miniBar);
    const value = document.createElement("div");
    value.className = "caffeine-breakdown-value";
    const amount = document.createElement("strong");
    amount.textContent = `${Math.round(item.remainingMg).toLocaleString("ko-KR")}mg`;
    const percent = document.createElement("span");
    percent.textContent = `잔존 ${Math.round(item.remainingPercent)}%`;
    value.append(amount, percent);
    card.append(main, value);
    container.append(card);
  });
}

function renderIntakeList(controls, records, onAction) {
  if (!controls.intakeList) return;
  controls.intakeList.textContent = "";
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "아직 추가한 음료가 없습니다. 목록이 비어 있으면 현재 입력한 음료 1잔 기준으로 계산합니다.";
    controls.intakeList.append(empty);
    return;
  }

  records.forEach((record, index) => {
    const item = document.createElement("div");
    item.className = "caffeine-intake-item";
    const text = document.createElement("div");
    text.className = "caffeine-intake-item-text";
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${record.drinkLabel}`;
    const meta = document.createElement("span");
    meta.textContent = `${formatTimeLabel(record.consumedAt)} · ${Math.round(record.caffeineMg).toLocaleString("ko-KR")}mg · ${record.categoryLabel}`;
    text.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "caffeine-intake-item-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button small danger";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => onAction({ id: record.id, action: "delete" }));
    actions.append(deleteButton);
    item.append(text, actions);
    controls.intakeList.append(item);
  });
}

function validateIntake(intake) {
  if (!Number.isFinite(Number(intake.caffeineMg)) || Number(intake.caffeineMg) <= 0 || Number(intake.caffeineMg) > 1000) {
    return { ok: false, message: "목록에 추가하려면 카페인 양을 1mg 이상 1000mg 이하로 입력해 주세요." };
  }
  if (!/^\d{2}:\d{2}$/.test(String(intake.consumedAt || ""))) {
    return { ok: false, message: "마신 시간을 먼저 입력해 주세요." };
  }
  return { ok: true, message: "" };
}

function setIntakeMessage(controls, message, type = "") {
  if (!controls.intakeMessage) return;
  controls.intakeMessage.textContent = message;
  controls.intakeMessage.dataset.state = type;
}

function buildCaffeineTimeline({ itemResults, caffeineMg, halfLifeHours, bedtime, remainingPercent }) {
  if (!itemResults.length || !caffeineMg) {
    return {
      nodes: [],
      caption: "카페인 양을 입력하면 감소 흐름을 표시합니다."
    };
  }
  const offsets = itemResults.map((item) => item.consumedOffsetHours);
  const firstOffset = Math.min(...offsets);
  const latestOffset = Math.max(...offsets);
  const thresholdTimes = [
    { ratio: 0.5, label: "50% 이하", kind: "half" },
    { ratio: 0.25, label: "25% 이하", kind: "quarter" },
    { ratio: 0.1, label: "10% 이하", kind: "low" }
  ].map((target) => ({ ...target, offset: findThresholdOffset(itemResults, caffeineMg, halfLifeHours, latestOffset, target.ratio) }));

  const maxOffset = Math.max(0, ...thresholdTimes.map((item) => item.offset));
  const minOffset = Math.min(firstOffset, latestOffset, 0);
  const range = Math.max(1, maxOffset - minOffset);
  const toPosition = (offset) => Math.round(clampNumber((offset - minOffset) / range * 100, 0, 100, 0));
  const firstItem = itemResults.find((item) => item.consumedOffsetHours === firstOffset) || itemResults[0];
  const latestItem = itemResults.find((item) => item.consumedOffsetHours === latestOffset) || itemResults[itemResults.length - 1];
  const nodes = [];

  nodes.push({
    kind: "intake",
    label: itemResults.length > 1 ? "첫 섭취" : "마신 시간",
    timeLabel: formatTimeLabel(firstItem.consumedAt),
    position: toPosition(firstOffset)
  });
  if (itemResults.length > 1 && latestOffset !== firstOffset) {
    nodes.push({
      kind: "latest",
      label: "마지막 섭취",
      timeLabel: formatTimeLabel(latestItem.consumedAt),
      position: toPosition(latestOffset)
    });
  }
  nodes.push({
    kind: "bedtime",
    label: "취침",
    timeLabel: formatTimeLabel(bedtime),
    position: toPosition(0)
  });
  thresholdTimes.forEach((item) => {
    nodes.push({
      kind: item.kind,
      label: item.label,
      timeLabel: formatOffsetTimeLabel(bedtime, item.offset),
      position: toPosition(item.offset)
    });
  });

  const caption = itemResults.length > 1
    ? `여러 잔은 각 섭취 시간별 잔존량을 따로 계산한 뒤 합산합니다. 취침 시점에는 총 섭취량의 약 ${Math.round(remainingPercent)}%가 남는 것으로 추정됩니다.`
    : `반감기 ${round(halfLifeHours, 1)}시간 기준으로 시간 경과에 따른 잔존 비율을 표시합니다. 취침 시점에는 약 ${Math.round(remainingPercent)}%가 남습니다.`;
  return { nodes, caption };
}

function findThresholdOffset(itemResults, totalCaffeineMg, halfLifeHours, startOffset, ratio) {
  const target = totalCaffeineMg * ratio;
  const remainingAt = (offset) => itemResults.reduce((sum, item) => {
    if (offset < item.consumedOffsetHours) return sum;
    return sum + item.caffeineMg * Math.pow(0.5, (offset - item.consumedOffsetHours) / halfLifeHours);
  }, 0);

  if (remainingAt(startOffset) <= target) return startOffset;
  let low = startOffset;
  let high = Math.max(startOffset + halfLifeHours, 0);
  let guard = 0;
  while (remainingAt(high) > target && guard < 12) {
    high += halfLifeHours;
    guard += 1;
  }
  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    if (remainingAt(mid) > target) low = mid;
    else high = mid;
  }
  return high;
}

function formatOffsetTimeLabel(bedtime, offsetHours) {
  const [hour, minute] = String(bedtime || "00:00").split(":").map(Number);
  const base = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
  const totalMinutes = Math.round(base + offsetHours * 60);
  const dayOffset = Math.floor(totalMinutes / 1440);
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const label = formatTimeLabel(`${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`);
  if (dayOffset > 0) return `다음날 ${label}`;
  if (dayOffset < 0) return `전날 ${label}`;
  return label;
}

function getCaffeineRisk(remainingMg, remainingPercent) {
  if (remainingMg >= 100 || remainingPercent >= 55) return "영향 가능성 높음";
  if (remainingMg >= 50 || remainingPercent >= 30) return "주의해서 볼 구간";
  if (remainingMg >= 25 || remainingPercent >= 15) return "민감하면 영향 가능";
  return "낮은 편";
}

function loadCustomDrinks() {
  try {
    const raw = window.localStorage?.getItem(CUSTOM_DRINKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStoredDrink)
      .filter(Boolean)
      .slice(0, MAX_CUSTOM_DRINKS);
  } catch {
    return [];
  }
}

function normalizeStoredDrink(drink) {
  const label = sanitizeText(drink?.label || "").slice(0, 32);
  const amountMg = Number(drink?.amountMg);
  const servingLabel = sanitizeText(drink?.servingLabel || "직접 저장").slice(0, 24) || "직접 저장";
  const id = sanitizeText(drink?.id || "").slice(0, 48);
  if (!label || !Number.isFinite(amountMg) || amountMg <= 0 || amountMg > 1000 || !id) return null;
  return {
    id,
    label,
    amountMg: Math.round(amountMg),
    servingLabel,
    note: "사용자가 이 브라우저에 저장한 내 음료입니다."
  };
}

function saveCustomDrink(drink) {
  const drinks = loadCustomDrinks();
  const saved = {
    id: `my-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: drink.label,
    amountMg: drink.amountMg,
    servingLabel: drink.servingLabel,
    note: "사용자가 이 브라우저에 저장한 내 음료입니다."
  };
  const next = [saved, ...drinks].slice(0, MAX_CUSTOM_DRINKS);
  try {
    window.localStorage?.setItem(CUSTOM_DRINKS_KEY, JSON.stringify(next));
  } catch {
    // 저장 공간이 막힌 브라우저에서는 현재 세션의 UI만 유지합니다.
  }
  return saved;
}

function deleteCustomDrink(id) {
  const next = loadCustomDrinks().filter((drink) => drink.id !== id);
  try {
    window.localStorage?.setItem(CUSTOM_DRINKS_KEY, JSON.stringify(next));
  } catch {
    // 무시합니다.
  }
}

function buildCustomDrinkFromForm(controls) {
  const label = sanitizeText(controls.customName?.value || "").slice(0, 32);
  const amountMg = Number(controls.customMg?.value);
  const servingLabel = sanitizeText(controls.customServing?.value || "직접 저장").slice(0, 24) || "직접 저장";

  if (!label) {
    return { ok: false, message: "음료 이름을 입력해 주세요." };
  }
  if (!Number.isFinite(amountMg) || amountMg <= 0 || amountMg > 1000) {
    return { ok: false, message: "카페인 양은 1mg 이상 1000mg 이하로 입력해 주세요." };
  }
  return {
    ok: true,
    value: {
      label,
      amountMg: Math.round(amountMg),
      servingLabel
    }
  };
}

function renderCustomList(controls, onAction) {
  if (!controls.customList) return;
  const drinks = loadCustomDrinks();
  controls.customList.textContent = "";
  if (!drinks.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "아직 저장한 음료가 없습니다. 자주 마시는 음료를 저장하면 다음부터 바로 선택할 수 있습니다.";
    controls.customList.append(empty);
    return;
  }

  drinks.forEach((drink) => {
    const item = document.createElement("div");
    item.className = "caffeine-custom-item";

    const text = document.createElement("div");
    text.className = "caffeine-custom-item-text";
    const title = document.createElement("strong");
    title.textContent = drink.label;
    const meta = document.createElement("span");
    meta.textContent = `${drink.amountMg}mg · ${drink.servingLabel}`;
    text.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "caffeine-custom-item-actions";
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "ghost-button small";
    selectButton.textContent = "선택";
    selectButton.addEventListener("click", () => onAction({ id: drink.id, action: "select" }));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button small danger";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => onAction({ id: drink.id, action: "delete" }));

    actions.append(selectButton, deleteButton);
    item.append(text, actions);
    controls.customList.append(item);
  });
}

function setCustomPanelOpen(controls, open) {
  if (!controls.customToggle || !controls.customPanel) return;
  controls.customToggle.setAttribute("aria-expanded", String(open));
  controls.customToggle.textContent = open ? "내 음료 추가 닫기" : "내 음료 추가";
  controls.customPanel.hidden = !open;
  controls.customPanel.setAttribute("aria-hidden", String(!open));
  if (open) {
    controls.customName?.focus();
  }
}

function setCustomMessage(controls, message, type = "") {
  if (!controls.customMessage) return;
  controls.customMessage.textContent = message;
  controls.customMessage.dataset.state = type;
}

function clearCustomDrinkForm(controls) {
  if (controls.customName) controls.customName.value = "";
  if (controls.customMg) controls.customMg.value = "";
  if (controls.customServing) controls.customServing.value = "";
  setCustomMessage(controls, "", "");
}

function sanitizeText(value) {
  return String(value).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function getHoursBetween(start, end) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let diff = (endHour + endMinute / 60) - (startHour + startMinute / 60);
  if (diff < 0) diff += 24;
  return diff;
}

function formatTimeLabel(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  const normalizedHour = Number.isFinite(hour) ? hour : 0;
  const normalizedMinute = Number.isFinite(minute) ? minute : 0;
  const period = normalizedHour < 12 ? "오전" : "오후";
  const hour12 = normalizedHour % 12 || 12;
  return `${period} ${hour12}:${String(normalizedMinute).padStart(2, "0")}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function round(value, digits = 0) {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}
