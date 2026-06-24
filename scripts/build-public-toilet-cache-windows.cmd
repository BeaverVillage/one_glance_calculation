@echo off
setlocal
cd /d "%~dp0.."
node scripts\build-public-toilet-cache.js %*
endlocal
