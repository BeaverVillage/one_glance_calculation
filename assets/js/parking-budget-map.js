const DEFAULT_PLACE = { name: "코엑스", address: "서울 강남구 영동대로 513", lat: 37.511, lng: 127.059 };
const SAMPLE_PLACES = [
  DEFAULT_PLACE,
  { name: "강남역", address: "서울 강남구 강남대로 396", lat: 37.4979, lng: 127.0276 },
  { name: "서울역", address: "서울 용산구 한강대로 405", lat: 37.5547, lng: 126.9707 },
  { name: "홍대입구", address: "서울 마포구 양화로 160", lat: 37.5572, lng: 126.9245 },
  { name: "인천공항", address: "인천 중구 공항로 272", lat: 37.4602, lng: 126.4407 }
];
const API_BASE = "/api/parking";

const state = {
  destination: DEFAULT_PLACE,
  places: [DEFAULT_PLACE],
  lots: [],
  realtime: [],
  results: [],
  map: null,
  kakaoMarkers: [],
  kakaoDestinationMarker: null,
  mapMode: "fallback",
  pinnedParkingId: "",
  lastHolidayContext: null,
  lastDataMode: "sample-fallback",
  lastRealtimeMode: "sample-fallback",
  lastRealtimeNote: ""
};

const won = new Intl.NumberFormat("ko-KR");

export function initParkingBudgetMap() {
  const root = document.querySelector("[data-parking-budget-map]");
  if (!root) return;

  const els = {
    form: document.querySelector("#parking-search-form"),
    destination: document.querySelector("#parking-destination"),
    searchStatus: document.querySelector("#parking-search-status"),
    placeResults: document.querySelector("#parking-place-results"),
    visitDate: document.querySelector("#parking-visit-date"),
    arrival: document.querySelector("#parking-arrival-time"),
    departure: document.querySelector("#parking-departure-time"),
    vehicleType: document.querySelector("#parking-vehicle-type"),
    manualDiscountField: document.querySelector("#parking-manual-discount-field"),
    manualDiscount: document.querySelector("#parking-manual-discount"),
    sort: document.querySelector("#parking-sort"),
    preferenceCards: Array.from(document.querySelectorAll("[data-parking-sort-mode]")),
    recommend: document.querySelector("#parking-recommend-button"),
    status: document.querySelector("#parking-status"),
    summaryTitle: document.querySelector("#parking-summary-title"),
    summarySubtitle: document.querySelector("#parking-summary-subtitle"),
    resultList: document.querySelector("#parking-result-list"),
    mobileResults: document.querySelector("#parking-mobile-results"),
    map: document.querySelector("#parking-map"),
    markerLayer: document.querySelector("#parking-map-markers"),
    filters: {
      publicOnly: document.querySelector("#parking-filter-public"),
      freeOnly: document.querySelector("#parking-filter-free"),
      dayPassOnly: document.querySelector("#parking-filter-daypass"),
      openOnly: document.querySelector("#parking-filter-open"),
      discountOnly: document.querySelector("#parking-filter-discount"),
      realtimeOnly: document.querySelector("#parking-filter-realtime"),
      lowRiskOnly: document.querySelector("#parking-filter-lowrisk")
    }
  };

  setupDefaults(els);
  bindEvents(els);
  loadMockData().then(() => {
    renderPlaces(els);
    calculateAndRender(els);
    loadKakaoMap(els);
  });
}

function syncPreferenceCards(els) {
  if (!els.preferenceCards?.length) return;
  els.preferenceCards.forEach((button) => {
    const active = button.dataset.parkingSortMode === els.sort.value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setupDefaults(els) {
  const today = new Date();
  els.visitDate.value = today.toISOString().slice(0, 10);
  els.destination.value = DEFAULT_PLACE.name;
  syncPreferenceCards(els);
}

function bindEvents(els) {
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await searchDestination(els);
  });
  els.recommend.addEventListener("click", () => calculateAndRender(els));
  els.vehicleType.addEventListener("change", () => {
    els.manualDiscountField.hidden = els.vehicleType.value !== "manual";
    calculateAndRender(els);
  });
  [els.visitDate, els.arrival, els.departure, els.manualDiscount, els.sort].forEach((el) => el.addEventListener("change", () => {
    syncPreferenceCards(els);
    calculateAndRender(els);
  }));
  els.preferenceCards.forEach((button) => {
    button.addEventListener("click", () => {
      els.sort.value = button.dataset.parkingSortMode || "recommended";
      syncPreferenceCards(els);
      calculateAndRender(els);
    });
  });
  Object.values(els.filters).forEach((el) => el.addEventListener("change", () => calculateAndRender(els)));
  document.querySelectorAll("[data-parking-duration]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-parking-duration]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      applyQuickDuration(els, button.dataset.parkingDuration);
      calculateAndRender(els);
    });
  });
}

