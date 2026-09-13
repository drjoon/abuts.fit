@echo off
REM related files: bg/pc1/Start-Pc1Apps.ps1, bg/pc1/Install-Pc1Autostart.ps1
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Pc1Apps.ps1" %*
endlocal
