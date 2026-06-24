(() => {
  const root = document.querySelector('#outdoor-air-tool');
  if (!root) return;
  const $ = (selector) => root.querySelector(selector) || document.querySelector(selector);
  const form = $('#outdoor-air-form');
  const sidoSelect = $('#air-sido');
  const purposeSelect = $('#air-purpose');
  const timeSelect = $('#air-time');
  const placeInput = $('#air-place-query');
  const placeButton = $('#air-place-search');
  const currentButton = $('#air-current-location');
  const statusEl = $('#air-status');
  const panel = $('#air-summary-panel');
  const mainCard = $('#air-main-card');
  const metricGrid = $('#air-metric-grid');
  const actionGrid = $('#air-action-grid');
  const warningBox = $('#air-warning-box');

  const state = {
    places: [],
    selectedPlace: null,
    isFetching: false,
    popup: null,
    kakaoReadyPromise: null
  };

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    fetchAir();
  });
  placeButton?.addEventListener('click', searchPlaceRegion);
  currentButton?.addEventListener('click', useCurrentLocation);
  sidoSelect?.addEventListener('change', () => {
    state.selectedPlace = null;
    setStatus(`${sidoSelect.value} 지역 기준으로 확인합니다.`, 'neutral');
  });
  placeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchPlaceRegion();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePlacePopup();
  });

  async function searchPlaceRegion() {
    const query = String(placeInput.value || '').trim();
    if (!query) {
      setStatus('장소명을 입력해 주세요.', 'warning');
      placeInput?.focus();
      return;
    }
    setButtonLoading(placeButton, true, '검색 중...');
    setStatus('장소를 검색해 지역을 확인하는 중입니다...', 'neutral');
    try {
      const places = await searchAirPlaces(query);
      state.places = places;
      if (!places.length) {
        openPlacePopup([], `“${query}” 검색 결과를 찾지 못했습니다. 더 구체적인 장소명이나 주소를 입력해 주세요.`);
        setStatus('검색 결과를 찾지 못했습니다. 지역을 직접 선택하거나 다른 장소명을 입력해 주세요.', 'warning');
        return;
      }
      if (places.length === 1) {
        selectPlace(0, { autoCheck: true });
        return;
      }
      openPlacePopup(places);
      setStatus(`${places.length}개 장소 후보를 찾았습니다. 지역 기준으로 쓸 장소를 선택해 주세요.`, 'success');
    } catch (error) {
      openPlacePopup([], error?.message || '장소 검색 중 오류가 발생했습니다.');
      setStatus(error?.message || '장소 검색 중 오류가 발생했습니다.', 'warning');
    } finally {
      setButtonLoading(placeButton, false);
    }
  }

  async function searchAirPlaces(query) {
    const merged = [];
    const seen = new Set();
    const add = (items) => {
      normalizePlaceResults(items).forEach((place) => {
        const key = place.id || `${place.name}:${place.region1}:${Number(place.lat || 0).toFixed(5)},${Number(place.lng || 0).toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(place);
      });
    };

    try {
      const keywordData = await fetchJson(`/api/kakao-local?query=${encodeURIComponent(query)}`, { timeoutMs: 7000 });
      add(keywordData.documents);
    } catch (_) {}

    if (!merged.length) {
      try {
        const addressData = await fetchJson(`/api/kakao-local?address=${encodeURIComponent(query)}`, { timeoutMs: 7000 });
        add(addressData.documents);
      } catch (_) {}
    }

    if (!merged.length) {
      add(await searchWithKakaoSdk(query));
    }

    return merged.slice(0, 10);
  }

  function normalizePlaceResults(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const address = item.address || item.address_name || item.roadAddress || item.road_address_name || item.address?.address_name || '';
        const roadAddress = item.roadAddress || item.road_address_name || '';
        const parts = inferRegionParts(address || roadAddress);
        const region1 = normalizeSido(item.region1 || parts.region1);
        return {
          id: item.id || `${item.x || item.lng || item.address?.x || ''},${item.y || item.lat || item.address?.y || ''}`,
          name: item.name || item.place_name || item.address_name || address || '검색 결과',
          address,
          roadAddress,
          category: item.category || item.category_name || '',
          phone: item.phone || '',
          lat: Number(item.lat ?? item.y ?? item.address?.y),
          lng: Number(item.lng ?? item.x ?? item.address?.x),
          region1,
          region2: item.region2 || parts.region2,
          region3: item.region3 || parts.region3
        };
      })
      .filter((item) => item.name && isKnownSido(item.region1));
  }

  async function searchWithKakaoSdk(query) {
    const ready = await ensureKakaoServices();
    if (!ready || !window.kakao?.maps?.services) return [];
    return new Promise((resolve) => {
      const results = [];
      const done = () => resolve(results.slice(0, 10));
      try {
        const places = new window.kakao.maps.services.Places();
        places.keywordSearch(query, (data, status) => {
          if (status === window.kakao.maps.services.Status.OK && Array.isArray(data)) {
            results.push(...data);
            return done();
          }
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(query, (addrData, addrStatus) => {
            if (addrStatus === window.kakao.maps.services.Status.OK && Array.isArray(addrData)) results.push(...addrData);
            done();
          });
        });
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function ensureKakaoServices() {
    if (window.kakao?.maps?.services) return true;
    if (state.kakaoReadyPromise) return state.kakaoReadyPromise;
    state.kakaoReadyPromise = (async () => {
      try {
        const config = await fetchJson('/api/config', { timeoutMs: 5000 });
        const key = config?.kakaoMapJsKey;
        if (!key) return false;
        await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`);
        await new Promise((resolve) => window.kakao.maps.load(resolve));
        return Boolean(window.kakao?.maps?.services);
      } catch (_) {
        return false;
      }
    })();
    return state.kakaoReadyPromise;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.src === src || script.src.startsWith(src.split('?')[0]));
      if (existing) {
        if (window.kakao?.maps) return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  function ensurePlacePopup() {
    let popup = document.querySelector('#air-place-popup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'air-place-popup';
    popup.className = 'parking-place-popup air-place-popup';
    popup.hidden = true;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'air-place-popup-title');
    popup.innerHTML = `
      <div class="parking-place-popup__panel air-place-popup__panel" role="document">
        <div class="parking-place-popup__head">
          <strong id="air-place-popup-title">지역 기준으로 사용할 장소를 선택해 주세요</strong>
          <button type="button" class="parking-place-popup__close" data-air-popup-close aria-label="지역 후보 팝업 닫기">×</button>
        </div>
        <p class="air-place-popup__hint">선택한 장소의 주소에서 시·도를 확인해 지역 선택값을 자동으로 바꿉니다.</p>
        <div class="parking-place-popup__list" data-air-place-popup-list></div>
      </div>
    `;
    popup.addEventListener('click', (event) => {
      if (event.target === popup || event.target.closest('[data-air-popup-close]')) closePlacePopup();
    });
    document.body.append(popup);
    return popup;
  }

  function openPlacePopup(places, emptyMessage = '') {
    const popup = ensurePlacePopup();
    const list = popup.querySelector('[data-air-place-popup-list]');
    if (!list) return;
    if (!places.length) {
      list.innerHTML = `<p class="parking-place-popup__empty">${escapeHtml(emptyMessage || '검색 결과를 찾지 못했습니다.')}</p>`;
    } else {
      list.innerHTML = places.map((place, index) => `
        <button type="button" class="parking-place-popup__item air-place-popup__item" data-air-place-index="${index}">
          <strong>${escapeHtml(place.name)}</strong>
          <span>${escapeHtml(place.roadAddress || place.address || '주소 정보 없음')}</span>
          <em>${escapeHtml([place.region1, place.region2, place.region3].filter(Boolean).join(' '))}</em>
        </button>
      `).join('');
      list.querySelectorAll('[data-air-place-index]').forEach((button) => {
        button.addEventListener('click', () => selectPlace(Number(button.dataset.airPlaceIndex), { autoCheck: true }));
      });
    }
    popup.hidden = false;
    document.body.classList.add('parking-place-popup-open');
    popup.querySelector('.parking-place-popup__close')?.focus({ preventScroll: true });
  }

  function closePlacePopup() {
    const popup = document.querySelector('#air-place-popup');
    if (!popup) return;
    popup.hidden = true;
    document.body.classList.remove('parking-place-popup-open');
  }

  function selectPlace(index, options = {}) {
    const place = state.places[index];
    if (!place) return;
    state.selectedPlace = place;
    const changed = setSidoValue(place.region1);
    placeInput.value = place.name;
    closePlacePopup();
    if (!changed) {
      setStatus('선택한 장소의 시·도를 지역 목록과 연결하지 못했습니다. 지역을 직접 선택해 주세요.', 'warning');
      return;
    }
    setStatus(`${place.name} 기준으로 ${sidoSelect.value} 지역을 선택했습니다.`, 'success');
    if (options.autoCheck) fetchAir();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus('현재 위치 확인을 지원하지 않는 브라우저입니다.', 'warning');
      return;
    }
    setButtonLoading(currentButton, true, '위치 확인 중...');
    setStatus('현재 위치를 확인하는 중입니다...', 'neutral');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const data = await fetchJson(`/api/kakao-local?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`, { timeoutMs: 7000 });
        const region = normalizeSido(data.region1 || inferRegion1(data.addressName || ''));
        if (setSidoValue(region)) {
          state.selectedPlace = { name: data.addressName || '현재 위치', address: data.addressName || '', region1: region, lat: pos.coords.latitude, lng: pos.coords.longitude };
          setStatus(`${data.addressName || '현재 위치'} 기준으로 ${sidoSelect.value} 지역을 선택했습니다.`, 'success');
          fetchAir();
        } else {
          setStatus('현재 위치의 시·도를 지역 목록과 연결하지 못했습니다. 지역을 직접 선택해 주세요.', 'warning');
        }
      } catch (error) {
        setStatus(error?.message || '현재 위치의 주소를 확인하지 못했습니다. 지역을 직접 선택해 주세요.', 'warning');
      } finally {
        setButtonLoading(currentButton, false);
      }
    }, () => {
      setStatus('현재 위치 권한이 거부되었거나 위치를 확인할 수 없습니다.', 'warning');
      setButtonLoading(currentButton, false);
    }, { enableHighAccuracy: true, timeout: 8000 });
  }

  async function fetchAir() {
    if (state.isFetching) return;
    const sido = sidoSelect.value || '서울';
    const purpose = purposeSelect.value || 'walk';
    const timeSlot = timeSelect?.value || 'now';
    state.isFetching = true;
    setStatus(`${sido} 대기질, 단기예보, 생활기상지수를 확인하는 중입니다...`, 'neutral');
    panel.hidden = false;
    mainCard.className = 'air-main-card is-loading';
    mainCard.innerHTML = '<div class="empty-state">외출 체크 결과를 불러오는 중입니다.</div>';
    metricGrid.innerHTML = '';
    if (actionGrid) actionGrid.innerHTML = '';
    warningBox.innerHTML = '';
    try {
      const params = new URLSearchParams({ sido, purpose, time: timeSlot });
      if (Number.isFinite(Number(state.selectedPlace?.lat)) && Number.isFinite(Number(state.selectedPlace?.lng))) {
        params.set('lat', String(state.selectedPlace.lat));
        params.set('lng', String(state.selectedPlace.lng));
      }
      const data = await fetchJson(`/api/outdoor-air?${params.toString()}`, { timeoutMs: 12000 });
      if (!data.ok) throw new Error(data.message || '대기질 조회에 실패했습니다.');
      renderAir(data);
      setStatus('조회가 완료되었습니다. 결과는 공개 대기질·단기예보·생활기상지수 기준의 참고 정보입니다.', 'success');
    } catch (error) {
      const message = error?.message || '대기질 정보를 불러오지 못했습니다.';
      mainCard.className = 'air-main-card unknown';
      mainCard.innerHTML = `<div class="empty-state"><strong>조회 결과를 불러오지 못했습니다.</strong><p>${escapeHtml(message)}</p><p>잠시 후 다시 시도하거나 지역을 직접 선택해 주세요.</p></div>`;
      metricGrid.innerHTML = '';
      if (actionGrid) actionGrid.innerHTML = '';
      warningBox.innerHTML = '';
      setStatus(message, 'warning');
    } finally {
      state.isFetching = false;
    }
  }

  function renderAir(data) {
    const item = data.representative || {};
    const summary = data.summary || {};
    const risk = data.risk || buildFallbackRisk(item, purposeSelect.value || 'walk', timeSelect?.value || 'now');
    const tone = risk.tone || summary.tone || 'unknown';
    mainCard.className = `air-main-card air-risk-main-card ${tone}`;
    mainCard.innerHTML = `
      <div class="air-risk-score-wrap">
        <span class="air-tone-label">${escapeHtml(risk.gradeLabel || labelTone(tone))}</span>
        <div class="air-risk-score" aria-label="외출 위험도 점수"><strong>${escapeHtml(risk.score ?? '—')}</strong><span>점</span></div>
      </div>
      <div class="air-risk-summary-copy"><h2>${escapeHtml(risk.title || summary.title || '외출 위험 체크 결과')}</h2><p>${escapeHtml(risk.message || summary.message || '')}</p></div>
      <dl class="air-risk-facts"><div><dt>기준 측정소</dt><dd>${escapeHtml(item.stationName || '확인 필요')}</dd></div><div><dt>측정 시각</dt><dd>${escapeHtml(item.dataTime || '확인 필요')}</dd></div><div><dt>활동·시간대</dt><dd>${escapeHtml(`${purposeLabel(data.purpose || purposeSelect.value)} · ${timeLabel(data.timeSlot || timeSelect?.value)}`)}</dd></div></dl>
    `;
    const weatherCards = Array.isArray(data.forecast?.cards) ? data.forecast.cards : [];
    const livingCards = Array.isArray(data.livingIndex?.cards) ? data.livingIndex.cards : [];
    metricGrid.innerHTML = [
      metricCard('초미세먼지 PM2.5', item.pm25, '㎍/㎥', item.pm25Label, gradeTone(item.pm25Label), risk.reasons?.pm25),
      metricCard('미세먼지 PM10', item.pm10, '㎍/㎥', item.pm10Label, gradeTone(item.pm10Label), risk.reasons?.pm10),
      metricCard('오존 O₃', item.o3, 'ppm', item.o3Label, gradeTone(item.o3Label), risk.reasons?.o3),
      metricCard('통합대기환경지수', item.khai, '', item.khaiLabel, gradeTone(item.khaiLabel), risk.reasons?.khai),
      ...weatherCards.slice(0, 5).map((card) => metricCard(card.title, card.value, card.unit || '', card.label, card.tone || 'normal', data.forecast?.targetLabel || '기상청 단기예보')),
      ...livingCards.slice(0, 2).map((card) => metricCard(card.title, card.value, card.unit || '', card.label, card.tone || 'normal', card.sourceLabel || data.livingIndex?.targetLabel || '생활기상지수'))
    ].join('');
    renderActionCards(risk);
    renderWarnings(data.warning, risk);
  }

  function metricCard(title, value, unit, label, tone, reason) {
    const displayValue = value === null || value === undefined || Number.isNaN(value) ? '정보 없음' : `${value}${unit ? ` ${unit}` : ''}`;
    return `<article class="air-metric-card ${tone}"><span>${escapeHtml(title)}</span><strong>${escapeHtml(displayValue)}</strong><em>${escapeHtml(label || '정보 없음')}</em>${reason ? `<small>${escapeHtml(reason)}</small>` : ''}</article>`;
  }

  function renderActionCards(risk) {
    if (!actionGrid) return;
    const actions = Array.isArray(risk.actions) ? risk.actions : [];
    const readiness = Array.isArray(risk.readiness) ? risk.readiness : [];
    actionGrid.innerHTML = `
      <article class="air-action-card"><span>활동별 참고</span><ul>${actions.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
      <article class="air-action-card"><span>데이터 반영 상태</span><ul>${readiness.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
    `;
  }

  function renderWarnings(warning, risk) {
    if (!warning?.ok) {
      warningBox.innerHTML = `<h3>추가 확인 안내</h3><p>기상청 단기예보와 생활기상지수가 반영되었습니다.</p><p class="fine-print">기상특보 정보는 제공기관 응답 상태에 따라 일부 생략될 수 있습니다.</p>`;
      return;
    }
    const items = Array.isArray(warning.items) ? warning.items : [];
    if (!items.length) {
      warningBox.innerHTML = '<h3>추가 확인 안내</h3><p>최근 조회 범위에서 기상특보 항목이 확인되지 않았습니다. 단, 지역별 실제 특보는 기상청 안내를 함께 확인해 주세요.</p><p class="fine-print">기상청 단기예보와 생활기상지수가 조회되면 강수확률·기온·풍속·자외선·대기정체가 외출 위험 점수에 함께 반영됩니다.</p>';
      return;
    }
    warningBox.innerHTML = `<h3>기상특보 후보</h3><ul>${items.slice(0, 5).map((item) => `<li><strong>${escapeHtml(item.title || '기상특보')}</strong><span>${escapeHtml(item.area || '')} ${escapeHtml(item.time || '')}</span></li>`).join('')}</ul><p class="fine-print">특보 데이터는 발표·해제 시점에 따라 달라질 수 있습니다. 기상특보는 별도 참고 정보이며, 단기예보의 강수확률·기온·풍속과 생활기상지수의 자외선·대기정체 정보는 외출 위험 점수에 반영됩니다.</p>`;
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = Number(options.timeoutMs || 8000);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `요청 오류가 발생했습니다. (${response.status})`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `preview-note ${tone || 'neutral'}`;
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.disabled = true;
      if (text) button.textContent = text;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    }
  }

  function setSidoValue(region) {
    const value = normalizeSido(region);
    if (!sidoSelect || !isKnownSido(value)) return false;
    sidoSelect.value = value;
    return sidoSelect.value === value;
  }

  function inferRegionParts(address) {
    const parts = String(address || '').trim().split(/\s+/).filter(Boolean);
    return { region1: normalizeSido(parts[0] || ''), region2: parts[1] || '', region3: parts[2] || '' };
  }

  function inferRegion1(address) { return inferRegionParts(address).region1; }

  function normalizeSido(value) {
    const aliases = {
      서울특별시: '서울', 서울: '서울', 부산광역시: '부산', 부산: '부산', 대구광역시: '대구', 대구: '대구', 인천광역시: '인천', 인천: '인천', 광주광역시: '광주', 광주: '광주', 대전광역시: '대전', 대전: '대전', 울산광역시: '울산', 울산: '울산', 세종특별자치시: '세종', 세종: '세종', 경기도: '경기', 경기: '경기', 강원특별자치도: '강원', 강원도: '강원', 강원: '강원', 충청북도: '충북', 충북: '충북', 충청남도: '충남', 충남: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전북: '전북', 전라남도: '전남', 전남: '전남', 경상북도: '경북', 경북: '경북', 경상남도: '경남', 경남: '경남', 제주특별자치도: '제주', 제주도: '제주', 제주: '제주'
    };
    return aliases[String(value || '').trim()] || String(value || '').trim();
  }

  function isKnownSido(value) {
    return ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'].includes(value);
  }

  function buildFallbackRisk(item, purpose, timeSlot) {
    const levels = {
      pm25: gradePenalty(item.pm25Label),
      pm10: gradePenalty(item.pm10Label),
      o3: gradePenalty(item.o3Label),
      khai: gradePenalty(item.khaiLabel)
    };
    let score = 100 - levels.pm25 - levels.pm10 - levels.o3 - Math.floor(levels.khai * 0.5);
    if (['exercise', 'hiking', 'bike', 'child'].includes(purpose)) score -= 5;
    score = Math.max(0, Math.min(100, score));
    const tone = score >= 85 ? 'good' : score >= 70 ? 'normal' : score >= 50 ? 'warning' : 'bad';
    return {
      score,
      tone,
      gradeLabel: riskGradeLabel(score),
      title: riskTitle(score),
      message: purposeRiskMessage(purpose, tone),
      actions: purposeActions(purpose, tone),
      readiness: ['대기질 데이터 반영', '기상청 단기예보 반영', '생활기상지수 반영', `${timeLabel(timeSlot)} 기준 참고 문구 적용`],
      reasons: {
        pm25: metricReason(item.pm25Label),
        pm10: metricReason(item.pm10Label),
        o3: metricReason(item.o3Label),
        khai: metricReason(item.khaiLabel)
      }
    };
  }

  function gradePenalty(label) {
    if (/매우/.test(label)) return 35;
    if (/나쁨/.test(label)) return 25;
    if (/보통/.test(label)) return 8;
    if (/좋음/.test(label)) return 0;
    return 6;
  }

  function riskGradeLabel(score) {
    if (score >= 85) return '좋음';
    if (score >= 70) return '보통';
    if (score >= 50) return '주의';
    if (score >= 30) return '나쁨';
    return '외출 자제';
  }

  function riskTitle(score) {
    if (score >= 85) return '외출 부담이 낮은 편입니다';
    if (score >= 70) return '일반 외출은 보통 수준입니다';
    if (score >= 50) return '장시간 야외활동은 조절이 필요합니다';
    if (score >= 30) return '외출 전 확인이 많이 필요합니다';
    return '야외활동을 줄이는 편이 좋습니다';
  }

  function purposeRiskMessage(purpose, tone) {
    const careful = tone === 'warning' || tone === 'bad';
    const map = {
      commute: careful ? '출근·등교는 가능하더라도 마스크, 실내 대기, 이동 동선을 함께 확인해 주세요.' : '출근·등교 목적의 일반 이동은 현재 대기질 기준으로 큰 부담이 낮은 편입니다.',
      child: careful ? '아이와 외출은 체류 시간을 줄이고 실내 활동 대안을 함께 고려해 주세요.' : '아이와 외출은 체류 시간과 장소를 함께 보며 무리 없는 범위에서 판단해 주세요.',
      exercise: careful ? '러닝·고강도 운동은 줄이고 실내 운동이나 짧은 산책으로 조절하는 것을 고려해 주세요.' : '러닝·운동은 개인 컨디션과 시간대를 함께 확인하면 무난한 편입니다.',
      walk: careful ? '산책은 시간을 짧게 잡고 대기질이 나아지는 시간대를 다시 확인해 보세요.' : '산책 목적이라면 현재 대기질 기준으로 비교적 무난한 편입니다.',
      hiking: careful ? '등산은 노출 시간이 길어질 수 있으므로 일정 단축이나 실내 대안을 고려해 주세요.' : '등산은 가능해 보이지만 장시간 노출과 개인 컨디션을 함께 확인해 주세요.',
      bike: careful ? '자전거는 호흡량이 늘 수 있어 짧은 이동 위주로 조절하는 편이 좋습니다.' : '자전거 이동은 현재 대기질 기준으로 비교적 무난한 편입니다.',
      drive: careful ? '차량 이동 시 창문 개방과 장시간 외부 대기를 줄이는 것을 고려해 주세요.' : '차량 이동은 대기질보다 기상특보와 시야 상황을 함께 확인해 주세요.'
    };
    return map[purpose] || map.walk;
  }

  function purposeActions(purpose, tone) {
    const base = tone === 'good' || tone === 'normal'
      ? ['외출 전 최신 측정 시각 확인', '장시간 외출이면 중간에 대기질 재확인']
      : ['마스크 착용 여부 확인', '야외 체류 시간 줄이기', '실내 활동 대안 준비'];
    const extra = {
      child: ['아이 컨디션과 민감군 여부 확인'],
      exercise: ['고강도 운동은 짧게 조절'],
      hiking: ['장시간 노출과 고도 변화 고려'],
      bike: ['호흡량 증가를 고려해 속도 조절'],
      drive: ['창문 개방 줄이기']
    }[purpose] || [];
    return [...base, ...extra];
  }

  function metricReason(label) {
    if (/매우/.test(label)) return '야외활동 부담 큼';
    if (/나쁨/.test(label)) return '장시간 노출 주의';
    if (/보통/.test(label)) return '민감군은 확인';
    if (/좋음/.test(label)) return '부담 낮음';
    return '자료 확인 필요';
  }

  function purposeLabel(value) {
    return { commute: '출근·등교', child: '아이와 외출', exercise: '러닝·운동', walk: '산책', hiking: '등산', bike: '자전거', drive: '차량 이동' }[value] || '산책';
  }

  function timeLabel(value) {
    return { now: '지금', morning: '오전', afternoon: '오후', evening: '저녁', tomorrow: '내일' }[value] || '지금';
  }

  function labelTone(tone) { return { good: '외출 무난', normal: '보통', warning: '주의', bad: '확인 필요', unknown: '정보 확인' }[tone] || '정보 확인'; }
  function gradeTone(label) { return /매우/.test(label) ? 'bad' : /나쁨/.test(label) ? 'warning' : /보통/.test(label) ? 'normal' : /좋음/.test(label) ? 'good' : 'unknown'; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
})();
