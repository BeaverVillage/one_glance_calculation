const LIGHT_SPEED_KM_PER_SEC = 299792.458;
const LIGHT_YEAR_KM = 9460730472580.8;
const AU_KM = 149597870.7;
const EARTH_CIRCUMFERENCE_KM = 40075;

const DISTANCE_MODE_LABELS = {
  representative: "대표 거리",
  near: "가까운 거리 참고",
  far: "먼 거리 참고",
  custom: "직접 입력 거리"
};

const SPEEDS = [
  { key: "light", label: "빛의 속도", kmPerSecond: LIGHT_SPEED_KM_PER_SEC, note: "진공에서 빛이 이동하는 속도입니다. 실제 물체가 낼 수 있는 속도라는 뜻은 아닙니다." },
  { key: "parker", label: "파커 태양 탐사선급", kmPerSecond: 192, note: "인류가 만든 탐사선 중 매우 빠른 축에 드는 속도입니다." },
  { key: "voyager", label: "보이저 1호급", kmPerSecond: 17, note: "태양계를 벗어난 탐사선 속도에 가까운 참고값입니다." },
  { key: "new-horizons", label: "뉴허라이즌스급", kmPerSecond: 14, note: "명왕성을 지나간 탐사선 속도를 단순화한 참고값입니다." },
  { key: "escape", label: "로켓 속도(지구 탈출속도)", kmPerSecond: 11.2, note: "지구 중력을 벗어나는 데 필요한 대표 속도입니다." },
  { key: "iss", label: "국제우주정거장급", kmPerSecond: 7.66, note: "지구 저궤도에서 움직이는 빠른 우주선 속도 참고값입니다." },
  { key: "jet", label: "여객기 속도", kmPerSecond: 0.25, note: "시속 약 900km로 단순 환산했습니다." },
  { key: "car", label: "자동차 고속도로 속도", kmPerSecond: 0.0278, note: "시속 약 100km로 단순 환산한 체감 비교값입니다." },
  { key: "ktx", label: "KTX 속도", kmPerSecond: 0.0833, note: "시속 약 300km로 단순 환산했습니다." },
  { key: "walk", label: "걸어서", kmPerSecond: 0.0014, note: "시속 약 5km입니다. 우주는 운동화로 해결되지 않습니다." },
  { key: "custom", label: "직접 입력 속도", kmPerSecond: 0.25, note: "입력한 km/h 속도를 기준으로 계산합니다." }
];

const COMPARISON_SPEED_KEYS = ["walk", "car", "jet", "escape", "voyager", "light"];

