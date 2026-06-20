# UTF-8 BOM file for Windows PowerShell 5.1 Korean text parsing
param(
  [string]$Key = $env:DATA_GO_KR_SERVICE_KEY,
  [string]$Region = "",
  [int]$Rows = 9000,
  [int]$DelayMs = 2500,
  [int]$Retries = 5,
  [int]$TimeoutSec = 120,
  [switch]$Test,
  [switch]$Resume
)

$ErrorActionPreference = "Stop"

if (-not $Key) {
  throw "DATA_GO_KR_SERVICE_KEY 환경변수 또는 -Key 값을 입력해 주세요."
}

if ($Rows -lt 10) { $Rows = 10 }
if ($Rows -gt 9000) { $Rows = 9000 }
if ($Retries -lt 1) { $Retries = 1 }
if ($TimeoutSec -lt 10) { $TimeoutSec = 10 }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$OutDir = Join-Path $Root "assets\data\ev-chargers"
$ChunkDir = Join-Path $OutDir "chunks"
$ProgressDir = Join-Path $OutDir "progress"
$EndpointHttps = "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo"
$EndpointHttp = "http://apis.data.go.kr/B552584/EvCharger/getChargerInfo"
$Version = "v32-powershell-bom"

$Regions = @(
  @{ zcode = "11"; name = "서울" }, @{ zcode = "26"; name = "부산" }, @{ zcode = "27"; name = "대구" }, @{ zcode = "28"; name = "인천" },
  @{ zcode = "29"; name = "광주" }, @{ zcode = "30"; name = "대전" }, @{ zcode = "31"; name = "울산" }, @{ zcode = "36"; name = "세종" },
  @{ zcode = "41"; name = "경기" }, @{ zcode = "51"; name = "강원" }, @{ zcode = "43"; name = "충북" }, @{ zcode = "44"; name = "충남" },
  @{ zcode = "52"; name = "전북" }, @{ zcode = "46"; name = "전남" }, @{ zcode = "47"; name = "경북" }, @{ zcode = "48"; name = "경남" }, @{ zcode = "50"; name = "제주" }
)

$TypeLabels = @{
  "01"="DC차데모"; "02"="AC완속"; "03"="DC차데모+AC3상"; "04"="DC콤보"; "05"="DC차데모+DC콤보";
  "06"="DC차데모+AC3상+DC콤보"; "07"="AC3상"; "08"="DC콤보(완속)"; "09"="NACS"; "10"="DC콤보+NACS"; "11"="DC콤보2(버스전용)"
}
$StatusLabels = @{ "0"="알수없음"; "1"="통신이상"; "2"="충전대기"; "3"="충전중"; "4"="운영중지"; "5"="점검중"; "6"="예약중"; "9"="상태미확인" }

New-Item -ItemType Directory -Force -Path $ChunkDir | Out-Null
New-Item -ItemType Directory -Force -Path $ProgressDir | Out-Null

function Mask-Key([string]$Url) {
  return ($Url -replace '(servicekey=)[^&]+', '$1***' -replace '(serviceKey=)[^&]+', '$1***')
}

function Build-Url([string]$Endpoint, [string]$KeyName, [int]$PageNo, [int]$NumOfRows, [string]$Zcode) {
  # 사용자 PC에서 성공한 직접 PowerShell 호출 형식에 맞춰 servicekey=일반인증키를 그대로 붙입니다.
  return "$Endpoint`?$KeyName=$Key&pageNo=$PageNo&numOfRows=$NumOfRows&zcode=$Zcode&dataType=JSON"
}

function Invoke-EvRequest([int]$PageNo, [int]$NumOfRows, [string]$Zcode) {
  $candidates = @(
    (Build-Url $EndpointHttps "servicekey" $PageNo $NumOfRows $Zcode),
    (Build-Url $EndpointHttps "serviceKey" $PageNo $NumOfRows $Zcode),
    (Build-Url $EndpointHttp "servicekey" $PageNo $NumOfRows $Zcode),
    (Build-Url $EndpointHttp "serviceKey" $PageNo $NumOfRows $Zcode)
  )

  $lastError = $null
  foreach ($url in $candidates) {
    try {
      return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec $TimeoutSec
    } catch {
      $lastError = $_
      Write-Warning "request failed: $($_.Exception.Message)"
      Write-Warning "url: $(Mask-Key $url)"
    }
  }
  throw $lastError
}

