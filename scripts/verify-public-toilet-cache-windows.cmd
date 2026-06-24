@echo off
setlocal
cd /d "%~dp0.."
node scripts\verify-public-toilet-cache.js %*
endlocal
