# Hi-Link Bridge Service Development Rules

이 문서는 `abuts.fit` 프로젝트의 Hi-Link Bridge Service (HiLinkBridgeWebApi48) 작업 내용과 유지보수 규칙을 정리합니다.

## 1. 비즈니스 및 공통 규칙 (Global Sync)

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

- **감시 경로**: `/bg/storage/3-nc` 폴더를 실시간으로 감시합니다.
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

### 2.4 동기화 방식 (이벤트 드리븐 우선)

- **대전제**: 폴링은 최대한 자제하고, 가능한 모든 동기화는 **이벤트 드리븐(push)** 으로 구현한다.
- **폴링 도입 금지**: 주기적 폴링이 꼭 필요하다고 판단되면, 반드시 사전에 사용자 승인 후 도입한다.
- **큐 동기화**:
  - 백엔드(DB SSOT)가 큐 스냅샷을 갱신하면 브리지로 즉시 push한다.
  - Endpoint: `POST /api/bridge/queue/{machineId}/replace` (jobs 전체 replace)

### 2.3 예외 처리 및 로깅

- DLL 호출 실패나 타임아웃 발생 시 적절한 에러 코드를 반환합니다.
- 모든 주요 작업 및 통신 내용은 콘솔/로그에 기록하여 추적 가능하게 합니다.
- **재시도 금지(중요)**: CNC 제어(Start/Stop/Reset/Pause) 및 Hi-Link DLL 호출은 **1회만 시도**합니다. 실패 시 재시도하지 않고, 실패 원인(`result`/`message`)을 API 응답으로 그대로 반환하여 백엔드→프론트에서 토스트로 노출합니다.
- **예외(EW_BUSY)**: 프로그램 업로드(`SetMachineProgramInfo`/`UpdateProgram`)에 한해서만 `EW_BUSY(-1)`이면 CNC processing 완료까지 **짧게 대기 후 backoff 재시도**를 허용합니다. (기타 에러코드는 재시도하지 않음)

#### 2.3.1 Hi-Link 공통 에러 코드 (Mode1/Mode2)

아래 코드는 Hi-Link 스펙의 **General Error List** 기준입니다.

| result | 의미                                                      |
| -----: | --------------------------------------------------------- |
|    -17 | EW_PROTOCOL (Protocol error)                              |
|    -16 | EW_SOCKET (Socket error)                                  |
|    -15 | EW_NODLL (DLL file error)                                 |
|    -11 | EW_BUS (Bus error)                                        |
|    -10 | EW_SYSTEM2 (System error 2)                               |
|     -9 | EW_HSSB (Communication error of HSSB)                     |
|     -8 | EW_HANDLE (Handle number error)                           |
|     -7 | EW_VERSION (Version mismatch between CNC/PMC and library) |
|     -6 | EW_UNEXP (Abnormal library state)                         |
|     -5 | EW_SYSTEM (System error)                                  |
|     -4 | EW_PARITY (Shared RAM parity error)                       |
|     -3 | EW_MMCSYS (FANUC drivers installation error)              |
|     -2 | EW_RESET (Reset or stop request)                          |
|     -1 | EW_BUSY (Busy)                                            |
|      0 | EW_OK (Normal termination)                                |
|      1 | EW_FUNC (Function not executed / not available)           |
|      2 | EW_LENGTH (Data block length/number of data error)        |
|      3 | EW_NUMBER (Data number error)                             |
|      4 | EW_ATTRIB (Data attribute error)                          |
|      5 | EW_DATA (Data error)                                      |
|      6 | EW_NOOPT (No option)                                      |
|      7 | EW_PROT (Write protection)                                |
|      8 | EW_OVERFLOW (Memory overflow)                             |
|      9 | EW_PARAM (CNC parameter error)                            |
|     10 | EW_BUFFER (Buffer empty/full)                             |
|     11 | EW_PATH (Path number error)                               |
|     12 | EW_MODE (CNC mode error)                                  |
|     13 | EW_REJECT (CNC execution rejection)                       |
|     14 | EW_DTSRVR (Data server error)                             |
|     15 | EW_ALARM (Alarm)                                          |
|     16 | EW_STOP (Stop / Emergency)                                |
|     17 | EW_PASSWD (State of data protection)                      |

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

### 4.1 스마트(Smart) 업로드/큐/가공 시작 엔드포인트