async function loadMockData() {
  const [lotsRes, realtimeRes] = await Promise.allSettled([
    fetch("../assets/data/parking/parking-lots.sample.json").then((res) => res.json()),
    fetch("../assets/data/parking/seoul-realtime.sample.json").then((res) => res.json())
  ]);
  state.lots = lotsRes.status === "fulfilled" ? lotsRes.value.lots || [] : [];
  state.realtime = realtimeRes.status === "fulfilled" ? realtimeRes.value.statuses || [] : [];
}

async function searchDestination(els) {
  const query = els.destination.value.trim();
  if (!query) return;
  els.searchStatus.textContent = "목적지를 검색하고 있습니다.";
  let usedSampleFallback = false;
  try {
    const res = await fetch(`${API_BASE}/places?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("places api failed");
    const data = await res.json();
    state.places = data.places?.length ? data.places : [DEFAULT_PLACE];
  } catch (_) {
    usedSampleFallback = true;
    const lower = query.toLowerCase();
    state.places = SAMPLE_PLACES.filter((place) => `${place.name} ${place.address}`.toLowerCase().includes(lower));
    if (!state.places.length) state.places = SAMPLE_PLACES;
  }
  state.destination = state.places[0];
  renderPlaces(els);
  await calculateAndRender(els);
  els.searchStatus.textContent = usedSampleFallback
    ? `목적지 검색 API를 사용할 수 없어 ${state.destination.name} 샘플 위치 기준으로 계산합니다.`
    : `${state.destination.name} 기준으로 주변 주차장을 계산했습니다.`;
}

function renderPlaces(els) {
  els.placeResults.innerHTML = state.places.map((place, index) => `
    <button type="button" class="parking-place-chip ${index === 0 ? "active" : ""}" data-place-index="${index}">
      <strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.address || "주소 정보 없음")}</span>
    </button>
  `).join("");
  els.placeResults.querySelectorAll("[data-place-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.destination = state.places[Number(button.dataset.placeIndex)];
      els.destination.value = state.destination.name;
      els.placeResults.querySelectorAll(".parking-place-chip").forEach((chip) => chip.classList.remove("active"));
      button.classList.add("active");
      calculateAndRender(els);
    });
  });
}

function applyQuickDuration(els, value) {
  const [h, m] = els.arrival.value.split(":").map(Number);
  const date = new Date(`${els.visitDate.value}T${pad(h)}:${pad(m)}:00`);
  const minutes = value === "day" ? 720 : Number(value);
  date.setMinutes(date.getMinutes() + minutes);
  els.departure.value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildInput(els) {
  const arrivalAt = `${els.visitDate.value}T${els.arrival.value}:00+09:00`;
  const departureAt = `${els.visitDate.value}T${els.departure.value}:00+09:00`;
  const duration = durationMinutes(arrivalAt, departureAt);
  return {
    destination: state.destination,
    arrivalAt,
    departureAt,
    duration,
    vehicleType: els.vehicleType.value,
    manualDiscountRate: Number(els.manualDiscount.value || 0),
    sort: els.sort.value,
    radius: 3000,
    filters: {
      publicOnly: els.filters.publicOnly.checked,
      freeOnly: els.filters.freeOnly.checked,
      dayPassOnly: els.filters.dayPassOnly.checked,
      openOnly: els.filters.openOnly.checked,
      discountOnly: els.filters.discountOnly.checked,
      realtimeOnly: els.filters.realtimeOnly.checked,
      lowRiskOnly: els.filters.lowRiskOnly.checked
    }
  };
}

async function calculateAndRender(els) {
  const input = buildInput(els);
  if (!input.duration) {
    els.status.textContent = "출차 시간이 입차 시간보다 늦어야 합니다.";
    return;
  }
  els.status.textContent = "주차장별 예상 요금과 추천 점수를 계산하고 있습니다.";
  let rows;
  try {
    const res = await fetch(`${API_BASE}/recommend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!res.ok) throw new Error("recommend api failed");
    const data = await res.json();
    rows = data.recommended || [];
    state.lastDataMode = data.summary?.dataMode || "api";
    state.lastDataSources = data.summary?.dataSources || [];
    state.lastRealtimeMode = data.summary?.realtimeMode || "sample-fallback";
    state.lastRealtimeNote = data.summary?.realtimeNote || "";
    state.lastHolidayContext = data.summary?.holidayContext || null;
  } catch (_) {
    rows = fallbackRecommend(input);
    state.lastDataMode = "sample-fallback";
    state.lastDataSources = [];
    state.lastRealtimeMode = "sample-fallback";
    state.lastRealtimeNote = "샘플 실시간 데이터를 사용합니다.";
    state.lastHolidayContext = buildClientHolidayContext(input.arrivalAt);
  }
  state.results = rows;
  if (state.pinnedParkingId && !rows.some((row) => row.id === state.pinnedParkingId)) state.pinnedParkingId = "";
  renderResults(els, input);
  renderMap(els);
}

