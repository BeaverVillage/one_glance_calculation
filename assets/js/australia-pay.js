import { getFormNumber } from "./utils.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 3;
const FRANKFURTER_API = "https://api.frankfurter.dev/v2/rates";
const PDF_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const FIELD_LABELS = {
  grossPay: ["gross pay", "total gross", "gross earnings"],
  netPay: ["net pay", "total net", "amount paid"],
  taxWithheld: ["tax withheld", "payg withholding", "payg", "tax"],
  superannuation: ["employer super", "superannuation", "super"],
  hoursWorked: ["hours worked", "total hours", "ordinary hours"],
  payDate: ["pay date", "payment date", "period ending"],
  payPeriod: ["pay period", "period"],
  employerName: ["employer name", "employer"],
  employeeName: ["employee name", "employee"]
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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    grossPay: findMoney(lines, FIELD_LABELS.grossPay),
    netPay: findMoney(lines, FIELD_LABELS.netPay),
    taxWithheld: findMoney(lines, FIELD_LABELS.taxWithheld, { skip: ["taxable", "before tax"] }),
    superannuation: findMoney(lines, FIELD_LABELS.superannuation),
    hoursWorked: findHours(lines, FIELD_LABELS.hoursWorked),
    payDate: findDate(lines, FIELD_LABELS.payDate),
    payPeriod: findPayPeriod(lines),
    employerName: findLabelText(lines, FIELD_LABELS.employerName),
    employeeName: findLabelText(lines, FIELD_LABELS.employeeName)
  };
}

function findMoney(lines, labels, options = {}) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);
    if (options.skip?.some((word) => lower.includes(word))) continue;
    const label = labels.find((item) => lower.includes(item));
    if (!label) continue;
    const afterLabel = line.slice(lower.indexOf(label) + label.length);
    const local = extractMoneyValues(afterLabel);
    if (local.length) return local[local.length - 1];
    const sameLine = extractMoneyValues(line);
    if (sameLine.length) return sameLine[sameLine.length - 1];
    const nextLine = lines[index + 1] || "";
    const nextValues = extractMoneyValues(nextLine);
    if (nextValues.length) return nextValues[0];
  }
  return "";
}

function extractMoneyValues(text) {
  const values = [];
  const moneyPattern = /(?:AUD\s*)?\$?\s*(-?\(?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\(?\d+(?:\.\d{1,2})?)\)?/gi;
  for (const match of text.matchAll(moneyPattern)) {
    const value = parseNumeric(match[1]);
    if (Number.isFinite(value) && value >= 0 && value < 1000000) {
      values.push(value);
    }
  }
  return values;
}

function findHours(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);
    const label = labels.find((item) => lower.includes(item));
    if (!label) continue;
    const afterLabel = line.slice(lower.indexOf(label) + label.length);
    const hours = extractHourValues(afterLabel);
    if (hours.length) return hours[0];
    const sameLine = extractHourValues(line);
    if (sameLine.length) return sameLine[sameLine.length - 1];
    const nextLine = lines[index + 1] || "";
    const nextHours = extractHourValues(nextLine);
    if (nextHours.length) return nextHours[0];
  }
  return "";
}

function extractHourValues(text) {
  return [...text.matchAll(/\b(\d{1,3}(?:\.\d{1,2})?)\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 400);
}

function findDate(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);
    if (!labels.some((label) => lower.includes(label))) continue;
    const date = parseDateFromText(line) || parseDateFromText(lines[index + 1] || "");
    if (date) return date;
  }
  return "";
}

function findPayPeriod(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);
    if (!FIELD_LABELS.payPeriod.some((label) => lower.includes(label))) continue;
    const explicit = detectPeriodKeyword(lower);
    if (explicit) return explicit;
    const range = inferPeriodFromDates(line);
    if (range) return range;
  }

  const allText = normalizeText(lines.join(" "));
  return detectPeriodKeyword(allText) || "";
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

