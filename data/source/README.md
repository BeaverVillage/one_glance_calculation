# 원본 CSV 위치 안내

배포 ZIP에서는 용량 초과와 불필요한 공개 노출을 줄이기 위해 원본 CSV 파일을 포함하지 않습니다.

로컬 캐시를 다시 생성해야 할 때는 아래처럼 `--input` 옵션으로 바탕화면의 원본 CSV 경로를 직접 지정하세요.

```powershell
node scripts\build-fishing-cache.js --input="C:\Users\kjw39\Desktop\낚시터정보.csv"
node scripts\build-free-wifi-cache.js --input="C:\Users\kjw39\Desktop\무료와이파이정보.csv"
node scripts\prepare-public-toilet-addresses.js --input="C:\Users\kjw39\Desktop\공중화장실정보.csv"
```