function fallbackRecommend(input) {
  input.holidayContext = input.holidayContext || state.lastHolidayContext || buildClientHolidayContext(input.arrivalAt);
  const realtimeMap = new Map(state.realtime.map((item) => [item.parkingLotId, item]));
  const withDistance = state.lots
    .filter((lot) => lot.lat && lot.lng)
    .map((lot) => ({ ...lot, distanceFromDestinationKmRaw: distanceKm(input.destination, lot) }))
    .sort((a, b) => a.distanceFromDestinationKmRaw - b.distanceFromDestinationKmRaw);
  const nearby = withDistance.filter((lot) => lot.distanceFromDestinationKmRaw * 1000 <= input.radius);
  const base = nearby.length ? nearby : withDistance.slice(0, 8);
  const rows = base.map((lot) => enrichLot(lot, input, realtimeMap.get(lot.id) || null));
  return sortRows(applyFilters(rows, input.filters), input.sort).map((row, index) => ({ ...row, rank: index + 1 }));
}

function enrichLot(lot, input, realtime) {
  const fee = estimateFee(lot, input);
  const distanceFromDestinationKm = round1(distanceKm(input.destination, lot));
  const risk = calculateRisk(lot, realtime, input.arrivalAt);
  const confidence = calculateConfidence(lot, realtime);
  const scoreInfo = scoreLot(lot, fee, risk, confidence, input.sort, distanceFromDestinationKm, input.filters);
  const hasDiscountBenefit = Boolean(Number(lot.compactDiscountRate) || Number(lot.disabledDiscountRate) || Number(lot.evDiscountRate) || Number(input.manualDiscountRate));
  return { ...lot, ...fee, hasDiscountBenefit, distanceFromDestinationKm, realtimeAvailable: realtime?.availableSpaces ?? null, realtimeCapacity: realtime?.totalSpaces ?? lot.capacity ?? null, realtimeObservedAt: realtime?.observedAt ?? null, fullRisk: risk.level, fullRiskLabel: risk.label, fullRiskReason: risk.reason, dataConfidence: confidence.level, dataConfidenceLabel: confidence.label, score: scoreInfo.score, scoreReason: scoreInfo.reason, scoreMode: scoreInfo.mode };
}

function estimateFee(lot, input) {
  const minutes = input.duration;
  const timeFee = calculateTimeFee(lot, minutes);
  const dayPassFee = Number(lot.dayPassFee);
  const hasDayPass = Number.isFinite(dayPassFee) && dayPassFee > 0;
  const parkingFee = timeFee == null ? null : hasDayPass ? Math.min(timeFee, dayPassFee) : timeFee;
  const discountRate = getDiscountRate(lot, input.vehicleType, input.manualDiscountRate);
  const discountedFee = parkingFee == null ? null : Math.max(0, Math.round((parkingFee * (1 - discountRate / 100)) / 10) * 10);
  const openInfo = isOpenDuring(lot, input.arrivalAt, input.departureAt, input.holidayContext || null);
  return { parkingFee, discountedFee, durationMinutes: minutes, dayPassBetterAfterMinutes: dayPassBreakEven(lot), isOpen: openInfo.isOpen, openReason: openInfo.reason, openWindow: openInfo, openDayType: openInfo.dayType, openDayTypeLabel: openInfo.dayTypeLabel, holidayName: openInfo.holidayName || "", isFree: parkingFee === 0, discountRate };
}

function calculateTimeFee(lot, minutes) {
  if (lot.feeType === "무료" || (lot.baseFee === 0 && lot.additionalFee === 0)) return 0;
  const baseMinutes = Number(lot.baseMinutes);
  const baseFee = Number(lot.baseFee);
  const addMinutes = Number(lot.additionalMinutes);
  const addFee = Number(lot.additionalFee);
  if (!Number.isFinite(baseMinutes) || !Number.isFinite(baseFee)) return null;
  if (minutes <= baseMinutes) return baseFee;
  if (!Number.isFinite(addMinutes) || addMinutes <= 0 || !Number.isFinite(addFee)) return null;
  return baseFee + Math.ceil((minutes - baseMinutes) / addMinutes) * addFee;
}

function dayPassBreakEven(lot) {
  const dayPassFee = Number(lot.dayPassFee);
  if (!Number.isFinite(dayPassFee) || dayPassFee <= 0) return null;
  for (let minutes = 10; minutes <= 1440; minutes += 5) {
    const fee = calculateTimeFee(lot, minutes);
    if (fee != null && fee >= dayPassFee) return minutes;
  }
  return null;
}

function getDiscountRate(lot, type, manual) {
  if (type === "manual") return clamp(manual, 0, 100);
  if (type === "compact") return clamp(lot.compactDiscountRate ?? 50, 0, 100);
  if (type === "disabled") return clamp(lot.disabledDiscountRate ?? 50, 0, 100);
  if (type === "ev") return clamp(lot.evDiscountRate ?? 50, 0, 100);
  return 0;
}

