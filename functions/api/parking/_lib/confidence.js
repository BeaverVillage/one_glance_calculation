export function calculateConfidence(lot, realtime = null) {
  let score = 0;
  const missing = [];
  if (lot.lat && lot.lng) score += 2; else missing.push('좌표');
  if (lot.baseMinutes != null && lot.baseFee != null && lot.feeType) score += 2; else missing.push('요금');
  if (lot.weekdayOpen || lot.saturdayOpen || lot.holidayOpen) score += 1; else missing.push('운영시간');
  if (lot.dataDate) score += 1; else missing.push('기준일');
  if (realtime) score += 2;
  if (score >= 7) return { level: 'high', label: '신뢰도 높음 · 기준일 ' + (lot.dataDate || '확인 필요'), missing };
  if (score >= 4) return { level: 'medium', label: realtime ? '신뢰도 보통 · 일부 정보 확인 필요' : '신뢰도 보통', missing };
  return { level: 'low', label: '신뢰도 낮음 · ' + (missing.length ? missing.join(', ') + ' 일부 누락' : '현장 확인 필요'), missing };
}
