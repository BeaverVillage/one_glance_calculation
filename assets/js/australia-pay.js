import { getFormNumber } from "./utils.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 3;
const FRANKFURTER_API = "https://api.frankfurter.dev/v1";
const PDF_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const FIELD_LABELS = {
  grossPay: ["gross pay", "total gross", "gross earnings"],
  netPay: ["net pay", "total net", "amount paid", "pay amount"],
  taxWithheld: ["tax withheld", "payg withholding", "payg", "tax"],
  superannuation: ["employer super", "superannuation", "super"],
  hoursWorked: ["hours worked", "total hours", "ordinary hours"],
  payDate: ["pay date", "payment date", "period ending"],
  payPeriod: ["pay period", "pay cycle", "period"],
  employerName: ["employer name", "employer"],
  employeeName: ["employee name", "employee"]
};

const MONEY_FIELD_CONFIGS = {
  grossPay: {
    labels: FIELD_LABELS.grossPay,
    forbiddenLabels: [...FIELD_LABELS.netPay, ...FIELD_LABELS.taxWithheld, ...FIELD_LABELS.superannuation]
  },
  netPay: {
    labels: FIELD_LABELS.netPay,
    forbiddenLabels: [...FIELD_LABELS.grossPay, ...FIELD_LABELS.taxWithheld, ...FIELD_LABELS.superannuation]
  },
  taxWithheld: {
    labels: FIELD_LABELS.taxWithheld,
    forbiddenLabels: [...FIELD_LABELS.grossPay, ...FIELD_LABELS.netPay, ...FIELD_LABELS.superannuation],
    skipWords: ["taxable", "before tax"]
  },
  superannuation: {
    labels: FIELD_LABELS.superannuation,
    forbiddenLabels: [...FIELD_LABELS.grossPay, ...FIELD_LABELS.netPay, ...FIELD_LABELS.taxWithheld],
    skipWords: ["superable"]
  }
};

export function initAustraliaPayCalculator(root = document) {
  const form = root.querySelector("#australia-pay-form");
  if (!form) return;
  if (form.dataset.calculatorReady === "australia-pay") return;
  form.dataset.calculatorReady = "australia-pay";

  const els = {
    form,
    pdfFile: root.querySelector("#au-pdf-file"),
    analyzeTextButton: root.querySelector("#au-analyze-text"),
    refreshRateButton: root.querySelector("#au-refresh-rate"),
    status: root.querySelector("#au-ocr-status"),
    progress: root.querySelector("#au-ocr-progress"),
    rawText: root.querySelector("#au-raw-text"),
    grossPay: root.querySelector("#au-gross-pay"),
    netPay: root.querySelector("#au-net-pay"),
    taxWithheld: root.querySelector("#au-tax-withheld"),
    superannuation: root.querySelector("#au-superannuation"),
    hoursWorked: root.querySelector("#au-hours-worked"),
    payDate: root.querySelector("#au-pay-date"),
    payPeriod: root.querySelector("#au-pay-period"),
    employerName: root.querySelector("#au-employer-name"),
    employeeName: root.querySelector("#au-employee-name"),
    exchangeRate: root.querySelector("#au-exchange-rate"),
    rateMeta: root.querySelector("#au-rate-meta"),
    periodNetAud: root.querySelector("#au-period-net-aud"),
    periodNetKrw: root.querySelector("#au-period-net-krw"),
    annualNetAud: root.querySelector("#au-annual-net-aud"),
    annualNetKrw: root.querySelector("#au-annual-net-krw"),
    hourlyNetAud: root.querySelector("#au-hourly-net-aud"),
    hourlyNetKrw: root.querySelector("#au-hourly-net-krw"),
    superAud: root.querySelector("#au-super-aud"),
    superKrw: root.querySelector("#au-super-krw"),
    resultSummary: root.querySelector("#au-result-summary")
  };

  if (Object.values(els).some((element) => !element)) return;

  els.pdfFile.addEventListener("change", async () => {
    const file = els.pdfFile.files?.[0];
    if (!file) return;
    await analyzePdfFile(els, file);
  });

  els.analyzeTextButton.addEventListener("click", () => {
    applyParsedFields(els, parsePayslipText(els.rawText.value));
    setStatus(els, "붙여넣은 텍스트에서 값을 다시 찾았습니다. 자동 추출값을 확인한 뒤 계산해 주세요.", "good");
  });

  els.refreshRateButton.addEventListener("click", async () => {
    await updateExchangeRate(els, true);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await calculateFromConfirmedValues(els);
  });
}

