@echo off
setlocal
cd /d "%~dp0\.."
node scripts\build-fishing-cache.js %*
