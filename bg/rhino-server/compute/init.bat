@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

echo [1/4] 기존 가상환경(.venv) 제거 중...
if exist ".venv" rmdir /s /q .venv

echo [2/4] 가상환경 생성 중...
py -3 -m venv .venv
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python 가상환경 생성 실패. Python이 설치되어 있는지 확인하세요.
    pause
    exit /b 1
)

echo [3/4] 필수 패키지 설치 중...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\pip.exe" install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 패키지 설치 실패.
    pause
    exit /b 1
)

echo [4/4] 설정 파일(local.env) 확인 중...
if not exist "local.env" (
    echo [WARN] local.env 파일이 없습니다. 기본값을 생성합니다.
    echo RHINOCODE_BIN=C:\Program Files\Rhino 8\System\RhinoCode.exe > local.env
    echo RHINO_APP=C:\Program Files\Rhino 8\System\Rhino.exe >> local.env
    echo local.env를 본인 환경에 맞게 수정하세요.
)

echo.
echo ==========================================
echo 초기화가 완료되었습니다.
echo 이제 rhino.cmd를 실행하여 서버를 구동하세요.
echo ==========================================
echo.
pause
endlocal
