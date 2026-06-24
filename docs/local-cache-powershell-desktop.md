# 한눈체크 로컬 캐시 PowerShell 작업 메모

사용자 작업 기준 경로:

```powershell
C:\Users\kjw39\Desktop
```

## 낚시터 캐시 재생성

프로젝트 ZIP을 바탕화면에 압축 해제한 뒤, 압축 해제된 프로젝트 폴더로 이동해서 실행한다.

예시:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v110_fishing_coordinate_fix"
node scripts\build-fishing-cache.js
node scripts\verify-fishing-map.js
node scripts\verify-fishing-integration.js
```

원본 CSV를 별도 위치에서 지정할 때:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v110_fishing_coordinate_fix"
node scripts\build-fishing-cache.js --input="C:\Users\kjw39\Desktop\낚시터정보.csv"
node scripts\verify-fishing-map.js
node scripts\verify-fishing-integration.js
```

Windows CMD 래퍼를 사용할 때:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v110_fishing_coordinate_fix"
.\scripts\build-fishing-cache-windows.cmd
.\scripts\verify-fishing-map-windows.cmd
.\scripts\verify-fishing-integration-windows.cmd
```

## 주의

- CSV 원본은 브라우저에서 직접 읽지 않는다.
- 생성 결과는 `assets/data/life/fishing-spots/`에 저장된다.
- 캐시 생성 후 `index.json`, `seoul.json`, `gyeonggi.json` 등이 존재해야 한다.
- 오류가 없으면 생성된 캐시 포함 프로젝트를 다시 ZIP으로 묶어 업로드한다.

## 무료 와이파이 캐시 재생성

5차 작업부터 무료 와이파이 로컬 캐시는 시도/시군구 단위 JSON으로 생성한다. 원본 CSV는 브라우저에서 직접 읽지 않고, PowerShell에서 한 번 변환한 뒤 `assets/data/life/free-wifi/` 파일만 프론트에서 사용한다.

프로젝트 ZIP을 바탕화면에 압축 해제한 뒤:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v111_free_wifi_cache_phase5"
node scripts\build-free-wifi-cache.js
node scripts\verify-free-wifi-cache.js
```

바탕화면의 원본 CSV를 직접 지정할 때:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v111_free_wifi_cache_phase5"
node scripts\build-free-wifi-cache.js --input="C:\Users\kjw39\Desktop\무료와이파이정보.csv"
node scripts\verify-free-wifi-cache.js
```

Windows CMD 래퍼를 사용할 때:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v111_free_wifi_cache_phase5"
.\scripts\build-free-wifi-cache-windows.cmd
.\scripts\verify-free-wifi-cache-windows.cmd
```

생성 결과 확인 위치:

```powershell
assets\data\life\free-wifi\index.json
assets\data\life\free-wifi\seoul\d001.json
assets\data\life\free-wifi\gyeonggi\d001.json
```

검증 기준:

- `verify-free-wifi-cache`가 `passed`로 끝나야 한다.
- `index.json`의 `totalItems`와 시군구 파일 합계가 일치해야 한다.
- 좌표가 한국 범위를 벗어난 데이터는 지도 캐시에서 제외된다.
- 무료 와이파이 원본은 데이터량이 크므로 프론트에서 전체 CSV를 직접 읽지 않는다.

## 공중화장실 좌표 캐시 생성

8차 작업부터 공중화장실은 주소를 카카오 Local API로 좌표 변환한 뒤 로컬 JSON 캐시로 사용한다. 원본 CSV에는 위도/경도가 없으므로 이 단계는 무료 와이파이와 달리 지오코딩이 필요하다.

