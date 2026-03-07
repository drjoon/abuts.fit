@echo off
REM reg.cmd - Register ESPRIT Addin DLLs

setlocal
set DLL_PATH=%~dp0bin\x86\Debug\ESPRIT2025AddinProject.dll

echo Resetting ABUTS environment variables...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::SetEnvironmentVariable('ABUTS_BASE_DIRECTORY','C:\\Users\\user\\abuts.fit\\bg','User'); [Environment]::SetEnvironmentVariable('ABUTS_STORAGE_FILLED','C:\\Users\\user\\abuts.fit\\bg\\storage\\2-filled','User'); [Environment]::SetEnvironmentVariable('ABUTS_STORAGE_NC','C:\\Users\\user\\abuts.fit\\bg\\storage\\3-nc','User')"

if not exist "%DLL_PATH%" (
    echo DLL not found: %DLL_PATH%
    exit /b 1
)

echo Registering 32-bit RegAsm...
"C:\Windows\Microsoft.NET\Framework\v4.0.30319\RegAsm.exe" "%DLL_PATH%" /codebase /tlb
if errorlevel 1 (
    echo 32-bit RegAsm failed.
    exit /b 1
)

echo Registration completed (32-bit only).
endlocal