const DESTINATION_GROUPS = [
  {
    label: "태양계",
    items: [
      { key: "moon", label: "달", representativeKm: 384400, nearKm: 363300, farKm: 405500, note: "달 거리는 지구와 달의 위치에 따라 약간 달라집니다." },
      { key: "sun", label: "태양", representativeKm: AU_KM, nearKm: AU_KM, farKm: AU_KM, note: "1AU에 가까운 지구-태양 평균 거리 기준입니다." },
      { key: "mercury", label: "수성", representativeKm: 91690000, nearKm: 77000000, farKm: 222000000, note: "수성은 지구와의 위치 변화가 커서 대표·가까운·먼 거리 차이가 큽니다." },
      { key: "venus", label: "금성", representativeKm: 41400000, nearKm: 41400000, farKm: 261000000, note: "금성은 가까울 때와 멀 때의 거리 차이가 큽니다." },
      { key: "mars", label: "화성", representativeKm: 78300000, nearKm: 54600000, farKm: 401000000, note: "화성은 발사 시기에 따라 실제 이동 시간이 크게 달라질 수 있습니다." },
      { key: "jupiter", label: "목성", representativeKm: 628700000, nearKm: 588000000, farKm: 968000000, note: "목성까지의 거리는 공전 위치에 따라 크게 달라집니다." },
      { key: "saturn", label: "토성", representativeKm: 1275000000, nearKm: 1200000000, farKm: 1660000000, note: "토성은 외행성이므로 대표 거리 자체가 매우 큽니다." },
      { key: "uranus", label: "천왕성", representativeKm: 2724000000, nearKm: 2580000000, farKm: 3150000000, note: "천왕성은 대표 거리 기준으로도 빛이 몇 시간 걸리는 거리입니다." },
      { key: "neptune", label: "해왕성", representativeKm: 4351000000, nearKm: 4300000000, farKm: 4700000000, note: "해왕성은 태양계 외곽의 먼 행성입니다." },
      { key: "pluto", label: "명왕성", representativeKm: 4780000000, nearKm: 4280000000, farKm: 7530000000, note: "명왕성은 궤도가 타원형이라 거리 변화가 큽니다." }
    ]
  },
  {
    label: "가까운 별",
    items: [
      { key: "proxima", label: "프록시마 센타우리", representativeLy: 4.2465, note: "태양에서 가장 가까운 별계입니다." },
      { key: "sirius", label: "시리우스", representativeLy: 8.6, note: "밤하늘에서 매우 밝게 보이는 별입니다." },
      { key: "vega", label: "베가", representativeLy: 25.04, note: "거문고자리의 밝은 별입니다." },
      { key: "trappist", label: "TRAPPIST-1", representativeLy: 40.66, note: "지구형 행성 후보로 자주 언급되는 별계입니다." },
      { key: "polaris", label: "북극성", representativeLy: 433, note: "북쪽 방향을 찾을 때 쓰이는 대표 별입니다." },
      { key: "betelgeuse", label: "베텔게우스", representativeLy: 642, note: "오리온자리의 붉은 초거성입니다." }
    ]
  },
  {
    label: "은하와 더 먼 곳",
    items: [
      { key: "galactic-center", label: "우리은하 중심", representativeLy: 26000, note: "궁수자리 방향의 은하 중심까지의 대략 거리입니다." },
      { key: "lmc", label: "대마젤란은하", representativeLy: 163000, note: "우리은하 주변의 위성은하입니다." },
      { key: "andromeda", label: "안드로메다 은하", representativeLy: 2537000, note: "맨눈으로도 볼 수 있는 가까운 대형 은하입니다." },
      { key: "triangulum", label: "삼각형자리 은하", representativeLy: 2730000, note: "국부은하군의 또 다른 큰 은하입니다." },
      { key: "sombrero", label: "솜브레로 은하", representativeLy: 31000000, note: "독특한 모양으로 유명한 은하입니다." },
      { key: "m87", label: "M87 은하", representativeLy: 53500000, note: "블랙홀 이미지로 유명한 거대 타원은하입니다." }
    ]
  }
];

