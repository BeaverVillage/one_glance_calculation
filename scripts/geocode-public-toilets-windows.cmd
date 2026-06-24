@echo off
setlocal
cd /d "%~dp0.."
node scripts\geocode-public-toilets.js %*
endlocal
