const DEFAULT_PLACE = { name: "코엑스", address: "서울 강남구 영동대로 513", lat: 37.511, lng: 127.059 };
const SAMPLE_PLACES = [
  DEFAULT_PLACE,
  { name: "강남역", address: "서울 강남구 강남대로 396", lat: 37.4979, lng: 127.0276 },
  { name: "서울역", address: "서울 용산구 한강대로 405", lat: 37.5547, lng: 126.9707 },
  { name: "홍대입구", address: "서울 마포구 양화로 160", lat: 37.5572, lng: 126.9245 },
  { name: "인천공항", address: "인천 중구 공항로 272", lat: 37.4602, lng: 126.4407 },
  { name: "건국대학교 서울캠퍼스", address: "서울 광진구 능동로 120", lat: 37.5408, lng: 127.0793 },
  { name: "부산역", address: "부산 동구 중앙대로 206", lat: 35.1151, lng: 129.0403 },
  { name: "대구역", address: "대구 북구 태평로 161", lat: 35.8763, lng: 128.5966 },
  { name: "광주송정역", address: "광주 광산구 상무대로 201", lat: 35.1375, lng: 126.7914 },
  { name: "대전역", address: "대전 동구 중앙로 215", lat: 36.3322, lng: 127.434 },
  { name: "제주공항", address: "제주 제주시 공항로 2", lat: 33.5071, lng: 126.4931 },
  { name: "세종시청", address: "세종특별자치시 한누리대로 2130", lat: 36.4807, lng: 127.2892 },
  { name: "세종특별자치시청", address: "세종특별자치시 한누리대로 2130", lat: 36.4807, lng: 127.2892 },
  { name: "정부세종청사", address: "세종특별자치시 도움6로 11", lat: 36.5046, lng: 127.2654 },
  { name: "세종", address: "세종특별자치시 보람동", lat: 36.4807, lng: 127.2892 },
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
  lastRealtimeNote: "",
  lastFallbackReason: "",
  lastStats: null,
  lastSearchCenter: DEFAULT_PLACE,
  lastSearchZoom: null,
  recommendCache: new Map(),
  mapIdleTimer: null,
  hasMapMoveEvents: false,
  lastPlaceSearchUsedSampleFallback: false
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
    placePopup: ensurePlacePopup(),
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
    dataBadges: document.querySelector("#parking-data-badges"),
    summaryTitle: document.querySelector("#parking-summary-title"),
    summarySubtitle: document.querySelector("#parking-summary-subtitle"),
    resultList: document.querySelector("#parking-result-list"),
    mobileResults: document.querySelector("#parking-mobile-results"),
    map: document.querySelector("#parking-map"),
    markerLayer: document.querySelector("#parking-map-markers"),
    mapRefresh: document.querySelector("#parking-map-research-button"),
    mobileMapJump: document.querySelector("#parking-mobile-map-jump"),
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
  setupMobileOptionsToggle();
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
  const now = new Date();
  const departure = new Date(now);
  departure.setHours(departure.getHours() + 4);
  els.visitDate.value = formatDateInput(now);
  els.arrival.value = formatTimeInput(now);
  els.departure.value = formatTimeInput(departure);
  els.destination.value = DEFAULT_PLACE.name;
  syncPreferenceCards(els);
}

