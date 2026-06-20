export function initPercentileCalculator(root = document) {
  const form = root.querySelector("#percentile-form");
  if (!form) return;

  const optionalToggle = root.querySelector("#exam-optional-toggle");
  const optionalPanel = root.querySelector("#exam-optional-panel");
  const exampleButton = root.querySelector("#percentile-example");
  const resultPanel = root.querySelector("#exam-result-panel");

  const els = {
    panel: resultPanel,
    topPercent: root.querySelector("#percentile-top"),
    rank: root.querySelector("#percentile-rank"),
    zScore: root.querySelector("#percentile-z"),
    below: root.querySelector("#percentile-below"),
    detail: root.querySelector("#percentile-detail"),
    badge: root.querySelector("#percentile-badge"),
    marker: root.querySelector("#percentile-marker"),
    markerLabel: root.querySelector("#percentile-marker-label"),
    positionNote: root.querySelector("#percentile-position-note"),
    ahead: root.querySelector("#percentile-ahead"),
    behind: root.querySelector("#percentile-behind"),
    targetGap: root.querySelector("#percentile-target-gap"),
    tierTable: root.querySelector("#percentile-tier-table"),
    metricCards: root.querySelectorAll("[data-exam-metric]")
  };

  const setOptionalPanel = (open) => {
    if (!optionalPanel || !optionalToggle) return;
    optionalPanel.toggleAttribute("hidden", !open);
    optionalToggle.setAttribute("aria-expanded", String(open));
    optionalToggle.textContent = open ? "추가 선택 입력 닫기" : "추가 선택 입력 열기";
  };

  optionalToggle?.addEventListener("click", () => {
    if (!optionalPanel) return;
    setOptionalPanel(optionalPanel.hasAttribute("hidden"));
  });

  exampleButton?.addEventListener("click", () => {
    setFormValue(form, "students", 320);
    setFormValue(form, "rank", 40);
    setFormValue(form, "targetPercent", 10);
    setFormValue(form, "tieMode", "simple");
    setFormValue(form, "tieCount", 1);
    setFormValue(form, "score", 85);
    setFormValue(form, "mean", 70);
    setFormValue(form, "stdDev", 12);
    const rankMode = form.querySelector('input[name="mode"][value="rank"]');
    if (rankMode) rankMode.checked = true;
    update({ scroll: true });
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      setOptionalPanel(false);
      update();
    }, 0);
  });

  const update = (options = {}) => {
    const values = readValues(form);
    const result = values.mode === "score"
      ? calculateScorePercentile(values)
      : calculateRankPercentile(values);
    renderPercentile(els, result);
    if (options.scroll && resultPanel) {
      resultPanel.focus({ preventScroll: true });
      resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update({ scroll: true });
  });
  form.addEventListener("input", () => update());
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target && target.name === "mode" && target.value === "score") {
      setOptionalPanel(true);
    }
    update();
  });
  update();
}

function readValues(form) {
  const data = new FormData(form);
  const checkedMode = form.querySelector('input[name="mode"]:checked');
  return {
    mode: checkedMode?.value || "rank",
    rank: parseOptionalNumber(data.get("rank")),
    students: parseOptionalNumber(data.get("students")),
    targetPercent: parseOptionalNumber(data.get("targetPercent")),
    tieMode: String(data.get("tieMode") || "simple"),
    tieCount: parseOptionalNumber(data.get("tieCount")),
    score: parseOptionalNumber(data.get("score")),
    mean: parseOptionalNumber(data.get("mean")),
    stdDev: parseOptionalNumber(data.get("stdDev"))
  };
}

