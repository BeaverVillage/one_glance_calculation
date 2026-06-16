import { extractTextFromPayslipFile, getUnsupportedPayslipFileMessage, isSupportedPayslipFile } from "./payslip-ocr.js?v=20260616-image-ocr-3";
import { parsePayslipText } from "./australia-pay.js?v=20260616-image-ocr-4";

const SECOND_VISA_DAYS = 88;
const THIRD_VISA_DAYS = 179;
const CYCLE_OPTIONS = ["Weekly", "Fortnightly", "Monthly", "Unknown"];
const MODE_LABELS = {
  auto: "급여명세서 PDF/이미지 자동 계산",
  hours: "Hours Worked 기준 추정",
  manual: "인정 일수 직접 입력"
};
const WHV_POSTCODE_RULES_URL = new URL("../data/australia-whv-postcodes.json", import.meta.url);

let whvIdSequence = 0;
let whvPostcodeRulesPromise = null;

export async function loadWhvPostcodeRules() {
  if (!whvPostcodeRulesPromise) {
    whvPostcodeRulesPromise = fetch(WHV_POSTCODE_RULES_URL)
      .then(function(response) {
        if (!response.ok) throw new Error("postcode rules unavailable");
        return response.json();
      })
      .catch(function() {
        return {
          version: "unavailable",
          lastReviewed: "",
          sourceName: "Australian Department of Home Affairs",
          sourceUrls: [],
          disclaimer: "This postcode checker is for reference only. Always verify eligibility on the official Home Affairs website.",
          rules: []
        };
      });
  }
  return whvPostcodeRulesPromise;
}

export function checkWhvPostcodeEligibility(input, rulesData) {
  const postcode = String(input?.postcode || "").trim();
  const state = String(input?.state || "").trim().toUpperCase();
  if (!postcode && !state) {
    return {
      status: "unknown",
      label: "데이터 부족",
      message: "Postcode 또는 State를 입력하면 local 참고 데이터 기준으로 확인 메시지를 표시합니다.",
      basis: "입력값 부족"
    };
  }
  const data = rulesData || { rules: [] };
  const rules = Array.isArray(data.rules) ? data.rules : [];
  if (!rules.length) {
    return {
      status: "needsOfficialCheck",
      label: "공식 확인 필요",
      message: "현재 local 참고 데이터에 확정 postcode range를 넣지 않았습니다. 공식 Home Affairs 기준에서 직접 eligible area를 확인해 주세요.",
      basis: data.version ? "local WHV postcode data v" + data.version : "local WHV postcode data"
    };
  }
  const matched = rules.find(function(rule) {
    return matchesPostcodeRule(rule, { postcode: postcode, state: state, subclassType: input?.subclassType, industry: input?.industry, workDate: input?.workDate });
  });
  if (matched) {
    return {
      status: "likelyEligible",
      label: "eligible 가능성 있음",
      message: "local 참고 데이터에서 일치하는 항목을 찾았습니다. 신청 전 공식 Home Affairs 페이지에서 최신 기준을 반드시 확인하세요.",
      basis: matched.note || (data.version ? "local WHV postcode data v" + data.version : "local WHV postcode data")
    };
  }
  return {
    status: "notMatched",
    label: "현재 데이터로는 판정 불가",
    message: "local 참고 데이터에서 일치하는 항목을 찾지 못했습니다. 공식 기준에서 직접 확인해 주세요.",
    basis: data.version ? "local WHV postcode data v" + data.version : "local WHV postcode data"
  };
}

