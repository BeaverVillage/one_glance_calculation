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

$script = Join-Path $PSScriptRoot "build-ev-charger-cache.ps1"
$params = @{
  Key = $Key
  Region = $Region
  Rows = $Rows
  DelayMs = $DelayMs
  Retries = $Retries
  TimeoutSec = $TimeoutSec
}
if ($Test) { $params.Test = $true }
if ($Resume) { $params.Resume = $true }
& $script @params