export function initSpaceTravelCalculator(root = document) {
  const form = root.querySelector("#space-travel-form");
  if (!form) return;

  const speedSelect = form.elements.speedKey;
  const destinationSelect = form.elements.destinationKey;
  const distanceModeSelect = form.elements.distanceMode;
  const customDistanceInput = form.elements.customDistance;
  const customDistanceUnitSelect = form.elements.customDistanceUnit;
  const customSpeedInput = form.elements.customSpeedKmh;
  const advancedToggle = root.querySelector("#space-advanced-toggle");
  const advancedPanel = root.querySelector("#space-advanced-panel");
  const exampleButton = root.querySelector("#space-example-button");
  const resetButton = root.querySelector("#space-reset-button");

  populateSpeedSelect(speedSelect);
  populateDestinationSelect(destinationSelect);

  const els = {
    panel: root.querySelector("#space-result-panel"),
    time: root.querySelector("#space-travel-time"),
    distance: root.querySelector("#space-distance"),
    distanceKm: root.querySelector("#space-distance-km"),
    distanceAu: root.querySelector("#space-distance-au"),
    distanceLy: root.querySelector("#space-distance-ly"),
    speed: root.querySelector("#space-speed-result"),
    lightTime: root.querySelector("#space-light-time"),
    signalDelay: root.querySelector("#space-signal-delay"),
    earthLaps: root.querySelector("#space-earth-laps"),
    comment: root.querySelector("#space-comment"),
    validation: root.querySelector("#space-validation"),
    note: root.querySelector("#space-note"),
    bar: root.querySelector("#space-progress-bar"),
    routeDestination: root.querySelector("#space-route-destination"),
    comparisonGrid: root.querySelector("#space-comparison-grid"),
    distanceFeel: root.querySelector("#space-distance-feel"),
    distanceFeelNote: root.querySelector("#space-distance-feel-note"),
    lightHighlight: root.querySelector("#space-light-highlight"),
    lightNote: root.querySelector("#space-light-note"),
    signalHighlight: root.querySelector("#space-signal-highlight"),
    signalNote: root.querySelector("#space-signal-note"),
    scaleFill: root.querySelector("#space-scale-fill"),
    scaleMarker: root.querySelector("#space-scale-marker"),
    scaleNote: root.querySelector("#space-scale-note")
  };

  const readValues = () => ({
    speedKey: speedSelect.value,
    destinationKey: destinationSelect.value,
    distanceMode: distanceModeSelect.value,
    customDistance: Number.parseFloat(customDistanceInput.value),
    customDistanceRaw: customDistanceInput.value.trim(),
    customDistanceUnit: customDistanceUnitSelect.value,
    customSpeedKmh: Number.parseFloat(customSpeedInput.value),
    customSpeedRaw: customSpeedInput.value.trim()
  });

  const setAdvancedPanel = (open, { focus = false } = {}) => {
    if (!advancedPanel || !advancedToggle) return;
    if (open) {
      advancedPanel.removeAttribute("hidden");
      advancedToggle.setAttribute("aria-expanded", "true");
      advancedToggle.textContent = "직접 거리·속도 입력 닫기";
      if (focus) {
        if (distanceModeSelect.value === "custom") customDistanceInput.focus();
        else if (speedSelect.value === "custom") customSpeedInput.focus();
      }
    } else {
      advancedPanel.setAttribute("hidden", "");
      advancedToggle.setAttribute("aria-expanded", "false");
      advancedToggle.textContent = "직접 거리·속도 입력 열기";
    }
  };

  const updateCustomSpeedPlaceholder = () => {
    const speed = SPEEDS.find((item) => item.key === speedSelect.value) || SPEEDS[0];
    customSpeedInput.placeholder = `${Math.round(speed.kmPerSecond * 3600).toLocaleString("ko-KR")}`;
  };

  const update = ({ scroll = false } = {}) => {
    const result = calculateSpaceTravel(readValues());
    renderSpaceTravel(els, result);
    updateCustomSpeedPlaceholder();
    if (scroll && els.panel) {
      els.panel.scrollIntoView({ behavior: "smooth", block: "start" });
      els.panel.focus({ preventScroll: true });
    }
  };

  advancedToggle?.addEventListener("click", () => {
    const isHidden = advancedPanel.hasAttribute("hidden");
    setAdvancedPanel(isHidden, { focus: isHidden });
  });

  distanceModeSelect.addEventListener("change", () => {
    if (distanceModeSelect.value === "custom") setAdvancedPanel(true, { focus: true });
    update();
  });

  speedSelect.addEventListener("change", () => {
    if (speedSelect.value === "custom") setAdvancedPanel(true, { focus: true });
    update();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update({ scroll: true });
  });
  form.addEventListener("input", () => update());
  form.addEventListener("change", () => update());

  exampleButton?.addEventListener("click", () => {
    destinationSelect.value = "mars";
    distanceModeSelect.value = "near";
    speedSelect.value = "voyager";
    customDistanceInput.value = "";
    customSpeedInput.value = "";
    customDistanceUnitSelect.value = "km";
    update({ scroll: true });
  });

  resetButton?.addEventListener("click", () => {
    destinationSelect.value = "moon";
    distanceModeSelect.value = "representative";
    speedSelect.value = "light";
    customDistanceInput.value = "";
    customSpeedInput.value = "";
    customDistanceUnitSelect.value = "km";
    setAdvancedPanel(false);
    update();
  });

  update();
}

