@echo off
setlocal
cd /d "%~dp0.."
node scripts\prepare-public-toilet-addresses.js %*
endlocal