export function calculateRankPercentile(values) {
  const validation = validateRankInputs(values);
  if (!validation.ok) return buildInvalidResult("rank", validation.message);

  const students = validation.students;
  const rank = validation.rank;
  const targetPercent = validation.targetPercent;
  const tieCount = validation.tieCount;
  const tieMode = validation.tieMode;
  const tieRangeEnd = Math.min(students, rank + tieCount - 1);
  const effectiveRank = getEffectiveRank(rank, tieCount, tieMode, students);
  const topPercent = clamp((effectiveRank / students) * 100, 0, 100);
  const belowPercent = clamp(((students - effectiveRank) / students) * 100, 0, 100);
  const aheadCount = Math.max(0, rank - 1);
  const behindCount = Math.max(0, students - tieRangeEnd);
  const targetRank = rankForTopPercent(students, targetPercent);
  const targetGap = Math.ceil(effectiveRank) - targetRank;
  const tiers = buildTierRows(students, Math.ceil(effectiveRank));
  return {
    ok: true,
    mode: "rank",
    students,
    rank,
    effectiveRank,
    tieCount,
    tieMode,
    tieRangeEnd,
    topPercent,
    belowPercent,
    aheadCount,
    behindCount,
    targetPercent,
    targetRank,
    targetGap,
    tiers,
    band: classifyTopPercent(topPercent),
    zScore: null,
    notice: buildTieNotice(rank, tieCount, tieMode, tieRangeEnd)
  };
}

export function calculateScorePercentile(values) {
  const validation = validateScoreInputs(values);
  if (!validation.ok) return buildInvalidResult("score", validation.message);

  const students = validation.students;
  const targetPercent = validation.targetPercent;
  const zScore = (validation.score - validation.mean) / validation.stdDev;
  const belowPercent = clamp(normalCdf(zScore) * 100, 0, 100);
  const topPercent = clamp(100 - belowPercent, 0, 100);
  const rank = clamp(Math.ceil(students * topPercent / 100), 1, students);
  const aheadCount = Math.max(0, rank - 1);
  const behindCount = Math.max(0, students - rank);
  const targetRank = rankForTopPercent(students, targetPercent);
  const targetGap = rank - targetRank;
  return {
    ok: true,
    mode: "score",
    students,
    rank,
    effectiveRank: rank,
    tieCount: 1,
    tieMode: "score",
    tieRangeEnd: rank,
    topPercent,
    belowPercent,
    aheadCount,
    behindCount,
    targetPercent,
    targetRank,
    targetGap,
    tiers: buildTierRows(students, rank),
    band: classifyTopPercent(topPercent),
    zScore,
    notice: "점수·분포 기준은 정규분포를 가정한 참고 계산입니다. 실제 성적 분포와 다를 수 있습니다."
  };
}

function renderPercentile(els, result) {
  if (!els.topPercent) return;
  if (!result.ok) {
    renderInvalid(els, result);
    return;
  }

  els.topPercent.textContent = `상위 ${formatPercent(result.topPercent)}`;
  els.rank.textContent = result.mode === "score"
    ? `${result.rank.toLocaleString("ko-KR")}등 전후`
    : formatRankLabel(result);
  els.zScore.textContent = result.zScore === null ? tieModeLabel(result.tieMode) : result.zScore.toFixed(2);
  els.below.textContent = `약 ${formatPercent(result.belowPercent)}`;
  els.ahead.textContent = `${result.aheadCount.toLocaleString("ko-KR")}명`;
  els.behind.textContent = `${result.behindCount.toLocaleString("ko-KR")}명`;
  els.targetGap.textContent = formatTargetGap(result);
  els.detail.textContent = buildDetail(result);
  if (els.badge) {
    els.badge.textContent = result.band.label;
    els.badge.className = `exam-rank-badge ${result.band.tone}`;
  }
  if (els.panel) {
    els.panel.dataset.tone = result.band.tone;
    els.panel.classList.add("is-calculated");
  }
  const markerPercent = Math.min(99, Math.max(1, result.topPercent));
  const markerLeft = `${markerPercent}%`;
  if (els.marker) {
    els.marker.style.left = markerLeft;
    els.marker.setAttribute("aria-label", `현재 위치 상위 ${formatPercent(result.topPercent)}`);
  }
  if (els.markerLabel) {
    els.markerLabel.style.left = markerLeft;
    els.markerLabel.textContent = `현재 ${formatPercent(result.topPercent)}`;
    els.markerLabel.dataset.edge = result.topPercent <= 2 ? "start" : result.topPercent >= 98 ? "end" : "middle";
  }
  if (els.positionNote) {
    els.positionNote.textContent = buildPositionNote(result);
  }
  updateMetricCardStatuses(els.metricCards, result);
  renderTierTable(els.tierTable, result.tiers);
}

