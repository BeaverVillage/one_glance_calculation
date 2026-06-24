(() => {
  const root = document.querySelector('[data-emergency-hospital-tool]');
  if (!root) return;

  const toolkit = window.HannunCheckToolkit || {};
  const fetchJson = toolkit.fetchJson || ((url) => fetch(url, { cache: 'no-store' }).then((response) => response.json()));
  const formatDistance = toolkit.formatDistance || ((meters) => {
    const value = Number(meters || 0);
    if (!Number.isFinite(value) || value <= 0) return '거리 정보 없음';
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}km` : `${Math.round(value)}m`;
  });
  const buildKakaoSearchUrl = toolkit.buildKakaoSearchUrl || ((item) => `https://map.kakao.com/link/search/${encodeURIComponent(`${item.name} ${item.address}`)}`);
  const MEDICAL_CACHE_VERSION = '20260623-v104-medical-cache-slug-map-copy-init-fix';
  const EMERGENCY_NATIONAL_CACHE_URL = `/assets/data/medical/emergency-national-cache.json?v=${MEDICAL_CACHE_VERSION}`;
  const MEDICAL_KAKAO_EMERGENCY_CACHE_URL = `/assets/data/medical/kakao-place/emergency.json?v=${MEDICAL_CACHE_VERSION}`;
  const MEDICAL_REGION_SLUGS = {
    '서울': 'seoul', '서울특별시': 'seoul', '부산': 'busan', '부산광역시': 'busan', '대구': 'daegu', '대구광역시': 'daegu',
    '인천': 'incheon', '인천광역시': 'incheon', '광주': 'gwangju', '광주광역시': 'gwangju', '대전': 'daejeon', '대전광역시': 'daejeon',
    '울산': 'ulsan', '울산광역시': 'ulsan', '세종': 'sejong', '세종특별자치시': 'sejong', '경기': 'gyeonggi', '경기도': 'gyeonggi',
    '강원': 'gangwon', '강원특별자치도': 'gangwon', '충북': 'chungbuk', '충청북도': 'chungbuk', '충남': 'chungnam', '충청남도': 'chungnam',
    '전북': 'jeonbuk', '전북특별자치도': 'jeonbuk', '전남': 'jeonnam', '전라남도': 'jeonnam', '경북': 'gyeongbuk', '경상북도': 'gyeongbuk',
    '경남': 'gyeongnam', '경상남도': 'gyeongnam', '제주': 'jeju', '제주특별자치도': 'jeju', '기타': 'other',
  };
  const medicalRegionFile = (region) => `${MEDICAL_REGION_SLUGS[String(region || '서울특별시').trim()] || 'seoul'}.json`;
  const NIGHT_HOSPITAL_CACHE_URL = (region) => `/assets/data/medical/night-hospital/${medicalRegionFile(region)}?v=${MEDICAL_CACHE_VERSION}`;
  const NIGHT_PHARMACY_CACHE_URL = (region) => `/assets/data/medical/night-pharmacy/${medicalRegionFile(region)}?v=${MEDICAL_CACHE_VERSION}`;
  const MEDICAL_KAKAO_REGION_CACHE_URL = (mode, region) => `/assets/data/medical/kakao-place/${mode}/${medicalRegionFile(region)}?v=${MEDICAL_CACHE_VERSION}`;

  const MODE_META = {
    emergency: { label: '응급실', searchLabel: '응급실 확인하기', listLabel: '응급실 비교 목록', mapSuffix: '응급실', detailTitle: '선택한 응급실' },
    hospital: { label: '야간 병원', searchLabel: '야간 병원 확인하기', listLabel: '야간 병원 비교 목록', mapSuffix: '야간 병원', detailTitle: '선택한 야간 병원' },
    pharmacy: { label: '야간 약국', searchLabel: '야간 약국 확인하기', listLabel: '야간 약국 비교 목록', mapSuffix: '야간 약국', detailTitle: '선택한 야간 약국' },
  };
  const REGION_CENTERS = {
    서울: { lat: 37.5665, lng: 126.9780 }, 부산: { lat: 35.1796, lng: 129.0756 }, 대구: { lat: 35.8714, lng: 128.6014 },
    인천: { lat: 37.4563, lng: 126.7052 }, 광주: { lat: 35.1595, lng: 126.8526 }, 대전: { lat: 36.3504, lng: 127.3845 },
    울산: { lat: 35.5384, lng: 129.3114 }, 세종: { lat: 36.4800, lng: 127.2890 }, 경기: { lat: 37.4138, lng: 127.5183 },
    강원: { lat: 37.8228, lng: 128.1555 }, 충북: { lat: 36.6357, lng: 127.4917 }, 충남: { lat: 36.5184, lng: 126.8000 },
    전북: { lat: 35.7175, lng: 127.1530 }, 전남: { lat: 34.8679, lng: 126.9910 }, 경북: { lat: 36.4919, lng: 128.8889 },
    경남: { lat: 35.4606, lng: 128.2132 }, 제주: { lat: 33.4996, lng: 126.5312 },
  };
  const REGION_BOUNDS = {
    서울: { latMin: 37.40, latMax: 37.72, lngMin: 126.75, lngMax: 127.20 },
    부산: { latMin: 35.00, latMax: 35.35, lngMin: 128.75, lngMax: 129.35 },
    대구: { latMin: 35.75, latMax: 36.05, lngMin: 128.35, lngMax: 128.80 },
    인천: { latMin: 37.30, latMax: 37.65, lngMin: 126.35, lngMax: 126.90 },
  };

  const validateCoordinatesForRegion = (lat, lng, regionValue = '') => {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || nLat < 30 || nLat > 45 || nLng < 120 || nLng > 135) return false;
    const short = String(regionValue || '').trim().slice(0, 2);
    const bounds = REGION_BOUNDS[short];
    if (!bounds) return true;
    return nLat >= bounds.latMin && nLat <= bounds.latMax && nLng >= bounds.lngMin && nLng <= bounds.lngMax;
  };

  const CRITICAL_STATUS_LABELS = [
    '뇌출혈 수술', '뇌경색 재관류', '심근경색 재관류', '복부손상 수술', '사지접합 수술',
    '응급내시경', '응급투석', '조산산모', '정신질환', '신생아', '중증화상',
  ];


  const elements = {
    form: document.querySelector('#emergency-hospital-form'),
    modeTabs: Array.from(document.querySelectorAll('[data-care-mode]')),
    region: document.querySelector('#emergency-region'),
    district: document.querySelector('#emergency-district'),
    keyword: document.querySelector('#emergency-keyword'),
    department: document.querySelector('#emergency-department'),
    sort: document.querySelector('#emergency-sort'),
    submit: document.querySelector('#emergency-submit'),
    status: document.querySelector('#emergency-status'),
    location: document.querySelector('#emergency-use-location'),
    summaryCount: document.querySelector('#emergency-count-card'),
    summaryBeds: document.querySelector('#emergency-beds-card'),
    summaryPhone: document.querySelector('#emergency-phone-card'),
    summaryStatus: document.querySelector('#emergency-status-card'),
    mapTitle: document.querySelector('#emergency-map-title'),
    map: document.querySelector('#emergency-map'),
    mapNotice: document.querySelector('.emergency-map-notice'),
    markers: document.querySelector('#emergency-map-markers'),
    list: document.querySelector('#emergency-result-list'),
    listTitle: document.querySelector('#emergency-list-title'),
    listSummary: document.querySelector('#emergency-list-summary'),
    detail: document.querySelector('#emergency-detail-card'),
    mapDetail: document.querySelector('#emergency-map-selected-card'),
    mobileDetail: document.querySelector('#emergency-mobile-detail-card'),
    warningList: document.querySelector('#emergency-warning-list'),
    quickButtons: Array.from(document.querySelectorAll('.emergency-quick-row button, .emergency-result-sort-tabs--v88 button, [data-emergency-map-sort], [data-emergency-mobile-sort]')),
    mapToolbarSearch: document.querySelector('#emergency-map-toolbar-search'),
    mapKeyword: document.querySelector('#emergency-map-keyword'),
    mapModeToggle: document.querySelector('#emergency-map-mode-toggle'),
    mapModePanel: document.querySelector('#emergency-map-mode-panel'),
    mapModeButtons: Array.from(document.querySelectorAll('[data-emergency-map-mode]')),
    mapRegionToggle: document.querySelector('#emergency-map-region-toggle'),
    mapRegionPanel: document.querySelector('#emergency-map-region-panel'),
    mapRegion: document.querySelector('#emergency-map-region'),
    mapDistrict: document.querySelector('#emergency-map-district'),
    mapRegionApply: document.querySelector('#emergency-map-region-apply'),
    mapSortToggle: document.querySelector('#emergency-map-sort-toggle'),
    mapSortPanel: document.querySelector('#emergency-map-sort-panel'),
    mapSortButtons: Array.from(document.querySelectorAll('[data-emergency-map-sort]')),
    mapLocation: document.querySelector('#emergency-map-location'),
    mobileListToggle: document.querySelector('#emergency-mobile-list-toggle'),
    mobileSheet: document.querySelector('#emergency-mobile-bottom-sheet'),
    mobileResults: document.querySelector('#emergency-mobile-results'),
    mobileSheetTitle: document.querySelector('#emergency-mobile-sheet-title'),
    mobileSheetSubtitle: document.querySelector('#emergency-mobile-sheet-subtitle'),
    mobileSheetMapButton: document.querySelector('#emergency-mobile-sheet-map-button'),
    mobileSortButton: document.querySelector('#emergency-mobile-sort-button'),
    mobileFilterButton: document.querySelector('#emergency-mobile-filter-button'),
    mobileModeButton: document.querySelector('#emergency-mobile-mode-button'),
    mobileRegionButton: document.querySelector('#emergency-mobile-region-button'),
    mobileSheetSort: document.querySelector('#emergency-mobile-sheet-sort'),
  };

  const state = {
    dataMode: 'idle',
    careMode: 'emergency',
    loading: false,
    geo: null,
    items: [],
    places: [],
    summary: {},
    warnings: [],
    selectedId: '',
    kakaoCache: null,
    emergencyCache: null,
    emergencyCacheReady: false,
    kakaoReady: false,
    map: null,
    kakaoOverlays: [],
    kakaoReferenceOverlay: null,
    mapLoadStarted: false,
    referencePoint: null,
    keywordMode: 'facility',
    detailOpen: false,
    resultFilter: 'all',
    mapHasFitResults: false,
    mapResultSignature: '',
    selectionMove: false,
    referenceMove: false,
    mobileSheetMode: 'collapsed',
    liveStatusById: new Map(),
    emergencyCachePromise: null,
    nightCaches: { hospital: null, pharmacy: null },
    nightCacheReady: { hospital: false, pharmacy: false },
    nightCachePromises: { hospital: null, pharmacy: null },
    kakaoCachePromise: null,
    kakaoCaches: {},
    kakaoCachePromises: {},
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const meta = () => MODE_META[state.careMode] || MODE_META.emergency;
  const getRegionLabel = () => elements.region?.value || '서울';
  const getHospitalKey = (item = {}) => normalizeTextForCache(item.id || item.sourceId || item.hpid || item.name || '');
  const getHospitalKeys = (item = {}) => [...new Set([item.id, item.sourceId, item.hpid, item.name].map(normalizeTextForCache).filter(Boolean))];
  const numberOrMax = (value) => Number.isFinite(Number(value)) ? Number(value) : 999999999;
  const numberOrNeg = (value) => Number.isFinite(Number(value)) ? Number(value) : -1;
  const buildTelLink = (phone) => phone ? `tel:${String(phone).replace(/[^0-9+]/g, '')}` : '';
  const hasUsableDistance = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const formatDistanceSafe = (value) => (hasUsableDistance(value) ? formatDistance(Number(value)) : '');
  const formatBeds = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? `${number.toLocaleString('ko-KR')}개` : '전화 확인';
  };
  const markerBedText = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? `병상 ${number.toLocaleString('ko-KR')}` : '병상 -';
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const countGood = (items) => (Array.isArray(items) ? items.filter((item) => item.tone === 'good').length : 0);
  const GENERIC_CRITICAL_LABEL_RE = /^(Y|N|O|X|가능|불가|전화 확인|확인|정보미제공|정보 미제공|제공됨|제공 안 됨|미제공)$/i;
  const normalizeAvailabilityText = (entry = {}) => {
    const raw = normalizeTextForCache(entry.statusLabel || entry.status || entry.result || entry.available || entry.labelText || entry.value || '');
    const label = normalizeTextForCache(entry.label || entry.name || '');
    const source = raw || (GENERIC_CRITICAL_LABEL_RE.test(label) ? label : '');
    if (/^(Y|YES|O|가능|가|정상|TRUE|제공됨)$/i.test(source)) return '제공됨';
    if (/^(N|NO|X|불가|부|FALSE|제공 안 됨)$/i.test(source)) return '전화 확인';
    if (/정보\s*미제공|미제공|정보없음|미상/i.test(source)) return '정보 미제공';
    if (/가능|운영|가용|있음/i.test(source)) return '제공됨';
    if (/불가|마감|중지|없음|폐쇄/i.test(source)) return '전화 확인';
    return source || '전화 확인';
  };
  const normalizeCriticalEntry = (entry = {}, index = 0) => {
    const rawLabel = normalizeTextForCache(entry.label || entry.name || '');
    const fallbackLabel = CRITICAL_STATUS_LABELS[index] || `중증 항목 ${index + 1}`;
    const label = (!rawLabel || GENERIC_CRITICAL_LABEL_RE.test(rawLabel)) ? fallbackLabel : rawLabel;
    const statusLabel = normalizeAvailabilityText(entry);
    const tone = entry.tone || (/제공됨/.test(statusLabel) ? 'good' : /정보 미제공/.test(statusLabel) ? 'neutral' : 'caution');
    return { ...entry, label, statusLabel, value: normalizeTextForCache(entry.value || entry.raw || ''), tone };
  };

  const setStatus = (message, tone = 'info') => {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
    const formStatus = document.querySelector('#emergency-form-status');
    if (formStatus) formStatus.textContent = message;
  };

  const closeToolbarPopovers = () => {
    [elements.mapModePanel, elements.mapRegionPanel, elements.mapSortPanel, elements.mobileSheetSort].forEach((panel) => { if (panel) panel.hidden = true; });
    [elements.mapModeToggle, elements.mapRegionToggle, elements.mapSortToggle, elements.mobileSortButton].forEach((button) => { if (button) button.setAttribute('aria-expanded', 'false'); });
  };

  const toggleToolbarPanel = (toggle, panel) => {
    if (!toggle || !panel) return;
    const willOpen = panel.hidden;
    closeToolbarPopovers();
    panel.hidden = !willOpen;
    toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  };

  const sortLabel = (value) => ({ distance: '가까운 순', beds: '병상 우선', phone: '전화 우선', critical: '중증 정보', night: '야간 운영' }[value] || '가까운 순');
  const isMobileView = () => window.matchMedia?.('(max-width: 860px)')?.matches || window.innerWidth <= 860;
  const currentRegionFull = () => normalizeRegionForCache(elements.region?.value || getRegionLabel());
  const currentRegionName = () => currentRegionFull().full || currentRegionFull().raw || '서울특별시';

  const syncToolbarInputs = () => {
    if (elements.mapKeyword && elements.keyword && elements.mapKeyword !== document.activeElement) elements.mapKeyword.value = elements.keyword.value || '';
    if (elements.mapRegion && elements.region) elements.mapRegion.value = elements.region.value || '서울';
    if (elements.mapDistrict && elements.district && elements.mapDistrict !== document.activeElement) elements.mapDistrict.value = elements.district.value || '';
    if (elements.mapModeToggle) elements.mapModeToggle.textContent = meta().label;
    if (elements.mapRegionToggle) elements.mapRegionToggle.textContent = elements.district?.value ? `${getRegionLabel()} ${elements.district.value}` : getRegionLabel();
    const currentSort = elements.sort?.value || 'distance';
    if (elements.mapSortToggle) elements.mapSortToggle.textContent = sortLabel(currentSort);
    if (elements.mobileSortButton) elements.mobileSortButton.textContent = sortLabel(currentSort);
    if (elements.mobileModeButton) elements.mobileModeButton.textContent = meta().label;
    if (elements.mobileRegionButton) elements.mobileRegionButton.textContent = elements.district?.value ? `${getRegionLabel()} ${elements.district.value}` : getRegionLabel();
    elements.mapModeButtons?.forEach((button) => button.classList.toggle('active', button.dataset.emergencyMapMode === state.careMode));
    elements.mapSortButtons?.forEach((button) => button.classList.toggle('active', button.dataset.emergencyMapSort === currentSort));
    document.querySelectorAll('[data-emergency-mobile-sort]').forEach((button) => button.classList.toggle('active', button.dataset.emergencyMobileSort === currentSort));
  };

  const syncFromToolbar = () => {
    if (elements.mapKeyword && elements.keyword) elements.keyword.value = elements.mapKeyword.value || '';
    if (elements.mapRegion && elements.region) elements.region.value = elements.mapRegion.value || elements.region.value;
    if (elements.mapDistrict && elements.district) elements.district.value = elements.mapDistrict.value || '';
    syncToolbarInputs();
  };

  const isEmergencyItem = (item) => (item?.kind || state.careMode) === 'emergency';

  const getKakaoAction = (item) => {
    const util = window.HannunKakaoPlaceLink;
    const directMatch = item?.kakaoPlace || item?.kakaoPlaceMatch || item?.kakao || null;
    const cachedMatch = util?.findMatch ? util.findMatch(state.kakaoCache, item, { mode: state.careMode }) : null;
    const match = directMatch || cachedMatch;
    if (util?.getAction) {
      return util.getAction(item, match, { allowMedium: state.careMode !== 'emergency', mode: state.careMode });
    }
    return { type: 'search', label: '카카오맵 검색', url: buildKakaoSearchUrl(item), confidence: 'none' };
  };

  const getKakaoCacheUrl = (mode = state.careMode, region = currentRegionName()) => {
    if (mode === 'emergency') return MEDICAL_KAKAO_EMERGENCY_CACHE_URL;
    return MEDICAL_KAKAO_REGION_CACHE_URL(mode === 'pharmacy' ? 'pharmacy' : 'hospital', region);
  };

  const loadKakaoPlaceCache = async (mode = state.careMode) => {
    const util = window.HannunKakaoPlaceLink;
    if (!util?.loadCache) return null;
    const region = mode === 'emergency' ? '전국' : currentRegionName();
    const key = `${mode}:${region}`;
    if (state.kakaoCaches[key]) {
      state.kakaoCache = state.kakaoCaches[key];
      return state.kakaoCache;
    }
    if (!state.kakaoCachePromises[key]) {
      state.kakaoCachePromises[key] = util.loadCache(getKakaoCacheUrl(mode, region), { cache: 'force-cache' })
        .then((cache) => {
          state.kakaoCaches[key] = cache;
          return cache;
        })
        .catch(() => ({ version: 'cache-unavailable', entries: {}, index: {} }));
    }
    state.kakaoCache = await state.kakaoCachePromises[key];
    if (state.items.length) render();
    return state.kakaoCache;
  };


  const normalizeRegionForCache = (value) => {
    const raw = String(value || '').trim();
    const full = {
      서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
      경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도',
    }[raw];
    return { raw, full: full || raw };
  };

  const normalizeTextForCache = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const normalizeMatchText = (value) => normalizeTextForCache(value).replace(/[\s()\[\]{}·.,-]/g, '').toLowerCase();

  const distanceBetweenM = (a, b) => {
    const lat1 = Number(a?.lat); const lng1 = Number(a?.lng); const lat2 = Number(b?.lat); const lng2 = Number(b?.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const toRad = (d) => d * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  };


  const inferSido = (address = '') => normalizeRegionForCache(String(address || '').trim().split(/\s+/)[0] || '').raw || '';
  const inferDistrict = (address = '') => String(address || '').trim().split(/\s+/)[1] || '';

  const normalizePlaceCandidate = (item = {}) => {
    const address = item.address || item.address_name || item.roadAddress || item.road_address_name || '';
    const roadAddress = item.roadAddress || item.road_address_name || '';
    return {
      id: item.id || `${item.x || item.lng || ''},${item.y || item.lat || ''}`,
      name: item.name || item.place_name || item.address_name || address || '검색 결과',
      address,
      roadAddress,
      category: item.category || item.category_name || '',
      phone: item.phone || '',
      lat: Number(item.lat ?? item.y),
      lng: Number(item.lng ?? item.x),
      region1: item.region1 || inferSido(address || roadAddress),
      region2: item.region2 || inferDistrict(address || roadAddress),
      region3: item.region3 || '',
    };
  };

  const searchPlacesWithKakaoSdk = (query) => new Promise((resolve) => {
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

  const searchPlaces = async (query) => {
    const q = normalizeTextForCache(query);
    const merged = [];
    const seen = new Set();
    const addPlaces = (places) => {
      (Array.isArray(places) ? places : []).forEach((raw) => {
        const place = normalizePlaceCandidate(raw);
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
        const key = String(place.id || `${place.name}:${place.lat.toFixed(6)},${place.lng.toFixed(6)}`);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(place);
      });
    };
    try {
      const keywordData = await fetchJson(`/api/kakao-local?query=${encodeURIComponent(q)}`, { timeoutMs: 6500, cache: 'no-store' });
      addPlaces(keywordData?.documents);
    } catch (_) {}
    if (!merged.length) {
      try {
        const addressData = await fetchJson(`/api/kakao-local?address=${encodeURIComponent(q)}`, { timeoutMs: 6500, cache: 'no-store' });
        addPlaces(addressData?.documents);
      } catch (_) {}
    }
    if (!merged.length) addPlaces(await searchPlacesWithKakaoSdk(q));
    return merged.slice(0, 10);
  };

  const ensurePlacePopup = () => {
    let popup = document.querySelector('#emergency-place-popup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'emergency-place-popup';
    popup.className = 'parking-place-popup emergency-place-popup';
    popup.hidden = true;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'emergency-place-popup-title');
    popup.innerHTML = `
      <div class="parking-place-popup__panel" role="document">
        <div class="parking-place-popup__head"><div><strong id="emergency-place-popup-title">장소 선택</strong><span>응급실을 찾을 기준 장소를 선택하세요.</span></div><button type="button" class="parking-place-popup__close" aria-label="장소 선택창 닫기" data-emergency-place-close>×</button></div>
        <div class="parking-place-popup__list" data-emergency-place-list></div>
      </div>`;
    document.body.appendChild(popup);
    popup.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target === popup || target?.closest('[data-emergency-place-close]')) closePlacePopup();
      const button = target?.closest('[data-emergency-place-index]');
      if (button) {
        const place = state.places[Number(button.getAttribute('data-emergency-place-index'))];
        if (place) selectPlace(place, true);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !popup.hidden) closePlacePopup();
    });
    return popup;
  };

  const openPlacePopup = (emptyMessage = '') => {
    const popup = ensurePlacePopup();
    const list = popup.querySelector('[data-emergency-place-list]');
    if (!list) return;
    if (!state.places.length) {
      list.innerHTML = `<div class="parking-place-popup__empty">${escapeHtml(emptyMessage || '검색 결과가 없습니다.')}</div>`;
    } else {
      list.innerHTML = state.places.slice(0, 8).map((place, index) => `
        <button type="button" class="parking-place-popup__item" data-emergency-place-index="${index}">
          <strong>${escapeHtml(place.name || '검색 결과')}</strong>
          <span>${escapeHtml(place.address || place.roadAddress || '')}</span>
        </button>`).join('');
    }
    popup.hidden = false;
    document.body.classList.add('parking-place-popup-open');
  };

  const closePlacePopup = () => {
    const popup = document.querySelector('#emergency-place-popup');
    if (popup) popup.hidden = true;
    document.body.classList.remove('parking-place-popup-open');
  };

  const selectPlace = (place, runSearch = true) => {
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.geo = { lat, lng };
    state.referencePoint = { lat, lng, type: 'search', label: '검색 위치', name: place.name || '선택한 장소', query: place.name || '' };
    state.keywordMode = 'place';
    state.mapHasFitResults = false;
    state.mapResultSignature = '';
    state.selectionMove = false;
    state.referenceMove = true;
    setRegionFromPlace(place);
    if (elements.keyword) elements.keyword.value = place.name || '';
    if (elements.mapKeyword) elements.mapKeyword.value = place.name || '';
    if (elements.sort) elements.sort.value = 'distance';
    syncToolbarInputs();
    closePlacePopup();
    setStatus(`${place.name || '선택한 장소'} 기준으로 가까운 응급실을 확인합니다.`, 'success');
    if (runSearch) searchHospitals();
  };

  const searchDestination = async (query) => {
    const q = normalizeTextForCache(query);
    if (!q) {
      state.keywordMode = 'facility';
      state.referencePoint = state.referencePoint?.type === 'search' ? null : state.referencePoint;
      searchHospitals();
      return;
    }
    setStatus('장소 검색 결과를 확인하는 중입니다.', 'info');
    try {
      state.places = await searchPlaces(q);
      if (!state.places.length) {
        setStatus('장소 검색 결과를 찾지 못했습니다. 다른 장소명을 입력해 주세요.', 'warning');
        openPlacePopup('검색 결과를 찾지 못했습니다.');
        return;
      }
      setStatus(`${state.places.length}개 장소 후보를 찾았습니다. 기준 장소를 선택해 주세요.`, 'success');
      openPlacePopup();
    } catch (error) {
      setStatus(error?.message || '장소 검색 중 오류가 발생했습니다.', 'error');
      state.places = [];
      openPlacePopup('장소 검색 중 오류가 발생했습니다.');
    }
  };

  const normalizeEmergencyCacheEntry = (entry = {}) => {
    const id = normalizeTextForCache(entry.id || entry.sourceId || entry.hpid || '');
    const lat = Number(entry.lat);
    const lng = Number(entry.lng);
    const regionHint = normalizeTextForCache(entry.sido || entry.region || '');
    const hasCoordinates = validateCoordinatesForRegion(lat, lng, regionHint || entry.address || '');
    const item = {
      id,
      sourceId: id,
      kind: 'emergency',
      type: 'emergency',
      name: normalizeTextForCache(entry.name || entry.dutyName || '응급의료기관'),
      address: normalizeTextForCache(entry.address || entry.dutyAddr || ''),
      region: regionHint,
      district: normalizeTextForCache(entry.sigungu || entry.district || ''),
      emergencyTel: normalizeTextForCache(entry.emergencyTel || entry.dutyTel3 || ''),
      mainTel: normalizeTextForCache(entry.mainTel || entry.dutyTel1 || ''),
      lat: hasCoordinates ? lat : null,
      lng: hasCoordinates ? lng : null,
      hasCoordinates,
      distanceM: null,
      emergencyBeds: null,
      totalBeds: null,
      statusLabel: '실시간 병상 확인 필요',
      statusTone: 'neutral',
      criticalCare: [],
      criticalAvailableCount: 0,
      facilityStatus: [],
      facilityAvailableCount: 0,
      messages: [],
      sourceMode: 'local_emergency_cache',
      source: 'LOCAL EMERGENCY NATIONAL CACHE',
      updatedAt: normalizeTextForCache(entry.updatedAt || ''),
      isLocalCacheOnly: true,
    };
    if (state.geo && item.hasCoordinates) item.distanceM = distanceBetweenM(state.geo, item);
    return item;
  };

  const getCriticalEntries = (item = {}) => (Array.isArray(item.criticalCare) ? item.criticalCare : [])
    .map(normalizeCriticalEntry)
    .filter((entry) => normalizeTextForCache(entry?.label || '') || normalizeTextForCache(entry?.statusLabel || entry?.value || ''));

  const isCriticalProvided = (entry = {}) => {
    const normalized = normalizeCriticalEntry(entry);
    const statusLabel = normalizeAvailabilityText(normalized);
    if (statusLabel === '정보 미제공' || statusLabel === '전화 확인') return false;
    return normalized.tone === 'good' || statusLabel === '제공됨';
  };

  const getCriticalProvidedItems = (item = {}) => getCriticalEntries(item).filter(isCriticalProvided);

  const getCriticalCounts = (item = {}) => {
    const entries = getCriticalEntries(item);
    const provided = entries.filter(isCriticalProvided).length;
    return {
      total: entries.length,
      provided,
      unknown: entries.filter((entry) => normalizeCriticalEntry(entry).statusLabel === '정보 미제공').length,
    };
  };

  const getCriticalProvidedCount = (item = {}) => getCriticalCounts(item).provided;

  const getLiveStatusPayload = (item = {}) => {
    const payload = {};
    ['emergencyBeds', 'totalBeds', 'statusLabel', 'statusTone', 'statusUpdatedAt', 'updatedAt', 'sourceMode'].forEach((key) => {
      if (item[key] !== undefined && item[key] !== null && item[key] !== '') payload[key] = item[key];
    });
    if (Array.isArray(item.criticalCare) && item.criticalCare.length) payload.criticalCare = item.criticalCare;
    if (Number.isFinite(Number(item.criticalAvailableCount))) payload.criticalAvailableCount = Number(item.criticalAvailableCount);
    if (Array.isArray(item.facilityStatus) && item.facilityStatus.length) payload.facilityStatus = item.facilityStatus;
    if (Number.isFinite(Number(item.facilityAvailableCount))) payload.facilityAvailableCount = Number(item.facilityAvailableCount);
    if (Array.isArray(item.messages) && item.messages.length) payload.messages = item.messages;
    return payload;
  };

  const rememberLiveStatus = (items = []) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!isEmergencyItem(item)) return;
      const payload = getLiveStatusPayload(item);
      if (!Object.keys(payload).length) return;
      getHospitalKeys(item).forEach((key) => state.liveStatusById.set(key, { ...(state.liveStatusById.get(key) || {}), ...payload }));
    });
  };

  const applyLiveStatus = (item = {}) => {
    if (!isEmergencyItem(item)) return item;
    const keys = getHospitalKeys(item);
    const stored = keys.map((key) => state.liveStatusById.get(key)).find(Boolean);
    return stored ? { ...item, ...stored, isLocalCacheOnly: item.isLocalCacheOnly && !stored.emergencyBeds ? item.isLocalCacheOnly : false } : item;
  };

  const createEmergencyCacheIndex = (payload = {}) => {
    const rawEntries = payload.entries || payload.items || [];
    const entries = (Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries))
      .map(normalizeEmergencyCacheEntry)
      .filter((item) => item.id && item.name);
    const byId = new Map();
    const byName = new Map();
    entries.forEach((item) => {
      byId.set(item.id, item);
      byId.set(`emergency:${item.id}`, item);
      byId.set(`NMC_${item.id}`, item);
      const nameKey = normalizeMatchText(item.name);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
    });
    return { ...payload, entries, byId, byName };
  };

  const ensureEmergencyNationalCache = async () => {
    if (state.emergencyCacheReady && state.emergencyCache?.entries) return state.emergencyCache;
    if (state.emergencyCachePromise) return state.emergencyCachePromise;
    state.emergencyCachePromise = (async () => {
      try {
        const response = await fetch(EMERGENCY_NATIONAL_CACHE_URL, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`emergency cache ${response.status}`);
        state.emergencyCache = createEmergencyCacheIndex(await response.json());
        state.emergencyCacheReady = true;
      } catch (error) {
        state.emergencyCache = createEmergencyCacheIndex({ entries: {} });
        state.emergencyCacheReady = false;
      }
      return state.emergencyCache;
    })();
    return state.emergencyCachePromise;
  };

  const loadEmergencyNationalCache = async () => {
    await ensureEmergencyNationalCache();
    if (state.items.length) {
      state.items = mergeEmergencyCacheBasics(state.items);
      render();
    }
  };

  const getEmergencyCacheMatch = (item = {}) => {
    if (!state.emergencyCache) return null;
    const id = normalizeTextForCache(item.id || item.sourceId || item.hpid || '');
    if (id) {
      const match = state.emergencyCache.byId?.get(id) || state.emergencyCache.byId?.get(`emergency:${id}`) || state.emergencyCache.byId?.get(`NMC_${id}`);
      if (match) return match;
    }
    const nameKey = normalizeMatchText(item.name || '');
    return nameKey ? state.emergencyCache.byName?.get(nameKey) || null : null;
  };

  const mergeEmergencyCacheBasics = (items = []) => items.map((item) => {
    if (!isEmergencyItem(item)) return item;
    const cached = getEmergencyCacheMatch(item);
    if (!cached) return item;
    const hasItemCoords = hasMapCoordinates(item);
    const merged = {
      ...cached,
      ...item,
      sourceId: item.sourceId || item.id || cached.sourceId,
      id: item.id || cached.id,
      name: item.name || cached.name,
      address: item.address || cached.address,
      emergencyTel: item.emergencyTel || cached.emergencyTel,
      mainTel: item.mainTel || cached.mainTel,
      lat: cached.hasCoordinates ? cached.lat : item.lat,
      lng: cached.hasCoordinates ? cached.lng : item.lng,
      hasCoordinates: cached.hasCoordinates || hasItemCoords,
      isLocalCacheOnly: false,
      locationSourceMode: hasItemCoords ? item.locationSourceMode : 'local_emergency_cache',
    };
    if (!hasUsableDistance(merged.distanceM) && state.geo && merged.hasCoordinates) merged.distanceM = distanceBetweenM(state.geo, merged);
    return applyLiveStatus(merged);
  });

  const filterEmergencyCache = (options = {}) => {
    if (state.careMode !== 'emergency' || !state.emergencyCache?.entries?.length) return [];
    const { raw, full } = normalizeRegionForCache(elements.region?.value || getRegionLabel());
    const district = normalizeTextForCache(elements.district?.value || '');
    const shouldIgnoreKeyword = options.ignoreKeyword || state.keywordMode === 'place';
    const keyword = shouldIgnoreKeyword ? '' : normalizeMatchText(options.keyword ?? elements.keyword?.value ?? elements.mapKeyword?.value ?? '');
    const result = state.emergencyCache.entries.filter((item) => {
      const address = item.address || '';
      if (full && raw && !address.includes(full) && !address.includes(raw) && item.region !== full && item.region !== raw) return false;
      if (district && !address.includes(district) && item.district !== district) return false;
      if (keyword && !normalizeMatchText(`${item.name} ${item.address}`).includes(keyword)) return false;
      return true;
    }).map((item) => {
      const copy = applyLiveStatus({ ...item });
      if (state.geo && copy.hasCoordinates) copy.distanceM = distanceBetweenM(state.geo, copy);
      return copy;
    });
    return sortItems(result, elements.sort?.value || 'distance').slice(0, options.limit || 40);
  };


  const getTodayDayCode = (date = new Date()) => {
    const day = date.getDay();
    return String(day === 0 ? 7 : day);
  };

  const getNightCacheUrl = (mode = state.careMode, region = currentRegionName()) => (mode === 'pharmacy' ? NIGHT_PHARMACY_CACHE_URL(region) : NIGHT_HOSPITAL_CACHE_URL(region));

  const resolveCachePartUrl = (baseUrl, partFile) => {
    try {
      return new URL(partFile, new URL(baseUrl, window.location.origin)).toString();
    } catch (_) {
      const cleanBase = String(baseUrl || '').split('?')[0].replace(/[^/]+$/, '');
      return `${cleanBase}${partFile}`;
    }
  };

  const fetchCachePayload = async (url) => {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`cache ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload?.parts) && payload.parts.length) {
      const mergedEntries = {};
      for (const part of payload.parts) {
        const partUrl = resolveCachePartUrl(url, part.file || part.url || '');
        const partResponse = await fetch(partUrl, { cache: 'force-cache' });
        if (!partResponse.ok) throw new Error(`cache part ${partResponse.status}`);
        const partPayload = await partResponse.json();
        Object.assign(mergedEntries, partPayload.entries || {});
      }
      payload.entries = mergedEntries;
    }
    return payload;
  };

  
  const readOperationForDay = (entry = {}, dayCode = getTodayDayCode()) => {
    const byDay = entry.operationByDay || entry.weeklyHours || {};
    const day = byDay[String(dayCode)] || byDay[dayCode] || {};
    const openTime = normalizeTextForCache(day.open || day.openTime || entry.openTime || '');
    const closeTime = normalizeTextForCache(day.close || day.closeTime || entry.closeTime || '');
    const label = normalizeTextForCache(day.label || day.operationTime || entry.operationTime || formatTimeRange(openTime, closeTime));
    const openMinutes = Number.isFinite(Number(day.openMinutes)) ? Number(day.openMinutes) : parseTimeMinutes(openTime);
    const closeMinutes = Number.isFinite(Number(day.closeMinutes)) ? Number(day.closeMinutes) : parseTimeMinutes(closeTime);
    const isNightCandidate = Boolean(day.isNightCandidate) || (Number.isFinite(closeMinutes) && closeMinutes >= 18 * 60);
    const isAllNight = Boolean(day.isAllNight) || (Number.isFinite(closeMinutes) && (closeMinutes >= 24 * 60 || closeTime === '2400' || closeTime === '0000'));
    return {
      openTime,
      closeTime,
      operationTime: label,
      openMinutes: Number.isFinite(openMinutes) ? openMinutes : null,
      closeMinutes: Number.isFinite(closeMinutes) ? closeMinutes : null,
      isNightCandidate,
      isAllNight,
      statusLabel: normalizeTextForCache(day.statusLabel || entry.statusLabel || (isAllNight ? '심야 운영 참고' : isNightCandidate ? '야간 운영 참고' : label ? '운영시간 확인' : '전화 확인 필요')),
      statusTone: normalizeTextForCache(day.statusTone || entry.statusTone || (isNightCandidate || isAllNight ? 'good' : label ? 'neutral' : 'caution')),
    };
  };

  const parseTimeMinutes = (value) => {
    const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
    if (digits.length < 3) return NaN;
    const padded = digits.padStart(4, '0');
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2, 4));
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : NaN;
  };

  const formatTimeRange = (openTime, closeTime) => {
    const fmt = (value) => {
      const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
      if (!digits) return '';
      const padded = digits.padStart(4, '0');
      return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
    };
    const open = fmt(openTime);
    const close = fmt(closeTime);
    if (open && close) return `${open} ~ ${close}`;
    if (open) return `${open} 시작`;
    if (close) return `${close} 종료`;
    return '';
  };

  const normalizeNightCacheEntry = (entry = {}, mode = state.careMode, index = 0) => {
    const id = normalizeTextForCache(entry.id || entry.sourceId || entry.hpid || `${mode}-${index + 1}`);
    const lat = Number(entry.lat);
    const lng = Number(entry.lng);
    const regionHint = normalizeTextForCache(entry.sido || entry.region || inferSido(entry.address || ''));
    const hasCoordinates = validateCoordinatesForRegion(lat, lng, regionHint || entry.address || '');
    const operation = readOperationForDay(entry);
    const kind = mode === 'pharmacy' ? 'pharmacy' : 'hospital';
    const item = {
      id,
      sourceId: id,
      kind,
      type: kind,
      name: normalizeTextForCache(entry.name || entry.dutyName || (kind === 'pharmacy' ? '야간 약국' : '야간 병원')),
      address: normalizeTextForCache(entry.address || entry.dutyAddr || ''),
      region: regionHint,
      district: normalizeTextForCache(entry.sigungu || entry.district || ''),
      emergencyTel: '',
      mainTel: normalizeTextForCache(entry.mainTel || entry.dutyTel1 || entry.telno || ''),
      lat: hasCoordinates ? lat : null,
      lng: hasCoordinates ? lng : null,
      hasCoordinates,
      distanceM: null,
      emergencyBeds: null,
      totalBeds: null,
      hospitalType: normalizeTextForCache(entry.hospitalType || entry.dutyEmclsName || ''),
      department: normalizeTextForCache(entry.department || entry.dutyDivNam || ''),
      operationByDay: entry.operationByDay || entry.weeklyHours || {},
      operationTime: operation.operationTime,
      openTime: operation.openTime,
      closeTime: operation.closeTime,
      openMinutes: operation.openMinutes,
      closeMinutes: operation.closeMinutes,
      isNightCandidate: operation.isNightCandidate,
      isAllNight: operation.isAllNight,
      statusLabel: operation.statusLabel,
      statusTone: operation.statusTone,
      facilityStatus: [],
      facilityAvailableCount: 0,
      criticalCare: [],
      criticalAvailableCount: 0,
      messages: [],
      sourceMode: kind === 'pharmacy' ? 'local_night_pharmacy_cache' : 'local_night_hospital_cache',
      source: kind === 'pharmacy' ? 'LOCAL NIGHT PHARMACY CACHE' : 'LOCAL NIGHT HOSPITAL CACHE',
      updatedAt: normalizeTextForCache(entry.updatedAt || ''),
      isLocalCacheOnly: true,
    };
    if (state.geo && item.hasCoordinates) item.distanceM = distanceBetweenM(state.geo, item);
    return item;
  };

  const createNightCareCacheIndex = (payload = {}, mode = state.careMode) => {
    const rawEntries = payload.entries || payload.items || [];
    const entries = (Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries))
      .map((entry, index) => normalizeNightCacheEntry(entry, mode, index))
      .filter((item) => item.id && item.name);
    const byId = new Map();
    const byName = new Map();
    entries.forEach((item) => {
      byId.set(item.id, item);
      byId.set(`${mode}:${item.id}`, item);
      const nameKey = normalizeMatchText(item.name);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
    });
    return { ...payload, entries, byId, byName };
  };

  const ensureNightCareCache = async (mode = state.careMode) => {
    if (!['hospital', 'pharmacy'].includes(mode)) return createNightCareCacheIndex({ entries: {} }, mode);
    const region = currentRegionName();
    const cacheKey = `${mode}:${region}`;
    if (state.nightCaches[cacheKey]?.entries) return state.nightCaches[cacheKey];
    if (state.nightCachePromises[cacheKey]) return state.nightCachePromises[cacheKey];
    state.nightCachePromises[cacheKey] = (async () => {
      try {
        state.nightCaches[cacheKey] = createNightCareCacheIndex(await fetchCachePayload(getNightCacheUrl(mode, region)), mode);
        state.nightCacheReady[mode] = true;
      } catch (error) {
        state.nightCaches[cacheKey] = createNightCareCacheIndex({ entries: {} }, mode);
        state.nightCacheReady[mode] = false;
      }
      return state.nightCaches[cacheKey];
    })();
    return state.nightCachePromises[cacheKey];
  };

  const getNightCacheMatch = (item = {}, mode = state.careMode) => {
    const cache = state.nightCaches[`${mode}:${currentRegionName()}`];
    if (!cache) return null;
    const id = normalizeTextForCache(item.id || item.sourceId || item.hpid || '');
    if (id) {
      const match = cache.byId?.get(id) || cache.byId?.get(`${mode}:${id}`);
      if (match) return match;
    }
    const nameKey = normalizeMatchText(item.name || '');
    return nameKey ? cache.byName?.get(nameKey) || null : null;
  };

  const mergeNightCareCacheBasics = (items = [], mode = state.careMode) => items.map((item) => {
    if (isEmergencyItem(item)) return item;
    const cached = getNightCacheMatch(item, mode);
    if (!cached) return item;
    const hasItemCoords = hasMapCoordinates(item);
    const merged = {
      ...cached,
      ...item,
      sourceId: item.sourceId || item.id || cached.sourceId,
      id: item.id || cached.id,
      name: item.name || cached.name,
      address: item.address || cached.address,
      mainTel: item.mainTel || cached.mainTel,
      lat: cached.hasCoordinates ? cached.lat : item.lat,
      lng: cached.hasCoordinates ? cached.lng : item.lng,
      hasCoordinates: cached.hasCoordinates || hasItemCoords,
      operationTime: item.operationTime || cached.operationTime,
      openTime: item.openTime || cached.openTime,
      closeTime: item.closeTime || cached.closeTime,
      isNightCandidate: item.isNightCandidate || cached.isNightCandidate,
      isLocalCacheOnly: false,
      locationSourceMode: hasItemCoords ? item.locationSourceMode : cached.sourceMode,
    };
    if (!hasUsableDistance(merged.distanceM) && state.geo && merged.hasCoordinates) merged.distanceM = distanceBetweenM(state.geo, merged);
    return merged;
  });

  const filterNightCareCache = (options = {}) => {
    const mode = state.careMode;
    const cache = state.nightCaches[`${mode}:${currentRegionName()}`];
    if (!['hospital', 'pharmacy'].includes(mode) || !cache?.entries?.length) return [];
    const { raw, full } = normalizeRegionForCache(elements.region?.value || getRegionLabel());
    const district = normalizeTextForCache(elements.district?.value || '');
    const keyword = normalizeMatchText(options.keyword ?? elements.keyword?.value ?? elements.mapKeyword?.value ?? '');
    const department = normalizeMatchText(elements.department?.value || '');
    const result = cache.entries.filter((item) => {
      const address = item.address || '';
      if (full && raw && !address.includes(full) && !address.includes(raw) && item.region !== full && item.region !== raw) return false;
      if (district && !address.includes(district) && item.district !== district) return false;
      if (keyword && !normalizeMatchText(`${item.name} ${item.address}`).includes(keyword)) return false;
      if (department && !normalizeMatchText(`${item.department} ${item.hospitalType}`).includes(department)) return false;
      return true;
    }).map((item) => {
      const copy = { ...item };
      if (state.geo && copy.hasCoordinates) copy.distanceM = distanceBetweenM(state.geo, copy);
      return copy;
    });
    return sortItems(result, elements.sort?.value || 'night').slice(0, options.limit || 40);
  };


  const matchesCurrentRegion = (item = {}) => {
    const { raw, full } = normalizeRegionForCache(elements.region?.value || getRegionLabel());
    if (!raw && !full) return true;
    const haystack = `${item.region || ''} ${item.address || ''} ${item.district || ''}`;
    return haystack.includes(full) || haystack.includes(raw);
  };

  const hasMapCoordinates = (item) => {
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 32 && lat <= 39.8 && lng >= 123 && lng <= 132.5;
  };

  const mappableItems = (items = []) => items.filter(hasMapCoordinates);

  const getMapCenter = (items = state.items) => {
    const selected = state.selectedId ? items.find((item) => item.id === state.selectedId) : null;
    if (selected && hasMapCoordinates(selected)) {
      return { lat: Number(selected.lat), lng: Number(selected.lng) };
    }
    if (state.referencePoint && Number.isFinite(Number(state.referencePoint.lat)) && Number.isFinite(Number(state.referencePoint.lng))) return state.referencePoint;
    if (state.geo && Number.isFinite(Number(state.geo.lat)) && Number.isFinite(Number(state.geo.lng))) return state.geo;
    return REGION_CENTERS[getRegionLabel()] || REGION_CENTERS.서울;
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) || document.querySelector('script[data-kakao-map-sdk]');
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

  const clearKakaoOverlays = () => {
    state.kakaoOverlays.forEach((overlay) => overlay?.setMap?.(null));
    state.kakaoOverlays = [];
    state.kakaoReferenceOverlay?.setMap?.(null);
    state.kakaoReferenceOverlay = null;
  };

  const makeReferenceMarkerElement = () => {
    if (!state.referencePoint) return null;
    const marker = document.createElement('span');
    marker.className = `emergency-reference-marker ${state.referencePoint.type === 'current' ? 'is-current' : 'is-search'}`;
    marker.textContent = state.referencePoint.label || (state.referencePoint.type === 'current' ? '현재 위치' : '검색 위치');
    return marker;
  };

  const setMapFallbackMessage = (title, message) => {
    if (!elements.mapNotice) return;
    elements.mapNotice.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
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
        level: state.careMode === 'emergency' ? 6 : 5,
      });
      state.kakaoReady = true;
      elements.map.classList.remove('is-fallback');
      renderMap(state.items);
    } catch (error) {
      state.kakaoReady = false;
      state.map = null;
      elements.map?.classList.add('is-fallback');
      setMapFallbackMessage('지도 안내 모드', error?.message === 'NO_KAKAO_MAP_JS_KEY'
        ? 'KAKAO_MAP_JS_KEY를 설정하면 실제 카카오 지도가 표시됩니다.'
        : '카카오맵을 불러오지 못해 기본 지도 안내 모드로 표시합니다.');
      renderMap(state.items);
    }
  };

  const makeKakaoMarkerElement = (item, index) => {
    const button = document.createElement('button');
    const tone = item.statusTone || (Number(item.emergencyBeds) > 0 ? 'good' : 'neutral');
    button.type = 'button';
    button.className = `emergency-kakao-marker ${tone} ${state.selectedId === item.id ? 'selected' : ''}`;
    button.setAttribute('aria-label', item.name || meta().label);
    button.dataset.hospitalId = item.id || '';
    button.innerHTML = `<strong>${escapeHtml(markerText(item))}</strong>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      selectHospitalById(item.id, { move: true, mobileMode: 'half' });
    });
    return button;
  };

  const renderKakaoMap = (items) => {
    if (!state.kakaoReady || !state.map || !window.kakao?.maps) return false;
    clearKakaoOverlays();
    const center = getMapCenter(items);
    const validItems = mappableItems(items).slice(0, 40);

    if (typeof state.map.relayout === 'function') {
      state.map.relayout();
    }

    if (!items.length) {
      state.map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      state.map.setLevel(getRegionLabel() === '서울' ? 7 : 8);
      state.mapHasFitResults = false;
      return true;
    }

    if (!validItems.length) {
      state.map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      state.map.setLevel(getRegionLabel() === '서울' ? 7 : 8);
      setMapFallbackMessage('지도 위치 확인 필요', '좌표가 제공되지 않은 기관은 목록과 상세 정보에서 확인해 주세요.');
      return true;
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    let hasReference = false;
    if (state.referencePoint && Number.isFinite(Number(state.referencePoint.lat)) && Number.isFinite(Number(state.referencePoint.lng))) {
      const refPosition = new window.kakao.maps.LatLng(Number(state.referencePoint.lat), Number(state.referencePoint.lng));
      bounds.extend(refPosition);
      const refElement = makeReferenceMarkerElement();
      if (refElement) {
        state.kakaoReferenceOverlay = new window.kakao.maps.CustomOverlay({ position: refPosition, content: refElement, yAnchor: 1.2, zIndex: 40 });
        state.kakaoReferenceOverlay.setMap(state.map);
        hasReference = true;
      }
    }
    validItems.forEach((item, index) => {
      const position = new window.kakao.maps.LatLng(Number(item.lat), Number(item.lng));
      bounds.extend(position);
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        yAnchor: 1,
        zIndex: state.selectedId === item.id ? 30 : 20,
        content: makeKakaoMarkerElement(item, index),
      });
      overlay.setMap(state.map);
      state.kakaoOverlays.push(overlay);
    });

    const selected = validItems.find((item) => item.id === state.selectedId);
    if (state.selectionMove && selected) {
      const position = new window.kakao.maps.LatLng(Number(selected.lat), Number(selected.lng));
      if (typeof state.map.panTo === 'function') state.map.panTo(position);
      else state.map.setCenter(position);
      if (typeof state.map.getLevel === 'function' && state.map.getLevel() > 8) state.map.setLevel(6);
      state.selectionMove = false;
      state.mapHasFitResults = true;
    } else {
      const signature = [state.careMode, getRegionLabel(), elements.district?.value || '', state.referencePoint?.type || '', state.referencePoint?.lat || '', state.referencePoint?.lng || '', validItems.map((item) => item.id).join(',')].join('|');
      if (hasReference && state.referenceMove && state.referencePoint) {
        const refCenter = new window.kakao.maps.LatLng(Number(state.referencePoint.lat), Number(state.referencePoint.lng));
        if (typeof state.map.panTo === 'function') state.map.panTo(refCenter);
        else state.map.setCenter(refCenter);
        if (typeof state.map.getLevel === 'function' && state.map.getLevel() > 6) state.map.setLevel(5);
        state.referenceMove = false;
        state.mapHasFitResults = true;
        state.mapResultSignature = signature;
      } else if (!state.mapHasFitResults || state.mapResultSignature !== signature) {
        if (hasReference && state.referencePoint) {
          state.map.setCenter(new window.kakao.maps.LatLng(Number(state.referencePoint.lat), Number(state.referencePoint.lng)));
          if (typeof state.map.getLevel === 'function' && state.map.getLevel() > 6) state.map.setLevel(5);
        } else if (validItems.length > 1) {
          state.map.setBounds(bounds, 72, 72, 72, 72);
          if (getRegionLabel() === '서울' && typeof state.map.getLevel === 'function' && state.map.getLevel() > 7) {
            state.map.setLevel(7);
          }
        } else {
          const target = validItems[0];
          state.map.setCenter(new window.kakao.maps.LatLng(Number(target.lat), Number(target.lng)));
          state.map.setLevel(5);
        }
        state.mapHasFitResults = true;
        state.mapResultSignature = signature;
      }
    }

    setTimeout(() => {
      if (typeof state.map?.relayout === 'function') state.map.relayout();
      window.kakao?.maps?.event?.trigger?.(state.map, 'resize');
    }, 80);
    return true;
  };

  const formatCriticalSummary = (item) => {
    const { total, provided } = getCriticalCounts(item);
    if (!total) return '정보 없음';
    return `${provided}/${total}개 제공`;
  };

  const formatFacilitySummary = (item) => {
    const total = Array.isArray(item.facilityStatus) ? item.facilityStatus.length : 0;
    const good = Number(item.facilityAvailableCount || countGood(item.facilityStatus));
    if (!total) return '확인 필요';
    return `${good}/${total} 가능`;
  };

  const emergencyRankScore = (item) => {
    let score = 0;
    const beds = Number(item.emergencyBeds);
    if (Number.isFinite(beds) && beds > 0) score += Math.min(40, beds * 2);
    if (item.emergencyTel || item.mainTel) score += 14;
    if (hasMapCoordinates(item)) score += 10;
    if (getCriticalProvidedCount(item) > 0) score += 8;
    if (item.sourceMode === 'local_emergency_cache') score -= 2;
    return score;
  };

  const sortItems = (items, sort) => [...items].sort((a, b) => {
    if (sort === 'beds') return Math.max(0, numberOrNeg(b.emergencyBeds)) - Math.max(0, numberOrNeg(a.emergencyBeds)) || emergencyRankScore(b) - emergencyRankScore(a) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM);
    if (sort === 'phone') return Number(Boolean(b.emergencyTel || b.mainTel)) - Number(Boolean(a.emergencyTel || a.mainTel)) || emergencyRankScore(b) - emergencyRankScore(a) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM);
    if (sort === 'critical') return getCriticalProvidedCount(b) - getCriticalProvidedCount(a) || Math.max(0, numberOrNeg(b.emergencyBeds)) - Math.max(0, numberOrNeg(a.emergencyBeds)) || emergencyRankScore(b) - emergencyRankScore(a) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM);
    if (sort === 'night') return Number(Boolean(b.isNightCandidate)) - Number(Boolean(a.isNightCandidate)) || numberOrNeg(b.closeMinutes) - numberOrNeg(a.closeMinutes) || numberOrMax(a.distanceM) - numberOrMax(b.distanceM);
    return numberOrMax(a.distanceM) - numberOrMax(b.distanceM) || emergencyRankScore(b) - emergencyRankScore(a);
  });

  const renderSummary = (items) => {
    const count = items.length;
    const phoneCount = items.filter((item) => item.emergencyTel || item.mainTel).length;
    const nearest = items.find((item) => Number.isFinite(Number(item.distanceM)));
    if (state.careMode === 'emergency') {
      const withBeds = items.filter((item) => Number.isFinite(Number(item.emergencyBeds)) && Number(item.emergencyBeds) > 0).length;
      const criticalCount = items.filter((item) => getCriticalProvidedCount(item) > 0).length;
      const messageCount = items.filter((item) => Array.isArray(item.messages) && item.messages.length).length;
      elements.summaryCount.innerHTML = `<span>조회 후보</span><strong>${count.toLocaleString('ko-KR')}곳</strong><small>${escapeHtml(getRegionLabel())} · 응급실 상태 확인</small>`;
      elements.summaryBeds.innerHTML = `<span>가용 병상 표시</span><strong>${withBeds.toLocaleString('ko-KR')}곳</strong><small>공공데이터 기준 · 전화 확인 필요</small>`;
      elements.summaryPhone.innerHTML = `<span>전화 가능 후보</span><strong>${phoneCount.toLocaleString('ko-KR')}곳</strong><small>${nearest && hasUsableDistance(nearest.distanceM) ? `가까운 후보 ${formatDistanceSafe(nearest.distanceM)}` : '전화 확인 우선'}</small>`;
      if (elements.summaryStatus) elements.summaryStatus.innerHTML = `<span>중증·상태 정보</span><strong>${criticalCount.toLocaleString('ko-KR')}곳</strong><small>${messageCount ? `상태 메시지 ${messageCount}곳` : '병상 외 상태 정보 참고'}</small>`;
      return;
    }
    const nightCount = items.filter((item) => item.isNightCandidate).length;
    elements.summaryCount.innerHTML = `<span>조회 후보</span><strong>${count.toLocaleString('ko-KR')}곳</strong><small>${escapeHtml(getRegionLabel())} · ${escapeHtml(meta().label)} 확인</small>`;
    elements.summaryBeds.innerHTML = `<span>야간 운영 참고</span><strong>${nightCount.toLocaleString('ko-KR')}곳</strong><small>운영시간 기준 · 접수 마감 전화 확인</small>`;
    elements.summaryPhone.innerHTML = `<span>전화 가능 후보</span><strong>${phoneCount.toLocaleString('ko-KR')}곳</strong><small>${nearest && hasUsableDistance(nearest.distanceM) ? `가까운 후보 ${formatDistanceSafe(nearest.distanceM)}` : '전화 확인 우선'}</small>`;
    if (elements.summaryStatus) elements.summaryStatus.innerHTML = `<span>운영시간 표시</span><strong>${items.filter((item) => item.operationTime).length.toLocaleString('ko-KR')}곳</strong><small>공공데이터 기준 운영시간 참고</small>`;
  };

  const makeMapPosition = (item, index, total) => {
    if (hasMapCoordinates(item) && state.geo) {
      const dx = (Number(item.lng) - state.geo.lng) * 1200;
      const dy = (state.geo.lat - Number(item.lat)) * 1400;
      return { x: Math.min(88, Math.max(12, 50 + dx)), y: Math.min(86, Math.max(14, 50 + dy)) };
    }
    const base = [{ x: 28, y: 35 }, { x: 55, y: 48 }, { x: 72, y: 30 }, { x: 42, y: 66 }, { x: 63, y: 72 }, { x: 18, y: 60 }];
    return base[index % base.length] || { x: 50 + (index % Math.max(total, 1)) * 4, y: 50 };
  };

  const markerText = (item) => {
    if (isEmergencyItem(item)) return markerBedText(item.emergencyBeds);
    return item.operationTime ? item.operationTime.split('~').pop().trim() : '운영';
  };

  const renderMap = (items) => {
    if (elements.mapTitle) elements.mapTitle.textContent = `${state.summary.criteria || getRegionLabel()} ${meta().mapSuffix}`;
    const isIdle = state.dataMode === 'idle';
    if (elements.mapNotice) {
      const noCoordCount = items.length - mappableItems(items).length;
      const notice = noCoordCount > 0
        ? `좌표 없는 ${noCoordCount}곳은 목록에서만 확인해 주세요.`
        : (state.careMode === 'emergency'
          ? '중증·장비 상태도 참고용입니다. 방문 전 전화 확인이 필요합니다.'
          : '운영시간은 참고용입니다. 야간 접수와 조제 가능 여부는 전화 확인이 필요합니다.');
      elements.mapNotice.innerHTML = isIdle
        ? `<strong>조회 전</strong><span>확인 버튼을 누르면 실제 지도와 목록에 공공데이터 기준 후보를 표시합니다.</span>`
        : `<strong>공공데이터 기준</strong><span>${notice}</span>`;
    }

    const renderedKakao = renderKakaoMap(items);
    if (renderedKakao) {
      if (elements.markers) elements.markers.innerHTML = '';
      return;
    }

    clearKakaoOverlays();
    if (elements.map) elements.map.classList.add('is-fallback');
    const referenceHtml = state.referencePoint ? `<span class="emergency-reference-marker ${state.referencePoint.type === 'current' ? 'is-current' : 'is-search'}" style="left:50%;top:50%">${escapeHtml(state.referencePoint.label || '검색 위치')}</span>` : '';
    elements.markers.innerHTML = referenceHtml + items.slice(0, 12).map((item, index) => {
      const pos = makeMapPosition(item, index, items.length);
      const tone = item.statusTone || (Number(item.emergencyBeds) > 0 ? 'good' : 'neutral');
      return `<button type="button" class="emergency-map-marker ${escapeHtml(tone)} ${state.selectedId === item.id ? 'selected' : ''}" style="left:${pos.x}%;top:${pos.y}%" data-hospital-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}"><strong>${escapeHtml(markerText(item))}</strong></button>`;
    }).join('');
  };

  const renderStatusChips = (item) => {
    if (!isEmergencyItem(item)) {
      const chips = [
        item.operationTime ? { text: `운영 ${item.operationTime}`, tone: item.isNightCandidate ? 'good' : 'neutral' } : { text: '운영시간 전화 확인', tone: 'caution' },
        item.department ? { text: item.department, tone: 'neutral' } : null,
        item.hospitalType ? { text: item.hospitalType, tone: 'neutral' } : null,
      ].filter(Boolean).slice(0, 4);
      return `<div class="emergency-status-chip-row">${chips.map((chip) => `<span class="emergency-mini-chip ${escapeHtml(chip.tone || 'neutral')}">${escapeHtml(chip.text)}</span>`).join('')}</div>`;
    }
    const critical = getCriticalEntries(item).slice(0, 4).map((entry) => ({ text: `${entry.label} ${entry.statusLabel || (entry.tone === 'good' ? '제공됨' : '전화 확인')}`, tone: entry.tone }));
    const facility = (item.facilityStatus || []).slice(0, 3).map((entry) => ({ text: `${entry.label} ${entry.tone === 'good' ? '가능' : '확인'}`, tone: entry.tone }));
    const combined = [...critical, ...facility].slice(0, 6);
    if (!combined.length) combined.push({ text: '세부 상태 전화 확인', tone: 'neutral' });
    return `<div class="emergency-status-chip-row">${combined.map((chip) => `<span class="emergency-mini-chip ${escapeHtml(chip.tone || 'neutral')}">${escapeHtml(chip.text)}</span>`).join('')}</div>`;
  };

  const renderList = (items) => {
    elements.listSummary.textContent = items.length ? `조회 결과 ${items.length}곳` : '조회 전';
    if (elements.listTitle) elements.listTitle.textContent = meta().listLabel;
    if (!items.length) {
      elements.list.innerHTML = state.dataMode === 'idle'
        ? `<div class="hc-empty-state"><strong>조회 전입니다</strong><p>지도 위 검색창과 조건 버튼을 선택한 뒤 검색을 눌러 주세요.</p></div>`
        : `<div class="hc-empty-state"><strong>${escapeHtml(meta().label)} 정보를 찾지 못했습니다</strong><p>지역을 바꾸거나 긴급 상황이면 119 또는 기관 전화로 확인해 주세요.</p></div>`;
      if (elements.mobileResults) elements.mobileResults.innerHTML = elements.list.innerHTML;
      if (elements.mobileSheetTitle) elements.mobileSheetTitle.textContent = meta().listLabel;
      if (elements.mobileSheetSubtitle) elements.mobileSheetSubtitle.textContent = state.dataMode === 'idle' ? '검색하면 가까운 후보를 표시합니다.' : '조건에 맞는 후보가 없습니다.';
      return;
    }

    const compactCard = (item, index, options = {}) => {
      const isMobileCard = Boolean(options.mobile);
      const phone = item.emergencyTel || item.mainTel || '';
      const kakaoAction = getKakaoAction(item);
      const isEmergency = isEmergencyItem(item);
      const distanceText = formatDistanceSafe(item.distanceM);
      const primaryParts = isEmergency
        ? [formatBeds(item.emergencyBeds), distanceText]
        : [item.operationTime || '운영시간 전화 확인', distanceText];
      const primaryInfo = primaryParts.filter(Boolean).join(' · ');
      const phoneText = phone ? '전화 있음' : '전화 확인 필요';
      const locationText = hasMapCoordinates(item) ? '위치 확인' : '주소 확인 필요';
      const statusText = isEmergency
        ? formatCriticalSummary(item)
        : (item.isNightCandidate ? '야간 운영 참고' : '운영 확인 필요');
      const mapTone = hasMapCoordinates(item) ? 'good' : 'caution';
      return `<article class="parking-result-card emergency-hospital-card emergency-hospital-card--ev emergency-hospital-card--compact ${state.selectedId === item.id ? 'selected' : ''}" data-hospital-id="${escapeHtml(item.id)}">
        <div class="emergency-rank"><span>${index + 1}</span></div>
        <div class="emergency-main">
          <div class="parking-card-head emergency-title-row">
            <strong class="emergency-card-name">${escapeHtml(item.name || meta().label)}</strong>
            <span class="emergency-status ${escapeHtml(item.statusTone || 'neutral')}">${escapeHtml(item.statusLabel || '전화 확인 필요')}</span>
          </div>
          <p class="emergency-card-summary">${escapeHtml([primaryInfo, phoneText].filter(Boolean).join(' · '))}</p>
          <div class="emergency-status-chip-row emergency-status-chip-row--compact">
            <span class="emergency-mini-chip ${mapTone}">${escapeHtml(locationText)}</span>
            <span class="emergency-mini-chip neutral">${escapeHtml(statusText)}</span>
          </div>
        </div>
        <div class="parking-card-actions emergency-actions emergency-actions--compact">
          ${phone ? `<a class="primary-mini-link" href="${buildTelLink(phone)}">전화</a>` : '<span class="secondary-mini-link disabled">전화 확인</span>'}
          <a class="secondary-mini-link" href="${kakaoAction.url}" target="_blank" rel="noopener">${escapeHtml(kakaoAction.label)}</a>
          ${isMobileCard ? `<button type="button" class="secondary-mini-link as-button" data-detail-id="${escapeHtml(item.id)}">상세</button>` : ''}
        </div>
      </article>`;
    };

    elements.list.innerHTML = items.map((item, index) => compactCard(item, index, { mobile: false })).join('');
    if (elements.mobileResults) elements.mobileResults.innerHTML = items.map((item, index) => compactCard(item, index, { mobile: true })).join('');
    if (elements.mobileSheetTitle) elements.mobileSheetTitle.textContent = meta().listLabel;
    if (elements.mobileSheetSubtitle) elements.mobileSheetSubtitle.textContent = items.length ? `${items.length.toLocaleString('ko-KR')}곳 · 방문 전 전화 확인` : '검색하면 가까운 후보를 표시합니다.';
  };

  const renderWarnings = () => {
    const warnings = [...state.warnings];
    if (!warnings.length) {
      warnings.push(state.careMode === 'emergency'
        ? '응급실 가용 병상과 중증질환 수용가능정보는 제공 시점 기준입니다. 실제 수용 가능 여부는 반드시 전화로 확인해 주세요.'
        : '야간 병원·약국 운영시간은 공공데이터 기준 참고 정보입니다. 접수 마감과 조제 가능 여부는 반드시 전화로 확인해 주세요.');
    }
    elements.warningList.innerHTML = warnings.map((warning) => `<p>${escapeHtml(typeof warning === 'string' ? warning : warning.message || '확인 안내가 있습니다.')}</p>`).join('');
  };

  const renderStatusGroup = (title, items, emptyText) => {
    if (!Array.isArray(items) || !items.length) return `<div class="emergency-status-group"><h4>${escapeHtml(title)}</h4><p class="fine-print">${escapeHtml(emptyText)}</p></div>`;
    const normalized = items.map(normalizeCriticalEntry);
    return `<div class="emergency-status-group"><h4>${escapeHtml(title)}</h4><div class="emergency-status-chip-row detail">${normalized.slice(0, 10).map((entry) => `<span class="emergency-mini-chip ${escapeHtml(entry.tone || 'neutral')}">${escapeHtml(entry.label || '항목')} · ${escapeHtml(entry.statusLabel || '전화 확인')}</span>`).join('')}</div></div>`;
  };

  const renderMessages = (item) => {
    const messages = Array.isArray(item.messages) ? item.messages : [];
    if (!messages.length) return '<p class="fine-print">응급실·중증질환 메시지가 없거나 제공되지 않았습니다.</p>';
    return `<div class="emergency-message-box">${messages.map((message) => `<p><strong>${escapeHtml(message.type || '상태 메시지')}</strong>${escapeHtml(message.message || '전화 확인이 필요합니다.')}</p>`).join('')}</div>`;
  };

  const renderMapFloatingDetail = (item) => {
    if (!elements.mapDetail) return;
    if (!item || state.dataMode === 'idle') {
      elements.mapDetail.hidden = true;
      elements.mapDetail.innerHTML = '';
      return;
    }
    const phone = item.emergencyTel || item.mainTel || '';
    const kakaoAction = getKakaoAction(item);
    const distanceText = formatDistanceSafe(item.distanceM) || (state.geo ? '거리 계산 중' : '거리 정보 없음');
    const mapText = hasMapCoordinates(item) ? '지도에서 확인' : '주소 확인 필요';
    const bedsText = isEmergencyItem(item) ? formatBeds(item.emergencyBeds) : (item.operationTime || '운영시간 확인');
    const criticalText = isEmergencyItem(item) ? formatCriticalSummary(item) : '';
    const hasCriticalItems = isEmergencyItem(item) && getCriticalEntries(item).length > 0;
    const statusText = isEmergencyItem(item) ? criticalText : (item.isNightCandidate ? '야간 운영 참고' : '전화 확인');
    elements.mapDetail.hidden = false;
    elements.mapDetail.innerHTML = `
      <button class="map-selected-close" type="button" data-close-selected aria-label="선택 카드 닫기">×</button>
      <span class="map-selected-eyebrow">지도에서 선택한 기관</span>
      <h3>${escapeHtml(item.name || meta().label)}</h3>
      <p class="map-selected-address">${escapeHtml(item.address || '주소 정보 없음')}</p>
      <div class="map-selected-metrics">
        <div><span>${isEmergencyItem(item) ? '가용 병상' : '운영시간'}</span><strong>${escapeHtml(bedsText)}</strong></div>
        <div><span>전화</span><strong>${escapeHtml(phone || '전화 확인')}</strong></div>
        <div><span>${isEmergencyItem(item) ? '중증 항목' : '위치'}</span><strong>${escapeHtml(isEmergencyItem(item) ? statusText : mapText)}</strong>${isEmergencyItem(item) ? `<button type="button" class="metric-detail-link" data-critical-id="${escapeHtml(item.id)}" ${hasCriticalItems ? '' : 'disabled'}>항목 보기</button>` : ''}</div>
      </div>
      <div class="map-selected-actions">
        ${phone ? `<a class="primary-link" href="${buildTelLink(phone)}">전화하기</a>` : '<span class="primary-link disabled">전화 확인</span>'}
        <a class="secondary-link" href="${kakaoAction.url}" target="_blank" rel="noopener">${escapeHtml(kakaoAction.label)}</a>
        ${isMobileView() ? `<button class="secondary-link as-button mobile-detail-action" type="button" data-open-detail-id="${escapeHtml(item.id)}">상세보기</button>` : ''}
      </div>
      <p class="fine-print" style="margin:0.56rem 0 0">${escapeHtml(distanceText)} · ${escapeHtml(mapText === '지도에서 확인' ? '위치는 지도에서 확인' : '주소로 위치 확인 필요')} · 방문 전 전화 확인이 필요합니다.</p>`;
  };

  const renderDetail = (item) => {
    if (!elements.detail) return;
    if (!item || !state.detailOpen) {
      elements.detail.hidden = true;
      elements.detail.innerHTML = '';
      if (elements.mobileDetail) {
        elements.mobileDetail.hidden = true;
        elements.mobileDetail.innerHTML = '';
      }
      return;
    }
    elements.detail.hidden = false;
    if (elements.mobileDetail) elements.mobileDetail.hidden = false;
    const phone = item.emergencyTel || item.mainTel || '';
    const kakaoAction = getKakaoAction(item);
    const kakaoUrl = kakaoAction.url;
    const kakaoLabel = kakaoAction.label;
    const distanceText = formatDistanceSafe(item.distanceM) || '거리 정보 없음';
    const mapText = hasMapCoordinates(item) ? '지도에서 확인' : '주소 확인 필요';
    if (!isEmergencyItem(item)) {
      elements.detail.innerHTML = `<button class="map-selected-close detail-close" type="button" data-close-selected aria-label="상세 닫기">×</button><h3>${escapeHtml(item.name || meta().label)}</h3>
        <p class="emergency-detail-address">${escapeHtml(item.address || '주소 정보 없음')}</p>
        <div class="emergency-detail-grid">
          <div><span>운영시간</span><strong>${escapeHtml(item.operationTime || '전화 확인')}</strong></div>
          <div><span>기관 유형</span><strong>${escapeHtml(item.hospitalType || meta().label)}</strong></div>
          <div><span>전화</span><strong>${escapeHtml(phone || '전화 확인')}</strong></div>
          <div><span>거리</span><strong>${escapeHtml(distanceText)}</strong></div>
          <div><span>위치</span><strong>${escapeHtml(mapText)}</strong></div>
        </div>
        <div class="emergency-status-group"><h4>야간 방문 전 확인</h4><p class="fine-print">운영시간은 공공데이터 기준 참고 정보입니다. 접수 마감, 처방·조제 가능 여부, 휴게시간은 기관 전화로 다시 확인해 주세요.</p></div>
        <p class="fine-print">${escapeHtml(item.updatedAt ? `갱신 정보: ${item.updatedAt}` : '갱신 시점 정보가 없으면 기관에 직접 확인해 주세요.')}</p>
        <div class="emergency-detail-actions">
          ${phone ? `<a class="primary-link" href="${buildTelLink(phone)}">전화하기</a>` : ''}
          <a class="secondary-link" href="${kakaoUrl}" target="_blank" rel="noopener">${escapeHtml(kakaoLabel)}</a>
        </div>`;
      if (elements.mobileDetail) elements.mobileDetail.innerHTML = elements.detail.innerHTML;
      return;
    }
    elements.detail.innerHTML = `<button class="map-selected-close detail-close" type="button" data-close-selected aria-label="상세 닫기">×</button><h3>${escapeHtml(item.name || '응급의료기관')}</h3>
      <p class="emergency-detail-address">${escapeHtml(item.address || '주소 정보 없음')}</p>
      <div class="emergency-detail-grid">
        <div><span>가용 병상</span><strong>${formatBeds(item.emergencyBeds)}</strong></div>
        <div><span>중증 항목</span><strong>${escapeHtml(formatCriticalSummary(item))}</strong><button type="button" class="metric-detail-link" data-critical-id="${escapeHtml(item.id)}" ${getCriticalEntries(item).length ? '' : 'disabled'}>항목 보기</button></div>
        <div><span>전화</span><strong>${escapeHtml(phone || '전화 확인')}</strong></div>
        <div><span>거리</span><strong>${escapeHtml(distanceText)}</strong></div>
        <div><span>위치</span><strong>${escapeHtml(mapText)}</strong></div>
      </div>
      ${renderStatusGroup('중증 항목 제공 정보', item.criticalCare, '제공된 중증 항목이 없으면 119 또는 병원 전화로 확인해 주세요.')}
      ${renderStatusGroup('장비·시설 상태', item.facilityStatus, '장비·시설 상태 정보가 없으면 전화 확인이 필요합니다.')}
      <div class="emergency-status-group"><h4>응급실 메시지</h4>${renderMessages(item)}</div>
      <p class="fine-print">${escapeHtml(item.statusUpdatedAt || item.updatedAt ? `갱신 정보: ${item.statusUpdatedAt || item.updatedAt}` : '갱신 시점 정보가 없으면 병원에 직접 확인해 주세요.')}</p>
      <div class="emergency-detail-actions">
        ${phone ? `<a class="primary-link" href="${buildTelLink(phone)}">전화하기</a>` : ''}
        <a class="secondary-link" href="${kakaoUrl}" target="_blank" rel="noopener">${escapeHtml(kakaoLabel)}</a>
      </div>`;
    if (elements.mobileDetail) elements.mobileDetail.innerHTML = elements.detail.innerHTML;
  };

  const ensureCriticalPopup = () => {
    let popup = document.querySelector('#emergency-critical-popup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'emergency-critical-popup';
    popup.className = 'emergency-critical-popup';
    popup.hidden = true;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.innerHTML = `
      <section class="emergency-critical-popup__panel" role="document">
        <header><div><strong>중증 항목 제공 정보</strong><span>공공데이터 기준 참고 항목입니다.</span></div><button type="button" data-critical-close aria-label="중증 항목 닫기">×</button></header>
        <div class="emergency-critical-popup__body" data-critical-body></div>
      </section>`;
    document.body.appendChild(popup);
    popup.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target === popup || target?.closest('[data-critical-close]')) closeCriticalPopup();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !popup.hidden) closeCriticalPopup(); });
    return popup;
  };

  const closeCriticalPopup = () => {
    const popup = document.querySelector('#emergency-critical-popup');
    if (popup) popup.hidden = true;
    document.body.classList.remove('emergency-critical-popup-open');
  };

  const openCriticalPopup = (id) => {
    const item = state.items.find((entry) => entry.id === id) || null;
    const popup = ensureCriticalPopup();
    const body = popup.querySelector('[data-critical-body]');
    const entries = getCriticalEntries(item);
    const { total, provided } = getCriticalCounts(item);
    const summaryText = total ? `${provided}/${total}개 제공` : '정보 없음';
    const rows = entries.length ? entries.map((entry) => {
      const tone = escapeHtml(entry.tone || 'neutral');
      const label = escapeHtml(entry.label || '중증 항목');
      const value = escapeHtml(entry.statusLabel || '전화 확인');
      return `<li class="${tone}"><strong>${label}</strong><span>${value}</span></li>`;
    }).join('') : '<li class="neutral"><strong>제공 항목 없음</strong><span>119 또는 병원 전화로 확인해 주세요.</span></li>';
    body.innerHTML = `
      <p class="fine-print"><strong>제공 항목: ${escapeHtml(summaryText)}</strong></p>
      <p class="fine-print">${escapeHtml(item?.name || '선택한 기관')}의 중증질환 관련 공공데이터 제공 항목입니다. 실제 수용 가능 여부는 현장 상황에 따라 달라질 수 있으므로 방문 전 전화 확인이 필요합니다.</p>
      <ul>${rows}</ul>`;
    popup.hidden = false;
    document.body.classList.add('emergency-critical-popup-open');
  };

  const applyResultFilter = (items = []) => {
    if (state.resultFilter === 'beds') return items.filter((item) => Number(item.emergencyBeds) > 0);
    if (state.resultFilter === 'phone') return items.filter((item) => item.emergencyTel || item.mainTel);
    if (state.resultFilter === 'map') return items.filter(hasMapCoordinates);
    return items;
  };

  const getVisibleItems = () => applyResultFilter(state.items);

  const selectHospitalById = (id, options = {}) => {
    const item = getVisibleItems().find((entry) => entry.id === id) || state.items.find((entry) => entry.id === id);
    if (!item) return;
    state.selectedId = item.id;
    state.detailOpen = Boolean(options.openDetail);
    state.selectionMove = options.move !== false;
    render();
    if (isMobileView()) setEmergencyMobileSheetState(options.mobileMode || (options.openDetail ? 'expanded' : 'half'));
  };

  const openSelectedDetail = (id) => selectHospitalById(id, { move: false, openDetail: true, mobileMode: 'expanded' });

  const closeSelectedCard = () => {
    state.selectedId = '';
    state.detailOpen = false;
    state.selectionMove = false;
    closeCriticalPopup();
    if (elements.mapDetail) { elements.mapDetail.hidden = true; elements.mapDetail.innerHTML = ''; }
    if (elements.detail) { elements.detail.hidden = true; elements.detail.innerHTML = ''; }
    if (elements.mobileDetail) { elements.mobileDetail.hidden = true; elements.mobileDetail.innerHTML = ''; }
    render();
    if (isMobileView()) setEmergencyMobileSheetState('collapsed');
  };

  const render = () => {
    const items = getVisibleItems();
    const selected = state.selectedId ? (items.find((item) => item.id === state.selectedId) || null) : null;
    renderSummary(items);
    renderMap(items);
    renderList(items);
    renderWarnings();
    renderDetail(selected);
    renderMapFloatingDetail(selected);
  };

  const syncModeUi = () => {
    elements.modeTabs.forEach((button) => button.classList.toggle('active', button.dataset.careMode === state.careMode));
    if (elements.submit) elements.submit.textContent = meta().searchLabel;
    if (elements.department) {
      elements.department.closest('.form-row')?.classList.toggle('is-hidden', state.careMode === 'pharmacy' || state.careMode === 'emergency');
    }
    elements.quickButtons.forEach((button) => {
      const sort = button.dataset.emergencySort || button.dataset.emergencyMapSort || button.dataset.emergencyMobileSort;
      button.classList.toggle('is-hidden', (state.careMode === 'emergency' && sort === 'night') || (state.careMode !== 'emergency' && sort === 'critical') || (state.careMode !== 'emergency' && sort === 'beds'));
      button.classList.toggle('active', sort === (elements.sort?.value || 'distance'));
    });
    syncToolbarInputs();
  };

  const resetToIdle = () => {
    state.dataMode = 'idle';
    state.items = [];
    state.summary = { criteria: getRegionLabel() };
    state.warnings = [];
    state.selectedId = '';
    state.detailOpen = false;
    state.mapHasFitResults = false;
    state.mapResultSignature = '';
    state.selectionMove = false;
    state.referenceMove = false;
    syncModeUi();
    setStatus(`조건을 선택한 뒤 ${meta().searchLabel}를 눌러 주세요.`, 'info');
    render();
    elements.mobileSheet?.classList.remove('is-open', 'is-expanded');
    elements.mobileSheet?.classList.add('is-collapsed');
    if (elements.mobileListToggle) {
      elements.mobileListToggle.setAttribute('aria-expanded', 'false');
      elements.mobileListToggle.textContent = '목록 보기';
    }
  };

  const buildApiUrl = () => {
    const params = new URLSearchParams({
      region: elements.region?.value || '서울',
      district: elements.district?.value || '',
      keyword: state.keywordMode === 'place' ? '' : (elements.keyword?.value || ''),
      department: elements.department?.value || '',
      sort: elements.sort?.value || (state.careMode === 'emergency' ? 'distance' : 'night'),
      mode: state.careMode,
      _v: 'v101',
    });
    // 응급실 현재 위치/장소 검색은 거리 정렬 기준점입니다.
    // 서버 조회 범위를 구 주변으로 좁히지 않기 위해 응급실 모드에서는 좌표를 API 파라미터로 보내지 않습니다.
    if (state.geo && state.careMode !== 'emergency') {
      params.set('lat', String(state.geo.lat));
      params.set('lng', String(state.geo.lng));
    }
    return `/api/emergency-hospitals?${params.toString()}`;
  };


  const setRegionFromPlace = (place = {}) => {
    if (place.region1 && elements.region) elements.region.value = place.region1;
    if (place.region1 && elements.mapRegion) elements.mapRegion.value = place.region1;
    // 장소 검색 위치는 거리 정렬 기준점일 뿐입니다. 구 단위 필터로 자동 축소하지 않습니다.
    if (elements.district) elements.district.value = '';
    if (elements.mapDistrict) elements.mapDistrict.value = '';
    syncToolbarInputs();
  };

  const resolveSearchReferenceIfNeeded = async () => {
    const query = normalizeTextForCache(elements.keyword?.value || elements.mapKeyword?.value || '');
    if (!query || state.careMode !== 'emergency') {
      if (!query && state.referencePoint?.type === 'search') state.referencePoint = null;
      state.keywordMode = 'facility';
      return;
    }
    const directMatches = filterEmergencyCache({ keyword: query, limit: 2, ignoreKeyword: false });
    const medicalIntent = /(병원|의료원|응급|약국|센터|의대|성모|세브란스|서울대|고대|연세|삼성|아산)/.test(query);
    if (medicalIntent && directMatches.length) {
      state.keywordMode = 'facility';
      return;
    }
    try {
      const data = await fetchJson(`/api/kakao-local?query=${encodeURIComponent(query)}`, { timeoutMs: 6500, cache: 'no-store' });
      const place = Array.isArray(data?.documents) ? data.documents.find((doc) => Number.isFinite(Number(doc.lat)) && Number.isFinite(Number(doc.lng))) : null;
      if (!place) return;
      state.keywordMode = 'place';
      state.geo = { lat: Number(place.lat), lng: Number(place.lng) };
      state.referencePoint = { lat: Number(place.lat), lng: Number(place.lng), type: 'search', label: '검색 위치', name: place.name || query, query };
      state.referenceMove = true;
      setRegionFromPlace(place);
    } catch (_) {
      state.keywordMode = 'facility';
    }
  };

  const searchHospitals = async () => {
    if (state.loading) return;
    state.loading = true;
    state.mapHasFitResults = false;
    state.mapResultSignature = '';
    state.selectionMove = false;
    setStatus(`${meta().label} 정보를 불러오는 중입니다. 응급 상황이면 119에 먼저 연락하세요.`, 'info');
    if (state.careMode === 'emergency') {
      await ensureEmergencyNationalCache();
      // 장소명 검색은 후보 선택 팝업에서만 처리합니다.
    } else {
      await ensureNightCareCache(state.careMode);
    }
    await loadKakaoPlaceCache(state.careMode);
    const localFallback = state.careMode === 'emergency' ? filterEmergencyCache() : filterNightCareCache();
    if (localFallback.length) {
      state.dataMode = 'cache';
      state.items = localFallback;
      state.summary = { criteria: `${getRegionLabel()} 응급실 기본정보 캐시`, count: localFallback.length, sourceMode: 'local_emergency_cache' };
      state.warnings = ['응급실 기본정보와 지도 위치는 로컬 캐시 기준입니다. 실시간 병상·중증 정보는 공공데이터 응답으로 보강합니다.'];
      state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
      state.detailOpen = false;
      render();
    }
    try {
      const data = await fetchJson(buildApiUrl(), { cache: 'no-store' });
      if (data?.ok === false) throw Object.assign(new Error(data.message || `${meta().label} 정보를 불러오지 못했습니다.`), { data });
      state.dataMode = 'api';
      const rawApiItems = Array.isArray(data.items) ? data.items : [];
      const mergedApiItems = state.careMode === 'emergency' ? mergeEmergencyCacheBasics(rawApiItems) : mergeNightCareCacheBasics(rawApiItems, state.careMode);
      if (state.careMode === 'emergency') rememberLiveStatus(mergedApiItems);
      const apiItems = state.careMode === 'emergency' ? mergedApiItems.map(applyLiveStatus).filter(matchesCurrentRegion) : mergedApiItems;
      state.items = sortItems(apiItems.length ? apiItems : localFallback, elements.sort?.value || (state.careMode === 'emergency' ? 'distance' : 'night'));
      state.summary = data.summary || (localFallback.length ? { criteria: `${getRegionLabel()} 응급실 기본정보 캐시`, count: localFallback.length, sourceMode: 'local_emergency_cache' } : {});
      state.warnings = Array.isArray(data.warnings) ? data.warnings : [];
      if (!apiItems.length && localFallback.length) {
        state.dataMode = 'cache';
        state.warnings.push('실시간 응급실 상태 정보는 확인하지 못해 로컬 기본정보 캐시를 표시합니다. 방문 전 전화 확인이 필요합니다.');
      }
      state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
      state.detailOpen = false;
      const suffix = state.careMode === 'emergency' ? '중증·상태 정보도 방문 전 전화 확인이 필요합니다.' : '운영시간과 접수 마감은 방문 전 전화 확인이 필요합니다.';
      setStatus(`${state.items.length.toLocaleString('ko-KR')}곳의 ${meta().label} 정보를 확인했습니다. ${suffix}`, 'success');
      render();
    } catch (error) {
      const message = error?.data?.message || error?.message || `${meta().label} 정보를 불러오지 못했습니다.`;
      if (localFallback.length) {
        state.dataMode = 'cache';
        state.items = localFallback;
        state.summary = { criteria: `${getRegionLabel()} 응급실 기본정보 캐시`, count: localFallback.length, sourceMode: 'local_emergency_cache' };
        state.warnings = [message, '실시간 병상·중증 정보는 확인하지 못해 로컬 기본정보 캐시를 표시합니다. 실제 방문 전 전화 확인이 필요합니다.'];
        state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
        state.detailOpen = false;
        setStatus(`실시간 상태 정보는 확인하지 못했지만 ${localFallback.length.toLocaleString('ko-KR')}곳의 기본정보 캐시를 표시합니다.`, 'warning');
        render();
      } else {
        setStatus(`${message} 응급 상황이면 119에 먼저 연락해 주세요.`, 'error');
        state.warnings = [message, '실제 방문 전 전화 확인이 필요합니다.'];
        renderWarnings();
      }
    } finally {
      state.loading = false;
    }
  };


  const setEmergencyMobileSheetState = (mode = 'list') => {
    const sheet = elements.mobileSheet;
    if (!sheet) return;
    const normalizedMode = mode === 'half' ? 'list' : mode === 'expanded' ? 'detail' : mode === 'closed' ? 'collapsed' : mode;
    state.mobileSheetMode = normalizedMode;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700;
    const height = Math.min(Math.max(360, viewportHeight * 0.88), 760);
    const peek = 58;
    const collapsed = Math.max(0, height - peek);
    const list = Math.max(0, Math.min(collapsed, height - Math.min(viewportHeight * 0.48, height - 24)));
    const y = normalizedMode === 'detail' ? 0 : normalizedMode === 'collapsed' ? collapsed : list;
    sheet.style.setProperty('--parking-sheet-height', `${height}px`);
    sheet.style.setProperty('--parking-sheet-y', `${y}px`);
    sheet.dataset.sheetState = normalizedMode;
    sheet.classList.remove('is-open', 'is-expanded', 'is-collapsed', 'is-dragging', 'is-detail');
    if (normalizedMode === 'detail') sheet.classList.add('is-open', 'is-expanded', 'is-detail');
    else if (normalizedMode === 'collapsed') sheet.classList.add('is-collapsed');
    else sheet.classList.add('is-open');
    elements.mobileListToggle?.setAttribute('aria-expanded', normalizedMode !== 'collapsed' ? 'true' : 'false');
    if (elements.mobileListToggle) elements.mobileListToggle.textContent = normalizedMode === 'collapsed' ? '목록 보기' : '목록 접기';
  };

  const initEmergencyMobileSheetDrag = () => {
    const sheet = elements.mobileSheet;
    if (!sheet || sheet.dataset.dragReady === 'true') return;
    sheet.dataset.dragReady = 'true';
    const head = sheet.querySelector('.parking-mobile-sheet-head');
    const handle = sheet.querySelector('.parking-sheet-handle');
    const targets = [head, handle].filter(Boolean);
    let dragging = false;
    let startY = 0;
    let startSheetY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let pointerId = null;
    const positions = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight || 700;
      const h = Math.min(Math.max(360, vh * 0.88), 760);
      const collapsed = Math.max(0, h - 58);
      const half = Math.max(0, Math.min(collapsed, h - Math.min(vh * 0.48, h - 24)));
      return { h, expanded: 0, half, collapsed };
    };
    const currentY = () => {
      const p = positions();
      if (sheet.classList.contains('is-expanded')) return p.expanded;
      if (sheet.classList.contains('is-collapsed')) return p.collapsed;
      return p.half;
    };
    const applyY = (y) => {
      const p = positions();
      const next = clamp(y, p.expanded, p.collapsed);
      sheet.style.setProperty('--parking-sheet-height', `${p.h}px`);
      sheet.style.setProperty('--parking-sheet-y', `${next}px`);
      return next;
    };
    const interactive = (target) => target?.closest?.('button,a,input,select,textarea');
    const getY = (event) => event.clientY ?? event.touches?.[0]?.clientY ?? null;
    const start = (event) => {
      if (interactive(event.target)) return;
      const y = getY(event);
      if (y == null) return;
      dragging = true;
      pointerId = event.pointerId ?? null;
      startY = y;
      startSheetY = currentY();
      lastY = y;
      lastTime = performance.now();
      velocity = 0;
      sheet.classList.add('is-dragging');
      if (pointerId != null && event.currentTarget?.setPointerCapture) {
        try { event.currentTarget.setPointerCapture(pointerId); } catch (_) {}
      }
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', end, { passive: false });
      window.addEventListener('pointercancel', end, { passive: false });
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', end, { passive: false });
      event.preventDefault?.();
    };
    const move = (event) => {
      if (!dragging) return;
      const y = getY(event);
      if (y == null) return;
      const now = performance.now();
      velocity = (y - lastY) / Math.max(1, now - lastTime);
      lastY = y;
      lastTime = now;
      applyY(startSheetY + y - startY);
      event.preventDefault?.();
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('is-dragging');
      const p = positions();
      const y = applyY(startSheetY + lastY - startY + velocity * 120);
      const mode = [['expanded', Math.abs(y - p.expanded)], ['half', Math.abs(y - p.half)], ['collapsed', Math.abs(y - p.collapsed)]].sort((a,b) => a[1] - b[1])[0][0];
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      setEmergencyMobileSheetState(mode);
    };
    targets.forEach((target) => {
      if (window.PointerEvent) target.addEventListener('pointerdown', start, { passive: false });
      target.addEventListener('touchstart', start, { passive: false });
      target.addEventListener('click', () => { if (!dragging && sheet.classList.contains('is-collapsed')) setEmergencyMobileSheetState('half'); });
    });
    window.addEventListener('resize', () => { if (!dragging) setEmergencyMobileSheetState(state.mobileSheetMode || 'collapsed'); });
    window.addEventListener('orientationchange', () => window.setTimeout(() => setEmergencyMobileSheetState(state.mobileSheetMode || 'collapsed'), 220));
    setEmergencyMobileSheetState('collapsed');
  };

  const openMobileActionSheet = (title, options, currentValue, onSelect) => {
    document.querySelector('.emergency-action-sheet-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'emergency-action-sheet-backdrop';
    backdrop.innerHTML = `<section class="emergency-action-sheet" role="dialog" aria-modal="true"><header><strong>${escapeHtml(title)}</strong><button type="button" data-action-sheet-close>닫기</button></header><div class="emergency-action-sheet-list">${options.map((opt) => `<button type="button" data-action-sheet-value="${escapeHtml(opt.value)}" class="${opt.value === currentValue ? 'active' : ''}"><span>${escapeHtml(opt.label)}</span>${opt.value === currentValue ? '<strong>✓</strong>' : ''}</button>`).join('')}</div></section>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop || event.target.closest('[data-action-sheet-close]')) close(); });
    backdrop.querySelectorAll('[data-action-sheet-value]').forEach((button) => button.addEventListener('click', () => {
      onSelect(button.getAttribute('data-action-sheet-value'));
      close();
    }));
  };

  elements.mapModeToggle?.addEventListener('click', () => {
    if (isMobileView()) return openMobileActionSheet('확인 유형', [
      { value: 'emergency', label: '응급실' }, { value: 'hospital', label: '야간 병원' }, { value: 'pharmacy', label: '야간 약국' }
    ], state.careMode, (value) => { if (!MODE_META[value]) return; state.careMode = value; resetToIdle(); searchHospitals(); });
    toggleToolbarPanel(elements.mapModeToggle, elements.mapModePanel);
  });
  elements.mapRegionToggle?.addEventListener('click', () => {
    if (isMobileView()) return openMobileActionSheet('지역 선택', Object.keys(REGION_CENTERS).map((value) => ({ value, label: value })), getRegionLabel(), (value) => { if (elements.region) elements.region.value = value; if (elements.mapRegion) elements.mapRegion.value = value; if (elements.district) elements.district.value = ''; if (elements.mapDistrict) elements.mapDistrict.value = ''; state.referencePoint = null; state.geo = null; syncToolbarInputs(); searchHospitals(); });
    toggleToolbarPanel(elements.mapRegionToggle, elements.mapRegionPanel);
  });
  elements.mapSortToggle?.addEventListener('click', () => {
    if (isMobileView()) return openMobileActionSheet('정렬 기준', [
      { value: 'distance', label: '가까운 순' }, { value: 'beds', label: '병상 우선' }, { value: 'phone', label: '전화 우선' }, { value: 'critical', label: '중증 정보' }
    ], elements.sort?.value || 'distance', (value) => { if (elements.sort) elements.sort.value = value; syncModeUi(); if (state.items.length) { state.items = sortItems(state.items, value); state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : ''; render(); } });
    toggleToolbarPanel(elements.mapSortToggle, elements.mapSortPanel);
  });
  elements.mobileSortButton?.addEventListener('click', () => openMobileActionSheet('정렬 기준', [
    { value: 'distance', label: '가까운 순' }, { value: 'beds', label: '병상 우선' }, { value: 'phone', label: '전화 우선' }, { value: 'critical', label: '중증 정보' }
  ], elements.sort?.value || 'distance', (value) => { if (elements.sort) elements.sort.value = value; syncModeUi(); if (state.items.length) { state.items = sortItems(state.items, value); render(); } }));

  elements.mobileModeButton?.addEventListener('click', () => openMobileActionSheet('확인 유형', [
    { value: 'emergency', label: '응급실' }, { value: 'hospital', label: '야간 병원' }, { value: 'pharmacy', label: '야간 약국' }
  ], state.careMode, (value) => { if (!MODE_META[value]) return; state.careMode = value; resetToIdle(); searchHospitals(); }));

  elements.mobileRegionButton?.addEventListener('click', () => openMobileActionSheet('지역 선택', Object.keys(REGION_CENTERS).map((value) => ({ value, label: value })), getRegionLabel(), (value) => { if (elements.region) elements.region.value = value; if (elements.mapRegion) elements.mapRegion.value = value; if (elements.district) elements.district.value = ''; if (elements.mapDistrict) elements.mapDistrict.value = ''; state.referencePoint = null; state.geo = null; syncToolbarInputs(); searchHospitals(); }));

  elements.mobileFilterButton?.addEventListener('click', () => openMobileActionSheet('조건 필터', [
    { value: 'all', label: '전체 보기' }, { value: 'beds', label: '병상 정보 있음' }, { value: 'phone', label: '전화번호 있음' }, { value: 'map', label: '위치 확인 가능' }
  ], state.resultFilter, (value) => { state.resultFilter = value || 'all'; render(); }));

  elements.mapToolbarSearch?.addEventListener('submit', (event) => {
    event.preventDefault();
    syncFromToolbar();
    searchDestination(elements.keyword?.value || elements.mapKeyword?.value || '');
  });

  elements.mapRegionApply?.addEventListener('click', () => {
    syncFromToolbar();
    closeToolbarPopovers();
    searchHospitals();
  });

  elements.mapRegion?.addEventListener('change', () => { syncFromToolbar(); });
  elements.mapDistrict?.addEventListener('input', () => { if (elements.district) elements.district.value = elements.mapDistrict.value || ''; syncToolbarInputs(); });
  elements.mapKeyword?.addEventListener('input', () => { if (elements.keyword) elements.keyword.value = elements.mapKeyword.value || ''; });

  elements.mapModeButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.emergencyMapMode;
      if (!MODE_META[next]) return;
      state.careMode = next;
      if (state.careMode !== 'emergency' && ['beds', 'critical'].includes(elements.sort?.value)) elements.sort.value = 'night';
      if (state.careMode === 'emergency' && elements.sort?.value === 'night') elements.sort.value = 'distance';
      closeToolbarPopovers();
      resetToIdle();
      searchHospitals();
    });
  });

  elements.mapSortButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      const sort = button.dataset.emergencyMapSort;
      if (sort && elements.sort) elements.sort.value = sort;
      closeToolbarPopovers();
      syncModeUi();
      if (state.items.length) {
        state.items = sortItems(state.items, elements.sort.value || 'distance');
        state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
        render();
      }
    });
  });

  document.querySelectorAll('[data-emergency-mobile-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const sort = button.dataset.emergencyMobileSort;
      if (sort && elements.sort) elements.sort.value = sort;
      closeToolbarPopovers();
      syncModeUi();
      if (state.items.length) {
        state.items = sortItems(state.items, elements.sort.value || 'distance');
        state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
        render();
      }
    });
  });

  elements.mapLocation?.addEventListener('click', () => elements.location?.click());

  elements.mobileListToggle?.addEventListener('click', () => {
    const open = !elements.mobileSheet?.classList.contains('is-open');
    setEmergencyMobileSheetState(open ? 'half' : 'collapsed');
  });

  elements.mobileSheetMapButton?.addEventListener('click', () => setEmergencyMobileSheetState('collapsed'));

  [elements.list, elements.mobileResults].forEach((listEl) => listEl?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const detailButton = target.closest('[data-detail-id], [data-open-detail-id]');
    const detailId = detailButton?.getAttribute('data-detail-id') || detailButton?.getAttribute('data-open-detail-id');
    if (detailId) {
      event.preventDefault();
      openSelectedDetail(detailId);
      return;
    }
    if (target.closest('a')) return;
    const card = target.closest('[data-hospital-id]');
    const id = card?.getAttribute('data-hospital-id');
    if (!id) return;
    selectHospitalById(id, { move: true, mobileMode: 'half' });
  }));

  elements.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchDestination(elements.keyword?.value || elements.mapKeyword?.value || '');
  });

  elements.modeTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.careMode;
      if (!MODE_META[next]) return;
      state.careMode = next;
      if (state.careMode !== 'emergency' && ['beds', 'critical'].includes(elements.sort?.value)) elements.sort.value = 'night';
      if (state.careMode === 'emergency' && elements.sort?.value === 'night') elements.sort.value = 'distance';
      resetToIdle();
      searchHospitals();
    });
  });

  elements.location?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('이 브라우저에서는 현재 위치를 사용할 수 없습니다.', 'error');
      return;
    }
    setStatus('현재 위치 권한을 확인하는 중입니다.', 'info');
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = Number(position.coords.latitude);
      const lng = Number(position.coords.longitude);
      state.geo = { lat, lng };
      state.mapHasFitResults = false;
      state.mapResultSignature = '';
      state.referencePoint = { lat, lng, type: 'current', label: '현재 위치' };
      state.referenceMove = true;
      state.keywordMode = 'place';
      if (elements.sort) elements.sort.value = 'distance';
      // 현재 위치는 거리 계산 기준점입니다. 사용자가 고른 시도 범위는 자동 변경하지 않습니다.
      if (elements.district) elements.district.value = '';
      if (elements.mapDistrict) elements.mapDistrict.value = '';
      syncToolbarInputs();
      setStatus('현재 위치를 기준으로 가까운 응급실을 다시 정렬합니다.', 'success');
      searchHospitals();
    }, () => {
      setStatus('현재 위치를 가져오지 못했습니다. 지역 기준으로 조회해 주세요.', 'error');
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 180000 });
  });

  elements.quickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const sort = button.dataset.emergencySort || button.dataset.emergencyMapSort || button.dataset.emergencyMobileSort;
      if (sort && elements.sort) elements.sort.value = sort;
      syncModeUi();
      if (state.items.length) {
        state.items = sortItems(state.items, elements.sort?.value || 'distance');
        state.selectedId = state.items.some((item) => item.id === state.selectedId) ? state.selectedId : '';
        state.mapHasFitResults = false;
        render();
      }
    });
  });

  [elements.mapDetail, elements.detail, elements.mobileDetail].forEach((panel) => panel?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-close-selected]')) {
      closeSelectedCard();
      return;
    }
    const criticalButton = target?.closest('[data-critical-id]');
    const criticalId = criticalButton?.getAttribute('data-critical-id');
    if (criticalId) {
      event.preventDefault();
      openCriticalPopup(criticalId);
      return;
    }
    const button = target?.closest('[data-open-detail-id]');
    const id = button?.getAttribute('data-open-detail-id');
    if (id) openSelectedDetail(id);
  }));

  elements.markers?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-hospital-id]') : null;
    const id = target?.getAttribute('data-hospital-id');
    if (!id) return;
    selectHospitalById(id, { move: true, mobileMode: 'half' });
  });

  ['change', 'input'].forEach((eventName) => {
    elements.region?.addEventListener(eventName, () => { syncToolbarInputs(); });
    elements.district?.addEventListener(eventName, () => { syncToolbarInputs(); });
    elements.keyword?.addEventListener(eventName, () => { syncToolbarInputs(); });
    elements.sort?.addEventListener(eventName, () => { syncModeUi();  });
  });

  state.dataMode = 'cache';
  state.summary = { criteria: '서울' };
  state.selectedId = '';
  syncModeUi();
  initKakaoMap();
  loadKakaoPlaceCache();
  initEmergencyMobileSheetDrag();
  searchHospitals();
})();
