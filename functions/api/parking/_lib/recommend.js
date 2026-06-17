import { distanceKm } from './distance.js';
import { estimateParkingFee } from './fee.js';
import { calculateFullRisk } from './risk.js';
import { calculateConfidence } from './confidence.js';

const RECOMMENDATION_PROFILES = {
  recommended: { label: '추천순', fee: 1, near: 0.7, risk: 1, confidence: 1, public: 1 },
  cheap: { label: '저렴한순', fee: 1.8, near: 0.35, risk: 0.6, confidence: 0.5, public: 0.8 },
  nearby: { label: '가까운순', fee: 0.45, near: 1.8, risk: 0.55, confidence: 0.45, public: 0.5 },
  available: { label: '빈자리순', fee: 0.7, near: 0.45, risk: 1.6, confidence: 0.65, public: 0.7 },
  confidence: { label: '신뢰도순', fee: 0.65, near: 0.45, risk: 0.8, confidence: 1.8, public: 0.7 }
};

export function enrichLots({ lots, realtimeStatuses = [], destination, input }) {
  const realtimeMap = new Map(realtimeStatuses.map((item) => [item.parkingLotId, item]));
  return lots.map((lot) => {
    const realtime = realtimeMap.get(lot.id) || null;
    const fee = estimateParkingFee(lot, input);
    const distanceFromDestinationKm = destination ? Math.round(distanceKm(destination, lot) * 10) / 10 : null;
    const risk = calculateFullRisk(lot, realtime, input.arrivalAt);
    const dataConfidence = calculateConfidence(lot, realtime);
    const scoreInfo = scoreLot({ lot, fee, risk, dataConfidence, mode: input.sort, distanceFromDestinationKm, filters: input.filters });
    const hasDiscountBenefit = Boolean(Number(lot.compactDiscountRate) || Number(lot.disabledDiscountRate) || Number(lot.evDiscountRate) || Number(input.manualDiscountRate));
    return {
      ...lot,
      ...fee,
      hasDiscountBenefit,
      distanceFromDestinationKm,
      realtimeAvailable: realtime?.availableSpaces ?? null,
      realtimeCapacity: realtime?.totalSpaces ?? lot.capacity ?? null,
      realtimeObservedAt: realtime?.observedAt ?? null,
      fullRisk: risk.level,
      fullRiskLabel: risk.label,
      fullRiskReason: risk.reason,
      dataConfidence: dataConfidence.level,
      dataConfidenceLabel: dataConfidence.label,
      score: scoreInfo.score,
      scoreMode: scoreInfo.mode,
      scoreReason: scoreInfo.reason
    };
  });
}

function scoreLot({ lot, fee, risk, dataConfidence, mode = 'recommended', distanceFromDestinationKm = null, filters = {} }) {
  const feeScore = fee.discountedFee == null ? 18 : Math.max(0, 42 - fee.discountedFee / 800);
  const nearScore = distanceFromDestinationKm == null ? 8 : Math.max(0, 30 - distanceFromDestinationKm * 9);
  const riskScore = risk.level === 'low' ? 14 : risk.level === 'medium' ? 6 : risk.level === 'high' ? -12 : 0;
  const confidenceScore = dataConfidence.level === 'high' ? 11 : dataConfidence.level === 'medium' ? 5 : -6;
  const openPenalty = fee.isOpen ? 0 : -16;
  const publicBonus = lot.publicPrivateType === '공영' ? (filters?.publicOnly ? 10 : 5) : 0;
  const freeBonus = lot.feeType === '무료' ? 12 : 0;
  const profile = RECOMMENDATION_PROFILES[mode] || RECOMMENDATION_PROFILES.recommended;
  const score = 20
    + feeScore * profile.fee
    + nearScore * profile.near
    + riskScore * profile.risk
    + confidenceScore * profile.confidence
    + publicBonus * profile.public
    + freeBonus
    + openPenalty;
  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    mode: profile.label,
    reason: scoreReasonFor(mode, fee, distanceFromDestinationKm)
  };
}

function scoreReasonFor(mode, fee, distanceFromDestinationKm) {
  if (mode === 'cheap') return `저렴한순 기준에서 ${formatFee(fee.discountedFee)} 후보입니다.`;
  if (mode === 'nearby') return distanceFromDestinationKm == null ? '거리 정보가 부족해 기본 추천 기준을 함께 봅니다.' : `가까운순 기준에서 목적지에서 약 ${formatDistance(distanceFromDestinationKm)} 후보입니다.`;
  if (mode === 'available') return '빈자리순 기준에서 실시간 가능 대수와 만차 위험도를 더 크게 반영했습니다.';
  if (mode === 'confidence') return '신뢰도순 기준에서 요금 정보, 기준일, 실시간 정보 유무를 더 크게 반영했습니다.';
  return '요금, 직선거리, 만차 위험도, 데이터 신뢰도와 공영 여부를 함께 반영했습니다.';
}

export function applyFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (filters.publicOnly && row.publicPrivateType !== '공영') return false;
    if (filters.freeOnly && !row.isFree && row.discountedFee !== 0) return false;
    if (filters.dayPassOnly && !row.dayPassFee) return false;
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
  if (sort === 'nearby') return list.sort((a, b) => valueOrMax(a.distanceFromDestinationKm) - valueOrMax(b.distanceFromDestinationKm));
  if (sort === 'available') return list.sort((a, b) => (b.realtimeAvailable ?? -1) - (a.realtimeAvailable ?? -1));
  if (sort === 'confidence') return list.sort((a, b) => confidenceValue(b.dataConfidence) - confidenceValue(a.dataConfidence));
  return list.sort((a, b) => b.score - a.score);
}

function valueOrMax(value) { return value == null ? Number.MAX_SAFE_INTEGER : Number(value); }
function formatFee(value) { return value == null ? '정보 없음' : `${Math.round(value).toLocaleString('ko-KR')}원`; }
function formatDistance(km) { return km == null ? '거리 정보 없음' : km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`; }
function confidenceValue(value) { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
