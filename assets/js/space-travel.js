const LIGHT_SPEED_KM_PER_SEC = 299792.458;
const LIGHT_YEAR_KM = 9460730472580.8;

const SPEEDS = [
  { key: "light", label: "빛의 속도", kmPerSecond: LIGHT_SPEED_KM_PER_SEC, note: "진공에서 빛이 이동하는 속도입니다." },
  { key: "parker", label: "파커 태양 탐사선급", kmPerSecond: 192, note: "인류가 만든 탐사선 중 매우 빠른 축에 드는 속도입니다." },
  { key: "voyager", label: "보이저 1호급", kmPerSecond: 17, note: "태양계를 벗어난 탐사선 속도에 가까운 값입니다." },
  { key: "new-horizons", label: "뉴허라이즌스급", kmPerSecond: 14, note: "명왕성을 지나간 탐사선 속도를 단순화한 값입니다." },
  { key: "escape", label: "로켓 속도(지구 탈출속도)", kmPerSecond: 11.2, note: "지구 중력을 벗어나는 데 필요한 대표 속도입니다." },
  { key: "jet", label: "여객기 속도", kmPerSecond: 0.25, note: "시속 약 900km로 단순 환산했습니다." },
  { key: "ktx", label: "KTX 속도", kmPerSecond: 0.0833, note: "시속 약 300km로 단순 환산했습니다." },
  { key: "walk", label: "걸어서", kmPerSecond: 0.0014, note: "시속 약 5km입니다. 우주는 운동화로 해결되지 않습니다." }
];

const DESTINATION_GROUPS = [
  {
    label: "태양계",
    items: [
      { key: "moon", label: "달", distanceLy: 0.0000000406, note: "평균 지구-달 거리 약 38만 km 기준입니다." },
      { key: "sun", label: "태양", distanceLy: 0.00001581, note: "1AU, 빛으로 약 8분 19초 거리입니다." },
      { key: "mercury", label: "수성", distanceLy: 0.00000969, note: "지구와 가까울 때의 대략 거리 기준입니다." },
      { key: "venus", label: "금성", distanceLy: 0.00000438, note: "지구와 가까울 때의 대략 거리 기준입니다." },
      { key: "mars", label: "화성", distanceLy: 0.00000828, note: "지구와 가까울 때의 대략 거리 기준입니다." },
      { key: "jupiter", label: "목성", distanceLy: 0.00006645, note: "대표적인 접근 거리 기준의 단순 계산입니다." },
      { key: "saturn", label: "토성", distanceLy: 0.0001348, note: "대표적인 접근 거리 기준의 단순 계산입니다." },
      { key: "uranus", label: "천왕성", distanceLy: 0.0002875, note: "대표적인 접근 거리 기준의 단순 계산입니다." },
      { key: "neptune", label: "해왕성", distanceLy: 0.0004598, note: "대표적인 접근 거리 기준의 단순 계산입니다." },
      { key: "pluto", label: "명왕성", distanceLy: 0.000506, note: "탐사선 기준으로도 긴 장거리 여행입니다." }
    ]
  },
  {
    label: "가까운 별",
    items: [
      { key: "proxima", label: "프록시마 센타우리", distanceLy: 4.2465, note: "태양에서 가장 가까운 별계입니다." },
      { key: "sirius", label: "시리우스", distanceLy: 8.6, note: "밤하늘에서 매우 밝게 보이는 별입니다." },
      { key: "trappist", label: "TRAPPIST-1", distanceLy: 40.66, note: "지구형 행성 후보로 자주 언급되는 별계입니다." },
      { key: "vega", label: "베가", distanceLy: 25.04, note: "거문고자리의 밝은 별입니다." },
      { key: "polaris", label: "북극성", distanceLy: 433, note: "북쪽 방향을 찾을 때 쓰이는 대표 별입니다." },
      { key: "betelgeuse", label: "베텔게우스", distanceLy: 642, note: "오리온자리의 붉은 초거성입니다." }
    ]
  },
  {
    label: "은하와 더 먼 곳",
    items: [
      { key: "galactic-center", label: "우리은하 중심", distanceLy: 26000, note: "궁수자리 방향의 은하 중심까지의 대략 거리입니다." },
      { key: "lmc", label: "대마젤란은하", distanceLy: 163000, note: "우리은하 주변의 위성은하입니다." },
      { key: "andromeda", label: "안드로메다 은하", distanceLy: 2537000, note: "맨눈으로도 볼 수 있는 가까운 대형 은하입니다." },
      { key: "triangulum", label: "삼각형자리 은하", distanceLy: 2730000, note: "국부은하군의 또 다른 큰 은하입니다." },
      { key: "sombrero", label: "솜브레로 은하", distanceLy: 31000000, note: "독특한 모양으로 유명한 은하입니다." },
      { key: "m87", label: "M87 은하", distanceLy: 53500000, note: "블랙홀 이미지로 유명한 거대 타원은하입니다." }
    ]
  }
];

