@echo off
setlocal
cd /d "%~dp0\.."
node scripts\build-free-wifi-cache.js %*
