@echo off

setlocal EnableExtensions

chcp 65001 >nul



pushd "%~dp0"



if not exist ".venv\Scripts\python.exe" goto :no_venv



echo [INFO] Starting Rhino Server (FastAPI)...

".venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000



if errorlevel 1 goto :server_failed



popd

endlocal



goto :eof



:no_venv

echo [ERROR] Virtual environment (.venv) not found.

echo Please run init.bat first.

pause

popd

endlocal

exit /b 1



:server_failed

echo [ERROR] Server failed with error code: %ERRORLEVEL%

pause

popd

endlocal

exit /b %ERRORLEVEL%

