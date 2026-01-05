set BRIDGE_SHARED_SECRET=t1ZYB4ELMWBKHDuyyUgnx4HdyRg
set BRIDGE_STORE_ROOT=C:\CNCStore

:: 현재 배치 파일이 위치한 경로를 기준으로 상대 경로 설정
cd /d "%~dp0"
cd bin\x86\Debug
start "HiLinkBridgeService" HiLinkBridgeWebApi48.exe