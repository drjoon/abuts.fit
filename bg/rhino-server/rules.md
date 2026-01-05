# Rhino Server Development Rules

이 문서는 `abuts.fit` 프로젝트의 Rhino Server (Rhino Compute 기반) 작업 내용과 유지보수 규칙을 정리합니다.

## 1. 파일 파이프라인 (File Pipe)

### 1.1 감시 및 처리 로직

- **감시 방식**: `watchdog` 라이브러리를 이용한 네이티브 파일 시스템 이벤트 감시 (이벤트 기반).
- **감시 경로**: `/bg/storage/1-stl` 폴더를 감시합니다.
- **대상 파일**: `.stl` 확장자를 가진 파일 중 처리 표식(`.fw`, `.cam`, `.rhino`)이 없는 파일.
- **처리 내용**:
  1. Rhino의 홀 메꿈(Fill Hole) 알고리즘을 수행합니다.
  2. 분석 결과(최대 직경, 연결 직경 등)를 도출할 수 있습니다.
- **출력 경로**: 처리 완료된 파일은 `/bg/storage/2-filled` 폴더에 `[원본명].fw.stl` 형식으로 저장합니다.

### 1.2 예외 처리

- 처리 중 오류 발생 시 로그에 기록하고 해당 파일은 건너뜁니다.
- 동일 파일에 대한 중복 처리를 방지하기 위해 출력 폴더에 결과물이 이미 존재하는 경우 처리를 생략합니다.

## 2. 시스템 구성

### 2.1 기술 스택

- **언어**: Python 3.9+
- **프레임워크**: FastAPI (Worker API), Rhino Compute (Rhino 8)
- **병렬 처리**: Rhino 인스턴스 안정성을 위해 단일 인스턴스(`MAX_RHINO_CONCURRENCY=1`) 및 전역 락(`_global_rhino_lock`)을 사용합니다.

### 2.2 경로 설정

- 모든 경로는 `/bg/storage`를 기준으로 상대 경로로 관리하거나 환경 변수를 통해 주입받습니다.
- `APP_ROOT.parent.parent / "storage"`를 기본 스토리지 루트로 사용합니다.

## 3. 웹 인터페이스 및 통신 규칙

### 3.1 공통 웹 서버 엔드포인트 (Port: 8000)

- `GET /health` 또는 `/ping`: 서비스 상태 및 운영 여부(`is_running`) 확인.
- `POST /control/start`: 파일 감시 및 처리 운영 시작.
- `POST /control/stop`: 운영 중지 (감시 루프 일시 정지).
- `GET /history/recent`: 최근 처리된 50개의 파일 목록 (`deque` 기반 관리).

### 3.2 백엔드 알림 (Web Client)

- 파일 처리 완료(성공/실패) 시 `BACKEND_URL/bg/register-file`을 호출합니다.
- **Payload**:
  - `sourceStep`: "2-filled"
  - `fileName`: 출력 파일명
  - `originalFileName`: 입력 파일명
  - `status`: "success" | "failed"
  - `metadata`: `jobId` 등 추가 정보.