export function calculateSpaceTravel(values) {
  const speedPreset = SPEEDS.find((item) => item.key === values.speedKey) || SPEEDS[0];
  const destination = DESTINATION_GROUPS.flatMap((group) => group.items)
    .find((item) => item.key === values.destinationKey) || DESTINATION_GROUPS[0].items[0];
  const validation = validateSpaceInputs(values, speedPreset);
  if (validation) {
    return buildInvalidResult(destination, speedPreset, validation);
  }

  const customSpeedKmh = Number.isFinite(values.customSpeedKmh) && values.customSpeedKmh > 0 ? values.customSpeedKmh : null;
  const speed = customSpeedKmh
    ? { ...speedPreset, label: `${speedPreset.label} · 직접 ${formatKmh(customSpeedKmh)}`, kmPerSecond: customSpeedKmh / 3600, note: `${speedPreset.note} 직접 입력한 속도 ${formatKmh(customSpeedKmh)}를 적용했습니다.` }
    : speedPreset;

  const distance = resolveDistance(destination, values);
  if (!Number.isFinite(distance.km) || distance.km <= 0) {
    return buildInvalidResult(destination, speed, "거리 정보를 계산하지 못했습니다. 목적지와 거리 기준을 다시 확인해 주세요.");
  }

  const speedRatio = speed.kmPerSecond / LIGHT_SPEED_KM_PER_SEC;
  const hours = distance.km / Math.max(speed.kmPerSecond * 3600, Number.EPSILON);
  const years = hours / (24 * 365.2425);
  const lightSeconds = distance.km / LIGHT_SPEED_KM_PER_SEC;
  const lightYears = distance.km / LIGHT_YEAR_KM;

  return {
    valid: true,
    speed,
    destination,
    distance,
    years,
    hours,
    lightSeconds,
    lightYears,
    speedRatio,
    generations: years / 30,
    earthLaps: distance.km / EARTH_CIRCUMFERENCE_KM,
    comparisons: buildComparisons(distance.km)
  };
}

function validateSpaceInputs(values, speedPreset) {
  if (values.distanceMode === "custom") {
    if (!values.customDistanceRaw) return "직접 거리 기준을 선택했다면 거리를 입력해 주세요.";
    if (!Number.isFinite(values.customDistance) || values.customDistance <= 0) return "직접 거리는 0보다 큰 숫자로 입력해 주세요.";
    const distanceUnit = ["km", "au", "ly"].includes(values.customDistanceUnit) ? values.customDistanceUnit : "km";
    if (distanceUnit === "km" && values.customDistance > 1e18) return "km 단위 직접 입력값이 너무 큽니다. 더 작은 값을 입력해 주세요.";
    if (distanceUnit === "au" && values.customDistance > 1e9) return "AU 단위 직접 입력값이 너무 큽니다. 더 작은 값을 입력해 주세요.";
    if (distanceUnit === "ly" && values.customDistance > 1e8) return "광년 단위 직접 입력값이 너무 큽니다. 더 작은 값을 입력해 주세요.";
  }
  if (values.customSpeedRaw && (!Number.isFinite(values.customSpeedKmh) || values.customSpeedKmh <= 0)) {
    return "직접 속도는 0보다 큰 km/h 숫자로 입력해 주세요.";
  }
  if (values.customSpeedRaw && values.customSpeedKmh / 3600 > LIGHT_SPEED_KM_PER_SEC) {
    return "직접 속도는 빛의 속도보다 크게 입력하지 않도록 확인해 주세요.";
  }
  if (speedPreset.key === "custom" && !values.customSpeedRaw) {
    return "직접 입력 속도를 선택했다면 km/h 속도를 입력해 주세요.";
  }
  return "";
}

function buildInvalidResult(destination, speed, message) {
  return {
    valid: false,
    errorMessage: message,
    speed,
    destination,
    distance: {
      km: 0,
      label: "입력 확인 필요",
      note: message
    },
    years: NaN,
    hours: NaN,
    lightSeconds: NaN,
    lightYears: NaN,
    speedRatio: 0,
    earthLaps: NaN,
    comparisons: []
  };
}