function buildClientHolidayContext(arrivalAt) {
  const date = new Date(arrivalAt);
  if (Number.isNaN(date.getTime())) return { dayType: "weekday", dayTypeLabel: "평일", isHoliday: false, holidayName: "", mode: "client-calendar-fallback", note: "방문일 해석이 어려워 평일 기준으로 표시합니다." };
  const day = date.getDay();
  if (day === 0) return { dayType: "holiday", dayTypeLabel: "공휴일", isHoliday: true, holidayName: "일요일", mode: "client-calendar-fallback", note: "Functions 공휴일 API 연결 전에는 일요일 기준으로 공휴일 운영시간을 적용합니다." };
  if (day === 6) return { dayType: "saturday", dayTypeLabel: "토요일", isHoliday: false, holidayName: "", mode: "client-calendar-fallback", note: "Functions 공휴일 API 연결 전에는 토요일 운영시간을 적용합니다." };
  return { dayType: "weekday", dayTypeLabel: "평일", isHoliday: false, holidayName: "", mode: "client-calendar-fallback", note: "Functions 공휴일 API 연결 전에는 평일 운영시간을 적용합니다." };
}

function operatingWindowFor(lot, arrivalAt, holidayContext) {
  const context = holidayContext || buildClientHolidayContext(arrivalAt);
  if (context.dayType === "holiday") return { open: lot.holidayOpen, close: lot.holidayClose, ...context };
  if (context.dayType === "saturday") return { open: lot.saturdayOpen, close: lot.saturdayClose, ...context };
  return { open: lot.weekdayOpen, close: lot.weekdayClose, ...context };
}

function isOpenDuring(lot, arrivalAt, departureAt, holidayContext = null) {
  const arrival = new Date(arrivalAt);
  const departure = new Date(departureAt);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) return { isOpen: false, reason: "방문 시간이 올바르지 않습니다." };
  const window = operatingWindowFor(lot, arrivalAt, holidayContext);
  const open = window.open;
  const close = window.close;
  if (!open || !close) return { isOpen: false, reason: `${window.dayTypeLabel || "방문일"} 운영시간 정보가 부족합니다.`, ...window };
  const startMin = toMin(open);
  const endMin = toMin(close);
  if (startMin === 0 && endMin >= 1439) return { isOpen: true, reason: `${window.dayTypeLabel || "방문일"} 24시간 운영으로 표시됩니다.`, ...window };
  const arrivalMin = arrival.getHours() * 60 + arrival.getMinutes();
  let departureMin = departure.getHours() * 60 + departure.getMinutes();
  if (departure.getTime() > arrival.getTime() && departure.toDateString() !== arrival.toDateString()) departureMin += 1440;
  const adjustedClose = endMin < startMin ? endMin + 1440 : endMin;
  const adjustedArrival = arrivalMin < startMin && endMin < startMin ? arrivalMin + 1440 : arrivalMin;
  const fits = adjustedArrival >= startMin && departureMin <= adjustedClose;
  return { isOpen: fits, reason: fits ? `${window.dayTypeLabel || "방문일"} 운영시간 기준 이용 가능으로 표시됩니다.` : `${window.dayTypeLabel || "방문일"} 운영시간 일부가 선택 시간 밖일 수 있습니다.`, ...window };
}

function calculateRisk(lot, realtime, arrivalAt) {
  if (realtime && Number.isFinite(Number(realtime.availableSpaces)) && Number.isFinite(Number(realtime.totalSpaces))) {
    const available = Number(realtime.availableSpaces);
    const total = Math.max(1, Number(realtime.totalSpaces));
    const occupancy = 1 - available / total;
    if (available <= 3 || occupancy >= 0.95) return { level: "high", label: "만차 위험 높음", reason: "실시간 가능 대수가 매우 적습니다." };
    if (available <= 10 || occupancy >= 0.85) return { level: "medium", label: "만차 위험 보통", reason: "실시간 가능 대수가 많지 않습니다." };
    return { level: "low", label: "만차 위험 낮음", reason: "실시간 가능 대수 기준 여유가 있습니다." };
  }
  let score = 0;
  if (Number(lot.capacity) <= 20) score += 2;
  if (lot.feeType === "무료") score += 2;
  if (lot.publicPrivateType === "공영") score += 1;
  if (arrivalAt) {
    const d = new Date(arrivalAt);
    const hour = d.getHours();
    const day = d.getDay();
    if ((day === 0 || day === 6) && hour >= 12 && hour <= 18) score += 1;
  }
  if (score >= 3) return { level: "high", label: "만차 위험 높음", reason: "주차면수와 시간대 기준의 참고 추정입니다." };
  if (score >= 1) return { level: "medium", label: "만차 위험 보통", reason: "실시간 정보가 없어 참고 추정으로 표시합니다." };
  return { level: "unknown", label: "실시간 정보 없음", reason: "현장 상황 확인이 필요합니다." };
}

