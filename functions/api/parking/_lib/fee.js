import { isOpenDuring } from './holidays.js';
export function durationMinutes(arrivalAt, departureAt) {
  const start = new Date(arrivalAt);
  const end = new Date(departureAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = Math.round((end - start) / 60000);
  return minutes > 0 ? minutes : null;
}
export function getDiscountRate(lot, vehicleType = 'general', manualDiscountRate = null) {
  if (vehicleType === 'manual') return clampRate(manualDiscountRate);
  if (vehicleType === 'compact') return clampRate(lot.compactDiscountRate ?? 50);
  if (vehicleType === 'disabled') return clampRate(lot.disabledDiscountRate ?? 50);
  if (vehicleType === 'ev') return clampRate(lot.evDiscountRate ?? 50);
  return 0;
}
function clampRate(value) { const number = Number(value); return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0; }
export function calculateTimeFee(lot, minutes) {
  if (lot.feeType === '무료' || (lot.baseFee === 0 && lot.additionalFee === 0)) return 0;
  const baseMinutes = Number(lot.baseMinutes);
  const baseFee = Number(lot.baseFee);
  const addMinutes = Number(lot.additionalMinutes);
  const addFee = Number(lot.additionalFee);
  if (!Number.isFinite(baseMinutes) || !Number.isFinite(baseFee)) return null;
  if (minutes <= baseMinutes) return baseFee;
  if (!Number.isFinite(addMinutes) || addMinutes <= 0 || !Number.isFinite(addFee)) return null;
  return baseFee + Math.ceil((minutes - baseMinutes) / addMinutes) * addFee;
}
export function calculateDayPassBetterAfterMinutes(lot) {
  const dayPassFee = Number(lot.dayPassFee);
  if (!Number.isFinite(dayPassFee) || dayPassFee <= 0) return null;
  for (let minutes = 10; minutes <= 1440; minutes += 5) {
    const timeFee = calculateTimeFee(lot, minutes);
    if (timeFee != null && timeFee >= dayPassFee) return minutes;
  }
  return null;
}
export function estimateParkingFee(lot, input) {
  const minutes = durationMinutes(input.arrivalAt, input.departureAt);
  if (!minutes) return { parkingLotId: lot.id, parkingFee: null, discountedFee: null, durationMinutes: null, confidence: 'low', isOpen: false, reason: '출차 시간이 입차 시간보다 늦어야 합니다.' };
  const openInfo = isOpenDuring(lot, input.arrivalAt, input.departureAt, input.holidayContext || null);
  const timeFee = calculateTimeFee(lot, minutes);
  const dayPassFee = Number(lot.dayPassFee);
  const hasDayPass = Number.isFinite(dayPassFee) && dayPassFee > 0;
  const parkingFee = timeFee == null ? null : hasDayPass ? Math.min(timeFee, dayPassFee) : timeFee;
  const discountRate = getDiscountRate(lot, input.vehicleType, input.manualDiscountRate);
  const discountedFee = parkingFee == null ? null : Math.max(0, Math.round((parkingFee * (1 - discountRate / 100)) / 10) * 10);
  return { parkingLotId: lot.id, parkingFee, discountedFee, durationMinutes: minutes, dayPassBetterAfterMinutes: calculateDayPassBetterAfterMinutes(lot), isOpen: openInfo.isOpen, openReason: openInfo.reason, openWindow: openInfo, openDayType: openInfo.dayType, openDayTypeLabel: openInfo.dayTypeLabel, holidayName: openInfo.holidayName || '', isFree: parkingFee === 0, discountRate, confidence: parkingFee == null ? 'low' : 'medium' };
}
