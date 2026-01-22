# 연속가공 시스템 테스트 가이드

## 개요

O3000/O3001 슬롯 토글 방식의 연속가공 시스템 테스트 및 운영 가이드입니다.

## 환경 변수 설정

### bridge-server (.env)

```bash
# 연속가공 활성화 (기본값: true)
CNC_CONTINUOUS_ENABLED=true

# 브리지 스토어 루트 경로 (NC 파일 저장 위치)
BRIDGE_STORE_ROOT=/path/to/storage/3-nc

# CNC 시작 신호 IO UID (기본값: 61)
CNC_START_IOUID=61

# CNC Busy 신호 IO UID (완료 감지용, 선택사항)
CNC_BUSY_IOUID=62

# 백엔드 알림용
BACKEND_BASE=https://abuts.fit/api
BACKEND_JWT=your_jwt_token_here
```

### web/backend (.env)

```bash
# 브리지 서버 주소
BRIDGE_BASE=http://localhost:8002

# 브리지 공유 시크릿
BRIDGE_SHARED_SECRET=your_secret_here
```

## 테스트 시나리오

### 1. 단일 작업 테스트

**목적**: 연속가공 시스템의 기본 동작 확인

1. **준비**
   - CNC 장비가 Idle 상태인지 확인
   - bridge-server 실행 중 확인
   - 테스트용 NC 파일 준비

2. **작업 등록**

   ```bash
   # 프론트엔드에서 "생산 예약하기" 클릭
   # 브리지 서버 탭에서 NC 파일 선택
   # 예약 제출
   ```

3. **확인 사항**
   - bridge-server 로그에서 `[CncContinuous] job enqueued` 확인
   - 3초 이내에 `[CncContinuous] starting new job` 로그 확인
   - NC 프로그램이 O3000으로 업로드되었는지 확인
   - CNC 장비가 자동으로 가공 시작했는지 확인

4. **완료 확인**
   - 가공 완료 후 `[CncContinuous] job completed` 로그 확인
   - 생산 수량이 증가했는지 확인

### 2. 연속 작업 테스트 (2개 이상)

**목적**: 슬롯 토글 및 선업로드 동작 확인

1. **준비**
   - 2개 이상의 NC 파일 준비 (다른 파일명)

2. **작업 등록**
   - 첫 번째 파일 예약
   - 두 번째 파일 예약

3. **확인 사항**
   - 첫 번째 작업이 O3000에서 실행 중
   - `[CncContinuous] preloading next job` 로그 확인
   - 두 번째 작업이 O3001에 선업로드되었는지 확인
   - 첫 번째 작업 완료 후 자동으로 O3001로 전환되는지 확인
   - 프론트엔드 "연속가공" 섹션에서 현재 슬롯/다음 슬롯 정보 표시 확인

4. **슬롯 전환 확인**
   - `[CncContinuous] switching to next job` 로그
   - 활성 프로그램이 O3001로 변경
   - 가공 자동 시작

### 3. 의뢰 기반 자동 연속가공 테스트

**목적**: 워크시트 페이지에서 의뢰 NC 파일 자동 연속가공 확인

1. **준비**
   - 의뢰 생성 및 CAM 파일 업로드
   - NC 파일 생성 및 업로드
   - 장비 설정에서 `allowAutoMachining` 활성화

2. **생산 시작**
   - 워크시트 > 생산 페이지 이동
   - 장비 카드에서 연속가공 상태 확인
   - "생산 시작" 버튼 클릭

3. **확인 사항**
   - NC 파일이 브리지 스토어(`nc/<requestId>/...`)에 저장되었는지 확인
   - `bridgePath`가 함께 전달되어 연속가공 큐에 등록되었는지 확인
   - 장비 카드에 "연속가공" 섹션 표시 확인
   - 현재 슬롯(O3000/O3001), 경과 시간 표시 확인

### 4. 오류 상황 테스트

#### 4-1. 파일 없음

- 존재하지 않는 파일명으로 enqueue 시도
- 예상: `[CncContinuous] file not found` 로그, 작업 건너뜀

#### 4-2. 장비 오프라인

- 장비 전원 꺼진 상태에서 작업 등록
- 예상: Hi-Link API 오류, 재시도 로직 동작

#### 4-3. 가공 중 작업 추가

- 가공 실행 중에 새 작업 등록
- 예상: 선업로드 동작, 다음 슬롯에 미리 업로드

## 모니터링

### bridge-server 로그 확인

```bash
# 연속가공 관련 로그만 필터링
tail -f bridge-server.log | grep CncContinuous
```

