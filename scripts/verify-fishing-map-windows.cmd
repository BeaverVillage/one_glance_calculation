@echo off
setlocal
cd /d "%~dp0\.."
node scripts\verify-fishing-map.js
