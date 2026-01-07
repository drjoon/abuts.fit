@echo off
setlocal

rem 기존 가상환경 제거
if exist .venv (
  rmdir /s /q .venv
)

rem 가상환경 생성 및 활성화
python -m venv .venv || exit /b %errorlevel%
call ".venv\Scripts\activate.bat" || exit /b %errorlevel%

rem 필수 패키지 설치
python -m pip install --upgrade pip || exit /b %errorlevel%
pip install -r requirements.txt requests || exit /b %errorlevel%

rem 서버 실행
python -m uvicorn app:app --host 127.0.0.1 --port 8000
