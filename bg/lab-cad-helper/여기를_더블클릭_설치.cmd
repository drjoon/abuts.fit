@echo off
REM Abuts lab helper - one-time install (double-click). Logic lives in install.ps1 (UTF-8 BOM).
REM Keep this file ASCII-only: cmd parses batch files in the OEM code page.
setlocal
if not exist "%~dp0install.ps1" (
  echo install.ps1 not found. Extract the whole zip first, then run this again.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0install.ps1"
exit /b %ERRORLEVEL%