function Invoke-EvRequestWithRetry([int]$PageNo, [int]$NumOfRows, [string]$Zcode) {
  $attempt = 1
  while ($attempt -le $Retries) {
    try {
      $response = Invoke-EvRequest -PageNo $PageNo -NumOfRows $NumOfRows -Zcode $Zcode
      $code = Get-ResultCode $response
      if ($code -and $code -ne "00") {
        throw "OpenAPI resultCode=$code resultMsg=$(Get-ResultMsg $response)"
      }
      return $response
    } catch {
      if ($attempt -ge $Retries) { throw }
      $wait = [Math]::Min(120, 5 * [Math]::Pow(2, $attempt - 1))
      Write-Warning "page=$PageNo attempt=$attempt/$Retries failed. wait ${wait}s then retry..."
      Start-Sleep -Seconds $wait
      $attempt += 1
    }
  }
}

function Get-ResultCode($Response) {
  if ($null -eq $Response) { return "" }
  if ($Response.resultCode) { return [string]$Response.resultCode }
  if ($Response.header -and $Response.header.resultCode) { return [string]$Response.header.resultCode }
  if ($Response.response -and $Response.response.header -and $Response.response.header.resultCode) { return [string]$Response.response.header.resultCode }
  return ""
}

function Get-ResultMsg($Response) {
  if ($null -eq $Response) { return "" }
  if ($Response.resultMsg) { return [string]$Response.resultMsg }
  if ($Response.header -and $Response.header.resultMsg) { return [string]$Response.header.resultMsg }
  if ($Response.response -and $Response.response.header -and $Response.response.header.resultMsg) { return [string]$Response.response.header.resultMsg }
  return ""
}

function Get-TotalCount($Response) {
  if ($Response.totalCount) { return [int]$Response.totalCount }
  if ($Response.header -and $Response.header.totalCount) { return [int]$Response.header.totalCount }
  if ($Response.response -and $Response.response.header -and $Response.response.header.totalCount) { return [int]$Response.response.header.totalCount }
  return 0
}

function Get-Items($Response) {
  if ($null -eq $Response) { return @() }
  $items = $null
  if ($Response.items -and $Response.items.item) { $items = $Response.items.item }
  elseif ($Response.response -and $Response.response.body -and $Response.response.body.items -and $Response.response.body.items.item) { $items = $Response.response.body.items.item }
  elseif ($Response.body -and $Response.body.items -and $Response.body.items.item) { $items = $Response.body.items.item }
  if ($null -eq $items) { return @() }
  if ($items -is [System.Array]) { return @($items) }
  return @($items)
}

function Clean-Text($Value) {
  if ($null -eq $Value) { return "" }
  return ([string]$Value).Trim()
}

function To-Number($Value) {
  $text = Clean-Text $Value
  if (-not $text) { return $null }
  $number = 0.0
  if ([double]::TryParse($text, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) { return $number }
  if ([double]::TryParse($text, [ref]$number)) { return $number }
  return $null
}

function Is-Rapid([string]$TypeCode, $Output) {
  $code = (Clean-Text $TypeCode).PadLeft(2, '0')
  $out = To-Number $Output
  if ($out -ne $null -and $out -ge 40) { return $true }
  return @("01","03","04","05","06","09","10","11") -contains $code
}

function Get-StatusLabel([string]$Stat) {
  $key = Clean-Text $Stat
  if ($StatusLabels.ContainsKey($key)) { return $StatusLabels[$key] }
  return "상태 확인 필요"
}

function Merge-RowsToStations($Rows, [string]$Zcode, [string]$RegionName) {
  $stationMap = @{}
  foreach ($row in $Rows) {
    if ((Clean-Text $row.delYn) -eq "Y") { continue }
    $statId = Clean-Text $row.statId
    if (-not $statId) { continue }
    if (-not $stationMap.ContainsKey($statId)) {
      $stationMap[$statId] = [ordered]@{
        statId = $statId
        statNm = Clean-Text $row.statNm
        addr = Clean-Text $row.addr
        addrDetail = Clean-Text $row.addrDetail
        location = Clean-Text $row.location
        lat = To-Number $row.lat
        lng = To-Number $row.lng
        zcode = Clean-Text $(if ($row.zcode) { $row.zcode } else { $Zcode })
        zscode = Clean-Text $row.zscode
        regionName = $RegionName
        busiId = Clean-Text $row.busiId
        bnm = Clean-Text $row.bnm
        busiNm = Clean-Text $row.busiNm
        busiCall = Clean-Text $row.busiCall
        useTime = Clean-Text $row.useTime
        parkingFree = Clean-Text $row.parkingFree
        note = Clean-Text $row.note
        limitYn = Clean-Text $row.limitYn
        limitDetail = Clean-Text $row.limitDetail
        trafficYn = Clean-Text $row.trafficYn
        year = Clean-Text $row.year
        floorNum = Clean-Text $row.floorNum
        floorType = Clean-Text $row.floorType
        chargers = New-Object System.Collections.ArrayList
        chgerTypes = New-Object System.Collections.ArrayList
        chargerCount = 0
        rapidCount = 0
        slowCount = 0
        availableCount = 0
        chargingCount = 0
        troubleCount = 0
        unknownCount = 0
        updatedAt = ""
      }
    }
    $station = $stationMap[$statId]
    $typeCode = (Clean-Text $row.chgerType).PadLeft(2, '0')
    $stat = Clean-Text $row.stat
    $isRapid = Is-Rapid $typeCode $row.output
    $charger = [ordered]@{
      chargerId = Clean-Text $row.chgerId
      typeCode = $typeCode
      typeLabel = $(if ($TypeLabels.ContainsKey($typeCode)) { $TypeLabels[$typeCode] } else { "타입 $typeCode" })
      output = Clean-Text $row.output
      method = Clean-Text $row.method
      stat = $stat
      statLabel = Get-StatusLabel $stat
      updatedAt = Clean-Text $row.statUpdDt
      isRapid = $isRapid
    }
    [void]$station.chargers.Add($charger)
    if ($typeCode -and -not $station.chgerTypes.Contains($typeCode)) { [void]$station.chgerTypes.Add($typeCode) }
    $station.chargerCount += 1
    if ($isRapid) { $station.rapidCount += 1 } else { $station.slowCount += 1 }
    if ($stat -eq "2") { $station.availableCount += 1 }
    elseif ($stat -eq "3") { $station.chargingCount += 1 }
    elseif (@("1","4","5") -contains $stat) { $station.troubleCount += 1 }
    else { $station.unknownCount += 1 }
    $upd = Clean-Text $row.statUpdDt
    if ($upd -and ($station.updatedAt -eq "" -or $upd -gt $station.updatedAt)) { $station.updatedAt = $upd }
  }
  return @($stationMap.Values | Sort-Object statNm, statId)
}

function Write-JsonFile($Path, $Object) {
  $json = $Object | ConvertTo-Json -Depth 30 -Compress
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Read-ProgressRows([string]$Zcode) {
  $file = Join-Path $ProgressDir "$Zcode.rows.jsonl"
  if (-not $Resume -or -not (Test-Path $file)) { return @() }
  Write-Host "[$Zcode] resume progress file: $file"
  $list = New-Object System.Collections.ArrayList
  Get-Content $file -Encoding UTF8 | ForEach-Object {
    if ($_.Trim()) { [void]$list.Add(($_ | ConvertFrom-Json)) }
  }
  return @($list)
}

function Append-ProgressRows([string]$Zcode, $Items) {
  if (-not $Items -or $Items.Count -eq 0) { return }
  $file = Join-Path $ProgressDir "$Zcode.rows.jsonl"
  foreach ($item in $Items) {
    ($item | ConvertTo-Json -Depth 20 -Compress) | Add-Content -Path $file -Encoding UTF8
  }
}

function Clear-Progress([string]$Zcode) {
  $file = Join-Path $ProgressDir "$Zcode.rows.jsonl"
  if (Test-Path $file) { Remove-Item $file -Force }
}

function Collect-Region([string]$Zcode, [string]$Name) {
  Write-Host "[$Zcode] $Name collecting... rows=$Rows delayMs=$DelayMs retries=$Retries"
  $rowsList = New-Object System.Collections.ArrayList
  $resumedRows = Read-ProgressRows $Zcode
  foreach ($item in $resumedRows) { [void]$rowsList.Add($item) }
  $pageNo = [Math]::Floor($rowsList.Count / $Rows) + 1
  if ($rowsList.Count -gt 0) { Write-Host "[$Zcode] resume rows=$($rowsList.Count), next page=$pageNo" }
  if ($rowsList.Count -eq 0 -and -not $Resume) { Clear-Progress $Zcode }

  while ($true) {
    $response = Invoke-EvRequestWithRetry -PageNo $pageNo -NumOfRows $Rows -Zcode $Zcode
    $items = @(Get-Items $response)
    $total = Get-TotalCount $response
    foreach ($item in $items) { [void]$rowsList.Add($item) }
    Append-ProgressRows -Zcode $Zcode -Items $items
    Write-Host "  page=$pageNo items=$($items.Count) rowsSoFar=$($rowsList.Count) total=$total"
    if ($items.Count -eq 0 -or $items.Count -lt $Rows) { break }
    $pageNo += 1
    if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }
  }

  $stations = Merge-RowsToStations -Rows @($rowsList) -Zcode $Zcode -RegionName $Name
  $updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  $out = [ordered]@{
    version = $Version
    zcode = $Zcode
    regionName = $Name
    updatedAt = $updatedAt
    source = "한국환경공단_전기자동차 충전소 정보"
    collection = [ordered]@{ rowsPerPage = $Rows; rowCount = $rowsList.Count }
    stationCount = $stations.Count
    stations = $stations
  }
  $file = Join-Path $ChunkDir "$Zcode.json"
  Write-JsonFile -Path $file -Object $out
  Clear-Progress $Zcode
  $bytes = (Get-Item $file).Length
  Write-Host "[$Zcode] saved $file stations=$($stations.Count) bytes=$bytes"
  return [ordered]@{ name = $Name; file = "chunks/$Zcode.json"; stationCount = $stations.Count; bytes = $bytes }
}

$targets = @()
if ($Region) {
  $targets = @($Regions | Where-Object { $_.zcode -eq $Region -or $_.name -eq $Region })
  if ($targets.Count -eq 0) { throw "알 수 없는 지역입니다: $Region" }
} else {
  $targets = $Regions
}

if ($Test) {
  $target = $targets[0]
  Write-Host "[test] $($target.zcode) $($target.name) 10 rows request..."
  $response = Invoke-EvRequestWithRetry -PageNo 1 -NumOfRows 10 -Zcode $target.zcode
  $items = @(Get-Items $response)
  Write-Host "[test] resultCode=$(Get-ResultCode $response) resultMsg=$(Get-ResultMsg $response) totalCount=$(Get-TotalCount $response) itemCount=$($items.Count)"
  if ($items.Count -gt 0) {
    $first = $items[0] | ConvertTo-Json -Depth 8
    Write-Host "[test] first item=$first"
  }
  exit 0
}

$updatedAt = (Get-Date).ToUniversalTime().ToString("o")
$chunks = @{}
$indexPath = Join-Path $OutDir "index.json"
if ((Test-Path $indexPath) -and $Region) {
  try {
    $prev = Get-Content $indexPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($prev.chunks) {
      foreach ($prop in $prev.chunks.PSObject.Properties) { $chunks[$prop.Name] = $prop.Value }
    }
  } catch {}
}

foreach ($target in $targets) {
  $summary = Collect-Region -Zcode $target.zcode -Name $target.name
  $chunks[$target.zcode] = $summary
}

$totalStations = 0
foreach ($entry in $chunks.Values) { $totalStations += [int]$entry.stationCount }
$index = [ordered]@{ version = $Version; updatedAt = $updatedAt; totalStations = $totalStations; chunks = $chunks }
Write-JsonFile -Path $indexPath -Object $index
$regionsOut = [ordered]@{
  version = $Version
  updatedAt = $updatedAt
  regions = @($Regions | ForEach-Object {
    $chunk = $chunks[$_.zcode]
    [ordered]@{ zcode = $_.zcode; name = $_.name; file = $chunk.file; stationCount = $chunk.stationCount; bytes = $chunk.bytes }
  })
}
Write-JsonFile -Path (Join-Path $OutDir "regions.json") -Object $regionsOut
Write-Host "done. totalStations=$totalStations"
