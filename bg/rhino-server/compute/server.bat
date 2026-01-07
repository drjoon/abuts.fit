@echo off
setlocal

rem test.env 로드 (KEY=VALUE 형태)
if exist test.env (
  for /f "usebackq tokens=1,2 delims==" %%A in ("test.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
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

python -m uvicorn app:app --host 0.0.0.0 --port 8000
