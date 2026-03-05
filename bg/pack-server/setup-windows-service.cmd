@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Determine script base directory
set "BASEDIR=%~dp0"
cd /d "%BASEDIR%"
set "SERVICE_NAME=AbutsPackPrintServer"
set "PS_SCRIPT=%BASEDIR%install-windows-service.ps1"

REM Check for admin rights (requires elevation)
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator privilege...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -Verb RunAs -FilePath '%COMSPEC%' -ArgumentList '/c ^"^"%~f0^" %*^"'"
  exit /b
)

REM Detect Node.js path (prefer PATH, then default)
set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%~fi"
)
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

REM Detect NSSM path (prefer C:\tools, then PATH, then common Program Files locations)
set "NSSM_EXE=C:\tools\nssm\nssm.exe"
if not exist "%NSSM_EXE" (
  set "NSSM_EXE="
  for /f "delims=" %%i in ('where nssm 2^>nul') do (
    if not defined NSSM_EXE set "NSSM_EXE=%%~fi"
  )
  if not defined NSSM_EXE if exist "C:\Program Files\nssm\nssm.exe" set "NSSM_EXE=C:\Program Files\nssm\nssm.exe"
  if not defined NSSM_EXE if exist "C:\Program Files\nssm-2.24\win64\nssm.exe" set "NSSM_EXE=C:\Program Files\nssm-2.24\win64\nssm.exe"
  if not defined NSSM_EXE if exist "C:\Program Files\nssm-2.24\win32\nssm.exe" set "NSSM_EXE=C:\Program Files\nssm-2.24\win32\nssm.exe"
)

REM Auto-install NSSM if missing
if not defined NSSM_EXE (
  echo NSSM not found. Attempting to install via winget or direct download...
  call :InstallNSSM
)

echo.
echo Detected executables:
echo   Node.js: %NODE_EXE%
echo   NSSM  : %NSSM_EXE%
echo.
if not defined NODE_EXE (
  echo [WARN] Node.js not found on PATH. PowerShell will try to auto-install/detect.
)
if defined NODE_EXE if not exist "%NODE_EXE" (
  echo [WARN] Node.js path appears invalid: %NODE_EXE%
  set "NODE_EXE="
)
if not defined NSSM_EXE (
  echo [WARN] NSSM not found. Attempting to install...
  call :InstallNSSM
  call :RefreshNSSMDetected
)
if defined NSSM_EXE if not exist "%NSSM_EXE" (
  echo [WARN] NSSM path appears invalid: %NSSM_EXE%
  set "NSSM_EXE="
)

:menu
echo ============================================
echo   Abuts Pack Print - Windows Service Tool
echo ============================================
echo   1) Install service
echo   2) Show status
echo   3) Restart service
echo   4) Remove service
echo   5) Exit
echo --------------------------------------------
set /p CHOICE=Select an option [1-5]: 

if "%CHOICE%"=="1" set ACTION=install& goto :run
if "%CHOICE%"=="2" set ACTION=status& goto :run
if "%CHOICE%"=="3" set ACTION=restart& goto :run
if "%CHOICE%"=="4" set ACTION=remove& goto :run
if "%CHOICE%"=="5" goto :end

echo Invalid input. Try again.
echo.
goto :menu

:run
echo.
echo Running PowerShell script... (Action=%ACTION%)
set "PSARGS=-Action %ACTION% -ServiceName %SERVICE_NAME%"
if defined NSSM_EXE set "PSARGS=%PSARGS% -NssmPath \"%NSSM_EXE%\""
if defined NODE_EXE set "PSARGS=%PSARGS% -NodePath \"%NODE_EXE%\""
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %PSARGS%
set EXITCODE=%errorlevel%
echo.
echo Done. (exitcode=%EXITCODE%)
echo Logs: "%BASEDIR%logs"
echo.
pause

goto :menu

:end
endlocal
exit /b 0


:InstallNSSM
REM Try winget first
where winget >nul 2>&1
if %errorlevel%==0 (
  echo Installing NSSM via winget...
  winget install -e --id NSSM.NSSM --accept-package-agreements --accept-source-agreements
  call :RefreshNSSMDetected
  if defined NSSM_EXE goto :eof
)

REM Fallback: direct download and install to C:\tools\nssm
echo Downloading NSSM 2.24 zip and extracting to C:\tools\nssm ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "^$
  $ErrorActionPreference='Stop';
  $url='https://nssm.cc/release/nssm-2.24.zip';
  $zip=Join-Path $env:TEMP 'nssm-2.24.zip';
  try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing } catch { exit 2 }
  $dest=Join-Path $env:TEMP 'nssm-2.24';
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force;
  $arch=if ($env:PROCESSOR_ARCHITECTURE -match '64') { 'win64' } else { 'win32' };
  $src=Join-Path (Join-Path $dest 'nssm-2.24') (Join-Path $arch 'nssm.exe');
  if (!(Test-Path $src)) { exit 3 }
  $target='C:\\tools\\nssm'; New-Item -ItemType Directory -Force -Path $target | Out-Null;
  Copy-Item -Force $src (Join-Path $target 'nssm.exe');
  Write-Host 'NSSM installed at' (Join-Path $target 'nssm.exe');
"

call :RefreshNSSMDetected
goto :eof

:RefreshNSSMDetected
set "NSSM_EXE=C:\tools\nssm\nssm.exe"
if not exist "%NSSM_EXE" (
  set "NSSM_EXE="
  for /f "delims=" %%i in ('where nssm 2^>nul') do (
    if not defined NSSM_EXE set "NSSM_EXE=%%~fi"
  )
  if not defined NSSM_EXE if exist "C:\Program Files\nssm\nssm.exe" set "NSSM_EXE=C:\Program Files\nssm\nssm.exe"
  if not defined NSSM_EXE if exist "C:\Program Files\nssm-2.24\win64\nssm.exe" set "NSSM_EXE=C:\Program Files\nssm-2.24\win64\nssm.exe"
  if not defined NSSM_EXE if exist "C:\Program Files\nssm-2.24\win32\nssm.exe" set "NSSM_EXE=C:\Program Files\nssm-2.24\win32\nssm.exe"
)
goto :eof
