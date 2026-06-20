(() => {
  const root = document.querySelector('[data-ev-charger-map]');
  if (!root) return;

  const $ = (selector) => root.querySelector(selector) || document.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));
  const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
  const CLIENT_CACHE_PREFIX = 'hannuncheck:ev-charger:v2:';
  const LOCAL_EV_CACHE_VERSION = 'v2-split';
  const LOCAL_EV_DATA_BASE = '/assets/data/ev-chargers';
  const LOCAL_EV_REGION_PREFIX = 'hannuncheck:ev-region:v2:';
  const LOCAL_EV_REGION_TTL_MS = 24 * 60 * 60 * 1000;
  const LOCAL_EV_STATUS_REFRESH_DELAY_MS = 80;
  const ZCODE_BY_SIDO = { 서울: '11', 부산: '26', 대구: '27', 인천: '28', 광주: '29', 대전: '30', 울산: '31', 세종: '36', 경기: '41', 강원: '51', 충북: '43', 충남: '44', 전북: '52', 전남: '46', 경북: '47', 경남: '48', 제주: '50' };
  const SIDO_BY_ZCODE = Object.fromEntries(Object.entries(ZCODE_BY_SIDO).map(([name, code]) => [code, name]));
  const EV_TYPE_LABELS = { '01': 'DC차데모', '02': 'AC완속', '03': 'DC차데모+AC3상', '04': 'DC콤보', '05': 'DC차데모+DC콤보', '06': 'DC차데모+AC3상+DC콤보', '07': 'AC3상', '08': 'DC콤보(완속)', '09': 'NACS', '10': 'DC콤보+NACS', '11': 'DC콤보2(버스전용)' };
  const EV_RESULT_LIMIT_BY_RADIUS = { '1000': 15, '3000': 20, '5000': 35, '10000': 50 };
  const EV_MAP_LIMIT_BY_RADIUS = { '1000': 15, '3000': 20, '5000': 35, '10000': 50 };
  const EV_GROUP_DISTANCE_M = 80;
  const EV_SPLIT_CHUNK_MARGIN_M = 1200;

  const els = {
    form: $('#ev-search-form'),
    destination: $('#ev-destination'),
    placeResults: $('#ev-place-results'),
    searchStatus: $('#ev-search-status'),
    radius: $('#ev-radius'),
    speed: $('#ev-speed'),
    type: $('#ev-type'),
    availabilityType: $('#ev-availability-type'),
    sort: $('#ev-sort'),
    filters: {
      availableOnly: $('#ev-filter-available'),
      freeParking: $('#ev-filter-free-parking'),
      noLimit: $('#ev-filter-no-limit'),
      rapidOnly: $('#ev-filter-rapid'),
      updatedOnly: $('#ev-filter-updated'),
      lowRiskOnly: $('#ev-filter-lowrisk')
    },
    recommend: $('#ev-recommend-button'),
    quickButtons: $$('[data-ev-radius], [data-ev-speed], [data-ev-type], [data-ev-reset]'),
    preferenceCards: $$('[data-ev-sort-mode]'),
    summaryTitle: $('#ev-summary-title'),
    summarySubtitle: $('#ev-summary-subtitle'),
    status: $('#ev-status'),
    dataBadges: $('#ev-data-badges'),
    resultList: $('#ev-result-list'),
    map: $('#ev-map'),
    mapMarkers: $('#ev-map-markers'),
    mapRefresh: $('#ev-map-research-button'),
    mapToolbar: $('#ev-map-toolbar'),
    mapToolbarSearch: $('#ev-map-toolbar-search'),
    mapDestination: $('#ev-map-destination'),
    mapRadiusToggle: $('#ev-map-radius-toggle'),
    mapRadiusPanel: $('#ev-map-radius-panel'),
    mapOptionsToggle: $('#ev-map-options-toggle'),
    mapOptionsPanel: $('#ev-map-options-panel'),
    mapSortToggle: $('#ev-map-sort-toggle'),
    mapSortPanel: $('#ev-map-sort-panel'),
    mapRadiusButtons: $$('[data-ev-map-radius], [data-ev-map-speed]'),
    mapType: $('#ev-map-type'),
    mapFilterInputs: $$('[data-ev-map-filter]'),
    mapSortButtons: $$('[data-ev-map-sort]'),
    mobileMapJump: $('#ev-mobile-map-jump'),
    mobileListToggle: $('#ev-mobile-list-toggle'),
    mobileSheet: $('#ev-mobile-bottom-sheet'),
    mobileSheetTitle: $('#ev-mobile-sheet-title'),
    mobileSheetSubtitle: $('#ev-mobile-sheet-subtitle'),
    mobileSheetMapButton: $('#ev-mobile-sheet-map-button'),
    mobileTimeButton: $('#ev-mobile-time-button'),
    mobileConditionButton: $('#ev-mobile-condition-button'),
    mobileSortButton: $('#ev-mobile-sort-button'),
    mobileSheetSort: $('#ev-mobile-sheet-sort'),
    mobileSortButtons: $$('[data-ev-mobile-sort]'),
    mobileResults: $('#ev-mobile-results')
  };

  const state = {
    center: { lat: 37.4979, lng: 127.0276, name: '강남역', address: '서울 강남구 강남대로', sido: '서울', region2: '강남구', zscode: '11680' },
    places: [],
    stations: [],
    sortedStations: [],
    selectedId: null,
    displayResults: [],
    shouldFitBounds: false,
    kakaoReady: false,
    map: null,
    mapMarkers: [],
    mapOverlays: [],
    lastSearchCenter: null,
    lastSearchZoom: null,
    hasMapMoveEvents: false,
    dataSource: 'remote',
    localRefreshToken: 0
  };

  init();

  function init() {
    bindEvents();
    setupEvMobileBottomSheet();
    loadKakaoMap().finally(() => {
      updateMapCenter();
      renderMapMarkers([]);
      renderEmpty('장소를 검색하면 주변 전기차 충전소 후보를 표시합니다.');
      syncMapToolbar();
      syncSortButtons(els.sort?.value || 'recommended');
      setSearchStatus('현재 지도 중심 기준으로 주변 충전소를 먼저 확인합니다.');
      setStatus('현재 지도 중심 기준으로 주변 충전소를 불러오는 중입니다.', 'neutral');
      window.setTimeout(() => fetchChargers({ initial: true }), 120);
    });
  }

  function bindEvents() {
    document.addEventListener('click', handleKakaoPlaceClick);
    els.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      searchDestination(els.destination.value, { openPopup: true });
    });
    els.mapToolbarSearch?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = els.mapDestination.value || els.destination.value;
      if (els.destination) els.destination.value = query;
      searchDestination(query, { openPopup: true });
    });
    els.recommend?.addEventListener('click', () => fetchChargers());
    els.quickButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const previousRadius = els.radius?.value || '3000';
        if (button.dataset.evReset) {
          els.radius.value = '3000';
          els.speed.value = 'all';
          els.type.value = '';
          if (els.availabilityType) els.availabilityType.value = 'available';
        }
        if (button.dataset.evRadius) els.radius.value = button.dataset.evRadius;
        if (button.dataset.evSpeed) els.speed.value = button.dataset.evSpeed;
        if (button.dataset.evType) els.type.value = button.dataset.evType;
        syncQuickButtons();
        syncMapToolbar();
        if (!state.stations.length) return;
        if ((els.radius?.value || '3000') !== previousRadius) fetchChargers({ reason: 'radius' });
        else renderResults();
      });
    });
    els.radius?.addEventListener('change', () => {
      syncQuickButtons();
      syncMapToolbar();
      if (state.stations.length) fetchChargers({ reason: 'radius' });
    });
    [els.speed, els.type, els.availabilityType].filter(Boolean).forEach((input) => input.addEventListener('change', () => {
      if (input === els.availabilityType) syncAvailabilityPreset();
      syncQuickButtons();
      syncMapToolbar();
      if (state.stations.length) renderResults();
    }));
    els.sort?.addEventListener('change', () => {
      syncSortButtons(els.sort.value || 'recommended');
      if (state.stations.length) renderResults();
    });
    Object.values(els.filters).filter(Boolean).forEach((input) => input.addEventListener('change', () => renderResults()));
    els.preferenceCards.forEach((button) => button.addEventListener('click', () => setSort(button.dataset.evSortMode || 'recommended')));
    els.mapSortButtons.forEach((button) => button.addEventListener('click', () => {
      closeMapToolbarPopovers();
      setSort(button.dataset.evMapSort || 'recommended');
    }));
    els.mobileSortButtons.forEach((button) => button.addEventListener('click', () => {
      if (els.mobileSheetSort) els.mobileSheetSort.hidden = true;
      setSort(button.dataset.evMobileSort || 'recommended');
      openMobileSheet('expanded');
    }));
    els.mapRadiusToggle?.addEventListener('click', () => toggleMapPopover(els.mapRadiusPanel, els.mapRadiusToggle));
    els.mapOptionsToggle?.addEventListener('click', () => toggleMapPopover(els.mapOptionsPanel, els.mapOptionsToggle));
    els.mapSortToggle?.addEventListener('click', () => toggleMapPopover(els.mapSortPanel, els.mapSortToggle));
    els.mapRadiusButtons.forEach((button) => button.addEventListener('click', () => {
      const previousRadius = els.radius?.value || '3000';
      if (button.dataset.evMapRadius) els.radius.value = button.dataset.evMapRadius;
      if (button.dataset.evMapSpeed) els.speed.value = button.dataset.evMapSpeed;
      closeMapToolbarPopovers();
      syncQuickButtons();
      syncMapToolbar();
      if ((els.radius?.value || '3000') !== previousRadius) fetchChargers({ reason: 'radius' });
      else renderResults();
    }));
    els.mapType?.addEventListener('change', () => {
      els.type.value = els.mapType.value;
      syncQuickButtons();
      syncMapToolbar();
      renderResults();
    });
    els.mapFilterInputs.forEach((input) => input.addEventListener('change', () => {
      const target = els.filters[input.dataset.evMapFilter];
      if (target) target.checked = input.checked;
      renderResults();
    }));
    document.addEventListener('click', (event) => {
      if (!els.mapToolbar || els.mapToolbar.contains(event.target)) return;
      closeMapToolbarPopovers();
    });
    els.mapRefresh?.addEventListener('click', researchCurrentMapArea);
    els.mobileMapJump?.addEventListener('click', () => scrollToMap());
    els.mobileListToggle?.addEventListener('click', () => {
      const isOpen = els.mobileSheet?.classList.contains('is-open');
      setEvMobileSheetState(isOpen ? 'closed' : 'half');
      if (!isOpen) els.mobileSheet?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      updateMobileEvListToggle();
    });
    els.mobileSheetMapButton?.addEventListener('click', () => {
      closeMobileSheet();
      scrollToMap();
    });
    els.mobileTimeButton?.addEventListener('click', () => {
      if (!openEvMobileActionSheet('radius')) scrollToControls();
    });
    els.mobileConditionButton?.addEventListener('click', () => {
      if (!openEvMobileActionSheet('conditions')) scrollToControls();
    });
    els.mobileSortButton?.addEventListener('click', () => {
      if (!openEvMobileActionSheet('sort')) {
        if (els.mobileSheetSort) els.mobileSheetSort.hidden = !els.mobileSheetSort.hidden;
        openMobileSheet('open');
      }
    });
    els.mobileSheet?.querySelector('.parking-sheet-handle')?.addEventListener('click', () => toggleMobileSheet());
  }

  async function loadKakaoMap() {
    try {
      const config = await fetchJson('/api/config');
      const key = config?.kakaoMapJsKey;
      if (!key) {
        els.map?.classList.add('is-fallback');
        const span = els.map?.querySelector('.parking-map-fallback span');
        if (span) span.textContent = 'KAKAO_MAP_JS_KEY 환경변수를 설정하면 실제 카카오 지도가 표시됩니다.';
        return;
      }
      await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`);
      await new Promise((resolve) => window.kakao.maps.load(resolve));
      state.kakaoReady = true;
      const center = new window.kakao.maps.LatLng(state.center.lat, state.center.lng);
      state.map = new window.kakao.maps.Map(els.map, { center, level: 5 });
      els.map.classList.remove('is-fallback');
      if (els.mapRefresh) els.mapRefresh.hidden = false;
      bindKakaoMapMoveEvents();
    } catch (_) {
      els.map?.classList.add('is-fallback');
      const span = els.map?.querySelector('.parking-map-fallback span');
      if (span) span.textContent = '카카오맵을 불러오지 못해 샘플 지도에서 표시합니다.';
    }
  }

  async function searchDestination(query, options = {}) {
    const q = String(query || '').trim();
    if (!q) {
      setSearchStatus('장소를 입력해 주세요.');
      setStatus('장소를 입력한 뒤 충전소 찾기를 눌러 주세요.', 'warning');
      els.destination?.focus();
      return;
    }
    setSearchStatus('장소를 검색하고 있습니다.');
    setStatus('장소 검색 결과를 확인하는 중입니다.', 'neutral');
    try {
      state.places = await searchPlaces(q);
      if (!state.places.length) {
        setSearchStatus('검색 결과를 찾지 못했습니다. 다른 장소명을 입력해 주세요.');
        openPlacePopup('검색 결과를 찾지 못했습니다.');
        return;
      }
      setSearchStatus(`${state.places.length}개 후보를 찾았습니다. 충전소를 찾을 기준 장소를 선택해 주세요.`);
      if (state.places.length === 1 && options.autoSelectSingle) {
        selectPlace(state.places[0], true);
      } else if (options.openPopup) {
        openPlacePopup();
      }
    } catch (error) {
      setSearchStatus(error?.message || '장소 검색 중 오류가 발생했습니다.');
      openPlacePopup('장소 검색 중 오류가 발생했습니다.');
    }
  }

  async function searchPlaces(query) {
    const q = String(query || '').trim();
    const merged = [];
    const seen = new Set();
    const addPlaces = (places) => {
      (Array.isArray(places) ? places : []).forEach((item) => {
        const place = normalizePlaceCandidate(item);
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
        const key = String(place.id || `${place.name}:${place.lat.toFixed(6)},${place.lng.toFixed(6)}`);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(place);
      });
    };

    try {
      const keywordData = await fetchJson(`/api/kakao-local?query=${encodeURIComponent(q)}`, { timeoutMs: 6500 });
      addPlaces(keywordData?.documents);
    } catch (_) {}

    if (!merged.length) {
      try {
        const addressData = await fetchJson(`/api/kakao-local?address=${encodeURIComponent(q)}`, { timeoutMs: 6500 });
        addPlaces(addressData?.documents);
      } catch (_) {}
    }

    if (!merged.length) {
      addPlaces(await searchPlacesWithKakaoSdk(q));
    }
    return merged.slice(0, 10);
  }

  function normalizePlaceCandidate(item) {
    const address = item?.address || item?.address_name || item?.roadAddress || item?.road_address_name || '';
    const roadAddress = item?.roadAddress || item?.road_address_name || '';
    return {
      id: item?.id || `${item?.x || item?.lng},${item?.y || item?.lat}`,
      name: item?.name || item?.place_name || item?.address_name || address || '검색 결과',
      address,
      roadAddress,
      category: item?.category || item?.category_name || '',
      phone: item?.phone || '',
      lat: Number(item?.lat ?? item?.y),
      lng: Number(item?.lng ?? item?.x),
      region1: item?.region1 || inferSido(address || roadAddress),
      region2: item?.region2 || inferDistrict(address || roadAddress),
      region3: item?.region3 || ''
    };
  }

  function searchPlacesWithKakaoSdk(query) {
    return new Promise((resolve) => {
      if (!window.kakao?.maps?.services) return resolve([]);
      const results = [];
      const done = () => resolve(results.slice(0, 10));
      try {
        const places = new window.kakao.maps.services.Places();
        places.keywordSearch(query, (data, status) => {
          if (status === window.kakao.maps.services.Status.OK && Array.isArray(data)) {
            results.push(...data.map(normalizePlaceCandidate));
            return done();
          }
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(query, (addrData, addrStatus) => {
            if (addrStatus === window.kakao.maps.services.Status.OK && Array.isArray(addrData)) {
              results.push(...addrData.map(normalizePlaceCandidate));
            }
            done();
          });
        });
      } catch (_) {
        resolve([]);
      }
    });
  }


  function ensurePlacePopup() {
    let popup = document.querySelector('#ev-place-popup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'ev-place-popup';
    popup.className = 'parking-place-popup';
    popup.hidden = true;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'ev-place-popup-title');
    popup.innerHTML = `
      <div class="parking-place-popup__panel" role="document">
        <div class="parking-place-popup__head"><div><strong id="ev-place-popup-title">장소 선택</strong><span>검색 결과 중 충전소를 찾을 기준 장소를 선택하세요.</span></div><button type="button" class="parking-place-popup__close" aria-label="장소 선택창 닫기" data-ev-place-close>×</button></div>
        <div class="parking-place-popup__list" data-ev-place-list></div>
      </div>`;
    document.body.appendChild(popup);
    popup.addEventListener('click', (event) => {
      if (event.target === popup || event.target.closest('[data-ev-place-close]')) closePlacePopup();
      const button = event.target.closest('[data-ev-place-index]');
      if (button) {
        const place = state.places[Number(button.dataset.evPlaceIndex)];
        if (place) selectPlace(place, true);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !popup.hidden) closePlacePopup();
    });
    return popup;
  }

  function openPlacePopup(emptyMessage = '') {
    const popup = ensurePlacePopup();
    const list = popup.querySelector('[data-ev-place-list]');
    if (!state.places.length) {
      list.innerHTML = `<div class="parking-place-popup__empty">${escapeHtml(emptyMessage || '검색 결과가 없습니다.')}</div>`;
    } else {
      list.innerHTML = state.places.slice(0, 8).map((place, index) => `
        <button type="button" class="parking-place-popup__item" data-ev-place-index="${index}">
          <strong>${escapeHtml(place.name || '검색 결과')}</strong>
          <span>${escapeHtml(place.address || place.roadAddress || '')}</span>
        </button>`).join('');
    }
    popup.hidden = false;
    document.body.classList.add('parking-place-popup-open');
  }

  function closePlacePopup() {
    const popup = document.querySelector('#ev-place-popup');
    if (popup) popup.hidden = true;
    document.body.classList.remove('parking-place-popup-open');
  }

  function selectPlace(place, runSearch) {
    state.center = {
      lat: Number(place.lat),
      lng: Number(place.lng),
      name: place.name || '선택한 장소',
      address: place.address || place.roadAddress || '',
      sido: place.region1 || inferSido(place.address || place.roadAddress),
      region2: place.region2 || inferDistrict(place.address || place.roadAddress),
      zscode: place.zscode || ''
    };
    if (els.destination) els.destination.value = state.center.name;
    if (els.mapDestination) els.mapDestination.value = state.center.name;
    setSearchStatus(`${state.center.name} 주변으로 기준 장소를 설정했습니다.`);
    closePlacePopup();
    updateMapCenter();
    if (runSearch) fetchChargers();
  }

  async function fetchChargers(options = {}) {
    const radius = els.radius?.value || '3000';
    const clientCacheKey = buildClientCacheKey(radius);
    const cached = readClientCache(clientCacheKey);
    const hadCachedResult = Boolean(cached?.data?.ok);

    if (hadCachedResult) {
      applyChargerData(cached.data, { fromClientCache: true });
      setStatus('방문 중 저장된 충전소 결과를 먼저 표시했습니다. 최신 상태를 확인하는 중입니다.', 'neutral');
    } else {
      setStatus('전국 로컬 캐시에서 주변 충전소를 찾는 중입니다.', 'neutral');
      setListLoading();
    }

    if (els.recommend) {
      els.recommend.disabled = true;
      els.recommend.textContent = hadCachedResult ? '최신 상태 확인 중...' : '충전소 찾는 중...';
    }

    try {
      const localData = await buildLocalChargerResult(radius);
      if (localData?.ok && Array.isArray(localData.chargers) && localData.chargers.length) {
        applyChargerData(localData, { fromLocalCache: true });
        writeClientCache(clientCacheKey, localData);
        setStatus('전국 로컬 캐시에서 주변 충전소를 먼저 표시했습니다. 최신 상태를 확인하는 중입니다.', 'success');
        if (els.recommend) {
          els.recommend.disabled = false;
          els.recommend.textContent = '충전소 찾기';
        }
        const token = ++state.localRefreshToken;
        window.setTimeout(() => {
          refreshRemoteChargers(radius, clientCacheKey, { token, silent: true }).catch(() => {
            if (token === state.localRefreshToken) setStatus('최신 상태 확인이 지연되어 로컬 캐시 결과를 유지했습니다. 현장 상태는 다시 확인해 주세요.', 'warning');
          });
        }, LOCAL_EV_STATUS_REFRESH_DELAY_MS);
        return;
      }
    } catch (error) {
      // 로컬 캐시가 없거나 손상되면 기존 공공 API 조회로 자동 보강합니다.
    }

    try {
      await refreshRemoteChargers(radius, clientCacheKey, { silent: false, hadCachedResult });
    } catch (error) {
      if (hadCachedResult) {
        setStatus('최신 상태 확인이 지연되어 저장된 결과를 표시했습니다. 현장 상태는 다시 확인해 주세요.', 'warning');
        return;
      }
      setStatus(error?.message || '충전소 정보를 불러오지 못했습니다. API 키와 활용신청 상태를 확인해 주세요.', 'warning');
      renderEmpty('충전소 정보를 불러오지 못했습니다. API 키와 활용신청 상태를 확인해 주세요. 로컬 캐시가 생성되어 있으면 더 빠르게 표시됩니다.');
      renderMapMarkers([]);
    } finally {
      if (els.recommend) {
        els.recommend.disabled = false;
        els.recommend.textContent = '충전소 찾기';
      }
    }
  }

  async function refreshRemoteChargers(radius, clientCacheKey, options = {}) {
    const query = new URLSearchParams({
      lat: state.center.lat,
      lng: state.center.lng,
      radius,
      sido: state.center.sido || '서울'
    });
    const data = await fetchJson(`/api/ev-charger?${query.toString()}`, { timeoutMs: 9500 });
    if (!data.ok) throw new Error(data.message || '충전소 조회에 실패했습니다.');
    if (options.token && options.token !== state.localRefreshToken) return data;

    if (state.dataSource === 'local-static' && state.stations.length) {
      const merged = mergeRemoteStatusIntoLocal(data);
      writeClientCache(clientCacheKey, merged);
      applyChargerData(merged, { fromLocalCache: true });
      const matched = Number(merged?.remoteMatchedCount || 0);
      if (!options.silent) {
        setStatus('전국 로컬 캐시 결과를 유지하고 최신 상태만 보강했습니다. 실제 현장 상황은 다시 확인해 주세요.', 'success');
      } else if (matched > 0) {
        setStatus(`전국 로컬 캐시 결과를 유지하고 ${matched}곳의 최신 상태만 보강했습니다.`, 'success');
      } else {
        setStatus('최신 상태 API가 일부 결과만 제공되어 로컬 캐시 결과를 유지했습니다. 실제 현장 상황은 다시 확인해 주세요.', 'warning');
      }
      return data;
    }

    writeClientCache(clientCacheKey, data);
    applyChargerData(data);
    if (!options.silent) {
      setStatus(data?.cache?.hit ? '빠르게 조회했습니다. 저장된 지역 데이터를 기준으로 주변 충전소를 비교했습니다.' : '조회가 완료되었습니다. 충전기 상태는 현장 상황을 보장하지 않는 참고 정보입니다.', 'success');
    } else {
      setStatus('최신 제공기관 상태로 결과를 갱신했습니다. 실제 현장 상황은 도착 시점에 달라질 수 있습니다.', 'success');
    }
    return data;
  }

  async function buildLocalChargerResult(radiusValue) {
    const radius = Number(radiusValue || 3000);
    const zcode = zcodeForSido(state.center.sido || inferSido(state.center.address));
    const region = await loadEvRegionChunk(zcode, state.center, radius);
    const stations = Array.isArray(region?.stations) ? region.stations : Array.isArray(region) ? region : [];
    if (!stations.length) return null;
    const center = { lat: Number(state.center.lat), lng: Number(state.center.lng) };
    const normalized = stations
      .map((station) => normalizeLocalStation(station, center))
      .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng))
      .filter((station) => station.distanceM <= radius)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 180);
    if (!normalized.length) return null;
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      center: { lat: center.lat, lng: center.lng, radius, sido: state.center.sido || SIDO_BY_ZCODE[zcode] || '선택 지역', zcode, region2: state.center.region2 || '', zscode: region?.zscode || state.center.zscode || '' },
      cache: { hit: true, scope: 'local-static', ttlSeconds: Math.round(LOCAL_EV_REGION_TTL_MS / 1000), version: region?.version || LOCAL_EV_CACHE_VERSION },
      totalInRegion: stations.length,
      count: normalized.length,
      chargers: normalized.slice(0, 60),
      rawItems: []
    };
  }

  async function loadEvRegionChunk(zcode, center = {}, radius = 3000) {
    const code = zcode || '11';
    const index = await loadEvDataIndex();
    const regionEntry = index?.chunks?.[code];
    if (regionEntry?.split && regionEntry?.chunks) {
      const preferredZscode = center.zscode || zscodeFromRegionEntry(regionEntry, center.region2 || inferDistrict(center.address));
      const selectedEntries = selectSplitChunkEntries(regionEntry, center, radius, preferredZscode, code);
      const chunkKey = selectedEntries.map(([subCode]) => subCode).sort().join(',') || 'all';
      const memoryKey = `${LOCAL_EV_REGION_PREFIX}${code}:${chunkKey}`;
      const memory = readClientCache(memoryKey);
      if (memory?.data) return memory.data;
      const payloads = await Promise.all(selectedEntries.map(([subCode, entry]) => loadEvChunkFile(entry.file || `chunks/${code}/${subCode}.json`)));
      const stations = payloads.flatMap((payload) => Array.isArray(payload?.stations) ? payload.stations : Array.isArray(payload) ? payload : []);
      if (!stations.length) throw new Error('전국 전기차 충전소 로컬 캐시가 비어 있습니다.');
      const data = {
        version: LOCAL_EV_CACHE_VERSION,
        zcode: code,
        zscode: preferredZscode || '',
        regionName: regionEntry.name || SIDO_BY_ZCODE[code] || '선택 지역',
        split: true,
        selectedChunks: selectedEntries.map(([subCode]) => subCode),
        stations
      };
      writeClientCache(memoryKey, data);
      return data;
    }

    const memoryKey = `${LOCAL_EV_REGION_PREFIX}${code}`;
    const memory = readClientCache(memoryKey);
    if (memory?.data) return memory.data;
    const data = await loadEvChunkFile(regionEntry?.file || `chunks/${code}.json`);
    const stations = Array.isArray(data?.stations) ? data.stations : Array.isArray(data) ? data : [];
    if (!stations.length) throw new Error('전국 전기차 충전소 로컬 캐시가 비어 있습니다.');
    const payload = { ...data, stations };
    writeClientCache(memoryKey, payload);
    return payload;
  }

  function selectSplitChunkEntries(regionEntry, center, radius, preferredZscode, code) {
    const entries = Object.entries(regionEntry?.chunks || {});
    if (!entries.length) return [];
    const centerLat = Number(center?.lat);
    const centerLng = Number(center?.lng);
    const radiusM = Number(radius || 3000) + EV_SPLIT_CHUNK_MARGIN_M;
    const selected = new Map();

    if (preferredZscode && regionEntry.chunks[preferredZscode]) {
      selected.set(preferredZscode, regionEntry.chunks[preferredZscode]);
    }

    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      entries.forEach(([subCode, entry]) => {
        if (!entry?.bbox) return;
        if (distanceToBboxMeters(centerLat, centerLng, entry.bbox) <= radiusM) {
          selected.set(subCode, entry);
        }
      });
    }

    if (!selected.size) {
      if (preferredZscode && regionEntry.chunks[preferredZscode]) selected.set(preferredZscode, regionEntry.chunks[preferredZscode]);
      else entries.forEach(([subCode, entry]) => selected.set(subCode, entry));
    }

    return Array.from(selected.entries());
  }

  function distanceToBboxMeters(lat, lng, bbox) {
    const minLat = Number(bbox?.minLat);
    const maxLat = Number(bbox?.maxLat);
    const minLng = Number(bbox?.minLng);
    const maxLng = Number(bbox?.maxLng);
    if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return Infinity;
    const clampedLat = Math.min(Math.max(lat, minLat), maxLat);
    const clampedLng = Math.min(Math.max(lng, minLng), maxLng);
    return distanceMeters(lat, lng, clampedLat, clampedLng);
  }

  async function loadEvDataIndex() {
    const memoryKey = `${LOCAL_EV_REGION_PREFIX}index`;
    const memory = readClientCache(memoryKey);
    if (memory?.data) return memory.data;
    const data = await loadEvJson('index.json');
    writeClientCache(memoryKey, data);
    return data;
  }

  async function loadEvChunkFile(file) {
    return loadEvJson(file);
  }

  async function loadEvJson(path) {
    const normalized = String(path || '').replace(/^\/+/, '');
    const response = await fetch(`${LOCAL_EV_DATA_BASE}/${normalized}`, { cache: 'force-cache' });
    if (!response.ok) throw new Error('전국 전기차 충전소 로컬 캐시가 아직 생성되지 않았습니다.');
    return response.json();
  }

  function zscodeFromRegionEntry(regionEntry, districtName) {
    const text = normalizeDistrictName(districtName);
    if (!text || !regionEntry?.chunks) return '';
    for (const [zscode, entry] of Object.entries(regionEntry.chunks)) {
      const name = normalizeDistrictName(entry?.name || '');
      if (name && (name === text || name.includes(text) || text.includes(name))) return zscode;
    }
    return '';
  }

  function normalizeLocalStation(station, center) {
    const lat = Number(station.lat ?? station.latitude);
    const lng = Number(station.lng ?? station.lon ?? station.longitude);
    const distanceM = distanceMeters(center.lat, center.lng, lat, lng);
    const chargers = Array.isArray(station.chargers) && station.chargers.length
      ? station.chargers.map((charger, index) => normalizeLocalCharger(charger, station, index))
      : buildLocalChargersFromSummary(station);
    const rapidCount = Number(station.rapidCount ?? chargers.filter((charger) => charger.isRapid).length ?? 0);
    const slowCount = Number(station.slowCount ?? chargers.filter((charger) => !charger.isRapid).length ?? 0);
    const statusMode = String(station.statusMode || station.statusTone || 'unknown');
    const availableCount = Number(station.availableCount ?? chargers.filter((charger) => charger.isAvailable).length ?? 0);
    const chargingCount = Number(station.chargingCount ?? chargers.filter((charger) => charger.stat === '3').length ?? 0);
    const troubleCount = Number(station.troubleCount ?? chargers.filter((charger) => ['1','4','5'].includes(charger.stat)).length ?? 0);
    const unknownCount = Math.max(0, Number(station.unknownCount ?? (chargers.length - availableCount - chargingCount - troubleCount)));
    const parkingFree = normalizeLocalBoolean(station.parkingFree ?? station.parkingFreeYn ?? station.freeParking);
    const limitYn = normalizeLocalBoolean(station.limitYn ?? station.limitYnRaw ?? station.limit);
    const bestScore = buildLocalScore({ distanceM, rapidCount, parkingFree, limitYn, availableCount, chargingCount, troubleCount, unknownCount, updatedAt: station.updatedAt || '', totalCount: chargers.length, statusMode });
    return {
      id: String(station.statId || station.id || `${station.name || station.statNm}-${station.addr || station.address}`),
      name: String(station.statNm || station.name || '전기차충전소').trim(),
      address: String(station.addr || station.address || '').trim(),
      useTime: String(station.useTime || station.useTimeText || '').trim(),
      business: String(station.busiNm || station.business || station.operator || '').trim(),
      lat,
      lng,
      distanceM,
      parkingFree,
      limitYn,
      updatedAt: station.updatedAt || '',
      chargers,
      availableCount,
      chargingCount,
      troubleCount,
      unknownCount,
      totalChargerCount: chargers.length,
      rapidCount,
      slowCount,
      bestScore,
      statusTone: availableCount > 0 ? 'good' : (chargingCount > 0 ? 'busy' : (troubleCount > 0 ? 'bad' : 'unknown')),
      availabilityLabel: buildAvailabilityLabel({ availableCount, chargingCount, troubleCount })
    };
  }

  function normalizeLocalCharger(charger, station, index) {
    const typeCode = String(charger.typeCode || charger.chgerType || charger.type || '').padStart(2, '0');
    const output = Number(charger.output || 0);
    const stat = String(charger.stat || '').trim();
    const isRapid = output >= 40 || ['01','03','04','05','06'].includes(typeCode);
    return {
      stationId: String(station.statId || station.id || ''),
      chargerId: String(charger.chargerId || charger.chgerId || index + 1),
      typeCode,
      typeLabel: EV_TYPE_LABELS[typeCode] || charger.typeLabel || `타입 ${typeCode || '확인'}`,
      output,
      stat,
      statLabel: charger.statLabel || '상태 확인 필요',
      isAvailable: stat === '2',
      isRapid,
      updatedAt: charger.updatedAt || ''
    };
  }

  function buildLocalChargersFromSummary(station) {
    const typeCodes = Array.isArray(station.chgerTypes) ? station.chgerTypes : Array.isArray(station.typeCodes) ? station.typeCodes : [];
    const rapidCount = Math.max(0, Number(station.rapidCount || 0));
    const slowCount = Math.max(0, Number(station.slowCount || 0));
    const total = Math.max(1, Number(station.chargerCount || rapidCount + slowCount || typeCodes.length || 1));
    return Array.from({ length: total }).map((_, index) => {
      const typeCode = String(typeCodes[index % Math.max(typeCodes.length, 1)] || (index < rapidCount ? '04' : '02')).padStart(2, '0');
      const isRapid = index < rapidCount || ['01','03','04','05','06'].includes(typeCode);
      return { stationId: String(station.statId || station.id || ''), chargerId: String(index + 1), typeCode, typeLabel: EV_TYPE_LABELS[typeCode] || `타입 ${typeCode}`, output: isRapid ? 50 : 7, stat: '', statLabel: '상태 확인 필요', isAvailable: false, isRapid, updatedAt: '' };
    });
  }

  function buildLocalScore({ distanceM, rapidCount, parkingFree, limitYn, availableCount, chargingCount = 0, troubleCount = 0, unknownCount = 0, updatedAt = '', totalCount = 0, statusMode = 'unknown' }) {
    const distance = Number(distanceM);
    const available = Number(availableCount || 0);
    const charging = Number(chargingCount || 0);
    const trouble = Number(troubleCount || 0);
    const unknown = Number(unknownCount || 0);
    const total = Math.max(Number(totalCount || 0), available + charging + trouble + unknown, 1);

    let distanceScore = 0;
    if (Number.isFinite(distance)) {
      if (distance <= 300) distanceScore = 40;
      else if (distance <= 500) distanceScore = 35;
      else if (distance <= 1000) distanceScore = 28;
      else if (distance <= 2000) distanceScore = 18;
      else if (distance <= 3000) distanceScore = 10;
      else distanceScore = Math.max(0, 8 - (distance - 3000) / 500);
    }

    let availabilityScore = 2;
    if (available >= 10) availabilityScore = 35;
    else if (available >= 5) availabilityScore = 28;
    else if (available >= 3) availabilityScore = 20;
    else if (available >= 1) availabilityScore = 12;
    else if (charging > 0) availabilityScore = 4;

    const rapidScore = Number(rapidCount || 0) > 0 ? 10 : 3;
    let convenienceScore = 0;
    if (parkingFree === true) convenienceScore += 3;
    if (limitYn === false) convenienceScore += 3;
    if (total >= 6) convenienceScore += 2;
    if (available / total >= 0.5 && available > 0) convenienceScore += 2;

    let reliabilityScore = 0;
    if (updatedAt) reliabilityScore += 5;
    else if (statusMode !== 'unknown') reliabilityScore += 2;
    if (trouble > 0) reliabilityScore -= Math.min(8, trouble * 2);
    if (limitYn === true) reliabilityScore -= 6;

    return Math.round(distanceScore + availabilityScore + rapidScore + convenienceScore + reliabilityScore);
  }

  function buildAvailabilityText(item) {
    const available = Number(item?.availableCount || 0);
    const charging = Number(item?.chargingCount || 0);
    const trouble = Number(item?.troubleCount || 0);
    if (available > 0) return `사용 가능 ${available}기`;
    if (charging > 0) return `충전 중 ${charging}기`;
    if (trouble > 0) return `점검·고장 ${trouble}기`;
    return '상태 확인 필요';
  }

  function buildAvailabilityLabel({ availableCount = 0, chargingCount = 0, troubleCount = 0 } = {}) {
    const available = Number(availableCount || 0);
    const charging = Number(chargingCount || 0);
    const trouble = Number(troubleCount || 0);
    if (available >= 5) return '사용 가능 여유';
    if (available > 0) return '사용 가능';
    if (charging > 0) return '도착 시점 확인';
    if (trouble > 0) return '운영 상태 주의';
    return '상태 확인 필요';
  }

  function buildTotalChargerCount(item) {
    return Math.max(
      Number(item?.chargerCount || 0),
      Number(item?.totalChargerCount || 0),
      Number(item?.availableCount || 0) + Number(item?.chargingCount || 0) + Number(item?.troubleCount || 0) + Number(item?.unknownCount || 0),
      Array.isArray(item?.chargers) ? item.chargers.length : 0,
      0
    );
  }

  function buildConvenienceBadges(item) {
    const badges = [];
    if (Number(item?.rapidCount || 0) > 0) badges.push('급속');
    if (item?.parkingFree === true) badges.push('주차료 무료');
    else if (item?.parkingFree === false) badges.push('주차료 유료');
    if (item?.limitYn === false) badges.push('이용 제한 없음');
    else if (item?.limitYn === true) badges.push('이용 제한 있음');
    if (item?.updatedAt) badges.push('상태 갱신');
    return badges;
  }

  function zcodeForSido(sido) {
    return ZCODE_BY_SIDO[inferSido(sido)] || ZCODE_BY_SIDO[sido] || '11';
  }

  function normalizeLocalBoolean(value) {
    const text = String(value ?? '').trim().toUpperCase();
    if (['Y','YES','TRUE','1','무료','가능'].includes(text)) return true;
    if (['N','NO','FALSE','0','유료','불가'].includes(text)) return false;
    if (value === true || value === false) return value;
    return null;
  }

  function mergeRemoteStatusIntoLocal(remoteData) {
    const remoteStations = Array.isArray(remoteData?.chargers) ? remoteData.chargers : [];
    const byId = new Map(remoteStations.map((item) => [String(item.id || ''), item]).filter(([id]) => id));
    let matched = 0;
    const chargers = state.stations.map((local) => {
      const remote = byId.get(String(local.id || ''));
      if (!remote) return local;
      matched += 1;
      const availableCount = Number(remote.availableCount ?? local.availableCount ?? 0);
      const chargingCount = Number(remote.chargingCount ?? local.chargingCount ?? 0);
      const troubleCount = Number(remote.troubleCount ?? local.troubleCount ?? 0);
      const unknownCount = Number(remote.unknownCount ?? local.unknownCount ?? 0);
      const chargers = Array.isArray(remote.chargers) && remote.chargers.length ? remote.chargers : local.chargers;
      const updatedAt = remote.updatedAt || local.updatedAt || '';
      return {
        ...local,
        availableCount,
        chargingCount,
        troubleCount,
        unknownCount,
        chargers,
        updatedAt,
        totalChargerCount: buildTotalChargerCount({ ...local, availableCount, chargingCount, troubleCount, unknownCount, chargers }),
        bestScore: buildLocalScore({
          distanceM: local.distanceM,
          rapidCount: local.rapidCount,
          parkingFree: local.parkingFree,
          limitYn: local.limitYn,
          availableCount,
          chargingCount,
          troubleCount,
          unknownCount,
          updatedAt,
          totalCount: buildTotalChargerCount({ ...local, availableCount, chargingCount, troubleCount, unknownCount, chargers }),
          statusMode: remote.statusTone || local.statusTone
        }),
        statusTone: availableCount > 0 ? 'good' : (chargingCount > 0 ? 'busy' : (troubleCount > 0 ? 'bad' : 'unknown')),
        availabilityLabel: buildAvailabilityLabel({ availableCount, chargingCount, troubleCount })
      };
    });
    return {
      ok: true,
      checkedAt: remoteData?.checkedAt || new Date().toISOString(),
      center: remoteData?.center || { lat: state.center.lat, lng: state.center.lng, radius: els.radius?.value || '3000', sido: state.center.sido || '선택 지역' },
      cache: { ...(remoteData?.cache || {}), hit: true, scope: 'local-static', remoteStatusMerged: true },
      count: chargers.length,
      remoteMatchedCount: matched,
      chargers,
      rawItems: []
    };
  }

  function applyChargerData(data, options = {}) {
    state.stations = Array.isArray(data.chargers) ? data.chargers : [];
    state.dataSource = options.fromLocalCache || data?.cache?.scope === 'local-static' ? 'local-static' : (options.fromClientCache ? 'client-cache' : 'remote');
    state.lastSearchCenter = { lat: state.center.lat, lng: state.center.lng };
    state.lastSearchZoom = state.map?.getLevel?.() ?? state.lastSearchZoom;
    state.shouldFitBounds = true;
    renderDataBadges({ ...data, fromClientCache: options.fromClientCache, fromLocalCache: options.fromLocalCache || data?.cache?.scope === 'local-static' });
    renderResults();
  }

  function buildClientCacheKey(radius) {
    const latKey = roundCoord(state.center.lat);
    const lngKey = roundCoord(state.center.lng);
    const sido = state.center.sido || '서울';
    return `${CLIENT_CACHE_PREFIX}${sido}:${latKey}:${lngKey}:${radius}`;
  }

  function readClientCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload?.createdAt || Date.now() - payload.createdAt > CLIENT_CACHE_TTL_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  function writeClientCache(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ createdAt: Date.now(), data }));
    } catch {}
  }

  function roundCoord(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return number.toFixed(3);
  }

  function renderResults() {
    const mode = els.sort?.value || 'recommended';
    let list = [...state.stations];
    list = applyFilters(list);
    list.sort(sorter(mode));

    const groupedList = groupStationsForDisplay(list);
    groupedList.sort(sorter(mode));
    groupedList.forEach((item, index) => { item.rank = index + 1; });

    const visibleLimit = resultLimitForRadius();
    const visibleList = groupedList.slice(0, visibleLimit);
    state.sortedStations = groupedList;
    state.displayResults = visibleList;

    const selectedStillVisible = state.selectedId && visibleList.some((item) => isSameStationId(item, state.selectedId));
    if (!selectedStillVisible) {
      state.selectedId = visibleList[0]?.id || null;
      root.querySelector('.parking-map-popup')?.remove();
    }

    const radiusText = formatRadius(els.radius?.value || '3000');
    const typeText = selectedText(els.type) || '전체';
    if (els.summaryTitle) els.summaryTitle.textContent = `${state.center.name || '선택 장소'} · ${radiusText} · ${typeText}`;
    if (els.summarySubtitle) {
      const groupedText = groupedList.length < list.length ? ` · 유사 장소 ${list.length - groupedList.length}건 묶음` : '';
      els.summarySubtitle.textContent = `${state.center.sido || '선택 지역'} 기준 ${groupedList.length}개 충전소 후보를 확인했습니다${groupedText}.`;
    }
    if (els.mobileSheetTitle) els.mobileSheetTitle.textContent = visibleList.length ? `추천 충전소 ${visibleList.length}곳` : '추천 결과';
    if (els.mobileSheetSubtitle) els.mobileSheetSubtitle.textContent = `${state.center.name || '선택 장소'} 주변 충전소 상태를 비교합니다.`;

    if (!visibleList.length) {
      state.displayResults = [];
      state.selectedId = null;
      renderEmpty('조건에 맞는 충전소가 없습니다. 반경이나 필터를 조정해 주세요.');
      renderMapMarkers([]);
      syncMapToolbar();
      syncSortButtons(mode);
      return;
    }

    const moreNotice = renderMoreNotice(groupedList.length, visibleList.length);
    const desktopHtml = visibleList.map((item, index) => renderStationCard(item, index, false)).join('') + moreNotice;
    const mobileHtml = visibleList.map((item, index) => renderStationCard(item, index, true)).join('') + moreNotice;
    if (els.resultList) els.resultList.innerHTML = desktopHtml;
    if (els.mobileResults) els.mobileResults.innerHTML = mobileHtml;
    bindResultCardEvents(els.resultList);
    bindResultCardEvents(els.mobileResults);

    renderMapMarkers(visibleList);
    if (state.selectedId) showEvMapPopup(state.selectedId);
    syncMapToolbar();
    syncSortButtons(mode);
    updateMobileEvListToggle(visibleList.length);
    if (isMobileEvViewport() && !els.mobileSheet?.classList.contains('is-open') && !els.mobileSheet?.classList.contains('is-expanded')) {
      openMobileSheet('collapsed');
    }
  }

  function renderMoreNotice(total, visible) {
    if (total <= visible) return '';
    return `<article class="parking-result-card parking-result-more"><strong>상위 ${visible}곳만 표시 중입니다.</strong><p>반경이 넓을수록 더 많은 후보를 표시합니다. 조건이나 반경을 조정하면 결과가 함께 갱신됩니다.</p></article>`;
  }

  function groupStationsForDisplay(list) {
    const groups = [];
    list.forEach((item) => {
      const key = stationDisplayKey(item);
      const match = key ? groups.find((group) => shouldGroupStation(group, item, key)) : null;
      if (match) mergeStationIntoGroup(match, item);
      else groups.push(makeStationDisplayGroup(item, key));
    });
    return groups.map(finalizeStationDisplayGroup);
  }

  function stationDisplayKey(item) {
    const name = normalizeDisplayText(item?.name || '')
      .replace(/전기차충전소|전기충전소|충전소|급속|완속/g, '');
    if (name.length < 4) return '';
    return name;
  }

  function normalizeDisplayText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, '')
      .replace(/[\s·ㆍ,._\-–—/\\]/g, '')
      .trim();
  }

  function shouldGroupStation(group, item, key) {
    if (!group || !key || group.displayKey !== key) return false;
    const distance = distanceMeters(group.lat, group.lng, item.lat, item.lng);
    if (distance <= EV_GROUP_DISTANCE_M) return true;
    const addressA = normalizeDisplayText(group.address || '').slice(0, 18);
    const addressB = normalizeDisplayText(item.address || '').slice(0, 18);
    return Boolean(addressA && addressB && addressA === addressB);
  }

  function makeStationDisplayGroup(item, key) {
    return { ...item, displayKey: key, sourceStationCount: 1, sourceStationIds: [item.id], chargers: Array.isArray(item.chargers) ? [...item.chargers] : [] };
  }

  function mergeStationIntoGroup(group, item) {
    group.sourceStationCount = Number(group.sourceStationCount || 1) + 1;
    group.sourceStationIds = [...new Set([...(group.sourceStationIds || []), item.id].filter(Boolean))];
    group.id = group.id || item.id;
    group.distanceM = Math.min(Number(group.distanceM || Infinity), Number(item.distanceM || Infinity));
    group.lat = Number.isFinite(group.lat) ? group.lat : item.lat;
    group.lng = Number.isFinite(group.lng) ? group.lng : item.lng;
    group.availableCount = Number(group.availableCount || 0) + Number(item.availableCount || 0);
    group.chargingCount = Number(group.chargingCount || 0) + Number(item.chargingCount || 0);
    group.troubleCount = Number(group.troubleCount || 0) + Number(item.troubleCount || 0);
    group.unknownCount = Number(group.unknownCount || 0) + Number(item.unknownCount || 0);
    group.rapidCount = Number(group.rapidCount || 0) + Number(item.rapidCount || 0);
    group.slowCount = Number(group.slowCount || 0) + Number(item.slowCount || 0);
    if (item.parkingFree === true) group.parkingFree = true;
    else if (group.parkingFree == null) group.parkingFree = item.parkingFree;
    if (item.limitYn === false) group.limitYn = false;
    else if (group.limitYn == null) group.limitYn = item.limitYn;
    if (item.bestScore > group.bestScore) group.bestScore = item.bestScore;
    if (item.updatedAt && (!group.updatedAt || String(item.updatedAt) > String(group.updatedAt))) group.updatedAt = item.updatedAt;
    const chargerMap = new Map((group.chargers || []).map((charger) => [`${charger.stationId || ''}:${charger.chargerId || ''}:${charger.typeCode || ''}`, charger]));
    (item.chargers || []).forEach((charger, index) => {
      const key = `${charger.stationId || item.id || ''}:${charger.chargerId || index}:${charger.typeCode || ''}`;
      if (!chargerMap.has(key)) chargerMap.set(key, charger);
    });
    group.chargers = Array.from(chargerMap.values());
  }

  function finalizeStationDisplayGroup(group) {
    const availableCount = Number(group.availableCount || 0);
    const chargingCount = Number(group.chargingCount || 0);
    const troubleCount = Number(group.troubleCount || 0);
    const unknownCount = Number(group.unknownCount || 0);
    const sourceCount = Number(group.sourceStationCount || 1);
    const sourceIds = Array.from(new Set((group.sourceStationIds || [group.id]).filter(Boolean).map(String)));
    const representativeId = sourceCount > 1 ? `group:${sourceIds[0] || group.id}` : String(group.id || sourceIds[0] || group.name || 'station');
    const totalChargerCount = buildTotalChargerCount({ ...group, availableCount, chargingCount, troubleCount, unknownCount });
    const bestScore = buildLocalScore({
      distanceM: group.distanceM,
      rapidCount: group.rapidCount,
      parkingFree: group.parkingFree,
      limitYn: group.limitYn,
      availableCount,
      chargingCount,
      troubleCount,
      unknownCount,
      updatedAt: group.updatedAt || '',
      totalCount: totalChargerCount,
      statusMode: group.statusTone || 'unknown'
    });
    return {
      ...group,
      id: representativeId,
      originalId: String(group.id || sourceIds[0] || representativeId),
      stationIdAliases: sourceIds.includes(representativeId) ? sourceIds : [representativeId, ...sourceIds],
      displayName: group.name,
      groupLabel: sourceCount > 1 ? `같은 장소 ${sourceCount}건 묶음` : '',
      totalChargerCount,
      bestScore,
      statusTone: availableCount > 0 ? 'good' : (chargingCount > 0 ? 'busy' : (troubleCount > 0 ? 'bad' : 'unknown')),
      availabilityLabel: buildAvailabilityLabel({ availableCount, chargingCount, troubleCount })
    };
  }

  function applyFilters(list) {
    const speed = els.speed?.value || 'all';
    const type = els.type?.value || '';
    const availabilityType = els.availabilityType?.value || 'available';
    return list.filter((item) => {
      const localStaticOnly = state.dataSource === 'local-static';
      const availableOnly = (els.filters.availableOnly?.checked || availabilityType === 'available') && !localStaticOnly;
      if (availableOnly && item.availableCount <= 0) return false;
      if (speed === 'rapid' && item.rapidCount <= 0) return false;
      if (speed === 'slow' && item.slowCount <= 0) return false;
      if (type && !item.chargers?.some((charger) => charger.typeCode === type)) return false;
      if ((availabilityType === 'rapid' || els.filters.rapidOnly?.checked) && item.rapidCount <= 0) return false;
      if ((availabilityType === 'parkingFree' || els.filters.freeParking?.checked) && item.parkingFree !== true) return false;
      if (els.filters.noLimit?.checked && item.limitYn !== false) return false;
      if (els.filters.updatedOnly?.checked && !item.updatedAt) return false;
      if (els.filters.lowRiskOnly?.checked && item.statusTone !== 'good') return false;
      return true;
    });
  }

  function renderStationCard(item, index, mobile = false) {
    const rank = item.rank || index + 1;
    const selected = isSameStationId(item, state.selectedId);
    const statusClass = item.statusTone === 'good' ? 'metric-confidence-high' : item.statusTone === 'busy' ? 'metric-risk-medium' : item.statusTone === 'bad' ? 'metric-risk-high' : 'metric-confidence-low';
    const availabilityText = buildAvailabilityText(item);
    const distanceText = `장소에서 약 ${formatDistance(item.distanceM)}`;
    const detailId = `${mobile ? 'mobile-' : ''}ev-detail-${rank}`;
    const totalCount = buildTotalChargerCount(item);
    const badges = buildConvenienceBadges(item);
    const compactTypes = compactTypesSummary(item);
    const groupBadge = item.groupLabel ? `<span class="parking-metric-chip metric-confidence-medium">${escapeHtml(item.groupLabel)}</span>` : '';
    const badgeText = badges.slice(0, 3).join(' · ') || '이용 조건 확인';
    return `<article class="parking-result-card ${item.statusTone || ''} ${rank === 1 ? 'is-best' : ''} ${selected ? 'is-pinned' : ''}" data-ev-station-index="${index}" data-ev-station-id="${escapeHtml(item.id)}">
      <div class="parking-card-head"><div><strong>${escapeHtml(item.displayName || item.name)}</strong><span>${`추천 ${rank}위`} · ${escapeHtml(item.availabilityLabel || '상태 확인')}</span></div></div>
      <div class="parking-list-summary" aria-hidden="true"><strong>${escapeHtml(availabilityText)}</strong><span>${distanceText}</span><span>${escapeHtml(badgeText)}</span></div>
      <div class="parking-price-row"><strong>${escapeHtml(availabilityText)}</strong><span>${escapeHtml(compactTypes)}</span></div>
      <div class="parking-card-metrics">
        <span class="parking-metric-chip metric-distance">${distanceText}</span>
        <span class="parking-metric-chip metric-availability">전체 ${totalCount || 0}기 · 급속 ${item.rapidCount || 0}기</span>
        <span class="parking-metric-chip ${statusClass}">${escapeHtml(item.availabilityLabel || '확인 필요')}</span>
        <span class="parking-metric-chip metric-confidence-high">${escapeHtml(badgeText)}</span>
        ${groupBadge}
      </div>
      ${selected ? `<p class="parking-pinned-badge">지도에서 선택한 충전소입니다.</p>` : ''}
      <div class="parking-card-actions"><button type="button" class="parking-detail-toggle" data-ev-detail-toggle aria-expanded="false" aria-controls="${detailId}">상세 보기 ▼</button>${renderKakaoLink(item)}</div>
      <div class="parking-card-detail" data-ev-card-detail id="${detailId}" hidden>
        <p><strong>충전 타입</strong> ${escapeHtml(typesSummary(item))}</p>
        <p><strong>충전기 상태</strong> 사용 가능 ${item.availableCount || 0}기 / 전체 ${totalCount || 0}기 · 충전 중 ${item.chargingCount || 0}기 · 점검/고장 ${item.troubleCount || 0}기 · 확인 필요 ${item.unknownCount || 0}기</p>
        <p><strong>이용 시간</strong> ${escapeHtml(item.useTime || '확인 필요')}</p>
        <p><strong>운영기관</strong> ${escapeHtml(item.business || '확인 필요')}</p>
        <p><strong>주소</strong> ${escapeHtml(item.address || '주소 정보 없음')}</p>
        <p><strong>이용 조건</strong> ${item.limitYn === false ? '이용 제한 없음' : item.limitYn === true ? '이용 제한 있음' : '이용 제한 확인 필요'} · ${item.parkingFree === true ? '주차료 무료' : item.parkingFree === false ? '주차료 유료' : '주차료 확인 필요'}</p>
        <p><strong>상태 갱신</strong> ${escapeHtml(item.updatedAt || '확인 필요')}</p>
        <p class="fine-print">충전기 상태는 제공기관 데이터 기준이며 실제 현장 상황과 도착 시점에 따라 달라질 수 있습니다.</p>
      </div>
    </article>`;
  }

  function bindResultCardEvents(scope = root) {
    if (!scope) return;
    scope.querySelectorAll('[data-ev-station-id]').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-ev-detail-toggle], a, button')) return;
        const item = findDisplayStationById(card.dataset.evStationId);
        focusStation(item, { openSheet: isMobileEvViewport(), keepMapCenter: false });
      });
    });
    scope.querySelectorAll('[data-ev-detail-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const card = button.closest('.parking-result-card');
        const detail = card?.querySelector('[data-ev-card-detail]');
        const open = detail?.hidden;
        if (detail) detail.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.textContent = open ? '상세 닫기 ▲' : '상세 보기 ▼';
      });
    });
  }

  function createMapLabelElement(item, index) {
    const selected = isSameStationId(item, state.selectedId);
    const status = markerStatusText(item);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `parking-map-label ev-map-label is-status-${item.statusTone || 'unknown'} ${index === 0 ? 'is-best' : ''} ${selected ? 'is-selected' : ''}`;
    button.dataset.evMapId = String(item.id || '');
    button.title = `${index + 1}순위 · ${item.displayName || item.name || '전기차 충전소'} · ${status}`;
    const rankText = markerRankText(index, selected);
    if (rankText) {
      const rank = document.createElement('span');
      rank.className = 'parking-marker-rank';
      rank.textContent = rankText;
      button.appendChild(rank);
    }
    const label = document.createElement('span');
    label.textContent = status;
    button.appendChild(label);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      focusStation(item, { keepMapCenter: true });
    });
    return button;
  }

  function renderMapLabelHtml(item, index, style = '') {
    const selected = isSameStationId(item, state.selectedId);
    const status = markerStatusText(item);
    const rankText = markerRankText(index, selected);
    const rank = rankText ? `<span class="parking-marker-rank">${rankText}</span>` : '';
    const styleAttr = style ? ` style="${style}"` : '';
    return `<button type="button" class="parking-map-label ev-map-label is-status-${item.statusTone || 'unknown'} ${index === 0 ? 'is-best' : ''} ${selected ? 'is-selected' : ''}"${styleAttr} data-ev-map-id="${escapeHtml(item.id)}" title="${escapeHtml(`${index + 1}순위 · ${item.displayName || item.name} · ${status}`)}">${rank}<span>${escapeHtml(status)}</span></button>`;
  }

  function markerRankText(index, selected) {
    return String(index + 1);
  }

  function markerStatusText(item) {
    const available = Number(item?.availableCount || 0);
    if (available > 0) return `가능 ${available}기`;
    if (Number(item?.chargingCount || 0) > 0) return '충전 중';
    if (Number(item?.troubleCount || 0) > 0) return '주의';
    return '확인 필요';
  }

  function renderMapMarkers(list) {
    clearKakaoMarkers();
    const rows = Array.isArray(list) ? list.slice(0, mapLimitForRadius()) : [];

    if (state.kakaoReady && state.map && window.kakao?.maps) {
      if (els.mapMarkers) els.mapMarkers.innerHTML = '';

      const bounds = new window.kakao.maps.LatLngBounds();
      const centerPosition = new window.kakao.maps.LatLng(state.center.lat, state.center.lng);
      bounds.extend(centerPosition);

      const destination = document.createElement('span');
      destination.className = 'parking-destination-marker';
      destination.textContent = '장소';
      const destOverlay = new window.kakao.maps.CustomOverlay({
        position: centerPosition,
        content: destination,
        yAnchor: 1.2
      });
      destOverlay.setMap(state.map);
      state.mapOverlays.push(destOverlay);

      rows.forEach((item, index) => {
        if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return;
        const position = new window.kakao.maps.LatLng(Number(item.lat), Number(item.lng));
        bounds.extend(position);
        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content: createMapLabelElement(item, index),
          yAnchor: 1
        });
        overlay.setMap(state.map);
        state.mapOverlays.push(overlay);
      });

      if (rows.length && state.shouldFitBounds) {
        state.map.setBounds(bounds);
        state.shouldFitBounds = false;
      }
      return;
    }

    renderFallbackMarkers(rows);
  }

  function renderFallbackMarkers(list) {
    if (!els.mapMarkers) return;
    const rows = Array.isArray(list) ? list.slice(0, mapLimitForRadius()) : [];
    const lats = rows.map((row) => Number(row.lat)).filter(Number.isFinite).concat(Number(state.center.lat));
    const lngs = rows.map((row) => Number(row.lng)).filter(Number.isFinite).concat(Number(state.center.lng));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pos = (row) => {
      const x = 10 + ((Number(row.lng) - minLng) / Math.max(0.001, maxLng - minLng)) * 80;
      const y = 85 - ((Number(row.lat) - minLat) / Math.max(0.001, maxLat - minLat)) * 70;
      return { left: `${clamp(x, 8, 88)}%`, top: `${clamp(y, 12, 82)}%` };
    };

    els.mapMarkers.innerHTML = rows.map((item, index) => {
      const p = pos(item);
      return renderMapLabelHtml(item, index, `left:${p.left}; top:${p.top}`);
    }).join('') + `<span class="parking-destination-marker" style="left:50%; top:50%">장소</span>`;

    els.mapMarkers.querySelectorAll('[data-ev-map-id]').forEach((button) => button.addEventListener('click', () => {
      const item = findDisplayStationById(button.dataset.evMapId);
      focusStation(item, { keepMapCenter: true });
    }));
  }

  function clearKakaoMarkers() {
    state.mapMarkers.forEach((marker) => marker.setMap(null));
    state.mapOverlays.forEach((overlay) => overlay.setMap(null));
    state.mapMarkers = [];
    state.mapOverlays = [];
  }

  function focusStation(item, options = {}) {
    if (!item) return;
    state.selectedId = item.id;
    state.shouldFitBounds = false;
    if (state.kakaoReady && state.map && window.kakao?.maps) {
      const position = new window.kakao.maps.LatLng(Number(item.lat), Number(item.lng));
      if (!options.keepMapCenter) {
        if (typeof state.map.panTo === 'function') state.map.panTo(position);
        else state.map.setCenter(position);
      }
      if (!options.keepLevel && typeof state.map.getLevel === 'function' && state.map.getLevel() > 4) state.map.setLevel(4);
    }
    setStatus(`${item.displayName || item.name} 위치를 지도에서 선택했습니다. 실제 충전 가능 여부는 현장에서 다시 확인해 주세요.`, 'neutral');
    renderResults();
    showEvMapPopup(item.id);
    if (isMobileEvViewport() && options.openSheet) setEvMobileSheetState('half');
  }


  function showEvMapPopup(id) {
    const item = findDisplayStationById(id);
    const mapCard = root.querySelector('.parking-map-card');
    if (!item || !mapCard) return;
    mapCard.querySelector('.parking-map-popup')?.remove();
    const rank = item.rank || (state.sortedStations.findIndex((row) => isSameStationId(row, id)) + 1) || '-';
    const price = buildAvailabilityText(item);
    const distance = `장소에서 약 ${formatDistance(item.distanceM)}`;
    const totalCount = buildTotalChargerCount(item);
    const meta = `${compactTypesSummary(item)} · ${buildConvenienceBadges(item).slice(0, 2).join(' · ') || '이용 조건 확인'}`;
    const popup = document.createElement('article');
    const useDetailPopup = !isMobileEvViewport();
    popup.className = `parking-map-popup${useDetailPopup ? ' parking-map-popup--detail' : ''} ev-map-popup`;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', `${item.name} 충전소 ${useDetailPopup ? '상세' : '요약'}`);
    const kakaoLink = renderKakaoLink(item, 'parking-kakao-map-link tiny');
    popup.innerHTML = useDetailPopup ? [
      '<button type="button" class="parking-map-popup__close" aria-label="지도 충전소 요약 닫기">×</button>',
      '<div class="parking-map-popup__head">',
      `<span>${rank}위</span>`,
      `<strong>${escapeHtml(item.displayName || item.name)}</strong>`,
      '</div>',
      `<p class="parking-map-popup__meta">${escapeHtml(meta)}</p>`,
      `<div class="parking-map-popup__price-row"><strong>${escapeHtml(price)}</strong><span>${escapeHtml(distance)}</span></div>`,
      '<div class="parking-map-popup__metrics">',
      `<span class="parking-metric-chip metric-distance">${escapeHtml(distance)}</span>`,
      `<span class="parking-metric-chip metric-availability">전체 ${totalCount || 0}기 · 급속 ${item.rapidCount || 0}기</span>`,
      `<span class="parking-metric-chip metric-confidence-high">${escapeHtml(item.availabilityLabel || '확인 필요')}</span>`,
      `<span class="parking-metric-chip metric-confidence-medium">${escapeHtml(item.business || '운영기관 확인')}</span>`,
      '</div>',
      `<div class="parking-map-popup__selected-row"><p class="parking-pinned-badge parking-pinned-badge--inline">지도에서 선택한 충전소입니다.</p>${kakaoLink}</div>`
    ].join('') : [
      '<button type="button" class="parking-map-popup__close" aria-label="지도 충전소 요약 닫기">×</button>',
      '<div class="parking-map-popup__head">',
      `<span>${rank}위</span>`,
      `<strong>${escapeHtml(item.displayName || item.name)}</strong>`,
      '</div>',
      `<p class="parking-map-popup__meta">${escapeHtml(meta)}</p>`,
      `<p class="parking-map-popup__price">${escapeHtml(price)}</p>`,
      `<p class="parking-map-popup__detail">${escapeHtml(distance)} · ${escapeHtml(item.availabilityLabel || '확인 필요')}</p>`,
      `<div class="parking-map-popup__actions"><button type="button" class="subtle-button tiny" data-ev-mobile-detail-card>상세 보기</button>${kakaoLink}</div>`
    ].join('');
    popup.querySelector('.parking-map-popup__close')?.addEventListener('click', () => popup.remove());
    popup.querySelector('[data-ev-mobile-detail-card]')?.addEventListener('click', () => openMobileEvDetail(item.id));
    mapCard.append(popup);
  }

  function openMobileEvDetail(id) {
    const item = findDisplayStationById(id);
    if (!item) return;
    document.querySelector('.parking-mobile-detail-modal.ev-mobile-detail-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'parking-mobile-detail-modal ev-mobile-detail-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `${item.name} 상세 정보`);
    const index = Math.max(0, state.displayResults.findIndex((row) => isSameStationId(row, id)));
    modal.innerHTML = `<div class="parking-mobile-detail-backdrop" data-ev-mobile-detail-close></div>
      <section class="parking-mobile-detail-panel">
        <div class="parking-mobile-detail-head"><strong>충전소 상세</strong><button type="button" aria-label="상세 닫기" data-ev-mobile-detail-close>×</button></div>
        ${renderStationCard(item, index, true)}
      </section>`;
    document.body.append(modal);
    const detail = modal.querySelector('[data-ev-card-detail]');
    const toggle = modal.querySelector('[data-ev-detail-toggle]');
    if (detail) detail.hidden = false;
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.textContent = '상세 닫기 ▲';
    }
    modal.querySelectorAll('[data-ev-mobile-detail-close]').forEach((button) => {
      button.addEventListener('click', () => modal.remove());
    });
    bindResultCardEvents(modal);
  }

  function updateMapCenter() {
    if (state.kakaoReady && state.map && window.kakao?.maps) {
      state.map.setCenter(new window.kakao.maps.LatLng(state.center.lat, state.center.lng));
    }
  }

  function bindKakaoMapMoveEvents() {
    if (!state.map || !window.kakao?.maps || state.hasMapMoveEvents) return;
    state.hasMapMoveEvents = true;
    window.kakao.maps.event.addListener(state.map, 'idle', () => {
      if (!els.mapRefresh) return;
      const center = state.map.getCenter();
      const moved = distanceMeters(state.lastSearchCenter?.lat || state.center.lat, state.lastSearchCenter?.lng || state.center.lng, center.getLat(), center.getLng());
      els.mapRefresh.hidden = !(moved >= 500);
    });
  }

  async function researchCurrentMapArea() {
    if (state.map && window.kakao?.maps) {
      const center = state.map.getCenter();
      const lat = center.getLat();
      const lng = center.getLng();
      let region = {};
      try {
        region = await fetchJson(`/api/kakao-local?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, { timeoutMs: 5000 });
      } catch (_) {}
      const address = region?.addressName || '지도에서 다시 검색한 위치';
      state.center = {
        lat,
        lng,
        name: '현재 지도 중심',
        address,
        sido: region?.region1 || inferSido(address) || state.center.sido || '서울',
        region2: region?.region2 || inferDistrict(address) || state.center.region2 || '',
        zscode: ''
      };
      if (els.destination) els.destination.value = state.center.name;
      if (els.mapDestination) els.mapDestination.value = state.center.name;
    }
    if (els.mapRefresh) els.mapRefresh.hidden = true;
    await fetchChargers();
  }

  function setSort(mode) {
    if (els.sort) els.sort.value = mode;
    syncSortButtons(mode);
    renderResults();
  }

  function syncSortButtons(mode) {
    root.querySelectorAll('[data-ev-sort-mode]').forEach((button) => button.classList.toggle('active', button.dataset.evSortMode === mode));
    root.querySelectorAll('[data-ev-map-sort]').forEach((button) => button.classList.toggle('active', button.dataset.evMapSort === mode));
    root.querySelectorAll('[data-ev-mobile-sort]').forEach((button) => button.classList.toggle('active', button.dataset.evMobileSort === mode));
    if (els.mapSortToggle) els.mapSortToggle.textContent = sortLabel(mode);
    if (els.mobileSortButton) els.mobileSortButton.textContent = sortLabel(mode);
  }

  function syncAvailabilityPreset() {
    const mode = els.availabilityType?.value || 'available';
    if (els.filters.availableOnly) els.filters.availableOnly.checked = mode !== 'all';
    if (mode === 'rapid' && els.filters.rapidOnly) els.filters.rapidOnly.checked = true;
    if (mode === 'parkingFree' && els.filters.freeParking) els.filters.freeParking.checked = true;
  }

  function syncQuickButtons() {
    els.quickButtons.forEach((button) => {
      const active = (button.dataset.evRadius && els.radius.value === button.dataset.evRadius) || (button.dataset.evSpeed && els.speed.value === button.dataset.evSpeed) || (button.dataset.evType && els.type.value === button.dataset.evType);
      button.classList.toggle('active', Boolean(active));
    });
  }

  function syncMapToolbar() {
    if (els.mapRadiusToggle) els.mapRadiusToggle.textContent = formatRadius(els.radius?.value || '3000');
    if (els.mapType && els.mapType.value !== els.type.value) els.mapType.value = els.type.value;
    els.mapRadiusButtons.forEach((button) => {
      const activeRadius = button.dataset.evMapRadius && els.radius?.value === button.dataset.evMapRadius;
      const activeSpeed = button.dataset.evMapSpeed && els.speed?.value === button.dataset.evMapSpeed;
      button.classList.toggle('active', Boolean(activeRadius || activeSpeed));
    });
    els.mapFilterInputs.forEach((input) => {
      const source = els.filters[input.dataset.evMapFilter];
      if (source) input.checked = source.checked;
    });
  }

  function toggleMapPopover(panel, toggle) {
    if (!panel || !toggle) return;
    const willOpen = panel.hidden;
    closeMapToolbarPopovers();
    panel.hidden = !willOpen;
    toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  function closeMapToolbarPopovers() {
    [els.mapRadiusPanel, els.mapOptionsPanel, els.mapSortPanel].forEach((panel) => { if (panel) panel.hidden = true; });
    [els.mapRadiusToggle, els.mapOptionsToggle, els.mapSortToggle].forEach((toggle) => toggle?.setAttribute('aria-expanded', 'false'));
  }


  function isMobileEvViewport() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function ensureEvMobileActionSheet() {
    let sheet = document.querySelector('#ev-mobile-action-sheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'ev-mobile-action-sheet';
    sheet.className = 'parking-mobile-action-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <button type="button" class="parking-mobile-action-sheet__backdrop" data-ev-action-close aria-label="설정 닫기"></button>
      <section class="parking-mobile-action-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="ev-mobile-action-sheet-title">
        <div class="parking-mobile-action-sheet__grip" aria-hidden="true"></div>
        <div class="parking-mobile-action-sheet__head">
          <strong id="ev-mobile-action-sheet-title">설정</strong>
          <button type="button" data-ev-action-close aria-label="설정 닫기">×</button>
        </div>
        <div class="parking-mobile-action-sheet__body"></div>
      </section>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (event) => {
      if (event.target.closest('[data-ev-action-close]')) closeEvMobileActionSheet();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !sheet.hidden) closeEvMobileActionSheet();
    });
    return sheet;
  }

  function closeEvMobileActionSheet() {
    const sheet = document.querySelector('#ev-mobile-action-sheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    window.setTimeout(() => { sheet.hidden = true; }, 160);
  }

  function openEvMobileActionSheet(type) {
    if (!isMobileEvViewport()) return false;
    const sheet = ensureEvMobileActionSheet();
    const title = sheet.querySelector('#ev-mobile-action-sheet-title');
    const body = sheet.querySelector('.parking-mobile-action-sheet__body');
    if (!title || !body) return false;
    closeMapToolbarPopovers();

    if (type === 'radius') {
      title.textContent = '검색 반경 선택';
      const radius = els.radius?.value || '3000';
      const speed = els.speed?.value || 'all';
      body.innerHTML = `
        <div class="parking-mobile-action-sheet__section">
          <span class="parking-mobile-action-sheet__label">검색 반경</span>
          <div class="parking-mobile-action-sheet__quick-grid" role="group" aria-label="검색 반경">
            ${[['1000','1km'], ['3000','3km'], ['5000','5km'], ['10000','10km']].map(([value, label]) => `<button type="button" data-ev-action-radius="${value}" class="${radius === value ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="parking-mobile-action-sheet__section">
          <span class="parking-mobile-action-sheet__label">충전 속도</span>
          <div class="parking-mobile-action-sheet__quick-grid" role="group" aria-label="충전 속도">
            ${[['all','전체'], ['rapid','급속'], ['slow','완속']].map(([value, label]) => `<button type="button" data-ev-action-speed="${value}" class="${speed === value ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
        <button type="button" class="primary-button wide-button" data-ev-action-close>적용하기</button>`;
      body.querySelectorAll('[data-ev-action-radius]').forEach((button) => {
        button.addEventListener('click', () => {
          const previous = els.radius?.value || '3000';
          if (els.radius) els.radius.value = button.dataset.evActionRadius || '3000';
          syncQuickButtons();
          syncMapToolbar();
          if (state.stations.length && previous !== els.radius.value) fetchChargers({ reason: 'radius' });
          body.querySelectorAll('[data-ev-action-radius]').forEach((item) => item.classList.toggle('active', item === button));
        });
      });
      body.querySelectorAll('[data-ev-action-speed]').forEach((button) => {
        button.addEventListener('click', () => {
          if (els.speed) els.speed.value = button.dataset.evActionSpeed || 'all';
          syncQuickButtons();
          syncMapToolbar();
          renderResults();
          body.querySelectorAll('[data-ev-action-speed]').forEach((item) => item.classList.toggle('active', item === button));
        });
      });
    } else if (type === 'conditions') {
      title.textContent = '충전 조건';
      const typeValue = els.type?.value || '';
      const checked = (key) => els.filters[key]?.checked ? 'checked' : '';
      body.innerHTML = `
        <div class="parking-mobile-action-sheet__section">
          <span class="parking-mobile-action-sheet__label">충전 타입</span>
          <div class="parking-mobile-action-sheet__quick-grid parking-mobile-action-sheet__quick-grid--vehicle" role="group" aria-label="충전 타입">
            ${[['','전체'], ['04','DC콤보'], ['02','AC완속'], ['01','차데모'], ['07','AC3상']].map(([value, label]) => `<button type="button" data-ev-action-type="${value}" class="${typeValue === value ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="parking-mobile-action-sheet__section">
          <span class="parking-mobile-action-sheet__label">충전소 조건</span>
          <div class="parking-mobile-action-sheet__check-grid">
            <label><input type="checkbox" data-ev-action-filter="availableOnly" ${checked('availableOnly')}> 사용 가능 우선</label>
            <label><input type="checkbox" data-ev-action-filter="freeParking" ${checked('freeParking')}> 주차료 무료</label>
            <label><input type="checkbox" data-ev-action-filter="noLimit" ${checked('noLimit')}> 이용 제한 없음</label>
            <label><input type="checkbox" data-ev-action-filter="rapidOnly" ${checked('rapidOnly')}> 급속 우선</label>
            <label><input type="checkbox" data-ev-action-filter="updatedOnly" ${checked('updatedOnly')}> 상태 갱신</label>
            <label><input type="checkbox" data-ev-action-filter="lowRiskOnly" ${checked('lowRiskOnly')}> 상태 양호</label>
          </div>
        </div>
        <button type="button" class="primary-button wide-button" data-ev-action-close>적용하기</button>`;
      body.querySelectorAll('[data-ev-action-type]').forEach((button) => {
        button.addEventListener('click', () => {
          if (els.type) els.type.value = button.dataset.evActionType || '';
          syncQuickButtons();
          syncMapToolbar();
          renderResults();
          body.querySelectorAll('[data-ev-action-type]').forEach((item) => item.classList.toggle('active', item === button));
        });
      });
      body.querySelectorAll('[data-ev-action-filter]').forEach((input) => {
        input.addEventListener('change', () => {
          const target = els.filters[input.dataset.evActionFilter];
          if (target) target.checked = input.checked;
          syncMapToolbar();
          renderResults();
        });
      });
    } else {
      title.textContent = '정렬 기준';
      const current = els.sort?.value || 'recommended';
      body.innerHTML = `<div class="parking-mobile-action-sheet__sort-list">
        ${[['recommended','추천순'], ['nearby','가까운순'], ['rapid','급속 우선'], ['available','가능대수'], ['updated','최신순']].map(([value, label]) => `<button type="button" data-ev-action-sort="${value}" class="${current === value ? 'active' : ''}"><span>${label}</span><strong>${current === value ? '✓' : ''}</strong></button>`).join('')}
      </div>`;
      body.querySelectorAll('[data-ev-action-sort]').forEach((button) => {
        button.addEventListener('click', () => {
          setSort(button.dataset.evActionSort || 'recommended');
          closeEvMobileActionSheet();
        });
      });
    }

    sheet.hidden = false;
    window.requestAnimationFrame(() => sheet.classList.add('is-open'));
    return true;
  }

  function setupEvMobileBottomSheet() {
    const sheet = els.mobileSheet;
    if (!sheet || sheet.dataset.dragReady === 'true') return;
    const head = sheet.querySelector('.parking-mobile-sheet-head');
    const handle = sheet.querySelector('.parking-sheet-handle');
    const dragTargets = [head, handle].filter(Boolean);
    if (!dragTargets.length) return;
    sheet.dataset.dragReady = 'true';
    dragTargets.forEach((target) => {
      target.setAttribute('role', 'button');
      target.setAttribute('tabindex', '0');
      target.setAttribute('aria-hidden', 'false');
      target.setAttribute('aria-label', '추천 충전소 목록을 위아래로 끌어서 열고 닫기');
    });

    const isMobile = () => isMobileEvViewport();
    const isInteractiveTarget = (target) => Boolean(target?.closest?.('button, a, input, select, textarea, summary, label'));
    let dragViewportHeight = 0;
    let startClientY = 0;
    let startSheetY = 0;
    let lastSheetY = 0;
    let lastClientY = 0;
    let lastMoveTime = 0;
    let dragVelocityY = 0;
    let activePointerId = null;
    let activeTarget = null;
    let dragging = false;

    const beginDrag = (clientY, pointerId = null, target = null) => {
      if (!isMobile()) return false;
      if (dragging) return true;
      dragging = true;
      activePointerId = pointerId;
      activeTarget = target;
      dragViewportHeight = window.innerHeight || document.documentElement.clientHeight || 700;
      startClientY = clientY;
      startSheetY = yForEvMobileSheetMode(evMobileSheetMode(), dragViewportHeight);
      lastSheetY = startSheetY;
      lastClientY = clientY;
      lastMoveTime = Date.now();
      dragVelocityY = 0;
      sheet.classList.add('is-dragging', 'is-gesture-owned');
      sheet.style.setProperty('--parking-sheet-height', `${evMobileSheetHeight(dragViewportHeight)}px`);
      applyEvMobileSheetY(startSheetY, dragViewportHeight);
      try { if (pointerId != null) target?.setPointerCapture?.(pointerId); } catch (_) {}
      return true;
    };
    const moveDrag = (clientY) => {
      if (!dragging) return;
      const now = Date.now();
      const elapsed = Math.max(1, now - (lastMoveTime || now));
      dragVelocityY = (clientY - lastClientY) / elapsed;
      lastClientY = clientY;
      lastMoveTime = now;
      lastSheetY = applyEvMobileSheetY(startSheetY + clientY - startClientY, dragViewportHeight);
    };
    const endDrag = () => {
      if (!dragging) return;
      try { if (activePointerId != null) activeTarget?.releasePointerCapture?.(activePointerId); } catch (_) {}
      dragging = false;
      activePointerId = null;
      activeTarget = null;
      sheet.classList.remove('is-dragging', 'is-gesture-owned');
      snapEvMobileSheet(lastSheetY, startSheetY, dragVelocityY, dragViewportHeight);
    };
    const keyHandler = (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (sheet.classList.contains('is-collapsed')) setEvMobileSheetState('half');
        else setEvMobileSheetState('expanded');
      }
      if (event.key === 'ArrowDown' || event.key === 'Escape') {
        event.preventDefault();
        if (sheet.classList.contains('is-expanded')) setEvMobileSheetState('half');
        else setEvMobileSheetState('collapsed');
      }
    };
    const onDragStart = (event) => {
      if (isInteractiveTarget(event.target)) return;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      if (clientY == null || !beginDrag(clientY, event.pointerId ?? null, event.currentTarget)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDragMove = (event) => {
      if (!dragging) return;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      if (clientY != null) moveDrag(clientY);
      event.preventDefault();
      event.stopPropagation();
    };
    const onDragEnd = (event) => {
      if (!dragging) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      endDrag();
    };
    dragTargets.forEach((target) => {
      target.addEventListener('keydown', keyHandler);
      if (window.PointerEvent) {
        target.addEventListener('pointerdown', onDragStart, { passive: false });
        target.addEventListener('pointermove', onDragMove, { passive: false });
        target.addEventListener('pointerup', onDragEnd, { passive: false });
        target.addEventListener('pointercancel', onDragEnd, { passive: false });
      } else {
        target.addEventListener('touchstart', onDragStart, { passive: false });
        target.addEventListener('touchmove', onDragMove, { passive: false });
        target.addEventListener('touchend', onDragEnd, { passive: false });
        target.addEventListener('touchcancel', onDragEnd, { passive: false });
      }
    });
    let lastViewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    window.addEventListener('resize', () => {
      if (dragging) return;
      const nextWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      if (Math.abs(nextWidth - lastViewportWidth) < 12) return;
      lastViewportWidth = nextWidth;
      setEvMobileSheetState(evMobileSheetMode());
    }, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(() => setEvMobileSheetState(evMobileSheetMode()), 220));
    setEvMobileSheetState('collapsed');
  }

  function evMobileSheetHeight(viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700) {
    return Math.min(Math.max(360, viewportHeight * 0.88), 760);
  }

  function evMobileSheetPositions(viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700) {
    const height = evMobileSheetHeight(viewportHeight);
    const peek = 48;
    const collapsed = Math.max(0, height - peek);
    const halfVisible = clamp(viewportHeight * 0.48, peek + 120, height - 24);
    const half = Math.max(0, Math.min(collapsed, height - halfVisible));
    return { expanded: 0, half, collapsed };
  }

  function evMobileSheetMode() {
    if (els.mobileSheet?.classList.contains('is-expanded')) return 'expanded';
    if (els.mobileSheet?.classList.contains('is-collapsed')) return 'collapsed';
    return 'half';
  }

  function yForEvMobileSheetMode(mode, viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700) {
    const pos = evMobileSheetPositions(viewportHeight);
    if (mode === 'expanded') return pos.expanded;
    if (mode === 'collapsed' || mode === 'closed') return pos.collapsed;
    return pos.half;
  }

  function applyEvMobileSheetY(value, viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700) {
    const pos = evMobileSheetPositions(viewportHeight);
    const y = clamp(value, pos.expanded, pos.collapsed);
    els.mobileSheet?.style.setProperty('--parking-sheet-y', `${y}px`);
    return y;
  }

  function snapEvMobileSheet(currentY, startY, velocityY, viewportHeight) {
    const pos = evMobileSheetPositions(viewportHeight);
    const travel = Math.abs(currentY - startY);
    let nextMode;
    if (velocityY < -0.45 && travel > 36) nextMode = 'expanded';
    else if (velocityY > 0.45 && travel > 36) nextMode = 'collapsed';
    else {
      const projectedY = clamp(currentY + velocityY * 120, pos.expanded, pos.collapsed);
      nextMode = [
        ['expanded', Math.abs(projectedY - pos.expanded)],
        ['half', Math.abs(projectedY - pos.half)],
        ['collapsed', Math.abs(projectedY - pos.collapsed)]
      ].sort((a, b) => a[1] - b[1])[0][0];
    }
    setEvMobileSheetState(nextMode);
  }

  function setEvMobileSheetState(mode = 'half') {
    const sheet = els.mobileSheet;
    if (!sheet) return;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700;
    sheet.style.setProperty('--parking-sheet-height', `${evMobileSheetHeight(viewportHeight)}px`);
    const normalized = mode === 'open' ? 'half' : mode === 'closed' ? 'collapsed' : mode;
    applyEvMobileSheetY(yForEvMobileSheetMode(normalized, viewportHeight), viewportHeight);
    sheet.classList.remove('is-open', 'is-expanded', 'is-collapsed', 'is-dragging');
    if (normalized === 'expanded') sheet.classList.add('is-open', 'is-expanded');
    else if (normalized === 'collapsed') sheet.classList.add('is-collapsed');
    else sheet.classList.add('is-open');
    els.mobileListToggle?.setAttribute('aria-expanded', normalized !== 'collapsed' ? 'true' : 'false');
  }

  function openMobileSheet(mode = 'open') {
    setEvMobileSheetState(mode);
    updateMobileEvListToggle();
  }

  function closeMobileSheet() {
    setEvMobileSheetState('collapsed');
    updateMobileEvListToggle();
  }

  function toggleMobileSheet() {
    const isOpen = els.mobileSheet?.classList.contains('is-open');
    setEvMobileSheetState(isOpen ? 'closed' : 'half');
    if (!isOpen) els.mobileSheet?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateMobileEvListToggle();
  }

  function scrollToMap() { els.map?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  function scrollToControls() { els.form?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function setListLoading() {
    const html = '<article class="parking-result-card"><strong>충전소 정보를 확인하고 있습니다.</strong><p>제공기관 데이터 기준으로 주변 충전소를 불러오는 중입니다.</p></article>';
    if (els.resultList) els.resultList.innerHTML = html;
    if (els.mobileResults) els.mobileResults.innerHTML = html;
    updateMobileEvListToggle(0);
  }

  function renderEmpty(message) {
    const html = `<article class="parking-result-card parking-empty-card ev-empty-card"><strong class="ev-empty-card__title">확인할 충전소가 없습니다.</strong><p class="ev-empty-card__message">${escapeHtml(message)}</p></article>`;
    if (els.resultList) els.resultList.innerHTML = html;
    if (els.mobileResults) els.mobileResults.innerHTML = html;
    updateMobileEvListToggle(0);
  }

  function updateMobileEvListToggle(count = state.displayResults?.length || 0) {
    if (!els.mobileListToggle) return;
    const isOpen = !els.mobileSheet?.classList.contains('is-collapsed');
    els.mobileListToggle.textContent = isOpen ? '추천 목록 접기' : '추천 목록 보기';
    els.mobileListToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function resultLimitForRadius() {
    const radius = String(els.radius?.value || '3000');
    return EV_RESULT_LIMIT_BY_RADIUS[radius] || (Number(radius) >= 10000 ? 50 : Number(radius) >= 5000 ? 35 : 20);
  }

  function mapLimitForRadius() {
    const radius = String(els.radius?.value || '3000');
    return EV_MAP_LIMIT_BY_RADIUS[radius] || resultLimitForRadius();
  }

  function findDisplayStationById(id) {
    const target = String(id || '');
    if (!target) return null;
    return (state.displayResults || []).find((item) => isSameStationId(item, target))
      || (state.sortedStations || []).find((item) => isSameStationId(item, target))
      || null;
  }

  function isSameStationId(item, id) {
    const target = String(id || '');
    if (!item || !target) return false;
    if (String(item.id || '') === target) return true;
    if (String(item.originalId || '') === target) return true;
    return Array.isArray(item.stationIdAliases) && item.stationIdAliases.map(String).includes(target);
  }

  function renderDataBadges(data) {
    if (!els.dataBadges) return;
    const badges = ['전기차 충전소 정보', '제공기관 데이터 기준'];
    if (data?.count != null) badges.push(`반경 내 충전소 ${Number(data.count).toLocaleString()}곳`);
    if (data?.fromLocalCache) badges.push('전국 로컬 캐시');
    else if (data?.fromClientCache) badges.push('방문 중 저장 결과');
    else if (data?.cache?.hit) badges.push('빠른 캐시 조회');
    if (data?.cache?.scope === 'local-static') badges.push('상태 최신 확인 중');
    if (data?.checkedAt) badges.push('상태 갱신 참고');
    els.dataBadges.innerHTML = badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('');
  }

  function sorter(mode) {
    return (a, b) => {
      const distanceA = Number.isFinite(a.distanceM) ? a.distanceM : Number.POSITIVE_INFINITY;
      const distanceB = Number.isFinite(b.distanceM) ? b.distanceM : Number.POSITIVE_INFINITY;
      if (mode === 'nearby') return distanceA - distanceB || b.availableCount - a.availableCount || b.bestScore - a.bestScore;
      if (mode === 'rapid') return b.rapidCount - a.rapidCount || b.availableCount - a.availableCount || distanceA - distanceB || b.bestScore - a.bestScore;
      if (mode === 'available') return b.availableCount - a.availableCount || b.bestScore - a.bestScore || distanceA - distanceB;
      if (mode === 'updated') return updatedScore(b) - updatedScore(a) || b.availableCount - a.availableCount || b.bestScore - a.bestScore;
      return b.bestScore - a.bestScore || b.availableCount - a.availableCount || distanceA - distanceB;
    };
  }

  function buildReason(item) {
    if (item.sourceStationCount > 1) return `같은 장소 ${item.sourceStationCount}건 묶음`;
    if (item.availableCount > 0) return `사용 가능 ${item.availableCount}기`;
    if (item.chargingCount > 0) return '충전 중';
    if (item.troubleCount > 0) return '운영 상태 주의';
    return '상태 확인 필요';
  }


  function typesSummary(item) {
    const labels = [...new Set((item.chargers || []).map((c) => c.typeLabel).filter(Boolean))];
    return labels.length ? labels.slice(0, 4).join(' · ') : '충전 타입 확인 필요';
  }

  function compactTypesSummary(item) {
    const labels = [...new Set((item.chargers || []).map((c) => c.typeLabel).filter(Boolean))];
    if (!labels.length) return '충전 타입 확인';
    if (labels.length === 1) return labels[0];
    return `${labels[0]} 외 ${labels.length - 1}종`;
  }

  function renderKakaoLink(item, extraClass = '') {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return '';
    const queryText = buildKakaoPlaceQuery(item);
    const fallbackUrl = `https://map.kakao.com/link/search/${encodeURIComponent(queryText)}`;
    const className = ['parking-kakao-link', extraClass].filter(Boolean).join(' ');
    return `<a class="${escapeHtml(className)}" href="${escapeHtml(fallbackUrl)}" target="_blank" rel="noopener" data-ev-kakao-place="${escapeHtml(item.id)}">카카오맵 장소</a>`;
  }

  function buildKakaoPlaceQuery(item) {
    const rawName = String(item?.displayName || item?.name || '').trim();
    const address = String(item?.address || '').trim();
    const cleanedName = rawName
      .replace(/전기차\s*충전소|전기충전소|충전소|급속충전소|완속충전소/gi, '')
      .replace(/[()\[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const nameLooksAddress = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+시|[가-힣]+군|[가-힣]+구)\s/.test(cleanedName) && /\d/.test(cleanedName);
    if (cleanedName && cleanedName.length >= 3 && !nameLooksAddress) {
      const regionHint = [state.center.sido, item?.address ? inferDistrict(item.address) : state.center.region2].filter(Boolean).join(' ');
      return [regionHint, cleanedName].filter(Boolean).join(' ').trim();
    }
    return [rawName, address].filter(Boolean).join(' ').trim() || '전기차 충전소';
  }

  async function handleKakaoPlaceClick(event) {
    const link = event.target?.closest?.('[data-ev-kakao-place]');
    if (!link) return;
    const id = link.getAttribute('data-ev-kakao-place');
    const item = findDisplayStationById(id);
    if (!item) return;
    event.preventDefault();
    let opened = null;
    try {
      opened = window.open('', '_blank');
      if (opened) opened.opener = null;
    } catch (_) {}
    const fallbackUrl = link.href;
    let targetUrl = fallbackUrl;
    try {
      targetUrl = await resolveKakaoPlaceUrl(item, fallbackUrl);
    } catch (_) {
      targetUrl = fallbackUrl;
    }
    if (opened) {
      opened.location.href = targetUrl;
    } else {
      window.location.href = targetUrl;
    }
  }

  function resolveKakaoPlaceUrl(item, fallbackUrl) {
    return new Promise((resolve) => {
      if (!window.kakao?.maps?.services) return resolve(fallbackUrl);
      const query = buildKakaoPlaceQuery(item);
      try {
        const places = new window.kakao.maps.services.Places();
        places.keywordSearch(query, (data, status) => {
          if (status !== window.kakao.maps.services.Status.OK || !Array.isArray(data) || !data.length) return resolve(fallbackUrl);
          const ranked = data
            .map((place) => ({
              place,
              distance: distanceMeters(Number(item.lat), Number(item.lng), Number(place.y), Number(place.x))
            }))
            .filter((row) => Number.isFinite(row.distance))
            .sort((a, b) => a.distance - b.distance);
          const best = ranked[0]?.place || data[0];
          if (best?.place_url && (!ranked[0] || ranked[0].distance <= 700)) return resolve(best.place_url);
          resolve(fallbackUrl);
        }, { x: Number(item.lng), y: Number(item.lat), radius: 1200 });
      } catch (_) {
        resolve(fallbackUrl);
      }
    });
  }


  async function fetchJson(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 0);
    const controller = timeoutMs ? new AbortController() : null;
    const timer = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `요청 오류가 발생했습니다. (${response.status})`);
    return data;
  }

  function loadScript(src) {
    if (document.querySelector(`script[src^="${src.split('?')[0]}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function selectedText(select) { return select?.selectedOptions?.[0]?.textContent?.trim() || ''; }
  function setStatus(message, tone) { if (els.status) { els.status.textContent = message; els.status.className = `status-message ${tone || 'neutral'}`; } }
  function setSearchStatus(message) { if (els.searchStatus) els.searchStatus.textContent = message; }
  function sortLabel(mode) { return ({ recommended: '추천순', nearby: '가까운순', rapid: '급속 우선', available: '가능대수', updated: '최신순' })[mode] || '추천순'; }
  function formatRadius(value) { const number = Number(value); return number >= 1000 ? `${number / 1000}km` : `${number}m`; }
  function formatDistance(m) { return Number.isFinite(m) ? (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`) : '거리 확인'; }
  function updatedScore(item) { return item.updatedAt ? Date.parse(item.updatedAt.replace(' ', 'T')) || 0 : 0; }
  function inferSido(address) {
    const token = String(address || '').trim().split(/\s+/)[0] || '서울';
    const map = { 서울특별시: '서울', 서울: '서울', 경기도: '경기', 부산광역시: '부산', 부산: '부산', 대구광역시: '대구', 대구: '대구', 인천광역시: '인천', 인천: '인천', 광주광역시: '광주', 광주: '광주', 대전광역시: '대전', 대전: '대전', 울산광역시: '울산', 울산: '울산', 세종특별자치시: '세종', 세종: '세종', 강원특별자치도: '강원', 강원도: '강원', 강원: '강원', 충청북도: '충북', 충북: '충북', 충청남도: '충남', 충남: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전북: '전북', 전라남도: '전남', 전남: '전남', 경상북도: '경북', 경북: '경북', 경상남도: '경남', 경남: '경남', 제주특별자치도: '제주', 제주도: '제주', 제주: '제주' };
    return map[token] || token || '서울';
  }
  function inferDistrict(address) {
    const parts = String(address || '').trim().split(/\s+/).filter(Boolean);
    return parts[1] || '';
  }
  function normalizeDistrictName(value) {
    return String(value || '').trim().replace(/^(경기도|경기)\s*/, '').replace(/\s+/g, '');
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function distanceMeters(lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
})();
