# 연속 가공 시스템 (Continuous Machining)

## 개요

O3000↔O3001 두 슬롯을 토글하며 가공 대기 시간을 최소화하는 자동 연속 가공 시스템입니다.

## 핵심 개념

### 슬롯 전략

- **O3000**: 첫 번째 고정 슬롯 (현재 실행 또는 대기)
- **O3001**: 두 번째 고정 슬롯 (다음 작업 또는 대기)
- 두 슬롯을 번갈아 사용하여 한 슬롯이 실행 중일 때 다른 슬롯에 다음 작업을 미리 업로드

### 안전 원칙

1. 가공 중에는 실행 슬롯을 절대 건드리지 않음
2. 모든 프로그램 교체는 Idle 상태에서만 수행
3. 프로그램 번호는 자동으로 슬롯 번호로 변경

## 작동 흐름

### 1단계: 첫 작업 시작

```
[Idle] → O3000 업로드 → O3000 활성화 → Start → [Running]
```

### 2단계: 가공 중 선업로드

```
[O3000 Running] → O3001에 다음 작업 업로드 → 대기
```

### 3단계: 완료 감지 및 전환

```
[O3000 Running] → 상태 폴링 → [Idle 감지] → 생산수량 +1 확인
→ O3001 활성화 → Start → [O3001 Running]
```

### 4단계: 역할 교대 및 반복

```
[O3001 Running] → O3000에 다음 작업 업로드 → 대기
→ 완료 시 O3000 활성화 → Start → 반복
```

## 완료 감지 로직

### 주요 체크 포인트

1. **장비 상태**: `GetMachineStatus` - Running → Idle/Ready 전환 확인
2. **생산 수량**: `GetMachineProductInfo` - currentProdCount 증가 확인
3. **Fallback**: 상태 확인 실패 시 1분 경과 후 완료로 간주

### 폴링 주기

- 3초 간격으로 장비 상태 확인
- 가공 중일 때만 활성 모니터링

## API 사용법

### 작업 추가

```bash
POST http://localhost:8002/api/cnc/machines/machine1/continuous/enqueue
Content-Type: application/json

{
  "fileName": "O0001.nc",
  "requestId": "req_123",
  "jobId": "job_456"
}
```

### 상태 조회

```bash
GET http://localhost:8002/api/cnc/machines/machine1/continuous/state
```

응답 예시:

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

## 환경 변수

| 변수                     | 설명                    | 기본값       |
| ------------------------ | ----------------------- | ------------ |
| `CNC_CONTINUOUS_ENABLED` | 연속 가공 시스템 활성화 | true         |
| `CNC_START_IOUID`        | Start 신호 IO UID       | 61           |
| `BRIDGE_STORE_ROOT`      | NC 파일 저장 경로       | storage/3-nc |

## 테스트 시나리오

### 시나리오 1: 단일 작업

1. 작업 A를 큐에 추가
2. O3000에 업로드 및 실행
3. 완료 확인

### 시나리오 2: 연속 2개 작업

1. 작업 A, B를 순서대로 큐에 추가
2. A가 O3000에서 실행 시작
3. A 실행 중 B가 O3001에 선업로드
4. A 완료 즉시 B가 O3001에서 실행 시작

### 시나리오 3: 연속 3개 이상 작업

1. 작업 A, B, C를 큐에 추가
2. A → O3000 실행, B → O3001 선업로드
3. A 완료 → B 실행(O3001), C → O3000 선업로드
4. B 완료 → C 실행(O3000), 다음 작업 대기

## 트러블슈팅

### 문제: 작업이 시작되지 않음

- 장비 상태가 Idle인지 확인
- 파일이 storage/3-nc에 존재하는지 확인
- 브리지 서버 로그에서 에러 메시지 확인

### 문제: 완료 감지가 안 됨

- CNC_BUSY_IOUID 환경 변수 확인
- 생산 수량이 증가하는지 확인
- Fallback 타임아웃(1분) 대기

### 문제: 슬롯 전환 실패

- Edit/Auto 모드 전환 가능 여부 확인
- SetActivateProgram 응답 코드 확인
- 장비가 완전히 Idle 상태인지 확인

## 로그 모니터링

주요 로그 패턴:

```
[CncContinuous] started (3s interval)
[CncContinuous] job enqueued machine=machine1 jobId=xxx file=O0001.nc
[CncContinuous] starting new job machine=machine1 file=O0001.nc slot=O3000
[CncContinuous] start success machine=machine1 slot=O3000
[CncContinuous] preloading next job machine=machine1 file=O0002.nc to slot=O3001
[CncContinuous] preload success machine=machine1 slot=O3001
[CncContinuous] job completed machine=machine1 slot=O3000
[CncContinuous] switching to next job machine=machine1 from O3000 to O3001
[CncContinuous] switch success machine=machine1 now running O3001
```

## 기존 시스템과의 관계

- **CncJobDispatcher**: 기존 단일 작업 처리 시스템과 독립적으로 동작
- **CncJobQueue**: 공통 큐 사용 (장비별 FIFO)
- **Mode1Api/Mode1HandleStore**: 동일한 Hi-Link API 사용

## 향후 개선 사항

1. **다중 슬롯 지원**: O3000~O3005 등 더 많은 슬롯 사용
2. **우선순위 큐**: 긴급 작업 우선 처리
3. **예상 완료 시간**: 과거 데이터 기반 예측
4. **실시간 알림**: WebSocket을 통한 상태 변화 푸시
5. **자동 복구**: 에러 발생 시 자동 재시도 로직
