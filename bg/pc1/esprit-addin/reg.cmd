@echo off
REM reg.cmd - Register ESPRIT Addin DLLs

setlocal EnableDelayedExpansion
set "DLL_PATH=%~dp0bin\x86\Debug\ESPRIT2025AddinProject.dll"
for %%I in ("!DLL_PATH!") do set "DLL_DIR=%%~dpI"
set "ESPRIT_PROG=C:\Program Files (x86)\D.P.Technology\ESPRIT\Prog"
set "ESPRIT_ANNEX=C:\Program Files (x86)\Common Files\D.P.Technology\AnnexLibraries"

echo Resetting ABUTS environment variables...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::SetEnvironmentVariable('ABUTS_BASE_DIRECTORY','C:\Users\user\abuts.fit\bg','User'); [Environment]::SetEnvironmentVariable('ABUTS_STORAGE_FILLED','C:\Users\user\abuts.fit\bg\storage\2-filled','User'); [Environment]::SetEnvironmentVariable('ABUTS_STORAGE_NC','C:\Users\user\abuts.fit\bg\storage\3-nc','User')"

if not exist "!DLL_PATH!" (
    echo DLL not found: !DLL_PATH!
    exit /b 1
)

if not exist "!ESPRIT_PROG!\Interop.Esprit.dll" (
    echo ESPRIT interop DLL not found: !ESPRIT_PROG!\Interop.Esprit.dll
    exit /b 1
)

if not exist "!ESPRIT_ANNEX!\EspritAddInAssistant.dll" (
    echo ESPRIT annex DLL not found: !ESPRIT_ANNEX!\EspritAddInAssistant.dll
    exit /b 1
)

echo Copying ESPRIT interop dependencies...
copy /Y "!ESPRIT_PROG!\Interop.Esprit.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritFeatures.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritGeometry.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritGeometryBase.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritGeometryRoutines.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritGraphicsIO.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritTechnology.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_PROG!\Interop.EspritConstants.dll" "!DLL_DIR!" >nul
if exist "!ESPRIT_PROG!\Interop.EspritCommands.dll" copy /Y "!ESPRIT_PROG!\Interop.EspritCommands.dll" "!DLL_DIR!" >nul
copy /Y "!ESPRIT_ANNEX!\EspritAddInAssistant.dll" "!DLL_DIR!" >nul
if exist "!ESPRIT_ANNEX!\EspritAnnex.dll" copy /Y "!ESPRIT_ANNEX!\EspritAnnex.dll" "!DLL_DIR!" >nul

set "PATH=!ESPRIT_PROG!;!ESPRIT_ANNEX!;!PATH!"

echo Registering 32-bit RegAsm...
"C:\Windows\Microsoft.NET\Framework\v4.0.30319\RegAsm.exe" "!DLL_PATH!" /codebase /tlb
if errorlevel 1 (
    echo 32-bit RegAsm failed.
    exit /b 1
)

echo Registration completed (32-bit only).
endlocal