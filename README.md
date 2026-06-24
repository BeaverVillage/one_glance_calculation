# v104 배포 메모

- Cloudflare Pages 단일 파일 25MiB 제한 대응을 위해 의료 대용량 캐시를 지역별로 분할했습니다.
- 제거된 단일 대용량 파일: `night-hospital-cache.json`, `night-pharmacy-cache.json`, `kakao-place-cache.json`
- 새 경로: `assets/data/medical/night-hospital/{지역}.json`, `assets/data/medical/night-pharmacy/{지역}.json`, `assets/data/medical/kakao-place/{mode}/{지역}.json`
- 서울/경기처럼 큰 캐시는 내부적으로 `part-xx.json` 파티션 매니페스트를 사용합니다.
- 새로 캐시를 생성한 뒤에는 `node scripts/split-medical-cache-by-region.js`를 실행해 배포용으로 분할하세요.

# 한눈체크

## v104-medical-cache-slug-map-copy-init-fix

- 온병원/일산차병원 카카오맵 URL 수동 패치 반영 상태를 유지했습니다.
- Cloudflare Pages 단일 파일 제한 대응을 위해 야간 병원·야간 약국·의료기관 카카오 캐시를 지역별 파일로 분할했습니다.
- 서울/경기처럼 큰 지역 파일은 작은 `part-xx.json` 파티션으로 나눴고, 프론트는 매니페스트를 읽어 필요한 파티션만 병합합니다.
- 응급실 페이지에서 선택 지역의 야간 병원/약국 캐시와 카카오 캐시만 불러오도록 수정했습니다.
- 배포 확인 버전: `v104-medical-cache-slug-map-copy-init-fix`.


한눈체크는 생활 속에서 확인이 필요한 정보를 한 화면에서 정리해 보여주는 정적 사이트 + Cloudflare Pages Functions 프로젝트입니다.

## 주요 기능

- 전기차 충전소 지도
- 주차비 확인 지도
- 외출 위험 종합 체크
- 응급실·야간 병원·약국 확인
- 장보기 물가 확인
- 사업자등록 상태 조회
- 사업자 진위확인
- 통신판매업 신고 조회
- 쇼핑몰 정보 비교
- 거래 전 체크리스트
- 컴퓨터 사양 확인

## v100-emergency-state-machine-current-location-fix

이번 버전은 운영 UI 최종 점검본입니다. 메인, sitemap, 데이터 출처, 환경변수 예시, 응급실 지도형 UI, 외출 위험 오류 문구, 의료기관 카카오맵 로컬 캐시 연결 상태를 다시 확인했습니다.

적용 내용:

- 홈페이지 자주 쓰는 기능 5개 유지 확인
- 공개 메뉴와 sitemap에서 운영 제외 기능 노출 없음 확인
- 응급실·야간 병원·약국 페이지의 지도, 목록, 선택 상세 카드 흐름 최종 점검
- 의료기관 카카오맵 버튼이 로컬 캐시를 우선 확인하고, 없으면 카카오맵 검색으로 fallback되도록 유지
- 기상특보 보조 조회 실패가 외출 위험 핵심 결과를 가리지 않도록 문구 유지
- 데이터 출처와 환경변수 예시를 현재 운영 기능 기준으로 정리
- `.env`, `.env.local`이 배포 ZIP에 포함되지 않도록 확인
- 응급실 지도 선택 시 `fitBounds`를 반복 실행하지 않고 선택 기관으로 `panTo` 처리
- 지도 마커를 `병상 7` 형식으로 축소하고 번호 원형 제거
- PC 선택 카드 상세보기 버튼 제거, PC/모바일 카드 닫기(X) 추가
- 모바일 하단 목록 시트 드래그와 필터 액션시트 이벤트 보강
- AdSense 심사 전 HTML 광고 스크립트 비활성화 및 개인정보처리방침/면책/데이터 출처 문구 보강

## 환경변수 예시

실제 키는 이 파일에 넣지 말고 Cloudflare Pages Production 환경변수에 등록합니다.

```env
DATA_GO_KR_SERVICE_KEY=
PUBLIC_DATA_SERVICE_KEY=
PUBLIC_DATA_API_KEY=

KAKAO_MAP_JS_KEY=
KAKAO_JS_KEY=
KAKAO_REST_API_KEY=

SEOUL_OPEN_API_KEY=
HOLIDAY_API_KEY=

KAMIS_API_KEY=
KAMIS_CERT_ID=
PRICE_GO_KR_API_KEY=

AIRKOREA_API_KEY=
KMA_FORECAST_API_KEY=
KMA_LIVING_INDEX_API_KEY=

NMC_EMERGENCY_API_KEY=
NMC_HOSPITAL_API_KEY=
NMC_PHARMACY_API_KEY=
HIRA_API_KEY=
```