**주요 로그 메시지**:

- `job enqueued`: 작업 큐 등록
- `starting new job`: 새 작업 시작
- `preloading next job`: 다음 작업 선업로드
- `preload success`: 선업로드 완료
- `job completed`: 작업 완료 감지
- `switching to next job`: 슬롯 전환
- `switch success`: 전환 완료

### API 엔드포인트로 상태 확인

```bash
# 특정 장비의 연속가공 상태 조회
curl -H "X-Bridge-Secret: your_secret" \
  http://localhost:8002/api/cnc/machines/{machineId}/continuous/state

# 응답 예시
{
  "success": true,
  "data": {
    "machineId": "M1",
    "currentSlot": 3000,
    "nextSlot": 3001,
    "isRunning": true,
    "currentJob": "test_file.nc",
    "nextJob": "test_file2.nc",
    "elapsedSeconds": 125
  }
}
```

### 프론트엔드 UI 확인

- **수동 제어 페이지** (`/manufacturer/cnc`):
  - MachineCard에 "연속가공" 섹션 표시
  - 현재 슬롯, 다음 슬롯, 경과 시간 표시

- **워크시트 페이지** (`/manufacturer/worksheet/custom_abutment/machining`):
  - WorksheetCncMachineCard에 "연속가공" 섹션 표시
  - `allowAutoMachining=true`인 장비만 표시

## 주의사항

### 1. 슬롯 번호 고정

- **반드시 O3000, O3001만 사용**
- 다른 프로그램 번호로 수동 업로드 시 연속가공과 충돌 가능
- 수동 작업 시에는 O0100~O2999 범위 사용 권장

### 2. 가공 중 프로그램 수정 금지

- Hi-Link API 제약: 실행 중인 프로그램은 수정 불가
- 연속가공 시스템이 자동으로 비활성 슬롯에만 업로드

### 3. NC 파일 헤더 형식

- 첫 줄에 `%` 헤더 필수 (없으면 자동 추가)
- 프로그램 번호 라인(`O####`)은 자동으로 슬롯 번호로 교체
- 주석(`(...)`)은 유지됨

### 4. 완료 감지 방식

- **우선**: Busy IO 신호 + 생산 수량 증가
- **대체**: 60분 타임아웃 (비정상 상황 방지)

### 5. 기존 디스패처와 충돌 방지

- `CNC_CONTINUOUS_ENABLED=true`이면 기존 `CncJobDispatcher` 비활성화
- 두 시스템을 동시에 실행하면 안 됨

### 6. 브리지 스토어 경로

- NC 파일은 `BRIDGE_STORE_ROOT` 하위에 저장
- 의뢰 기반: `nc/<requestId>/<fileName>`
- 수동 업로드: 브리지 패널에서 지정한 경로

## 트러블슈팅

### 작업이 시작되지 않음

1. bridge-server 로그 확인
2. `CNC_CONTINUOUS_ENABLED` 환경변수 확인
3. 장비 상태 확인 (Hi-Link 연결)
4. 큐에 작업이 등록되었는지 확인

### 슬롯 전환이 안 됨

1. 첫 번째 작업이 완료되었는지 확인
2. Busy IO 설정 확인 (`CNC_BUSY_IOUID`)
3. 생산 수량이 증가했는지 확인
4. 로그에서 `job completed` 메시지 확인

### 파일을 찾을 수 없음

1. `bridgePath` 값 확인
2. `BRIDGE_STORE_ROOT` 경로 확인
3. 파일 권한 확인
4. 로그에서 실제 시도한 경로 확인

### 프론트엔드에 연속가공 상태가 안 보임

1. 장비 설정에서 `allowAutoMachining` 확인
2. 백엔드 프록시 API 동작 확인
3. 브라우저 콘솔에서 API 응답 확인
4. `useCncContinuous` 훅이 올바른 `machineId`로 호출되는지 확인

## 성능 최적화

### 다운타임 최소화

- 선업로드 덕분에 슬롯 전환 시간 최소화 (< 5초)
- 가공 중에 미리 다음 작업 준비

### 리소스 사용

- 모니터링 주기: 3초
- 메모리: 장비당 상태 객체 1개 (수십 바이트)
- CPU: 거의 무시 가능 (대부분 대기)

## 향후 개선 사항

- [ ] 큐 우선순위 지원
- [ ] 작업 일시정지/재개
- [ ] 다중 슬롯 지원 (3개 이상)
- [ ] 실시간 진행률 표시
- [ ] 작업 히스토리 저장
