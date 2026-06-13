export function formatWon(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function roundTo(value, unit = 10000) {
  return Math.round(value / unit) * unit;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getFormNumber(form, name, fallback) {
  const value = Number(new FormData(form).get(name));
  return Number.isFinite(value) ? value : fallback;
}

export function getCheckedValue(form, name, fallback) {
  return new FormData(form).get(name) || fallback;
}

export function monthLabel(monthString) {
  const [, month] = monthString.split("-");
  return `${Number(month)}월`;
}

export function addMonths(monthString, amount) {
  const [year, month] = monthString.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
