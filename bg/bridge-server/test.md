# Start 신호 테스트:

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/start" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"ioUid": 61, "panelType": 0, "status": 1}'

# Stop 신호 테스트:

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/stop" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"ioUid": 62, "panelType": 0, "status": 1}'

# 상태 확인:

curl -X GET "http://1.217.31.227:8002/api/cnc/machines/M5/status" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# Alarm (Mode1)

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"uid":"M5","dataType":"GetMachineAlarmInfo","payload":{"headType":0}}'

# GetOPStatus (Mode2, payload 없음)

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"uid":"M5","dataType":"GetOPStatus","timeoutMilliseconds":3000}'

# 프로그램 목록 (메인)

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs?headType=0" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 프로그램 목록 (서브)

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs?headType=1" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 활성 프로그램 확인

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs/active" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 메인 활성화 (SetActivateProgram via /programs/activate, headType=0)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/activate" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"programNo":100}'

# 서브 활성화 (SetActivateProgram via /programs/activate, headType=1)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/activate-sub" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"programNo":3001}'

# 프로그램 삭제 (대용량 NC 정리: 3000/4000/4001 등)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/delete" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":0,"programNo":3000}'

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/delete" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":0,"programNo":4002}'

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/delete" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":0,"programNo":4001}'