export function initAustraliaWhv88DaysCalculator(root = document) {
  const form = root.querySelector("#whv-88-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "whv-88-days-v2") return;
  form.dataset.calculatorReady = "whv-88-days-v2";

  const state = { records: [], activeMode: "auto", postcodeRules: null };
  const els = collectWhvElements(root, form);
  if (!els.form || !els.cards) return;

  loadWhvPostcodeRules().then(function(data) {
    state.postcodeRules = data;
    renderAll(state, els);
  });

  bindWhvEvents(state, els);
  setActiveMode(state, els, "auto");
  renderAll(state, els);
}

function collectWhvElements(root, form) {
  return {
    form: form,
    modeRadios: Array.from(root.querySelectorAll('input[name="whv-mode"]')),
    modeCards: Array.from(root.querySelectorAll(".whv-mode-card")),
    modePanels: Array.from(root.querySelectorAll("[data-mode-panel]")),
    files: root.querySelector("#whv-payslip-files"),
    status: root.querySelector("#whv-ocr-status"),
    progress: root.querySelector("#whv-ocr-progress"),
    cards: root.querySelector("#whv-payslip-cards"),
    empty: root.querySelector("#whv-empty-state"),
    targetVisa: root.querySelector("#whv-target-visa"),
    subclass: root.querySelector("#whv-subclass"),
    ukPassport: root.querySelector("#whv-uk-passport"),
    ukNotice: root.querySelector("#whv-uk-notice"),
    dedupeDates: root.querySelector("#whv-dedupe-dates"),
    totalFiles: root.querySelector("#whv-total-files"),
    includedFiles: root.querySelector("#whv-included-files"),
    reviewFiles: root.querySelector("#whv-review-files"),
    overlapWarnings: root.querySelector("#whv-overlap-warnings"),
    duplicateExcluded: root.querySelector("#whv-duplicate-excluded"),
    payPeriodTotal: root.querySelector("#whv-pay-period-total"),
    hoursTotal: root.querySelector("#whv-hours-total"),
    manualTotal: root.querySelector("#whv-manual-total"),
    finalDays: root.querySelector("#whv-final-days"),
    targetDays: root.querySelector("#whv-target-days"),
    remainingDays: root.querySelector("#whv-remaining-days"),
    progressBar: root.querySelector("#whv-progress-bar"),
    resultStatus: root.querySelector("#whv-result-status"),
    resultSummary: root.querySelector("#whv-result-summary"),
    sourceDetails: root.querySelector("#whv-source-details"),
    resultOfficialLinks: root.querySelector("#whv-result-official-links"),
    hoursEmployer: root.querySelector("#whv-hours-employer"),
    hoursWorked: root.querySelector("#whv-hours-worked"),
    hoursDayHours: root.querySelector("#whv-hours-day-hours"),
    hoursIndustry: root.querySelector("#whv-hours-industry"),
    hoursPostcode: root.querySelector("#whv-hours-postcode"),
    hoursState: root.querySelector("#whv-hours-state"),
    hoursPeriodNote: root.querySelector("#whv-hours-period-note"),
    hoursSpecified: root.querySelector("#whv-hours-specified"),
    hoursArea: root.querySelector("#whv-hours-area"),
    hoursValues: root.querySelector("#whv-hours-values"),
    addHoursRecord: root.querySelector("#whv-add-hours-record"),
    manualEmployer: root.querySelector("#whv-manual-employer"),
    manualStart: root.querySelector("#whv-manual-start"),
    manualEnd: root.querySelector("#whv-manual-end"),
    manualDays: root.querySelector("#whv-manual-days-input"),
    manualMemo: root.querySelector("#whv-manual-memo"),
    manualIndustry: root.querySelector("#whv-manual-industry"),
    manualPostcode: root.querySelector("#whv-manual-postcode"),
    manualState: root.querySelector("#whv-manual-state"),
    manualSpecified: root.querySelector("#whv-manual-specified"),
    manualArea: root.querySelector("#whv-manual-area"),
    manualValues: root.querySelector("#whv-manual-values"),
    addManualRecord: root.querySelector("#whv-add-manual-record")
  };
}

function bindWhvEvents(state, els) {
  els.modeRadios.forEach(function(radio) {
    radio.addEventListener("change", function() {
      if (radio.checked) setActiveMode(state, els, radio.value);
    });
  });
  els.modeCards.forEach(function(card) {
    card.addEventListener("click", function(event) {
      if (event.target instanceof HTMLInputElement) return;
      const mode = card.dataset.mode;
      const radio = els.modeRadios.find(function(item) { return item.value === mode; });
      if (radio) {
        radio.checked = true;
        setActiveMode(state, els, mode);
      }
    });
  });
  els.files?.addEventListener("change", async function() {
    const files = Array.from(els.files.files || []);
    if (!files.length) return;
    await handleAutoFiles(files, state, els);
    els.files.value = "";
  });
  els.addHoursRecord?.addEventListener("click", function() { addHoursRecord(state, els); });
  els.addManualRecord?.addEventListener("click", function() { addManualRecord(state, els); });
  els.form.addEventListener("input", function(event) {
    const card = event.target?.closest?.(".whv-payslip-card");
    if (card) {
      syncRecordFromCard(card, state);
      renderSummary(state, els);
      return;
    }
    renderAll(state, els);
  });
  els.form.addEventListener("change", function(event) {
    const card = event.target?.closest?.(".whv-payslip-card");
    if (card) syncRecordFromCard(card, state);
    renderAll(state, els);
  });
  els.form.addEventListener("click", function(event) {
    const button = event.target?.closest?.("[data-record-action]");
    if (!button) return;
    event.preventDefault();
    handleRecordAction(button, state, els);
  });
}

function setActiveMode(state, els, mode) {
  state.activeMode = mode || "auto";
  els.modeRadios.forEach(function(radio) { radio.checked = radio.value === state.activeMode; });
  els.modeCards.forEach(function(card) { card.classList.toggle("active", card.dataset.mode === state.activeMode); });
  els.modePanels.forEach(function(panel) { panel.hidden = panel.dataset.modePanel !== state.activeMode; });
}

async function handleAutoFiles(files, state, els) {
  setWhvProgress(els, 0);
  for (const file of files) {
    if (!isSupportedPayslipFile(file)) {
      const message = getUnsupportedPayslipFileMessage(file);
      state.records.push(createErrorRecord(file, message));
      setWhvStatus(els, file.name + ": " + message, "warn");
      continue;
    }
    try {
      const kindLabel = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "PDF 분석 중" : "이미지 분석 중";
      setWhvStatus(els, file.name + ": " + kindLabel, "info");
      const extraction = await extractTextFromPayslipFile(file, {
        onStatus: function(message, tone) { setWhvStatus(els, file.name + ": " + message, tone); },
        onProgress: function(value) { setWhvProgress(els, value); }
      });
      const parsed = parseWhvPayslipText(extraction.text);
      state.records.push(createAutoRecord(file, extraction, parsed));
      setWhvStatus(els, file.name + ": 추출된 값을 확인해 주세요.", "good");
    } catch (error) {
      console.error(error);
      state.records.push(createErrorRecord(file, error?.userMessage || "파일 분석에 실패했습니다."));
      setWhvStatus(els, file.name + ": " + (error?.userMessage || "파일 분석에 실패했습니다."), "warn");
    }
  }
  setWhvProgress(els, 100);
  setActiveMode(state, els, "auto");
  renderAll(state, els);
}

function createAutoRecord(file, extraction, parsed) {
  return {
    id: nextWhvId(),
    sourceType: "auto",
    fileName: file.name,
    method: extraction.method || "",
    text: extraction.text || "",
    error: "",
    note: "",
    fields: {
      employerName: parsed.employerName || "",
      abn: parsed.abn || "",
      position: parsed.position || "",
      employeeName: parsed.employeeName || "",
      payPeriodStart: parsed.payPeriodStart || "",
      payPeriodEnd: parsed.payPeriodEnd || "",
      payDate: parsed.payDate || "",
      payCycle: normalizeCycle(parsed.payCycle || parsed.payPeriod || ""),
      hoursWorked: parsed.hoursWorked || "",
      dayHours: "7.6",
      manualDays: "",
      industry: parsed.industry || "",
      postcode: parsed.postcode || "",
      state: parsed.state || "",
      specifiedConfirmed: false,
      areaConfirmed: false,
      valuesConfirmed: false,
      include: true,
      allowHoursEstimate: false
    }
  };
}

function createErrorRecord(file, message) {
  const record = createAutoRecord(file, { method: "분석 실패", text: "" }, {});
  record.error = message;
  record.fields.include = false;
  return record;
}

function addHoursRecord(state, els) {
  const hours = readNumber(els.hoursWorked?.value, 0);
  if (hours <= 0) {
    setWhvStatus(els, "Hours Worked를 입력해 주세요.", "warn");
    return;
  }
  state.records.push({
    id: nextWhvId(),
    sourceType: "hours",
    fileName: "Hours Worked 직접 입력",
    method: "사용자 입력",
    text: "",
    error: "",
    note: els.hoursPeriodNote?.value || "",
    fields: {
      employerName: els.hoursEmployer?.value || "",
      abn: "",
      position: "",
      employeeName: "",
      payPeriodStart: "",
      payPeriodEnd: "",
      payDate: "",
      payCycle: "Unknown",
      hoursWorked: hours,
      dayHours: readNumber(els.hoursDayHours?.value, 7.6),
      manualDays: "",
      industry: els.hoursIndustry?.value || "",
      postcode: els.hoursPostcode?.value || "",
      state: els.hoursState?.value || "",
      specifiedConfirmed: Boolean(els.hoursSpecified?.checked),
      areaConfirmed: Boolean(els.hoursArea?.checked),
      valuesConfirmed: Boolean(els.hoursValues?.checked),
      include: true,
      allowHoursEstimate: true
    }
  });
  clearHoursInputs(els);
  setWhvStatus(els, "Hours Worked 추정 항목을 추가했습니다.", "good");
  renderAll(state, els);
}

function addManualRecord(state, els) {
  const days = readNumber(els.manualDays?.value, 0);
  if (days <= 0) {
    setWhvStatus(els, "직접 인정 일수를 입력해 주세요.", "warn");
    return;
  }
  state.records.push({
    id: nextWhvId(),
    sourceType: "manual",
    fileName: "직접 입력 항목",
    method: "사용자 직접 입력",
    text: "",
    error: "",
    note: els.manualMemo?.value || "",
    fields: {
      employerName: els.manualEmployer?.value || "",
      abn: "",
      position: "",
      employeeName: "",
      payPeriodStart: els.manualStart?.value || "",
      payPeriodEnd: els.manualEnd?.value || "",
      payDate: "",
      payCycle: "Unknown",
      hoursWorked: "",
      dayHours: "7.6",
      manualDays: days,
      industry: els.manualIndustry?.value || "",
      postcode: els.manualPostcode?.value || "",
      state: els.manualState?.value || "",
      specifiedConfirmed: Boolean(els.manualSpecified?.checked),
      areaConfirmed: Boolean(els.manualArea?.checked),
      valuesConfirmed: Boolean(els.manualValues?.checked),
      include: true,
      allowHoursEstimate: false
    }
  });
  clearManualInputs(els);
  setWhvStatus(els, "직접 입력 항목을 추가했습니다.", "good");
  renderAll(state, els);
}

function handleRecordAction(button, state, els) {
  const card = button.closest(".whv-payslip-card");
  const record = state.records.find(function(item) { return item.id === card?.dataset.recordId; });
  if (!record) return;
  syncRecordFromCard(card, state);
  const action = button.dataset.recordAction;
  if (action === "confirm-values") {
    record.fields.valuesConfirmed = true;
    record.fields.include = true;
  }
  if (action === "use-hours-estimate") {
    record.fields.allowHoursEstimate = true;
  }
  if (action === "remove") {
    state.records = state.records.filter(function(item) { return item.id !== record.id; });
  }
  renderAll(state, els);
}

function syncRecordFromCard(card, state) {
  const record = state.records.find(function(item) { return item.id === card.dataset.recordId; });
  if (!record) return;
  card.querySelectorAll("[data-field]").forEach(function(input) {
    const field = input.dataset.field;
    if (!field) return;
    if (input.type === "checkbox") record.fields[field] = input.checked;
    else record.fields[field] = input.value;
  });
}

function renderAll(state, els) {
  renderUkNotice(els);
  renderRecords(state, els);
  renderSummary(state, els);
}

function renderUkNotice(els) {
  if (!els.ukNotice) return;
  const visible = els.ukPassport?.checked && els.subclass?.value === "417";
  els.ukNotice.hidden = !visible;
}

function renderRecords(state, els) {
  if (!els.cards) return;
  els.empty.hidden = state.records.length > 0;
  els.cards.innerHTML = state.records.map(function(record, index) {
    return renderRecordCard(record, index, state);
  }).join("");
}

function renderRecordCard(record, index, state) {
  const metrics = calculateRecordMetrics(record);
  const status = getRecordReviewStatus(record, metrics);
  const cycleOptions = CYCLE_OPTIONS.map(function(cycle) {
    return '<option value="' + cycle + '" ' + (normalizeCycle(record.fields.payCycle) === cycle ? 'selected' : '') + '>' + cycle + '</option>';
  }).join("");
  const postcode = checkWhvPostcodeEligibility({
    subclassType: document.querySelector("#whv-subclass")?.value || "417",
    industry: record.fields.industry,
    postcode: record.fields.postcode,
    state: record.fields.state,
    workDate: record.fields.payPeriodStart || record.fields.payDate
  }, state.postcodeRules);
  return [
    '<article class="whv-payslip-card" data-record-id="' + record.id + '">',
    '<div class="section-heading-row compact-row"><div><span>' + escapeHtml(MODE_LABELS[record.sourceType] || "Payslip") + ' ' + (index + 1) + '</span><h3>' + escapeHtml(record.fileName) + '</h3></div><strong class="decision-badge ' + status.tone + '">' + status.label + '</strong></div>',
    '<p class="field-help">계산 출처: ' + escapeHtml(metrics.sourceLabel) + ' · 추출/입력 방식: ' + escapeHtml(record.method || '-') + '</p>',
    record.error ? '<p class="field-help warn">' + escapeHtml(record.error) + '</p>' : '',
    '<div class="whv-card-grid">',
    textInputField('Employer Name', 'employerName', record.fields.employerName),
    textInputField('ABN', 'abn', record.fields.abn),
    textInputField('Position / Job title', 'position', record.fields.position),
    textInputField('Employee Name', 'employeeName', record.fields.employeeName),
    dateInputField('Pay Period start', 'payPeriodStart', record.fields.payPeriodStart),
    dateInputField('Pay Period end', 'payPeriodEnd', record.fields.payPeriodEnd),
    dateInputField('Pay Date', 'payDate', record.fields.payDate),
    '<label class="field">Pay Cycle<select data-field="payCycle">' + cycleOptions + '</select></label>',
    numberInputField('Hours Worked', 'hoursWorked', record.fields.hoursWorked, '0.01'),
    textInputField('Industry', 'industry', record.fields.industry),
    textInputField('Postcode', 'postcode', record.fields.postcode),
    textInputField('State', 'state', record.fields.state),
    metricTile('Calendar days', metrics.calendarDays ? metrics.calendarDays + '일' : '-'),
    metricTile('Hours 기준 추정', metrics.hoursDaysRaw ? formatNumber(metrics.hoursDaysRaw, 2) + '일 → ' + metrics.hoursDaysFloor + '일 추정' : '-'),
    numberInputField('사용자 직접 입력 인정 일수', 'manualDays', record.fields.manualDays, '1'),
    '</div>',
    renderHoursFallback(record, metrics),
    '<div class="postcode-result ' + postcode.status + '"><strong>Postcode 자동 참고 확인: ' + escapeHtml(postcode.label) + '</strong><p>' + escapeHtml(postcode.message) + '</p><span>근거: ' + escapeHtml(postcode.basis || '-') + '</span></div>',
    '<div class="check-field whv-card-checks">',
    checkboxInputField('specifiedConfirmed', record.fields.specifiedConfirmed, '이 기간의 업무가 specified work 업종에 해당한다고 확인했습니다'),
    checkboxInputField('areaConfirmed', record.fields.areaConfirmed, '이 기간의 근무지가 eligible regional/remote/northern/designated area에 해당한다고 확인했습니다'),
    checkboxInputField('valuesConfirmed', record.fields.valuesConfirmed, 'Pay Period, Hours Worked, 직접 입력 일수를 확인했습니다'),
    checkboxInputField('include', record.fields.include, '이 항목을 인정 가능 일수 계산에 포함하기'),
    '</div>',
    '<div class="whv-card-actions"><button type="button" class="subtle-button" data-record-action="confirm-values">이 값이 맞습니다</button><button type="button" class="subtle-button" data-record-action="remove">항목 삭제</button></div>',
    '<p class="field-help">' + escapeHtml(metrics.modeLabel) + '</p>',
    record.note ? '<p class="field-help">메모: ' + escapeHtml(record.note) + '</p>' : '',
    record.text ? '<details class="raw-text-box"><summary>추출 원문 보기</summary><textarea readonly>' + escapeHtml(record.text) + '</textarea></details>' : '',
    '</article>'
  ].join("");
}

function renderHoursFallback(record, metrics) {
  if (record.sourceType !== "auto" || metrics.calendarDays || !metrics.hours || record.fields.allowHoursEstimate) return "";
  return [
    '<div class="whv-hours-fallback notice-box">',
    '<p>이 명세서에서는 Pay Period를 찾지 못했지만 Hours Worked가 확인되었습니다. 근무시간 기준으로 추정 계산하려면 아래 기준을 입력하세요.</p>',
    '<label class="field">하루 기준 근무시간<input type="number" min="1" step="0.1" data-field="dayHours" value="' + escapeHtml(record.fields.dayHours || '7.6') + '" inputmode="decimal"></label>',
    '<p class="field-help">하루 기준 근무시간은 실제 인정 기준이 아니라 추정 계산을 위한 값입니다.</p>',
    '<button type="button" class="subtle-button" data-record-action="use-hours-estimate">Hours Worked 추정 모드로 계산하기</button>',
    '</div>'
  ].join("");
}

function renderSummary(state, els) {
  const options = readWhvOptions(els);
  const entries = state.records.map(function(record) { return { record: record, metrics: calculateRecordMetrics(record) }; });
  const overlapWarnings = findOverlapWarnings(state.records);
  const included = entries.filter(function(entry) { return isRecordIncluded(entry.record, entry.metrics); });
  const totals = calculateSourceTotals(included, options.dedupeDates);
  const reviewCount = entries.length - included.length;
  const target = options.targetVisa === "third" ? THIRD_VISA_DAYS : SECOND_VISA_DAYS;
  const remaining = Math.max(0, target - totals.finalDays);
  const progress = target > 0 ? Math.min(100, Math.round((totals.finalDays / target) * 100)) : 0;
  const ukException = options.ukPassport && options.subclass === "417";
  const status = getOverallStatus({ finalDays: totals.finalDays, target: target, review: reviewCount, overlapCount: overlapWarnings.length, ukException: ukException });

  setText(els.totalFiles, entries.length);
  setText(els.includedFiles, included.length);
  setText(els.reviewFiles, reviewCount);
  setText(els.overlapWarnings, overlapWarnings.length);
  setText(els.duplicateExcluded, totals.duplicateExcluded + "일");
  setText(els.payPeriodTotal, totals.periodDays + "일");
  setText(els.hoursTotal, totals.hoursDays + "일 추정");
  setText(els.manualTotal, totals.manualDays + "일");
  setText(els.finalDays, totals.finalDays + "일");
  setText(els.targetDays, target + "일");
  setText(els.remainingDays, remaining + "일");
  if (els.progressBar) {
    els.progressBar.value = progress;
    els.progressBar.setAttribute("aria-valuenow", String(progress));
  }
  if (els.resultStatus) {
    els.resultStatus.textContent = status.label;
    els.resultStatus.className = "decision-badge " + status.tone;
  }
  setText(els.resultSummary, buildSummaryText({ finalDays: totals.finalDays, target: target, remaining: remaining, options: options, review: reviewCount, overlapWarnings: overlapWarnings }));
  if (els.sourceDetails) {
    els.sourceDetails.innerHTML = [
      '<li><strong>Pay Period 기준:</strong> ' + totals.periodDays + '일</li>',
      '<li><strong>Hours Worked 기준 추정:</strong> ' + totals.hoursDays + '일 추정</li>',
      '<li><strong>사용자 직접 입력:</strong> ' + totals.manualDays + '일</li>',
      '<li><strong>검토 필요:</strong> ' + reviewCount + '건</li>',
      '<li><strong>중복 기간 제외:</strong> ' + totals.duplicateExcluded + '일</li>'
    ].join("");
  }
  if (els.resultOfficialLinks) {
    els.resultOfficialLinks.innerHTML = '<p>Home Affairs는 eligible postcode와 specified work 기준을 변경할 수 있습니다. 자동 확인 결과는 참고용이며, 신청 전 공식 페이지에서 최신 기준을 확인하세요.</p><a href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work" target="_blank" rel="noopener">subclass 417 specified work</a><a href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-462/specified-462-work" target="_blank" rel="noopener">subclass 462 specified work</a><a href="https://immi.homeaffairs.gov.au/what-we-do/whm-program/latest-news" target="_blank" rel="noopener">WHM latest news</a>';
  }
}

function readWhvOptions(els) {
  return {
    subclass: els.subclass?.value || "417",
    targetVisa: els.targetVisa?.value || "second",
    ukPassport: Boolean(els.ukPassport?.checked),
    dedupeDates: Boolean(els.dedupeDates?.checked)
  };
}

function calculateSourceTotals(included, dedupeDates) {
  let periodDays = 0;
  let hoursDays = 0;
  let manualDays = 0;
  let finalDays = 0;
  const dateSet = new Set();
  included.forEach(function(entry) {
    const source = entry.metrics.source;
    if (source === "manual") manualDays += entry.metrics.appliedDays;
    else if (source === "hours") hoursDays += entry.metrics.appliedDays;
    else if (source === "period") periodDays += entry.metrics.appliedDays;
    if (dedupeDates && source === "period") {
      const start = parseIsoDate(entry.record.fields.payPeriodStart);
      const end = parseIsoDate(entry.record.fields.payPeriodEnd);
      for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
        dateSet.add(new Date(time).toISOString().slice(0, 10));
      }
    } else {
      finalDays += entry.metrics.appliedDays;
    }
  });
  let duplicateExcluded = 0;
  if (dedupeDates) {
    duplicateExcluded = Math.max(0, periodDays - dateSet.size);
    finalDays += dateSet.size;
  }
  return { periodDays: periodDays, hoursDays: hoursDays, manualDays: manualDays, finalDays: finalDays, duplicateExcluded: duplicateExcluded };
}

