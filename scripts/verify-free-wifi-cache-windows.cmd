@echo off
setlocal
cd /d "%~dp0\.."
node scripts\verify-free-wifi-cache.js %*