export function initSpaceTravelCalculator(root = document) {
  const form = root.querySelector("#space-travel-form");
  if (!form) return;

  const speedSelect = form.elements.speedKey;
  const destinationSelect = form.elements.destinationKey;
  populateSpeedSelect(speedSelect);
  populateDestinationSelect(destinationSelect);

  const els = {
    time: root.querySelector("#space-travel-time"),
    distance: root.querySelector("#space-distance"),
    distanceKm: root.querySelector("#space-distance-km"),
    speed: root.querySelector("#space-speed-result"),
    lightTime: root.querySelector("#space-light-time"),
    generation: root.querySelector("#space-generation"),
    comment: root.querySelector("#space-comment"),
    note: root.querySelector("#space-note"),
    bar: root.querySelector("#space-progress-bar")
  };

  const update = () => {
    const result = calculateSpaceTravel({
      speedKey: speedSelect.value,
      destinationKey: destinationSelect.value
    });
    renderSpaceTravel(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("change", update);
  update();
}

export function calculateSpaceTravel(values) {
  const speed = SPEEDS.find((item) => item.key === values.speedKey) || SPEEDS[0];
  const destination = DESTINATION_GROUPS.flatMap((group) => group.items)
    .find((item) => item.key === values.destinationKey) || DESTINATION_GROUPS[0].items[0];

  const speedRatio = speed.kmPerSecond / LIGHT_SPEED_KM_PER_SEC;
  const years = destination.distanceLy / speedRatio;
  const distanceKm = destination.distanceLy * LIGHT_YEAR_KM;

  return {
    speed,
    destination,
    years,
    distanceKm,
    speedRatio,
    generations: years / 30
  };
}

function renderSpaceTravel(els, result) {
  els.time.textContent = formatYears(result.years);
  els.distance.textContent = formatLightYears(result.destination.distanceLy);
  els.distanceKm.textContent = formatKm(result.distanceKm);
  els.speed.textContent = `${result.speed.label} (${formatSpeed(result.speed.kmPerSecond)})`;
  els.lightTime.textContent = formatYears(result.destination.distanceLy);
  els.generation.textContent = result.generations >= 1 ? `약 ${formatLargeNumber(result.generations)}세대` : "한 세대 안";
  els.comment.textContent = buildComment(result);
  els.note.textContent = `${result.destination.note} ${result.speed.note}`;

  const ratio = Math.max(1, Math.min(100, Math.log10(result.speedRatio * 100000000 + 1) * 18));
  els.bar.style.width = `${ratio}%`;
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
  if (result.years < 1 / 365) return "오늘 출발하면 오늘 안에 도착하는 거리입니다. 우주 기준으로는 동네 마실입니다.";
  if (result.years < 1) return "인간의 일정표 안에 들어오는 드문 우주 여행입니다.";
  if (result.years < 100) return "한 사람의 인생 안에서 상상해 볼 수 있는 거리입니다. 그래도 편도입니다.";
  if (result.years < 10000) return "역사책 단위로 넘어갑니다. 간식 챙기는 정도로는 부족합니다.";
  if (result.years < 1000000) return "문명 단위의 여행입니다. 목적지에 도착할 즈음 출발 이유가 전설이 됩니다.";
  return "은하급 거리입니다. 출발 버튼을 누르는 순간 장대한 농담이 시작됩니다.";
}

function formatYears(years) {
  if (!Number.isFinite(years)) return "-";
  const days = years * 365.2425;
  const hours = days * 24;
  const minutes = hours * 60;

  if (minutes < 1) return `${(minutes * 60).toFixed(1)}초`;
  if (hours < 1) return `${minutes.toFixed(1)}분`;
  if (days < 1) return `${hours.toFixed(1)}시간`;
  if (years < 1) return `${days.toFixed(1)}일`;
  if (years < 10000) return `${formatLargeNumber(years)}년`;
  if (years < 100000000) return `약 ${(years / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만 년`;
  return `약 ${(years / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억 년`;
}

function formatLightYears(value) {
  if (value < 0.000001) return `${(value * 365.2425 * 24 * 60 * 60).toFixed(1)}광초`;
  if (value < 0.001) return `${(value * 365.2425 * 24).toFixed(2)}광시간`;
  if (value < 1) return `${(value * 365.2425).toFixed(2)}광일`;
  return `${formatLargeNumber(value)}광년`;
}

function formatKm(value) {
  if (value >= 1000000000000) return `약 ${(value / 1000000000000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조 km`;
  if (value >= 100000000) return `약 ${(value / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억 km`;
  return `약 ${Math.round(value).toLocaleString("ko-KR")}km`;
}

function formatSpeed(kmPerSecond) {
  if (kmPerSecond >= 1) return `${kmPerSecond.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}km/s`;
  return `${(kmPerSecond * 3600).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}km/h`;
}

function formatLargeNumber(value) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: value >= 100 ? 0 : 1
  });
}