function renderInvalid(els, result) {
  els.topPercent.textContent = "입력값 확인";
  els.rank.textContent = "-";
  els.zScore.textContent = "-";
  els.below.textContent = "-";
  els.ahead.textContent = "-";
  els.behind.textContent = "-";
  els.targetGap.textContent = "-";
  els.detail.textContent = result.message;
  if (els.badge) {
    els.badge.textContent = "확인 필요";
    els.badge.className = "exam-rank-badge muted";
  }
  if (els.panel) {
    els.panel.dataset.tone = "muted";
    els.panel.classList.remove("is-calculated");
  }
  if (els.marker) {
    els.marker.style.left = "50%";
    els.marker.setAttribute("aria-label", "입력값 확인 필요");
  }
  if (els.markerLabel) {
    els.markerLabel.style.left = "50%";
    els.markerLabel.textContent = "입력 확인";
    els.markerLabel.dataset.edge = "middle";
  }
  if (els.positionNote) {
    els.positionNote.textContent = "입력값을 확인하면 현재 위치와 목표 구간 차이가 표시됩니다.";
  }
  resetMetricCardStatuses(els.metricCards);
  if (els.tierTable) {
    els.tierTable.innerHTML = `<div class="exam-tier-row exam-tier-row--wide"><span>입력값 확인</span><strong>${escapeHtml(result.message)}</strong></div>`;
  }
}

function buildPositionNote(result) {
  const targetText = result.targetGap > 0
    ? `목표 상위 ${formatPercent(result.targetPercent)}까지는 약 ${result.targetGap.toLocaleString("ko-KR")}등 차이입니다.`
    : `목표 상위 ${formatPercent(result.targetPercent)} 기준 안에 들어갑니다.`;
  return `현재 위치는 상위 ${formatPercent(result.topPercent)} 지점입니다. ${targetText} 아래 구간표에서 주요 기준 등수를 함께 확인하세요.`;
}

function updateMetricCardStatuses(cards, result) {
  if (!cards) return;
  cards.forEach((card) => {
    const metric = card.dataset.examMetric;
    card.classList.remove("is-target-met", "is-target-gap", "is-current", "is-reference");
    if (metric === "target") {
      const isMet = result.targetGap <= 0;
      card.dataset.status = isMet ? "목표 안쪽" : "차이";
      card.classList.add(isMet ? "is-target-met" : "is-target-gap");
      return;
    }
    if (metric === "rank") {
      card.dataset.status = result.mode === "score" ? "예상" : "현재";
      card.classList.add("is-current");
      return;
    }
    if (metric === "correction") {
      card.dataset.status = result.mode === "score" ? "분포" : "기준";
      card.classList.add("is-reference");
      return;
    }
    if (metric === "below") {
      card.dataset.status = "참고";
      card.classList.add("is-reference");
      return;
    }
    card.dataset.status = "인원";
    card.classList.add("is-reference");
  });
}

function resetMetricCardStatuses(cards) {
  if (!cards) return;
  cards.forEach((card) => {
    card.dataset.status = card.dataset.examMetric === "target" ? "목표" : "확인";
    card.classList.remove("is-target-met", "is-target-gap", "is-current", "is-reference");
  });
}

