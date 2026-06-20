# 한눈체크

전기차 충전소, 주차비, 미세먼지, 사업자 정보 등 생활 속 확인 정보를 정리하는 정적 사이트 + Cloudflare Pages Functions 프로젝트입니다.

## 구성

- 홈: `index.html`
  - 한눈계산과 유사한 카드형 주요 기능 선택 UI
  - 우측 사업자 정보 미리보기 화면 제거
- 기능 페이지
  - `tools/business-status.html`: 사업자등록 상태 조회
  - `tools/business-validate.html`: 사업자 진위확인
  - `tools/mail-order.html`: 통신판매업 신고 조회
  - `tools/store-compare.html`: 쇼핑몰 하단 정보 비교
  - `tools/pre-payment-checklist.html`: 거래 전 체크리스트
- 기본 페이지: `about.html`, `privacy.html`, `disclaimer.html`, `data-sources.html`, `contact.html`, `404.html`
- 스타일: `assets/css/base.css`, `assets/css/layout.css`, `assets/css/components.css`
- 프론트 기능: `assets/js/app.js`
- API 라우트: `functions/api/check.js`

## 배포 설정

Cloudflare Pages에서 GitHub 저장소를 연결한 뒤 아래처럼 설정합니다.

| 항목 | 값 |
| --- | --- |
| Framework preset | None / No framework |
| Build command | 비워두기 또는 `exit 0` |
| Build output directory | `/` 또는 `.` |

## 환경변수

Cloudflare Pages 프로젝트의 Settings > Environment variables에 아래 값을 등록합니다.

```text
DATA_GO_KR_SERVICE_KEY=공공데이터포털 일반 인증키
```

API별로 키를 나누려면 아래도 사용할 수 있습니다.

```text
NTS_SERVICE_KEY=국세청 API 키
FTC_SERVICE_KEY=공정위 API 키
```

## 사용하는 API

1. 국세청 사업자등록정보 진위확인 및 상태조회 서비스
   - 상태조회: `https://api.odcloud.kr/api/nts-businessman/v1/status`
   - 진위확인: `https://api.odcloud.kr/api/nts-businessman/v1/validate`
2. 공정거래위원회 통신판매사업자 등록상세 제공 서비스
   - 등록상세 조회: `https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3`

## 법적/운영 원칙

- 사기 여부를 판정하지 않습니다.
- 거래 안전성을 보장하지 않습니다.
- 계좌번호, 전화번호, 피해사례 DB를 다루지 않습니다.
- 조회 입력값을 별도 DB에 저장하지 않는 구조입니다.
- 결과 공유 링크에 사업자번호 원문을 넣지 않습니다.


## v4 보완 사항

- 애드센스 심사 대비용 가이드 콘텐츠 6개 추가
- 메인/기능/결과 화면에 “사기 여부·거래 안전성 판정 아님” 문구 강화
- 개인정보처리방침에 광고 쿠키 및 맞춤 광고 안내 추가
- 데이터 출처, 면책 안내, 문의·정정 요청 페이지 강화
- sitemap.xml에 기능 페이지와 가이드 페이지 반영
- 조회 폼 하단에 입력정보 미저장 안내 추가


## 추가 기능

- `/tools/pc-spec.html`: 브라우저에서 확인 가능한 컴퓨터 사양, 직접 입력 사양 해석, CPU 간단 테스트를 제공합니다.


## 전기차 충전소 전국 로컬 캐시 생성 안내 (v32)

이 버전은 Windows에서 실제로 성공한 `Invoke-RestMethod` 방식에 맞춰 **PowerShell 전용 캐시 생성 스크립트**를 사용합니다. Node.js가 없어도 실행할 수 있으며, `.cmd` 파일이 PowerShell 실행정책을 우회해서 실행합니다. 기본 요청 크기는 `numOfRows=9000`입니다.

### 1. PowerShell에서 API 키 설정

```powershell
$env:DATA_GO_KR_SERVICE_KEY="공공데이터포털_일반인증키"
```

### 2. 서울 10건 테스트

가장 먼저 이 명령으로 API 연결을 확인합니다.

```powershell
.\scripts\build-ev-charger-cache-windows.cmd -Region 11 -Test
```

정상이라면 `resultCode=00`, `NORMAL SERVICE`, `itemCount=10`이 표시됩니다.

### 3. 서울 캐시 생성

```powershell
.\scripts\build-ev-charger-cache-windows.cmd -Region 11
```

생성 결과는 아래 파일에 저장됩니다.

```text
assets/data/ev-chargers/chunks/11.json
```

### 4. 전국 캐시 생성

서울 테스트가 성공하면 전국을 생성합니다.

```powershell
.\scripts\build-ev-charger-cache-windows.cmd
```

전국 생성 결과는 지역별 JSON 파일로 저장됩니다.

```text
assets/data/ev-chargers/chunks/11.json
assets/data/ev-chargers/chunks/26.json
...
assets/data/ev-chargers/index.json
assets/data/ev-chargers/regions.json
```

### 5. 실패 시 조정 옵션

기본값은 `-Rows 9000 -DelayMs 2500 -Retries 5`입니다. 공공데이터 서버가 불안정하면 아래처럼 낮춰서 재시도합니다.

```powershell
.\scripts\build-ev-charger-cache-windows.cmd -Region 11 -Rows 5000 -DelayMs 5000 -Retries 8 -Resume
```

그래도 실패하면 다음 단계로 낮춥니다.

```powershell
.\scripts\build-ev-charger-cache-windows.cmd -Region 11 -Rows 3000 -DelayMs 7000 -Retries 10 -Resume
```

`-Resume`은 이전에 성공한 페이지 진행 파일이 있으면 이어서 수집합니다.

### 6. PowerShell 스크립트를 직접 실행해야 할 때

`.cmd`가 아닌 `.ps1`을 직접 실행할 때는 실행정책 때문에 막힐 수 있습니다. 이 경우 아래처럼 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-ev-charger-cache.ps1 -Region 11 -Test
```

### 7. 데이터 성격

로컬 캐시는 충전소명, 주소, 좌표, 충전기 타입 같은 기본정보를 빠르게 표시하기 위한 정적 캐시입니다. 사용 가능, 충전 중, 고장 같은 상태값은 제공기관 데이터 기준으로 짧게 다시 확인하며 실제 현장 상황과 다를 수 있습니다.


## v32 PowerShell encoding fix

Windows PowerShell 5.1에서 Korean strings in `.ps1` can be misread when the file is UTF-8 without BOM. This package saves `scripts/build-ev-charger-cache.ps1` as UTF-8 with BOM and sets the console code page in `build-ev-charger-cache-windows.cmd`.

Recommended command:

```powershell
$env:DATA_GO_KR_SERVICE_KEY="YOUR_KEY"
.\scripts\build-ev-charger-cache-windows.cmd -Region 11 -Test
.\scripts\build-ev-charger-cache-windows.cmd -Region 11
```
