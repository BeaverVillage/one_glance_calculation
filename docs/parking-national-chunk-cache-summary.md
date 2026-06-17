# 주차비 계산 지도 전국 주차장 chunk 캐시 반영 요약

## 목적

Cloudflare Pages Functions 번들에 전국 주차장 데이터를 직접 포함하지 않고, 정적 asset chunk로 분리해 배포 용량 제한을 피하면서 전국 공공데이터 기반 반경 검색을 빠르게 수행한다.

## 입력 데이터

- 출처: 공공데이터포털 전국주차장정보표준데이터
- 기준 파일: 사용자가 공공데이터포털에서 직접 내려받은 CSV
- 데이터 기준일: 2026-05-21

## 생성 결과

- 원본 rows: 18,527개
- 정규화 및 좌표 검증 통과: 17,004개
- 좌표 없음/범위 오류 제외: 1,523개
- chunk 방식: 위도/경도 0.1도 grid
- chunk 파일 수: 799개
- 가장 큰 chunk: 약 512KB

## 반영 파일

- `assets/data/parking/index.json`
- `assets/data/parking/cells/*.json`
- `assets/data/parking/national-parking-lots.json`는 소형 meta 파일로 유지
- `functions/api/parking/_data/national-parking-lots.json`는 소형 meta 파일로 유지
- `functions/api/parking/_lib/generated-national-parking-lots.js`는 대용량 배열 없이 meta만 export

## 런타임 동작

1. 목적지 좌표와 검색 반경을 기준으로 주변 grid cell key를 계산한다.
2. `assets/data/parking/index.json`에서 필요한 cell 파일만 찾는다.
3. 필요한 `assets/data/parking/cells/*.json` chunk만 로드한다.
4. 로드된 후보에서 haversine 직선거리로 반경 필터링한다.
5. 기존 추천/요금 계산 로직에 전달한다.

## 배포 용량 대응

전국 주차장 배열을 `functions` 안의 JS 모듈로 import하지 않는다. Functions 폴더는 약 176KB 수준이며, Cloudflare Pages Functions 25MiB 번들 제한을 피하도록 구성했다.

## 주의

이번 작업은 UI/디자인/광고/SEO를 변경하지 않고, 공공데이터 캐시 저장 및 런타임 로딩 구조만 수정했다.