function buildDetail(result) {
  const base = result.mode === "score"
    ? `점수·분포 기준으로 ${result.students.toLocaleString("ko-KR")}명 중 예상 위치를 계산했습니다.`
    : `전체 ${result.students.toLocaleString("ko-KR")}명 중 ${formatRankLabel(result)} 기준으로 계산했습니다.`;
  const bandText = result.band.summary;
  const targetText = result.targetGap > 0
    ? ` 목표 상위 ${formatPercent(result.targetPercent)} 기준인 ${result.targetRank.toLocaleString("ko-KR")}등 이내까지 약 ${result.targetGap.toLocaleString("ko-KR")}등 차이입니다.`
    : ` 목표 상위 ${formatPercent(result.targetPercent)} 기준인 ${result.targetRank.toLocaleString("ko-KR")}등 이내에 들어갑니다.`;
  const notice = result.notice ? ` ${result.notice}` : "";
  return `${base} ${bandText}${targetText}${notice}`;
}

function formatTargetGap(result) {
  const target = `상위 ${formatPercent(result.targetPercent)}`;
  if (result.targetGap > 0) return `${result.targetGap.toLocaleString("ko-KR")}등 차이`;
  if (result.targetGap === 0) return `${target} 경계`;
  return `${target} 안쪽`;
}

function validateRankInputs(values) {
  const students = toInteger(values.students);
  const rank = toInteger(values.rank);
  const targetPercent = Number(values.targetPercent);
  const tieCount = toInteger(values.tieCount || 1);
  const tieMode = ["simple", "shared", "lowest"].includes(values.tieMode) ? values.tieMode : "simple";

  if (!Number.isInteger(students) || students < 1 || students > 1000000) {
    return { ok: false, message: "전체 응시 인원은 1명 이상 1,000,000명 이하의 정수로 입력해 주세요." };
  }
  if (!Number.isInteger(rank) || rank < 1) {
    return { ok: false, message: "내 등수는 1등 이상의 정수로 입력해 주세요." };
  }
  if (rank > students) {
    return { ok: false, message: "내 등수는 전체 응시 인원보다 클 수 없습니다." };
  }
  if (!Number.isFinite(targetPercent) || targetPercent < 0.1 || targetPercent > 100) {
    return { ok: false, message: "목표 상위 비율은 0.1% 이상 100% 이하로 입력해 주세요." };
  }
  if (!Number.isInteger(tieCount) || tieCount < 1 || tieCount > students) {
    return { ok: false, message: "동점 인원은 1명 이상 전체 응시 인원 이하의 정수로 입력해 주세요." };
  }
  if (rank + tieCount - 1 > students) {
    return { ok: false, message: "내 등수와 동점 인원을 합친 범위가 전체 응시 인원을 넘지 않도록 입력해 주세요." };
  }
  return { ok: true, students, rank, targetPercent, tieCount, tieMode };
}

function validateScoreInputs(values) {
  const students = toInteger(values.students);
  const targetPercent = Number(values.targetPercent);
  const score = Number(values.score);
  const mean = Number(values.mean);
  const stdDev = Number(values.stdDev);

  if (!Number.isInteger(students) || students < 1 || students > 1000000) {
    return { ok: false, message: "전체 응시 인원은 1명 이상 1,000,000명 이하의 정수로 입력해 주세요." };
  }
  if (!Number.isFinite(targetPercent) || targetPercent < 0.1 || targetPercent > 100) {
    return { ok: false, message: "목표 상위 비율은 0.1% 이상 100% 이하로 입력해 주세요." };
  }
  if (!Number.isFinite(score) || !Number.isFinite(mean)) {
    return { ok: false, message: "점수·분포 기준에서는 내 점수와 평균을 숫자로 입력해 주세요." };
  }
  if (!Number.isFinite(stdDev) || stdDev <= 0) {
    return { ok: false, message: "표준편차는 0보다 큰 숫자로 입력해 주세요." };
  }
  return { ok: true, students, targetPercent, score, mean, stdDev };
}

function buildInvalidResult(mode, message) {
  return { ok: false, mode, message, band: { label: "확인 필요", tone: "muted" } };
}