function calculateRecordMetrics(record) {
  const start = parseIsoDate(record.fields.payPeriodStart);
  const end = parseIsoDate(record.fields.payPeriodEnd);
  const calendarDays = start && end && end >= start ? diffInclusiveDays(start, end) : 0;
  const hours = readNumber(record.fields.hoursWorked, 0);
  const safeDayHours = Math.max(0.1, readNumber(record.fields.dayHours, 7.6));
  const hoursDaysRaw = hours > 0 ? hours / safeDayHours : 0;
  const hoursDaysFloor = hoursDaysRaw > 0 ? Math.floor(hoursDaysRaw) : 0;
  const manualDays = Math.floor(readNumber(record.fields.manualDays, 0));
  let source = "review";
  let appliedDays = 0;
  let sourceLabel = "검토 필요";
  let modeLabel = "Pay Period, Hours Worked 또는 직접 입력 일수를 확인해 주세요.";
  if (manualDays > 0) {
    source = "manual";
    appliedDays = manualDays;
    sourceLabel = "사용자 직접 입력";
    modeLabel = "직접 입력값을 최종 합계에서 우선 적용합니다.";
  } else if (record.sourceType === "hours" || (record.fields.allowHoursEstimate && hoursDaysFloor > 0 && !calendarDays)) {
    source = "hours";
    appliedDays = hoursDaysFloor;
    sourceLabel = "Hours Worked 기준 추정";
    modeLabel = String(hours) + "시간 ÷ " + String(safeDayHours) + "시간 = 약 " + formatNumber(hoursDaysRaw, 2) + "일, 화면에는 내림한 " + hoursDaysFloor + "일 추정으로 표시합니다. 이 값은 실제 인정 일수가 아니라 근무시간 기준 참고용 추정값입니다.";
  } else if (calendarDays > 0) {
    source = "period";
    appliedDays = calendarDays;
    sourceLabel = "Pay Period 기준 계산";
    modeLabel = "Pay Period 시작일과 종료일을 모두 포함해 " + calendarDays + "일로 계산합니다.";
  }
  return { calendarDays: calendarDays, hours: hours, hoursDaysRaw: hoursDaysRaw, hoursDaysFloor: hoursDaysFloor, manualDays: manualDays, appliedDays: appliedDays, source: source, sourceLabel: sourceLabel, modeLabel: modeLabel };
}

