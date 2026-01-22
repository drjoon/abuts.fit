@echo off
setlocal

cd /d "%~dp0"

echo [1/4] Removing existing venv (.venv)...
if exist ".venv" rmdir /s /q .venv

echo [2/4] Creating venv (.venv)...
set "PY_CMD=py"
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 -m venv ".venv"
) else (
  set "PY_CMD=python"
  where python >nul 2>nul
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Could not find 'py' or 'python' in PATH.
    pause
    exit /b 1
  )
  python -m venv ".venv"
)

if %ERRORLEVEL% neq 0 (
  echo [ERROR] Failed to create venv. Please install Python.
  pause
  exit /b 1
)

echo [3/4] Installing packages...
"%~dp0\.venv\Scripts\python.exe" -m pip install --upgrade pip
"%~dp0\.venv\Scripts\python.exe" -m pip install -r "%~dp0\requirements.txt"
if %ERRORLEVEL% neq 0 (
  echo [ERROR] pip install failed.
  pause
  exit /b 1
)

echo [4/4] Checking local.env...
if not exist "%~dp0\local.env" (
  echo [WARN] local.env not found. Creating default.
  echo RHINOCODE_BIN=C:\Program Files\Rhino 8\System\RhinoCode.exe> "%~dp0\local.env"
  echo RHINO_APP=C:\Program Files\Rhino 8\System\Rhino.exe>> "%~dp0\local.env"
  echo Please update local.env for your environment.
)

echo.
echo ==========================================
echo Init completed.
echo Run rhino.cmd to start the server.
echo ==========================================
echo.
pause
endlocal
