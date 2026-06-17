export function calculateFullRisk(lot, realtime = null, arrivalAt = null) {
  if (realtime && Number.isFinite(Number(realtime.availableSpaces)) && Number.isFinite(Number(realtime.totalSpaces))) {
    const available = Number(realtime.availableSpaces);
    const total = Math.max(1, Number(realtime.totalSpaces));
    const occupancy = 1 - available / total;
    if (available <= 3 || occupancy >= 0.95) return { level: 'high', label: '만차 위험 높음', reason: '실시간 가능 대수가 매우 적습니다.' };
    if (available <= 10 || occupancy >= 0.85) return { level: 'medium', label: '만차 위험 보통', reason: '실시간 가능 대수가 많지 않습니다.' };
    return { level: 'low', label: '만차 위험 낮음', reason: '실시간 가능 대수 기준 여유가 있습니다.' };
  }
  let score = 0;
  if (Number(lot.capacity) <= 20) score += 2;
  if (lot.publicPrivateType === '무료') score += 2;
  if (lot.publicPrivateType === '공영') score += 1;
  if (arrivalAt) { const d = new Date(arrivalAt); const hour = d.getHours(); const day = d.getDay(); if ((day === 0 || day === 6) && hour >= 12 && hour <= 18) score += 1; }
  if (score >= 3) return { level: 'high', label: '만차 위험 높음', reason: '주차면수와 시간대 기준의 참고 추정입니다.' };
  if (score >= 1) return { level: 'medium', label: '만차 위험 보통', reason: '실시간 정보가 없어 참고 추정으로 표시합니다.' };
  return { level: 'unknown', label: '실시간 정보 없음', reason: '현장 상황 확인이 필요합니다.' };
}
