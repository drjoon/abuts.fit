# Hi-Link Bridge Service Development Rules

이 문서는 `abuts.fit` 프로젝트의 Hi-Link Bridge Service (HiLinkBridgeWebApi48) 작업 내용과 유지보수 규칙을 정리합니다.

## 1. 비즈니스 및 공통 규칙 (Global Sync)

### 1.0 파일명/파일메타 단일 소스(SSOT)

- **표준 파일명**: 백엔드에서 요청을 식별하는 파일명은 `filePath`(표준명)입니다.
- **업로더 원본명**: 업로더 원본 파일명은 `originalName`으로만 보관합니다.
- **Bridge 내부 파일명**: Bridge-server에서 CNC 전송을 위해 사용하는 `O####.nc`는 로컬/장비 전송용이며, 백엔드 SSOT 파일명과 분리합니다.
- **백엔드 등록**: `bg/register-file` 호출 시 `originalFileName`에는 표준명(`filePath`)을 사용합니다.

### 1.1 CNC 프로그램 번호 및 파일명

- **프로그램 번호 형식**: `O` + 네 자리 숫자 (예: `O0001`, `O3001`).
- **파일명 규칙**: 브리지 서버 및 로컬에 저장되는 프로그램 파일명은 항상 `O####.nc` 형식을 사용합니다.
- **전송 규칙**: CNC 장비(Hi-Link)로 프로그램 번호를 전송하거나 활성화할 때는 확장자 없이 **숫자 4자리**만 사용합니다.
- **정규화**: 외부에서 들어오는 파일명이나 프로그램 번호는 항상 `O####` 형식으로 정규화하여 처리합니다.

### 1.2 로트넘버(생산번호)

- **Prefix**: `AB`(Custom Abutment), `CR`(Crown)
- **Format**: `[Prefix][YYYYMMDD]-[AAA~]` (예: `AB20251206-AAA`)
- **부여 시점**: 가공 단계 진입 시 백엔드에서 자동 부여됩니다.

### 1.3 장비 식별 (UID)

- 각 CNC 장비는 고유한 `UID`로 식별됩니다.
- Hi-Link DLL 호출 시 이 UID를 기반으로 대상 장비를 지정합니다.

## 2. 브리지 서비스 시스템 규칙

### 2.1 파일 파이프라인 및 가공 스케줄링

- **감시 경로**: `/bg/storage/3-direct` 폴더를 실시간으로 감시합니다.
- **가공 스케줄링**:
  1. 새로운 NC 파일이 발견되면 `abuts.fit` 백엔드 API를 통해 가공 스케줄을 확인합니다.
  2. 스케줄에 지정된 순서와 장비(UID)에 맞춰 NC 파일을 CNC 장비로 업로드합니다.
  3. 현재 가공 중인 작업이 완료되면 `Hi-link`를 통해 가공 개시 명령을 전송합니다.

- **스레드 안정성**: Hi-Link Mode2 DLL은 스레드에 불안정하므로, 모든 요청은 `HiLinkMode2Client`의 단일 워커 스레드에서 직렬화하여 처리합니다.
- **FIFO 큐**: `MessageHandler.RequestFIFO`와 `ResponseFIFO`를 사용하여 DLL과 통신하며, 응답 대기 시 UID와 DataType 매칭을 확인합니다.
- **초기화**: `MessageHandler` 인스턴스는 워커 스레드 내에서 단 한 번만 생성되어야 합니다.

### 2.2 API 엔드포인트 및 통신

- **기술 스택**: .NET Framework 4.8, ASP.NET Web API 2.
- **인증**: `BridgeAuthHandler`를 통한 기본 토큰 기반 인증을 수행할 수 있습니다.
- **장비 설정**: `MachinesConfigStore`를 통해 장비 목록(UID, IP, Port)을 관리합니다.

### 2.3 예외 처리 및 로깅

- DLL 호출 실패나 타임아웃 발생 시 적절한 에러 코드를 반환합니다.
- 모든 주요 작업 및 통신 내용은 콘솔/로그에 기록하여 추적 가능하게 합니다.

## 3. 웹 인터페이스 및 통신 규칙

### 3.1 공통 웹 서버 엔드포인트 (Port: 8002, ControlController 기반)

- `GET /api/control/health` 또는 `ping`: 서비스 상태 및 운영 여부(`_isRunning`) 확인.
- `POST /api/control/start`: 파일 감시 및 CNC 처리 운영 시작.
- `POST /api/control/stop`: 운영 중지 (감시 루프 일시 정지).
- `GET /api/control/recent`: 최근 처리된 50개의 가공 히스토리 조회.

### 3.2 CNC 장비 제어 엔드포인트 (BridgeController)

- `POST /api/cnc/machines/{machineId}/start`: CNC 장비 가공 시작 신호 전송.
  - **Body**: `{ "ioUid": 61, "panelType": 0, "status": 1 }`
  - **기본값**: `ioUid=61` (환경 변수 `CNC_START_IOUID`), `panelType=0`, `status=1`
  - **동작**: `HiLink.SetMachinePanelIO`를 호출하여 Start 신호 전송.
- `POST /api/cnc/machines/{machineId}/stop`: CNC 장비 가공 정지 신호 전송.
  - **Body**: `{ "ioUid": 62, "panelType": 0, "status": 1 }`
  - **기본값**: `ioUid=62`, `panelType=0`, `status=1`
  - **동작**: `HiLink.SetMachinePanelIO`를 호출하여 Stop 신호 전송.

