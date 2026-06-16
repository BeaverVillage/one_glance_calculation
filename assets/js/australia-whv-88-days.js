import { extractTextFromPayslipFile, getUnsupportedPayslipFileMessage, isSupportedPayslipFile } from "./payslip-ocr.js?v=20260616-image-ocr-3";
import { parsePayslipText } from "./australia-pay.js?v=20260616-image-ocr-3";

const SECOND_VISA_DAYS = 88;
const THIRD_VISA_DAYS = 179;
const CYCLE_OPTIONS = ["Weekly", "Fortnightly", "Monthly", "Unknown"];

let whvIdSequence = 0;

export function initAustraliaWhv88DaysCalculator(root = document) {
  const form = root.querySelector("#whv-88-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "whv-88-days") return;
  form.dataset.calculatorReady = "whv-88-days";

  const state = { records: [] };
  const els = {
    form,
    files: root.querySelector("#whv-payslip-files"),
    status: root.querySelector("#whv-ocr-status"),
    progress: root.querySelector("#whv-ocr-progress"),
    cards: root.querySelector("#whv-payslip-cards"),
    empty: root.querySelector("#whv-empty-state"),
    targetVisa: root.querySelector("#whv-target-visa"),
    subclass: root.querySelector("#whv-subclass"),
    ukPassport: root.querySelector("#whv-uk-passport"),
    industry: root.querySelector("#whv-industry"),
    industryOther: root.querySelector("#whv-industry-other"),
    postcode: root.querySelector("#whv-postcode"),
    stateTerritory: root.querySelector("#whv-state"),
    location: root.querySelector("#whv-location"),
    areaConfirmed: root.querySelector("#whv-area-confirmed"),
    employmentType: root.querySelector("#whv-employment-type"),
    dayHours: root.querySelector("#whv-day-hours"),
    weekDays: root.querySelector("#whv-week-days"),
    totalFiles: root.querySelector("#whv-total-files"),
    includedFiles: root.querySelector("#whv-included-files"),
    reviewFiles: root.querySelector("#whv-review-files"),
    overlapWarnings: root.querySelector("#whv-overlap-warnings"),
    calendarTotal: root.querySelector("#whv-calendar-total"),
    hoursTotal: root.querySelector("#whv-hours-total"),
    manualTotal: root.querySelector("#whv-manual-total"),
    finalDays: root.querySelector("#whv-final-days"),
    targetDays: root.querySelector("#whv-target-days"),
    remainingDays: root.querySelector("#whv-remaining-days"),
    progressBar: root.querySelector("#whv-progress-bar"),
    resultStatus: root.querySelector("#whv-result-status"),
    resultSummary: root.querySelector("#whv-result-summary"),
    duplicateMode: root.querySelector("#whv-dedupe-dates")
  };

  if (Object.values(els).some((element) => !element)) return;

  els.files.addEventListener("change", async () => {
    const files = Array.from(els.files.files || []);
    if (!files.length) return;
    await processFiles(files, state, els);
    els.files.value = "";
  });

  form.addEventListener("input", (event) => {
    if (event.target?.closest?.(".whv-payslip-card")) syncRecordFromCard(event.target.closest(".whv-payslip-card"), state);
    toggleOtherIndustry(els);
    renderSummary(state, els);
  });

  form.addEventListener("change", (event) => {
    if (event.target?.closest?.(".whv-payslip-card")) syncRecordFromCard(event.target.closest(".whv-payslip-card"), state);
    toggleOtherIndustry(els);
    renderCards(state, els);
    renderSummary(state, els);
  });

  toggleOtherIndustry(els);
  renderCards(state, els);
  renderSummary(state, els);
}

async function processFiles(files, state, els) {
  setProgress(els, 0);
  for (const file of files) {
    if (!isSupportedPayslipFile(file)) {
      setStatus(els, `${file.name}: ${getUnsupportedPayslipFileMessage(file)}`, "warn");
      continue;
    }

    try {
      setStatus(els, `${file.name} 분석 중입니다.`, "info");
      const extraction = await extractTextFromPayslipFile(file, {
        onStatus(message, tone) {
          setStatus(els, `${file.name}: ${message}`, tone);
        },
        onProgress(value) {
          setProgress(els, value);
        }
      });
      const parsed = parseWhvPayslipText(extraction.text);
      state.records.push(createRecord(file, extraction, parsed));
      setStatus(els, `${file.name}: 추출된 값을 확인해 주세요.`, "good");
    } catch (error) {
      console.error(error);
      state.records.push(createRecord(file, { text: "", method: "실패", fileKind: "unknown" }, {}, error?.userMessage || "파일 분석에 실패했습니다."));
      setStatus(els, `${file.name}: ${error?.userMessage || "파일 분석에 실패했습니다."}`, "warn");
    }
  }
  setProgress(els, 100);
  renderCards(state, els);
  renderSummary(state, els);
}

function createRecord(file, extraction, parsed, error = "") {
  return {
    id: `whv-${Date.now()}-${++whvIdSequence}`,
    fileName: file.name,
    method: extraction.method || "",
    text: extraction.text || "",
    error,
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
      manualDays: "",
      specifiedConfirmed: true,
      areaConfirmed: true,
      valuesConfirmed: true,
      include: true
    }
  };
}