async function analyzePdfFile(els, file) {
  resetOcrState(els);

  if (file.type && file.type !== "application/pdf") {
    setStatus(els, "PDF 파일만 업로드할 수 있습니다.", "warn");
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    setStatus(els, "PDF 파일은 5MB 이하만 지원합니다.", "warn");
    return;
  }

  try {
    setStatus(els, "PDF 분석 중입니다. 파일은 서버로 업로드하지 않고 브라우저에서 처리합니다.", "info");
    setProgress(els, 4);
    const pdfjsLib = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    if (pdf.numPages > MAX_PAGES) {
      await pdf.destroy?.();
      setStatus(els, "PDF는 우선 3페이지 이하만 지원합니다. 필요한 페이지만 분리해 다시 시도해 주세요.", "warn");
      setProgress(els, 0);
      return;
    }

    setStatus(els, "PDF 텍스트 추출 중입니다.", "info");
    const textResult = await extractTextFromPdf(pdf, els);
    let text = textResult.text;
    let method = "텍스트 추출";

    if (!isTextSufficient(text)) {
      setStatus(els, "텍스트가 충분하지 않아 OCR을 실행합니다.", "info");
      const tesseract = await getTesseract();
      text = await ocrPdfPages(pdf, tesseract, els);
      method = "OCR";
    }

    await pdf.destroy?.();
    els.rawText.value = text.trim();

    if (!els.rawText.value) {
      setStatus(els, "자동 인식에 실패했습니다. 명세서 내용을 직접 붙여넣어 주세요.", "warn");
      setProgress(els, 0);
      return;
    }

    applyParsedFields(els, parsePayslipText(els.rawText.value));
    setProgress(els, 100);
    setStatus(els, `${method} 결과를 입력칸에 채웠습니다. 금액과 날짜를 확인한 뒤 “이 값으로 계산하기”를 눌러 주세요.`, "good");
  } catch (error) {
    console.error(error);
    setProgress(els, 0);
    if (String(error?.message || "").includes("라이브러리")) {
      setStatus(els, `${error.message} 인터넷 연결, 광고 차단, CDN 차단 여부를 확인한 뒤 다시 시도해 주세요.`, "warn");
    } else {
      setStatus(els, "자동 인식에 실패했습니다. 명세서 내용을 직접 붙여넣어 주세요.", "warn");
    }
  }
}

async function extractTextFromPdf(pdf, els) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(els, `PDF 텍스트 추출 중입니다. ${pageNumber}/${pdf.numPages}페이지`, "info");
    setProgress(els, Math.round(8 + (pageNumber / pdf.numPages) * 32));
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => item.str)
      .filter(Boolean)
      .join(" ");
    pages.push(pageText);
  }
  return { text: pages.join("\n\n") };
}

async function ocrPdfPages(pdf, tesseract, els) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(els, `OCR 중입니다. ${pageNumber}/${pdf.numPages}페이지`, "info");
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    await page.render({ canvasContext: context, viewport }).promise;

    const result = await tesseract.recognize(canvas, "eng", {
      logger(message) {
        if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
          const pageProgress = (pageNumber - 1 + message.progress) / pdf.numPages;
          setProgress(els, Math.round(45 + pageProgress * 50));
        }
      }
    });
    pages.push(result?.data?.text || "");
  }
  return pages.join("\n\n");
}

function isTextSufficient(text) {
  const normalized = normalizeText(text);
  if (normalized.length < 80) return false;
  const labelHits = [
    FIELD_LABELS.grossPay,
    FIELD_LABELS.netPay,
    FIELD_LABELS.taxWithheld,
    FIELD_LABELS.hoursWorked,
    FIELD_LABELS.payDate
  ].filter((labels) => labels.some((label) => normalized.includes(label))).length;
  return labelHits >= 2;
}

export function parsePayslipText(text) {
  const lines = normalizeOcrLines(text);
  const paymentSummaryLines = getPaymentSummaryLines(lines);
  const paymentSummaryValues = parsePaymentSummaryValues(paymentSummaryLines);
  const meta = {};
  const parsed = {
    grossPay: pickMoneyField("grossPay", lines, paymentSummaryLines, MONEY_FIELD_CONFIGS.grossPay, meta, paymentSummaryValues),
    netPay: pickMoneyField("netPay", lines, paymentSummaryLines, MONEY_FIELD_CONFIGS.netPay, meta, paymentSummaryValues),
    taxWithheld: pickMoneyField("taxWithheld", lines, paymentSummaryLines, MONEY_FIELD_CONFIGS.taxWithheld, meta, paymentSummaryValues),
    superannuation: pickMoneyField("superannuation", lines, paymentSummaryLines, MONEY_FIELD_CONFIGS.superannuation, meta, paymentSummaryValues),
    hoursWorked: findHours(paymentSummaryLines.length ? paymentSummaryLines : lines, FIELD_LABELS.hoursWorked, meta) || findHours(lines, FIELD_LABELS.hoursWorked, meta),
    payDate: findDate(lines, FIELD_LABELS.payDate, meta),
    payPeriod: findPayPeriod(lines, meta),
    employerName: findLabelText(lines, FIELD_LABELS.employerName, meta, "employerName"),
    employeeName: findLabelText(lines, FIELD_LABELS.employeeName, meta, "employeeName")
  };

  flagDuplicateMoneyValues(parsed, meta);
  parsed.__meta = meta;
  return parsed;
}

