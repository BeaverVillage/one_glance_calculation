const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 3;
const MAX_IMAGE_LONG_EDGE = 2000;
const PDF_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const FIELD_LABELS = {
  grossPay: ["gross pay", "total gross", "gross earnings"],
  netPay: ["net pay", "total net", "amount paid", "pay amount"],
  taxWithheld: ["tax withheld", "payg withholding", "payg", "tax"],
  superannuation: ["employer super", "superannuation", "super"],
  hoursWorked: ["hours worked", "total hours", "ordinary hours"],
  payDate: ["pay date", "payment date", "period ending"],
  payPeriod: ["pay period", "pay cycle", "period"],
  abn: ["abn"],
  position: ["position", "job title", "role"]
};

const SECTION_RULES = [
  { id: "paymentSummary", labels: ["payment summary"] },
  { id: "hoursAndEarnings", labels: ["hours and earnings", "hours & earnings"] },
  { id: "taxesDeductionsSuper", labels: ["taxes, deductions & super", "taxes deductions super"] },
  { id: "deductionsTax", labels: ["deductions / tax", "deductions and tax", "deductions", "tax deductions"] },
  { id: "superannuation", labels: ["superannuation"] },
  { id: "earnings", labels: ["earnings"] },
  { id: "bankPaymentDetails", labels: ["bank payment details", "bank details", "payment details"] },
  { id: "employeeDetails", labels: ["employee & employment details", "employee details", "employment details"] },
  { id: "ocrTestNotes", labels: ["ocr test notes", "expected key fields"] }
];

export function getSupportedPayslipAccept() {
  return ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
}

export function isSupportedPdfFile(file) {
  return Boolean(file) && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
}

export function isSupportedImageFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return SUPPORTED_IMAGE_TYPES.includes(file.type) || SUPPORTED_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function isSupportedPayslipFile(file) {
  return isSupportedPdfFile(file) || isSupportedImageFile(file);
}

export function getUnsupportedPayslipFileMessage(file) {
  const name = String(file?.name || "").toLowerCase();
  if (file?.size > MAX_TOTAL_BYTES) return "10MB 이상 대용량 파일은 지원하지 않습니다.";
  if (/\.(heic|heif)$/i.test(name)) return "HEIC 파일은 지원하지 않습니다. JPG, PNG 또는 WEBP로 변환해 업로드해 주세요.";
  if (/\.(tif|tiff)$/i.test(name)) return "TIFF 파일은 지원하지 않습니다. JPG, PNG 또는 WEBP 파일을 사용해 주세요.";
  if (/\.(doc|docx|xls|xlsx)$/i.test(name)) return "Word 또는 Excel 파일은 지원하지 않습니다. 급여명세서를 PDF나 이미지로 준비해 주세요.";
  return "지원하지 않는 파일 형식입니다. PDF, JPG, PNG, WEBP 파일을 업로드해 주세요.";
}

export async function extractTextFromPayslipFile(file, callbacks = {}) {
  if (!file) throw createUserError("파일을 선택해 주세요.");
  if (file.size > MAX_TOTAL_BYTES) throw createUserError(getUnsupportedPayslipFileMessage(file));

  if (isSupportedPdfFile(file)) {
    if (file.size > MAX_PDF_BYTES) throw createUserError("PDF 파일은 5MB 이하만 지원합니다.");
    return extractTextFromPdfFile(file, callbacks);
  }

  if (isSupportedImageFile(file)) {
    if (file.size > MAX_IMAGE_BYTES) throw createUserError("이미지 파일은 5MB 이하만 지원합니다.");
    return extractTextFromImageFile(file, callbacks);
  }

  throw createUserError(getUnsupportedPayslipFileMessage(file));
}

export async function extractTextFromPdfFile(file, callbacks = {}) {
  notifyStatus(callbacks, "PDF 분석 중입니다. 파일은 서버로 업로드하지 않고 브라우저에서 처리합니다.", "info");
  notifyProgress(callbacks, 4);
  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  try {
    if (pdf.numPages > MAX_PAGES) {
      throw createUserError("PDF는 우선 3페이지 이하만 지원합니다. 필요한 페이지만 분리해 다시 시도해 주세요.");
    }

    notifyStatus(callbacks, "PDF 텍스트 추출 중입니다.", "info");
    const structured = await extractStructuredTextFromPdf(pdf, callbacks);
    let text = structured.rawText;
    let method = "PDF 텍스트 추출";

    if (!isTextSufficient(text)) {
      notifyStatus(callbacks, "텍스트가 충분하지 않아 OCR로 텍스트 추출 중입니다.", "info");
      const tesseract = await getTesseract();
      text = await ocrPdfPages(pdf, tesseract, callbacks);
      method = "PDF OCR";
    }

    notifyProgress(callbacks, 100);
    return { text: String(text || "").trim(), method, fileKind: "pdf", structured };
  } finally {
    await pdf.destroy?.();
  }
}

export async function extractTextFromImageFile(file, callbacks = {}) {
  notifyStatus(callbacks, "이미지 분석 중입니다. 파일은 서버로 업로드하지 않고 브라우저에서 처리합니다.", "info");
  notifyProgress(callbacks, 8);
  const sourceCanvas = await imageFileToCanvas(file);
  notifyProgress(callbacks, 20);
  const ocrCanvas = preprocessImageForOcr(sourceCanvas);
  const tesseract = await getTesseract();
  notifyStatus(callbacks, "OCR로 텍스트 추출 중입니다.", "info");
  const result = await tesseract.recognize(ocrCanvas, "eng", {
    logger(message) {
      if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
        notifyProgress(callbacks, Math.round(25 + message.progress * 70));
      }
    }
  });
  notifyProgress(callbacks, 100);
  return { text: String(result?.data?.text || "").trim(), method: "이미지 OCR", fileKind: "image" };
}