function setupMobileOptionsToggle() {
  const card = document.querySelector(".parking-control-card--options");
  if (!card || card.dataset.mobileToggleReady === "true") return;
  const label = card.querySelector(".step-label");
  if (!label) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "parking-options-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span>3단계 · 차량/할인 조건</span><strong>열기</strong>';

  const body = document.createElement("div");
  body.className = "parking-options-body";
  let node = label.nextSibling;
  while (node) {
    const next = node.nextSibling;
    body.appendChild(node);
    node = next;
  }

  card.append(toggle, body);
  card.classList.add("is-collapsed");
  card.dataset.mobileToggleReady = "true";

  toggle.addEventListener("click", () => {
    const open = card.classList.toggle("is-open");
    card.classList.toggle("is-collapsed", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const stateText = toggle.querySelector("strong");
    if (stateText) stateText.textContent = open ? "접기" : "열기";
  });
}
function bindEvents(els) {
  els.placePopup?.addEventListener("click", (event) => {
    if (event.target === els.placePopup || event.target.closest("[data-place-popup-close]")) closePlacePopup(els);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.placePopup && !els.placePopup.hidden) closePlacePopup(els);
  });
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleParkingSearch(els);
  });
  els.recommend.addEventListener("click", () => handleParkingSearch(els));
  els.mobileMapJump?.addEventListener("click", () => {
    const target = document.querySelector(".parking-dashboard__map") || els.map;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.mapRefresh?.addEventListener("click", () => researchCurrentMapArea(els));
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

async function handleParkingSearch(els) {
  const query = els.destination.value.trim();
  if (!query) {
    els.searchStatus.textContent = "목적지를 입력해 주세요.";
    els.status.textContent = "목적지를 입력한 뒤 주차장 찾기를 눌러 주세요.";
    els.destination.focus();
    return;
  }
  const originalText = els.recommend?.textContent || "주차장 찾기";
  if (els.recommend) {
    els.recommend.disabled = true;
    els.recommend.textContent = "주차장 찾는 중...";
  }
  try {
    await searchDestination(els);
  } finally {
    if (els.recommend) {
      els.recommend.disabled = false;
      els.recommend.textContent = originalText;
    }
  }
}

function findSamplePlaces(query) {
  const lower = String(query || "").toLowerCase().replace(/\s+/g, "");
  return SAMPLE_PLACES.filter((place) => `${place.name} ${place.address}`.toLowerCase().replace(/\s+/g, "").includes(lower));
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
    if (data.places?.length) {
      state.places = data.places;
    } else {
      usedSampleFallback = true;
      state.places = findSamplePlaces(query);
    }
  } catch (_) {
    usedSampleFallback = true;
    state.places = findSamplePlaces(query);
  }
  state.lastPlaceSearchUsedSampleFallback = usedSampleFallback;
  if (!state.places.length) {
    els.searchStatus.textContent = "검색 결과를 찾지 못했습니다. 다른 장소명을 입력해 주세요.";
    els.status.textContent = "추천 결과입니다.";
    renderPlaces(els, { openPopup: true, emptyMessage: "검색 결과를 찾지 못했습니다." });
    return;
  }
  els.searchStatus.textContent = `${state.places.length}개 후보를 찾았습니다. 목적지를 선택해 주세요.`;
  renderPlaces(els, { openPopup: true });
}

function renderPlaces(els, options = {}) {
  if (els.placeResults) els.placeResults.innerHTML = "";
  if (options.openPopup) openPlacePopup(els, options.emptyMessage || "");
}

function ensurePlacePopup() {
  let popup = document.querySelector("#parking-place-popup");
  if (popup) return popup;
  popup = document.createElement("div");
  popup.id = "parking-place-popup";
  popup.className = "parking-place-popup";
  popup.hidden = true;
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "true");
  popup.setAttribute("aria-labelledby", "parking-place-popup-title");
  popup.innerHTML = `
    <div class="parking-place-popup__panel" role="document">
      <div class="parking-place-popup__head">
        <strong id="parking-place-popup-title">목적지를 선택해 주세요</strong>
        <button type="button" class="parking-place-popup__close" data-place-popup-close aria-label="목적지 후보 팝업 닫기">×</button>
      </div>
      <div class="parking-place-popup__list" data-place-popup-list></div>
    </div>
  `;
  document.body.append(popup);
  return popup;
}

function openPlacePopup(els, emptyMessage = "") {
  const popup = els.placePopup || ensurePlacePopup();
  const list = popup.querySelector("[data-place-popup-list]");
  if (!list) return;
  if (emptyMessage || !state.places.length) {
    list.innerHTML = `<p class="parking-place-popup__empty">${escapeHtml(emptyMessage || "검색 결과를 찾지 못했습니다.")}</p>`;
  } else {
    list.innerHTML = state.places.map((place, index) => `
      <button type="button" class="parking-place-popup__item" data-place-index="${index}">
        <strong>${escapeHtml(place.name)}</strong>
        <span>${escapeHtml(place.address || "주소 정보 없음")}</span>
      </button>
    `).join("");
    list.querySelectorAll("[data-place-index]").forEach((button) => {
      button.addEventListener("click", () => selectPlaceFromPopup(Number(button.dataset.placeIndex), els));
    });
  }
  popup.hidden = false;
  document.body.classList.add("parking-place-popup-open");
  popup.querySelector(".parking-place-popup__close")?.focus({ preventScroll: true });
}