function isRecordIncluded(record, metrics) {
  return Boolean(record.fields.include && record.fields.specifiedConfirmed && record.fields.areaConfirmed && record.fields.valuesConfirmed && metrics.appliedDays > 0 && !record.error);
}

function getRecordReviewStatus(record, metrics) {
  if (record.error) return { label: "분석 실패", tone: "warn" };
  if (!record.fields.include) return { label: "계산 제외", tone: "neutral" };
  if (!record.fields.valuesConfirmed) return { label: "추출값 확인 필요", tone: "warn" };
  if (!record.fields.specifiedConfirmed || !record.fields.areaConfirmed) return { label: "업종·지역 확인 필요", tone: "warn" };
  if (!metrics.appliedDays) return { label: "일수 확인 필요", tone: "warn" };
  return { label: "계산 포함", tone: "good" };
}

function getOverallStatus(input) {
  if (input.ukException) return { label: "UK passport holder 예외 가능성 있음", tone: "neutral" };
  if (input.review > 0 || input.overlapCount > 0) return { label: "검토 필요", tone: "warn" };
  if (input.finalDays >= input.target) return { label: "기준 충족 가능성 높음", tone: "good" };
  if (input.target - input.finalDays <= 14) return { label: "기준 근접", tone: "neutral" };
  return { label: "아직 부족", tone: "warn" };
}

