set BRIDGE_SHARED_SECRET=t1ZYB4ELMWBKHDuyyUgnx4HdyRg
set BRIDGE_STORE_ROOT=C:\abuts.fit\bg\storage\3-nc
set BRIDGE_SERIAL=acwa-e8fa-65af-13df
set DUMMY_CNC_SCHEDULER_ENABLED=true
set BRIDGE_SELF_BASE=http://localhost:8002
set BACKEND_BASE=https://abuts.fit/api

set CNC_START_IOUID=61
set CNC_BUSY_IOUID=61
set CNC_JOB_ASSUME_MINUTES=20

:: 현재 배치 파일이 위치한 경로를 기준으로 상대 경로 설정
cd /d "%~dp0"
cd bin\x86\Debug
start "HiLinkBridgeService" HiLinkBridgeWebApi48.exe