export function parseWhvPayslipText(text) {
  const base = parsePayslipText(text || "");
  const normalized = normalizeOcrText(text);
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const oneLine = lines.join(" ").replace(/\s+/g, " ").trim();
  const periodRange = extractPayPeriodRange(oneLine, lines);
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
  const grossPay = directGross || base.grossPay;
  const netPay = directNet || base.netPay;
  const superannuation = directSuper || base.superannuation;
  const taxWithheld = pickTaxWithFallback(directTax, base.taxWithheld, grossPay, netPay);
  const employerName = cleanEmployerName(chooseUsefulText(directEmployer, base.employerName, extractCompanyName(lines)));
  const positionRaw = chooseUsefulText(directPosition, "");
  const employeeName = extractEmployeeName(oneLine, directEmployee, base.employeeName, employerName, positionRaw, location, directIndustry);
  const position = cleanPositionName(positionRaw, employeeName);

  return {
    grossPay,
    netPay,
    taxWithheld,
    superannuation,
    hoursWorked: extractNumberAfterLabel(oneLine, ["Hours Worked", "Total Hours", "Ordinary Hours"]) || base.hoursWorked,
    payDate: extractDateAfterLabel(oneLine, ["Pay Date", "Payment Date"]) || base.payDate,
    payPeriod: normalizeCycle(base.payPeriod || extractCycle(oneLine)),
    payCycle: normalizeCycle(base.payPeriod || extractCycle(oneLine)),
    employerName,
    employeeName,
    abn: extractAbn(oneLine),
    position,
    industry: chooseUsefulText(directIndustry, ""),
    location,
    postcode: statePostcode.postcode,
    state: statePostcode.state,
    payPeriodStart: periodRange.start,
    payPeriodEnd: periodRange.end
  };
}

function renderCards(state, els) {
  els.empty.hidden = state.records.length > 0;
  els.cards.innerHTML = state.records.map((record, index) => renderCard(record, index)).join("");
}

function renderCard(record, index) {
  const metrics = calculateRecordMetrics(record, 7.6);
  const status = getRecordReviewStatus(record, metrics);
  const cycleOptions = CYCLE_OPTIONS.map((cycle) => `<option value="${cycle}" ${normalizeCycle(record.fields.payCycle) === cycle ? "selected" : ""}>${cycle}</option>`).join("");
  const errorHtml = record.error ? `<p class="field-help warn">${escapeHtml(record.error)}</p>` : "";
  return `
    <article class="whv-payslip-card" data-record-id="${record.id}">
      <div class="section-heading-row compact-row">
        <div>
          <span>Payslip ${index + 1}</span>
          <h3>${escapeHtml(record.fileName)}</h3>
        </div>
        <strong class="decision-badge ${status.tone}">${status.label}</strong>
      </div>
      <p class="field-help">추출 방식: ${escapeHtml(record.method || "-")}</p>
      ${errorHtml}
      <div class="whv-card-grid">
        ${textField("Employer Name", "employerName", record.fields.employerName)}
        ${textField("ABN", "abn", record.fields.abn)}
        ${textField("Position / Job title", "position", record.fields.position)}
        ${textField("Employee Name", "employeeName", record.fields.employeeName)}
        ${dateField("Pay Period start", "payPeriodStart", record.fields.payPeriodStart)}
        ${dateField("Pay Period end", "payPeriodEnd", record.fields.payPeriodEnd)}
        ${dateField("Pay Date", "payDate", record.fields.payDate)}
        <label class="field">Pay Cycle<select data-field="payCycle">${cycleOptions}</select></label>
        ${numberField("Hours Worked", "hoursWorked", record.fields.hoursWorked, "0.01")}
        ${readonlyMetric("Calendar days", metrics.calendarDays || "-")}
        ${readonlyMetric("Hours 기준 추정 일수", metrics.hoursDaysRaw ? `${formatNumber(metrics.hoursDaysRaw, 2)}일 → ${metrics.hoursDaysFloor}일` : "-")}
        ${numberField("직접 입력 인정 일수", "manualDays", record.fields.manualDays, "1")}
      </div>
      <div class="check-field whv-card-checks">
        ${checkboxField("specifiedConfirmed", record.fields.specifiedConfirmed, "이 기간의 업무가 specified work 업종에 해당한다고 확인했습니다")}
        ${checkboxField("areaConfirmed", record.fields.areaConfirmed, "이 기간의 근무지가 eligible regional/remote/northern/designated area에 해당한다고 확인했습니다")}
        ${checkboxField("valuesConfirmed", record.fields.valuesConfirmed, "이 payslip의 Pay Period와 Hours Worked를 직접 확인했습니다")}
        ${checkboxField("include", record.fields.include, "이 payslip을 인정 가능 일수 계산에 포함하기")}
      </div>
      <p class="field-help">${escapeHtml(metrics.modeLabel)}</p>
      <details class="raw-text-box">
        <summary>추출 원문 보기</summary>
        <textarea readonly>${escapeHtml(record.text)}</textarea>
      </details>
    </article>
  `;
}

