import { formatWon, getFormNumber } from "./utils.js";

export function initEvCostCalculator(root = document) {
  const form = root.querySelector("#ev-cost-form");
  if (!form) return;

  const els = {
    evCost: root.querySelector("#ev-monthly-cost"),
    fuelCost: root.querySelector("#fuel-monthly-cost"),
    savings: root.querySelector("#ev-monthly-savings"),
    summary: root.querySelector("#ev-cost-summary"),
    evPer100: root.querySelector("#ev-per-100km"),
    fuelPer100: root.querySelector("#fuel-per-100km"),
    evEnergy: root.querySelector("#ev-energy-used"),
    fuelUsed: root.querySelector("#fuel-used")
  };

  const update = () => {
    const values = readEvForm(form);
    const result = calculateEvVsFuel(values);
    renderEvResult(els, result, values);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function calculateEvVsFuel(values) {
  const distanceKm = clamp(values.distanceKm, 0, 100000);
  const evEfficiency = Math.max(0.1, values.evEfficiency);
  const chargePrice = Math.max(0, values.chargePrice);
  const chargingLossRate = clamp(values.chargingLossRate, 0, 50) / 100;
  const fuelEfficiency = Math.max(0.1, values.fuelEfficiency);
  const fuelPrice = Math.max(0, values.fuelPrice);

  const evEnergyKwh = distanceKm / evEfficiency * (1 + chargingLossRate);
  const evCost = evEnergyKwh * chargePrice;
  const fuelLiters = distanceKm / fuelEfficiency;
  const fuelCost = fuelLiters * fuelPrice;

  const evCostPer100Km = evCost / Math.max(1, distanceKm) * 100;
  const fuelCostPer100Km = fuelCost / Math.max(1, distanceKm) * 100;

  return {
    evEnergyKwh,
    evCost,
    fuelLiters,
    fuelCost,
    savings: fuelCost - evCost,
    evCostPer100Km,
    fuelCostPer100Km
  };
}

function readEvForm(form) {
  return {
    distanceKm: getFormNumber(form, "distanceKm", 1000),
    evEfficiency: getFormNumber(form, "evEfficiency", 5.5),
    chargePrice: getFormNumber(form, "chargePrice", 350),
    chargingLossRate: getFormNumber(form, "chargingLossRate", 10),
    fuelEfficiency: getFormNumber(form, "fuelEfficiency", 12),
    fuelPrice: getFormNumber(form, "fuelPrice", 1700)
  };
}

function renderEvResult(els, result, values) {
  els.evCost.textContent = formatWon(result.evCost);
  els.fuelCost.textContent = formatWon(result.fuelCost);
  els.savings.textContent = result.savings >= 0
    ? `${formatWon(result.savings)} 절약`
    : `${formatWon(Math.abs(result.savings))} 더 듦`;
  els.summary.textContent = `${values.distanceKm.toLocaleString("ko-KR")}km 주행 기준으로 비교했습니다.`;
  els.evPer100.textContent = formatWon(result.evCostPer100Km);
  els.fuelPer100.textContent = formatWon(result.fuelCostPer100Km);
  els.evEnergy.textContent = `${round(result.evEnergyKwh, 1).toLocaleString("ko-KR")}kWh`;
  els.fuelUsed.textContent = `${round(result.fuelLiters, 1).toLocaleString("ko-KR")}L`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 0) {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}
