# 무료 와이파이 찾기 7차 성능 안정화

## 목적
무료 와이파이 데이터는 전국 9만 건 이상이며, 지도 화면은 선택한 시군구 캐시만 불러오더라도 필터 변경과 마커 재렌더링이 반복될 수 있습니다. 7차 작업은 브라우저 멈춤, 지도 과도 이동, 메모리 누적을 줄이는 안정화 단계입니다.

## 반영 내용
- 무료 와이파이 JS/CSS 버전 쿼리를 `20260623-v113-free-wifi-performance`로 갱신했습니다.
- 런타임에서 장소별 검색 문자열, 와이파이 이름 존재 여부, 전화번호 존재 여부, 시설구분, 제공기관 값을 1회 전처리하도록 변경했습니다.
- 시군구 캐시는 최대 12개만 보관하는 LRU 방식으로 제한했습니다.
- 검색어와 지도 검색어 입력 디바운스를 조금 늘려 모바일 입력 중 렌더링 빈도를 줄였습니다.
- 필터 변경 시 선택 카드를 초기화해 이전 장소 상세 카드가 남지 않게 했습니다.
- 지역/시군구 변경 또는 현재 위치 사용 시에만 지도 bounds를 다시 맞추도록 `mapAutoFitPending` 플래그를 추가했습니다.
- 검색어/필터 변경 때마다 지도가 계속 확대·이동하는 현상을 줄였습니다.
- 렌더링은 `requestAnimationFrame`으로 예약해 빠른 입력 중 중복 렌더링을 줄였습니다.

## 검증 명령
```powershell
node scripts\verify-free-wifi-cache.js
node scripts\verify-free-wifi-map.js
node scripts\verify-free-wifi-integration.js
node scripts\verify-fishing-map.js
node scripts\verify-fishing-integration.js
```