function calculateConfidence(lot, realtime) {
  let score = 0;
  if (lot.baseMinutes != null && lot.baseFee != null) score += 2;
  if (lot.additionalMinutes != null && lot.additionalFee != null) score += 1;
  if (lot.dayPassFee) score += 1;
  if (lot.dataDate) score += 1;
  if (realtime) score += 1;
  if (score >= 5) return { level: "high", label: "신뢰도 높음" };
  if (score >= 3) return { level: "medium", label: "신뢰도 보통" };
  return { level: "low", label: "신뢰도 낮음" };
}

function scoreLot(lot, fee, risk, confidence, mode = "recommended", distanceFromDestinationKm = null, filters = {}) {
  const feeScore = fee.discountedFee == null ? 18 : Math.max(0, 42 - fee.discountedFee / 800);
  const nearScore = distanceFromDestinationKm == null ? 8 : Math.max(0, 30 - distanceFromDestinationKm * 9);
  const riskScore = risk.level === "low" ? 14 : risk.level === "medium" ? 6 : risk.level === "high" ? -12 : 0;
  const confidenceScore = confidence.level === "high" ? 11 : confidence.level === "medium" ? 5 : -6;
  const openPenalty = fee.isOpen ? 0 : -16;
  const publicBonus = lot.publicPrivateType === "공영" ? (filters?.publicOnly ? 10 : 5) : 0;
  const freeBonus = lot.feeType === "무료" ? 12 : 0;
  const profiles = {
    recommended: { label: "추천순", fee: 1, near: 0.7, risk: 1, confidence: 1, public: 1 },
    cheap: { label: "저렴한순", fee: 1.8, near: 0.35, risk: 0.6, confidence: 0.5, public: 0.8 },
    nearby: { label: "가까운순", fee: 0.45, near: 1.8, risk: 0.55, confidence: 0.45, public: 0.5 },
    available: { label: "빈자리순", fee: 0.7, near: 0.45, risk: 1.6, confidence: 0.65, public: 0.7 },
    confidence: { label: "신뢰도순", fee: 0.65, near: 0.45, risk: 0.8, confidence: 1.8, public: 0.7 }
  };
  const profile = profiles[mode] || profiles.recommended;
  const score = 20
    + feeScore * profile.fee
    + nearScore * profile.near
    + riskScore * profile.risk
    + confidenceScore * profile.confidence
    + publicBonus * profile.public
    + freeBonus
    + openPenalty;
  return { score: Math.round(Math.max(0, Math.min(100, score))), mode: profile.label, reason: scoreReasonFor(mode, lot, fee, distanceFromDestinationKm) };
}

function scoreReasonFor(mode, lot, fee, distanceFromDestinationKm) {
  if (mode === "cheap") return `저렴한순 기준에서 ${formatFee(fee.discountedFee)} 후보입니다.`;
  if (mode === "nearby") return distanceFromDestinationKm == null ? "거리 정보가 부족해 기본 추천 기준을 함께 봅니다." : `가까운순 기준에서 목적지에서 약 ${formatDistance(distanceFromDestinationKm)} 후보입니다.`;
  if (mode === "available") return "빈자리순 기준에서 실시간 가능 대수와 만차 위험도를 더 크게 반영했습니다.";
  if (mode === "confidence") return "신뢰도순 기준에서 요금 정보, 기준일, 실시간 정보 유무를 더 크게 반영했습니다.";
  return "요금, 직선거리, 만차 위험도, 데이터 신뢰도와 공영 여부를 함께 반영했습니다.";
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.publicOnly && row.publicPrivateType !== "공영") return false;
    if (filters.freeOnly && !row.isFree && row.discountedFee !== 0) return false;
    if (filters.dayPassOnly && !row.dayPassFee) return false;
    if (filters.realtimeOnly && row.realtimeAvailable == null) return false;
    if (filters.lowRiskOnly && row.fullRisk !== "low") return false;
    if (filters.openOnly && !row.isOpen) return false;
    if (filters.discountOnly && !row.hasDiscountBenefit) return false;
    return true;
  });
}

function sortRows(rows, sort = "recommended") {
  const list = [...rows];
  if (sort === "cheap") return list.sort((a, b) => valueOrMax(a.discountedFee) - valueOrMax(b.discountedFee));
  if (sort === "nearby") return list.sort((a, b) => valueOrMax(a.distanceFromDestinationKm) - valueOrMax(b.distanceFromDestinationKm));
  if (sort === "available") return list.sort((a, b) => (b.realtimeAvailable ?? -1) - (a.realtimeAvailable ?? -1));
  if (sort === "confidence") return list.sort((a, b) => confidenceValue(b.dataConfidence) - confidenceValue(a.dataConfidence));
  return list.sort((a, b) => b.score - a.score);
}

