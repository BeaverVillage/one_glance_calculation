# 생활지도 3종 12차 배포 프리플라이트

## 목적

12차 작업은 낚시터 찾기, 무료 와이파이 찾기, 공중화장실 찾기 3개 생활지도 기능을 배포하기 전 브라우저 런타임과 정적 호스팅 캐시 정책을 안정화하는 단계입니다.

## 변경 내용

### 1. 생활지도 JSON fetch 캐시 정책 개선

기존에는 생활지도 JSON을 가져올 때 `cache: 'no-store'`를 사용했습니다. 이 방식은 항상 최신 파일을 받는 장점은 있지만, 무료 와이파이와 공중화장실처럼 JSON 파일이 많은 지도 기능에서는 재방문·지역 전환 시 불필요한 네트워크 요청이 늘어날 수 있습니다.

12차에서는 생활지도 정적 JSON은 브라우저 기본 캐시를 사용하도록 바꾸고, `/api/config` 요청만 `no-store`로 유지했습니다.

- 정적 JSON: `cache: 'default'`
- API 설정: `cache: 'no-store'`
- 캐시 무효화: `?v=20260623-v121-life-map-mobile-filter-sort` 버전 쿼리 사용

### 2. `_headers` 배포 캐시 정책 추가

생활지도 로컬 JSON 캐시는 버전 쿼리로 관리되므로 정적 호스팅에서 장기 캐시를 적용할 수 있습니다.

```text
/assets/data/life/*
  Cache-Control: public, max-age=31536000, immutable

/api/*
  Cache-Control: no-store
```

HTML, sitemap, robots, ads.txt는 즉시 재검증하도록 유지했습니다.

### 3. 낚시터 카카오맵 링크 중복 반환 정리

낚시터 지도 JS의 카카오맵 검색 fallback 링크 생성 함수에 중복 `return`이 남아 있어 제거했습니다. 동작상 치명적인 오류는 아니지만, 배포 전 코드 품질을 정리했습니다.

### 4. 신규 프리플라이트 검증 스크립트 추가

추가 파일:

```text
scripts/verify-life-map-release-preflight.js
scripts/verify-life-map-release-preflight-windows.cmd
```

검증 항목:

- 생활지도 3종 HTML/JS/캐시 존재
- v118 버전 쿼리 적용
- 정적 JSON fetch는 기본 캐시 사용
- `/api/config`는 no-store 유지
- 생활지도 JSON 캐시용 `_headers` 정책 존재
- 마커 수 제한, requestId 레이스 방지 존재
- 배포 제외 파일 포함 여부 확인
- 단일 파일 25MB 초과 여부 확인

## 실행 명령

```powershell
node scripts\verify-life-map-release-preflight.js
```

또는 Windows cmd:

```cmd
scripts\verify-life-map-release-preflight-windows.cmd
```
