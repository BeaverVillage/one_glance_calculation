import { formatWon, getFormNumber } from "./utils.js";

const SURCHARGE_FACTOR = 1.137;

export function initApplianceElectricityCalculator(root = document) {
  const form = root.querySelector("#appliance-electricity-form");
  if (!form) return;

  const els = {
    monthlyCost: root.querySelector("#appliance-monthly-cost"),
    monthlyKwh: root.querySelector("#appliance-monthly-kwh"),
    annualCost: root.querySelector("#appliance-annual-cost"),
    dailyCost: root.querySelector("#appliance-daily-cost"),
    summary: root.querySelector("#appliance-summary"),
    runningCost: root.querySelector("#appliance-running-cost"),
    standbyCost: root.querySelector("#appliance-standby-cost")
  };

  const update = () => {
    const values = readApplianceForm(form);
    const result = calculateApplianceElectricity(values);
    renderApplianceResult(els, result, values);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateApplianceElectricity(values) {
  const powerW = Math.max(0, values.powerW);
  const hoursPerDay = clamp(values.hoursPerDay, 0, 24);
  const daysPerMonth = clamp(values.daysPerMonth, 1, 31);
  const standbyW = Math.max(0, values.standbyW);
  const unitPrice = Math.max(0, values.unitPrice);

  const runningKwh = powerW * hoursPerDay * daysPerMonth / 1000;
  const standbyKwh = standbyW * 24 * daysPerMonth / 1000;
  const monthlyKwh = runningKwh + standbyKwh;
  const rawCost = monthlyKwh * unitPrice;
  const monthlyCost = values.includeSurcharges ? rawCost * SURCHARGE_FACTOR : rawCost;

  return {
    runningKwh,
    standbyKwh,
    monthlyKwh,
    runningCost: runningKwh * unitPrice * (values.includeSurcharges ? SURCHARGE_FACTOR : 1),
    standbyCost: standbyKwh * unitPrice * (values.includeSurcharges ? SURCHARGE_FACTOR : 1),
    monthlyCost,
    dailyCost: monthlyCost / daysPerMonth,
    annualCost: monthlyCost * 12
  };
}

function readApplianceForm(form) {
  return {
    powerW: getFormNumber(form, "powerW", 800),
    hoursPerDay: getFormNumber(form, "hoursPerDay", 4),
    daysPerMonth: getFormNumber(form, "daysPerMonth", 30),
    standbyW: getFormNumber(form, "standbyW", 1),
    unitPrice: getFormNumber(form, "unitPrice", 220),
    includeSurcharges: form.elements.includeSurcharges.checked
  };
}

function renderApplianceResult(els, result, values) {
  els.monthlyCost.textContent = formatWon(result.monthlyCost);
  els.monthlyKwh.textContent = `${round(result.monthlyKwh, 1).toLocaleString("ko-KR")}kWh`;
  els.annualCost.textContent = formatWon(result.annualCost);
  els.dailyCost.textContent = formatWon(result.dailyCost);
  els.summary.textContent = `${values.powerW.toLocaleString("ko-KR")}W 제품을 하루 ${values.hoursPerDay}시간 사용하는 조건입니다.`;
  els.runningCost.textContent = formatWon(result.runningCost);
  els.standbyCost.textContent = formatWon(result.standbyCost);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 0) {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}
