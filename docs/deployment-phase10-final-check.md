# 10차 배포 전 최종 점검 메모

## 목적

낚시터 찾기, 무료 와이파이 찾기, 공중화장실 찾기 3개 생활지도 기능을 사이트에 연결한 뒤 배포 전에 전체 회귀검증과 용량 점검을 수행한다.

## 배포 ZIP 정리 기준

배포에 필요한 최종 지도 캐시는 `assets/data/life/` 아래에만 둔다.

배포 ZIP에서는 아래 파일을 제거한다.

- `cache/public-toilets/prepared-items.json`
- `cache/public-toilets/geocode-targets.json`
- `cache/public-toilets/geocode-success.json`
- `data/source/*.csv`

이 파일들은 로컬 캐시 생성용 중간 산출물 또는 원본 CSV라서 브라우저 런타임에는 필요하지 않다. 특히 `prepared-items.json`은 25MB를 초과할 수 있으므로 배포 ZIP에 포함하면 정적 호스팅 업로드에서 문제가 될 수 있다.

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
```

## 배포 후 브라우저 확인

- 메인 페이지에서 낚시터 찾기, 무료 와이파이 찾기, 공중화장실 찾기 카드가 보이는지 확인한다.
- 각 페이지에서 초기 데이터가 자동 표시되는지 확인한다.
- 첫 번째 항목이 자동 선택되어 선택 카드가 뜨지 않는지 확인한다.
- 지도 마커와 목록 카드를 클릭했을 때만 선택 카드가 나타나는지 확인한다.
- PC와 모바일에서 지도, 목록, 바텀시트가 겹치지 않는지 확인한다.
- 기존 응급실, 전기차 충전소, 주차비 확인 페이지가 정상 동작하는지 확인한다.

## 12차 배포 프리플라이트 추가 검증

12차 이후 배포 직전에는 아래 명령을 추가로 실행합니다.

```powershell
node scripts\verify-life-map-release-preflight.js
```

이 검증은 생활지도 3종의 정적 JSON 캐시 정책, `/api/config` no-store 유지, v118 버전 쿼리, 25MB 단일 파일 제한, 배포 제외 파일 포함 여부를 함께 확인합니다.
