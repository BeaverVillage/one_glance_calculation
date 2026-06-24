# 낚시터 찾기 3차 사이트 연결 메모

## 목적

낚시터 찾기 기능을 직접 URL 테스트용 상태에서 사이트 내 공개 연결 상태로 전환한다. 기존 응급실, 전기차, 주차비, 광고 관련 코드는 수정하지 않는다.

## 반영 범위

- `index.html` 주요 기능 카드에 낚시터 찾기 추가
- 홈 JSON-LD `ItemList`에 낚시터 찾기 URL 추가
- `sitemap.xml`에 낚시터 찾기 URL 추가
- `data-sources.html`에 지방행정 인허가 낚시터정보 CSV 및 로컬 JSON 캐시 사용 안내 추가
- 낚시터 페이지 및 캐시 버전 쿼리를 v109로 갱신
- 낚시터 사이트 연결 검증 스크립트 추가

## 검증 명령

```powershell
node --check assets/js/fishing-spot-map.js
node --check scripts/build-fishing-cache.js
node --check scripts/verify-fishing-map.js
node --check scripts/verify-fishing-integration.js
node scripts/build-fishing-cache.js
node scripts/verify-fishing-map.js
node scripts/verify-fishing-integration.js
```

Windows에서 바로 실행할 때:

```powershell
.\scripts\build-fishing-cache-windows.cmd
.\scripts\verify-fishing-map-windows.cmd
.\scripts\verify-fishing-integration-windows.cmd
```

## 브라우저 확인 포인트

- `/tools/fishing-spot-map.html` 직접 접속 정상
- 홈 화면 주요 기능 카드에서 낚시터 찾기 클릭 정상
- 초기 서울 낚시터 목록 표시
- 첫 항목 자동 선택 없음
- 마커 또는 목록 클릭 시에만 선택 카드 표시
- 모바일에서 목록 바텀시트가 처음부터 열리지 않음
- 지도 확인, 전화하기 버튼 정상
