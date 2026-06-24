export function initTextCounter(root = document) {
  const form = root.querySelector("#text-counter-form");
  if (!form) return;

  const input = root.querySelector("#text-counter-input");
  const els = {
    withSpaces: root.querySelector("#text-count-with-spaces"),
    withoutSpaces: root.querySelector("#text-count-without-spaces"),
    bytesUtf8: root.querySelector("#text-count-utf8"),
    bytesEuckr: root.querySelector("#text-count-euckr"),
    words: root.querySelector("#text-count-words"),
    lines: root.querySelector("#text-count-lines")
  };

  const update = () => renderTextCount(els, countText(input.value));
  form.addEventListener("submit", (event) => event.preventDefault());
  input.addEventListener("input", update);
  update();
}

export function countText(text) {
  const withoutSpaces = text.replace(/\s/g, "");
  return {
    withSpaces: Array.from(text).length,
    withoutSpaces: Array.from(withoutSpaces).length,
    bytesUtf8: new TextEncoder().encode(text).length,
    bytesEuckr: estimateEucKrBytes(text),
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    lines: text ? text.split(/\r\n|\r|\n/).length : 0
  };
}

function renderTextCount(els, result) {
  els.withSpaces.textContent = `${result.withSpaces.toLocaleString("ko-KR")}자`;
  els.withoutSpaces.textContent = `${result.withoutSpaces.toLocaleString("ko-KR")}자`;
  els.bytesUtf8.textContent = `${result.bytesUtf8.toLocaleString("ko-KR")} byte`;
  els.bytesEuckr.textContent = `${result.bytesEuckr.toLocaleString("ko-KR")} byte`;
  els.words.textContent = `${result.words.toLocaleString("ko-KR")}개`;
  els.lines.textContent = `${result.lines.toLocaleString("ko-KR")}줄`;
}

function estimateEucKrBytes(text) {
  return Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) <= 0x7f ? 1 : 2), 0);
}