function getEffectiveRank(rank, tieCount, tieMode, students) {
  if (tieMode === "shared") return clamp(rank + ((tieCount - 1) / 2), 1, students);
  if (tieMode === "lowest") return clamp(rank + tieCount - 1, 1, students);
  return clamp(rank, 1, students);
}

function buildTieNotice(rank, tieCount, tieMode, tieRangeEnd) {
  if (tieCount <= 1 || tieMode === "simple") return "동점자와 공식 산출 규칙은 반영 방식에 따라 달라질 수 있습니다.";
  if (tieMode === "shared") {
    return `${rank.toLocaleString("ko-KR")}등부터 ${tieRangeEnd.toLocaleString("ko-KR")}등까지의 공동 등수 범위를 평균 위치로 참고했습니다.`;
  }
  return `${rank.toLocaleString("ko-KR")}등부터 ${tieRangeEnd.toLocaleString("ko-KR")}등까지의 공동 등수 범위를 가장 보수적인 위치로 참고했습니다.`;
}

function tieModeLabel(tieMode) {
  if (tieMode === "shared") return "공동 등수 참고";
  if (tieMode === "lowest") return "최저 등수 참고";
  return "단순 등수 기준";
}

function formatRankLabel(result) {
  if (result.tieCount > 1 && result.tieMode !== "simple") {
    return `${result.rank.toLocaleString("ko-KR")}~${result.tieRangeEnd.toLocaleString("ko-KR")}등 참고`;
  }
  return `${result.rank.toLocaleString("ko-KR")}등`;
}

function classifyTopPercent(topPercent) {
  if (topPercent <= 5) return { label: "최상위권", tone: "excellent", summary: "최상위권에 해당하는 위치입니다." };
  if (topPercent <= 10) return { label: "상위권", tone: "strong", summary: "상위권 기준 안에 들어가는 위치입니다." };
  if (topPercent <= 20) return { label: "상위권 근접", tone: "good", summary: "상위 10%에는 조금 못 미칠 수 있지만 상위권에 가까운 구간입니다." };
  if (topPercent <= 40) return { label: "중상위권", tone: "neutral", summary: "전체 중 중상위권으로 볼 수 있는 구간입니다." };
  if (topPercent <= 60) return { label: "중간권", tone: "neutral", summary: "전체 중간권에 가까운 위치입니다." };
  return { label: "현재 위치 확인", tone: "muted", summary: "현재 위치를 확인하고 목표 구간과의 차이를 참고하세요." };
}

function buildTierRows(students, currentRank = null) {
  return [1, 5, 10, 20, 30, 50].map((percent) => {
    const rank = rankForTopPercent(students, percent);
    return {
      percent,
      rank,
      reached: Number.isFinite(currentRank) ? currentRank <= rank : false
    };
  });
}

function renderTierTable(container, tiers) {
  if (!container) return;
  container.innerHTML = tiers.map((tier) => `
    <div class="exam-tier-row${tier.reached ? " is-reached" : ""}">
      <span>상위 ${formatPercent(tier.percent)}</span>
      <strong>${tier.rank.toLocaleString("ko-KR")}등 이내</strong>
      <small>${tier.reached ? "현재 포함" : "기준 참고"}</small>
    </div>
  `).join("");
}

function rankForTopPercent(students, percent) {
  return Math.max(1, Math.floor(students * percent / 100));
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

function parseOptionalNumber(rawValue) {
  if (rawValue === null || rawValue === "") return NaN;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : NaN;
}

function toInteger(value) {
  if (!Number.isFinite(value)) return NaN;
  return Number.isInteger(value) ? value : NaN;
}

function formatPercent(value) {
  const safe = Math.max(0, Number(value) || 0);
  const digits = safe < 10 || !Number.isInteger(safe) ? 1 : 0;
  return `${safe.toFixed(digits)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setFormValue(form, name, value) {
  const field = form.elements[name];
  if (field) field.value = String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