function resolveDistance(destination, values) {
  if (values.distanceMode === "custom") {
    const unit = ["km", "au", "ly"].includes(values.customDistanceUnit) ? values.customDistanceUnit : "km";
    const km = convertDistanceToKm(values.customDistance, unit);
    return {
      km,
      mode: "custom",
      modeLabel: DISTANCE_MODE_LABELS.custom,
      label: `직접 입력 ${formatDistanceWithUnit(values.customDistance, unit)}`,
      note: `직접 입력한 ${formatDistanceWithUnit(values.customDistance, unit)}를 ${formatKm(km)}로 환산해 계산했습니다.`
    };
  }

  const requestedMode = values.distanceMode || "representative";
  const selected = getDistanceByMode(destination, requestedMode);
  const fallback = selected || getDistanceByMode(destination, "representative");
  const modeLabel = selected ? DISTANCE_MODE_LABELS[requestedMode] : DISTANCE_MODE_LABELS.representative;
  const fallbackMessage = selected ? "" : ` 선택한 ${DISTANCE_MODE_LABELS[requestedMode]} 값이 없어 대표 거리로 계산했습니다.`;
  const sourceLabel = fallback.unit === "ly"
    ? `${fallback.value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}광년`
    : `${Math.round(fallback.value).toLocaleString("ko-KR")}km`;

  return {
    km: fallback.km,
    mode: selected ? requestedMode : "representative",
    modeLabel,
    label: `${modeLabel} · ${sourceLabel}`,
    note: `${destination.note}${fallbackMessage}`
  };
}

function getDistanceByMode(destination, mode) {
  const kmKey = mode === "near" ? "nearKm" : mode === "far" ? "farKm" : "representativeKm";
  const lyKey = mode === "near" ? "nearLy" : mode === "far" ? "farLy" : "representativeLy";
  if (Number.isFinite(destination[kmKey]) && destination[kmKey] > 0) {
    return { km: destination[kmKey], value: destination[kmKey], unit: "km" };
  }
  if (Number.isFinite(destination[lyKey]) && destination[lyKey] > 0) {
    return { km: destination[lyKey] * LIGHT_YEAR_KM, value: destination[lyKey], unit: "ly" };
  }
  return null;
}

function buildComparisons(distanceKm) {
  return COMPARISON_SPEED_KEYS.map((key) => {
    const speed = SPEEDS.find((item) => item.key === key);
    const hours = distanceKm / (speed.kmPerSecond * 3600);
    const lightRatio = speed.kmPerSecond / LIGHT_SPEED_KM_PER_SEC;
    return {
      key,
      label: speed.label,
      speedLabel: formatSpeed(speed.kmPerSecond),
      timeLabel: formatHours(hours),
      ratioLabel: key === "light" ? "기준 속도" : `빛의 약 ${formatPercent(lightRatio)} 속도`
    };
  });
}

function renderSpaceTravel(els, result) {
  if (!result.valid) {
    renderInvalidSpaceTravel(els, result);
    return;
  }

  setValidation(els, "");
  els.time.textContent = formatHours(result.hours);
  els.distance.textContent = `${result.destination.label} · ${result.distance.label}`;
  els.distanceKm.textContent = formatKm(result.distance.km);
  if (els.distanceAu) els.distanceAu.textContent = formatAu(result.distance.km / AU_KM);
  if (els.distanceLy) els.distanceLy.textContent = formatLy(result.lightYears);
  els.speed.textContent = `${result.speed.label} (${formatSpeed(result.speed.kmPerSecond)})`;
  els.lightTime.textContent = formatSecondsAsTime(result.lightSeconds);
  els.signalDelay.textContent = formatSecondsAsTime(result.lightSeconds * 2);
  els.earthLaps.textContent = result.earthLaps >= 1 ? `약 ${formatLargeNumber(result.earthLaps)}바퀴` : "지구 둘레보다 짧음";
  els.comment.textContent = buildComment(result);
  els.note.textContent = `${result.distance.note} ${result.speed.note} 빛 편도 시간은 전파 통신이 도달하는 최소 시간에 가까운 참고값이고, 왕복 통신 지연은 그 두 배로 계산했습니다.`;
  els.routeDestination.textContent = result.destination.label;

  renderSpaceHighlights(els, result);
  renderSpaceScale(els, result);

  const ratio = Math.max(2, Math.min(100, Math.log10(result.speedRatio * 100000000 + 1) * 18));
  els.bar.style.width = `${ratio}%`;

  renderComparisons(els.comparisonGrid, result.comparisons);
}