## 배포 확인

배포 후 `/api/config`의 `serverVersion`이 `v104-medical-cache-slug-map-copy-init-fix`로 보이면 이번 작업본이 반영된 것입니다.


## 야간 병원·야간 약국 로컬 캐시 생성

로컬에서만 실행합니다. `.env.local`은 배포 ZIP이나 GitHub에 포함하지 않습니다.

```powershell
cd "프로젝트_폴더"
notepad .env.local
# NMC_HOSPITAL_API_KEY=병의원_KEY
# NMC_PHARMACY_API_KEY=약국_KEY
# KAKAO_REST_API_KEY=카카오_REST_API_KEY

# 소량 테스트
node scripts/build-night-medical-cache.js --mode=hospital --region=서울 --limit=30
node scripts/build-night-medical-cache.js --mode=pharmacy --region=서울 --limit=30

# 전국 캐시 생성
node scripts/build-night-medical-cache.js --mode=all --region=전국

# 생성된 야간 병원/약국 캐시를 기준으로 카카오맵 바로가기 매칭
node scripts/enrich-medical-kakao-places.js --mode=hospital --source=assets/data/medical/night-hospital-cache.json
node scripts/enrich-medical-kakao-places.js --mode=pharmacy --source=assets/data/medical/night-pharmacy-cache.json

# 배포 전 대용량 단일 JSON을 지역별/파티션별 캐시로 분할
node scripts/split-medical-cache-by-region.js

del .env.local
```

야간 병원·약국 캐시는 기본정보와 제공기관 운영시간만 저장합니다. 실제 야간 진료, 조제 가능 여부, 접수 마감, 임시 휴무는 방문 전 전화 확인이 필요합니다.

## 의료기관 카카오맵 캐시 생성

로컬에서만 실행합니다. `.env.local`은 배포 ZIP이나 GitHub에 포함하지 않습니다.

```powershell
cd "프로젝트_폴더"
notepad .env.local
# KAKAO_REST_API_KEY=카카오_REST_API_KEY
# NMC_EMERGENCY_API_KEY=응급의료기관_KEY
# NMC_HOSPITAL_API_KEY=병의원_KEY
# NMC_PHARMACY_API_KEY=약국_KEY

node scripts/enrich-medical-kakao-places.js --mode=emergency --region=대전 --limit=100
node scripts/enrich-medical-kakao-places.js --mode=hospital --region=대전 --district=서구 --limit=100
node scripts/enrich-medical-kakao-places.js --mode=pharmacy --region=대전 --district=서구 --limit=100
node scripts/enrich-medical-kakao-places.js --mode=all --region=대전 --limit=300
del .env.local
```

## v100-emergency-state-machine-current-location-fix

- 응급실·야간 병원·약국 확인 페이지를 전기차 충전소 지도 계열의 상단 조건 카드 + 지도 중심 + 결과 목록 구조로 다시 정리했습니다.
- 왼쪽에 고립되어 보이던 조회 전/선택 카드 구조를 제거하고, 선택 상세 카드는 실제 항목 선택 후에만 결과 흐름 아래 표시되도록 변경했습니다.
- 모바일에서는 조건 카드, 지도, 결과 목록, 선택 상세 카드가 단일 컬럼으로 내려가도록 CSS를 보강했습니다.
- 의료기관 카카오맵 로컬 캐시 구조는 유지하며, 캐시가 없거나 신뢰도가 낮으면 카카오맵 검색으로 fallback됩니다.

## v99 응급실 모바일·중증 항목 안정화

- 응급실 목록/마커/자동 선택을 `hospital.id` 기준으로 통합했습니다.
- 현재 위치·장소 검색·정렬 후 로컬 캐시가 실시간 병상/중증 정보를 덮어쓰지 않도록 `liveStatusById` 병합 구조를 추가했습니다.
- 지도 선택 카드의 중증 표기를 `중증 항목 / N개 제공`으로 변경하고 `항목 보기` 팝업을 추가했습니다.
- PC의 상세보기 버튼은 렌더링 단계와 CSS에서 제거하고, 모바일에서만 상세 흐름을 유지했습니다.
- X 닫기 후 선택 카드/상세 카드 wrapper가 남지 않도록 `[hidden]` 우선 CSS를 추가했습니다.