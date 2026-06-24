# 8차 작업: 공중화장실 로컬 좌표 캐시 준비

이번 단계는 `공중화장실정보.csv`를 브라우저에서 직접 읽지 않고, PowerShell에서 한 번 전처리한 뒤 로컬 JSON 캐시로 쓰기 위한 기반 작업이다.

## 추가된 스크립트

```powershell
scripts\prepare-public-toilet-addresses.js
scripts\geocode-public-toilets.js
scripts\build-public-toilet-cache.js
scripts\verify-public-toilet-prep.js
scripts\verify-public-toilet-cache.js
```

## 실행 순서

프로젝트를 바탕화면에 압축 해제한 뒤 프로젝트 폴더로 이동한다.

```powershell
cd "C:\Users\kjw39\Desktop\hannuncheck_v114_public_toilet_cache_phase8"
```

### 1. 주소 정리 및 지오코딩 대상 생성

```powershell
node scripts\prepare-public-toilet-addresses.js
node scripts\verify-public-toilet-prep.js
```

바탕화면의 원본 CSV를 직접 지정할 때:

```powershell
node scripts\prepare-public-toilet-addresses.js --input="C:\Users\kjw39\Desktop\공중화장실정보.csv"
node scripts\verify-public-toilet-prep.js
```

생성 위치:

```powershell
cache\public-toilets\prepared-items.json
cache\public-toilets\geocode-targets.json
cache\public-toilets\prepare-summary.json
```

### 2. 카카오 REST API 키 설정

코드에 API 키를 넣지 말고 PowerShell 환경변수로만 넣는다.

```powershell
$env:KAKAO_REST_API_KEY="너의_카카오_REST_API_키"
```

### 3. 주소 → 좌표 변환

```powershell
node scripts\geocode-public-toilets.js
```

테스트로 일부만 돌릴 때:

```powershell
node scripts\geocode-public-toilets.js --limit=500
```

속도를 더 늦추고 싶을 때:

```powershell
node scripts\geocode-public-toilets.js --delay=250
```

중간에 끊기면 같은 명령을 다시 실행하면 된다. 이미 성공한 주소는 건너뛰고 남은 주소만 이어서 처리한다.

생성 위치:

```powershell
cache\public-toilets\geocode-success.json
cache\public-toilets\geocode-failed.json
cache\public-toilets\geocode-progress.json
```

### 4. 최종 지도 캐시 생성

```powershell
node scripts\build-public-toilet-cache.js
node scripts\verify-public-toilet-cache.js
```

생성 위치:

```powershell
assets\data\life\public-toilets\index.json
assets\data\life\public-toilets\seoul\d001.json
assets\data\life\public-toilets\gyeonggi\d001.json
```

## 주의사항

- 공중화장실은 원본 CSV에 위도/경도가 없으므로 지오코딩이 필수다.
- 지오코딩은 배포된 사이트에서 실행하지 않고, 로컬 PowerShell에서만 실행한다.
- `KAKAO_REST_API_KEY`는 코드나 ZIP에 직접 넣지 않는다.
- 지오코딩 실패 데이터는 `geocode-failed.json`에 남긴다.
- 9차 UI 작업은 `assets/data/life/public-toilets/` 최종 캐시가 생성된 뒤 진행한다.
