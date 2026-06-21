import { getCheckedValue } from "./utils.js";

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "log", "ln", "sqrt", "abs", "exp",
  "floor", "ceil", "round", "mod", "npr", "ncr"
]);
const CONSTANT_META = {
  pi: {
    symbol: "π",
    input: "π 또는 pi",
    name: "원주율",
    value: Math.PI,
    valueText: "3.141592653589793",
    unit: "무차원",
    note: "원, 삼각함수, 라디안 계산에 자주 쓰는 수학 상수입니다."
  },
  e: {
    symbol: "e",
    input: "e",
    name: "자연상수",
    value: Math.E,
    valueText: "2.718281828459045",
    unit: "무차원",
    note: "자연로그, 지수함수, 성장·감쇠 계산에 자주 쓰는 상수입니다."
  },
  c: {
    symbol: "c",
    input: "c",
    name: "빛의 속도",
    value: 299792458,
    valueText: "299,792,458",
    unit: "m/s",
    note: "진공에서의 빛의 속도입니다. 전자기파·상대론 계산의 기준값으로 씁니다."
  },
  g: {
    symbol: "g",
    input: "g",
    name: "표준중력가속도",
    value: 9.80665,
    valueText: "9.80665",
    unit: "m/s²",
    note: "지표 부근 중력가속도 참고값입니다. 실제 위치에 따라 달라질 수 있습니다."
  },
  mu0: {
    symbol: "μ0",
    input: "mu0",
    name: "진공 투자율",
    value: 4 * Math.PI * 1e-7,
    valueText: "4π × 10^-7 ≈ 1.2566370614 × 10^-6",
    unit: "H/m",
    note: "전자기학 계산에서 자주 쓰는 진공의 자기적 상수입니다."
  },
  eps0: {
    symbol: "ε0",
    input: "eps0",
    name: "진공 유전율",
    value: 8.8541878128e-12,
    valueText: "8.8541878128 × 10^-12",
    unit: "F/m",
    note: "전기장·정전용량 계산에서 자주 쓰는 진공의 전기적 상수입니다."
  },
  qe: {
    symbol: "qe",
    input: "qe",
    name: "기본 전하량",
    value: 1.602176634e-19,
    valueText: "1.602176634 × 10^-19",
    unit: "C",
    note: "전자·양성자의 전하량 크기입니다. 전자공학과 물리 계산에 자주 쓰입니다."
  },
  sigma: {
    symbol: "σ",
    input: "sigma",
    name: "스테판-볼츠만 상수",
    value: 5.670374419e-8,
    valueText: "5.670374419 × 10^-8",
    unit: "W/(m²·K⁴)",
    note: "복사 에너지와 온도 관계를 계산할 때 쓰는 상수입니다."
  },
  h: {
    symbol: "h",
    input: "h",
    name: "플랑크 상수",
    value: 6.62607015e-34,
    valueText: "6.62607015 × 10^-34",
    unit: "J·s",
    note: "광자 에너지, 양자역학 계산에 쓰는 기본 상수입니다."
  },
  grav: {
    symbol: "G",
    input: "grav",
    name: "중력상수",
    value: 6.67430e-11,
    valueText: "6.67430 × 10^-11",
    unit: "m³/(kg·s²)",
    note: "만유인력 계산에 쓰는 상수입니다. 표준중력가속도 g와 구분하기 위해 입력명은 grav를 씁니다."
  },
  k: {
    symbol: "k",
    input: "k",
    name: "볼츠만 상수",
    value: 1.380649e-23,
    valueText: "1.380649 × 10^-23",
    unit: "J/K",
    note: "온도와 에너지의 관계를 다룰 때 쓰는 상수입니다."
  },
  na: {
    symbol: "NA",
    input: "NA",
    name: "아보가드로 수",
    value: 6.02214076e23,
    valueText: "6.02214076 × 10^23",
    unit: "1/mol",
    note: "1몰에 포함된 입자 수입니다. 화학 계산에서 자주 사용합니다."
  },
  r: {
    symbol: "R",
    input: "R",
    name: "기체상수",
    value: 8.31446261815324,
    valueText: "8.31446261815324",
    unit: "J/(mol·K)",
    note: "이상기체식 PV=nRT 계산에 쓰는 상수입니다."
  },
  me: {
    symbol: "me",
    input: "me",
    name: "전자 질량",
    value: 9.1093837015e-31,
    valueText: "9.1093837015 × 10^-31",
    unit: "kg",
    note: "전자 관련 운동량·에너지 계산에 쓰는 참고 상수입니다."
  },
  mp: {
    symbol: "mp",
    input: "mp",
    name: "양성자 질량",
    value: 1.67262192369e-27,
    valueText: "1.67262192369 × 10^-27",
    unit: "kg",
    note: "원자핵·입자 물리 계산에 쓰는 참고 상수입니다."
  },
  mn: {
    symbol: "mn",
    input: "mn",
    name: "중성자 질량",
    value: 1.67492749804e-27,
    valueText: "1.67492749804 × 10^-27",
    unit: "kg",
    note: "원자핵 계산에 쓰는 참고 상수입니다."
  }
};
const CONSTANTS = Object.fromEntries(Object.entries(CONSTANT_META).map(([key, meta]) => [key, meta.value]));
CONSTANTS["π"] = Math.PI;
const COMPLEX_PATTERN = /(?:^|[^a-zA-Z])(?:i|j)(?:$|[^a-zA-Z])|∠|\b(?:arg|re|im|conj|pol|rec)\s*\(/i;

export function initScientificCalculator(root = document) {
  const form = root.querySelector("#scientific-form");
  if (!form) return;

  const input = root.querySelector("#scientific-expression");
  const result = root.querySelector("#scientific-result");
  const detail = root.querySelector("#scientific-detail");
  const historyList = root.querySelector("#scientific-history");
  const prettyExpression = root.querySelector("#pretty-expression");
  const angleBadge = root.querySelector("#scientific-angle-badge");
  const displayBadge = root.querySelector("#scientific-display-badge");
  const history = [];
  let answer = 0;
  let cursorRange = { start: input.value.length, end: input.value.length };
  let currentEngineeringMode = "real";
  let imaginarySymbol = "j";
  let complexDisplayView = "rect";
  let lastComplexValue = null;

  const modeBadge = root.querySelector("#scientific-mode-badge");
  const imaginaryBadge = root.querySelector("#scientific-imaginary-badge");
  const keyHint = root.querySelector("#scientific-key-hint");
  const constantName = root.querySelector("#scientific-constant-name");
  const constantValue = root.querySelector("#scientific-constant-value");
  const constantInsert = root.querySelector("#scientific-constant-insert");
  const complexSummary = root.querySelector("#scientific-complex-summary");
  const complexRect = root.querySelector("#scientific-complex-rect");
  const complexPolar = root.querySelector("#scientific-complex-polar");
  const complexMagnitude = root.querySelector("#scientific-complex-magnitude");
  const complexAngle = root.querySelector("#scientific-complex-angle");
  const complexAngleNote = root.querySelector("#scientific-complex-angle-note");
  const modeButtons = Array.from(root.querySelectorAll("[data-engineering-mode]"));
  const keyTabButtons = Array.from(root.querySelectorAll("[data-key-tab]"));
  const keyPanels = Array.from(root.querySelectorAll("[data-key-panel]"));

  const rememberCursor = () => {
    cursorRange = {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length
    };
  };

  const avoidMobileKeyboard = () => window.matchMedia("(max-width: 720px)").matches;

  const blurAfterButton = () => {
    if (avoidMobileKeyboard()) input.blur();
  };

  input.addEventListener("input", () => {
    rememberCursor();
    updatePrettyExpression(input, prettyExpression);
  });
  input.addEventListener("click", rememberCursor);
  input.addEventListener("keyup", rememberCursor);
  input.addEventListener("select", rememberCursor);

  form.querySelectorAll('input[name="angleMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateAngleBadge(form, angleBadge);
      if (lastComplexValue) renderComplexResult(lastComplexValue, {
        angleMode: getCheckedValue(form, "angleMode", "deg"),
        displayMode: getCheckedValue(form, "displayMode", "norm")
      });
    });
  });

  form.querySelectorAll('input[name="displayMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateDisplayBadge(form, displayBadge);
      if (lastComplexValue) renderComplexResult(lastComplexValue, {
        angleMode: getCheckedValue(form, "angleMode", "deg"),
        displayMode: getCheckedValue(form, "displayMode", "norm")
      });
    });
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setEngineeringMode(button.dataset.engineeringMode || "real");
    });
  });

  keyTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setKeyPanel(button.dataset.keyTab || "basic");
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const angleMode = getCheckedValue(form, "angleMode", "deg");
    const displayMode = getCheckedValue(form, "displayMode", "norm");

    try {
      if (currentEngineeringMode === "complex" || COMPLEX_PATTERN.test(input.value)) {
        const complexValue = evaluateComplexExpression(input.value, { angleMode, ans: answer });
        answer = complexValue;
        lastComplexValue = complexValue;
        const rendered = renderComplexResult(complexValue, { angleMode, displayMode });
        history.unshift({ expression: input.value, result: rendered.rect });
        renderHistory(historyList, history.slice(0, 5));
        updatePrettyExpression(input, prettyExpression);
        return;
      }
      const value = evaluateScientificExpression(input.value, { angleMode, ans: answer });
      answer = value;
      const formatted = formatScientific(value, displayMode);
      result.textContent = formatted;
      detail.textContent = `${formatAngleModeLabel(angleMode)} · ${formatDisplayModeLabel(displayMode)} 표시로 계산했습니다.`;
      lastComplexValue = null;
      if (complexSummary) complexSummary.hidden = true;
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
        cursorRange = { start: 0, end: 0 };
        result.textContent = "-";
        detail.textContent = "새 계산식을 입력해 주세요.";
        lastComplexValue = null;
        if (complexSummary) complexSummary.hidden = true;
        updatePrettyExpression(input, prettyExpression);
        blurAfterButton();
        return;
      }

      if (button.dataset.action === "backspace") {
        const start = cursorRange.start ?? input.value.length;
        const end = cursorRange.end ?? input.value.length;
        if (start !== end) {
          input.setRangeText("", start, end, "end");
          cursorRange = { start, end: start };
        } else if (start > 0) {
          input.setRangeText("", start - 1, start, "end");
          cursorRange = { start: start - 1, end: start - 1 };
        }
        updatePrettyExpression(input, prettyExpression);
        blurAfterButton();
        return;
      }

      if (button.dataset.action === "toggle-imaginary") {
        imaginarySymbol = imaginarySymbol === "j" ? "i" : "j";
        if (imaginaryBadge) imaginaryBadge.textContent = `${imaginarySymbol} 표시`;
        if (keyHint) keyHint.textContent = `허수 단위 표시를 ${imaginarySymbol}(으)로 전환했습니다.`;
        blurAfterButton();
        return;
      }

      if (button.dataset.action === "show-rect" || button.dataset.action === "show-polar") {
        complexDisplayView = button.dataset.action === "show-polar" ? "polar" : "rect";
        updateComplexViewButtons();
        const angleMode = getCheckedValue(form, "angleMode", "deg");
        const displayMode = getCheckedValue(form, "displayMode", "norm");
        if (lastComplexValue) {
          renderComplexResult(lastComplexValue, { angleMode, displayMode });
        }
        if (keyHint) keyHint.textContent = complexDisplayView === "rect"
          ? "결과창은 직교형을 우선 표시합니다. 아래 카드에서 극형도 함께 확인할 수 있습니다."
          : "결과창은 극형을 우선 표시합니다. 아래 카드에서 직교형도 함께 확인할 수 있습니다.";
        blurAfterButton();
        return;
      }


      if (button.dataset.action === "set-angle") {
        const nextAngle = button.dataset.angleMode || "deg";
        const radio = form.querySelector(`input[name="angleMode"][value="${nextAngle}"]`);
        if (radio) {
          radio.checked = true;
          updateAngleBadge(form, angleBadge);
          if (keyHint) keyHint.textContent = `각도 모드를 ${formatAngleModeLabel(nextAngle)}로 바꿨습니다.`;
        }
        blurAfterButton();
        return;
      }

      if (button.dataset.action === "set-display") {
        const nextDisplay = button.dataset.displayMode || "norm";
        const radio = form.querySelector(`input[name="displayMode"][value="${nextDisplay}"]`);
        if (radio) {
          radio.checked = true;
          updateDisplayBadge(form, displayBadge);
          if (keyHint) keyHint.textContent = `표시 모드를 ${formatDisplayModeLabel(nextDisplay)}로 바꿨습니다.`;
        }
        blurAfterButton();
        return;
      }

      if (button.dataset.action === "evaluate") {
        form.requestSubmit();
        blurAfterButton();
        return;
      }

      const insertText = button.dataset.insert || "";
      cursorRange = insertAtCursor(input, insertText === "j" || insertText === "i" ? imaginarySymbol : insertText, cursorRange, {
        focus: !avoidMobileKeyboard()
      });
      updatePrettyExpression(input, prettyExpression);
      if (button.dataset.constantId) {
        updateConstantCard(button.dataset.constantId);
      } else if (button.dataset.keyHint && keyHint) {
        keyHint.textContent = button.dataset.keyHint;
      }
      blurAfterButton();
    });
  });

  function renderComplexResult(value, options = {}) {
    const angleMode = options.angleMode || getCheckedValue(form, "angleMode", "deg");
    const displayMode = options.displayMode || getCheckedValue(form, "displayMode", "norm");
    const rect = formatComplexRect(value, { displayMode, symbol: imaginarySymbol });
    const polar = formatComplexPolar(value, { angleMode, displayMode });
    const magnitude = formatScientific(complexAbs(value), displayMode);
    const angleValue = fromRadiansByMode(complexArg(value), angleMode);
    const angleSuffix = formatAngleSuffix(angleMode);
    const angleText = `${formatScientific(angleValue, displayMode)}${angleSuffix}`;
    result.textContent = complexDisplayView === "polar" ? polar : rect;
    detail.textContent = `${formatAngleModeLabel(angleMode)} · ${complexDisplayView === "polar" ? "극형 우선" : "직교형 우선"} 표시 · Rect/Polar 버튼으로 결과창 우선 표시를 바꿀 수 있습니다.`;
    if (complexSummary) complexSummary.hidden = false;
    if (complexRect) complexRect.textContent = rect;
    if (complexPolar) complexPolar.textContent = polar;
    if (complexMagnitude) complexMagnitude.textContent = magnitude;
    if (complexAngle) complexAngle.textContent = angleText;
    if (complexAngleNote) complexAngleNote.textContent = `${formatAngleModeLabel(angleMode)} 기준 위상각`;
    return { rect, polar, magnitude, angleText };
  }

  function updateComplexViewButtons() {
    root.querySelectorAll('[data-action="show-rect"], [data-action="show-polar"]').forEach((button) => {
      const active = (complexDisplayView === "rect" && button.dataset.action === "show-rect") ||
        (complexDisplayView === "polar" && button.dataset.action === "show-polar");
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateConstantCard(id) {
    const key = String(id || "").toLowerCase();
    const meta = CONSTANT_META[key];
    if (!meta) return;
    if (constantName) constantName.textContent = `${meta.symbol}`;
    if (constantValue) constantValue.textContent = "";
    if (constantInsert) constantInsert.textContent = "";
    if (keyHint) keyHint.textContent = `${meta.input} 입력`;
  }

  function setEngineeringMode(mode) {
    currentEngineeringMode = mode === "complex" ? "complex" : "real";
    modeButtons.forEach((button) => {
      const active = button.dataset.engineeringMode === currentEngineeringMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (modeBadge) modeBadge.textContent = currentEngineeringMode === "complex" ? "복소수 계산" : "일반 계산";
    if (keyHint) keyHint.textContent = currentEngineeringMode === "complex"
      ? "복소수 계산 모드입니다. j, ∠, Abs, Arg, Conj, Re, Im, Pol, Rec를 사용할 수 있습니다."
      : "일반 계산 모드입니다. 기본·함수·상수 탭을 사용할 수 있습니다.";
    setKeyPanel(currentEngineeringMode === "complex" ? "complex" : "basic");
  }

  function setKeyPanel(name) {
    const panelName = name || "basic";
    if (panelName === "constants" && keyHint) keyHint.textContent = "상수 버튼을 누르면 입력식에 바로 삽입됩니다.";
    keyTabButtons.forEach((button) => {
      const active = button.dataset.keyTab === panelName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    keyPanels.forEach((panel) => {
      const active = panel.dataset.keyPanel === panelName;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  updateAngleBadge(form, angleBadge);
  updateDisplayBadge(form, displayBadge);
  updatePrettyExpression(input, prettyExpression);
  updateComplexViewButtons();
  setEngineeringMode("real");
  form.dispatchEvent(new Event("submit", { cancelable: true }));
}

export function evaluateScientificExpression(expression, options = {}) {
  const rawExpression = String(expression || "");
  const ansValue = resolveRealAnswer(options.ans, rawExpression);
  const parser = new ExpressionParser(rawExpression, {
    angleMode: options.angleMode || "deg",
    ans: ansValue
  });
  const value = parser.parse();
  if (!Number.isFinite(value)) {
    throw new Error("결과가 정의되지 않았거나 너무 큽니다.");
  }
  return value;
}

function resolveRealAnswer(ans, expression = "") {
  if (isComplex(ans)) {
    if (Math.abs(ans.im) < 1e-12) return ans.re;
    if (/\bans\b/i.test(expression)) {
      throw new Error("복소수 Ans는 복소수 계산 모드에서 사용해 주세요.");
    }
    return 0;
  }
  return Number.isFinite(ans) ? ans : 0;
}

export function evaluateComplexExpression(expression, options = {}) {
  const parser = new ComplexExpressionParser(expression, {
    angleMode: options.angleMode || "deg",
    ans: isComplex(options.ans) ? options.ans : complex(Number.isFinite(options.ans) ? options.ans : 0, 0)
  });
  const value = parser.parse();
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
    throw new Error("복소수 결과가 정의되지 않았거나 너무 큽니다.");
  }
  return normalizeComplex(value);
}

class ComplexExpressionParser {
  constructor(expression, options) {
    this.tokens = tokenizeComplex(expression);
    this.index = 0;
    this.angleMode = options.angleMode;
    this.ans = options.ans;
  }

  parse() {
    if (!this.tokens.length) throw new Error("계산식을 입력해 주세요.");
    const value = this.parseAddSub();
    if (!this.isAtEnd()) throw new Error("복소수 계산식 중간에 해석할 수 없는 부분이 있습니다.");
    return normalizeComplex(value);
  }

  parseAddSub() {
    let value = this.parseMulDiv();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previous().value;
      const right = this.parseMulDiv();
      value = operator === "+" ? complexAdd(value, right) : complexSub(value, right);
    }
    return value;
  }

  parseMulDiv() {
    let value = this.parsePower();
    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.previous().value;
      const right = this.parsePower();
      if (operator === "/" && complexAbs(right) === 0) throw new Error("0으로 나눌 수 없습니다.");
      value = operator === "*" ? complexMul(value, right) : complexDiv(value, right);
    }
    return value;
  }

  parsePower() {
    const left = this.parseUnary();
    if (this.matchOperator("^")) {
      const right = this.parsePower();
      return complexPow(left, right);
    }
    return left;
  }

  parseUnary() {
    if (this.matchOperator("+")) return this.parseUnary();
    if (this.matchOperator("-")) return complexScale(this.parseUnary(), -1);
    return this.parsePercent();
  }

  parsePercent() {
    let value = this.parseAngleForm();
    while (this.matchOperator("%") || this.matchOperator("!")) {
      const operator = this.previous().value;
      const real = requireReal(value, operator === "%" ? "%" : "팩토리얼");
      value = complex(operator === "%" ? real / 100 : factorial(real), 0);
    }
    return value;
  }

  parseAngleForm() {
    let value = this.parsePrimary();
    if (this.matchType("angle")) {
      const theta = requireReal(this.parseUnary(), "페이저 각도");
      const magnitude = requireReal(value, "페이저 크기");
      value = complexFromPolar(magnitude, toRadiansByMode(theta, this.angleMode));
    }
    return value;
  }

  parsePrimary() {
    if (this.matchType("number")) {
      const numberValue = this.previous().value;
      if (this.matchImaginaryUnit()) return complex(0, numberValue);
      return complex(numberValue, 0);
    }

    if (this.matchType("identifier")) {
      const rawName = this.previous().value;
      const name = rawName.toLowerCase();
      if (name === "i" || name === "j") return complex(0, 1);
      if (this.matchType("leftParen")) {
        const args = this.parseArgumentList();
        return this.callFunction(name, args);
      }
      if (name === "ans") return this.ans;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return complex(CONSTANTS[name], 0);
      throw new Error(`${rawName}은 아직 사용할 수 없는 이름입니다.`);
    }

    if (this.matchType("leftParen")) {
      const value = this.parseAddSub();
      this.consume("rightParen", "닫는 괄호가 필요합니다.");
      return value;
    }

    throw new Error("복소수 계산식의 숫자, 함수, 괄호 위치를 확인해 주세요.");
  }

  parseArgumentList() {
    const args = [];
    if (this.matchType("rightParen")) return args;
    do {
      args.push(this.parseAddSub());
    } while (this.matchType("comma"));
    this.consume("rightParen", "닫는 괄호가 필요합니다.");
    return args;
  }

  callFunction(name, args) {
    const oneArg = () => {
      if (args.length !== 1) throw new Error(`${name} 함수에는 1개의 값이 필요합니다.`);
      return args[0];
    };
    const twoArgs = () => {
      if (args.length !== 2) throw new Error(`${name} 함수에는 2개의 값이 필요합니다.`);
      return args;
    };

    switch (name) {
      case "sqrt": return complexSqrt(oneArg());
      case "abs": return complex(complexAbs(oneArg()), 0);
      case "arg": return complex(fromRadiansByMode(complexArg(oneArg()), this.angleMode), 0);
      case "conj": return complexConj(oneArg());
      case "re": return complex(oneArg().re, 0);
      case "im": return complex(oneArg().im, 0);
      case "pol": {
        const [x, y] = twoArgs();
        return complex(requireReal(x, "Pol의 첫 번째 값"), requireReal(y, "Pol의 두 번째 값"));
      }
      case "rec": {
        const [r, theta] = twoArgs();
        return complexFromPolar(requireReal(r, "Rec의 첫 번째 값"), toRadiansByMode(requireReal(theta, "Rec의 두 번째 값"), this.angleMode));
      }
      case "sin": return complex(Math.sin(toRadiansByMode(requireReal(oneArg(), "sin"), this.angleMode)), 0);
      case "cos": return complex(Math.cos(toRadiansByMode(requireReal(oneArg(), "cos"), this.angleMode)), 0);
      case "tan": return complex(Math.tan(toRadiansByMode(requireReal(oneArg(), "tan"), this.angleMode)), 0);
      case "asin": return complex(fromRadiansByMode(Math.asin(requireReal(oneArg(), "asin")), this.angleMode), 0);
      case "acos": return complex(fromRadiansByMode(Math.acos(requireReal(oneArg(), "acos")), this.angleMode), 0);
      case "atan": return complex(fromRadiansByMode(Math.atan(requireReal(oneArg(), "atan")), this.angleMode), 0);
      case "log": {
        const value = requireReal(oneArg(), "log");
        if (value <= 0) throw new Error("log에는 0보다 큰 실수 값이 필요합니다.");
        return complex(Math.log10(value), 0);
      }
      case "ln": {
        const value = requireReal(oneArg(), "ln");
        if (value <= 0) throw new Error("ln에는 0보다 큰 실수 값이 필요합니다.");
        return complex(Math.log(value), 0);
      }
      case "exp": return complex(Math.exp(requireReal(oneArg(), "exp")), 0);
      default: throw new Error(`${name} 함수는 복소수 모드에서 아직 사용할 수 없습니다.`);
    }
  }

  matchImaginaryUnit() {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.type === "identifier" && ["i", "j"].includes(String(token.value).toLowerCase())) {
      this.index += 1;
      return true;
    }
    return false;
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
    while (this.matchOperator("%") || this.matchOperator("!")) {
      const operator = this.previous().value;
      value = operator === "%" ? value / 100 : factorial(value);
    }
    return value;
  }

  parsePrimary() {
    if (this.matchType("number")) return this.previous().value;

    if (this.matchType("identifier")) {
      const name = this.previous().value.toLowerCase();
      if (this.matchType("leftParen")) {
        const args = this.parseArgumentList();
        return this.callFunction(name, args);
      }
      if (name === "ans") return this.ans;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
      throw new Error(`${name}은 아직 사용할 수 없는 이름입니다. 상수는 상수 탭에서 버튼으로 입력하거나 입력명을 확인해 주세요.`);
    }

    if (this.matchType("leftParen")) {
      const value = this.parseAddSub();
      this.consume("rightParen", "닫는 괄호가 필요합니다.");
      return value;
    }

    throw new Error("숫자, 함수, 괄호 위치를 확인해 주세요.");
  }

  parseArgumentList() {
    const args = [];
    if (this.matchType("rightParen")) return args;
    do {
      args.push(this.parseAddSub());
    } while (this.matchType("comma"));
    this.consume("rightParen", "닫는 괄호가 필요합니다.");
    return args;
  }

  callFunction(name, args) {
    if (!FUNCTIONS.has(name)) throw new Error(`${name} 함수는 아직 사용할 수 없습니다.`);
    const value = args[0];
    const second = args[1];


    const requireArgCount = (count) => {
      if (args.length !== count) throw new Error(`${name} 함수에는 ${count}개의 값이 필요합니다.`);
    };

    if (["npr", "ncr", "mod"].includes(name)) {
      requireArgCount(2);
    } else {
      requireArgCount(1);
    }

    if (name === "sqrt" && value < 0) throw new Error("음수의 제곱근은 복소수 모드에서 계산합니다.");
    if (name === "log" && value <= 0) throw new Error("log에는 0보다 큰 값이 필요합니다.");
    if (name === "ln" && value <= 0) throw new Error("ln에는 0보다 큰 값이 필요합니다.");
    if (name === "acosh" && value < 1) throw new Error("acosh에는 1 이상의 값이 필요합니다.");
    if (name === "atanh" && Math.abs(value) >= 1) throw new Error("atanh에는 -1보다 크고 1보다 작은 값이 필요합니다.");
    if ((name === "asin" || name === "acos") && Math.abs(value) > 1) throw new Error(`${name}에는 -1 이상 1 이하 값이 필요합니다.`);
    if (name === "mod" && second === 0) throw new Error("mod의 두 번째 값은 0일 수 없습니다.");

    const angle = toRadiansByMode(value, this.angleMode);
    const fromAngle = (radianValue) => fromRadiansByMode(radianValue, this.angleMode);

    switch (name) {
      case "sin": return Math.sin(angle);
      case "cos": return Math.cos(angle);
      case "tan": return Math.tan(angle);
      case "asin": return fromAngle(Math.asin(value));
      case "acos": return fromAngle(Math.acos(value));
      case "atan": return fromAngle(Math.atan(value));
      case "sinh": return Math.sinh(value);
      case "cosh": return Math.cosh(value);
      case "tanh": return Math.tanh(value);
      case "asinh": return Math.asinh(value);
      case "acosh": return Math.acosh(value);
      case "atanh": return Math.atanh(value);
      case "log": return Math.log10(value);
      case "ln": return Math.log(value);
      case "sqrt": return Math.sqrt(value);
      case "abs": return Math.abs(value);
      case "exp": return Math.exp(value);
      case "floor": return Math.floor(value);
      case "ceil": return Math.ceil(value);
      case "round": return Math.round(value);
      case "mod": return value % second;
      case "npr": return permutation(value, second);
      case "ncr": return combination(value, second);
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

function tokenizeComplex(expression) {
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
    if (/\s/.test(char)) { index += 1; continue; }

    if (isDigit(char) || char === ".") {
      const start = index;
      index += 1;
      while (index < source.length && (isDigit(source[index]) || source[index] === ".")) index += 1;
      if ((source[index] === "e" || source[index] === "E") && (isDigit(source[index + 1]) || ["+", "-"].includes(source[index + 1]))) {
        const expStart = index;
        index += 1;
        if (["+", "-"].includes(source[index])) index += 1;
        const digitStart = index;
        while (index < source.length && isDigit(source[index])) index += 1;
        if (digitStart === index) index = expStart;
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
      while (index < source.length && /[a-zA-Z0-9]/.test(source[index])) index += 1;
      tokens.push({ type: "identifier", value: source.slice(start, index) });
      continue;
    }

    if (char === "∠") { tokens.push({ type: "angle", value: char }); index += 1; continue; }
    if ("+-*/^%!".includes(char)) { tokens.push({ type: "operator", value: char }); index += 1; continue; }
    if (char === ",") { tokens.push({ type: "comma", value: char }); index += 1; continue; }
    if (char === "(") { tokens.push({ type: "leftParen", value: char }); index += 1; continue; }
    if (char === ")") { tokens.push({ type: "rightParen", value: char }); index += 1; continue; }
    throw new Error(`${char} 문자는 사용할 수 없습니다.`);
  }

  return tokens;
}

function complex(re = 0, im = 0) {
  return { re, im };
}

function isComplex(value) {
  return value && typeof value === "object" && Number.isFinite(value.re) && Number.isFinite(value.im);
}

function normalizeComplex(value) {
  const clean = (number) => Math.abs(number) < 1e-12 ? 0 : number;
  return complex(clean(value.re), clean(value.im));
}

function complexAdd(a, b) { return normalizeComplex(complex(a.re + b.re, a.im + b.im)); }
function complexSub(a, b) { return normalizeComplex(complex(a.re - b.re, a.im - b.im)); }
function complexScale(a, scalar) { return normalizeComplex(complex(a.re * scalar, a.im * scalar)); }
function complexMul(a, b) { return normalizeComplex(complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)); }
function complexDiv(a, b) {
  const denominator = b.re * b.re + b.im * b.im;
  return complex((a.re * b.re + a.im * b.im) / denominator, (a.im * b.re - a.re * b.im) / denominator);
}
function complexAbs(a) { return Math.hypot(a.re, a.im); }
function complexArg(a) { return Math.atan2(a.im, a.re); }
function complexConj(a) { return complex(a.re, -a.im); }
function complexFromPolar(r, thetaRadians) { return normalizeComplex(complex(r * Math.cos(thetaRadians), r * Math.sin(thetaRadians))); }
function complexSqrt(a) {
  const r = complexAbs(a);
  const theta = complexArg(a) / 2;
  return complexFromPolar(Math.sqrt(r), theta);
}
function complexLog(a) { return complex(Math.log(complexAbs(a)), complexArg(a)); }
function complexExp(a) {
  const factor = Math.exp(a.re);
  return complex(factor * Math.cos(a.im), factor * Math.sin(a.im));
}
function complexPow(base, exponent) {
  if (complexAbs(base) === 0 && complexAbs(exponent) === 0) throw new Error("0^0은 정의하지 않습니다.");
  if (complexAbs(base) === 0) return complex(0, 0);
  return normalizeComplex(complexExp(complexMul(exponent, complexLog(base))));
}

function requireReal(value, label) {
  if (Math.abs(value.im) > 1e-10) throw new Error(`${label}에는 실수 값이 필요합니다.`);
  return value.re;
}

function formatComplexRect(value, options = {}) {
  const symbol = options.symbol || "j";
  const normalized = normalizeComplex(value);
  const re = normalized.re;
  const im = normalized.im;
  if (im === 0) return formatScientific(re, options.displayMode || "norm");
  if (re === 0) return `${formatScientific(im, options.displayMode || "norm")}${symbol}`;
  const sign = im < 0 ? "−" : "+";
  return `${formatScientific(re, options.displayMode || "norm")} ${sign} ${formatScientific(Math.abs(im), options.displayMode || "norm")}${symbol}`;
}

function formatComplexPolar(value, options = {}) {
  const magnitude = complexAbs(value);
  const angle = fromRadiansByMode(complexArg(value), options.angleMode || "deg");
  const suffix = formatAngleSuffix(options.angleMode || "deg");
  return `${formatScientific(magnitude, options.displayMode || "norm")} ∠ ${formatScientific(angle, options.displayMode || "norm")}${suffix}`;
}

function formatAngleSuffix(mode) {
  if (mode === "rad") return " rad";
  if (mode === "grad") return " grad";
  return "°";
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
      if ((source[index] === "e" || source[index] === "E") && (isDigit(source[index + 1]) || ["+", "-"].includes(source[index + 1]))) {
        const expStart = index;
        index += 1;
        if (["+", "-"].includes(source[index])) index += 1;
        const digitStart = index;
        while (index < source.length && isDigit(source[index])) index += 1;
        if (digitStart === index) index = expStart;
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
      while (index < source.length && /[a-zA-Z0-9]/.test(source[index])) {
        index += 1;
      }
      tokens.push({ type: "identifier", value: source.slice(start, index) });
      continue;
    }

    if ("+-*/^%!".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ type: "comma", value: char });
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

function insertAtCursor(input, text, cursorRange, options = {}) {
  const start = cursorRange.start ?? input.selectionStart ?? input.value.length;
  const end = cursorRange.end ?? input.selectionEnd ?? input.value.length;
  input.setRangeText(text, start, end, "end");
  const next = start + text.length;
  input.setSelectionRange(next, next);
  if (options.focus) input.focus();
  return { start: next, end: next };
}

function updatePrettyExpression(input, target) {
  if (!target) return;
  target.innerHTML = formatExpressionForScreen(input.value);
}

function updateAngleBadge(form, target) {
  if (!target) return;
  const angleMode = getCheckedValue(form, "angleMode", "deg");
  target.textContent = formatAngleModeLabel(angleMode);
}

function updateDisplayBadge(form, target) {
  if (!target) return;
  const displayMode = getCheckedValue(form, "displayMode", "norm");
  target.textContent = formatDisplayModeLabel(displayMode);
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

function formatScientific(value, mode = "norm") {
  const rounded = Math.abs(value) < 1e-12 ? 0 : value;
  if (mode === "sci") return formatExponential(rounded);
  if (mode === "eng") return formatEngineering(rounded);
  if (Math.abs(rounded) >= 1e10 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-6)) {
    return formatExponential(rounded);
  }
  return Number(rounded.toPrecision(12)).toLocaleString("ko-KR", {
    maximumFractionDigits: 10
  });
}

function formatExponential(value) {
  if (value === 0) return "0";
  return value.toExponential(8).replace(/\.0+e/, "e").replace(/(\.\d*?)0+e/, "$1e");
}

function formatEngineering(value) {
  if (value === 0) return "0";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const rawExponent = Math.floor(Math.log10(absolute));
  const exponent = Math.floor(rawExponent / 3) * 3;
  const mantissa = absolute / Math.pow(10, exponent);
  const prefixes = new Map([
    [-24, "y"], [-21, "z"], [-18, "a"], [-15, "f"], [-12, "p"], [-9, "n"], [-6, "µ"], [-3, "m"],
    [0, ""], [3, "k"], [6, "M"], [9, "G"], [12, "T"], [15, "P"], [18, "E"], [21, "Z"], [24, "Y"]
  ]);
  const prefix = prefixes.get(exponent);
  const text = Number(mantissa.toPrecision(8)).toLocaleString("ko-KR", { maximumFractionDigits: 8 });
  return prefix !== undefined ? `${sign}${text} ${prefix}`.trim() : `${sign}${text}e${exponent}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toRadiansByMode(value, mode) {
  if (mode === "rad") return value;
  if (mode === "grad") return value * Math.PI / 200;
  return value * Math.PI / 180;
}

function fromRadiansByMode(value, mode) {
  if (mode === "rad") return value;
  if (mode === "grad") return value * 200 / Math.PI;
  return value * 180 / Math.PI;
}

function formatAngleModeLabel(mode) {
  if (mode === "rad") return "RAD";
  if (mode === "grad") return "GRAD";
  return "DEG";
}

function formatDisplayModeLabel(mode) {
  if (mode === "sci") return "Sci";
  if (mode === "eng") return "Eng";
  return "Norm";
}

function factorial(value) {
  const n = validateCountingNumber(value, "팩토리얼");
  if (n > 170) throw new Error("팩토리얼 결과가 너무 큽니다. 170 이하 값을 사용해 주세요.");
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function permutation(nValue, rValue) {
  const n = validateCountingNumber(nValue, "nPr의 첫 번째 값");
  const r = validateCountingNumber(rValue, "nPr의 두 번째 값");
  if (r > n) throw new Error("nPr에서는 두 번째 값이 첫 번째 값보다 클 수 없습니다.");
  let result = 1;
  for (let i = 0; i < r; i += 1) result *= (n - i);
  return result;
}

function combination(nValue, rValue) {
  const n = validateCountingNumber(nValue, "nCr의 첫 번째 값");
  let r = validateCountingNumber(rValue, "nCr의 두 번째 값");
  if (r > n) throw new Error("nCr에서는 두 번째 값이 첫 번째 값보다 클 수 없습니다.");
  r = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= r; i += 1) {
    result = result * (n - r + i) / i;
  }
  return result;
}

function validateCountingNumber(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label}은 0 이상의 정수여야 합니다.`);
  if (value > 100000) throw new Error(`${label}이 너무 큽니다.`);
  return value;
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}