function renderResults(els, input) {
  const durationText = formatDuration(input.duration);
  const vehicleText = vehicleLabel(input.vehicleType);
  els.summaryTitle.textContent = `${state.destination.name} · ${durationText} · ${vehicleText}`;
  const dataModeText = state.lastDataMode === "public-adapter" ? "공공데이터 어댑터 우선" : "샘플 데이터 기준";
  const realtimeModeText = state.lastRealtimeMode === "seoul-realtime-adapter" ? "서울 실시간 빈자리 참고" : "실시간 정보 일부 없음";
  const holidayText = state.lastHolidayContext?.holidayName ? `${state.lastHolidayContext.dayTypeLabel}(${state.lastHolidayContext.holidayName})` : (state.lastHolidayContext?.dayTypeLabel || "방문일");
  const modeText = recommendationModeLabel(input.sort);
  els.summarySubtitle.textContent = state.results.length ? `${state.results.length}개 주차장 비교 · ${modeText} · 추천 1순위 ${state.results[0].name} · ${holidayText} 운영시간 · ${dataModeText} · ${realtimeModeText}` : "조건에 맞는 주차장이 없습니다.";
  els.status.textContent = state.results.length ? `추천 결과를 계산했습니다. ${modeText} 기준으로 정렬했고, 운영시간은 ${holidayText} 기준으로 참고 판정합니다. (${dataModeText}, ${realtimeModeText})` : "조건에 맞는 주차장이 없습니다. 필터를 줄이거나 검색 반경을 넓혀보세요.";
  const html = state.results.map((row) => renderResultCard(row)).join("") || `<article class="parking-result-card"><strong>계산 가능한 주차장을 찾지 못했습니다.</strong><p>검색 반경을 넓히거나 필터를 줄여보세요.</p></article>`;
  els.resultList.innerHTML = html;
  els.mobileResults.innerHTML = html;
  [els.resultList, els.mobileResults].forEach((container) => bindResultCardEvents(container, els));
  applyPinnedParkingState(els);
}

function bindResultCardEvents(container, els) {
  container.querySelectorAll("[data-parking-pin-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pinnedParkingId = "";
      applyPinnedParkingState(els);
    });
  });
}

function renderResultCard(row) {
  const price = row.discountedFee == null ? "정보 부족" : row.discountedFee === 0 ? "무료" : `${won.format(row.discountedFee)}원`;
  const original = row.parkingFee != null && row.parkingFee !== row.discountedFee ? `<span>할인 전 ${won.format(row.parkingFee)}원</span>` : "";
  const dayPass = row.dayPassBetterAfterMinutes ? `${formatDuration(row.dayPassBetterAfterMinutes)} 이상이면 일주차가 유리할 수 있습니다.` : "일주차 전환점 정보 없음";
  const available = row.realtimeAvailable == null ? "실시간 정보 없음" : `현재 가능 ${row.realtimeAvailable}면`;
  const observed = row.realtimeObservedAt ? ` · 관측 ${formatObservedAt(row.realtimeObservedAt)}` : "";
  const distance = row.distanceFromDestinationKm == null ? "거리 정보 없음" : `목적지에서 약 ${formatDistance(row.distanceFromDestinationKm)}`;
  const reason = recommendationReason(row);
  const pinned = state.pinnedParkingId === row.id;
  return `<article class="parking-result-card ${row.rank === 1 ? "is-best" : ""} ${pinned ? "is-pinned" : ""}" data-parking-card-id="${escapeHtml(row.id)}">
    <div class="parking-card-head"><span class="rank-badge">${row.rank === 1 ? "추천 1위" : `${row.rank}순위`}</span><strong>${escapeHtml(row.name)}</strong></div>
    <div class="parking-card-tags"><span>${escapeHtml(row.publicPrivateType || "구분 확인")}</span><span>${escapeHtml(row.parkingType || "유형 확인")}</span><span>${row.scoreMode || "추천순"} ${row.score ?? "-"}</span>${pinned ? `<span class="parking-pinned-badge">지도에서 선택됨</span><button type="button" class="subtle-button tiny" data-parking-pin-clear>선택 해제</button>` : ""}</div>
    <div class="parking-price-row"><strong>${price}</strong>${original}</div>
    <p class="parking-reason">${escapeHtml(reason)}</p><p class="parking-score-reason">${escapeHtml(row.scoreReason || "추천 기준을 종합해 산정한 참고 점수입니다.")}</p>
    <div class="parking-card-metrics"><span>${distance}</span><span>${row.openDayTypeLabel || "방문일"} · ${row.isOpen ? "선택 시간 운영 가능" : "운영시간 확인 필요"}</span><span>${available}${observed}</span><span>${row.fullRiskLabel}</span><span>${row.dataConfidenceLabel}</span></div>
    <details><summary>상세 보기</summary>
    <div class="parking-card-detail"><p><strong>요금 계산</strong> 기본 ${row.baseMinutes ?? "-"}분 ${formatFee(row.baseFee)}, 추가 ${row.additionalMinutes ?? "-"}분당 ${formatFee(row.additionalFee)}</p><p><strong>일주차 전환점</strong> ${dayPass}</p><p><strong>할인 반영</strong> ${row.discountRate ? `${row.discountRate}% 참고 할인 적용` : "선택한 할인 없음"}</p><p><strong>운영정보</strong> ${escapeHtml(row.openReason || "선택 시간 기준 운영 여부를 참고로 판정합니다.")} · 평일 ${row.weekdayOpen || "-"}~${row.weekdayClose || "-"}, 토요일 ${row.saturdayOpen || "-"}~${row.saturdayClose || "-"}, 공휴일 ${row.holidayOpen || "-"}~${row.holidayClose || "-"}</p><p><strong>거리</strong> ${distance} · 좌표 기반 직선거리입니다.</p><p><strong>빈자리/위험도</strong> ${available}${observed} · ${row.fullRiskLabel}</p><p><strong>데이터</strong> 출처 ${escapeHtml(row.source || "샘플")}, 기준일 ${row.dataDate || "확인 필요"}</p><p class="fine-print">실제 요금, 할인 적용 여부, 주차 가능 여부는 현장 사정에 따라 달라질 수 있습니다.</p></div>
    </details>
  </article>`;
}

