# 주차비 계산 지도 1차 MVP 운영 메모

## 2차 MVP에서 추가된 기능

- 서울 열린데이터 `GetParkInfo` 어댑터 구조
- 공공데이터포털 주차장 API endpoint 지정형 어댑터 구조
- 공영/무료/일주차/운영 중/할인 가능 필터
- 선택한 입차·출차 시간 기준 운영시간 판정
- 경차/장애인/전기차/직접 할인율 참고 계산과 카드 내 표시

## 1차 MVP에서 제공하는 기능

- 목적지 검색 또는 샘플 목적지 선택
- 샘플/로컬 주차장 데이터 기반 예상 주차비 계산
- 30분, 1시간, 2시간, 3시간, 4시간, 일주차 빠른 계산
- 기본요금 + 추가요금 + 일 최대 요금 비교
- 경차, 장애인, 전기차, 직접 입력 할인율 참고 계산
- 지도 가격 마커와 추천 주차장 카드 표시
- 데이터 신뢰도와 실시간 정보 유무 표시
- 카카오맵 SDK 실패 시 샘플 지도 fallback 표시

## 카카오맵 설정

키 탐색 순서는 `window.HANNUNCALC_CONFIG.KAKAO_MAP_JS_KEY`, `<meta name="kakao-map-js-key">`, `/api/parking/config`입니다. 정적 배포만 사용하는 경우 `assets/config/public-config.js`를 배포 환경에서 생성하거나 대체해 공개 가능한 JavaScript 키만 주입할 수 있습니다.


1차 MVP에서 실제 카카오맵을 표시하려면 `KAKAO_MAP_JS_KEY`가 필요합니다. 이 키는 Kakao Developers에서 발급받은 JavaScript 키여야 합니다. REST API 키를 지도 SDK appkey로 사용하면 안 됩니다.

Kakao Developers > 내 애플리케이션 > 앱 설정 > 플랫폼 > Web 플랫폼에 아래 도메인을 등록해야 합니다.

- https://hannuncalc.com
- Cloudflare Pages 기본 도메인
- 로컬 테스트 도메인

## 향후 확장 TODO

### 2차

- 완료: 공공데이터 주차장 API/데이터 어댑터 골격
- 완료: 공영/무료/일주차/운영 중/할인 가능 필터
- 완료: 차량 할인 계산 카드 표시 고도화
- 완료: 일정 기반 운영시간 판정
- 남은 작업: 실제 전국 데이터 endpoint별 필드 매핑 검증과 캐시 정책 고도화

### 3차

- 완료: Kakao Mobility 다중 목적지 길찾기 proxy 구조
- 완료: 출발지 기준 차량 소요시간/거리 추천점수 반영
- 완료: 차량시간순 정렬에 실제/추정 차량 소요시간 사용
- 남음: 실제 API 키 배포 후 실호출 검증, 캐시/쿼터 정책 고도화

### 4차

- 서울 실시간 빈자리
- 만차 위험도 실시간화
- 실시간 배지

## 운영 주의

현재 화면은 참고용 예상 계산 서비스입니다. 실제 주차요금, 할인 적용 여부, 운영시간, 주차 가능 여부를 보장하지 않습니다. 사용자 화면에서도 이 점을 명확히 안내해야 합니다.

## 사용자 화면 표시 원칙

사용자 화면에는 2차~4차 기능을 확정 기능처럼 표시하지 않습니다. 1차 MVP에서는 샘플/로컬 데이터 기반 예상 주차비, 지도 가격 마커, 추천 카드, 데이터 신뢰도만 명확히 제공합니다.


## 공공데이터 어댑터 운영 메모

서울 열린데이터광장 키가 있으면 `functions/api/parking/_lib/adapters.js`가 `GetParkInfo` 데이터를 표준 주차장 모델로 변환합니다. 공공데이터포털 API는 기관별 필드명이 달라질 수 있으므로 `PUBLIC_DATA_PARKING_API_URL`을 endpoint별로 지정하고 응답 필드 매핑을 검증해야 합니다. 키가 없거나 호출이 실패하면 샘플 데이터로 자동 전환됩니다.

## 2차 후속 마감: 서울 실시간 주차대수 adapter

이번 후속 단계에서는 서울시 시영주차장 실시간 주차대수 정보 API를 연결할 수 있는 adapter를 추가했다.

- 기본 service name: `GetParkingInfo`
- 환경변수: `SEOUL_REALTIME_PARKING_API_NAME`, `PARKING_REALTIME_CACHE_TTL_SECONDS`
- 매칭 기준: `PARKING_CODE` ↔ 내부 `realtimeKey`, 보조로 주차장명 정규화 매칭
- 반영 위치: `/api/parking/recommend`, `/api/parking/realtime`
- fallback: API 키가 없거나 호출 실패 시 기존 샘플 실시간 데이터 사용

주의: 서울 열린데이터광장 데이터셋 설명처럼 실시간 주차가능대수는 실제 데이터와 5분 이상 차이가 날 수 있으므로 화면에서는 계속 참고용으로 표시한다.

### 2차 후속 TODO

- 실제 `SEOUL_OPEN_API_KEY`로 배포 환경에서 `GetParkingInfo` 필드명 검증
- 주차장명/코드 매칭 실패 항목 로깅 및 관리자 점검 도구 추가
- 시영주차장 외 민영/구영 실시간 데이터 소스 분리
- API 응답 실패율에 따른 cache TTL/재시도 정책 고도화

## 3차 후속: 공휴일/운영시간 판정 보강

- `functions/api/parking/_lib/holidays.js`에서 한국천문연구원 특일 정보 `getRestDeInfo` 호출 구조를 추가했다.
- `HOLIDAY_API_KEY` 또는 `PUBLIC_DATA_API_KEY`가 있으면 방문일의 공휴일 여부를 확인하고, 공휴일이면 `holidayOpen`/`holidayClose` 기준으로 운영시간을 판정한다.
- 키가 없거나 호출이 실패하면 토요일/일요일 기준 fallback으로 안전하게 계산한다.
- `/api/parking/holidays?date=YYYY-MM-DD` 점검 endpoint를 추가했다.
- 공휴일 API 결과는 `HOLIDAY_API_CACHE_TTL_SECONDS` 기준으로 캐시할 수 있다.
- 실제 주차장 운영시간은 공휴일·임시공휴일·현장 사정에 따라 달라질 수 있으므로 UI 문구는 계속 참고용으로 유지한다.

남은 후속 과제:
- 실제 `HOLIDAY_API_KEY`를 Cloudflare Pages에 넣고 2026~2027 주요 공휴일 실호출 검증
- 주차장별 휴무일/명절 특별 운영 예외 필드 대응
- 공휴일 API 장애 시 로컬 공휴일 캐시 JSON 생성 자동화


## Kakao Mobility 단계 메모

- `KAKAO_MOBILITY_API_KEY` 또는 `KAKAO_REST_API_KEY`는 Cloudflare Pages Functions에서만 사용한다.
- 프론트엔드에는 REST API Key를 노출하지 않는다.
- `/api/parking/recommend`는 후보 주차장을 최대 30개까지 Kakao Mobility 다중 목적지 길찾기 proxy에 전달할 수 있다.
- 키가 없거나 API 호출이 실패하면 거리 기반 추정값으로 안전하게 fallback한다.
- 화면에는 `Kakao Mobility` 또는 `거리 기반 추정`을 명확히 표시한다.
