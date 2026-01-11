@echo off
setlocal
chcp 65001 >nul

pushd "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found.
    echo Please run init.bat first.
    pause
    exit /b 1
)

echo [INFO] Starting Rhino Server...
".venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Server failed with error code: %ERRORLEVEL%
    pause
)

popd
endlocal
