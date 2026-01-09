@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem local.env 로드 (KEY=VALUE)
if exist local.env (
  for /f "usebackq tokens=1,* delims==" %%A in ("local.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
) else (
  echo local.env 파일이 없습니다. RHINOCODE_BIN, RHINO_APP 등을 설정하세요.
  exit /b 1
)

rem 필수 환경변수 확인
if not defined RHINOCODE_BIN (
  echo local.env에 RHINOCODE_BIN이 없습니다. 예: RHINOCODE_BIN=C:\Program Files\Rhino 8\System\RhinoCode.exe
  exit /b 1
)
if not defined RHINO_APP (
  echo local.env에 RHINO_APP가 없습니다. 예: RHINO_APP=C:\Program Files\Rhino 8\System\Rhino.exe
  exit /b 1
)

rem 가상환경 활성화
if not exist .venv\Scripts\activate.bat (
  echo .venv가 없습니다. 먼저 init.bat을 실행하세요.
  exit /b 1
)
call .venv\Scripts\activate.bat || exit /b %errorlevel%

rem python-multipart 설치 여부 확인
python -c "import multipart" >nul 2>&1 || (
  echo python-multipart가 설치되어 있지 않습니다.
  echo 아래를 실행하세요:
  echo   call .venv\Scripts\activate.bat
  echo   pip install -r requirements.txt
  exit /b 1
)

echo RHINOCODE_BIN=%RHINOCODE_BIN%
echo RHINO_APP=%RHINO_APP%

python -m uvicorn app:app --host 0.0.0.0 --port 8000