function normalizeOcrLines(text) {
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/[₩￦]/g, " ")
    .replace(/\bA\s*\$/gi, "A$")
    .replace(/\bAUD\s*[:\-]?\s*/gi, "AUD ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[|·•]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function getPaymentSummaryLines(lines) {
  const start = lines.findIndex((line) => normalizeText(line).includes("payment summary"));
  if (start < 0) return [];
  return lines.slice(start, Math.min(lines.length, start + 10));
}

function pickMoneyField(fieldName, lines, paymentSummaryLines, config, meta, paymentSummaryValues) {
  const summaryValue = paymentSummaryValues[fieldName];
  if (Number.isFinite(summaryValue)) {
    meta[fieldName] = {
      confidence: "normal",
      source: paymentSummaryValues.__meta?.[fieldName]?.source || "payment-summary",
      label: paymentSummaryValues.__meta?.[fieldName]?.label || "",
      section: "payment-summary"
    };
    return summaryValue;
  }
  return moneyValue(findPreferredMoneyCandidate(lines, paymentSummaryLines, config, fieldName, meta));
}

function parsePaymentSummaryValues(lines) {
  const result = { __meta: {} };
  if (!lines.length) return result;

  applySummaryPair(result, lines, "grossPay", FIELD_LABELS.grossPay, "taxWithheld", FIELD_LABELS.taxWithheld);
  applySummaryPair(result, lines, "netPay", FIELD_LABELS.netPay, "superannuation", FIELD_LABELS.superannuation);

  for (const [fieldName, config] of Object.entries(MONEY_FIELD_CONFIGS)) {
    if (Number.isFinite(result[fieldName])) continue;
    const direct = findSummaryDirectMoney(lines, config.labels);
    const table = direct || findSummaryTableMoney(lines, fieldName);
    if (!table) continue;
    result[fieldName] = table.value;
    result.__meta[fieldName] = {
      source: table.source,
      label: table.label
    };
  }

  return result;
}

function applySummaryPair(result, lines, leftField, leftLabels, rightField, rightLabels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const leftMatch = findFirstLooseLabel(line, leftLabels);
    const rightMatch = findFirstLooseLabel(line, rightLabels);
    if (!leftMatch || !rightMatch) continue;

    const pairStart = Math.min(leftMatch.start, rightMatch.start);
    let values = extractMoneyValuesWithIndex(line)
      .filter((value) => value.index >= pairStart)
      .map((value) => value.value);
    let source = "payment-summary-pair-line";
    if (values.length < 2) {
      values = extractMoneyValues(lines[index + 1] || "");
      source = "payment-summary-pair-next-line";
    }
    if (values.length < 2) continue;

    if (!Number.isFinite(result[leftField])) {
      result[leftField] = values[0];
      result.__meta[leftField] = { source, label: leftMatch.label };
    }
    if (!Number.isFinite(result[rightField])) {
      result[rightField] = values[1];
      result.__meta[rightField] = { source, label: rightMatch.label };
    }
    return;
  }
}