export function preprocessImageForOcr(canvas) {
  try {
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0);
    const imageData = context.getImageData(0, 0, output.width, output.height);
    const data = imageData.data;
    const contrast = 1.22;
    const intercept = 128 * (1 - contrast);

    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const adjusted = clamp(gray * contrast + intercept, 0, 255);
      data[index] = adjusted;
      data[index + 1] = adjusted;
      data[index + 2] = adjusted;
    }

    context.putImageData(imageData, 0, 0);
    return output;
  } catch (error) {
    console.error("Image preprocessing failed:", error);
    return canvas;
  }
}

async function imageFileToCanvas(file) {
  const bitmap = await loadImageBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  if (!width || !height) throw createUserError("이미지 크기를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.");

  const scale = Math.min(1, MAX_IMAGE_LONG_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === "function") bitmap.close();
  return canvas;
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      console.warn("createImageBitmap failed, falling back to HTMLImageElement:", error);
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(dataUrl);
  return image;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 파일을 불러오지 못했습니다."));
    image.src = src;
  });
}

async function extractStructuredTextFromPdf(pdf, callbacks) {
  const tokens = [];
  const fallbackPages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    notifyStatus(callbacks, `PDF 텍스트 추출 중입니다. ${pageNumber}/${pdf.numPages}페이지`, "info");
    notifyProgress(callbacks, Math.round(8 + (pageNumber / pdf.numPages) * 32));
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageTokens = textContent.items
      .map((item) => {
        const tokenText = String(item.str || "").trim();
        if (!tokenText) return null;
        const transform = item.transform || [];
        const height = Math.abs(transform[3] || item.height || 0) || 8;
        return {
          text: tokenText,
          x: Number(transform[4] || 0),
          y: Number(transform[5] || 0),
          width: Number(item.width || 0),
          height,
          pageNumber
        };
      })
      .filter(Boolean);
    tokens.push(...pageTokens);
    fallbackPages.push(pageTokens.map((token) => token.text).join(" "));
  }

  const lines = groupTokensIntoLines(tokens);
  const blocks = detectLayoutBlocks(lines);
  const rawText = lines.map((line) => line.text).filter(Boolean).join("\n").trim() || fallbackPages.join("\n\n");
  return { rawText, tokens, lines, blocks };
}

function groupTokensIntoLines(tokens) {
  const pages = new Map();
  for (const token of tokens) {
    if (!pages.has(token.pageNumber)) pages.set(token.pageNumber, []);
    pages.get(token.pageNumber).push(token);
  }

  const lines = [];
  for (const [pageNumber, pageTokens] of pages.entries()) {
    const sorted = pageTokens.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const grouped = [];

    for (const token of sorted) {
      const threshold = Math.max(3, Math.min(10, token.height * 0.65));
      let line = grouped.find((entry) => Math.abs(entry.y - token.y) <= threshold);
      if (!line) {
        line = { pageNumber, y: token.y, tokens: [] };
        grouped.push(line);
      }
      line.tokens.push(token);
      line.y = (line.y * (line.tokens.length - 1) + token.y) / line.tokens.length;
    }

    grouped
      .sort((a, b) => b.y - a.y)
      .forEach((line, index) => {
        const lineTokens = line.tokens.slice().sort((a, b) => a.x - b.x);
        const xs = lineTokens.map((token) => token.x);
        const xEnds = lineTokens.map((token) => token.x + token.width);
        lines.push({
          pageNumber,
          index,
          xMin: Math.min(...xs),
          xMax: Math.max(...xEnds),
          y: line.y,
          tokens: lineTokens,
          text: joinPdfLineTokens(lineTokens)
        });
      });
  }

  return lines;
}

function joinPdfLineTokens(tokens) {
  let result = "";
  let previous = null;
  for (const token of tokens) {
    if (!previous) {
      result = token.text;
    } else {
      const gap = token.x - (previous.x + previous.width);
      const spaces = gap > 22 ? "   " : " ";
      result += spaces + token.text;
    }
    previous = token;
  }
  return result.replace(/\s+/g, " ").trim();
}

function detectLayoutBlocks(lines) {
  const blocks = [];
  let current = { id: "header", lines: [] };
  const flush = () => {
    if (!current.lines.length) return;
    blocks.push({ ...current, text: current.lines.map((line) => line.text).join("\n") });
  };

  for (const line of lines) {
    const section = detectTemplateSection(line.text);
    if (section && section !== current.id) {
      flush();
      current = { id: section, lines: [] };
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}

async function ocrPdfPages(pdf, tesseract, callbacks) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    notifyStatus(callbacks, `OCR로 텍스트 추출 중입니다. ${pageNumber}/${pdf.numPages}페이지`, "info");
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
          notifyProgress(callbacks, Math.round(45 + pageProgress * 50));
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
    FIELD_LABELS.payDate,
    FIELD_LABELS.payPeriod,
    FIELD_LABELS.abn,
    FIELD_LABELS.position
  ].filter((labels) => labels.some((label) => normalized.includes(label))).length;
  return labelHits >= 2;
}

function detectTemplateSection(text) {
  const normalized = normalizeText(text);
  const rule = SECTION_RULES.find((section) => section.labels.some((label) => normalized.includes(label)));
  return rule?.id || "";
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
  throw createUserError(`${name} 라이브러리를 불러오지 못했습니다. 인터넷 연결, 광고 차단, CDN 차단 여부를 확인해 주세요.`);
}

function notifyStatus(callbacks, message, tone = "info") {
  callbacks?.onStatus?.(message, tone);
}

function notifyProgress(callbacks, value) {
  callbacks?.onProgress?.(Math.min(100, Math.max(0, value)));
}

function createUserError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
