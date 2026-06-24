(() => {
  const normalizeConfidence = (value) => String(value || '').toLowerCase();
  const normalizeKey = (value) => String(value || '').trim();
  const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const getMode = (item = {}, options = {}) => normalizeText(options.mode || item.kind || item.type || item.mode || '').toLowerCase();

  const toCanonicalMatch = (match = null) => {
    if (!match || typeof match !== 'object') return null;
    const kakaoPlaceUrl = match.kakaoPlaceUrl || match.placeUrl || match.kakaoPlace_url || match.kakao?.place_url || '';
    const kakaoPlaceId = match.kakaoPlaceId || match.placeId || match.id || '';
    const confidence = normalizeConfidence(match.confidence || match.matchConfidence || match.kakaoMatchConfidence || match.kakaoMatchType || match.matchType || '');
    return {
      ...match,
      kakaoPlaceId,
      kakaoPlaceUrl,
      confidence: confidence === 'matched' ? 'high' : confidence === 'low_confidence' ? 'low' : confidence,
    };
  };

  const canUseDirectLink = (match, options = {}) => {
    const canonical = toCanonicalMatch(match);
    if (!canonical || !canonical.kakaoPlaceUrl) return false;
    const confidence = normalizeConfidence(canonical.confidence);
    const allowMedium = options.allowMedium !== false;
    return confidence === 'high' || (allowMedium && confidence === 'medium');
  };

  const buildSearchUrl = (item = {}) => {
    const name = normalizeText(item.name || item.placeName || item.hospitalName || item.pharmacyName || '');
    const address = normalizeText(item.address || item.roadAddress || item.addr || '');
    return `https://map.kakao.com/link/search/${encodeURIComponent(`${name} ${address}`.trim())}`;
  };

  const buildCandidateKeys = (item = {}, options = {}) => {
    const mode = getMode(item, options);
    const id = normalizeKey(item.id || item.sourceId || item.hpid || item.raw?.hpid || '');
    const name = normalizeText(item.name || '');
    const address = normalizeText(item.address || '');
    const keys = [];
    const push = (value) => {
      const key = normalizeKey(value);
      if (key && !keys.includes(key)) keys.push(key);
    };
    push(id);
    if (mode && id) push(`${mode}:${id}`);
    if (mode && id) push(`${mode}_${id}`);
    if (id) push(`NMC_${id}`);
    if (mode && id) push(`NMC_${mode}_${id}`);
    if (name && address) push(`${mode}:${name}:${address}`);
    if (name) push(`${mode}:${name}`);
    return keys;
  };

  const createIndex = (payload = {}) => {
    const rawEntries = payload.entries || payload.matches || {};
    const index = {};
    const put = (key, value) => {
      const normalized = normalizeKey(key);
      if (normalized && value && !index[normalized]) index[normalized] = toCanonicalMatch(value);
    };
    if (Array.isArray(rawEntries)) {
      rawEntries.forEach((entry) => {
        if (!entry) return;
        put(entry.cacheKey, entry);
        put(entry.sourceKey, entry);
        put(entry.sourceId, entry);
        if (entry.type && entry.sourceId) put(`${entry.type}:${entry.sourceId}`, entry);
        if (entry.type && entry.sourceId) put(`${entry.type}_${entry.sourceId}`, entry);
        if (entry.sourceId) put(`NMC_${entry.sourceId}`, entry);
      });
    } else {
      Object.entries(rawEntries).forEach(([key, entry]) => {
        if (!entry) return;
        put(key, entry);
        put(entry.cacheKey, entry);
        put(entry.sourceKey, entry);
        put(entry.sourceId, entry);
        if (entry.type && entry.sourceId) put(`${entry.type}:${entry.sourceId}`, entry);
        if (entry.type && entry.sourceId) put(`${entry.type}_${entry.sourceId}`, entry);
        if (entry.sourceId) put(`NMC_${entry.sourceId}`, entry);
      });
    }
    return { ...payload, index };
  };

  const resolveRelativeUrl = (baseUrl, partFile) => {
    try {
      return new URL(partFile, new URL(baseUrl, window.location.origin)).toString();
    } catch (_) {
      const cleanBase = String(baseUrl || '').split('?')[0].replace(/[^/]+$/, '');
      return `${cleanBase}${partFile}`;
    }
  };

  const loadCache = async (url, options = {}) => {
    try {
      const response = await fetch(url, { cache: options.cache || 'no-store' });
      if (!response.ok) throw new Error(`cache ${response.status}`);
      const payload = await response.json();
      if (Array.isArray(payload?.parts) && payload.parts.length) {
        const mergedEntries = {};
        for (const part of payload.parts) {
          const partUrl = resolveRelativeUrl(url, part.file || part.url || '');
          const partResponse = await fetch(partUrl, { cache: options.cache || 'no-store' });
          if (!partResponse.ok) throw new Error(`cache part ${partResponse.status}`);
          const partPayload = await partResponse.json();
          Object.assign(mergedEntries, partPayload.entries || {});
        }
        payload.entries = mergedEntries;
      }
      return createIndex(payload);
    } catch (error) {
      return {
        version: 'cache-unavailable',
        meta: { status: 'unavailable', message: error?.message || String(error) },
        entries: {},
        index: {},
      };
    }
  };

  const findMatch = (cache, item = {}, options = {}) => {
    if (!cache) return null;
    const index = cache.index || createIndex(cache).index || {};
    const keys = buildCandidateKeys(item, options);
    for (const key of keys) {
      if (index[key]) return index[key];
    }
    return null;
  };

  const getAction = (item = {}, match = null, options = {}) => {
    const canonical = toCanonicalMatch(match);
    const direct = canUseDirectLink(canonical, options);
    return {
      type: direct ? 'place' : 'search',
      label: direct ? '카카오맵 바로가기' : '카카오맵 검색',
      url: direct ? canonical.kakaoPlaceUrl : buildSearchUrl(item),
      confidence: normalizeConfidence(canonical?.confidence || 'none'),
      placeId: canonical?.kakaoPlaceId || '',
    };
  };

  window.HannunKakaoPlaceLink = {
    canUseDirectLink,
    buildSearchUrl,
    buildCandidateKeys,
    createIndex,
    findMatch,
    getAction,
    loadCache,
  };
})();
