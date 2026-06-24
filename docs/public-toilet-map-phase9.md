# 공중화장실 찾기 9차 구현 기록

## 범위
- 공중화장실 최종 지도 캐시의 시군구 라벨 정규화 보강
- `tools/public-toilet-map.html` 신규 페이지 추가
- `assets/js/public-toilet-map.js` 신규 지도 기능 추가
- `assets/css/life-map.css`에 공중화장실 전용 색상 스타일 추가
- `index.html`, `sitemap.xml`, `data-sources.html` 사이트 연결
- 검증 스크립트 추가

## 안정성 원칙
- 공중화장실 원본 CSV는 브라우저에서 직접 읽지 않는다.
- 지오코딩 성공 좌표가 있는 항목만 지도 캐시에 포함한다.
- 첫 번째 항목은 자동 선택하지 않는다.
- 사용자가 목록 또는 마커를 직접 선택했을 때만 선택 카드가 표시된다.
- 지도 마커는 최대 300개, 목록은 최대 50개만 표시한다.
- 시군구 캐시는 최근 12개만 유지한다.
- 검색·필터 변경 시 기존 선택 카드를 초기화한다.

## 검증 명령
```powershell
node scripts\verify-public-toilet-cache.js
node scripts\verify-public-toilet-map.js
node scripts\verify-public-toilet-integration.js
```
