@echo off
setlocal
set TARGET_DIR=C:\abuts.fit\bg\esprit-addin\bin\x86\Debug
set EXE_NAME=ESPRIT2025AddinProject.exe

cd /d "%TARGET_DIR%"
"%EXE_NAME%"
echo Exit code: %ERRORLEVEL%
pause