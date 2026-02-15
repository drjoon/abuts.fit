# Start 신호 테스트:

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M4/start" \
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
 -d '{"headType":1,"programNo":4000}'

# 서브 활성화 (SetActivateProgram via /programs/activate, headType=2)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/programs/activate" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":2,"programNo":3001}'

# 프로그램 삭제 (대용량 NC 정리)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M4/programs/delete" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"programNo":3000}'

# 업로드 (메인 headType=1)

curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M4/programs" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"slotNo":4000,"path":"M4_20260129-KBDSGYQH-47_w7bjjwjd.nc","isNew":true}'

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

### 1) 스마트 업로드 (이중 응답 방식)

`POST /api/cnc/machines/{machineId}/smart/upload`

목적: `O4000` 슬롯에 NC 프로그램을 업로드한다.

**이중 응답 방식:**

1. **즉시 응답 (202 Accepted)**: jobId를 반환하고 작업 수락 확인
2. **완료 응답**: GET `/api/cnc/machines/{machineId}/jobs/{jobId}`로 작업 결과 조회

#### 1-1) 업로드 요청 (즉시 응답)

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M4/smart/upload" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"path":"M5_20260212-BZBJTWNY-27-1_6qqwvdra.nc","isNew":true}'
```

**응답 (202 Accepted):**

```json
{
  "success": true,
  "message": "Smart upload job accepted",
  "jobId": "a1b2c3d4e5f6g7h8",
  "machineId": "M5",
  "path": "M5_20260128-MMSESKHM-27_52ggwysf.nc"
}
```

#### 1-2) 작업 결과 조회

```bash
curl "http://1.217.31.227:8002/api/cnc/machines/M5/jobs/2285bef76c6b4d2da03ab53c1f5621be" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"
```

**응답 (작업 진행 중):**

```json
{
  "jobId": "a1b2c3d4e5f6g7h8",
  "status": "PROCESSING",
  "result": null,
  "createdAtUtc": "2026-02-04T06:30:00Z"
}
```

**응답 (작업 완료):**

```json
{
  "jobId": "a1b2c3d4e5f6g7h8",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "message": "Smart program uploaded",
    "headType": 1,
    "slotNo": 4000,
    "programName": "O4000",
    "path": "M5_20260128-MMSESKHM-27_v0tvldch.nc",
    "length": 179148,
    "bytes": 179148
  },
  "createdAtUtc": "2026-02-04T06:30:00Z"
}
```

**응답 (작업 실패):**

````json
{
  "jobId": "a1b2c3d4e5f6g7h8",
  "status": "FAILED",
  "result": {
    "success": false,
    "message": "upload failed",
    "usedMode": "Mode1"
  },
  "createdAtUtc": "2026-02-04T06:30:00Z"
}

동작:

- NC 본문을 `%`로 감싸고, 2행 `O####`를 `O4000`으로 강제

### 2) 스마트 다운로드 (이중 응답 방식)

`POST /api/cnc/machines/{machineId}/smart/download`

목적: 장비에서 프로그램을 다운로드하고 파일로 저장한다.

**이중 응답 방식:**
1. **즉시 응답 (202 Accepted)**: jobId를 반환하고 작업 수락 확인
2. **완료 응답**: GET `/api/cnc/machines/{machineId}/jobs/{jobId}`로 작업 결과 조회

#### 2-1) 다운로드 요청 (즉시 응답)

```bash
curl -X POST "http://1.217.31.227:8002/api/cnc/machines/M5/smart/download" \
 -H "Content-Type: application/json" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg" \
 -d '{"headType":1,"programNo":4000,"path":"downloads/M5_4000.nc"}'
```

**응답 (202 Accepted):**
```json
{
  "success": true,
  "message": "Smart download job accepted",
  "jobId": "02394e2da5364c39af986b451911604d",
  "machineId": "M5",
  "headType": 1,
  "programNo": 4000
}
```

#### 2-2) 작업 결과 조회

```bash
curl "http://1.217.31.227:8002/api/cnc/machines/M5/jobs/188fbce9b7224c1886a02370f7fda88d" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"
```

**응답 (작업 완료):**
```json
{
  "jobId": "02394e2da5364c39af986b451911604d",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "headType": 1,
    "slotNo": 4000,
    "path": "downloads/M5_4000.nc",
    "length": 179148,
    "warning": null
  },
  "createdAtUtc": "2026-02-04T06:30:00Z"
}
```

**응답 (대용량 파일 - truncated 경고):**
```json
{
  "jobId": "02394e2da5364c39af986b451911604d",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "headType": 1,
    "slotNo": 4000,
    "path": "downloads/M5_4000.nc",
    "length": 102480,
    "warning": "TRUNCATED: Hi-Link API readback limit (~103KB). Actual program may be larger. Downloaded 102480 bytes."
  },
  "createdAtUtc": "2026-02-04T06:30:00Z"
}
```


# 프로그램 목록 (메인)

curl "http://1.217.31.227:8002/api/cnc/machines/M4/programs?headType=1" \
 -H "X-Bridge-Secret: t1ZYB4ELMWBKHDuyyUgnx4HdyRg"

# 메인과 서브

메인: headType=1
서브: headType=2
````
