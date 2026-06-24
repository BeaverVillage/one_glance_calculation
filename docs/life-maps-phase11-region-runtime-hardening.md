# 11차 생활지도 런타임 안정화 기록

## 작업 목적

10차 배포 정리 이후, 신규 생활지도 3종을 실제 배포 전에 한 번 더 점검하면서 다음 두 가지를 보강했다.

1. 공중화장실 캐시의 지역/시군구 재분류 안정화
2. 낚시터·무료 와이파이·공중화장실 3개 지도 페이지의 런타임 버전 쿼리 통합

## 공중화장실 지역 재분류 보강

기존 공중화장실 캐시는 일부 항목에서 주소 안의 `서울방향`, `서울대학로` 같은 문자열 때문에 실제 지역이 아닌 서울로 분류될 가능성이 있었다.

예시:

- `경기도 시흥시 서울대학로 ...` → 서울로 오분류될 수 있음
- `경상북도 김천시 ... 추풍령(서울)휴게소` → 서울로 오분류될 수 있음
- `강원특별자치도 홍천군 ... 서울양양고속도로` → 서울로 오분류될 수 있음

11차에서는 지역 판정 로직을 부분 문자열 검색 방식이 아니라 **주소 앞쪽 행정구역 토큰 기준**으로 바꿨다.

## 반영 결과

공중화장실 캐시 재분류 결과:

```text
총 항목: 52,177개
지역 수: 17개
시군구 파일 수: 227개
지역/시군구 재분류 항목: 592개
```

확인된 보정:

- 시흥시 항목은 경기로 분류
- 김천시 항목은 경북으로 분류
- 홍천군·인제군 항목은 강원으로 분류
- 대덕구 항목은 대전으로 분류
- 울주군 항목은 울산으로 분류

## 추가 스크립트

```text
scripts/repair-public-toilet-cache-region-labels.js
scripts/repair-public-toilet-cache-region-labels-windows.cmd
scripts/verify-life-map-runtime-contract.js
scripts/verify-life-map-runtime-contract-windows.cmd
```

`repair-public-toilet-cache-region-labels.js`는 카카오 지오코딩을 다시 실행하지 않고 기존 지도 캐시의 지역/시군구 라벨만 다시 분류한다.

## 배포 버전 쿼리 통합

생활지도 3종 페이지의 CSS/JS 쿼리를 다음 값으로 통합했다.

```text
20260623-v121-life-map-mobile-filter-sort
```

JS 런타임 버전도 다음 값으로 통일했다.

```text
v121-life-map-mobile-filter-sort
```

공중화장실 지도 캐시 버전은 실제 캐시 데이터가 바뀌었으므로 다음 값으로 갱신했다.

```text
v117-life-public-toilet-region-repair
```

## 검증 항목

11차에서 추가한 `verify-life-map-runtime-contract.js`는 다음을 검증한다.

- 생활지도 3종 HTML/JS 존재 여부
- v117 버전 쿼리 적용 여부
- 첫 번째 항목 자동 선택 금지 패턴 유지 여부
- 마커 수 제한 존재 여부
- requestId 레이스 방지 로직 존재 여부
- 배포 ZIP에 원본 CSV와 공중화장실 중간 지오코딩 파일이 없는지 여부
- 공중화장실에서 시흥시, 김천시, 홍천군 등이 서울로 섞이지 않는지 여부

## 최종 검증 명령

```powershell
node scripts\verify-fishing-map.js
node scripts\verify-fishing-integration.js
node scripts\verify-free-wifi-cache.js
node scripts\verify-free-wifi-map.js
node scripts\verify-free-wifi-integration.js
node scripts\verify-public-toilet-cache.js
node scripts\verify-public-toilet-map.js
node scripts\verify-public-toilet-integration.js
node scripts\verify-life-maps-deployment.js
node scripts\verify-life-map-runtime-contract.js
```