function renderInvalidSpaceTravel(els, result) {
  setValidation(els, result.errorMessage);
  els.time.textContent = "입력 확인";
  els.distance.textContent = `${result.destination.label} · 입력값 확인 필요`;
  els.distanceKm.textContent = "-";
  if (els.distanceAu) els.distanceAu.textContent = "-";
  if (els.distanceLy) els.distanceLy.textContent = "-";
  els.speed.textContent = result.speed?.label || "-";
  els.lightTime.textContent = "-";
  els.signalDelay.textContent = "-";
  els.earthLaps.textContent = "-";
  els.comment.textContent = result.errorMessage;
  els.note.textContent = "직접 입력값을 수정하면 다시 계산됩니다.";
  els.routeDestination.textContent = result.destination.label;
  els.bar.style.width = "2%";
  renderInvalidSpaceHighlights(els, result);
  if (els.comparisonGrid) {
    els.comparisonGrid.innerHTML = '<article class="space-comparison-card is-empty"><span>비교 결과</span><strong>입력값 확인 필요</strong><small>거리와 속도를 올바르게 입력해 주세요.</small></article>';
  }
}

function setValidation(els, message) {
  if (!els.validation) return;
  if (message) {
    els.validation.textContent = message;
    els.validation.removeAttribute("hidden");
  } else {
    els.validation.textContent = "";
    els.validation.setAttribute("hidden", "");
  }
}

function renderSpaceHighlights(els, result) {
  const lightLabel = formatSecondsAsTime(result.lightSeconds);
  const signalLabel = formatSecondsAsTime(result.lightSeconds * 2);
  const distanceFeel = buildDistanceFeel(result);

  if (els.distanceFeel) els.distanceFeel.textContent = distanceFeel.title;
  if (els.distanceFeelNote) els.distanceFeelNote.textContent = distanceFeel.note;
  if (els.lightHighlight) els.lightHighlight.textContent = lightLabel;
  if (els.lightNote) els.lightNote.textContent = `빛이나 전파가 편도로 도달하는 데 걸리는 최소 시간에 가까운 참고값입니다.`;
  if (els.signalHighlight) els.signalHighlight.textContent = signalLabel;
  if (els.signalNote) els.signalNote.textContent = `명령을 보내고 응답을 받는 왕복 지연은 편도 빛 시간의 약 2배입니다.`;
}

function renderInvalidSpaceHighlights(els, result) {
  if (els.distanceFeel) els.distanceFeel.textContent = "입력 확인";
  if (els.distanceFeelNote) els.distanceFeelNote.textContent = result.errorMessage || "거리와 속도를 다시 확인해 주세요.";
  if (els.lightHighlight) els.lightHighlight.textContent = "-";
  if (els.lightNote) els.lightNote.textContent = "거리 계산이 가능할 때 표시됩니다.";
  if (els.signalHighlight) els.signalHighlight.textContent = "-";
  if (els.signalNote) els.signalNote.textContent = "왕복 통신 지연은 빛 편도 시간의 2배로 계산합니다.";
  if (els.scaleFill) els.scaleFill.style.width = "4%";
  if (els.scaleMarker) {
    els.scaleMarker.textContent = "입력 확인";
    els.scaleMarker.style.left = "4%";
  }
  if (els.scaleNote) els.scaleNote.textContent = "거리 스케일은 유효한 거리값이 있을 때 표시됩니다.";
}

