import { addMonths, clamp, roundTo } from "./utils.js";

const CONDITION_RULES = {
  s: { label: "S급", factor: 1.03, note: "외관 감가가 거의 없는 상태로 봅니다." },
  a: { label: "A급", factor: 1, note: "일반적인 중고 상태로 봅니다." },
  b: { label: "B급", factor: 0.93, note: "생활기스와 사용감으로 감가를 반영합니다." },
  c: { label: "C급", factor: 0.85, note: "찍힘이나 큰 흠집으로 감가를 크게 반영합니다." }
};

const REPAIR_RULES = {
  none: { label: "수리 이력 없음", factor: 1, note: "수리 이력 감가가 없습니다." },
  official: { label: "공식 수리", factor: 0.97, note: "공식 수리 이력은 소폭 감가로 봅니다." },
  thirdParty: { label: "사설 수리", factor: 0.9, note: "사설 수리 이력은 구매자 불안 요인으로 봅니다." }
};

const LAUNCH_MONTHS = {
  iphone: 9,
  galaxy: 1
};

export function getModelFamily(modelId) {
  return modelId.startsWith("iphone") ? "iphone" : "galaxy";
}

export function batteryFactor(battery) {
  if (battery >= 90) return { factor: 1, label: "양호", note: "배터리 성능이 양호합니다." };
  if (battery >= 85) return { factor: 0.97, label: "주의", note: "85% 근처라 구매자가 감가를 요구할 수 있습니다." };
  if (battery >= 80) return { factor: 0.93, label: "감가", note: "배터리 교체를 고려하는 구매자가 많아지는 구간입니다." };
  return { factor: 0.86, label: "큰 감가", note: "80% 미만은 교체 비용을 가격에 반영하는 편이 안전합니다." };
}

export function accessoryFactor(values) {
  let factor = 1;
  const notes = [];
  if (values.box) {
    factor += 0.015;
    notes.push("박스 보유");
  }
  if (values.charger) {
    factor += 0.01;
    notes.push("충전 구성품 보유");
  }
  if (values.receipt) {
    factor += 0.02;
    notes.push("구매 증빙 가능");
  }
  return {
    factor,
    label: notes.length ? notes.join(", ") : "추가 구성품 없음",
    note: notes.length ? "구성품 보유로 소폭 가산합니다." : "구성품 가산은 적용하지 않습니다."
  };
}

export function monthsUntilLaunch(family, today = new Date()) {
  const targetMonth = LAUNCH_MONTHS[family] ?? 9;
  let targetYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  if (currentMonth > targetMonth) targetYear += 1;
  return (targetYear - today.getFullYear()) * 12 + targetMonth - currentMonth;
}

export function releaseRisk(family, today = new Date()) {
  const months = monthsUntilLaunch(family, today);
  if (months <= 1) return { level: "high", monthlyDrop: 0.055, note: "신제품 발표가 가까워 단기 하락 위험이 큽니다." };
  if (months <= 3) return { level: "medium", monthlyDrop: 0.04, note: "신제품 발표 전 매각 수요가 늘 수 있는 구간입니다." };
  return { level: "normal", monthlyDrop: 0.025, note: "신제품 발표 영향은 아직 크지 않은 구간입니다." };
}

export function calculateReport(model, formValues, today = new Date()) {
  const base = model.current.basePrice;
  const currentRange = model.current.expectedRange;
  const condition = CONDITION_RULES[formValues.condition] ?? CONDITION_RULES.a;
  const repair = REPAIR_RULES[formValues.repair] ?? REPAIR_RULES.none;
  const battery = batteryFactor(formValues.battery);
  const accessories = accessoryFactor(formValues.accessories);
  const family = getModelFamily(model.id);
  const risk = releaseRisk(family, today);

  const rawPrice = base * condition.factor * repair.factor * battery.factor * accessories.factor;
  const estimate = roundTo(rawPrice);
  const low = roundTo(currentRange.low * condition.factor * repair.factor * battery.factor);
  const high = roundTo(currentRange.high * condition.factor * repair.factor * battery.factor * accessories.factor);

  const projected = buildProjection(model, estimate, risk.monthlyDrop);
  const lossInThreeMonths = Math.max(0, estimate - projected[projected.length - 1].price);
  const timingScore = scoreTiming({ battery: formValues.battery, conditionKey: formValues.condition, repairKey: formValues.repair, riskLevel: risk.level });
  const decision = buildDecision(timingScore, formValues.battery, risk);

  return {
    model,
    estimate,
    range: { low: Math.min(low, high), high: Math.max(low, high) },
    lossInThreeMonths,
    timingScore,
    decision,
    risk,
    factors: { condition, repair, battery, accessories },
    projection: projected
  };
}

function scoreTiming({ battery, conditionKey, repairKey, riskLevel }) {
  let score = 58;
  if (battery < 80) score += 20;
  else if (battery < 85) score += 15;
  else if (battery < 90) score += 8;

  if (conditionKey === "b") score += 5;
  if (conditionKey === "c") score += 9;
  if (repairKey === "thirdParty") score += 6;
  if (riskLevel === "high") score += 18;
  if (riskLevel === "medium") score += 11;

  return clamp(score, 0, 100);
}

function buildDecision(score, battery, risk) {
  if (score >= 78) {
    return {
      label: "지금 판매 유리",
      tone: "good",
      text: battery < 85
        ? "배터리 감가가 더 커지기 전에 판매하는 쪽이 유리합니다."
        : risk.note
    };
  }
  if (score >= 64) {
    return {
      label: "1~2개월 안에 검토",
      tone: "warn",
      text: "급하지 않다면 가격을 비교하면서 등록 시점을 잡는 편이 좋습니다."
    };
  }
  return {
    label: "급하지 않음",
    tone: "neutral",
    text: "상태가 무난한 편이라 급매보다 적정가 등록을 우선해도 됩니다."
  };
}

function buildProjection(model, estimate, monthlyDrop) {
  const points = [];
  const startMonth = model.current.month;
  points.push({
    month: startMonth,
    price: estimate,
    low: roundTo(estimate * 0.94),
    high: roundTo(estimate * 1.06),
    type: "adjusted"
  });

  for (let i = 1; i <= 3; i += 1) {
    const projectedPrice = roundTo(estimate * Math.pow(1 - monthlyDrop, i));
    points.push({
      month: addMonths(startMonth, i),
      price: projectedPrice,
      low: roundTo(projectedPrice * 0.94),
      high: roundTo(projectedPrice * 1.06),
      type: "projected"
    });
  }

  return points;
}