async function loadKakaoMap(els) {
  try {
    const key = await resolveKakaoMapKey();
    if (!key) throw new Error("NO_KAKAO_MAP_JS_KEY");
    await injectKakaoScript(key);
    if (!window.kakao?.maps?.load) throw new Error("카카오맵 SDK 객체를 찾지 못했습니다.");
    await new Promise((resolve) => window.kakao.maps.load(resolve));
    const center = new window.kakao.maps.LatLng(state.destination.lat, state.destination.lng);
    state.map = new window.kakao.maps.Map(els.map, { center, level: 4 });
    state.mapMode = "kakao";
    els.map.classList.remove("is-fallback");
    updateMapFallbackNotice(els, "카카오맵 연결됨", "목적지 주변 주차장 후보를 지도에서 비교해 보세요.");
    renderMap(els);
  } catch (error) {
    state.map = null;
    state.mapMode = "fallback";
    els.map.classList.add("is-fallback");
    if (error?.message) console.info(`[parking-map] Kakao map fallback: ${error.message}`);
    updateMapFallbackNotice(els, "샘플 지도 계산 모드", "카카오맵을 불러오지 못해 샘플 지도에서 예상 주차비를 표시합니다.");
    renderMap(els);
  }
}

async function resolveKakaoMapKey() {
  const fromWindow = window.HANNUNCALC_CONFIG?.KAKAO_MAP_JS_KEY || window.KAKAO_MAP_JS_KEY;
  if (fromWindow) return fromWindow;
  const meta = document.querySelector('meta[name="kakao-map-js-key"]')?.content?.trim();
  if (meta) return meta;
  try {
    const res = await fetch(`${API_BASE}/config`, { cache: "no-store" });
    if (!res.ok) return "";
    const data = await res.json();
    return data.kakaoMapJsKey || "";
  } catch (_) {
    return "";
  }
}

function injectKakaoScript(key) {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.load) return resolve();
    const existing = document.querySelector("script[data-kakao-map-sdk]");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("카카오맵 SDK 스크립트 로드 실패")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.dataset.kakaoMapSdk = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("카카오맵 SDK 스크립트 로드 실패: JavaScript 키, 도메인 등록, 네트워크/CSP 설정을 확인하세요."));
    document.head.append(script);
  });
}

function renderMap(els) {
  if (state.map && window.kakao?.maps) {
    state.kakaoMarkers.forEach((marker) => marker.setMap(null));
    state.kakaoMarkers = [];
    if (state.kakaoDestinationMarker) state.kakaoDestinationMarker.setMap(null);
    const center = new window.kakao.maps.LatLng(state.destination.lat, state.destination.lng);
    state.map.setCenter(center);
    state.kakaoDestinationMarker = new window.kakao.maps.CustomOverlay({
      position: center,
      content: `<span class="parking-destination-marker">목적지</span>`,
      yAnchor: 1.2
    });
    state.kakaoDestinationMarker.setMap(state.map);
    state.results.slice(0, 50).forEach((row) => {
      const button = document.createElement("button");
      const label = markerLabel(row);
      button.className = `parking-map-label ${row.rank === 1 ? "is-best" : ""} ${state.pinnedParkingId === row.id ? "is-selected" : ""}`;
      button.type = "button";
      button.dataset.parkingMarkerId = row.id;
      button.title = `${row.name} · ${label}`;
      button.innerHTML = `<span>${label}</span>`;
      button.addEventListener("click", () => pinParkingCard(row.id, els, { scroll: true }));
      const marker = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(row.lat, row.lng),
        content: button,
        yAnchor: 1
      });
      marker.setMap(state.map);
      state.kakaoMarkers.push(marker);
    });
    els.markerLayer.innerHTML = "";
    return;
  }
  renderFallbackMarkers(els);
}

