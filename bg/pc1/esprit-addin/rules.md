# Esprit Add-in Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `bg/pc1/esprit-addin` 폴더의 로컬 메모만 남깁니다.

## 1. 구현 메모

- Esprit는 `2-filled`를 입력으로 받아 `3-nc`를 생성합니다.
- 백엔드가 준 PRC 파일명이 비어 있거나 파일을 찾을 수 없으면 폴백 없이 실패합니다.
- 재기동 시 pending 전체를 자동 복구하지 않고, 승인된 단일 작업만 처리합니다.
- `UserData`와 PRC 경로 초기화는 자동 실행 경로에서도 UI와 동일하게 맞춰야 합니다.
- NC 출력 파일명은 최종적으로 `*.nc`로 정규화합니다.
- request-meta 조회/등록 귀속의 SSOT는 HTTP payload의 `RequestId` 입니다.
  - `StlPath` 파일명에서 requestId를 역추론하면 원본/샘플이 섞일 수 있으므로 금지합니다.

## 2. 구현 체크포인트

- 공정 직전 피처/오퍼레이션 검증 로그를 남겨 원인 추적이 가능해야 합니다.
- Roughworkplane에서 STL 모델을 찾지 못하면 즉시 종료하고 로그를 남깁니다.
- TwoPhase에서 `Rough_A` 이후 `Face(EM2_0BALL)`가 실행될 때는 공구 파손 방지를 위해 우측 끝 안전 간격을 강제합니다.
  - 기준: `roughAEndX = splitX - 0.5mm`
  - 규칙: `(roughAEndX - faceRightX) < 0.3mm` 이면 `faceRightX = roughAEndX - 0.3mm`로 보정
  - 적용 위치: `MainModuleComposite.TryApplyFaceRightEndGuard` (실행 지점: `FrontFaceMill`, `TryRunFreeFormMillSafe`)

## 3. 이번 세션 리팩터링 기록 (2026-06-20)

- FINISH 경계 변경은 `TryRunComposite2SplitAB` 내부 숫자 수정으로 끝내지 않고,
  변환 좌표계를 먼저 결정한 뒤 공통 유틸로 적용한다.
  - 경계 결정 SSOT: `StartEndScale(20mm)` 계열 유틸
    - `XToPassPercentByStartEndScale(...)`
    - `ShiftPassPercentByStartEndScaleMm(...)`
    - `PassPercentDeltaToMmByStartEndScale(...)`
  - `ShiftPassPercentByXOffsetMm(...)`(span 기반)은 물리 span 기준 보정에만 사용한다.
  - `XToPassPercentBySpan(...)` 결과는 정책값이 아니라 diag 로그로만 사용한다.
- FINISH_A/FINISH_B에서 Operation 목록은 생성되나 툴패스가 사라지는 경우(시작=끝)는
  **최소 폭 보장 헬퍼**(`EnsureStartHasMinWidthPercent`)를 통해 해결한다.
- Turn_B와 Connection 경계 기준 수정 시,
  `ResolveTurnConnectionBoundaryX`에 우선순위를 집중 관리한다 (`EndXValue` → `FinishLineX` → `BackPointX`).
- 레거시 Single-A/BC/B-Extension 분기는 사용하지 않는다.
  - 2-phase 기본 흐름은 `A_PHASE`/`B_PHASE`로 명시한다.

## 4. 이번 세션 반영 사항 (2026-06-29)

### 4.1 공정 구조 SSOT (3-Stage)

- 기존 A/B 2분할 공정을 3단계로 고정한다.
  - Front: `Turn -> Rough -> Front Face`
  - Middle: `Turn -> Rough`
  - Back: `Turn -> Rough`
- Finish 정책:
  - `retentionGroove=deep` → `Finish_Front`, `Finish_Back`
  - `retentionGroove=none` 및 `ALL_PHASE` → `Finish_All` 단일 패스

### 4.2 라벨명 SSOT

- Turning/Rough/Face 라벨은 아래 이름으로 고정한다.
  - `Front_Turn`, `Front_Rough`, `Front_Face`
  - `Middle_Turn`, `Middle_Rough`
  - `Back_Turn`, `Back_Rough`
- Finish 라벨은 모드별로 아래 이름만 사용한다.
  - `Finish_All` 또는 `Finish_Front`, `Finish_Back`

### 4.3 Split 기준 SSOT

- `Splitline_1 = FrontPointX`
- `Splitline_2 = (Splitline_1 + BackPointX) / 2`
- Turn/Rough 경계는 각 split 기준 `±2.2mm` 오버컷을 적용한다.

### 4.4 Finish none 처리

- `Finish_All` 모드에서는:
  - 시작 퍼센트: `FirstPassPercent = 1.0`
  - 종료 퍼센트: `BackPointX` 기반 pass percent
- `ABUTS_RETENTION_GROOVE` 환경변수는 `StlFileProcessor`에서 실행 전 설정하고 실행 종료/초기화 시 해제한다.

### 4.5 CAM 직경 기반 불필요 가공 제거

- 백엔드가 전달한 CAM 직경(현재 SSOT: `LatheMachineSetup.BarDiameter`)을 기준으로,
  `Turn`/`Rough`에서 **공구 직경이 CAM 직경보다 큰 오퍼레이션(D12, D10 등)** 은 생성하지 않는다.
- 적용 범위:
  - 3-stage `TurningOp` (Front/Middle/Back)
  - 3-stage `RoughFreeFromMillSplitAB` (Roughing, ZLevel)
- 목적:
  - CAM 직경 8.0 케이스에서 대구경 선행 가공을 제거해 불필요 공정/시간을 줄인다.

## 5. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Esprit 로컬 초기화와 디버깅 메모만 남깁니다.
- 코드 리팩터링/수정 시 주석을 꼼꼼히 작성합니다.
- 기본 원칙(명시): **"다시 찾을 때 헷갈리지않게 코드에 항상 꼼꼼하게 주석을 기록한다"**.
- `rules.md`에 없는 구현/운영 규칙이 나오면 본 파일에 즉시 추가합니다.
- 기존 rules와 충돌 가능성이 있는 요청이 들어오면, 먼저 사용자 확인(컨펌)을 받은 뒤 진행합니다.