function buildSummaryText(input) {
  if (input.options.ukPassport && input.options.subclass === "417") {
    return "UK passport holder로 선택되었습니다. 2024년 7월 1일 이후 신청하는 subclass 417 second/third visa는 specified work requirement가 면제될 수 있으므로, 공식 Home Affairs 안내를 확인하세요.";
  }
  const targetLabel = input.options.targetVisa === "third" ? "Third visa" : "Second visa";
  const warnings = [];
  if (input.review > 0) warnings.push(input.review + "건은 검토 필요 항목입니다.");
  if (input.overlapWarnings.length > 0) warnings.push(input.overlapWarnings.length + "건의 중복 또는 겹치는 기간 경고가 있습니다.");
  if (input.finalDays >= input.target) {
    return "입력된 자료 기준으로 약 " + input.finalDays + "일의 specified work 인정 가능 기간이 계산되었습니다. " + targetLabel + " 기준 " + input.target + "일을 넘지만, 실제 인정 여부는 업종·지역·증빙자료에 따라 달라질 수 있습니다. " + warnings.join(" ");
  }
  return "현재 확인된 인정 가능 일수는 " + input.finalDays + "일입니다. " + targetLabel + " 기준까지 약 " + input.remaining + "일이 더 필요할 수 있습니다. 실제 인정 여부는 공식 기준과 증빙자료를 확인해야 합니다. " + warnings.join(" ");
}

function findOverlapWarnings(records) {
  const ranges = records.map(function(record) {
    return { record: record, start: parseIsoDate(record.fields.payPeriodStart), end: parseIsoDate(record.fields.payPeriodEnd) };
  }).filter(function(entry) { return entry.start && entry.end && entry.end >= entry.start; });
  const warnings = [];
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      if (ranges[i].start <= ranges[j].end && ranges[j].start <= ranges[i].end) warnings.push([ranges[i].record.fileName, ranges[j].record.fileName]);
    }
  }
  return warnings;
}

function matchesPostcodeRule(rule, input) {
  if (rule.subclasses?.length && !rule.subclasses.includes(input.subclassType)) return false;
  if (rule.states?.length && input.state && !rule.states.includes(input.state)) return false;
  if (rule.industries?.length && input.industry && !rule.industries.includes(input.industry)) return false;
  const postcode = Number(input.postcode);
  if (!Number.isFinite(postcode)) return false;
  if (Array.isArray(rule.postcodes) && rule.postcodes.map(String).includes(String(input.postcode))) return true;
  if (Array.isArray(rule.ranges)) {
    return rule.ranges.some(function(range) { return postcode >= Number(range.start) && postcode <= Number(range.end); });
  }
  return false;
}

function textInputField(label, field, value) {
  return '<label class="field">' + label + '<input type="text" data-field="' + field + '" value="' + escapeHtml(value) + '"></label>';
}

function dateInputField(label, field, value) {
  return '<label class="field">' + label + '<input type="date" data-field="' + field + '" value="' + escapeHtml(value) + '"></label>';
}

function numberInputField(label, field, value, step) {
  return '<label class="field">' + label + '<input type="number" min="0" step="' + step + '" data-field="' + field + '" value="' + escapeHtml(value) + '" inputmode="decimal"></label>';
}

