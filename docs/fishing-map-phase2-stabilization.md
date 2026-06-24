# 낚시터 찾기 2차 안정화 메모

## 이번 단계 목적

낚시터 찾기 기능을 메인·사이트맵에 공개 연결하기 전, 지도형 기능에서 반복 발생했던 초기 선택, 모바일 바텀시트, 지역 변경 레이스 컨디션, 캐시 무결성 문제를 먼저 막는다.

## 적용한 안정화 항목

- 초기 진입 시 서울 낚시터 목록과 마커는 표시하되 첫 번째 항목은 자동 선택하지 않는다.
- 지역을 빠르게 연속 변경해도 마지막으로 선택한 지역의 응답만 화면에 반영한다.
- 모바일 바텀시트는 기본 닫힘 상태로 시작하고, `목록 보기` 버튼을 눌렀을 때만 열린다.
- 카카오맵이 정상 로딩될 때 fallback 마커가 겹쳐 보이지 않도록 정리한다.
- 낚시터 캐시 생성 스크립트의 중복 필드를 정리하고 캐시 버전을 v108로 갱신한다.
- 낚시터 기능 검증 스크립트를 추가한다.

## 로컬 검증 명령

```powershell
node --check assets/js/fishing-spot-map.js
node --check scripts/build-fishing-cache.js
node scripts/build-fishing-cache.js
node scripts/verify-fishing-map.js
```

Windows CMD에서는 다음 명령도 사용할 수 있다.

```powershell
.\scripts\build-fishing-cache-windows.cmd
.\scripts\verify-fishing-map-windows.cmd
```

## 아직 공개 연결하지 않은 항목

- index.html 메인 카드 연결
- sitemap.xml 신규 URL 추가
- data-sources.html 낚시터 데이터 출처 추가
- robots 관련 변경

위 항목은 실제 브라우저에서 낚시터 페이지 직접 접속 검증 후 3차 작업에서 연결한다.