function renderSummary(state, els) {
  const options = readGlobalOptions(els);
  const records = state.records.map((record) => ({ record, metrics: calculateRecordMetrics(record, options.dayHours) }));
  const overlapWarnings = findOverlapWarnings(records.map((entry) => entry.record));
  const included = records.filter((entry) => isRecordIncluded(entry.record, entry.metrics));
  const review = records.length - included.length;
  const finalDays = calculateFinalDays(included, options.dedupeDates);
  const calendarTotal = sum(included.map((entry) => entry.metrics.calendarDays || 0));
  const hoursTotal = sum(included.map((entry) => entry.metrics.hoursDaysFloor || 0));
  const manualTotal = sum(included.map((entry) => Number(entry.record.fields.manualDays) || 0));
  const target = options.targetVisa === "third" ? THIRD_VISA_DAYS : SECOND_VISA_DAYS;
  const remaining = Math.max(0, target - finalDays);
  const progress = target > 0 ? Math.min(100, Math.round((finalDays / target) * 100)) : 0;
  const ukException = options.ukPassport && options.subclass === "417";
  const status = getOverallStatus({ finalDays, target, review, overlapCount: overlapWarnings.length, ukException });

  els.totalFiles.textContent = String(records.length);
  els.includedFiles.textContent = String(included.length);
  els.reviewFiles.textContent = String(review);
  els.overlapWarnings.textContent = String(overlapWarnings.length);
  els.calendarTotal.textContent = `${calendarTotal}일`;
  els.hoursTotal.textContent = `${hoursTotal}일`;
  els.manualTotal.textContent = `${manualTotal}일`;
  els.finalDays.textContent = `${finalDays}일`;
  els.targetDays.textContent = `${target}일`;
  els.remainingDays.textContent = `${remaining}일`;
  els.progressBar.value = progress;
  els.progressBar.setAttribute("aria-valuenow", String(progress));
  els.resultStatus.textContent = status.label;
  els.resultStatus.className = `decision-badge ${status.tone}`;
  els.resultSummary.textContent = buildSummaryText({ finalDays, target, remaining, options, status, review, overlapWarnings });
}

function readGlobalOptions(els) {
  return {
    subclass: els.subclass.value,
    targetVisa: els.targetVisa.value,
    ukPassport: els.ukPassport.checked,
    dayHours: readNumber(els.dayHours.value, 7.6),
    weekDays: readNumber(els.weekDays.value, 5),
    dedupeDates: els.duplicateMode.checked
  };
}

function syncRecordFromCard(card, state) {
  const record = state.records.find((item) => item.id === card.dataset.recordId);
  if (!record) return;
  card.querySelectorAll("[data-field]").forEach((input) => {
    const field = input.dataset.field;
    if (!field) return;
    if (input.type === "checkbox") record.fields[field] = input.checked;
    else record.fields[field] = input.value;
  });
}

function calculateRecordMetrics(record, dayHours) {
  const start = parseIsoDate(record.fields.payPeriodStart);
  const end = parseIsoDate(record.fields.payPeriodEnd);
  const calendarDays = start && end && end >= start ? diffInclusiveDays(start, end) : 0;
  const hours = readNumber(record.fields.hoursWorked, 0);
  const safeDayHours = dayHours > 0 ? dayHours : 7.6;
  const hoursDaysRaw = hours > 0 ? hours / safeDayHours : 0;
  const hoursDaysFloor = hoursDaysRaw > 0 ? Math.floor(hoursDaysRaw) : 0;
  const manualDays = readNumber(record.fields.manualDays, 0);
  const hasManual = manualDays > 0;
  const appliedDays = hasManual ? Math.floor(manualDays) : (calendarDays || hoursDaysFloor || 0);
  const cycle = normalizeCycle(record.fields.payCycle);
  const modeLabel = hasManual
    ? "사용자 수정값 사용: 직접 입력한 인정 일수를 최종 계산에 우선 반영합니다."
    : calendarDays
      ? `Pay Period calendar days 방식: 시작일과 종료일을 포함해 ${calendarDays}일로 계산합니다.`
      : hoursDaysFloor
        ? `Hours 기반 추정 방식: ${hours}시간 ÷ ${safeDayHours}시간 = ${formatNumber(hoursDaysRaw, 2)}일, 내림 ${hoursDaysFloor}일입니다. 공식 확정 계산이 아닌 참고용 추정입니다.`
        : "Pay Period 또는 Hours Worked를 확인해 주세요.";
  return { calendarDays, hours, hoursDaysRaw, hoursDaysFloor, manualDays, hasManual, appliedDays, cycle, modeLabel };
}

