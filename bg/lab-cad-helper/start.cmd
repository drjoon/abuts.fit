@echo off
REM 개발/디버그용 콘솔 실행. 기공소는 「여기를_더블클릭_설치.cmd」를 쓰세요.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lab-cad-helper.ps1"
pause
