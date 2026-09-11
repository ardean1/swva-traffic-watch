@echo off
cd /d "%~dp0"
echo Starting SWVA Traffic Watch...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause
