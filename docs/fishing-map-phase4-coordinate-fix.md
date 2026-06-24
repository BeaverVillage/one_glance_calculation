# 한눈체크 낚시터 찾기 4차 좌표 보정

## 작업 목적

군자 낚시터의 원본 CSV 경도 오류를 로컬 캐시 생성 단계에서 재발하지 않도록 보정했습니다.

## 보정 대상

- 대상: 군자 낚시터
- 주소: 경기도 시흥시 시흥대로216-18
- 보정 좌표: 37.3596892325045, 126.807925280972
- 처리 방식: scripts/build-fishing-cache.js의 MANUAL_COORDINATE_FIXES 테이블 적용

## 검증

다음 검증 스크립트에 군자 낚시터 좌표 확인을 추가했습니다.

```powershell
node scripts\build-fishing-cache.js
node scripts\verify-fishing-map.js
node scripts\verify-fishing-integration.js
```

검증 기준:

- 군자 낚시터가 캐시에 존재해야 함
- 위도/경도가 보정 좌표와 일치해야 함
- coordinateFixed 플래그가 true여야 함
- 수도권 의심 좌표가 없어야 함
