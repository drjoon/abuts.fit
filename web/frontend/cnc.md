# 프로그램 로딩

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{
"uid": "M5",
"dataType": "UpdateActivateProg",
"payload": { "programNo": 100 },
"timeoutMilliseconds": 5000
}'

# 로딩된 프로그램 조회

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{
"uid": "M5",
"dataType": "GetActivateProgInfo",
"timeoutMilliseconds": 5000
}'

# allowJobStart

curl -X POST "http://1.217.31.227:8002/api/core/machines" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"uid":"M5","name":"M5","allowJobStart":true}'

# 추가 확인 사항

브리지에서 장비 상태(Stop/Alarm 해제)나 AUTO/MACHINE MAIN/SUB ON 여부는 직접 제어하지 않으므로
CNC 패널에서 준비 상태를 맞춰 놓아야 실제로 가공이 시작됩니다.

# start

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/start" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"status":1,"ioUid":0}'

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/start" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"status":0,"ioUid":0}'

# 알람 조회 (headType 기본 0)

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"uid":"M5","dataType":"GetMachineAlarmInfo","payload":{"headType":0},"timeoutMilliseconds":5000}'

# 프로그램 리스트 조회 Main

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{
"uid": "M5",
"dataType": "GetProgListInfo",
"payload": 0,
"timeoutMilliseconds": 5000
}'

# 프로그램 리스트 조회 Sub

curl -X POST "http://1.217.31.227:8002/api/cnc/raw" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{
"uid": "M5",
"dataType": "GetProgListInfo",
"payload": 1,
"timeoutMilliseconds": 5000
}'
