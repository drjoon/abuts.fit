@echo off
setlocal

@echo off
set TARGET_DIR=C:\abuts.fit\bg\esprit-addin\bin\x86\Debug
set EXE_NAME=ESPRIT2025AddinProject.exe

:: 이미 관리자 권한이면 바로 실행
net session >nul 2>&1
if %errorlevel% == 0 goto :RUN

:: 관리자 권한 요청
powershell -NoProfile -Command ^
  "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
exit /b

:RUN
pushd "%TARGET_DIR%"
echo === ESPRIT Add-In Launcher (Acrodent) ===
"%EXE_NAME%"
popd

pause