function closePlacePopup(els) {
  const popup = els?.placePopup || document.querySelector("#parking-place-popup");
  if (!popup) return;
  popup.hidden = true;
  document.body.classList.remove("parking-place-popup-open");
}

async function selectPlaceFromPopup(index, els) {
  const place = state.places[index];
  if (!place) return;
  state.destination = place;
  state.lastSearchCenter = { lat: place.lat, lng: place.lng };
  els.destination.value = place.name;
  closePlacePopup(els);
  els.searchStatus.textContent = state.lastPlaceSearchUsedSampleFallback
    ? `목적지 검색 API를 사용할 수 없어 ${place.name} 샘플 위치 기준으로 계산합니다.`
    : `${place.name} 기준으로 주변 주차장을 계산했습니다.`;
  await calculateAndRender(els);
}

function applyQuickDuration(els, value) {
  const [h, m] = els.arrival.value.split(":").map(Number);
  const date = new Date(`${els.visitDate.value}T${pad(h)}:${pad(m)}:00`);
  const minutes = value === "day" ? 1440 : Number(value);
  date.setMinutes(date.getMinutes() + minutes);
  els.departure.value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildInput(els) {
  const { arrivalAt, departureAt } = buildScheduleIso(els.visitDate.value, els.arrival.value, els.departure.value);
  const duration = durationMinutes(arrivalAt, departureAt);
  return {
    destination: state.destination,
    arrivalAt,
    departureAt,
    duration,
    vehicleType: els.vehicleType.value,
    manualDiscountRate: Number(els.manualDiscount.value || 0),
    sort: els.sort.value,
    radius: 1500,
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

function buildScheduleIso(visitDate, arrivalTime, departureTime) {
  const arrivalAt = `${visitDate}T${arrivalTime}:00+09:00`;
  const arrivalMinutes = timeToMinutes(arrivalTime);
  const departureMinutes = timeToMinutes(departureTime);
  const crossesMidnight = Number.isFinite(arrivalMinutes) && Number.isFinite(departureMinutes) && departureMinutes <= arrivalMinutes;
  const departureDate = crossesMidnight ? addDaysToDateInput(visitDate, 1) : visitDate;
  return {
    arrivalAt,
    departureAt: `${departureDate}T${departureTime}:00+09:00`
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function addDaysToDateInput(value, days) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

async function calculateAndRender(els) {
  const input = buildInput(els);
  if (!input.duration) {
    els.status.textContent = "출차 시간이 입차 시간보다 늦어야 합니다.";
    return;
  }
  els.status.textContent = "현재 조건으로 추천 결과를 계산하고 있습니다.";
  let rows;
  const cacheKey = buildRecommendCacheKey(input);
  const cached = state.recommendCache.get(cacheKey);
  try {
    let data;
    if (cached) {
      data = cached;
    } else {
      const res = await fetch(`${API_BASE}/recommend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error("recommend api failed");
      data = await res.json();
      rememberRecommendCache(cacheKey, data);
    }
    rows = data.recommended || [];
    state.lastDataMode = data.summary?.dataMode || "api";
    state.lastDataSources = data.summary?.dataSources || [];
    state.lastRealtimeMode = data.summary?.realtimeMode || "sample-fallback";
    state.lastRealtimeNote = data.summary?.realtimeNote || "";
    state.lastHolidayContext = data.summary?.holidayContext || null;
    state.lastFallbackReason = data.summary?.fallbackReason || data.summary?.note || "";
    state.lastStats = data.summary?.stats || null;
    if (cached) console.info("[parking-map] cached recommendation result used", cacheKey);
  } catch (_) {
    rows = fallbackRecommend(input);
    state.lastDataMode = "sample-fallback";
    state.lastDataSources = [];
    state.lastRealtimeMode = "sample-fallback";
    state.lastRealtimeNote = "샘플 실시간 데이터를 사용합니다.";
    state.lastHolidayContext = buildClientHolidayContext(input.arrivalAt);
    state.lastFallbackReason = "API 호출이 실패해 로컬 샘플 주차장 데이터로 계산합니다.";
    state.lastStats = null;
  }
  state.results = rows;
  state.lastSearchCenter = { lat: state.destination.lat, lng: state.destination.lng };
  if (els.mapRefresh) els.mapRefresh.hidden = true;
  if (state.pinnedParkingId && !rows.some((row) => row.id === state.pinnedParkingId)) state.pinnedParkingId = "";
  if (!state.pinnedParkingId && rows[0]?.id) state.pinnedParkingId = rows[0].id;
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
  const base = nearby.slice(0, 50);
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
  const modeText = recommendationModeLabel(input.sort);
  els.summarySubtitle.textContent = state.results.length ? `${state.results.length}개 주차장 비교 · ${modeText}` : "조건에 맞는 주차장이 없습니다.";
  els.status.textContent = state.results.length ? "추천 결과입니다." : "이 주변에서 계산 가능한 주차장을 찾지 못했습니다. 검색 반경을 넓히거나 필터를 줄여보세요.";
  renderDataBadges(els, input);
  if (state.lastFallbackReason) console.info("[parking-map] data fallback/status", { mode: state.lastDataMode, reason: state.lastFallbackReason, stats: state.lastStats });
  const html = state.results.map((row) => renderResultCard(row)).join("") || `<article class="parking-result-card"><strong>계산 가능한 주차장을 찾지 못했습니다.</strong><p>이 주변에서 계산 가능한 주차장을 찾지 못했습니다. 검색 반경을 넓히거나 필터를 줄여보세요.</p></article>`;
  els.resultList.innerHTML = html;
  if (els.mobileResults && els.mobileResults !== els.resultList) els.mobileResults.innerHTML = html;
  [els.resultList, els.mobileResults].filter(Boolean).forEach((container, index, arr) => { if (arr.indexOf(container) === index) bindResultCardEvents(container, els); });
  applyPinnedParkingState(els);
}

function bindResultCardEvents(container, els) {
  container.querySelectorAll("[data-parking-card-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, summary, details, input, select, textarea")) return;
      pinParkingCard(card.dataset.parkingCardId, els, { scrollToMap: window.innerWidth <= 860 });
    });
  });
  container.querySelectorAll("[data-parking-pin-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pinnedParkingId = "";
      applyPinnedParkingState(els);
    });
  });
  container.querySelectorAll("[data-parking-detail-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const card = button.closest(".parking-result-card");
      const detail = card?.querySelector("[data-parking-card-detail]");
      if (!card || !detail) return;
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "상세 접기 ▲" : "상세 보기 ▼";
      detail.hidden = !open;
      card.classList.toggle("expanded", open);
    });
  });
}

function renderResultCard(row) {
  const price = row.discountedFee == null ? "정보 부족" : row.discountedFee === 0 ? "무료" : `${won.format(row.discountedFee)}원`;
  const original = row.parkingFee != null && row.parkingFee !== row.discountedFee ? `<span>할인 전 ${won.format(row.parkingFee)}원</span>` : "";
  const dayPass = row.dayPassBetterAfterMinutes ? `${formatDuration(row.dayPassBetterAfterMinutes)} 이상이면 1일권이 유리할 수 있습니다.` : "1일권 전환점 정보 없음";
  const realtime = realtimeAvailabilityText(row);
  const distance = row.distanceFromDestinationKm == null ? "거리 정보 없음" : `목적지에서 약 ${formatDistance(row.distanceFromDestinationKm)}`;
  const reason = recommendationReason(row);
  const pinned = state.pinnedParkingId === row.id;
  const riskClass = row.fullRisk === "high" ? "metric-risk-high" : row.fullRisk === "medium" ? "metric-risk-medium" : "metric-risk-low";
  const confidenceClass = row.dataConfidence === "high" ? "metric-confidence-high" : row.dataConfidence === "medium" ? "metric-confidence-medium" : "metric-confidence-low";
  return `<article class="parking-result-card ${row.rank === 1 ? "is-best" : ""} ${pinned ? "is-pinned" : ""}" data-parking-card-id="${escapeHtml(row.id)}">
    <div class="parking-card-head"><div><strong>${escapeHtml(row.name)}</strong><span>${row.rank === 1 ? "추천 1위" : `${row.rank}순위`} · ${escapeHtml(row.publicPrivateType || "구분 확인")}</span></div>${pinned ? `<button type="button" class="subtle-button tiny" data-parking-pin-clear>선택 해제</button>` : ""}</div>
    <div class="parking-price-row"><strong>${price}</strong>${original}</div>
    <p class="parking-reason">${escapeHtml(reason)}</p>
    <div class="parking-card-metrics"><span class="parking-metric-chip metric-distance">${distance}</span><span class="parking-metric-chip metric-availability">${realtime}</span><span class="parking-metric-chip ${riskClass}">${row.fullRiskLabel}</span><span class="parking-metric-chip ${confidenceClass}">${row.dataConfidenceLabel}</span></div>
    ${pinned ? `<p class="parking-pinned-badge">지도에서 선택한 주차장입니다.</p>` : ""}
    <button type="button" class="parking-detail-toggle" data-parking-detail-toggle aria-expanded="false">상세 보기 ▼</button>
    <div class="parking-card-detail" data-parking-card-detail hidden>
      <p><strong>요금 기준</strong> ${formatDuration(row.durationMinutes)} 기준 예상 요금입니다.</p>
      <p><strong>기본/추가 요금</strong> 기본 ${row.baseMinutes ?? "-"}분 ${formatFee(row.baseFee)}, 추가 ${row.additionalMinutes ?? "-"}분당 ${formatFee(row.additionalFee)}</p>
      <p><strong>1일권 전환점</strong> ${dayPass}</p>
      <p><strong>할인 반영</strong> ${row.discountRate ? `${row.discountRate}% 참고 할인 적용` : "선택한 할인 없음"}</p>
      <p><strong>운영정보</strong> ${escapeHtml(row.openReason || "선택 시간 기준 운영 여부를 참고로 판정합니다.")}</p>
      <p><strong>거리</strong> ${distance} · 좌표 기반 직선거리입니다.</p>
      <p><strong>빈자리/위험도</strong> ${realtime} · ${row.fullRiskLabel}</p>
      <p><strong>데이터</strong> 출처 ${escapeHtml(row.source || "참고 데이터")}, 기준일 ${row.dataDate || "확인 필요"}</p>
      <p class="fine-print">실제 요금, 할인 적용 여부, 주차 가능 여부는 현장 사정에 따라 달라질 수 있습니다.</p>
    </div>
  </article>`;
}

function realtimeAvailabilityText(row) {
  if (row.realtimeAvailable == null) return "빈자리 정보 없음";
  const observed = row.realtimeObservedAt ? formatObservedAt(row.realtimeObservedAt) : "현재";
  return `${observed} 기준 빈자리: ${row.realtimeAvailable}대`;
}


function renderDataBadges(els, input) {
  if (!els.dataBadges) return;
  const badges = [];
  const isPublic = state.lastDataMode === "public-adapter" || state.lastDataMode === "hybrid-public-sample";
  badges.push(isPublic ? "공공데이터" : "참고 데이터");
  badges.push(state.lastRealtimeMode === "seoul-realtime-adapter" ? "실시간 일부 반영" : "실시간 일부 없음");
  if (state.lastDataMode === "hybrid-public-sample" || state.lastDataMode === "sample-fallback") badges.push("보조 데이터 사용");
  if (state.lastHolidayContext?.dayTypeLabel) badges.push(`${state.lastHolidayContext.dayTypeLabel} 운영시간`);
  els.dataBadges.innerHTML = badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("");
}

function buildRecommendCacheKey(input) {
  const filters = Object.entries(input.filters || {}).filter(([, value]) => value).map(([key]) => key).sort().join(",");
  return [
    Number(input.destination.lat).toFixed(4),
    Number(input.destination.lng).toFixed(4),
    input.radius,
    input.duration,
    input.vehicleType,
    input.manualDiscountRate,
    input.sort,
    filters
  ].join("|");
}

function rememberRecommendCache(key, data) {
  if (!key) return;
  state.recommendCache.set(key, data);
  if (state.recommendCache.size > 24) {
    const first = state.recommendCache.keys().next().value;
    state.recommendCache.delete(first);
  }
}

function bindKakaoMapMoveEvents(els) {
  if (!state.map || !window.kakao?.maps || state.hasMapMoveEvents) return;
  state.hasMapMoveEvents = true;
  state.lastSearchZoom = state.map.getLevel?.() ?? null;
  window.kakao.maps.event.addListener(state.map, "idle", () => {
    clearTimeout(state.mapIdleTimer);
    state.mapIdleTimer = setTimeout(() => updateMapResearchButton(els), 700);
  });
}

function updateMapResearchButton(els) {
  if (!els.mapRefresh || !state.map || !window.kakao?.maps) return;
  const center = state.map.getCenter();
  const current = { lat: center.getLat(), lng: center.getLng() };
  const movedKm = distanceKm(state.lastSearchCenter || state.destination, current);
  const level = state.map.getLevel?.() ?? state.lastSearchZoom;
  const zoomChanged = state.lastSearchZoom != null && Math.abs(Number(level) - Number(state.lastSearchZoom)) >= 1;
  els.mapRefresh.hidden = !(movedKm >= 0.5 || zoomChanged);
}

async function researchCurrentMapArea(els) {
  if (!state.map || !window.kakao?.maps) return;
  const center = state.map.getCenter();
  state.destination = {
    name: "현재 지도 중심",
    address: "지도에서 다시 검색한 위치",
    lat: center.getLat(),
    lng: center.getLng()
  };
  state.places = [state.destination];
  state.lastSearchCenter = { lat: state.destination.lat, lng: state.destination.lng };
  state.lastSearchZoom = state.map.getLevel?.() ?? state.lastSearchZoom;
  if (els.destination) els.destination.value = state.destination.name;
  if (els.searchStatus) els.searchStatus.textContent = "현재 지도 주변 주차장을 찾는 중입니다.";
  if (els.mapRefresh) els.mapRefresh.hidden = true;
  renderPlaces(els);
  await calculateAndRender(els);
  if (els.searchStatus) els.searchStatus.textContent = state.results.length ? "현재 지도 기준 추천 결과입니다." : "현재 지도 주변에서 조건에 맞는 주차장을 찾지 못했습니다.";
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
    bindKakaoMapMoveEvents(els);
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
      button.innerHTML = markerContent(row, label);
      button.addEventListener("click", () => pinParkingCard(row.id, els, { popup: true }));
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
    return `<button class="parking-map-label ${row.rank === 1 ? "is-best" : ""} ${state.pinnedParkingId === row.id ? "is-selected" : ""}" style="left:${p.left};top:${p.top}" type="button" data-parking-marker-id="${escapeHtml(row.id)}" title="${escapeHtml(row.name)} · ${label}">${markerContent(row, label)}</button>`;
  }).join("") + `<span class="parking-destination-marker" style="left:50%;top:50%">목적지</span>`;
  els.markerLayer.querySelectorAll("[data-parking-marker-id]").forEach((button) => {
    button.addEventListener("click", () => pinParkingCard(button.dataset.parkingMarkerId, els, { popup: true }));
  });
}

function markerContent(row, label) {
  const rank = Number.isFinite(Number(row.rank)) ? Number(row.rank) : "";
  const rankHtml = rank ? `<b class="parking-marker-rank" aria-label="추천 순위 ${rank}위">${rank}</b>` : "";
  return `${rankHtml}<span>${escapeHtml(label)}</span>`;
}
function markerLabel(row) {
  if (row.discountedFee == null) return "정보없음";
  if (row.discountedFee === 0) return "무료";
  return `${won.format(row.discountedFee)}원`;
}

function pinParkingCard(id, els, { scroll = false, popup = false, scrollToMap = false } = {}) {
  state.pinnedParkingId = id || "";
  applyPinnedParkingState(els);
  const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(state.pinnedParkingId) : String(state.pinnedParkingId).replace(/"/g, '\\"');
  const target = document.querySelector(`[data-parking-card-id="${safeId}"]`);
  if (scrollToMap) document.querySelector(".parking-dashboard__map")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (scroll) target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  target?.classList.add("is-highlighted");
  setTimeout(() => target?.classList.remove("is-highlighted"), 1200);
  if (popup) showParkingMapPopup(id, els);
}

function showParkingMapPopup(id, els) {
  const row = state.results.find((item) => item.id === id);
  const mapCard = document.querySelector(".parking-map-card");
  if (!row || !mapCard) return;
  mapCard.querySelector(".parking-map-popup")?.remove();
  const price = row.discountedFee == null ? markerLabel(row) : row.discountedFee === 0 ? markerLabel(row) : `${won.format(row.discountedFee)}원`;
  const distance = row.distanceFromDestinationKm == null ? "거리 정보 없음" : `목적지에서 약 ${formatDistance(row.distanceFromDestinationKm)}`;
  const realtime = realtimeAvailabilityText(row);
  const popup = document.createElement("article");
  popup.className = "parking-map-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `${row.name} 주차장 요약`);
  popup.innerHTML = [
    '<button type="button" class="parking-map-popup__close" aria-label="지도 주차장 요약 닫기">×</button>',
    '<div class="parking-map-popup__head">',
    `<span>${row.rank || "-"}위</span>`,
    `<strong>${escapeHtml(row.name)}</strong>`,
    '</div>',
    `<p class="parking-map-popup__meta">${escapeHtml(row.publicPrivateType || "구분 확인")} · ${escapeHtml(row.fullRiskLabel || "위험도 확인 필요")}</p>`,
    `<p class="parking-map-popup__price">${escapeHtml(price)}</p>`,
    `<p class="parking-map-popup__detail">${escapeHtml(distance)} · ${escapeHtml(realtime)}</p>`,
    `<p class="parking-map-popup__detail">${escapeHtml(row.dataConfidenceLabel || "신뢰도 확인 필요")}</p>`,
    '<button type="button" class="subtle-button tiny" data-popup-scroll-card>추천 카드 보기</button>'
  ].join("");
  popup.querySelector(".parking-map-popup__close")?.addEventListener("click", () => popup.remove());
  popup.querySelector("[data-popup-scroll-card]")?.addEventListener("click", () => pinParkingCard(id, els, { scroll: true }));
  mapCard.append(popup);
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
  if (row.rank === 1) return `${formatDuration(row.durationMinutes)} 기준 가장 합리적인 후보입니다.`;
  if (row.dayPassBetterAfterMinutes) return `장시간 주차에 유리할 수 있습니다.`;
  if (row.publicPrivateType === "공영") return "공영주차장 할인 조건을 확인해 보세요.";
  return "목적지 주변 비교 후보입니다.";
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
function formatDateInput(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
function formatTimeInput(date) { return pad(date.getHours()) + ":" + pad(date.getMinutes()); }
function round1(value) { return Math.round(value * 10) / 10; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function valueOrMax(value) { return value == null ? Number.MAX_SAFE_INTEGER : Number(value); }
function confidenceValue(value) { return value === "high" ? 3 : value === "medium" ? 2 : 1; }
function formatDuration(minutes) { return minutes >= 60 ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}` : `${minutes}분`; }
function formatFee(value) { return value == null ? "정보 없음" : `${won.format(value)}원`; }
function formatDistance(km) { return km == null ? "거리 정보 없음" : km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`; }
function formatObservedAt(value) {
  const text = String(value || "");
  const direct = text.match(/[T\s](\d{2}):(\d{2})/);
  if (direct) return `${direct[1]}:${direct[2]}`;
  const compact = text.replace(/[^0-9]/g, "");
  if (compact.length >= 12) return `${compact.slice(8, 10)}:${compact.slice(10, 12)}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 필요";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function recommendationModeLabel(mode) { return { recommended: "추천순", cheap: "저렴한순", nearby: "가까운순", available: "빈자리순", confidence: "신뢰도순" }[mode] || "추천순"; }
function vehicleLabel(type) { return { general: "일반", compact: "경차", disabled: "장애인", ev: "전기차", manual: "직접 할인" }[type] || "일반"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