- 스마트 업로드:
  - `POST /api/cnc/machines/{machineId}/smart/upload`
  - 입력: `path` (bridge-store 상대 경로)
  - 동작: **활성 프로그램 슬롯(`/programs/active`)만 확인** 후 `O4000/O4001` 중 안전한 슬롯을 선택하고, 본문 2행의 `O####`를 해당 슬롯으로 강제한 뒤 업로드한다.
  - **업로드 크기 제한**: 최대 500KB까지 업로드 가능
  - 업로드 재시도(EW_BUSY):
    - `SetMachineProgramInfo`/`UpdateProgram`에서 `EW_BUSY(-1)`이면 **최대 20초까지 1초 간격**으로 재시도한다.
  - 슬롯 정리(메모리 확보):
    - 슬롯 `4000/4001` 중 **활성 프로그램 슬롯은 보호(삭제 금지)** 한다.
    - 보호 슬롯이 아닌 쪽은 **업로드 전에 무조건 삭제**하여 대용량 업로드 실패(`EW_DATA(5)`/`EW_BUSY(-1)`) 확률을 낮춘다.
    - 보호 슬롯이 `4000`이면 업로드는 `4001`, 보호 슬롯이 `4001`이면 업로드는 `4000`으로 강제한다.
  - Busy 상태 업로드:
    - 가공(Busy) 중이라도 AUTO 모드에서 비활성 슬롯으로 업로드 가능하므로 모드 전환 없이 업로드한다.
    - 단, Alarm 상태면 중단.
  - 업로드 완료 확인:
    - 소형(<=90KB): `GetMachineProgramData`로 길이 비교
    - 대형(>90KB): `GetMachineProgramData` readback이 잘릴 수 있어 ProgramList 존재 여부만 확인
      - **최대 20초 / 1초 간격 폴링**
  - 로깅/응답:
    - 브리지 콘솔 로그와 API 응답(`logs`)에 아래 정보를 포함한다.
      - `activeSlot`, `protectedSlot`, `deletedSlots`, `uploadSlot`, `fileBytes`
      - 업로드 실패 시 `uploadFailed usedMode=... err=...`

- **프로그램 다운로드 제한사항**:
  - Hi-Link DLL의 `GetMachineProgramData`/`GetProgDataInfo` API는 **내부 버퍼 크기 제한(약 103KB)**이 있습니다.
  - 대용량 프로그램(>103KB)을 다운로드하면 **뒷부분이 잘린 채로(truncated)** 반환됩니다.
  - 업로드는 500KB까지 가능하지만, 다운로드는 103KB 이상 프로그램의 경우 전체 내용을 읽을 수 없습니다.
  - 다운로드 API 응답에 `warning` 필드가 있으면 truncated 상태이므로 주의가 필요합니다.
  - **권장**: 대용량 프로그램은 원본 파일을 별도로 보관하고, CNC에서 다운로드하지 않습니다.

- 스마트 enqueue:
  - `POST /api/cnc/machines/{machineId}/smart/enqueue`
  - 입력: `paths[]` (bridge-store 상대 경로 배열)
  - 동작: 큐에 작업을 추가만 한다. (즉시 가공 시작하지 않음)

- 스마트 replace:
  - `POST /api/cnc/machines/{machineId}/smart/replace`
  - 입력: `paths[]` (bridge-store 상대 경로 배열)
  - 동작: 현재 실행 중인 작업(`current`)은 유지하고, **대기 큐를 지정된 paths로 교체**한다.
  - 용도: 제조사 UI에서 `Next Up` 클릭 시, 선택된 1개 파일로 큐를 교체한 뒤 `/smart/start`로 즉시 시작하기 위한 용도.

- 스마트 dequeue:
  - `POST /api/cnc/machines/{machineId}/smart/dequeue`
  - 입력: `jobId`(선택) 없으면 큐의 첫 작업을 제거
  - 동작: 큐에서 작업을 제거한다. (실행 중인 작업은 제거 불가)

- 스마트 가공 시작:
  - `POST /api/cnc/machines/{machineId}/smart/start`
  - 동작: 큐에 작업이 있으면 워커를 시작하고 자동으로 연속 가공한다.
  - 사이클타임 절감: 가공 중 다음 슬롯에 선업로드(Preload) + 업로드 완료 확인을 수행하여, 가공 종료 직후 즉시 활성화/Start 가능하도록 한다.

- 스마트 상태 조회:
  - `GET /api/cnc/machines/{machineId}/smart/status`
  - 용도: 가공 진행/종료 상태, 경과 시간, 에러/알람 확인(진단용)

### 4.2 헬스체크

- 브리지 서비스의 생존 여부와 각 장비의 연결 상태를 주기적으로 확인합니다.

## 5. 연속 가공 시스템 (O3000↔O3001 토글)

### 5.1 개요

`CncContinuousMachining` 클래스는 O3000과 O3001 두 개의 고정 슬롯을 번갈아 사용하여 가공 대기 시간을 최소화하는 연속 가공 시스템입니다.

### 5.2 동작 원리

1. **슬롯 토글**: O3000(현재 실행) ↔ O3001(다음 대기) 방식으로 번갈아 사용
2. **선업로드**: 가공 중일 때 다음 작업을 대기 슬롯에 미리 업로드
3. **빠른 전환**: 가공 완료 즉시 대기 슬롯을 활성화하여 다음 작업 시작
4. **안전성**: 실행 중인 프로그램을 건드리지 않고, Idle 상태에서만 슬롯 전환

### 5.3 주요 프로세스

#### A. 첫 작업 시작

1. 장비 상태 확인 (Idle 대기)
2. O3000에 프로그램 업로드
3. O3000 활성화 및 Start
4. 생산 수량 기록

#### B. 가공 중 선업로드

1. O3000 실행 중 상태 모니터링
2. 다음 작업을 O3001에 미리 업로드
3. 프로그램 번호를 O3001로 자동 변경

#### C. 가공 완료 및 전환

1. 상태 변화 감지 (Running → Idle)
2. 생산 수량 증가 확인 (+1)
3. O3001 활성화 및 즉시 Start
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
- `BRIDGE_STORE_ROOT`: NC 파일 저장 경로

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