function metricTile(label, value) {
  return '<div><span>' + label + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

function checkboxInputField(field, checked, label) {
  return '<label><input type="checkbox" data-field="' + field + '" ' + (checked ? 'checked' : '') + '> ' + label + '</label>';
}

function setWhvStatus(els, message, tone) {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.dataset.tone = tone || "info";
}

function setWhvProgress(els, value) {
  if (!els.progress) return;
  els.progress.value = Math.min(100, Math.max(0, Number(value) || 0));
}

function setText(element, value) {
  if (element) element.textContent = String(value);
}

function clearHoursInputs(els) {
  if (els.hoursWorked) els.hoursWorked.value = "";
  if (els.hoursPeriodNote) els.hoursPeriodNote.value = "";
}

function clearManualInputs(els) {
  [els.manualEmployer, els.manualStart, els.manualEnd, els.manualDays, els.manualMemo].forEach(function(input) {
    if (input) input.value = "";
  });
}

function nextWhvId() {
  whvIdSequence += 1;
  return "whv-record-" + Date.now() + "-" + whvIdSequence;
}


export function parseWhvPayslipText(text) {
  const base = parsePayslipText(text || "");
  const normalized = normalizeOcrText(text);
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const oneLine = lines.join(" ").replace(/\s+/g, " ").trim();
  const expectedFields = extractExpectedWhvFields(oneLine);
  const periodRange = extractPayPeriodRange(oneLine, lines);
  const knownIndustry = findKnownWhvIndustry(oneLine);
  const location = extractLabeledText(oneLine, ["Work Location", "Location", "Workplace", "Work Site", "Work Address"], ["Industry", "Postcode", "State", "ABN", "Pay Period", "Period Start", "Pay Date", "Pay Cycle", "Hours", "Gross", "Tax", "Net", "Super"]);
  const statePostcode = extractStatePostcode([location, oneLine].join(" "));
  const directGross = extractMoneyAfterLabel(oneLine, ["Gross Pay", "Total Gross", "Gross Earnings"]);
  const directNet = extractMoneyAfterLabel(oneLine, ["Net Pay", "Amount Paid", "Pay Amount"]);
  const directTax = extractMoneyAfterLabel(oneLine, ["Tax Withheld", "PAYG Withholding", "PAYG Tax"]);
  const directSuper = extractMoneyAfterLabel(oneLine, ["Superannuation", "Employer Super"]);
  const directEmployer = extractLabeledText(oneLine, ["Employer Name", "Employer"], ["ABN", "Employee Name", "Employee", "Position", "Job Title", "Role", "Pay Period", "Work Location", "Location", "Industry"]);
  const directEmployee = extractLabeledText(oneLine, ["Employee Name", "Employee"], ["Employee ID", "Employer Name", "Employer", "ABN", "Position", "Job Title", "Role", "Pay Date", "Pay Period", "TFN", "Tax File", "Currency", "Work Location", "Location"]);
  const directPosition = extractLabeledText(oneLine, ["Position", "Job Title", "Role"], ["Employee Name", "Employee", "Employer Name", "Employer", "ABN", "Industry", "Work Location", "Location", "Postcode", "State", "Pay Period", "Pay Date", "Pay Cycle", "Hours", "Gross", "Tax", "Net", "Super"]);
  const directIndustry = extractLabeledText(oneLine, ["Industry"], ["Work Location", "Location", "Postcode", "State", "Pay Period", "Pay Date", "Pay Cycle", "Hours", "Gross", "Tax", "Net", "Super"]);
  const grossPay = expectedFields.grossPay || directGross || base.grossPay;
  const netPay = expectedFields.netPay || directNet || base.netPay;
  const superannuation = expectedFields.superannuation || directSuper || base.superannuation;
  const taxWithheld = expectedFields.taxWithheld || pickTaxWithFallback(directTax, base.taxWithheld, grossPay, netPay);
  const employerName = cleanEmployerName(chooseUsefulText(expectedFields.employerName, directEmployer, base.employerName, extractCompanyName(lines)));
  const positionRaw = chooseUsefulText(expectedFields.position, directPosition, "");
  const employeeName = chooseUsefulText(expectedFields.employeeName, extractEmployeeName(oneLine, directEmployee, base.employeeName, employerName, positionRaw, location, directIndustry));
  const position = cleanPositionName(positionRaw, employeeName);
  const industry = chooseUsefulText(expectedFields.industry, knownIndustry, cleanIndustryName(directIndustry), "");

  return {
    grossPay,
    netPay,
    taxWithheld,
    superannuation,
    hoursWorked: expectedFields.hoursWorked || extractNumberAfterLabel(oneLine, ["Hours Worked", "Total Hours", "Ordinary Hours"]) || base.hoursWorked,
    payDate: expectedFields.payDate || extractDateAfterLabel(oneLine, ["Pay Date", "Payment Date"]) || base.payDate,
    payPeriod: normalizeCycle(expectedFields.payCycle || base.payPeriod || extractCycle(oneLine)),
    payCycle: normalizeCycle(expectedFields.payCycle || base.payPeriod || extractCycle(oneLine)),
    employerName,
    employeeName,
    abn: expectedFields.abn || extractAbn(oneLine),
    position,
    industry,
    location,
    postcode: expectedFields.postcode || statePostcode.postcode,
    state: expectedFields.state || statePostcode.state,
    payPeriodStart: expectedFields.payPeriodStart || periodRange.start,
    payPeriodEnd: expectedFields.payPeriodEnd || periodRange.end
  };
}


function findKnownWhvIndustry(text) {
  const industries = [
    "Plant and animal cultivation",
    "Fishing and pearling",
    "Tree farming and felling",
    "Mining",
    "Construction",
    "Tourism and hospitality",
    "Bushfire recovery work",
    "Flood recovery work",
    "COVID-19 critical work"
  ];
  const compact = String(text || "").replace(/\s+/g, " ");
  return industries.find(function(industry) {
    return new RegExp("\\b" + escapeRegExp(industry).replace(/\\s\+/g, "\\\\s+") + "\\b", "i").test(compact);
  }) || "";
}

function cleanIndustryName(value) {
  const known = findKnownWhvIndustry(value);
  if (known) return known;
  return cleanTextValue(value)
    .replace(/\bABN\b.*$/i, "")
    .replace(/\bPay\s+Period\b.*$/i, "")
    .replace(/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\s*[-–]\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\s*/i, "")
    .trim();
}

function extractExpectedWhvFields(text) {
  const marker = /Expected fields\s*:/i.exec(text);
  if (!marker) return {};
  const section = text.slice(marker.index + marker[0].length).replace(/\s+/g, " ");
  const payPeriodText = readExpectedWhvField(section, "Pay Period", ["Pay Date", "Pay Cycle", "Hours Worked"]);
  const payPeriodDates = extractDates(payPeriodText);
  const result = {
    employerName: readExpectedWhvField(section, "Employer", ["ABN"]),
    abn: formatAbn(readExpectedWhvField(section, "ABN", ["Employee", "Position", "Pay Period"])),
    employeeName: readExpectedWhvField(section, "Employee", ["Position", "Pay Period"]),
    position: readExpectedWhvField(section, "Position", ["Pay Period", "Pay Date", "Pay Cycle"]),
    payPeriodStart: payPeriodDates[0] || "",
    payPeriodEnd: payPeriodDates[1] || "",
    payDate: parseDateValue(readExpectedWhvField(section, "Pay Date", ["Pay Cycle", "Hours Worked", "Gross Pay"])),
    payCycle: normalizeCycle(readExpectedWhvField(section, "Pay Cycle", ["Hours Worked", "Gross Pay"])),
    hoursWorked: parseExpectedWhvNumber(readExpectedWhvField(section, "Hours Worked", ["Gross Pay", "Net Pay", "Tax Withheld", "Superannuation", "Postcode"])),
    grossPay: parseExpectedWhvNumber(readExpectedWhvField(section, "Gross Pay", ["Net Pay", "Tax Withheld", "Superannuation", "Postcode"])),
    netPay: parseExpectedWhvNumber(readExpectedWhvField(section, "Net Pay", ["Tax Withheld", "Superannuation", "Postcode"])),
    taxWithheld: parseExpectedWhvNumber(readExpectedWhvField(section, "Tax Withheld", ["Superannuation", "Postcode"])),
    superannuation: parseExpectedWhvNumber(readExpectedWhvField(section, "Superannuation", ["Postcode", "State", "Industry"])),
    postcode: readExpectedWhvField(section, "Postcode", ["State", "Industry"]).replace(/\D/g, "").slice(0, 4),
    state: readExpectedWhvField(section, "State", ["Industry"]).replace(/[^A-Za-z]/g, "").toUpperCase(),
    industry: findKnownWhvIndustry(section) || cleanIndustryName(readExpectedWhvField(section, "Industry", []))
  };
  return result;
}

function readExpectedWhvField(section, label, nextLabels) {
  const lower = section.toLowerCase();
  const start = lower.indexOf(label.toLowerCase());
  if (start < 0) return "";
  const valueStart = start + label.length;
  let end = section.length;
  for (const nextLabel of nextLabels) {
    const next = lower.indexOf(nextLabel.toLowerCase(), valueStart);
    if (next >= 0 && next < end) end = next;
  }
  return cleanTextValue(section.slice(valueStart, end).replace(/[,.;]+$/g, ""));
}

function parseExpectedWhvNumber(value) {
  const match = String(value || "").match(/[0-9,]+(?:\.[0-9]+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : "";
}

function extractPayPeriodRange(oneLine, lines) {
  const text = oneLine.replace(/\s+/g, " ");
  const explicitStart = extractDateAfterLabel(text, ["Pay Period Start", "Period Start", "Start Date"]);
  const explicitEnd = extractDateAfterLabel(text, ["Pay Period End", "Period End", "End Date"]);
  if (explicitStart && explicitEnd) return { start: explicitStart, end: explicitEnd };

  const rangePatterns = [
    /(?:Pay\s+Period\s*)?(?:Start|Period\s+Start)\s*:?\s*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}))(?:\s*(?:to|until|through|[-–—]|End|Period\s+End)\s*:?)\s*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}))/i,
    /Pay\s+Period\s*:?[\sA-Za-z]*?((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}))(?:\s*(?:to|until|through|[-–—])\s*)((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}))/i,
    /Period\s*:?[\sA-Za-z]*?((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}))(?:\s*(?:to|until|through|[-–—])\s*)((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}))/i
  ];
  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (match) return { start: parseDateValue(match[1]), end: parseDateValue(match[2]) };
  }

  for (const line of lines) {
    if (!/period|start|end/i.test(line)) continue;
    const dates = extractDates(line);
    if (dates.length >= 2) return { start: dates[0], end: dates[1] };
  }
  return { start: explicitStart || "", end: explicitEnd || "" };
}

