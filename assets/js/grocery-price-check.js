(() => {
  const root = document.querySelector('#grocery-price-tool');
  if (!root) return;

  const els = {
    form: root.querySelector('#grocery-price-form'),
    region: root.querySelector('#grocery-region'),
    item: root.querySelector('#grocery-item'),
    market: root.querySelector('#grocery-market'),
    period: root.querySelector('#grocery-period'),
    status: root.querySelector('#grocery-status'),
    result: root.querySelector('#grocery-result'),
    chips: root.querySelectorAll('[data-grocery-item]')
  };

  let selectedCandidate = null;

  const escape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function setStatus(message) {
    if (els.status) els.status.textContent = message;
  }

  function selectedItem() {
    return (els.item?.value || '').trim();
  }

  function clearSelectedCandidate() {
    selectedCandidate = null;
  }

  function setLoading(item) {
    if (!els.result) return;
    els.result.innerHTML = `
      <article class="grocery-placeholder-card is-loading">
        <h2>${escape(item)} 가격정보를 확인하고 있습니다</h2>
        <p>KAMIS와 참가격 공공데이터를 기준으로 품목을 찾는 중입니다.</p>
      </article>`;
  }

  function renderError(message) {
    if (!els.result) return;
    els.result.innerHTML = `
      <article class="grocery-placeholder-card grocery-error-card">
        <h2>가격정보를 불러오지 못했습니다</h2>
        <p>${escape(message || '잠시 후 다시 시도하거나 품목명을 바꿔 확인해 주세요.')}</p>
      </article>`;
  }

  function changeTone(direction) {
    if (direction === 'up') return '상승';
    if (direction === 'down') return '하락';
    if (direction === 'same') return '비슷';
    return '확인 필요';
  }

  function trendLabel(direction) {
    if (direction === 'up') return '오름';
    if (direction === 'down') return '내림';
    if (direction === 'same') return '비슷';
    return '비교 정보 없음';
  }

  function formatNumberPrice(value) {
    return Number.isFinite(value) ? `${Math.round(value).toLocaleString('ko-KR')}원` : '자료 없음';
  }

  function buildTrendItems(row) {
    if (!row) return [];
    const baseItems = [
      ['최근', row.price, row.day || '최근 조사일'],
      ['전일', row.oneDayAgo, '1일 전'],
      ['전월', row.monthAgo, row.monthChange?.label || '1개월 전'],
      ['전년', row.yearAgo, row.yearChange?.label || '1년 전'],
      ['평균', row.average, '평년·평균 기준']
    ];
    const trendItems = row.trend?.points?.length ? row.trend.points.map((point) => [point.label, point.price, '최근 가격추이']) : [];
    return [...baseItems, ...trendItems];
  }

  function mainDirection(row) {
    if (row?.monthChange?.direction && row.monthChange.direction !== 'unknown') return row.monthChange.direction;
    if (row?.weekChange?.direction && row.weekChange.direction !== 'unknown') return row.weekChange.direction;
    return row?.yearChange?.direction || 'unknown';
  }

  function trendDirectionClass(row) {
    return `tone-${mainDirection(row)}`;
  }

  function renderCandidateSelection(data) {
    if (!els.result) return;
    const candidates = (data.candidates || []).filter(Boolean);
    const cards = candidates.map((candidate, index) => `
      <button type="button" class="grocery-candidate-card" data-grocery-candidate-index="${index}">
        <strong>${escape(candidate.label || candidate.displayName || candidate.itemName || '품목 후보')}</strong>
        <span>${escape(candidate.matchLabel || [candidate.itemCategoryName, candidate.marketTypes?.join('·')].filter(Boolean).join(' · ') || 'KAMIS 코드표 후보')}</span>
      </button>
    `).join('');
    els.result.innerHTML = `
      <article class="grocery-placeholder-card grocery-choice-card">
        <div class="grocery-result-head compact">
          <div>
            <p class="eyebrow">KAMIS 품목 코드 선택</p>
            <h2>${escape(data.summary?.title || '조회할 품목을 선택해 주세요')}</h2>
            <p>${escape(data.summary?.message || '입력한 품목과 연결될 수 있는 후보가 여러 개 있습니다.')}</p>
          </div>
          <span class="grocery-change-pill tone-unknown">선택 필요</span>
        </div>
        <div class="grocery-candidate-grid">${cards}</div>
        <div class="grocery-action-pills">
          <button type="button" data-grocery-action="choose-item">직접 다시 입력</button>
        </div>
      </article>`;
    setStatus(`${data.item || '입력 품목'}과 관련된 후보 ${candidates.length}개 중 하나를 선택해 주세요.`);
    els.result.querySelectorAll('[data-grocery-candidate-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const candidate = candidates[Number(button.dataset.groceryCandidateIndex)];
        if (!candidate) return;
        selectedCandidate = candidate;
        if (els.item) els.item.value = candidate.itemName || candidate.label || candidate.displayName || selectedItem();
        setStatus(`${candidate.label || candidate.displayName || candidate.itemName} 기준으로 다시 확인합니다.`);
        fetchPrice();
      });
    });
  }

  function renderEmpty(data) {
    if (!els.result) return;
    const warningItems = (data.warnings || []).filter(Boolean).map((item) => `<li>${escape(item)}</li>`).join('');
    const candidates = (data.candidates || []).filter(Boolean).slice(0, 4);
    const candidateHints = candidates.length ? `
      <div class="grocery-candidate-grid compact">
        ${candidates.map((candidate, index) => `<button type="button" class="grocery-candidate-card" data-grocery-candidate-index="${index}"><strong>${escape(candidate.label || candidate.itemName)}</strong><span>${escape(candidate.matchLabel || candidate.itemCategoryName || '')}</span></button>`).join('')}
      </div>` : '';
    els.result.innerHTML = `
      <article class="grocery-placeholder-card grocery-empty-card grocery-empty-card-compact">
        <div class="grocery-result-head compact">
          <div>
            <p class="eyebrow">${escape(data.sourceTag || '공공데이터 조회 결과')}</p>
            <h2>${escape(data.item || '선택 품목')} 가격정보를 찾지 못했습니다</h2>
            <p>${escape(data.summary?.message || '현재 연결된 공공데이터에서 조건에 맞는 실제 가격값을 확인하지 못했습니다. 품목명, 지역 또는 시장 유형을 바꿔 다시 확인해 주세요.')}</p>
          </div>
          <span class="grocery-change-pill tone-unknown">자료 없음</span>
        </div>
        ${candidateHints}
        ${warningItems ? `<ul class="grocery-warning-list compact">${warningItems}</ul>` : ''}
        <div class="grocery-action-pills">
          <button type="button" data-grocery-action="national">전국 기준 보기</button>
          <button type="button" data-grocery-action="toggle-market">시장 유형 바꿔보기</button>
          <button type="button" data-grocery-action="choose-item">품목 다시 선택</button>
        </div>
      </article>`;
    setStatus(`${data.item || '선택 품목'} 가격값을 찾지 못했습니다. 지역 또는 시장 유형을 바꿔 다시 확인해 주세요.`);
    els.result.querySelectorAll('[data-grocery-candidate-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const candidate = candidates[Number(button.dataset.groceryCandidateIndex)];
        if (!candidate) return;
        selectedCandidate = candidate;
        if (els.item) els.item.value = candidate.itemName || candidate.label || selectedItem();
        fetchPrice();
      });
    });
  }

  function renderResults(data) {
    if (!els.result) return;
    if (!data?.ok) {
      renderError(data?.message);
      return;
    }
    if (data.needsSelection || data.code === 'ambiguous_item') {
      renderCandidateSelection(data);
      return;
    }
    if (!data.results?.length) {
      renderEmpty(data);
      return;
    }

    const summary = data.summary || {};
    const first = summary.representative || data.results[0];
    const trendItems = buildTrendItems(first).map(([label, value, note]) => `
      <li>
        <span>${escape(label)}</span>
        <strong>${escape(formatNumberPrice(value))}</strong>
        <small>${escape(note || '')}</small>
      </li>
    `).join('');

    const rows = data.results.slice(0, 10).map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escape(row.itemName || data.item)}</strong><span>${escape(row.kindName || row.productName || '기본 품목')} · ${escape(row.rank || row.categoryLabel || '분류 정보')}</span></td>
        <td>${escape(row.marketLabel)}</td>
        <td>${escape(row.unit || '-')}</td>
        <td><strong>${escape(row.priceText)}</strong><span>${escape(row.day || '')}</span></td>
        <td>${escape(row.monthChange?.label || row.weekChange?.label || '비교 정보 없음')}</td>
      </tr>
    `).join('');

    const insightCards = [
      ['최근 가격', summary.primaryPrice || first.priceText || '가격 정보 없음', `${first.unit || '단위 정보 없음'} · ${first.day || '조사일 정보 없음'}`],
      ['전월 대비', first.monthChange?.label || '비교 정보 없음', trendLabel(first.monthChange?.direction)],
      ['전년 대비', first.yearChange?.label || '비교 정보 없음', trendLabel(first.yearChange?.direction)],
      ['조회 기준', `${first.region || data.region || '전국'} · ${first.marketLabel || '소매가격'}`, first.categoryLabel || '품목 분류']
    ].map(([label, value, note]) => `
      <article>
        <span>${escape(label)}</span>
        <strong>${escape(value)}</strong>
        <small>${escape(note || '')}</small>
      </article>
    `).join('');

    const warnings = (data.warnings || []).filter(Boolean).map((item) => `<li>${escape(item)}</li>`).join('');
    const matched = data.matchedItem ? `<p class="grocery-match-note">품목 매칭: ${escape(data.matchedItem.label || data.matchedItem.displayName || data.matchedItem.itemName || '')}</p>` : '';

    els.result.innerHTML = `
      <article class="grocery-result-card grocery-result-card-compact">
        <div class="grocery-result-head compact">
          <div>
            <p class="eyebrow">${escape(data.sourceTag || '공공데이터 가격정보')}</p>
            <h2>${escape(summary.title || `${data.item} 가격정보`)}</h2>
            <p>${escape(summary.message || '최근 조사 가격 기준으로 참고할 수 있는 가격정보입니다.')}</p>
            ${matched}
          </div>
          <span class="grocery-change-pill ${escape(trendDirectionClass(first))}">${escape(changeTone(mainDirection(first)))}</span>
        </div>
        <div class="grocery-price-summary-row">
          <p class="price-value">${escape(summary.primaryPrice || first.priceText || '가격 정보 없음')}</p>
          <span>${escape(first.unit || '단위 정보 없음')} · ${escape(first.day || '조사일 정보 없음')}</span>
        </div>
        <div class="grocery-insight-grid compact">${insightCards}</div>
        <div class="grocery-action-pills" aria-label="장보기 가격 확인 보조 기능">
          <button type="button" data-grocery-action="national">전국 기준 보기</button>
          <button type="button" data-grocery-action="toggle-market">시장 유형 바꿔보기</button>
          <button type="button" data-grocery-action="choose-item">품목 다시 선택</button>
        </div>
        <details class="grocery-detail-drawer">
          <summary>최근 추이·상세 가격표 보기</summary>
          <section class="grocery-trend-card compact">
            <div>
              <h3>최근 가격 흐름</h3>
              <p>제공 데이터에 포함된 최근·전월·전년 기준값입니다.</p>
            </div>
            <ol class="grocery-trend-list">${trendItems}</ol>
          </section>
          <div class="grocery-table-wrap">
            <table class="grocery-price-table">
              <thead><tr><th>#</th><th>품목</th><th>유형</th><th>단위</th><th>최근 가격</th><th>비교</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>
        ${warnings ? `<ul class="grocery-warning-list">${warnings}</ul>` : ''}
        <p class="grocery-dev-note">${escape(data.sourceLabel || data.source || '공개 가격정보')} 기준이며 실제 매장 가격·행사 가격·판매 단위와 다를 수 있습니다.</p>
      </article>`;
    setStatus(`${data.item} ${data.region} 기준 가격정보 ${data.count}건을 확인했습니다.`);
  }

  async function fetchPrice() {
    const item = selectedItem();
    if (!item && !selectedCandidate) {
      setStatus('품목을 입력하거나 인기 품목을 선택해 주세요.');
      els.item?.focus();
      return;
    }
    const params = new URLSearchParams({
      region: els.region?.value || '전국',
      item,
      market: els.market?.value || 'retail',
      period: els.period?.value || 'latest',
      _v: 'v70',
      _ts: Date.now().toString()
    });
    if (selectedCandidate?.productNo) params.set('productNo', selectedCandidate.productNo);
    if (selectedCandidate?.itemCategoryCode) params.set('categoryCode', selectedCandidate.itemCategoryCode);
    if (selectedCandidate?.itemCode) params.set('itemCode', selectedCandidate.itemCode);
    if (selectedCandidate?.kindCode) params.set('kindCode', selectedCandidate.kindCode);
    const rankCode = els.market?.value === 'wholesale' ? selectedCandidate?.wholesaleRankCode : selectedCandidate?.retailRankCode;
    if (rankCode) params.set('rankCode', rankCode);

    setStatus(`${item || selectedCandidate?.label || '선택 품목'} 가격정보를 불러오고 있습니다.`);
    setLoading(item || selectedCandidate?.label || '선택 품목');
    try {
      const response = await fetch(`/api/kamis-prices?${params.toString()}`, { cache: 'no-store', headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.message || `가격정보 조회에 실패했습니다. (${response.status})`);
      renderResults(data);
    } catch (error) {
      const message = error?.message || '장보기 물가 정보를 불러오지 못했습니다.';
      renderError(message);
      setStatus(message);
    }
  }

  els.result?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-grocery-action]');
    if (!button) return;
    const action = button.dataset.groceryAction;
    if (action === 'choose-item') {
      clearSelectedCandidate();
      els.item?.focus();
      els.item?.select?.();
      setStatus('품목명을 입력하거나 인기 품목을 다시 선택해 주세요.');
      return;
    }
    if (action === 'national') {
      if (els.region) els.region.value = '전국';
      setStatus('전국 기준으로 다시 확인합니다.');
      fetchPrice();
      return;
    }
    if (action === 'toggle-market') {
      if (els.market) els.market.value = els.market.value === 'retail' ? 'wholesale' : 'retail';
      setStatus(`${els.market?.selectedOptions?.[0]?.textContent || '다른 시장 유형'}으로 다시 확인합니다.`);
      fetchPrice();
      return;
    }
  });

  els.chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const item = chip.dataset.groceryItem || '';
      clearSelectedCandidate();
      if (els.item) els.item.value = item;
      els.chips.forEach((el) => el.classList.toggle('is-selected', el === chip));
      setStatus(`${item} 품목이 선택되었습니다. 가격 확인하기를 눌러 최근 가격정보를 확인하세요.`);
    });
  });

  els.item?.addEventListener('input', () => {
    clearSelectedCandidate();
    const value = selectedItem();
    els.chips.forEach((chip) => chip.classList.toggle('is-selected', chip.dataset.groceryItem === value));
  });

  els.market?.addEventListener('change', () => clearSelectedCandidate());
  els.region?.addEventListener('change', () => clearSelectedCandidate());

  els.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    fetchPrice();
  });

  setStatus('품목을 입력하거나 인기 품목을 선택하면 KAMIS와 참가격 기준으로 가격정보를 확인합니다.');
})();
