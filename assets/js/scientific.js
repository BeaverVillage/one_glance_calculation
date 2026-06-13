import { getCheckedValue } from "./utils.js";

const FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "sqrt", "abs", "exp"]);
const CONSTANTS = {
  pi: Math.PI,
  "π": Math.PI,
  e: Math.E
};

export function initScientificCalculator(root = document) {
  const form = root.querySelector("#scientific-form");
  if (!form) return;

  const input = root.querySelector("#scientific-expression");
  const result = root.querySelector("#scientific-result");
  const detail = root.querySelector("#scientific-detail");
  const historyList = root.querySelector("#scientific-history");
  const prettyExpression = root.querySelector("#pretty-expression");
  const angleBadge = root.querySelector("#scientific-angle-badge");
  const history = [];
  let answer = 0;

  input.addEventListener("input", () => {
    updatePrettyExpression(input, prettyExpression);
  });

  form.querySelectorAll('input[name="angleMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateAngleBadge(form, angleBadge);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const angleMode = getCheckedValue(form, "angleMode", "deg");

    try {
      const value = evaluateScientificExpression(input.value, { angleMode, ans: answer });
      answer = value;
      const formatted = formatScientific(value);
      result.textContent = formatted;
      detail.textContent = `${angleMode === "deg" ? "도" : "라디안"} 모드로 계산했습니다.`;
      history.unshift({ expression: input.value, result: formatted });
      renderHistory(historyList, history.slice(0, 5));
      updatePrettyExpression(input, prettyExpression);
    } catch (error) {
      result.textContent = "계산 오류";
      detail.textContent = error?.message || "계산식을 다시 확인해 주세요.";
      updatePrettyExpression(input, prettyExpression);
    }
  });

  root.querySelectorAll("[data-insert], [data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "clear") {
        input.value = "";
        result.textContent = "-";
        detail.textContent = "새 계산식을 입력해 주세요.";
        updatePrettyExpression(input, prettyExpression);
        input.focus();
        return;
      }

      if (button.dataset.action === "backspace") {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        if (start !== end) {
          input.setRangeText("", start, end, "end");
        } else if (start > 0) {
          input.setRangeText("", start - 1, start, "end");
        }
        updatePrettyExpression(input, prettyExpression);
        input.focus();
        return;
      }

      if (button.dataset.action === "evaluate") {
        form.requestSubmit();
        return;
      }

      insertAtCursor(input, button.dataset.insert || "");
      updatePrettyExpression(input, prettyExpression);
    });
  });

  updateAngleBadge(form, angleBadge);
  updatePrettyExpression(input, prettyExpression);
  form.dispatchEvent(new Event("submit", { cancelable: true }));
}

export function evaluateScientificExpression(expression, options = {}) {
  const parser = new ExpressionParser(expression, {
    angleMode: options.angleMode || "deg",
    ans: Number.isFinite(options.ans) ? options.ans : 0
  });
  const value = parser.parse();
  if (!Number.isFinite(value)) {
    throw new Error("결과가 정의되지 않았거나 너무 큽니다.");
  }
  return value;
}

class ExpressionParser {
  constructor(expression, options) {
    this.tokens = tokenize(expression);
    this.index = 0;
    this.angleMode = options.angleMode;
    this.ans = options.ans;
  }

  parse() {
    if (!this.tokens.length) throw new Error("계산식을 입력해 주세요.");
    const value = this.parseAddSub();
    if (!this.isAtEnd()) {
      throw new Error("계산식 중간에 해석할 수 없는 부분이 있습니다.");
    }
    return value;
  }

