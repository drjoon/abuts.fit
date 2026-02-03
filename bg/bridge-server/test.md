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

curl "http://1.217.31.227:8002/api/cnc/machines/M5/alarms?headType=1" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# Reset

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/reset" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{}'

# 활성 프로그램 확인

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs/active" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 메인 활성화 (SetActivateProgram via /programs/activate, headType=1)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/activate" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"programNo":100}'

# 서브 활성화 (SetActivateProgram via /programs/activate, headType=2)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/activate" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":2,"programNo":3001}'

# 프로그램 삭제 (대용량 NC 정리)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/delete" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"programNo":4000}'

# 업로드 (메인 headType=1)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"slotNo":4000,"path":"M5_20260129-KBDSGYQH-47_s7le4pzf.nc","isNew":true}'

# 다운로드 (메인 headType=1)

**주의**: Hi-Link DLL API는 프로그램 다운로드 시 **약 103KB 크기 제한**이 있습니다. 대용량 프로그램(>103KB)은 뒷부분이 잘린 채로 반환되며, 응답에 `warning` 필드가 포함됩니다.

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs?headType=1&slotNo=4000&path=downloads/M5_4000.nc" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 대용량 파일 다운로드 시 응답 예시 (truncated):

# {

# "success": true,

# "headType": 1,

# "slotNo": 4000,

# "path": "downloads/M5_4000.nc",

# "length": 103761,

# "warning": "TRUNCATED: Hi-Link API readback limit (~103KB). Actual program may be larger. Downloaded 103761 bytes."

# }

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs?headType=1&slotNo=100&path=downloads/M5_100.nc" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

## 스마트(Smart) 연속가공 API

### 1) 스마트 업로드

`POST /api/cnc/machines/{machineId}/smart/upload`

목적: 현재 장비 상태를 보고 `O4000/O4001` 중 안전한 슬롯을 자동 선택한 뒤 업로드한다.

동작:

- 활성 프로그램(`/programs/active`) 슬롯이 4000/4001이면 그 슬롯은 보호(삭제/덮어쓰기 금지)하고, 반대 슬롯을 선택
- 활성 슬롯이 4000/4001이 아니면 기본적으로 4000을 선택
- NC 본문을 `%`로 감싸고, 2행 `O####`를 선택된 슬롯(`O4000`/`O4001`)로 강제

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/smart/upload" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"path":"M5_20260129-KBDSGYQH-47_s7le4pzf.nc","isNew":true}'
```

### 2-1) 스마트 replace (대기 큐 교체)

`POST /api/cnc/machines/{machineId}/smart/replace`

목적: 현재 실행 중인 작업은 유지하고, **대기 큐를 지정된 paths로 교체**한다.

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/smart/replace" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"paths":["M5_20260129-KBDSGYQH-47_s7le4pzf.nc"]}'
```

### 2) 스마트 enqueue

`POST /api/cnc/machines/{machineId}/smart/enqueue`

목적: 연속가공할 프로그램 목록을 큐에 넣는다. (가공 시작은 별도 `/smart/start`)

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/smart/enqueue" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"paths":["M5_job1.nc","M5_job2.nc","M5_job3.nc"],"maxWaitSeconds":1800}'
```

### 3) 스마트 start

`POST /api/cnc/machines/{machineId}/smart/start`

목적: 큐에 작업이 있으면 워커를 시작하고 자동으로 연속 가공한다.

주의:

- 큐가 비어있으면 `409`를 반환하고 종료한다.
- 사이클타임 절감: 가공 중 다음 슬롯에 선업로드(Preload) + 업로드 완료 확인을 수행한다.

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/smart/start" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"
```

### 4) 스마트 dequeue

`POST /api/cnc/machines/{machineId}/smart/dequeue`

목적: 큐에서 작업을 제거한다.

주의:

- 가공중에도 dequeue 가능
- 실행중 작업은 dequeue 불가(409)

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/smart/dequeue" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"jobId":"<jobId>"}'
```

### 5) 스마트 status

`GET /api/cnc/machines/{machineId}/smart/status`

목적: 가공 진행/종료 상태, 경과 시간, 에러/알람 확인(진단용)

```bash
curl "http://1.217.31.227:8002/api/cnc/machines/M5/smart/status" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"
```

# 프로그램 목록 (메인)

curl "http://1.217.31.227:8002/api/cnc/machines/M5/programs?headType=1" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 메인과 서브

메인: headType=1
서브: headType=2