**환경 변수**:

- `CNC_START_IOUID`: Start 신호의 IO UID (기본값: 61)
- `CNC_BUSY_IOUID`: 가공 중 상태 확인용 IO UID (기본값: 61)
- `CNC_JOB_ASSUME_MINUTES`: 가공 완료 추정 시간(분) (기본값: 20)

### 3.3 백엔드 알림 (Web Client)

- 가공 공정 시작/완료 시 `BACKEND_URL/bg/register-file`을 호출합니다.
- **Payload**:
  - `sourceStep`: "cnc"
  - `fileName`: 가공에 사용된 NC 파일명
  - `status`: "success" | "failed"

## 4. 운영 가이드라인

### 4.1 프로그램 전송 프로세스

1. 파일 업로드 시 파일명에서 O번호 추출.
2. `O####.nc` 형식으로 정규화하여 저장.
3. 장비 전송 시 `UpdateProgram` 등을 통해 숫자 번호만 전달.
4. 전송 완료 후 `UpdateActivateProg`로 해당 번호 활성화.

### 4.2 헬스체크

- 브리지 서비스의 생존 여부와 각 장비의 연결 상태를 주기적으로 확인합니다.

## 5. 연속 가공 시스템 (O3000↔O3001 토글)

### 5.1 개요

`CncContinuousMachining` 클래스는 O3000과 O3001 두 개의 고정 슬롯을 번갈아 사용하여 가공 대기 시간을 최소화하는 연속 가공 시스템입니다.

### 5.2 동작 원리

1. **슬롯 토글**: O3000(현재 실행) ↔ O3001(다음 대기) 방식으로 번갈아 사용
2. **선업로드**: 가공 중일 때 다음 작업을 대기 슬롯에 미리 업로드
3. **빠른 전환**: 가공 완료 즉시 대기 슬롯을 활성화하여 다음 작업 준비 (Start는 사용자가 수행)
4. **안전성**: 실행 중인 프로그램을 건드리지 않고, Idle 상태에서만 슬롯 전환

### 5.3 주요 프로세스

#### A. 첫 작업 시작

1. 장비 상태 확인 (Idle 대기)
2. O3000에 프로그램 업로드
3. O3000 활성화 (Start는 사용자가 수행)
4. Busy 감지 시 가공 시작으로 간주하고 생산 수량 기록 및 백엔드 알림

#### B. 가공 중 선업로드

1. O3000 실행 중 상태 모니터링
2. 다음 작업을 O3001에 미리 업로드
3. 프로그램 번호를 O3001로 자동 변경

#### C. 가공 완료 및 전환

1. 상태 변화 감지 (Running → Idle)
2. 생산 수량 증가 확인 (+1)
3. O3001 활성화 (Start는 사용자가 수행)
4. 슬롯 역할 교대 (O3001이 현재, O3000이 다음)

#### D. 반복

- 이후 O3001 실행 중 O3000에 다음 작업 업로드
- C 단계 반복

### 5.4 API 엔드포인트

#### POST /api/cnc/machines/{machineId}/continuous/enqueue

연속 가공 큐에 작업 추가

**Request Body**:

```json
{
  "fileName": "O0001.nc",
  "requestId": "req_123",
  "jobId": "job_456" // optional
}
```

**Response**:

```json
{
  "success": true,
  "message": "Job enqueued for continuous machining",
  "jobId": "job_456",
  "machineId": "machine1"
}
```

#### GET /api/cnc/machines/{machineId}/continuous/state

장비의 현재 연속 가공 상태 조회

**Response**:

```json
{
  "success": true,
  "data": {
    "machineId": "machine1",
    "currentSlot": 3000,
    "nextSlot": 3001,
    "isRunning": true,
    "currentJob": "O0001.nc",
    "nextJob": "O0002.nc",
    "elapsedSeconds": 125.5
  }
}
```

### 5.5 환경 변수

- `CNC_CONTINUOUS_ENABLED`: 연속 가공 시스템 활성화 여부 (기본값: true)
- `CNC_START_IOUID`: Start 신호 IO UID (기본값: 61)
- `BRIDGE_STORE_ROOT`: NC 파일 저장 경로 (기본값: `storage/3-direct`)

### 5.6 모니터링 및 완료 감지

1. **상태 폴링**: 3초 간격으로 장비 상태 확인
2. **완료 조건**:
   - 장비 상태가 Running → Idle/Ready 전환
   - 생산 수량(ProductCount) +1 증가 확인
3. **Fallback**: 상태 확인 실패 시 1분 경과 후 완료로 간주

### 5.7 주의사항

- 가공 중에는 실행 슬롯(CurrentSlot)의 프로그램을 절대 삭제하거나 수정하지 않음
- 모든 프로그램 교체는 Idle 상태에서만 수행
- 프로그램 번호는 자동으로 슬롯 번호(3000/3001)로 변경됨
- 업로드 직후 자동으로 Start 신호를 보내지 않음 (Now Playing으로 올라간 뒤 사용자가 Start)
- 백엔드 알림(`bg/register-file`)은 가공 시작(Busy 감지) 시점에만 전송
- 기존 `CncJobDispatcher`와 독립적으로 동작