function findLabelText(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);
    const label = labels.find((item) => lower.includes(item));
    if (!label) continue;
    const afterLabel = line.slice(lower.indexOf(label) + label.length);
    const value = cleanLabelText(afterLabel) || cleanLabelText(lines[index + 1] || "");
    if (value && !extractMoneyValues(value).length) return value.slice(0, 80);
  }
  return "";
}

function cleanLabelText(text) {
  return text
    .replace(/^[:\-\s]+/, "")
    .replace(/\b(employee|employer|name)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  setInputValue(els.grossPay, parsed.grossPay);
  setInputValue(els.netPay, parsed.netPay);
  setInputValue(els.taxWithheld, parsed.taxWithheld);
  setInputValue(els.superannuation, parsed.superannuation);
  setInputValue(els.hoursWorked, parsed.hoursWorked);
  setInputValue(els.payDate, parsed.payDate);
  setInputValue(els.payPeriod, parsed.payPeriod);
  setInputValue(els.employerName, parsed.employerName);
  setInputValue(els.employeeName, parsed.employeeName);
}

function setInputValue(input, value) {
  if (value === "" || value === null || value === undefined) return;
  input.value = typeof value === "number" ? round(value, 2) : value;
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
  const netPayAud = net > 0 ? net : Math.max(0, gross - tax);
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
    periodLabel: getPeriodLabel(values.payPeriod)
  };
}

async function updateExchangeRate(els, announce) {
  const payDate = els.payDate.value;
  setRateMeta(els, "환율 조회 중...");
  try {
    const rateInfo = await fetchAudKrwRate(payDate);
    els.exchangeRate.value = round(rateInfo.rate, 4);
    setRateMeta(els, `적용 환율: 1 AUD = ${round(rateInfo.rate, 4).toLocaleString("ko-KR")}원 · 기준일 ${rateInfo.date}${rateInfo.fallback ? " (최신 환율)" : ""}`);
    if (announce) setStatus(els, "환율을 조회해 입력했습니다.", "good");
    return rateInfo;
  } catch (error) {
    const manualRate = readNumber(els.exchangeRate.value);
    if (Number.isFinite(manualRate) && manualRate > 0) {
      setRateMeta(els, `환율 API 조회에 실패해 직접 입력한 1 AUD = ${manualRate.toLocaleString("ko-KR")}원을 사용합니다.`);
      if (announce) setStatus(els, "환율 API 조회에 실패했습니다. 직접 입력한 환율을 사용합니다.", "warn");
      return { rate: manualRate, date: "직접 입력", fallback: true };
    }
    setRateMeta(els, "환율 API 조회에 실패했습니다. 환율을 직접 입력해 주세요.");
    if (announce) setStatus(els, "환율 API 조회에 실패했습니다. 환율을 직접 입력해 주세요.", "warn");
    return null;
  }
}

export async function fetchAudKrwRate(date = "") {
  try {
    if (date) return await requestRate(date, false);
  } catch {
    return requestRate("", true);
  }
  return requestRate("", false);
}

async function requestRate(date, fallback) {
  const params = new URLSearchParams({ base: "AUD", quotes: "KRW" });
  if (date) params.set("date", date);
  const response = await fetch(`${FRANKFURTER_API}?${params.toString()}`);
  if (!response.ok) throw new Error("exchange-rate-failed");
  const data = await response.json();
  const rate = Number(data?.rates?.KRW ?? data?.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("exchange-rate-missing");
  return {
    rate,
    date: data.date || date || "latest",
    fallback
  };
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
  els.resultSummary.textContent = `${result.periodLabel} 실수령액 기준으로 연 환산 ${formatWon(result.annualNetKrw)}입니다. Superannuation은 실수령액에 포함하지 않았습니다.`;
  setRateMeta(els, `적용 환율: 1 AUD = ${round(rate, 4).toLocaleString("ko-KR")}원 · 기준일 ${rateInfo?.date || "직접 입력"}${rateInfo?.fallback ? " (대체 적용)" : ""}`);
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
