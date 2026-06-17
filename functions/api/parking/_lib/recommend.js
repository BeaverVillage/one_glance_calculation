import { distanceKm, estimateDrivingMinutes } from './distance.js';
import { estimateParkingFee } from './fee.js';
import { calculateFullRisk } from './risk.js';
import { calculateConfidence } from './confidence.js';
export function enrichLots({ lots, realtimeStatuses = [], routeEstimates = [], destination, origin, input }) {
  const realtimeMap = new Map(realtimeStatuses.map((item) => [item.parkingLotId, item]));
  const routeMap = new Map(routeEstimates.map((item) => [item.parkingLotId, item]));
  return lots.map((lot) => {
    const realtime = realtimeMap.get(lot.id) || null;
    const route = routeMap.get(lot.id) || null;
    const fee = estimateParkingFee(lot, input);
    const walkKm = destination ? distanceKm(destination, lot) : null;
    const driveKm = origin ? distanceKm(origin, lot) : walkKm;
    const fallbackDistanceKm = driveKm == null ? null : Math.round(driveKm * 10) / 10;
    const fallbackMinutes = driveKm == null ? null : estimateDrivingMinutes(driveKm);
    const drivingDistanceKm = route?.distanceKm ?? fallbackDistanceKm;
    const drivingMinutes = route?.durationMinutes ?? fallbackMinutes;
    const risk = calculateFullRisk(lot, realtime, input.arrivalAt);
    const dataConfidence = calculateConfidence(lot, realtime);
    const score = scoreLot({ lot, fee, drivingMinutes, risk, dataConfidence });
    const hasDiscountBenefit = Boolean(Number(lot.compactDiscountRate) || Number(lot.disabledDiscountRate) || Number(lot.evDiscountRate) || Number(input.manualDiscountRate));
    return { ...lot, ...fee, hasDiscountBenefit, distanceFromDestinationKm: walkKm == null ? null : Math.round(walkKm * 10) / 10, drivingMinutes, drivingDistanceKm, drivingMode: route?.mode || (origin ? 'distance-fallback' : 'destination-distance'), drivingSource: route?.source || (origin ? '거리 기반 추정' : '목적지 거리 기준'), drivingNote: route?.note || '', realtimeAvailable: realtime?.availableSpaces ?? null, realtimeCapacity: realtime?.totalSpaces ?? lot.capacity ?? null, realtimeObservedAt: realtime?.observedAt ?? null, fullRisk: risk.level, fullRiskLabel: risk.label, fullRiskReason: risk.reason, dataConfidence: dataConfidence.level, dataConfidenceLabel: dataConfidence.label, score };
  });
}
function scoreLot({ lot, fee, drivingMinutes, risk, dataConfidence }) {
  let score = 50;
  if (fee.discountedFee != null) score += Math.max(0, 30 - fee.discountedFee / 1000);
  if (drivingMinutes != null) score += Math.max(0, 20 - drivingMinutes);
  if (risk.level === 'low') score += 12;
  if (risk.level === 'medium') score += 4;
  if (risk.level === 'high') score -= 10;
  if (dataConfidence.level === 'high') score += 10;
  if (dataConfidence.level === 'low') score -= 8;
  if (lot.publicPrivateType === '공영') score += 5;
  if (lot.feeType === '무료') score += 12;
  if (!fee.isOpen) score -= 15;
  return Math.round(Math.max(0, Math.min(100, score)));
}
export function applyFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (filters.publicOnly && row.publicPrivateType !== '공영') return false;
    if (filters.freeOnly && !row.isFree) return false;
    if (filters.dayPassOnly && !(Number(row.dayPassFee) > 0)) return false;
    if (filters.realtimeOnly && row.realtimeAvailable == null) return false;
    if (filters.lowRiskOnly && row.fullRisk !== 'low') return false;
    if (filters.openOnly && !row.isOpen) return false;
    if (filters.discountOnly && !row.hasDiscountBenefit) return false;
    return true;
  });
}
export function sortRows(rows, sort = 'recommended') {
  const list = [...rows];
  if (sort === 'cheap') return list.sort((a, b) => valueOrMax(a.discountedFee) - valueOrMax(b.discountedFee));
  if (sort === 'drive') return list.sort((a, b) => valueOrMax(a.drivingMinutes) - valueOrMax(b.drivingMinutes));
  if (sort === 'available') return list.sort((a, b) => (b.realtimeAvailable ?? -1) - (a.realtimeAvailable ?? -1));
  if (sort === 'confidence') return list.sort((a, b) => confidenceValue(b.dataConfidence) - confidenceValue(a.dataConfidence));
  return list.sort((a, b) => b.score - a.score);
}
function valueOrMax(value) { return value == null ? Number.MAX_SAFE_INTEGER : Number(value); }
function confidenceValue(value) { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