function findFirstLooseLabel(line, labels) {
  const strict = labels
    .map((label) => findLabel(line, label))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.label.length - a.label.length)[0];
  if (strict) return strict;

  const normalizedLine = normalizeText(line);
  return labels
    .map((label) => {
      const normalizedLabel = normalizeText(label);
      const start = normalizedLine.indexOf(normalizedLabel);
      return start >= 0 ? { label, start, end: start + normalizedLabel.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.label.length - a.label.length)[0] || null;
}

function findSummaryDirectMoney(lines, labels) {
  for (const line of lines) {
    for (const label of labels) {
      const match = findLabel(line, label);
      if (!match) continue;
      const nextLabel = findNextKnownMoneyLabel(line, match.end);
      const segment = line.slice(match.end, nextLabel?.start ?? line.length);
      const values = extractMoneyValues(segment);
      if (Number.isFinite(values[0]) && values[0] >= 0) {
        return { value: values[0], label, source: "payment-summary-direct" };
      }
    }
  }
  return null;
}

function findNextKnownMoneyLabel(text, fromIndex) {
  return Object.values(MONEY_FIELD_CONFIGS)
    .flatMap((config) => config.labels)
    .map((label) => findLabel(text.slice(fromIndex), label))
    .filter(Boolean)
    .map((match) => ({ ...match, start: match.start + fromIndex, end: match.end + fromIndex }))
    .sort((a, b) => a.start - b.start)[0] || null;
}

function findSummaryTableMoney(lines, fieldName) {
  for (let index = 0; index < lines.length; index += 1) {
    const labels = collectSummaryMoneyLabels(lines[index]);
    const fieldIndex = labels.findIndex((label) => label.field === fieldName);
    if (fieldIndex < 0 || labels.length < 2) continue;

    const sameLineValues = extractMoneyValuesWithIndex(lines[index])
      .filter((value) => value.index >= labels[0].end)
      .map((value) => value.value);
    if (sameLineValues.length >= labels.length) {
      return {
        value: sameLineValues[fieldIndex],
        label: labels[fieldIndex].label,
        source: "payment-summary-table-line"
      };
    }

    const nextLine = lines[index + 1] || "";
    if (!nextLine || collectSummaryMoneyLabels(nextLine).length) continue;
    const nextLineValues = extractMoneyValues(nextLine);
    if (nextLineValues.length >= labels.length) {
      return {
        value: nextLineValues[fieldIndex],
        label: labels[fieldIndex].label,
        source: "payment-summary-table-next-line"
      };
    }
  }
  return null;
}

function collectSummaryMoneyLabels(line) {
  const normalizedLine = normalizeText(line);
  const matches = Object.entries(MONEY_FIELD_CONFIGS)
    .flatMap(([field, config]) => config.labels.map((label) => ({
      field,
      label,
      start: normalizedLine.indexOf(normalizeText(label)),
      end: normalizedLine.indexOf(normalizeText(label)) + normalizeText(label).length
    })))
    .filter((match) => match.start >= 0)
    .sort((a, b) => a.start - b.start || b.label.length - a.label.length);

  const selected = [];
  for (const match of matches) {
    const overlaps = selected.some((item) => match.start < item.end && match.end > item.start);
    if (!overlaps) selected.push(match);
  }
  return selected;
}

function findPreferredMoneyCandidate(lines, paymentSummaryLines, config, fieldName, meta) {
  const summaryCandidate = paymentSummaryLines.length
    ? findMoneyCandidate(paymentSummaryLines, config, fieldName, null, {
      section: "payment-summary",
      scoreBoost: 50
    })
    : null;
  const fullCandidate = findMoneyCandidate(lines, config, fieldName, null, {
    section: "full-text",
    scoreBoost: 0
  });
  const best = summaryCandidate || fullCandidate;

  meta[fieldName] = best
    ? {
      confidence: best.score >= 80 ? "normal" : "low",
      source: best.source,
      label: best.label,
      section: best.section
    }
    : { confidence: "missing", warning: "자동 추출하지 못했습니다. 직접 확인해 주세요." };
  return best || null;
}

function findMoneyCandidate(lines, config, fieldName, meta, options = {}) {
  const candidates = [];
  const scoreBoost = options.scoreBoost || 0;
  const section = options.section || "full-text";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = findBestLabel(line, config.labels);
    if (!label) continue;

    const lower = normalizeText(line);
    if (config.skipWords?.some((word) => lower.includes(word))) continue;

    const isolated = extractMoneyInLabelSegment(line, label);
    if (isolated.length) {
      candidates.push({
        value: isolated[0].value,
        score: 100 + label.label.length + scoreBoost,
        source: "same-line-segment",
        section,
        line,
        label: label.label
      });
      continue;
    }

    const paired = findPairedMoneyByLabelOrder(lines, index, fieldName);
    if (paired) {
      candidates.push({
        value: paired.value,
        score: 94 + label.label.length + scoreBoost,
        source: paired.source,
        section,
        line: paired.line,
        label: paired.label
      });
      continue;
    }

    const hasForbiddenContext = hasAnyLabel(line, config.forbiddenLabels);
    const sameLineAmounts = extractMoneyValuesWithIndex(line);
    const afterLabel = sameLineAmounts.filter((item) => item.index >= label.end);
    if (!hasForbiddenContext && afterLabel.length) {
      candidates.push({
        value: afterLabel[0].value,
        score: 86 + label.label.length + scoreBoost,
        source: "same-line-after-label",
        section,
        line,
        label: label.label
      });
      continue;
    }

    if (!hasForbiddenContext && sameLineAmounts.length === 1) {
      candidates.push({
        value: sameLineAmounts[0].value,
        score: 74 + label.label.length + scoreBoost,
        source: "same-line-single",
        section,
        line,
        label: label.label
      });
      continue;
    }

    for (let offset = 1; offset <= 2; offset += 1) {
      const nextLine = lines[index + offset] || "";
      if (!nextLine || hasAnyKnownFieldLabel(nextLine)) continue;
      const nextValues = extractMoneyValuesWithIndex(nextLine);
      if (nextValues.length === 1) {
        candidates.push({
          value: nextValues[0].value,
          score: 62 - offset * 4 + label.label.length + scoreBoost,
          source: "next-line-single",
          section,
          line: `${line} / ${nextLine}`,
          label: label.label
        });
        break;
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (meta) {
    meta[fieldName] = best
      ? { confidence: best.score >= 80 ? "normal" : "low", source: best.source, label: best.label, section: best.section }
      : { confidence: "missing", warning: "자동 추출하지 못했습니다. 직접 확인해 주세요." };
  }
  return best || null;
}

function moneyValue(candidate) {
  return candidate ? candidate.value : "";
}

function extractMoneyInLabelSegment(line, label) {
  const nextLabel = findNextKnownLabel(line, label.end);
  const segment = line.slice(label.end, nextLabel?.start ?? line.length);
  return extractMoneyValuesWithIndex(segment);
}

function findPairedMoneyByLabelOrder(lines, index, fieldName) {
  const line = lines[index];
  const labels = collectMoneyFieldLabels(line);
  const fieldIndex = labels.findIndex((label) => label.field === fieldName);
  if (fieldIndex < 0 || labels.length < 2) return null;

  const sameLineValues = extractMoneyValuesWithIndex(line)
    .filter((value) => value.index >= labels[0].end);
  if (sameLineValues.length >= labels.length) {
    return {
      value: sameLineValues[fieldIndex].value,
      source: "same-line-label-value-pair",
      line,
      label: labels[fieldIndex].label
    };
  }

  const nextLine = lines[index + 1] || "";
  if (!nextLine || hasAnyKnownFieldLabel(nextLine)) return null;

  const nextLineValues = extractMoneyValuesWithIndex(nextLine);
  if (nextLineValues.length >= labels.length) {
    return {
      value: nextLineValues[fieldIndex].value,
      source: "next-line-label-value-pair",
      line: `${line} / ${nextLine}`,
      label: labels[fieldIndex].label
    };
  }

  return null;
}

function collectMoneyFieldLabels(line) {
  const matches = Object.entries(MONEY_FIELD_CONFIGS)
    .flatMap(([field, config]) => config.labels
      .map((label) => findLabel(line, label))
      .filter(Boolean)
      .map((match) => ({ ...match, field })))
    .sort((a, b) => a.start - b.start || b.label.length - a.label.length);

  const selected = [];
  for (const match of matches) {
    const overlaps = selected.some((item) => match.start < item.end && match.end > item.start);
    if (!overlaps) selected.push(match);
  }
  return selected;
}

function findBestLabel(line, labels) {
  const matches = labels
    .map((label) => findLabel(line, label))
    .filter(Boolean)
    .sort((a, b) => b.label.length - a.label.length || a.start - b.start);
  return matches[0] || null;
}

function findLabel(line, label) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(label).replaceAll("\\ ", "\\s+")}(?=$|[^a-z0-9])`, "i");
  const match = pattern.exec(line);
  if (!match) return null;
  const start = match.index + match[1].length;
  return {
    label,
    start,
    end: start + match[0].slice(match[1].length).length
  };
}

function findNextKnownLabel(line, fromIndex) {
  return Object.values(FIELD_LABELS)
    .flat()
    .map((label) => findLabel(line.slice(fromIndex), label))
    .filter(Boolean)
    .map((match) => ({ ...match, start: match.start + fromIndex, end: match.end + fromIndex }))
    .sort((a, b) => a.start - b.start)[0] || null;
}

function hasAnyKnownFieldLabel(line) {
  return Object.values(FIELD_LABELS).flat().some((label) => Boolean(findLabel(line, label)));
}

function hasAnyLabel(line, labels = []) {
  return labels.some((label) => Boolean(findLabel(line, label)));
}

function extractMoneyValuesWithIndex(text) {
  const values = [];
  const moneyPattern = /(?:AUD\s*)?(?:A\$\s*|\$\s*)?(-?\(?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\(?\d{1,6}(?:\.\d{1,2})?)\)?/gi;
  for (const match of text.matchAll(moneyPattern)) {
    const value = parseNumeric(match[1]);
    if (Number.isFinite(value) && value >= 0 && value < 1000000) {
      values.push({ value, index: match.index ?? 0 });
    }
  }
  return values;
}

function extractMoneyValues(text) {
  return extractMoneyValuesWithIndex(text).map((item) => item.value);
}

function findHours(lines, labels, meta) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = findBestLabel(line, labels);
    if (!label) continue;
    const afterLabel = line.slice(label.end);
    const hours = extractHourValues(afterLabel);
    if (hours.length) {
      meta.hoursWorked = { confidence: "normal", label: label.label };
      return hours[0];
    }
    const nextLine = lines[index + 1] || "";
    if (hasAnyKnownFieldLabel(nextLine)) continue;
    const nextHours = extractHourValues(nextLine);
    if (nextHours.length === 1) {
      meta.hoursWorked = { confidence: "low", label: label.label };
      return nextHours[0];
    }
  }
  meta.hoursWorked = { confidence: "missing", warning: "근무시간을 자동 추출하지 못했습니다." };
  return "";
}

function extractHourValues(text) {
  return [...text.matchAll(/\b(\d{1,3}(?:\.\d{1,2})?)\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 400);
}

function findDate(lines, labels, meta) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!hasAnyLabel(line, labels)) continue;
    const date = parseDateFromText(line) || parseDateFromText(lines[index + 1] || "");
    if (date) {
      meta.payDate = { confidence: "normal" };
      return date;
    }
  }
  meta.payDate = { confidence: "missing", warning: "Pay Date를 자동 추출하지 못했습니다." };
  return "";
}

function findPayPeriod(lines, meta) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);
    if (!hasAnyLabel(line, FIELD_LABELS.payPeriod)) continue;
    const explicit = detectPeriodKeyword(lower);
    if (explicit) {
      meta.payPeriod = { confidence: "normal" };
      return explicit;
    }
    const range = inferPeriodFromDates(line);
    if (range) {
      meta.payPeriod = { confidence: "normal" };
      return range;
    }
  }

  const allText = normalizeText(lines.join(" "));
  const explicit = detectPeriodKeyword(allText);
  if (explicit) {
    meta.payPeriod = { confidence: "low" };
    return explicit;
  }
  meta.payPeriod = { confidence: "missing", warning: "급여 기간을 자동 추출하지 못했습니다." };
  return "";
}

function detectPeriodKeyword(text) {
  if (/\b(fortnight|fortnightly|biweekly|bi-weekly|2 weekly)\b/.test(text)) return "fortnightly";
  if (/\b(weekly|week)\b/.test(text)) return "weekly";
  if (/\b(monthly|month)\b/.test(text)) return "monthly";
  return "";
}

function inferPeriodFromDates(text) {
  const dates = [...text.matchAll(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g)]
    .map((match) => parseDateFromText(match[1]))
    .filter(Boolean)
    .map((value) => new Date(`${value}T00:00:00`));
  if (dates.length < 2) return "";
  const diffDays = Math.round(Math.abs(dates[1] - dates[0]) / 86400000) + 1;
  if (diffDays <= 8) return "weekly";
  if (diffDays <= 16) return "fortnightly";
  if (diffDays >= 27) return "monthly";
  return "";
}

function findLabelText(lines, labels, meta, fieldName) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = findBestLabel(line, labels);
    if (!label) continue;
    const afterLabel = line.slice(label.end);
    const value = cleanLabelText(afterLabel) || cleanLabelText(lines[index + 1] || "");
    if (value && isLikelyNameValue(value)) {
      meta[fieldName] = { confidence: "low", label: label.label };
      return value.slice(0, 80);
    }
  }
  meta[fieldName] = { confidence: "missing" };
  return "";
}

function cleanLabelText(text) {
  return text
    .replace(/^[:\-\s]+/, "")
    .replace(/\b(employee|employer|name)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyNameValue(value) {
  const normalized = normalizeText(value);
  if (!value || extractMoneyValues(value).length) return false;
  if (/^(details|summary|earnings|payments|deductions|tax|super|gross|net|hours|date|period)$/i.test(value)) return false;
  if (normalized.length < 2 || normalized.length > 80) return false;
  return /[a-z가-힣]/i.test(value);
}

function flagDuplicateMoneyValues(parsed, meta) {
  const fields = ["grossPay", "netPay", "taxWithheld", "superannuation"];
  const groups = new Map();

  for (const field of fields) {
    const value = parsed[field];
    if (!Number.isFinite(value) || value <= 0) continue;
    const key = round(value, 2).toFixed(2);
    groups.set(key, [...(groups.get(key) || []), field]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const field of group) {
      meta[field] = {
        ...(meta[field] || {}),
        confidence: "low",
        warning: "다른 항목과 같은 금액으로 추출되었습니다. 명세서 원문과 꼭 비교해 주세요."
      };
    }
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateFromText(text) {
  const iso = text.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const au = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (au) {
    const year = normalizeYear(Number(au[3]));
    return toIsoDate(year, Number(au[2]), Number(au[1]));
  }

  const monthNames = "jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december";
  const dayMonth = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s+(\\d{2,4})\\b`, "i"));
  if (dayMonth) {
    return toIsoDate(normalizeYear(Number(dayMonth[3])), monthNameToNumber(dayMonth[2]), Number(dayMonth[1]));
  }

  const monthDay = text.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2}),?\\s+(\\d{2,4})\\b`, "i"));
  if (monthDay) {
    return toIsoDate(normalizeYear(Number(monthDay[3])), monthNameToNumber(monthDay[1]), Number(monthDay[2]));
  }

  return "";
}

function normalizeYear(year) {
  return year < 100 ? 2000 + year : year;
}

function monthNameToNumber(name) {
  const short = name.toLowerCase().slice(0, 3);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(short) + 1;
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function applyParsedFields(els, parsed) {
  const fields = {
    grossPay: els.grossPay,
    netPay: els.netPay,
    taxWithheld: els.taxWithheld,
    superannuation: els.superannuation,
    hoursWorked: els.hoursWorked,
    payDate: els.payDate,
    payPeriod: els.payPeriod,
    employerName: els.employerName,
    employeeName: els.employeeName
  };

  clearExtractionHints(fields);

  for (const [fieldName, input] of Object.entries(fields)) {
    const value = parsed[fieldName];
    const didSet = setInputValue(input, value);
    if (!didSet) continue;

    const meta = parsed.__meta?.[fieldName];
    const warning = meta?.warning;
    const tone = meta?.confidence === "low" || warning ? "warn" : "info";
    const message = warning
      ? `자동 추출값이므로 확인 필요: ${warning}`
      : "자동 추출값이므로 확인 필요";
    markExtractionHint(input, message, tone);
  }
}

function setInputValue(input, value) {
  if (value === "" || value === null || value === undefined) return false;
  input.value = typeof value === "number" ? round(value, 2) : value;
  return true;
}

function clearExtractionHints(fields) {
  for (const input of Object.values(fields)) {
    input.classList.remove("auto-extracted", "needs-review");
    const field = input.closest(".field");
    field?.querySelector(".extraction-hint")?.remove();
  }
}

function markExtractionHint(input, message, tone = "info") {
  input.classList.add("auto-extracted");
  if (tone === "warn") input.classList.add("needs-review");

  const field = input.closest(".field");
  if (!field) return;
  const hint = document.createElement("p");
  hint.className = `extraction-hint${tone === "warn" ? " warn" : ""}`;
  hint.textContent = message;
  field.appendChild(hint);
}

async function calculateFromConfirmedValues(els) {
  const values = readConfirmedValues(els);
  const rateInfo = await updateExchangeRate(els, false);
  const manualRate = readNumber(els.exchangeRate.value);
  const rate = rateInfo?.rate || manualRate;

  if (!Number.isFinite(rate) || rate <= 0) {
    els.resultSummary.textContent = "환율을 조회하지 못했습니다. AUD/KRW 환율을 직접 입력한 뒤 다시 계산해 주세요.";
    return;
  }

  const result = calculateAustraliaPay(values, rate);
  if (!result.netPayAud) {
    els.resultSummary.textContent = "Net Pay를 입력하거나 Gross Pay와 Tax Withheld를 함께 입력해 주세요.";
    return;
  }

  renderCalculationResult(els, result, rate, rateInfo);
}

function readConfirmedValues(els) {
  return {
    grossPay: getFormNumber(els.form, "grossPay", 0),
    netPay: getFormNumber(els.form, "netPay", 0),
    taxWithheld: getFormNumber(els.form, "taxWithheld", 0),
    superannuation: getFormNumber(els.form, "superannuation", 0),
    hoursWorked: getFormNumber(els.form, "hoursWorked", 0),
    payDate: els.payDate.value,
    payPeriod: els.payPeriod.value
  };
}

export function calculateAustraliaPay(values, exchangeRate) {
  const gross = Math.max(0, values.grossPay || 0);
  const tax = Math.max(0, values.taxWithheld || 0);
  const net = Math.max(0, values.netPay || 0);
  const usesNetPay = net > 0;
  const netPayAud = usesNetPay ? net : Math.max(0, gross - tax);
  const superAud = Math.max(0, values.superannuation || 0);
  const hours = Math.max(0, values.hoursWorked || 0);
  const multiplier = getPeriodMultiplier(values.payPeriod);
  const annualNetAud = netPayAud * multiplier;
  const hourlyNetAud = hours > 0 ? netPayAud / hours : 0;

  return {
    netPayAud,
    netPayKrw: netPayAud * exchangeRate,
    annualNetAud,
    annualNetKrw: annualNetAud * exchangeRate,
    hourlyNetAud,
    hourlyNetKrw: hourlyNetAud * exchangeRate,
    superAud,
    superKrw: superAud * exchangeRate,
    multiplier,
    periodLabel: getPeriodLabel(values.payPeriod),
    basis: usesNetPay ? "netPay" : "grossMinusTax",
    basisLabel: usesNetPay ? "Net Pay" : "Gross Pay - Tax Withheld"
  };
}

async function updateExchangeRate(els, announce) {
  const payDate = els.payDate.value;
  setRateMeta(els, "환율 조회 중...");
  const rateInfo = await fetchAudKrwRate(payDate);
  if (rateInfo) {
    els.exchangeRate.value = round(rateInfo.rate, 4);
    setRateMeta(els, `적용 환율: 1 AUD = ${round(rateInfo.rate, 4).toLocaleString("ko-KR")}원, 기준일: ${rateInfo.date}, 출처: ${rateInfo.source}${rateInfo.fallback ? " (최신 환율로 대체)" : ""}`);
    if (announce) setStatus(els, "환율을 조회해 입력했습니다.", "good");
    return rateInfo;
  }

  const manualRate = readNumber(els.exchangeRate.value);
  if (Number.isFinite(manualRate) && manualRate > 0) {
    setRateMeta(els, `환율 API 조회에 실패했습니다. 직접 입력 모드로 전환해 1 AUD = ${manualRate.toLocaleString("ko-KR")}원을 사용합니다.`);
    if (announce) setStatus(els, "환율 API 조회에 실패했습니다. 직접 입력한 환율을 사용합니다.", "warn");
    return { rate: manualRate, date: "직접 입력", source: "사용자 입력", fallback: true };
  }

  setRateMeta(els, "환율 API 조회에 실패했습니다. 직접 입력 모드로 전환했습니다. AUD/KRW 환율을 직접 입력해 주세요.");
  if (announce) setStatus(els, "환율 API 조회에 실패했습니다. 환율을 직접 입력해 주세요.", "warn");
  return null;
}

export async function fetchAudKrwRate(payDate = "") {
  const endpoints = [];

  if (payDate && !isFutureIsoDate(payDate)) {
    endpoints.push({
      url: `${FRANKFURTER_API}/${payDate}?base=AUD&symbols=KRW`,
      fallback: false
    });
  }

  endpoints.push({
    url: `${FRANKFURTER_API}/latest?base=AUD&symbols=KRW`,
    fallback: Boolean(payDate)
  });

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const rate = data?.rates?.KRW;

      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        return {
          rate,
          date: data.date || payDate || "latest",
          source: "Frankfurter",
          fallback: endpoint.fallback
        };
      }

      throw new Error("KRW rate missing");
    } catch (error) {
      console.error("AUD/KRW exchange rate fetch failed:", endpoint.url, error);
    }
  }

  return null;
}

function isFutureIsoDate(value) {
  const match = String(value).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() > today.getTime();
}

function renderCalculationResult(els, result, rate, rateInfo) {
  els.periodNetAud.textContent = formatAud(result.netPayAud);
  els.periodNetKrw.textContent = formatWon(result.netPayKrw);
  els.annualNetAud.textContent = formatAud(result.annualNetAud);
  els.annualNetKrw.textContent = formatWon(result.annualNetKrw);
  els.hourlyNetAud.textContent = result.hourlyNetAud > 0 ? formatAud(result.hourlyNetAud) : "-";
  els.hourlyNetKrw.textContent = result.hourlyNetKrw > 0 ? formatWon(result.hourlyNetKrw) : "-";
  els.superAud.textContent = result.superAud > 0 ? formatAud(result.superAud) : "-";
  els.superKrw.textContent = result.superKrw > 0 ? formatWon(result.superKrw) : "-";
  els.resultSummary.textContent = `${result.periodLabel} ${result.basisLabel} 기준으로 연 환산 ${formatWon(result.annualNetKrw)}입니다. Superannuation은 실수령액에 포함하지 않았습니다.`;
  setRateMeta(els, `적용 환율: 1 AUD = ${round(rate, 4).toLocaleString("ko-KR")}원, 기준일: ${rateInfo?.date || "직접 입력"}, 출처: ${rateInfo?.source || "사용자 입력"}${rateInfo?.fallback ? " (대체 적용)" : ""}`);
}

function getPeriodMultiplier(period) {
  if (period === "monthly") return 12;
  if (period === "fortnightly") return 26;
  return 52;
}

function getPeriodLabel(period) {
  if (period === "monthly") return "월급";
  if (period === "fortnightly") return "2주급";
  return "주급";
}

async function getPdfJs() {
  await waitForGlobal("pdfjsLib");
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return pdfjsLib;
}

async function getTesseract() {
  await waitForGlobal("Tesseract");
  return window.Tesseract;
}

async function waitForGlobal(name) {
  for (let tries = 0; tries < 40; tries += 1) {
    if (window[name]) return;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  throw new Error(`${name} 라이브러리를 불러오지 못했습니다.`);
}

function resetOcrState(els) {
  els.rawText.value = "";
  setProgress(els, 0);
}

function setStatus(els, message, tone = "info") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function setProgress(els, value) {
  els.progress.value = Math.min(100, Math.max(0, value));
}

function setRateMeta(els, message) {
  els.rateMeta.textContent = message;
}

function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function parseNumeric(value) {
  const normalized = String(value).replace(/[,$()]/g, "");
  return Number(normalized);
}

function readNumber(value) {
  const normalized = String(value).replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatAud(value) {
  if (!Number.isFinite(value)) return "-";
  return `A$${value.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatWon(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function round(value, digits = 0) {
  const unit = 10 ** digits;
  return Math.round(value * unit) / unit;
}

function bootAustraliaPayCalculator() {
  initAustraliaPayCalculator();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAustraliaPayCalculator, { once: true });
  } else {
    bootAustraliaPayCalculator();
  }
}
