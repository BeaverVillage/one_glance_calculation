@echo off
setlocal
cd /d "%~dp0.."
node scripts\verify-public-toilet-prep.js %*
endlocal