프로젝트 ZIP을 바탕화면에 압축 해제한 뒤:

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v114_public_toilet_cache_phase8"
node scripts\prepare-public-toilet-addresses.js
node scripts\verify-public-toilet-prep.js
```

바탕화면의 원본 CSV를 직접 지정할 때:

```powershell
node scripts\prepare-public-toilet-addresses.js --input="C:\Users\kjw39\Desktop\공중화장실정보.csv"
node scripts\verify-public-toilet-prep.js
```

카카오 REST API 키를 PowerShell 환경변수로 등록한다.

```powershell
$env:KAKAO_REST_API_KEY="너의_카카오_REST_API_키"
```

좌표 변환을 실행한다.

```powershell
node scripts\geocode-public-toilets.js
```

테스트로 500개만 실행할 때:

```powershell
node scripts\geocode-public-toilets.js --limit=500
```

좌표 변환이 끝나면 최종 지도 캐시를 생성하고 검증한다.

```powershell
node scripts\build-public-toilet-cache.js
node scripts\verify-public-toilet-cache.js
```

생성 결과 확인 위치:

```powershell
cache\public-toilets\geocode-success.json
cache\public-toilets\geocode-failed.json
assets\data\life\public-toilets\index.json
```

검증 기준:

- `verify-public-toilet-prep`가 `passed`로 끝나야 한다.
- 지오코딩 후 `verify-public-toilet-cache`가 `passed`로 끝나야 한다.
- 좌표 변환은 중간에 끊겨도 같은 명령을 다시 실행하면 이어서 진행된다.
- API 키는 코드에 저장하지 않는다.

## 공중화장실 9차 이후 확인 명령

공중화장실 지도 페이지까지 반영된 ZIP에서는 아래 검증을 추가로 실행할 수 있습니다.

```powershell
node scripts\verify-public-toilet-cache.js
node scripts\verify-public-toilet-map.js
node scripts\verify-public-toilet-integration.js
```

9차 이후에는 원본 `공중화장실정보.csv`를 교체하지 않는 한 카카오 지오코딩을 다시 실행할 필요가 없습니다.

## 10차 배포 ZIP 기준 주의

10차 최종 배포 ZIP에서는 원본 CSV와 공중화장실 지오코딩 중간 캐시를 제외한다.

제외 이유:

- 브라우저 런타임에 필요하지 않다.
- `cache/public-toilets/prepared-items.json` 같은 중간 파일은 25MB를 초과할 수 있다.
- 정적 호스팅 배포 시 개별 파일 용량 제한에 걸릴 수 있다.

따라서 10차 ZIP에서 캐시를 다시 생성해야 할 때는 원본 CSV를 `data/source/`에 넣기보다 아래처럼 바탕화면 원본 파일을 `--input`으로 직접 지정한다.

```powershell
node scripts\build-fishing-cache.js --input="C:\Users\kjw39\Desktop\낚시터정보.csv"
node scripts\build-free-wifi-cache.js --input="C:\Users\kjw39\Desktop\무료와이파이정보.csv"
node scripts\prepare-public-toilet-addresses.js --input="C:\Users\kjw39\Desktop\공중화장실정보.csv"
```

공중화장실은 지오코딩 중간 캐시가 필요하므로, 새 원본 CSV로 다시 작업할 때만 카카오 지오코딩을 다시 실행한다. 현재 최종 배포 ZIP의 `assets/data/life/public-toilets/` 캐시는 이미 생성되어 있으므로 일반 배포에는 추가 작업이 필요 없다.

## 11차 이후 공중화장실 지역 라벨 보정

11차부터 공중화장실 캐시는 `서울방향`, `서울대학로`처럼 주소 안에 들어간 서울 문자열 때문에 실제 지역이 서울로 오분류되는 문제를 방지한다.

이미 지오코딩이 끝난 캐시에서 지역/시군구 라벨만 다시 정리해야 할 때는 카카오 API를 다시 호출하지 않고 아래 명령만 실행한다.

```powershell
node scripts\repair-public-toilet-cache-region-labels.js
node scripts\verify-public-toilet-cache.js
node scripts\verify-public-toilet-integration.js
node scripts\verify-life-map-runtime-contract.js
```

공중화장실 원본 CSV를 새로 교체한 경우에는 기존 순서대로 `prepare → geocode → build`를 실행한 뒤, 마지막에 위 보정 스크립트와 검증 스크립트를 한 번 더 실행하면 된다.