function extractDates(text) {
  const matches = [...String(text).matchAll(/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})\b/g)];
  return matches.map((match) => parseDateValue(match[0])).filter(Boolean);
}

function extractDateAfterLabel(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{2,4})`, "i");
    const match = text.match(pattern);
    if (match) return parseDateValue(match[1]);
  }
  return "";
}

function extractLabeledText(text, labels, stopLabels) {
  for (const label of labels) {
    const stop = stopLabels.map(escapeRegExp).join("|");
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*([A-Za-z0-9 &.,'\\-\\/]+?)(?=\\s+(?:${stop})\\s*:?|$)`, "i");
    const match = text.match(pattern);
    if (match?.[1]) return cleanTextValue(match[1]);
  }
  return "";
}

function extractCompanyName(lines) {
  const companyLine = lines.find((line) => /\b(?:pty\s+ltd|services|group|co|operations|farm|hotel|mining|build)\b/i.test(line) && !/employee|position|location/i.test(line));
  return companyLine ? cleanTextValue(companyLine) : "";
}

function extractAbn(text) {
  const match = text.match(/\bABN\s*:?\s*((?:\d\s*){11}|\d{2}\s?\d{3}\s?\d{3}\s?\d{3})\b/i);
  return match ? formatAbn(match[1]) : "";
}

function extractCycle(text) {
  if (/\bfortnightly|fortnight|biweekly|bi-weekly\b/i.test(text)) return "Fortnightly";
  if (/\bweekly|week\b/i.test(text)) return "Weekly";
  if (/\bmonthly|month\b/i.test(text)) return "Monthly";
  return "";
}

function extractMoneyAfterLabel(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(?:AUD\\s*)?(?:A\\$|\\$)?\\s*([0-9,]+(?:\\.[0-9]{1,2})?)`, "i");
    const match = text.match(pattern);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return "";
}

function extractNumberAfterLabel(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?\\s*([0-9,]+(?:\\.[0-9]{1,2})?)`, "i");
    const match = text.match(pattern);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return "";
}

function extractStatePostcode(text) {
  const match = text.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+(\d{4})\b/i) || text.match(/\b(\d{4})\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i);
  if (!match) return { state: "", postcode: "" };
  if (/^\d/.test(match[1])) return { postcode: match[1], state: match[2].toUpperCase() };
  return { state: match[1].toUpperCase(), postcode: match[2] };
}

function parseDateValue(value) {
  const text = String(value || "").trim();
  let match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (match) return toIsoDate(normalizeYear(Number(match[3])), Number(match[2]), Number(match[1]));
  match = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);
  if (match) return toIsoDate(normalizeYear(Number(match[3])), monthNameToNumber(match[2]), Number(match[1]));
  match = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);
  if (match) return toIsoDate(normalizeYear(Number(match[3])), monthNameToNumber(match[1]), Number(match[2]));
  return "";
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[|·•]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeWhvText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function roundWhv(value, digits = 2) {
  const unit = 10 ** digits;
  return Math.round(Number(value || 0) * unit) / unit;
}

