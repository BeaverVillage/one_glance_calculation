# 무료 와이파이 찾기 5차 작업 메모

## 작업 목적

무료 와이파이 찾기 기능을 만들기 전, 대용량 CSV를 브라우저에서 직접 읽지 않도록 로컬 JSON 캐시 생성 기반을 먼저 만든다.

## 추가 파일

```text
scripts/build-free-wifi-cache.js
scripts/build-free-wifi-cache-windows.cmd
scripts/verify-free-wifi-cache.js
scripts/verify-free-wifi-cache-windows.cmd
data/source/free-wifi.csv
assets/data/life/free-wifi/index.json
assets/data/life/free-wifi/{region}/{district}.json
```

## 캐시 구조

무료 와이파이 데이터는 약 9만 건 이상이므로 시도 단위 파일 하나로 만들지 않는다. 다음 구조로 분할한다.

```text
assets/data/life/free-wifi/index.json
assets/data/life/free-wifi/seoul/d001.json
assets/data/life/free-wifi/seoul/d002.json
assets/data/life/free-wifi/gyeonggi/d001.json
...
```

`index.json`은 지역과 시군구 파일 목록만 가진다. 실제 지도 페이지는 선택된 지역/시군구 파일만 불러오는 방식으로 구현해야 한다.

## 캐시 생성 결과

```text
원본 행: 91,816개
지도 캐시 포함: 91,796개
좌표 오류/한국 범위 밖 제외: 20개
중복 제거: 0개
지역 캐시: 17개
시군구 파일: 227개
와이파이 이름 있음: 66,243개
와이파이 이름 확인 필요: 25,553개
```

## 다음 단계 UI 구현 원칙

- 초기 진입은 서울 기본값으로 시작한다.
- 첫 번째 와이파이 지점을 자동 선택하지 않는다.
- 지도 마커는 기본 150개, 최대 300개 이하로 제한한다.
- 목록은 기본 50개만 먼저 표시한다.
- 지역/시군구 변경 요청에는 requestId 방식으로 레이스 컨디션을 막는다.
- 와이파이 이름이 없는 경우 `정보없음` 대신 `와이파이 이름 확인 필요`라고 표시한다.
- 무료 와이파이 기능은 전화하기보다 `지도 확인`과 `와이파이 이름 표시`가 핵심이다.