function buildDistanceFeel(result) {
  if (result.lightYears >= 1) {
    return {
      title: formatLy(result.lightYears),
      note: `${result.destination.label}은 빛으로도 ${formatHours(result.lightYears * 24 * 365.2425)} 수준의 거리입니다.`
    };
  }
  const au = result.distance.km / AU_KM;
  if (au >= 0.1) {
    return {
      title: formatAu(au),
      note: `태양과 지구 사이 평균 거리 1AU와 비교한 체감값입니다.`
    };
  }
  if (result.earthLaps >= 1) {
    return {
      title: `지구 둘레 약 ${formatLargeNumber(result.earthLaps)}바퀴`,
      note: `지구 둘레 ${EARTH_CIRCUMFERENCE_KM.toLocaleString("ko-KR")}km 기준으로 환산했습니다.`
    };
  }
  return {
    title: "지구 둘레보다 짧음",
    note: "선택한 거리가 지구 둘레보다 짧은 기준으로 계산되었습니다."
  };
}

function renderSpaceScale(els, result) {
  if (!els.scaleFill || !els.scaleMarker || !els.scaleNote) return;
  const scale = buildSpaceScale(result.distance.km);
  const markerLeft = Math.max(8, Math.min(92, scale.percent));
  els.scaleFill.style.width = `${scale.percent}%`;
  els.scaleMarker.style.left = `${markerLeft}%`;
  els.scaleMarker.textContent = scale.label;
  els.scaleNote.textContent = scale.note;
}

function buildSpaceScale(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { percent: 4, label: "입력 확인", note: "거리값을 확인하면 스케일이 표시됩니다." };
  }
  const anchors = [
    { km: 384400, percent: 10, label: "달권", note: "지구-달 거리대입니다." },
    { km: AU_KM, percent: 28, label: "태양권", note: "태양과 지구 사이 평균 거리인 1AU 부근입니다." },
    { km: 401000000, percent: 45, label: "행성권", note: "내행성·화성 거리대 또는 그 이상입니다." },
    { km: 7530000000, percent: 63, label: "태양계 외곽", note: "목성·토성·명왕성처럼 태양계 외곽 체감 거리입니다." },
    { km: LIGHT_YEAR_KM, percent: 82, label: "별까지", note: "광년 단위로 넘어가는 별 사이 거리입니다." },
    { km: LIGHT_YEAR_KM * 1000000, percent: 96, label: "은하권", note: "은하 사이 또는 은하 내부의 거대한 거리대입니다." }
  ];
  const first = anchors[0];
  if (distanceKm <= first.km) {
    return { percent: Math.max(4, Math.min(first.percent, (distanceKm / first.km) * first.percent)), label: first.label, note: first.note };
  }
  for (let i = 1; i < anchors.length; i += 1) {
    const prev = anchors[i - 1];
    const next = anchors[i];
    if (distanceKm <= next.km) {
      const ratio = (Math.log10(distanceKm) - Math.log10(prev.km)) / (Math.log10(next.km) - Math.log10(prev.km));
      return {
        percent: prev.percent + Math.max(0, Math.min(1, ratio)) * (next.percent - prev.percent),
        label: next.label,
        note: next.note
      };
    }
  }
  return { percent: 98, label: "은하 너머", note: "일상적인 이동 시간 감각을 훨씬 넘어선 거리입니다." };
}

function renderComparisons(grid, comparisons) {
  if (!grid) return;
  grid.innerHTML = comparisons.map((item) => `
    <article class="space-comparison-card ${getComparisonCardClass(item.key)}">
      <span>${item.label}</span>
      <strong>${item.timeLabel}</strong>
      <small>${item.speedLabel}</small>
      <em>${item.ratioLabel}</em>
    </article>
  `).join("");
}

function getComparisonCardClass(key) {
  if (key === "light") return "is-light";
  if (["voyager", "escape"].includes(key)) return "is-spacecraft";
  if (["jet", "car", "walk"].includes(key)) return "is-everyday";
  return "";
}

function populateSpeedSelect(select) {
  select.innerHTML = SPEEDS.map((speed) => (
    `<option value="${speed.key}">${speed.label}</option>`
  )).join("");
}

function populateDestinationSelect(select) {
  select.innerHTML = DESTINATION_GROUPS.map((group) => `
    <optgroup label="${group.label}">
      ${group.items.map((item) => `<option value="${item.key}">${item.label}</option>`).join("")}
    </optgroup>
  `).join("");
}

