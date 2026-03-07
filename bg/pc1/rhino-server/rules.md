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

## 4. Finish Line Detection 알고리즘 요약

1. **대상 Mesh 선택**: 활성 Rhino 문서에서 가장 큰 Mesh(버텍스 수 + 대각선 길이 기준)를 골라 주 대상으로 사용한다.
2. **pt0 결정**: Bounding box 높이의 20~60% Z 구간에서 XY 반경(r=√x²+y²)이 최대인 버텍스를 pt0로 선택한다.
3. **단면 평면 생성**: Z축을 포함하는 평면을 60개, 6° 간격으로 회전시키며 만들어 한 바퀴를 샘플링한다.
4. **단면 샘플링**: 각 평면과 Mesh의 교차를 PolylineCurve로 얻고, 곡선 제어점/샘플점을 추출한 뒤 동일한 20~60% Z 범위로 필터링한다.
5. **후보 정리**: 평면별로 필터링된 후보 점 목록을 저장하고, pt0가 속한 평면 인덱스를 시작점으로 잡는다.
6. **곡선 추적**: 이전 선택점과의 3D 거리가 1mm 이하인 후보 중 XY 반경이 가장 큰 점을 `_NEAREST_LIMIT=20` 내에서 고르며 순차적으로 이동한다. 조건을 만족하는 후보가 없으면 추적을 중단한다.
7. **시각화**: pt0는 반경 0.1의 녹색 구, 추적 결과는 빨간 튜브(반경 0.03)로 표현하며 필요 시 모든 단면 곡선을 팔레트 색으로 그린다.

# Trouble shooting

Rhino 서버에서 "No active Rhino instances found via RhinoCode list" 메시지가 뜨면 Rhino를 실행한 뒤 명령창에서 RhinoCode 또는 ScriptEditor 명령을 한 번 호출해 RhinoCode 서비스를 깨워야 한다.