function renderFallbackMarkers(els) {
  const rows = state.results.slice(0, 50);
  const lats = rows.map((row) => row.lat).concat(state.destination.lat);
  const lngs = rows.map((row) => row.lng).concat(state.destination.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pos = (row) => {
    const x = 10 + ((row.lng - minLng) / Math.max(0.001, maxLng - minLng)) * 80;
    const y = 85 - ((row.lat - minLat) / Math.max(0.001, maxLat - minLat)) * 70;
    return { left: `${clamp(x, 8, 88)}%`, top: `${clamp(y, 12, 82)}%` };
  };
  els.markerLayer.innerHTML = rows.map((row) => {
    const p = pos(row);
    const label = markerLabel(row);
    return `<button class="parking-map-label ${row.rank === 1 ? "is-best" : ""} ${state.pinnedParkingId === row.id ? "is-selected" : ""}" style="left:${p.left};top:${p.top}" type="button" data-parking-marker-id="${escapeHtml(row.id)}" title="${escapeHtml(row.name)} · ${label}"><span>${label}</span></button>`;
  }).join("") + `<span class="parking-destination-marker" style="left:50%;top:50%">목적지</span>`;
  els.markerLayer.querySelectorAll("[data-parking-marker-id]").forEach((button) => {
    button.addEventListener("click", () => pinParkingCard(button.dataset.parkingMarkerId, els, { scroll: true }));
  });
}

function markerLabel(row) {
  if (row.discountedFee == null) return "정보없음";
  if (row.discountedFee === 0) return "무료";
  return `${won.format(row.discountedFee)}원`;
}

function pinParkingCard(id, els, { scroll = false } = {}) {
  state.pinnedParkingId = id || "";
  applyPinnedParkingState(els);
  const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(state.pinnedParkingId) : state.pinnedParkingId.replace(/"/g, "\\\"");
  const target = document.querySelector(`[data-parking-card-id="${safeId}"]`);
  if (scroll) target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  target?.classList.add("is-highlighted");
  setTimeout(() => target?.classList.remove("is-highlighted"), 1200);
}

function applyPinnedParkingState(els) {
  document.querySelectorAll("[data-parking-card-id]").forEach((card) => {
    card.classList.toggle("is-pinned", Boolean(state.pinnedParkingId) && card.dataset.parkingCardId === state.pinnedParkingId);
  });
  document.querySelectorAll("[data-parking-marker-id]").forEach((marker) => {
    marker.classList.toggle("is-selected", Boolean(state.pinnedParkingId) && marker.dataset.parkingMarkerId === state.pinnedParkingId);
  });
}

function updateMapFallbackNotice(els, title, message) {
  const box = els.map.querySelector(".parking-map-fallback");
  if (!box) return;
  const strong = box.querySelector("strong");
  const span = box.querySelector("span");
  if (strong) strong.textContent = title;
  if (span) span.textContent = message;
}

function recommendationReason(row) {
  if (!row.isOpen) return "선택한 시간 일부가 운영시간 밖일 수 있어 방문 전 확인이 필요합니다.";
  if (row.discountedFee == null) return "요금 정보가 부족해 현장 확인이 필요합니다.";
  if (row.discountedFee === 0) return "무료 가능성이 있는 후보입니다. 운영시간과 실제 무료 조건을 확인해 보세요.";
  if (row.rank === 1) return `${formatDuration(row.durationMinutes)} 기준 요금, 직선거리, 데이터 신뢰도를 함께 고려한 추천 후보입니다.`;
  if (row.dayPassBetterAfterMinutes) return `일 최대 요금이 있어 ${formatDuration(row.dayPassBetterAfterMinutes)} 이상 장시간 주차에 유리할 수 있습니다.`;
  if (row.publicPrivateType === "공영") return "공영주차장으로 할인 조건을 확인해 볼 만한 후보입니다.";
  return "목적지 주변에서 비교 가능한 후보입니다. 실제 요금과 운영시간은 현장 기준을 확인하세요.";
}

function durationMinutes(arrivalAt, departureAt) {
  const start = new Date(arrivalAt);
  const end = new Date(departureAt);
  const minutes = Math.round((end - start) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function toMin(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function pad(value) { return String(value).padStart(2, "0"); }
function round1(value) { return Math.round(value * 10) / 10; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function valueOrMax(value) { return value == null ? Number.MAX_SAFE_INTEGER : Number(value); }
function confidenceValue(value) { return value === "high" ? 3 : value === "medium" ? 2 : 1; }
function formatDuration(minutes) { return minutes >= 60 ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}` : `${minutes}분`; }
function formatFee(value) { return value == null ? "정보 없음" : `${won.format(value)}원`; }
function formatDistance(km) { return km == null ? "거리 정보 없음" : km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`; }
function formatObservedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 필요";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function recommendationModeLabel(mode) { return { recommended: "추천순", cheap: "저렴한순", nearby: "가까운순", available: "빈자리순", confidence: "신뢰도순" }[mode] || "추천순"; }
function vehicleLabel(type) { return { general: "일반", compact: "경차", disabled: "장애인", ev: "전기차", manual: "직접 할인" }[type] || "일반"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