function buildComment(result) {
  if (!Number.isFinite(result.hours)) return "거리와 속도를 확인해 주세요.";
  if (result.lightSeconds < 2) return "빛으로는 몇 초 수준의 거리지만, 실제 이동은 속도와 궤도에 따라 크게 달라집니다.";
  if (result.hours < 24) return "선택한 속도라면 하루 안에 도착하는 거리로 계산됩니다. 실제 우주 비행과는 다를 수 있습니다.";
  if (result.years < 1) return "일정표 안에 들어오는 우주 거리처럼 보이지만, 실제 우주 비행은 궤도 설계가 필요합니다.";
  if (result.years < 100) return "한 사람의 인생 안에서 상상해 볼 수 있는 거리입니다. 그래도 편도 기준입니다.";
  if (result.years < 10000) return "역사책 단위로 넘어갑니다. 단순 속도 비교로 거리 감각을 보는 값입니다.";
  if (result.years < 1000000) return "문명 단위의 여행입니다. 목적지에 도착할 즈음 출발 이유가 전설이 됩니다.";
  return "은하급 거리입니다. 이 결과는 실제 여행 계획이 아니라 우주 거리의 규모를 체감하는 비교값입니다.";
}

function convertDistanceToKm(value, unit) {
  if (unit === "au") return value * AU_KM;
  if (unit === "ly") return value * LIGHT_YEAR_KM;
  return value;
}

function formatDistanceWithUnit(value, unit) {
  const suffix = unit === "au" ? "AU" : unit === "ly" ? "광년" : "km";
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${suffix}`;
}

function formatHours(hours) {
  if (!Number.isFinite(hours)) return "-";
  const minutes = hours * 60;
  const seconds = minutes * 60;
  const days = hours / 24;
  const years = days / 365.2425;
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  if (minutes < 60) return `${minutes.toFixed(1)}분`;
  if (hours < 24) return `${hours.toFixed(1)}시간`;
  if (days < 365.2425) return `${days.toFixed(1)}일`;
  if (years < 10000) return `${formatLargeNumber(years)}년`;
  if (years < 100000000) return `약 ${(years / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만 년`;
  return `약 ${(years / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억 년`;
}

function formatSecondsAsTime(seconds) {
  if (!Number.isFinite(seconds)) return "-";
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}분`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}시간`;
  const days = hours / 24;
  if (days < 365.2425) return `${days.toFixed(1)}일`;
  return formatHours(hours);
}

function formatKm(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= LIGHT_YEAR_KM) return `약 ${(value / LIGHT_YEAR_KM).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}광년`;
  if (value >= 1000000000000) return `약 ${(value / 1000000000000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조 km`;
  if (value >= 100000000) return `약 ${(value / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억 km`;
  return `약 ${Math.round(value).toLocaleString("ko-KR")}km`;
}

function formatAu(value) {
  if (!Number.isFinite(value)) return "-";
  if (value < 0.01) return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 5 })}AU`;
  if (value < 1000) return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}AU`;
  return `약 ${formatLargeNumber(value)}AU`;
}

function formatLy(value) {
  if (!Number.isFinite(value)) return "-";
  if (value < 0.001) return `${value.toExponential(2)}광년`;
  if (value < 1000) return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}광년`;
  if (value < 100000000) return `약 ${formatLargeNumber(value)}광년`;
  return `약 ${(value / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억 광년`;
}

function formatSpeed(kmPerSecond) {
  if (kmPerSecond >= 1) return `${kmPerSecond.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}km/s`;
  return formatKmh(kmPerSecond * 3600);
}

function formatKmh(kmh) {
  return `${kmh.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}km/h`;
}

function formatLargeNumber(value) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: value >= 100 ? 0 : 1
  });
}

function formatPercent(value) {
  const percent = value * 100;
  if (percent >= 1) return `${percent.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}%`;
  if (percent >= 0.0001) return `${percent.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}%`;
  return `${percent.toExponential(2)}%`;
}
