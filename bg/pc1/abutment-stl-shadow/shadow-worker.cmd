@echo off
rem related files:
rem - bg/pc1/Start-Pc1Apps.ps1 (Start-AbutmentStlShadowWorker)
rem - web/backend/scripts/abutment-stl-js/build-pc1-shadow-package.mjs (builds dist\)
rem - web/backend/scripts/abutment-stl-js/shadow-remote-worker.js
rem
rem Shadow worker for the JS port of the Rhino pipeline (compare-only).
rem Talks to the backend only (/api/bg/abutment-stl-shadow/*). No DB or AWS keys here.
rem Reuses rhino-server\compute\local.env (BACKEND_BASE, RHINO_SHARED_SECRET).
setlocal
set "LOG_DIR=%~dp0..\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "ENV_FILE=%~dp0..\rhino-server\compute\local.env"
set TZ=Asia/Seoul
pushd "%~dp0dist"
:loop
echo [%date% %time%] shadow-worker start >> "%LOG_DIR%\abutment-stl-shadow.log"
node shadow-remote-worker.js >> "%LOG_DIR%\abutment-stl-shadow.log" 2>&1
echo [%date% %time%] shadow-worker exited code=%errorlevel%, restart in 30s >> "%LOG_DIR%\abutment-stl-shadow.log"
timeout /t 30 /nobreak > nul
goto loop
