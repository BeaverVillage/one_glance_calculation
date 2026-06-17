import { distanceKm, estimateDrivingMinutes } from './distance.js';

const DEFAULT_MOBILITY_BASE = 'https://apis-navi.kakaomobility.com';
const DEFAULT_DESTINATIONS_PATH = '/v1/destinations/directions';
const MAX_DESTINATIONS = 30;

export async function resolveDrivingEstimates({ env = {}, origin = null, lots = [], priority = 'TIME' } = {}) {
  const candidates = Array.isArray(lots) ? lots.filter(hasCoordinate).slice(0, MAX_DESTINATIONS) : [];
  if (!origin || !hasCoordinate(origin) || !candidates.length) {
    return buildFallbackEstimates({ origin, lots: candidates, reason: origin ? '후보 주차장 좌표가 부족해 거리 기반 추정값을 사용합니다.' : '출발지가 없어 목적지 주변 거리 기반 추정값을 사용합니다.' });
  }

  const apiKey = env.KAKAO_MOBILITY_API_KEY || env.KAKAO_REST_API_KEY || '';
  if (!apiKey) {
    return buildFallbackEstimates({ origin, lots: candidates, reason: 'KAKAO_MOBILITY_API_KEY가 없어 직선거리 기반 차량 소요시간을 참고 추정합니다.' });
  }

  const base = (env.KAKAO_MOBILITY_API_BASE || DEFAULT_MOBILITY_BASE).replace(/\/$/, '');
  const path = env.KAKAO_MOBILITY_DESTINATIONS_PATH || DEFAULT_DESTINATIONS_PATH;
  const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
  const body = {
    origin: { x: String(origin.lng), y: String(origin.lat), name: origin.name || '출발지' },
    destinations: candidates.map((lot) => ({ key: lot.id, x: String(lot.lng), y: String(lot.lat), name: lot.name || lot.id })),
    radius: clampInt(env.KAKAO_MOBILITY_RADIUS_METERS, 5000, 1000, 10000),
    priority: priority === 'DISTANCE' ? 'DISTANCE' : 'TIME'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `KakaoAK ${apiKey}`
      },
      body: JSON.stringify(body),
      cf: { cacheTtl: cacheTtl(env), cacheEverything: true }
    });
    if (!res.ok) throw new Error(`Kakao Mobility 다중 목적지 길찾기 호출 실패: ${res.status}`);
    const data = await res.json();
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    const estimates = routes
      .map(normalizeMobilityRoute)
      .filter(Boolean);
    if (!estimates.length) {
      return buildFallbackEstimates({ origin, lots: candidates, reason: 'Kakao Mobility 응답에서 경로 요약을 찾지 못해 거리 기반 추정값을 사용합니다.' });
    }
    const found = new Set(estimates.map((item) => item.parkingLotId));
    const fallback = candidates
      .filter((lot) => !found.has(lot.id))
      .map((lot) => fallbackEstimate(origin, lot, '일부 후보는 경로 응답이 없어 거리 기반 추정값을 사용합니다.'));
    return {
      estimates: [...estimates, ...fallback],
      meta: {
        mode: 'kakao-mobility-destinations',
        source: 'Kakao Mobility 다중 목적지 길찾기',
        note: 'Kakao Mobility 길찾기 API로 출발지에서 주차장 후보까지의 차량 소요시간을 참고 계산했습니다.',
        requestedCount: candidates.length,
        resolvedCount: estimates.length,
        errors: []
      }
    };
  } catch (error) {
    const fallback = buildFallbackEstimates({ origin, lots: candidates, reason: error?.message || 'Kakao Mobility 호출 실패로 거리 기반 추정값을 사용합니다.' });
    return {
      ...fallback,
      meta: {
        ...fallback.meta,
        errors: [{ name: 'kakao-mobility', message: error?.message || String(error) }]
      }
    };
  }
}

export function buildFallbackEstimates({ origin = null, lots = [], reason = '거리 기반 추정값을 사용합니다.' } = {}) {
  const estimates = (Array.isArray(lots) ? lots : [])
    .filter(hasCoordinate)
    .map((lot) => fallbackEstimate(origin, lot, reason));
  return {
    estimates,
    meta: {
      mode: 'distance-fallback',
      source: '거리 기반 추정',
      note: reason,
      requestedCount: lots.length || 0,
      resolvedCount: estimates.length,
      errors: []
    }
  };
}

function fallbackEstimate(origin, lot, reason) {
  const km = origin && hasCoordinate(origin) ? distanceKm(origin, lot) : Number(lot.distanceFromDestinationKm || 0);
  const distance = Number.isFinite(km) ? Math.round(km * 10) / 10 : null;
  const minutes = Number.isFinite(km) ? estimateDrivingMinutes(km) : null;
  return {
    parkingLotId: lot.id,
    durationMinutes: minutes,
    distanceKm: distance,
    mode: 'distance-fallback',
    source: '거리 기반 추정',
    note: reason
  };
}

function normalizeMobilityRoute(route) {
  const key = route?.key;
  const summary = route?.summary || {};
  const seconds = Number(summary.duration);
  const meters = Number(summary.distance);
  if (!key || !Number.isFinite(seconds) || !Number.isFinite(meters)) return null;
  return {
    parkingLotId: key,
    durationMinutes: Math.max(1, Math.round(seconds / 60)),
    distanceKm: Math.round((meters / 1000) * 10) / 10,
    durationSeconds: seconds,
    distanceMeters: meters,
    mode: 'kakao-mobility',
    source: 'Kakao Mobility',
    note: route.result_msg || 'Kakao Mobility 길찾기 요약'
  };
}

function hasCoordinate(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cacheTtl(env) {
  const ttl = Number.parseInt(env.KAKAO_MOBILITY_CACHE_TTL_SECONDS || env.PARKING_ROUTE_CACHE_TTL_SECONDS || '120', 10);
  return Number.isFinite(ttl) ? Math.max(0, ttl) : 120;
}
