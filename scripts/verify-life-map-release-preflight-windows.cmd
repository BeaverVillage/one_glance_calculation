@echo off
setlocal
cd /d "%~dp0\.."
node scripts\verify-life-map-release-preflight.js
endlocal
