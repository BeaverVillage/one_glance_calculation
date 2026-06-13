import { getFormNumber } from "./utils.js";

export function initPercentileCalculator(root = document) {
  const form = root.querySelector("#percentile-form");
  if (!form) return;

  const els = {
    topPercent: root.querySelector("#percentile-top"),
    rank: root.querySelector("#percentile-rank"),
    zScore: root.querySelector("#percentile-z"),
    below: root.querySelector("#percentile-below"),
    detail: root.querySelector("#percentile-detail")
  };

  const update = () => {
    const result = calculatePercentile({
      score: getFormNumber(form, "score", 85),
      mean: getFormNumber(form, "mean", 70),
      stdDev: getFormNumber(form, "stdDev", 12),
      students: getFormNumber(form, "students", 120)
    });
    renderPercentile(els, result);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  update();
}

export function calculatePercentile(values) {
  const stdDev = Math.max(0.0001, values.stdDev);
  const students = Math.max(1, Math.round(values.students));
  const zScore = (values.score - values.mean) / stdDev;
  const belowPercent = normalCdf(zScore) * 100;
  const topPercent = Math.max(0, 100 - belowPercent);
  const expectedRank = Math.min(students, Math.max(1, Math.ceil(students * topPercent / 100)));
  return { zScore, belowPercent, topPercent, expectedRank, students };
}

function renderPercentile(els, result) {
  els.topPercent.textContent = `상위 ${formatPercent(result.topPercent)}`;
  els.rank.textContent = `${result.expectedRank.toLocaleString("ko-KR")}등 전후`;
  els.zScore.textContent = result.zScore.toFixed(2);
  els.below.textContent = `${formatPercent(result.belowPercent)} 이하`;
  els.detail.textContent = `정규분포를 가정해 ${result.students.toLocaleString("ko-KR")}명 중 예상 등수를 계산했습니다. 실제 분포가 치우쳐 있으면 달라질 수 있습니다.`;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = Math.sign(x) || 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function formatPercent(value) {
  return `${Math.max(0, value).toFixed(value < 10 ? 1 : 0)}%`;
}