function isRecordIncluded(record, metrics) {
  return Boolean(record.fields.include && record.fields.specifiedConfirmed && record.fields.areaConfirmed && record.fields.valuesConfirmed && metrics.appliedDays > 0);
}

function calculateFinalDays(included, dedupeDates) {
  if (!dedupeDates) return sum(included.map((entry) => entry.metrics.appliedDays));
  const dateSet = new Set();
  let nonDateDays = 0;
  for (const entry of included) {
    const start = parseIsoDate(entry.record.fields.payPeriodStart);
    const end = parseIsoDate(entry.record.fields.payPeriodEnd);
    if (start && end && end >= start && !entry.metrics.hasManual) {
      for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
        dateSet.add(new Date(time).toISOString().slice(0, 10));
      }
    } else {
      nonDateDays += entry.metrics.appliedDays;
    }
  }
  return dateSet.size + nonDateDays;
}

function findOverlapWarnings(records) {
  const ranges = records
    .map((record) => ({ record, start: parseIsoDate(record.fields.payPeriodStart), end: parseIsoDate(record.fields.payPeriodEnd) }))
    .filter((entry) => entry.start && entry.end && entry.end >= entry.start);
  const warnings = [];
  for (let outer = 0; outer < ranges.length; outer += 1) {
    for (let inner = outer + 1; inner < ranges.length; inner += 1) {
      if (ranges[outer].start <= ranges[inner].end && ranges[inner].start <= ranges[outer].end) {
        warnings.push([ranges[outer].record.fileName, ranges[inner].record.fileName]);
      }
    }
  }
  return warnings;
}

function getRecordReviewStatus(record, metrics) {
  if (record.error) return { label: "분석 실패", tone: "warn" };
  if (!record.fields.include) return { label: "제외", tone: "neutral" };
  if (!record.fields.specifiedConfirmed || !record.fields.areaConfirmed || !record.fields.valuesConfirmed || !metrics.appliedDays) return { label: "검토 필요", tone: "warn" };
  return { label: "계산 포함", tone: "good" };
}

function getOverallStatus({ finalDays, target, review, overlapCount, ukException }) {
  if (ukException) return { label: "UK passport holder 예외 가능성 있음", tone: "neutral" };
  if (review > 0 || overlapCount > 0) return { label: "검토 필요", tone: "warn" };
  if (finalDays >= target) return { label: "기준 충족 가능성 높음", tone: "good" };
  if (target - finalDays <= 14) return { label: "기준 근접", tone: "neutral" };
  return { label: "아직 부족", tone: "warn" };
}

function buildSummaryText({ finalDays, target, remaining, options, review, overlapWarnings }) {
  if (options.ukPassport && options.subclass === "417") {
    return "UK passport holder로 선택되었습니다. 2024년 7월 1일 이후 신청하는 subclass 417 second/third visa는 specified work requirement가 면제될 수 있으므로, 공식 Home Affairs 안내를 확인하세요. 근무일 계산이 필수 요건이 아닐 수 있습니다.";
  }

  const targetLabel = options.targetVisa === "third" ? "Third visa" : "Second visa";
  const warningTail = [
    review > 0 ? `${review}개 payslip은 검토가 필요합니다.` : "",
    overlapWarnings.length > 0 ? `${overlapWarnings.length}건의 기간 겹침 경고가 있습니다.` : ""
  ].filter(Boolean).join(" ");

  if (finalDays >= target) {
    return `입력된 payslip 기준으로 약 ${finalDays}일의 specified work 인정 가능 기간이 계산되었습니다. ${targetLabel} 기준 ${target}일을 넘지만, 실제 인정 여부는 업종·지역·증빙자료에 따라 달라질 수 있습니다. ${warningTail}`.trim();
  }

  return `현재 확인된 인정 가능 일수는 ${finalDays}일입니다. ${targetLabel} 기준까지 약 ${remaining}일이 더 필요할 수 있습니다. 실제 인정 여부는 공식 기준과 증빙자료를 확인해야 합니다. ${warningTail}`.trim();
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
