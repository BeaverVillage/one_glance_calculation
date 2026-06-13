import { formatWon, getFormNumber } from "./utils.js";

export function initWeeklyHolidayPayCalculator(root = document) {
  const form = root.querySelector("#weekly-holiday-pay-form");
  if (!form) return;

  const els = {
    weekly: root.querySelector("#weekly-holiday-pay-result"),
    monthly: root.querySelector("#weekly-holiday-monthly"),
    hours: root.querySelector("#weekly-holiday-hours"),
    total: root.querySelector("#weekly-holiday-total"),
    detail: root.querySelector("#weekly-holiday-detail")
  };

  const update = () => {
    const result = calculateWeeklyHolidayPay({
      hourlyWage: getFormNumber(form, "hourlyWage", 10030),
      weeklyHours: getFormNumber(form, "weeklyHours", 20),
      workingWeeks: getFormNumber(form, "workingWeeks", 4.345),
      fullAttendance: form.elements.fullAttendance.checked
    });
    renderWeeklyHolidayPay(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateWeeklyHolidayPay(values) {
  const hourlyWage = Math.max(0, values.hourlyWage);
  const weeklyHours = Math.max(0, values.weeklyHours);
  const eligible = values.fullAttendance && weeklyHours >= 15;
  const paidHolidayHours = eligible ? Math.min(8, weeklyHours / 40 * 8) : 0;
  const weeklyPay = paidHolidayHours * hourlyWage;
  const monthlyPay = weeklyPay * Math.max(0, values.workingWeeks);
  return {
    eligible,
    paidHolidayHours,
    weeklyPay,
    monthlyPay,
    weeklyTotalPay: weeklyHours * hourlyWage + weeklyPay
  };
}

function renderWeeklyHolidayPay(els, result) {
  els.weekly.textContent = formatWon(result.weeklyPay);
  els.monthly.textContent = formatWon(result.monthlyPay);
  els.hours.textContent = `${round(result.paidHolidayHours, 2)}시간`;
  els.total.textContent = formatWon(result.weeklyTotalPay);
  els.detail.textContent = result.eligible
    ? "1주 15시간 이상 근무하고 약정 근무일을 개근한 조건으로 계산했습니다."
    : "1주 15시간 미만이거나 개근 조건을 선택하지 않아 주휴수당을 0원으로 계산했습니다.";
}

function round(value, digits = 0) {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}
