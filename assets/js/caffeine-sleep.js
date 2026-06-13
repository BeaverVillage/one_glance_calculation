import { getFormNumber } from "./utils.js";

export function initCaffeineSleepCalculator(root = document) {
  const form = root.querySelector("#caffeine-sleep-form");
  if (!form) return;

  const els = {
    remaining: root.querySelector("#caffeine-remaining"),
    percent: root.querySelector("#caffeine-percent"),
    risk: root.querySelector("#caffeine-risk"),
    time: root.querySelector("#caffeine-time"),
    detail: root.querySelector("#caffeine-detail")
  };

  const update = () => {
    const result = calculateCaffeineSleep({
      caffeineMg: getFormNumber(form, "caffeineMg", 120),
      consumedAt: form.elements.consumedAt.value,
      bedtime: form.elements.bedtime.value,
      halfLifeHours: getFormNumber(form, "halfLifeHours", 5)
    });
    renderCaffeineSleep(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateCaffeineSleep(values) {
  const caffeineMg = Math.max(0, values.caffeineMg);
  const halfLifeHours = Math.max(1, values.halfLifeHours);
  const hoursUntilBed = getHoursBetween(values.consumedAt, values.bedtime);
  const remainingMg = caffeineMg * Math.pow(0.5, hoursUntilBed / halfLifeHours);
  const remainingPercent = caffeineMg ? remainingMg / caffeineMg * 100 : 0;
  const risk = remainingMg >= 80 ? "높음" : remainingMg >= 35 ? "보통" : "낮음";
  return { caffeineMg, hoursUntilBed, remainingMg, remainingPercent, risk };
}

function renderCaffeineSleep(els, result) {
  els.remaining.textContent = `${Math.round(result.remainingMg).toLocaleString("ko-KR")}mg`;
  els.percent.textContent = `${Math.round(result.remainingPercent)}%`;
  els.risk.textContent = result.risk;
  els.time.textContent = `${round(result.hoursUntilBed, 1)}시간`;
  els.detail.textContent = `반감기를 기준으로 취침 시점에 남아 있을 카페인을 추정했습니다. 사람마다 민감도와 대사 속도는 다릅니다.`;
}

function getHoursBetween(start, end) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let diff = (endHour + endMinute / 60) - (startHour + startMinute / 60);
  if (diff < 0) diff += 24;
  return diff;
}

function round(value, digits = 0) {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}