function pickTaxWithFallback(directTax, baseTax, grossPay, netPay) {
  const gross = Number(grossPay);
  const net = Number(netPay);
  for (const value of [directTax, baseTax]) {
    const tax = Number(value);
    if (Number.isFinite(tax) && tax >= 0 && (!Number.isFinite(gross) || gross <= 0 || tax < gross)) return roundWhv(tax, 2);
  }
  if (Number.isFinite(gross) && Number.isFinite(net) && gross > net) return roundWhv(gross - net, 2);
  return directTax || baseTax || "";
}

function cleanEmployerName(value) {
  return cleanTextValue(value)
    .replace(/^Employer(?:\s+Name)?\s+/i, "")
    .replace(/\s+PAYSLIP\b.*$/i, "")
    .replace(/\s+PAYG\s+Tax\b.*$/i, "")
    .replace(/\s+Tax\s+Withheld\b.*$/i, "")
    .replace(/\s+Gross\s+Pay\b.*$/i, "")
    .trim();
}

function cleanPositionName(value, employeeName) {
  let text = cleanTextValue(value)
    .replace(/\b(?:ABN\s*)?(?:\d\s*){11}\b/g, "")
    .replace(/\s+Location\b.*$/i, "")
    .replace(/\s+Industry\b.*$/i, "")
    .replace(/\s+Pay\s+Period\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (employeeName) {
    text = text.replace(new RegExp("^" + escapeRegExp(employeeName) + "\\s+", "i"), "").trim();
  }
  return text;
}

function extractEmployeeName(oneLine, directEmployee, baseEmployee, employerName, positionRaw, location, industry) {
  const direct = chooseUsefulText(directEmployee, baseEmployee);
  if (direct && !looksLikeEmployerText(direct, employerName) && !looksLikeNonPersonText(direct)) return direct;
  const excluded = normalizeWhvText([employerName, location, industry, "Pay Period Pay Date Gross Pay Net Pay Tax Withheld Superannuation Hours Worked Work Location Position Industry PAYSLIP"].join(" "));
  const candidates = [...oneLine.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g)].map((match) => match[1].trim());
  const scored = candidates
    .map((candidate) => ({ candidate, score: scorePersonCandidate(candidate, oneLine, excluded) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.candidate || "";
}

function scorePersonCandidate(candidate, oneLine, excluded) {
  const normalized = normalizeWhvText(candidate);
  if (!normalized || excluded.includes(normalized)) return 0;
  if (/\b(?:pay|period|date|gross|net|tax|withheld|superannuation|hours|worked|employer|employee|position|location|industry|services|group|operations|mining|build|hotel|farm|produce|pearls|coral|dust|outback|northern|riverland|blue|red|pty|ltd|mount|isa|port|douglas|mildura|loxton|broome|tourism|hospitality|construction|weekly|fortnightly|monthly|payslip|aud|qld|vic|wa|sa|nsw|tas|act|nt)\b/i.test(candidate)) return 0;
  let score = 10;
  const employeePattern = new RegExp("(?:Employee(?:\\s+Name)?\\s*:?\\s*)" + escapeRegExp(candidate), "i");
  if (employeePattern.test(oneLine)) score += 80;
  const abnBeforePosition = new RegExp(escapeRegExp(candidate) + "\\s+(?:\\d\\s*){11}\\s+", "i");
  if (abnBeforePosition.test(oneLine)) score += 45;
  if (candidate.split(/\s+/).length === 2) score += 10;
  return score;
}

function looksLikeNonPersonText(value) {
  return /\b(?:saturday|sunday|weekend|public|holiday|loading|allowance|ordinary|overtime|penalty|bonus|leave|annual|sick|meal|travel|site\s+allowance)\b/i.test(value);
}

function looksLikeEmployerText(value, employerName) {
  const text = normalizeWhvText(value);
  if (!text) return true;
  if (employerName && normalizeWhvText(employerName).includes(text)) return true;
  return /\b(?:employer|abn|pty|ltd|services|group|operations|payslip)\b/i.test(value);
}

function chooseUsefulText(...values) {
  for (const value of values) {
    const text = cleanTextValue(value);
    if (isUsefulWhvText(text)) return text;
  }
  return "";
}

function isUsefulWhvText(value) {
  const text = cleanTextValue(value);
  if (text.length < 2) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^[,./\-:]+$/.test(text)) return false;
  if (/^(abn|employer|employee|position|location|industry)$/i.test(text)) return false;
  if (/\b(?:pay period|pay date|gross pay|net pay|tax withheld|superannuation)\b/i.test(text)) return false;
  return text.length <= 80;
}

function normalizeCycle(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("fortnight") || text.includes("biweekly") || text.includes("bi-weekly")) return "Fortnightly";
  if (text.includes("week")) return "Weekly";
  if (text.includes("month")) return "Monthly";
  return value && CYCLE_OPTIONS.includes(value) ? value : "Unknown";
}

function textField(label, field, value) {
  return `<label class="field">${label}<input type="text" data-field="${field}" value="${escapeHtml(value)}"></label>`;
}

function dateField(label, field, value) {
  return `<label class="field">${label}<input type="date" data-field="${field}" value="${escapeHtml(value)}"></label>`;
}

function numberField(label, field, value, step) {
  return `<label class="field">${label}<input type="number" min="0" step="${step}" data-field="${field}" value="${escapeHtml(value)}" inputmode="decimal"></label>`;
}

function readonlyMetric(label, value) {
  return `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function checkboxField(field, checked, label) {
  return `<label><input type="checkbox" data-field="${field}" ${checked ? "checked" : ""}> ${label}</label>`;
}

function toggleOtherIndustry(els) {
  els.industryOther.hidden = els.industry.value !== "other";
}

function setStatus(els, message, tone = "info") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function setProgress(els, value) {
  els.progress.value = Math.min(100, Math.max(0, value));
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffInclusiveDays(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function readNumber(value, fallback = 0) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function cleanTextValue(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/^[:\-\s]+|[:\-\s]+$/g, "").trim();
}

function formatAbn(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length !== 11) return cleanTextValue(value);
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

function normalizeYear(year) {
  return year < 100 ? 2000 + year : year;
}

function monthNameToNumber(name) {
  const short = String(name || "").toLowerCase().slice(0, 3);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(short) + 1;
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bootAustraliaWhv88DaysCalculator() {
  initAustraliaWhv88DaysCalculator();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAustraliaWhv88DaysCalculator, { once: true });
  } else {
    bootAustraliaWhv88DaysCalculator();
  }
}
