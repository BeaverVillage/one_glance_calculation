(() => {
  const root = window.HannunCheckToolkit || {};

  const cleanText = (value, maxLength = 120) => String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

  const formatNumber = (value, suffix = '') => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '자료 없음';
    return `${number.toLocaleString('ko-KR')}${suffix}`;
  };

  const formatDistance = (meters) => {
    const value = Number(meters);
    if (!Number.isFinite(value)) return '거리 정보 없음';
    if (value < 1000) return `${Math.round(value).toLocaleString('ko-KR')}m`;
    return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}km`;
  };

  const debounce = (fn, wait = 250) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const setLiveStatus = (element, message, tone = 'info') => {
    if (!element) return;
    element.textContent = message || '';
    element.dataset.tone = tone;
    element.hidden = !message;
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      headers: { accept: 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.message || `요청에 실패했습니다. (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  const buildKakaoSearchUrl = ({ name = '', address = '', lat = '', lng = '' } = {}) => {
    const query = cleanText(`${name} ${address}`.trim(), 160) || cleanText(`${lat},${lng}`, 80);
    return query ? `https://map.kakao.com/link/search/${encodeURIComponent(query)}` : '';
  };

  const createStateBadge = (label, tone = 'neutral') => {
    const badge = document.createElement('span');
    badge.className = `hc-state-badge ${tone}`;
    badge.textContent = label;
    return badge;
  };

  const renderWarnings = (container, warnings = []) => {
    if (!container) return;
    const list = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
    container.innerHTML = '';
    container.hidden = list.length === 0;
    list.forEach((warning) => {
      const item = document.createElement('p');
      item.className = 'hc-warning-line';
      item.textContent = typeof warning === 'string' ? warning : warning.message || '확인할 안내가 있습니다.';
      container.appendChild(item);
    });
  };

  const renderEmptyState = (container, { title = '자료를 찾지 못했습니다', message = '조건을 바꿔 다시 확인해 주세요.', actions = [] } = {}) => {
    if (!container) return;
    container.innerHTML = `
      <div class="hc-empty-state">
        <strong>${title}</strong>
        <p>${message}</p>
        ${actions.length ? `<div class="hc-empty-actions">${actions.map((action) => `<a class="secondary-action-button" href="${action.href || '#'}">${action.label || '확인'}</a>`).join('')}</div>` : ''}
      </div>`;
  };

  window.HannunCheckToolkit = {
    ...root,
    cleanText,
    formatNumber,
    formatDistance,
    debounce,
    setLiveStatus,
    fetchJson,
    buildKakaoSearchUrl,
    createStateBadge,
    renderWarnings,
    renderEmptyState,
  };
})();
