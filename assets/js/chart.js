import { formatWon, monthLabel } from "./utils.js";

export function renderPriceChart(container, points) {
  if (!container || !points?.length) return;

  const width = 720;
  const height = 250;
  const padding = { top: 26, right: 26, bottom: 42, left: 72 };
  const values = points.flatMap((point) => [point.low, point.high, point.price]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const x = (index) => {
    const usable = width - padding.left - padding.right;
    return padding.left + (usable * index) / Math.max(1, points.length - 1);
  };

  const y = (value) => {
    const usable = height - padding.top - padding.bottom;
    return padding.top + usable - ((value - min) / range) * usable;
  };

  const bandTop = points.map((point, index) => `${x(index)},${y(point.high)}`).join(" ");
  const bandBottom = points.slice().reverse().map((point, index) => {
    const sourceIndex = points.length - 1 - index;
    return `${x(sourceIndex)},${y(point.low)}`;
  }).join(" ");

  const observedPoints = points.slice(0, 1);
  const projectedPoints = points;
  const projectedPath = projectedPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.price)}`).join(" ");

  const gridLines = [0, 0.5, 1].map((ratio) => {
    const lineY = padding.top + (height - padding.top - padding.bottom) * ratio;
    return `<line class="chart-grid" x1="${padding.left}" y1="${lineY}" x2="${width - padding.right}" y2="${lineY}"></line>`;
  }).join("");

  const labels = points.map((point, index) => `
    <text class="chart-label" x="${x(index)}" y="${height - 16}" text-anchor="middle">${monthLabel(point.month)}</text>
  `).join("");

  const dots = projectedPoints.map((point, index) => `
    <circle class="chart-dot" cx="${x(index)}" cy="${y(point.price)}" r="${index === 0 ? 5 : 4}"></circle>
  `).join("");

  const minLabel = formatWon(min);
  const maxLabel = formatWon(max);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="250" aria-hidden="true">
      ${gridLines}
      <text class="chart-label" x="10" y="${y(max) + 4}">${maxLabel}</text>
      <text class="chart-label" x="10" y="${y(min) + 4}">${minLabel}</text>
      <polygon class="chart-band" points="${bandTop} ${bandBottom}"></polygon>
      <path class="chart-line-projected" d="${projectedPath}"></path>
      ${observedPoints.map((point, index) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(point.price)}" r="5"></circle>`).join("")}
      ${dots}
      <line class="chart-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      ${labels}
    </svg>
  `;
}