  parseAddSub() {
    let value = this.parseMulDiv();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previous().value;
      const right = this.parseMulDiv();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  parseMulDiv() {
    let value = this.parsePower();
    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.previous().value;
      const right = this.parsePower();
      if (operator === "/" && right === 0) throw new Error("0으로 나눌 수 없습니다.");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  parsePower() {
    const left = this.parseUnary();
    if (this.matchOperator("^")) {
      const right = this.parsePower();
      return Math.pow(left, right);
    }
    return left;
  }

  parseUnary() {
    if (this.matchOperator("+")) return this.parseUnary();
    if (this.matchOperator("-")) return -this.parseUnary();
    return this.parsePercent();
  }

  parsePercent() {
    let value = this.parsePrimary();
    while (this.matchOperator("%")) {
      value /= 100;
    }
    return value;
  }

  parsePrimary() {
    if (this.matchType("number")) return this.previous().value;

    if (this.matchType("identifier")) {
      const name = this.previous().value.toLowerCase();
      if (this.matchType("leftParen")) {
        const argument = this.parseAddSub();
        this.consume("rightParen", "닫는 괄호가 필요합니다.");
        return this.callFunction(name, argument);
      }
      if (name === "ans") return this.ans;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
      throw new Error(`${name}은 아직 사용할 수 없는 이름입니다.`);
    }

    if (this.matchType("leftParen")) {
      const value = this.parseAddSub();
      this.consume("rightParen", "닫는 괄호가 필요합니다.");
      return value;
    }

    throw new Error("숫자, 함수, 괄호 위치를 확인해 주세요.");
  }

  callFunction(name, value) {
    if (!FUNCTIONS.has(name)) throw new Error(`${name} 함수는 아직 사용할 수 없습니다.`);

    if (name === "sqrt" && value < 0) throw new Error("음수의 제곱근은 계산하지 않습니다.");
    if (name === "log" && value <= 0) throw new Error("log에는 0보다 큰 값이 필요합니다.");
    if (name === "ln" && value <= 0) throw new Error("ln에는 0보다 큰 값이 필요합니다.");

    const angle = this.angleMode === "deg" ? toRadians(value) : value;
    const fromAngle = (radianValue) => this.angleMode === "deg" ? toDegrees(radianValue) : radianValue;

    switch (name) {
      case "sin": return Math.sin(angle);
      case "cos": return Math.cos(angle);
      case "tan": return Math.tan(angle);
      case "asin": return fromAngle(Math.asin(value));
      case "acos": return fromAngle(Math.acos(value));
      case "atan": return fromAngle(Math.atan(value));
      case "log": return Math.log10(value);
      case "ln": return Math.log(value);
      case "sqrt": return Math.sqrt(value);
      case "abs": return Math.abs(value);
      case "exp": return Math.exp(value);
      default: throw new Error(`${name} 함수는 아직 사용할 수 없습니다.`);
    }
  }

  matchOperator(operator) {
    return this.match((token) => token.type === "operator" && token.value === operator);
  }

  matchType(type) {
    return this.match((token) => token.type === type);
  }

  match(predicate) {
    if (this.isAtEnd() || !predicate(this.peek())) return false;
    this.index += 1;
    return true;
  }

  consume(type, message) {
    if (this.matchType(type)) return this.previous();
    throw new Error(message);
  }

  peek() {
    return this.tokens[this.index];
  }

  previous() {
    return this.tokens[this.index - 1];
  }

  isAtEnd() {
    return this.index >= this.tokens.length;
  }
}

function tokenize(expression) {
  const source = expression
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("√", "sqrt")
    .trim();
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (isDigit(char) || char === ".") {
      const start = index;
      index += 1;
      while (index < source.length && (isDigit(source[index]) || source[index] === ".")) {
        index += 1;
      }
      const raw = source.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`${raw}은 올바른 숫자가 아닙니다.`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (/[a-zA-Zπ]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[a-zA-Z]/.test(source[index])) {
        index += 1;
      }
      tokens.push({ type: "identifier", value: source.slice(start, index) });
      continue;
    }

    if ("+-*/^%".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen", value: char });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen", value: char });
      index += 1;
      continue;
    }

    throw new Error(`${char} 문자는 사용할 수 없습니다.`);
  }

  return tokens;
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.setRangeText(text, start, end, "end");
  input.focus();
}

function updatePrettyExpression(input, target) {
  if (!target) return;
  target.innerHTML = formatExpressionForScreen(input.value);
}

function updateAngleBadge(form, target) {
  if (!target) return;
  const angleMode = getCheckedValue(form, "angleMode", "deg");
  target.textContent = angleMode === "deg" ? "DEG" : "RAD";
}

function formatExpressionForScreen(expression) {
  const source = expression.trim();
  if (!source) return "계산식을 입력하세요";

  const divisionIndex = findTopLevelOperator(source, "/");
  if (divisionIndex > -1) {
    const numerator = trimOuterParens(source.slice(0, divisionIndex));
    const denominator = trimOuterParens(source.slice(divisionIndex + 1));
    return `
      <span class="math-fraction">
        <span class="math-numerator">${formatMathPart(numerator)}</span>
        <span class="math-denominator">${formatMathPart(denominator)}</span>
      </span>
    `;
  }

  return formatMathPart(source);
}

function formatMathPart(value) {
  return escapeHtml(value)
    .replaceAll("*", "×")
    .replaceAll("/", "÷")
    .replaceAll("-", "−")
    .replaceAll("×", " · ")
    .replace(/\bsqrt\s*\(/gi, "√(")
    .replace(/\bpi\b/gi, "π")
    .replace(/\^2\b/g, "²")
    .replace(/\^3\b/g, "³");
}

function findTopLevelOperator(source, operator) {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === operator && depth === 0) return index;
  }
  return -1;
}

function trimOuterParens(value) {
  let text = value.trim();
  while (text.startsWith("(") && text.endsWith(")") && wrapsWholeExpression(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function wrapsWholeExpression(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
  }
  return depth === 0;
}

function renderHistory(list, items) {
  list.innerHTML = items.map((item) => (
    `<li><code>${escapeHtml(item.expression)}</code> = ${escapeHtml(item.result)}</li>`
  )).join("");
}

function formatScientific(value) {
  const rounded = Math.abs(value) < 1e-12 ? 0 : value;
  if (Math.abs(rounded) >= 1e10 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-6)) {
    return rounded.toExponential(8).replace(/\.?0+e/, "e");
  }
  return Number(rounded.toPrecision(12)).toLocaleString("ko-KR", {
    maximumFractionDigits: 10
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}
