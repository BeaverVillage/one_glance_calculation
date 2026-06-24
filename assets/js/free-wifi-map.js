(() => {
  const root = document.querySelector('[data-wifi-map-tool]');
  if (!root) return;

  const CACHE_BASE = '/assets/data/life/free-wifi';
  const VERSION = 'v129-location-search-ui-refine';
  const MAX_LIST = 50;
  const MAX_MARKERS = 300;
  const MAX_DISTRICT_CACHE = 12;

  const REGION_CENTERS = {
    seoul: { lat: 37.5665, lng: 126.9780, label: '서울' },
    busan: { lat: 35.1796, lng: 129.0756, label: '부산' },
    daegu: { lat: 35.8714, lng: 128.6014, label: '대구' },
    incheon: { lat: 37.4563, lng: 126.7052, label: '인천' },
    gwangju: { lat: 35.1595, lng: 126.8526, label: '광주' },
    daejeon: { lat: 36.3504, lng: 127.3845, label: '대전' },
    ulsan: { lat: 35.5384, lng: 129.3114, label: '울산' },
    sejong: { lat: 36.4801, lng: 127.2890, label: '세종' },
    gyeonggi: { lat: 37.4138, lng: 127.5183, label: '경기' },
    gangwon: { lat: 37.8228, lng: 128.1555, label: '강원' },
    chungbuk: { lat: 36.6357, lng: 127.4917, label: '충북' },
    chungnam: { lat: 36.5184, lng: 126.8000, label: '충남' },
    jeonbuk: { lat: 35.7175, lng: 127.1530, label: '전북' },
    jeonnam: { lat: 34.8679, lng: 126.9910, label: '전남' },
    gyeongbuk: { lat: 36.4919, lng: 128.8889, label: '경북' },
    gyeongnam: { lat: 35.4606, lng: 128.2132, label: '경남' },
    jeju: { lat: 33.4996, lng: 126.5312, label: '제주' },
  };

  const elements = {
    form: root.querySelector('#wifi-form'),
    region: root.querySelector('#wifi-region'),
    district: root.querySelector('#wifi-district'),
    keyword: root.querySelector('#wifi-keyword'),
    facility: root.querySelector('#wifi-facility'),
    provider: root.querySelector('#wifi-provider'),
    sort: root.querySelector('#wifi-sort'),
    hasSsid: root.querySelector('#wifi-has-ssid'),
    hasPhone: root.querySelector('#wifi-has-phone'),
    useLocation: root.querySelector('#wifi-use-location'),
    mapLocation: root.querySelector('#wifi-map-location'),
    filterToggle: root.querySelector('[data-life-filter-toggle]'),
    status: root.querySelector('#wifi-status'),
    formStatus: root.querySelector('#wifi-form-status'),
    listTitle: root.querySelector('#wifi-list-title'),
    listSummary: root.querySelector('#wifi-list-summary'),
    listSubtitle: root.querySelector('#wifi-list-subtitle'),
    resultList: root.querySelector('#wifi-result-list'),
    mobileResults: root.querySelector('#wifi-mobile-results'),
    mobileTitle: root.querySelector('#wifi-mobile-sheet-title'),
    mobileSubtitle: root.querySelector('#wifi-mobile-sheet-subtitle'),
    mobileToggle: root.querySelector('#wifi-mobile-list-toggle'),
    mobileSheet: root.querySelector('#wifi-mobile-bottom-sheet'),
    mobileMapButton: root.querySelector('#wifi-mobile-sheet-map-button'),
    countCard: root.querySelector('#wifi-count-card'),
    ssidCard: root.querySelector('#wifi-ssid-card'),
    phoneCard: root.querySelector('#wifi-phone-card'),
    sortButtons: Array.from(root.querySelectorAll('[data-wifi-sort]')),
    map: root.querySelector('#wifi-map'),
    markers: root.querySelector('#wifi-map-markers'),
    mapNotice: root.querySelector('#wifi-map-notice'),
    mapTitle: root.querySelector('#wifi-map-title'),
    selectedCard: root.querySelector('#wifi-selected-card'),
    mapToolbarSearch: root.querySelector('#wifi-map-toolbar-search'),
    mapKeyword: root.querySelector('#wifi-map-keyword'),
    mapRegion: root.querySelector('#wifi-map-region'),
    mapDistrict: root.querySelector('#wifi-map-district'),
  };

  const state = {
    index: null,
    districtCache: new Map(),
    districtCacheOrder: [],
    currentRegion: 'seoul',
    currentDistrict: '',
    rawItems: [],
    items: [],
    selectedId: '',
    geo: null,
    referencePoint: null,
    searchPoint: null,
    initialLocationAttempted: false,
    map: null,
    kakaoReady: false,
    mapLoadStarted: false,
    overlays: [],
    lastRenderSignature: '',
    renderFrame: 0,
    mapAutoFitPending: true,
    loading: false,
    mobileOpen: false,
    requestId: 0,
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const normalize = (value) => String(value ?? '').trim();
  const normalizeSearch = (value) => normalize(value).toLowerCase().replace(/\s+/g, ' ');
  const hasText = (value) => normalize(value).length > 0;
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const isValidPoint = (item) => Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng));
  const currentRegionCenter = () => REGION_CENTERS[state.currentRegion] || REGION_CENTERS.seoul;
  const buildTelLink = (phone) => phone ? `tel:${String(phone).replace(/[^0-9+]/g, '')}` : '';
  const hasSsid = (item) => item?.__hasSsid === true || hasText(item?.details?.ssid);
  const hasPhone = (item) => item?.__hasPhone === true || hasText(item?.phone);

  const prepareRuntimeItem = (item = {}) => {
    if (item.__prepared) return item;
    const details = item.details || {};
    const searchText = item.searchText || [
      item.name,
      item.placeDetail,
      item.address,
      item.roadAddress,
      item.lotAddress,
      item.region,
      item.district,
      details.ssid,
      details.facilityType,
      details.provider,
      details.manager,
    ].join(' ');
    Object.defineProperties(item, {
      __prepared: { value: true, enumerable: false },
      __searchKey: { value: normalizeSearch(searchText), enumerable: false },
      __facility: { value: normalize(details.facilityType), enumerable: false },
      __provider: { value: normalize(details.provider), enumerable: false },
      __manager: { value: normalize(details.manager), enumerable: false },
      __hasSsid: { value: hasText(details.ssid), enumerable: false },
      __hasPhone: { value: hasText(item.phone), enumerable: false },
    });
    return item;
  };


  const installationSummary = (installations = []) => {
    const count = installations.length;
    if (count <= 1) return '';
    return `설치 위치 ${count.toLocaleString('ko-KR')}곳`;
  };

  const groupWifiInstallations = (items = []) => {
    const groups = new Map();
    items.forEach((item) => {
      const lat = Number(item.lat).toFixed(6);
      const lng = Number(item.lng).toFixed(6);
      const address = normalizeSearch(item.address || item.roadAddress || item.lotAddress || '');
      const name = normalizeSearch(item.name || '');
      const key = `${lat}|${lng}|${address || name}`;
      if (!groups.has(key)) {
        const base = { ...item, details: { ...(item.details || {}) } };
        base.id = `wifi-group-${groups.size + 1}-${String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-10)}`;
        base.__installations = [];
        base.badges = (item.badges || []).filter((badge) => !String(badge).includes('S' + 'SID') && !String(badge).includes('와이파이 이름'));
        groups.set(key, base);
      }
      const group = groups.get(key);
      const details = item.details || {};
      group.__installations.push({
        name: item.name || '',
        placeDetail: item.placeDetail || details.placeDetail || details.installLocation || '',
        ssid: details.ssid || '',
        facilityType: details.facilityType || '',
        provider: details.provider || details.manager || '',
        phone: item.phone || '',
      });
      if (!hasText(group.phone) && hasText(item.phone)) group.phone = item.phone;
      if (!hasText(group.details.ssid) && hasText(details.ssid)) group.details.ssid = details.ssid;
      if (!hasText(group.details.provider) && hasText(details.provider || details.manager)) group.details.provider = details.provider || details.manager;
      if (!hasText(group.details.facilityType) && hasText(details.facilityType)) group.details.facilityType = details.facilityType;
    });
    return Array.from(groups.values()).map((group) => {
      const installs = group.__installations || [];
      const searchText = [group.name, group.address, group.roadAddress, group.lotAddress, group.details?.ssid, group.details?.facilityType, group.details?.provider, ...installs.flatMap((entry) => [entry.placeDetail, entry.ssid, entry.provider, entry.phone])].join(' ');
      group.searchText = searchText;
      group.details = {
        ...(group.details || {}),
        installationCount: installs.length,
        installationSummary: installationSummary(installs),
      };
      return prepareRuntimeItem(group);
    });
  };

  const rememberDistrictCache = (cacheKey, items) => {
    state.districtCache.set(cacheKey, items);
    state.districtCacheOrder = state.districtCacheOrder.filter((key) => key !== cacheKey);
    state.districtCacheOrder.push(cacheKey);
    while (state.districtCacheOrder.length > MAX_DISTRICT_CACHE) {
      const oldest = state.districtCacheOrder.shift();
      if (oldest && oldest !== cacheKey) state.districtCache.delete(oldest);
    }
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, { cache: options.cache || 'default' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  };

  const regionMeta = (key = state.currentRegion) => state.index?.regions?.find((region) => region.key === key);
  const districtMeta = (regionKey = state.currentRegion, districtKey = state.currentDistrict) => regionMeta(regionKey)?.districts?.find((district) => district.key === districtKey);
  const regionLabel = (key = state.currentRegion) => regionMeta(key)?.label || REGION_CENTERS[key]?.label || '서울';
  const districtLabel = (regionKey = state.currentRegion, districtKey = state.currentDistrict) => districtMeta(regionKey, districtKey)?.label || '시군구';
  const locationLabel = () => `${regionLabel()} ${districtLabel()}`.trim();

  const setStatus = (message, tone = 'info') => {
    if (elements.status) {
      elements.status.textContent = message;
      elements.status.dataset.tone = tone;
    }
    if (elements.formStatus) elements.formStatus.textContent = message;
  };

  const setMapNotice = (title, message) => {
    if (elements.mapNotice) elements.mapNotice.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  };

  const getKakaoMapUrl = (item) => {
    if (isValidPoint(item)) {
      return `https://map.kakao.com/link/map/${encodeURIComponent(item.name || '무료 와이파이')},${Number(item.lat)},${Number(item.lng)}`;
    }
    const query = item?.address || item?.name || '무료 와이파이';
    return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
  };


  const getKakaoSearchUrl = (item) => {
    const query = [item?.name, item?.address].filter(hasText).join(' ') || '무료 와이파이';
    return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
  };

  const formatDistance = (distanceM) => {
    const value = number(distanceM);
    if (!value || value < 1) return '';
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}km` : `${Math.round(value)}m`;
  };

  const distanceSourceLabel = () => {
    if (state.referencePoint) return '검색 위치 기준';
    if (state.geo) return '현재 위치 기준';
    return `${locationLabel()} 중심 기준`;
  };

  const renderDistanceBadge = (distanceM) => {
    const distance = formatDistance(distanceM);
    if (!distance) return '';
    const source = distanceSourceLabel();
    return `<span class="ev-status-pill good life-distance-pill" title="${escapeHtml(source)}">${escapeHtml(distance)}<small>${escapeHtml(source.replace(' 기준', ''))}</small></span>`;
  };

  const distanceM = (a, b) => {
    if (!a || !b) return null;
    const lat1 = number(a.lat);
    const lng1 = number(a.lng);
    const lat2 = number(b.lat);
    const lng2 = number(b.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const s1 = Math.sin(dLat / 2) ** 2;
    const s2 = Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
  };

  const referenceForDistance = () => state.referencePoint || state.geo || currentRegionCenter();
  const withDistance = (items) => {
    const ref = referenceForDistance();
    return items.map((item) => ({ ...item, distanceM: distanceM(ref, item) }));
  };

  const matchesFilters = (item) => {
    const keyword = normalizeSearch(elements.keyword?.value || '');
    const facility = normalize(elements.facility?.value || '');
    const provider = normalize(elements.provider?.value || '');
    if (keyword && !item.__searchKey.includes(keyword)) return false;
    if (facility && item.__facility !== facility) return false;
    if (provider && item.__provider !== provider && item.__manager !== provider) return false;
    if (elements.hasPhone?.checked && !hasPhone(item)) return false;
    return true;
  };

  const distanceScore = (distance) => {
    if (!Number.isFinite(distance)) return 0;
    if (distance <= 300) return 35;
    if (distance <= 800) return 28;
    if (distance <= 1500) return 20;
    if (distance <= 3000) return 10;
    return 4;
  };

  const wifiRecommendScore = (item) => distanceScore(item.distanceM)
    + (hasText(item.details?.placeDetail) ? 12 : 0)
    + (hasText(item.details?.facilityType) ? 10 : 0)
    + (hasText(item.details?.provider || item.details?.manager) ? 8 : 0)
    + (hasPhone(item) ? 8 : 0);

  const sortItems = (items) => {
    const sort = elements.sort?.value || 'recommend';
    const byName = (a, b) => normalize(a.name).localeCompare(normalize(b.name), 'ko-KR');
    const byDistance = (a, b) => (Number.isFinite(a.distanceM) ? a.distanceM : 999999999) - (Number.isFinite(b.distanceM) ? b.distanceM : 999999999);
    const phoneScore = (item) => hasPhone(item) ? 1 : 0;
    const facilityScore = (item) => hasText(item.details?.facilityType) ? 1 : 0;
    return [...items].sort((a, b) => {
      if (sort === 'name') return byName(a, b);
      if (sort === 'phone') return phoneScore(b) - phoneScore(a) || byDistance(a, b) || byName(a, b);
      if (sort === 'facility') return facilityScore(b) - facilityScore(a) || byDistance(a, b) || byName(a, b);
      if (sort === 'distance') return byDistance(a, b) || byName(a, b);
      return wifiRecommendScore(b) - wifiRecommendScore(a) || byDistance(a, b) || byName(a, b);
    });
  };

  const applyFilters = (options = {}) => {
    if (options.resetSelection) state.selectedId = '';
    if (options.fitMap) state.mapAutoFitPending = true;
    const filtered = withDistance(state.rawItems).filter(matchesFilters);
    state.items = sortItems(filtered);
    state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
    scheduleRender();
  };

  const scheduleRender = () => {
    if (state.renderFrame) window.cancelAnimationFrame(state.renderFrame);
    state.renderFrame = window.requestAnimationFrame(() => {
      state.renderFrame = 0;
      render();
    });
  };

  const loadIndex = async () => {
    if (state.index) return state.index;
    state.index = await fetchJson(`${CACHE_BASE}/index.json?v=${encodeURIComponent(VERSION)}`);
    populateRegionOptions();
    return state.index;
  };

  const loadDistrict = async (regionKey, districtKey) => {
    const requestedRegion = regionKey || 'seoul';
    const requestId = state.requestId + 1;
    let requestedDistrict = districtKey || '';

    state.requestId = requestId;
    state.currentRegion = requestedRegion;
    state.currentDistrict = requestedDistrict;
    state.selectedId = '';
    state.referencePoint = null;
    state.lastRenderSignature = '';
    state.mapAutoFitPending = true;
    state.loading = true;
    setStatus(`${regionLabel(requestedRegion)} 무료 와이파이 데이터를 준비하는 중입니다.`);

    try {
      await loadIndex();
      if (requestId !== state.requestId) return;

      populateDistrictOptions(requestedRegion, requestedDistrict);
      requestedDistrict = requestedDistrict || elements.district?.value || regionMeta(requestedRegion)?.districts?.[0]?.key || '';
      state.currentDistrict = requestedDistrict;
      setStatus(`${regionLabel(requestedRegion)} ${districtLabel(requestedRegion, requestedDistrict)} 무료 와이파이 데이터를 불러오는 중입니다.`);

      const district = districtMeta(requestedRegion, requestedDistrict);
      if (!district) {
        state.rawItems = [];
        state.mapAutoFitPending = true;
        setStatus(`${regionLabel(requestedRegion)} 지역의 시군구 캐시가 없습니다.`, 'warning');
      } else {
        const cacheKey = `${requestedRegion}/${requestedDistrict}`;
        if (state.districtCache.has(cacheKey)) {
          state.rawItems = state.districtCache.get(cacheKey);
          state.districtCacheOrder = state.districtCacheOrder.filter((key) => key !== cacheKey);
          state.districtCacheOrder.push(cacheKey);
        } else {
          const payload = await fetchJson(`${CACHE_BASE}/${district.file}?v=${encodeURIComponent(VERSION)}`);
          if (requestId !== state.requestId) return;
          state.rawItems = groupWifiInstallations((Array.isArray(payload.items) ? payload.items : []).map(prepareRuntimeItem));
          rememberDistrictCache(cacheKey, state.rawItems);
        }
        if (requestId !== state.requestId) return;
        syncLocationControls(requestedRegion, requestedDistrict);
        populateDynamicFilters(state.rawItems);
        setStatus(`${regionLabel(requestedRegion)} ${districtLabel(requestedRegion, requestedDistrict)} 무료 와이파이 ${state.rawItems.length.toLocaleString('ko-KR')}곳을 표시합니다.`);
      }
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.rawItems = [];
      state.currentDistrict = '';
      state.mapAutoFitPending = true;
      setStatus('무료 와이파이 로컬 캐시를 불러오지 못했습니다. 캐시 생성 후 다시 확인해 주세요.', 'error');
      setMapNotice('캐시 확인 필요', 'assets/data/life/free-wifi/index.json 파일을 확인해 주세요.');
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        applyFilters({ fitMap: true });
        initKakaoMap();
      }
    }
  };

  const populateRegionOptions = () => {
    const availableKeys = new Set((state.index?.regions || []).map((region) => region.key));
    [elements.region, elements.mapRegion].forEach((select) => {
      if (!select) return;
      Array.from(select.options).forEach((option) => {
        const count = state.index?.regions?.find((region) => region.key === option.value)?.count;
        option.disabled = availableKeys.size > 0 && !availableKeys.has(option.value);
        option.textContent = count ? `${REGION_CENTERS[option.value]?.label || option.textContent.replace(/\s*\(.*\)/, '')} (${count.toLocaleString('ko-KR')})` : (REGION_CENTERS[option.value]?.label || option.textContent.replace(/\s*\(.*\)/, ''));
      });
    });
  };

  const populateDistrictOptions = (regionKey, preferredDistrict = '') => {
    const districts = regionMeta(regionKey)?.districts || [];
    const options = districts.map((district) => `<option value="${escapeHtml(district.key)}">${escapeHtml(district.label)} (${Number(district.count || 0).toLocaleString('ko-KR')})</option>`).join('');
    [elements.district, elements.mapDistrict].forEach((select) => {
      if (!select) return;
      select.innerHTML = options || '<option value="">시군구 없음</option>';
      const target = preferredDistrict && districts.some((district) => district.key === preferredDistrict) ? preferredDistrict : (districts[0]?.key || '');
      select.value = target;
    });
  };

  const populateDynamicFilters = (items) => {
    fillSelect(elements.facility, collectValues(items.map((item) => item.details?.facilityType)), '전체');
    fillSelect(elements.provider, collectValues(items.flatMap((item) => [item.details?.provider, item.details?.manager])), '전체');
  };

  const collectValues = (values) => [...new Set(values.map((value) => normalize(value)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko-KR'))
    .slice(0, 180);

  const fillSelect = (select, values, firstLabel) => {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    if (values.includes(current)) select.value = current;
  };

  const syncLocationControls = (regionKey, districtKey) => {
    if (elements.region) elements.region.value = regionKey;
    if (elements.mapRegion) elements.mapRegion.value = regionKey;
    populateDistrictOptions(regionKey, districtKey);
    if (elements.district) elements.district.value = districtKey;
    if (elements.mapDistrict) elements.mapDistrict.value = districtKey;
    if (elements.mapTitle) elements.mapTitle.textContent = `${regionLabel(regionKey)} ${districtLabel(regionKey, districtKey)} 무료 와이파이`;
  };

  const syncSortButtons = () => {
    const sort = elements.sort?.value || 'recommend';
    elements.sortButtons.forEach((button) => button.classList.toggle('active', button.dataset.wifiSort === sort));
  };

  const render = () => {
    syncSortButtons();
    renderSummary();
    renderList(elements.resultList, state.items.slice(0, MAX_LIST));
    renderList(elements.mobileResults, state.items.slice(0, MAX_LIST), { mobile: true });
    renderSelectedCard();
    syncMobileSheet();
    renderMap(state.items);
  };

  const renderSummary = () => {
    const total = state.items.length;
    const installCount = state.items.reduce((sum, item) => sum + Math.max(1, Number(item.details?.installationCount || 1)), 0);
    const phoneCount = state.items.filter(hasPhone).length;
    const place = locationLabel();
    if (elements.listTitle) elements.listTitle.textContent = `${place} 무료 와이파이 목록`;
    if (elements.listSummary) elements.listSummary.textContent = `${total.toLocaleString('ko-KR')}곳`;
    if (elements.listSubtitle) elements.listSubtitle.textContent = total ? `목록은 최대 ${Math.min(total, MAX_LIST)}곳, 지도는 최대 ${Math.min(total, MAX_MARKERS)}개 마커를 표시합니다.` : '조건에 맞는 무료 와이파이가 없습니다.';
    if (elements.mobileTitle) elements.mobileTitle.textContent = `${place} 무료 와이파이 목록`;
    if (elements.mobileSubtitle) elements.mobileSubtitle.textContent = total ? `${total.toLocaleString('ko-KR')}곳 중 ${Math.min(total, MAX_LIST)}곳 표시` : '조건에 맞는 결과가 없습니다.';
    updateSummaryCard(elements.countCard, '조회 후보', `${total.toLocaleString('ko-KR')}곳`, '조건 적용 결과');
    updateSummaryCard(elements.ssidCard, '설치 위치', `${installCount.toLocaleString('ko-KR')}곳`, '중복 위치 묶음');
    updateSummaryCard(elements.phoneCard, '관리 전화', `${phoneCount.toLocaleString('ko-KR')}곳`, '문의 가능');
    if (!state.loading) {
      const suffix = state.referencePoint || state.geo ? '현재 위치 기준 거리도 함께 표시합니다.' : '선택 지역 중심 기준으로 가까운 순을 참고합니다.';
      setStatus(total ? `${place} 무료 와이파이 ${total.toLocaleString('ko-KR')}곳을 표시합니다. ${suffix}` : '조건에 맞는 무료 와이파이가 없습니다.', total ? 'info' : 'warning');
    }
  };

  const updateSummaryCard = (card, label, value, note) => {
    if (!card) return;
    card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small>`;
  };

  const renderList = (target, items, options = {}) => {
    if (!target) return;
    if (!items.length) {
      target.innerHTML = '<div class="empty-state"><strong>조건에 맞는 무료 와이파이가 없습니다.</strong><p>지역, 시군구, 검색어 또는 필터를 조정해 다시 확인해 주세요.</p></div>';
      return;
    }
    target.innerHTML = items.map((item, index) => renderCard(item, index, options)).join('');
    target.querySelectorAll('[data-wifi-select]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        selectItem(button.dataset.wifiSelect, { move: true, mobile: options.mobile });
      });
    });
    target.querySelectorAll('[data-life-card-select]').forEach((card) => {
      const selectFromCard = () => selectItem(card.dataset.lifeCardSelect, { move: true, mobile: options.mobile });
      card.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, select, label')) return;
        selectFromCard();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectFromCard();
      });
    });
  };

  const renderCard = (item, index, options = {}) => {
    const details = item.details || {};
    const distanceBadge = renderDistanceBadge(item.distanceM);
    const selected = state.selectedId === item.id;
    const facility = details.facilityType || '시설 구분 확인 필요';
    const provider = details.provider || details.manager || '';
    const install = details.installationSummary || '';
    const summary = [facility, provider, install, hasText(item.phone) ? '관리전화 있음' : '관리전화 확인 필요'].filter(Boolean).join(' · ');
    return `<article class="parking-result-card life-list-card life-list-card--compact ${selected ? 'selected' : ''}" data-life-card-select="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="${escapeHtml(item.name)} 지도에서 선택">
      <div class="parking-result-main life-list-main">
        <div class="parking-result-title"><h3>${escapeHtml(item.name)}</h3>${distanceBadge}</div>
        <p class="parking-result-address">${escapeHtml(item.address || '주소 확인 필요')}</p>
        <p class="life-list-summary">${escapeHtml(summary)}</p>
      </div>
    </article>`;
  };

  const syncMobileSheet = () => {
    if (elements.mobileSheet) {
      elements.mobileSheet.classList.toggle('is-open', state.mobileOpen);
      elements.mobileSheet.classList.toggle('is-collapsed', !state.mobileOpen);
      if (!state.mobileOpen) {
        elements.mobileSheet.classList.remove('is-expanded');
        elements.mobileSheet.style.removeProperty('--life-sheet-y');
      }
    }
    if (elements.mobileToggle) {
      elements.mobileToggle.setAttribute('aria-expanded', state.mobileOpen ? 'true' : 'false');
      elements.mobileToggle.textContent = state.mobileOpen ? '목록 닫기' : '목록 보기';
    }
  };

  const renderSelectedCard = () => {
    const card = elements.selectedCard;
    if (!card) return;
    const item = state.items.find((entry) => entry.id === state.selectedId);
    if (!item) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    const details = item.details || {};
    const tel = buildTelLink(item.phone);
    const mapUrl = getKakaoMapUrl(item);
    card.hidden = false;
    card.innerHTML = `<div class="life-selected-card-head"><div><h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.address || '주소 확인 필요')}</p></div><button class="life-selected-close" type="button" data-wifi-close aria-label="선택 카드 닫기">×</button></div>
      <div class="life-chip-row">${(item.badges || []).filter((badge) => !String(badge).includes('와이파이 이름')).slice(0, 4).map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}</div>
      <div class="life-detail-grid life-detail-grid--compact">
        <span><small>와이파이 이름</small><strong>${escapeHtml(details.ssid || '확인 필요')}</strong></span>
        <span><small>비밀번호</small><strong>현장 확인 필요</strong></span>
        <span><small>시설 구분</small><strong>${escapeHtml(details.facilityType || '확인 필요')}</strong></span>
        <span><small>관리 전화</small><strong>${escapeHtml(item.phone || '전화 확인 필요')}</strong></span>
      </div>
      ${Array.isArray(item.__installations) && item.__installations.length > 1 ? `<button type="button" class="life-installation-toggle" data-wifi-installations>설치 위치 보기 ${item.__installations.length.toLocaleString('ko-KR')}곳</button><div class="life-installation-popup" hidden data-wifi-installation-panel><strong>설치 위치</strong><ul>${item.__installations.slice(0, 80).map((entry, idx) => `<li><span>${idx + 1}. ${escapeHtml(entry.placeDetail || entry.name || '상세 위치 확인 필요')}</span>${entry.ssid ? `<small>와이파이 이름 ${escapeHtml(entry.ssid)}</small>` : ''}</li>`).join('')}</ul></div>` : ''}
      <div class="life-card-actions"><a class="primary" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">카카오맵 바로가기</a>${tel ? `<a href="${escapeHtml(tel)}">전화하기</a>` : ''}<button type="button" data-wifi-close>닫기</button></div>
      <p class="fine-print">공공데이터에는 비밀번호가 제공되지 않을 수 있습니다. 실제 접속 가능 여부와 비밀번호 필요 여부는 현장에서 확인해 주세요.</p>`;
    card.querySelectorAll('[data-wifi-close]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedId = '';
        render();
      });
    });
    card.querySelector('[data-wifi-installations]')?.addEventListener('click', () => {
      const panel = card.querySelector('[data-wifi-installation-panel]');
      if (panel) panel.hidden = !panel.hidden;
    });
  };

  const selectItem = (id, options = {}) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    state.selectedId = id;
    if (options.mobile) state.mobileOpen = true;
    render();
    if (options.move) moveMapToItem(item);
  };

  const moveMapToItem = (item) => {
    if (!isValidPoint(item)) return;
    if (state.kakaoReady && state.map && window.kakao?.maps) {
      const point = new window.kakao.maps.LatLng(Number(item.lat), Number(item.lng));
      if (typeof state.map.panTo === 'function') state.map.panTo(point);
      else state.map.setCenter(point);
      if (typeof state.map.getLevel === 'function' && state.map.getLevel() > 6) state.map.setLevel(6);
    }
  };

  const renderMap = (items) => {
    const signature = `${state.currentRegion}:${state.currentDistrict}:${items.map((item) => item.id).slice(0, MAX_MARKERS).join('|')}:${state.selectedId}:${state.geo ? `${state.geo.lat},${state.geo.lng}` : ''}:${state.referencePoint ? `${state.referencePoint.lat},${state.referencePoint.lng}` : ''}:${state.kakaoReady ? 'kakao' : 'fallback'}`;
    if (signature === state.lastRenderSignature && state.kakaoReady) return;
    state.lastRenderSignature = signature;
    if (state.kakaoReady && state.map && window.kakao?.maps) renderKakaoMap(items);
    else renderFallbackMap(items);
  };

  const clearOverlays = () => {
    state.overlays.forEach((overlay) => overlay?.setMap?.(null));
    state.overlays = [];
  };

  const renderKakaoMap = (items) => {
    clearOverlays();
    if (elements.markers) elements.markers.innerHTML = '';
    const validItems = items.filter(isValidPoint).slice(0, MAX_MARKERS);
    const center = getMapCenter(validItems);
    if (!validItems.length) {
      state.map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      state.map.setLevel(8);
      return;
    }
    const bounds = new window.kakao.maps.LatLngBounds();
    validItems.forEach((item, index) => {
      const position = new window.kakao.maps.LatLng(Number(item.lat), Number(item.lng));
      bounds.extend(position);
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        yAnchor: 1,
        zIndex: state.selectedId === item.id ? 30 : 20,
        content: makeMarkerElement(item, index),
      });
      overlay.setMap(state.map);
      state.overlays.push(overlay);
    });
    renderReferenceOverlays();
    if (validItems.length === 1 && (state.selectedId || state.mapAutoFitPending)) {
      state.map.setCenter(new window.kakao.maps.LatLng(Number(validItems[0].lat), Number(validItems[0].lng)));
      state.map.setLevel(5);
      state.mapAutoFitPending = false;
    } else if (!state.selectedId && state.mapAutoFitPending) {
      state.map.setBounds(bounds);
      state.mapAutoFitPending = false;
    }
  };

  const makeMarkerElement = (item, index) => {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `life-marker wifi-marker ${state.selectedId === item.id ? 'selected' : ''}`;
    marker.textContent = String(index + 1);
    marker.setAttribute('aria-label', `${item.name} 선택`);
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      selectItem(item.id, { move: true });
    });
    return marker;
  };

  const renderFallbackMap = (items) => {
    if (!elements.markers) return;
    elements.markers.innerHTML = '';
    const validItems = items.filter(isValidPoint).slice(0, MAX_MARKERS);
    if (!validItems.length) {
      setMapNotice('표시할 좌표 없음', '조건에 맞는 무료 와이파이 좌표가 없습니다.');
      return;
    }
    setMapNotice('지도 안내 모드', '카카오맵 키가 없으면 위치를 간단 마커로 표시합니다.');
    const bounds = computeBounds(validItems);
    validItems.forEach((item, index) => {
      const pos = projectPoint(item, bounds);
      const wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.className = `life-marker wifi-marker life-fallback-marker ${state.selectedId === item.id ? 'selected' : ''}`;
      wrapper.style.left = `${pos.x}%`;
      wrapper.style.top = `${pos.y}%`;
      wrapper.textContent = String(index + 1);
      wrapper.setAttribute('aria-label', `${item.name} 선택`);
      wrapper.addEventListener('click', () => selectItem(item.id));
      elements.markers.appendChild(wrapper);
    });
    renderFallbackReferenceMarkers(bounds);
  };

  const computeBounds = (items) => {
    const lats = items.map((item) => Number(item.lat)).filter(Number.isFinite);
    const lngs = items.map((item) => Number(item.lng)).filter(Number.isFinite);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      minLat: minLat === maxLat ? minLat - 0.01 : minLat,
      maxLat: minLat === maxLat ? maxLat + 0.01 : maxLat,
      minLng: minLng === maxLng ? minLng - 0.01 : minLng,
      maxLng: minLng === maxLng ? maxLng + 0.01 : maxLng,
    };
  };

  const projectPoint = (item, bounds) => {
    const x = 8 + ((Number(item.lng) - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 84;
    const y = 12 + ((bounds.maxLat - Number(item.lat)) / (bounds.maxLat - bounds.minLat)) * 76;
    return { x: Math.max(8, Math.min(92, x)), y: Math.max(16, Math.min(88, y)) };
  };

  const getMapCenter = (items = state.items) => {
    const selected = items.find((item) => item.id === state.selectedId);
    if (selected && isValidPoint(selected)) return { lat: Number(selected.lat), lng: Number(selected.lng) };
    if (state.referencePoint && isValidPoint(state.referencePoint)) return state.referencePoint;
    if (state.geo && isValidPoint(state.geo)) return state.geo;
    return currentRegionCenter();
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kakao-map-sdk]');
    if (existing) {
      if (window.kakao?.maps?.load) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('카카오맵 SDK 스크립트 로드 실패')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.kakaoMapSdk = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('카카오맵 SDK 스크립트 로드 실패'));
    document.head.appendChild(script);
  });

  const resolveKakaoMapKey = async () => {
    const fromWindow = window.HANNUNCHECK_CONFIG?.KAKAO_MAP_JS_KEY || window.HANNUNCALC_CONFIG?.KAKAO_MAP_JS_KEY || window.KAKAO_MAP_JS_KEY;
    if (fromWindow) return fromWindow;
    const meta = document.querySelector('meta[name="kakao-map-js-key"]')?.content?.trim();
    if (meta) return meta;
    try {
      const config = await fetchJson('/api/config', { cache: 'no-store' });
      return config?.kakaoMapJsKey || '';
    } catch (_) {
      return '';
    }
  };

  const initKakaoMap = async () => {
    if (!elements.map || state.mapLoadStarted) return;
    state.mapLoadStarted = true;
    try {
      const key = await resolveKakaoMapKey();
      if (!key) throw new Error('NO_KAKAO_MAP_JS_KEY');
      await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`);
      if (!window.kakao?.maps?.load) throw new Error('카카오맵 SDK 객체를 찾지 못했습니다.');
      await new Promise((resolve) => window.kakao.maps.load(resolve));
      const center = getMapCenter();
      state.map = new window.kakao.maps.Map(elements.map, {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level: 7,
      });
      state.kakaoReady = true;
      elements.map.classList.remove('is-fallback');
      setMapNotice('카카오 지도', '무료 와이파이 위치를 지도에 표시합니다.');
      renderMap(state.items);
    } catch (error) {
      state.kakaoReady = false;
      state.map = null;
      elements.map?.classList.add('is-fallback');
      setMapNotice('지도 안내 모드', error?.message === 'NO_KAKAO_MAP_JS_KEY' ? 'KAKAO_MAP_JS_KEY를 설정하면 실제 카카오 지도가 표시됩니다.' : '카카오맵을 불러오지 못해 기본 지도 안내 모드로 표시합니다.');
      renderMap(state.items);
    }
  };



  const REGION_NAME_TO_KEY = {
    '서울': 'seoul', '서울특별시': 'seoul',
    '부산': 'busan', '부산광역시': 'busan',
    '대구': 'daegu', '대구광역시': 'daegu',
    '인천': 'incheon', '인천광역시': 'incheon',
    '광주': 'gwangju', '광주광역시': 'gwangju',
    '대전': 'daejeon', '대전광역시': 'daejeon',
    '울산': 'ulsan', '울산광역시': 'ulsan',
    '세종': 'sejong', '세종특별자치시': 'sejong',
    '경기': 'gyeonggi', '경기도': 'gyeonggi',
    '강원': 'gangwon', '강원도': 'gangwon', '강원특별자치도': 'gangwon',
    '충북': 'chungbuk', '충청북도': 'chungbuk',
    '충남': 'chungnam', '충청남도': 'chungnam',
    '전북': 'jeonbuk', '전라북도': 'jeonbuk', '전북특별자치도': 'jeonbuk',
    '전남': 'jeonnam', '전라남도': 'jeonnam',
    '경북': 'gyeongbuk', '경상북도': 'gyeongbuk',
    '경남': 'gyeongnam', '경상남도': 'gyeongnam',
    '제주': 'jeju', '제주도': 'jeju', '제주특별자치도': 'jeju',
  };

  const normalizeAdmin = (value) => normalize(value)
    .replace(/\s+/g, '')
    .replace(/특별자치시|특별자치도|특별시|광역시|자치도/g, '')
    .replace(/충청/g, '충')
    .replace(/전라/g, '전')
    .replace(/경상/g, '경');

  const regionKeyFromName = (name) => {
    const direct = REGION_NAME_TO_KEY[normalize(name)];
    if (direct) return direct;
    const normalized = normalizeAdmin(name);
    const entry = Object.entries(REGION_NAME_TO_KEY).find(([label]) => normalizeAdmin(label) === normalized || normalized.startsWith(normalizeAdmin(label)) || normalizeAdmin(label).startsWith(normalized));
    return entry?.[1] || '';
  };

  const districtKeyFromName = (regionKey, districtName) => {
    const target = normalizeAdmin(districtName);
    if (!target) return '';
    const districts = regionMeta(regionKey)?.districts || [];
    const exact = districts.find((district) => normalizeAdmin(district.label) === target);
    if (exact) return exact.key;
    const loose = districts.find((district) => {
      const label = normalizeAdmin(district.label);
      return label && (target.includes(label) || label.includes(target));
    });
    return loose?.key || '';
  };

  const kakaoCoordToAdmin = async (point) => {
    if (!isValidPoint(point)) return null;
    if (!window.kakao?.maps?.services) {
      try { await initKakaoMap(); } catch (_) { /* fallback below */ }
    }
    if (!window.kakao?.maps?.services) return null;
    return new Promise((resolve) => {
      try {
        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.coord2RegionCode(Number(point.lng), Number(point.lat), (data, status) => {
          if (status !== window.kakao.maps.services.Status.OK || !Array.isArray(data) || !data.length) {
            resolve(null);
            return;
          }
          const region = data.find((row) => row.region_type === 'H') || data[0];
          resolve({
            regionName: region.region_1depth_name || '',
            districtName: region.region_2depth_name || '',
          });
        });
      } catch (_) {
        resolve(null);
      }
    });
  };

  const centerFromMeta = (meta, fallbackKey) => {
    const c = meta?.center || REGION_CENTERS[fallbackKey] || REGION_CENTERS.seoul;
    return c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)) ? { lat: Number(c.lat), lng: Number(c.lng), label: meta?.label || REGION_CENTERS[fallbackKey]?.label } : null;
  };

  const nearestRegionDistrictFallback = async (point) => {
    await loadIndex();
    let best = { regionKey: state.currentRegion || 'seoul', districtKey: state.currentDistrict || '', distance: Infinity };
    (state.index?.regions || []).forEach((region) => {
      const regionCenter = centerFromMeta(region, region.key);
      const regionDistance = regionCenter ? distanceM(point, regionCenter) : null;
      (region.districts || []).forEach((district) => {
        const center = centerFromMeta(district, region.key);
        const d = center && center.label !== district.label ? null : distanceM(point, center);
        const score = Number.isFinite(d) ? d : (Number.isFinite(regionDistance) ? regionDistance + 100000 : null);
        if (Number.isFinite(score) && score < best.distance) best = { regionKey: region.key, districtKey: district.key, distance: score };
      });
      if (!(region.districts || []).length && Number.isFinite(regionDistance) && regionDistance < best.distance) {
        best = { regionKey: region.key, districtKey: '', distance: regionDistance };
      }
    });
    return best;
  };

  const nearestRegionDistrict = async (point) => {
    await loadIndex();
    const admin = await kakaoCoordToAdmin(point);
    if (admin?.regionName) {
      const regionKey = regionKeyFromName(admin.regionName) || state.currentRegion || 'seoul';
      const districtKey = districtKeyFromName(regionKey, admin.districtName);
      if (regionKey && districtKey) return { regionKey, districtKey, distance: 0 };
      if (regionKey && regionMeta(regionKey)) {
        const fallbackDistrict = regionMeta(regionKey)?.districts?.[0]?.key || '';
        return { regionKey, districtKey: fallbackDistrict, distance: 0 };
      }
    }
    return nearestRegionDistrictFallback(point);
  };

  const moveMapToPoint = (point, level = 5) => {
    if (!isValidPoint(point)) return;
    if (state.kakaoReady && state.map && window.kakao?.maps) {
      const latLng = new window.kakao.maps.LatLng(Number(point.lat), Number(point.lng));
      if (typeof state.map.panTo === 'function') state.map.panTo(latLng);
      else state.map.setCenter(latLng);
      if (typeof state.map.setLevel === 'function') state.map.setLevel(level);
    }
  };

  const makeReferenceMarkerElement = (type, label) => {
    const marker = document.createElement('div');
    marker.className = `life-reference-marker ${type === 'current' ? 'is-current' : 'is-search'}`;
    marker.setAttribute('aria-label', label || (type === 'current' ? '현재 위치' : '검색 위치'));
    marker.innerHTML = `<span>${escapeHtml(label || (type === 'current' ? '현재 위치' : '검색 위치'))}</span>`;
    return marker;
  };

  const renderReferenceOverlays = () => {
    if (!state.kakaoReady || !state.map || !window.kakao?.maps) return;
    const refs = [];
    if (state.geo && isValidPoint(state.geo)) refs.push({ point: state.geo, type: 'current', label: '현재 위치' });
    if (state.referencePoint && isValidPoint(state.referencePoint)) refs.push({ point: state.referencePoint, type: 'search', label: state.referencePoint.label || '검색 위치' });
    refs.forEach((ref) => {
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(Number(ref.point.lat), Number(ref.point.lng)),
        yAnchor: 0.5,
        zIndex: 80,
        content: makeReferenceMarkerElement(ref.type, ref.label),
      });
      overlay.setMap(state.map);
      state.overlays.push(overlay);
    });
  };

  const renderFallbackReferenceMarkers = (bounds) => {
    if (!elements.markers || !bounds) return;
    const refs = [];
    if (state.geo && isValidPoint(state.geo)) refs.push({ point: state.geo, type: 'current', label: '현재 위치' });
    if (state.referencePoint && isValidPoint(state.referencePoint)) refs.push({ point: state.referencePoint, type: 'search', label: state.referencePoint.label || '검색 위치' });
    refs.forEach((ref) => {
      const pos = projectPoint(ref.point, bounds);
      const marker = document.createElement('div');
      marker.className = `life-reference-marker life-fallback-reference-marker ${ref.type === 'current' ? 'is-current' : 'is-search'}`;
      marker.style.left = `${pos.x}%`;
      marker.style.top = `${pos.y}%`;
      marker.innerHTML = `<span>${escapeHtml(ref.label || (ref.type === 'current' ? '현재 위치' : '검색 위치'))}</span>`;
      elements.markers.appendChild(marker);
    });
  };

  const applyReferencePoint = async (point, mode = 'search') => {
    if (!isValidPoint(point)) return;
    if (mode === 'current') {
      state.geo = { lat: Number(point.lat), lng: Number(point.lng), label: '현재 위치' };
      state.referencePoint = null;
    } else {
      state.referencePoint = { lat: Number(point.lat), lng: Number(point.lng), label: point.label || '검색 위치' };
    }
    const target = await nearestRegionDistrict(point);
    await loadDistrict(target.regionKey, target.districtKey);
    if (mode === 'current') {
      state.geo = { lat: Number(point.lat), lng: Number(point.lng), label: '현재 위치' };
      state.referencePoint = null;
    } else {
      state.referencePoint = { lat: Number(point.lat), lng: Number(point.lng), label: point.label || '검색 위치' };
    }
    state.selectedId = '';
    applyFilters({ fitMap: true });
    moveMapToPoint(point, 5);
  };

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setStatus('이 브라우저에서는 현재 위치를 사용할 수 없습니다.', 'warning');
      return;
    }
    setStatus('현재 위치를 확인하는 중입니다.');
    navigator.geolocation.getCurrentPosition(async (position) => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude, label: '현재 위치' };
      try {
        await applyReferencePoint(point, 'current');
        setStatus('현재 위치 기준으로 가까운 무료 와이파이를 다시 정렬했습니다.');
      } catch (_) {
        state.geo = point;
        state.referencePoint = null;
        applyFilters({ fitMap: true });
        moveMapToPoint(point, 5);
      }
    }, () => {
      setStatus('위치 권한이 거부되었거나 현재 위치를 확인하지 못했습니다. 기본 지역 기준으로 표시합니다.', 'warning');
    }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 180000 });
  };



  const ensureSearchPanel = () => {
    let panel = root.querySelector('[data-life-search-results]');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'life-search-results-panel';
      panel.dataset.lifeSearchResults = 'true';
      elements.map?.appendChild(panel);
    }
    return panel;
  };

  const closeSearchPanel = () => {
    const panel = root.querySelector('[data-life-search-results]');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  };

  const showSearchResults = (results) => {
    const panel = ensureSearchPanel();
    if (!results.length) {
      panel.hidden = false;
      panel.innerHTML = '<div class="life-search-results-head"><strong>검색 결과 없음</strong><button type="button" data-life-search-close>닫기</button></div><p>다른 장소명이나 주소로 다시 검색해 주세요.</p>';
    } else {
      panel.hidden = false;
      panel.innerHTML = `<div class="life-search-results-head"><strong>검색 결과 선택</strong><button type="button" data-life-search-close>닫기</button></div><div class="life-search-results-list">${results.slice(0, 8).map((item, index) => `<button type="button" data-life-search-pick="${index}"><strong>${escapeHtml(item.place_name || item.address_name || item.road_address_name || '검색 위치')}</strong><span>${escapeHtml(item.road_address_name || item.address_name || '')}</span></button>`).join('')}</div>`;
      panel.querySelectorAll('[data-life-search-pick]').forEach((button) => {
        button.addEventListener('click', async () => {
          const item = results[Number(button.dataset.lifeSearchPick)];
          const point = { lat: Number(item.y), lng: Number(item.x), label: item.place_name || item.address_name || '검색 위치' };
          closeSearchPanel();
          if (elements.keyword) elements.keyword.value = '';
          if (elements.mapKeyword) elements.mapKeyword.value = '';
          await applyReferencePoint(point, 'search');
          setStatus(`${point.label} 검색 위치 기준으로 가까운 무료 와이파이를 다시 정렬했습니다.`);
        });
      });
    }
    panel.querySelector('[data-life-search-close]')?.addEventListener('click', closeSearchPanel);
  };

  const handlePlaceSearch = async () => {
    const query = normalize(elements.mapKeyword?.value || elements.keyword?.value || '');
    if (!query) { applyFilters({ resetSelection: true }); return; }
    if (!state.kakaoReady || !window.kakao?.maps?.services) {
      await initKakaoMap();
    }
    if (!window.kakao?.maps?.services) {
      setStatus('카카오 지도 검색을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'warning');
      return;
    }
    setStatus(`'${query}' 장소를 검색하는 중입니다.`);
    const places = new window.kakao.maps.services.Places();
    places.keywordSearch(query, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK && Array.isArray(data) && data.length) {
        showSearchResults(data);
        return;
      }
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.addressSearch(query, (addrData, addrStatus) => {
        if (addrStatus === window.kakao.maps.services.Status.OK && Array.isArray(addrData) && addrData.length) showSearchResults(addrData);
        else showSearchResults([]);
      });
    });
  };

  const resetAdvancedFilters = () => {
    if (elements.facility) elements.facility.value = '';
    if (elements.provider) elements.provider.value = '';
    if (elements.sort) elements.sort.value = 'recommend';
    [elements.hasPhone].forEach((element) => {
      if (element) element.checked = false;
    });
    state.selectedId = '';
    applyFilters({ resetSelection: true });
  };

  const closeMobileFilterSheet = () => {
    root.classList.remove('is-filter-open');
    document.body.classList.remove('life-filter-open');
    elements.filterToggle?.setAttribute('aria-expanded', 'false');
  };

  const openMobileFilterSheet = () => {
    ensureMobileFilterHeader();
    root.classList.add('is-filter-open');
    document.body.classList.add('life-filter-open');
    elements.filterToggle?.setAttribute('aria-expanded', 'true');
  };

  const ensureMobileFilterHeader = () => {
    const panel = root.querySelector('.parking-dashboard__controls');
    if (!panel || panel.querySelector('[data-life-filter-head]')) return;
    const header = document.createElement('div');
    header.className = 'life-mobile-filter-head';
    header.dataset.lifeFilterHead = 'true';
    header.innerHTML = '<div><strong>상세 필터</strong><span>조건을 고른 뒤 적용하세요.</span></div><div class="parking-sheet-handle" aria-hidden="true"></div><button type="button" data-life-filter-reset>초기화</button><button type="button" data-life-filter-close aria-label="필터 닫기">닫기</button>';
    panel.prepend(header);
    header.querySelector('[data-life-filter-close]')?.addEventListener('click', closeMobileFilterSheet);
    header.querySelector('[data-life-filter-reset]')?.addEventListener('click', resetAdvancedFilters);
    attachDragToSheet(panel, closeMobileFilterSheet, 'is-filter-expanded');
  };

  const attachDragToSheet = (sheet, onClose, expandedClass) => {
    if (!sheet || sheet.dataset.lifeDragBound === 'true') return;
    sheet.dataset.lifeDragBound = 'true';
    let startY = 0;
    let lastY = 0;
    let active = false;
    const getY = (event) => event.clientY || event.touches?.[0]?.clientY || event.changedTouches?.[0]?.clientY || 0;
    const start = (event) => {
      if (!event.target.closest('.parking-sheet-handle')) return;
      active = true;
      startY = getY(event);
      lastY = startY;
      sheet.classList.add('is-dragging');
      if (event.pointerId != null && typeof sheet.setPointerCapture === 'function') {
        try { sheet.setPointerCapture(event.pointerId); } catch (_) { /* noop */ }
      }
    };
    const move = (event) => {
      if (!active) return;
      lastY = getY(event);
      const delta = lastY - startY;
      const baseY = expandedClass && sheet.classList.contains(expandedClass) ? 7 : 42;
      const nextY = Math.min(96, Math.max(7, baseY + (delta / Math.max(window.innerHeight, 1)) * 100));
      sheet.style.setProperty('--life-sheet-y', `${nextY}%`);
      event.preventDefault?.();
    };
    const end = () => {
      if (!active) return;
      const delta = lastY - startY;
      sheet.classList.remove('is-dragging');
      sheet.style.removeProperty('--life-sheet-y');
      if (delta > 90) {
        if (expandedClass) sheet.classList.remove(expandedClass);
        onClose?.();
      } else if (delta < -80 && expandedClass) {
        if (sheet.classList.contains('life-mobile-bottom-sheet')) {
          state.mobileOpen = true;
          sheet.classList.add('is-open');
          sheet.classList.remove('is-collapsed');
        }
        sheet.classList.add(expandedClass);
      } else if (delta < -28 && sheet.classList.contains('life-mobile-bottom-sheet')) {
        state.mobileOpen = true;
        syncMobileSheet();
      } else if (delta > 36 && expandedClass) {
        sheet.classList.remove(expandedClass);
      }
      active = false;
    };
    sheet.addEventListener('pointerdown', start);
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
    sheet.addEventListener('touchstart', start, { passive: true });
    sheet.addEventListener('touchmove', move, { passive: false });
    sheet.addEventListener('touchend', end, { passive: true });
    sheet.addEventListener('touchcancel', end, { passive: true });
  };

  const initMobileInteractions = () => {
    elements.filterToggle?.setAttribute('aria-expanded', 'false');
    elements.filterToggle?.addEventListener('click', () => {
      if (root.classList.contains('is-filter-open')) closeMobileFilterSheet();
      else openMobileFilterSheet();
    });
    attachDragToSheet(elements.mobileSheet, () => {
      state.mobileOpen = false;
      syncMobileSheet();
    }, 'is-expanded');
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileFilterSheet();
    });
  };

  const bindEvents = () => {
    elements.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      applyFilters({ resetSelection: true });
      closeMobileFilterSheet();
    });
    elements.region?.addEventListener('change', () => loadDistrict(elements.region.value));
    elements.mapRegion?.addEventListener('change', () => loadDistrict(elements.mapRegion.value));
    elements.district?.addEventListener('change', () => loadDistrict(elements.region?.value || state.currentRegion, elements.district.value));
    elements.mapDistrict?.addEventListener('change', () => loadDistrict(elements.mapRegion?.value || state.currentRegion, elements.mapDistrict.value));
    elements.sort?.addEventListener('change', () => applyFilters());
    elements.facility?.addEventListener('change', () => applyFilters({ resetSelection: true }));
    elements.provider?.addEventListener('change', () => applyFilters({ resetSelection: true }));
    [elements.hasPhone].forEach((element) => element?.addEventListener('change', () => applyFilters({ resetSelection: true })));  
    elements.keyword?.addEventListener('input', debounce(() => {
      if (elements.mapKeyword && elements.mapKeyword.value !== elements.keyword.value) elements.mapKeyword.value = elements.keyword.value;
      applyFilters({ resetSelection: true });
    }, 240));
    elements.mapToolbarSearch?.addEventListener('submit', (event) => {
      event.preventDefault();
      handlePlaceSearch();
    });
    elements.mapKeyword?.addEventListener('input', debounce(() => {
      if (elements.keyword) elements.keyword.value = elements.mapKeyword.value || '';
    }, 220));
    elements.sortButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (elements.sort) elements.sort.value = button.dataset.wifiSort || 'recommend';
        applyFilters();
      });
    });
    elements.useLocation?.addEventListener('click', useCurrentLocation);
    elements.mapLocation?.addEventListener('click', useCurrentLocation);
    elements.mobileToggle?.addEventListener('click', () => {
      state.mobileOpen = !state.mobileOpen;
      syncMobileSheet();
    });
    elements.mobileMapButton?.addEventListener('click', () => {
      state.mobileOpen = false;
      syncMobileSheet();
    });
    initMobileInteractions();
  };

  const debounce = (fn, delay) => {
    let timer = 0;
    return (...params) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...params), delay);
    };
  };

  bindEvents();
  loadDistrict('seoul').then(() => { window.setTimeout(() => { if (!state.initialLocationAttempted) { state.initialLocationAttempted = true; useCurrentLocation(); } }, 350); });
})();
