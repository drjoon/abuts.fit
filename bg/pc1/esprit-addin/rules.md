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
- `Splitline_2 = TwoPhaseSplitLine` (midpoint 사용 금지)
- Turn/Rough 경계는 각 split 기준 `±2.2mm` 오버컷을 적용한다.

### 4.3.1 TwoPhaseSplitLine 계산식 SSOT (검색 키워드: `finishlineTopZ-1mm`, `splitOffsetMm=-1.0`)

- 목적: Finish line 최상단 기준점에서 **좌측(X-방향)으로 1.0mm 이동한 지점**을 TwoPhase 분할선으로 사용한다.
- 기준식(권장 경로):
  - `finishLineTopX = BackPointX - FinishLineTopZ + DefaultStlShift`
  - `TwoPhaseSplitLineX = finishLineTopX - 1.0`
- fallback 식(TopZ 없을 때):
  - `TwoPhaseSplitLineX = FinishLineX - 1.0`
- 구현 SSOT 위치:
  - `DentalAddinDecomp/DentalAddin/MainModuleComposite.cs`
    - `TryResolveTwoPhaseSplitLineTargetX` (가이드라인/공정 분기에서 재해석)
  - `StlFileProcessor.cs`
    - `TryApplyTwoPhaseSplitByFinishLine` (env 주입 경로)
- 주의:
  - 위 두 경로의 오프셋 값은 항상 동일해야 한다. 불일치 시 화면 가이드라인과 실제 공정 경계가 어긋난다.

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

### 4.6 Front Face/Back Turn 경계 보정 (2026-07-01)

- Front Face 종료점 정책(현행 SSOT):
  - `Face.RightX = FrontPointX + 1.0mm`
  - 구현 위치: `MainModuleComposite.ApplyFrontFaceFixedDepth`
  - 단, 후속 안전 가드(`TryApplyFaceRightEndGuard`) 및 경계 클램프로 추가 보정될 수 있다.

- Back Turn 시작점/퇴출 정책(현행 SSOT):
  - 시작점은 `FrontPointX` anchor로 통일한다. (`Front_Turn`, `Middle_Turn`과 동일 기준)
  - 끝점은 `xMax` 고정 클램프를 쓰지 않고, `exitAllowance`를 더해
    수평 extension + 45도 퇴출 형상이 유지되도록 한다.
  - 구현 위치: `MainModuleOperations.TryPrepareTurningRegionRange` (`BACK`),
    `TryPrepareBackTurnRangeFromLegacyTurnB` (legacy fallback),
    `TurningFeature_Extension.BackT` (legacy 체인 생성)

### 4.7 Composite Orientation SSOT (2026-07-03)

- `OrientationStrategy` 매직넘버는 코드 상수로 관리한다.
  - `CompositeOrientationStrategyDefault = 1`
  - `CompositeOrientationStrategyProfile = 4`
  - 구현 위치: `DentalAddinDecomp/DentalAddin/MainModuleComposite.cs`
- `OrientationProfile` 시작점 X는 **STL Move와 반드시 동기화**한다.
  - 우선순위:
    1. `ABUTS_COMPOSITE_ORIENTATION_PROFILE_START_X` (권장, MoveSTL 직후 실제 STL 좌측 끝 `minX`)
    2. `MoveSTL_Module.FrontPointX` (fallback)
  - env 주입 위치: `StlFileProcessor.TryApplyCompositeOrientationProfileStartXEnv`
  - env 소비 위치: `MainModuleComposite.TryCreateCompositeOrientationProfileFromVector`
- 실행 초기화 정책:
  - `ResetPerRunState()`에서 `ABUTS_COMPOSITE_ORIENTATION_PROFILE_START_X`를 반드시 clear 한다.

### 4.8 Back_Turn Turning Extend direct 적용 SSOT (2026-07-11)

- 혼동 포인트 정리:
  - `Turning Extend` 값은 `Tech_Default_Path.xml`(또는 env)에서 주입된 `MainModule.TurningExtend`를 사용한다.
  - 코드에서 고정값(예: 6.0)이나 `finishLineMinZ` 계산으로 재override하지 않는다.
- Back_Turn/ExtendTurning 최종 정책:
  - `BackT`, `ResolveBackTurningExtendForBackTurnRange`, `ExtendTurning` 모두
    `MainModule.TurningExtend` 값을 **direct 적용**한다.
- 적용 위치(코드 SSOT):
  - `DentalAddinDecomp/DentalAddin/TurningFeature_Extension.cs`
    - `BackT`, `ExtendTurning`
  - `DentalAddinDecomp/DentalAddin/MainModuleOperations.cs`
    - `ResolveBackTurningExtendForBackTurnRange`
- 디버깅 기준 로그:
  - `TurningOp BACK - TurningExtend direct 적용: ... (source=MainModule.TurningExtend)`
  - `BackT: TurningExtend direct 적용 - ... (source=MainModule.TurningExtend)`
  - `ExtendTurning: TurningExtend direct 적용 - ... (source=MainModule.TurningExtend)`

### 4.9 Back_Rough 끝점 고정값 SSOT (2026-07-11)

- Back_Rough 끝점은 finishline min_z와 무관하게 **고정식**을 사용한다.
  - `BackRoughEndX = BackPointX + 4.0mm`
- 기존 `min_z` 기반 raw/translated 계산(`finishline min_z + 4.1`, `BackPointX + ...`)은 사용하지 않는다.
- 구현 위치:
  - `DentalAddinDecomp/DentalAddin/MainModuleComposite.cs`
    - `TryRunRoughFreeFromMillSplitAB`
- 디버깅 기준 로그:
  - `RoughFreeFromMillSplitAB - Back_Rough 끝점 고정 적용: backPointX=..., offset=4.000, endX=...`

## 5. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Esprit 로컬 초기화와 디버깅 메모만 남깁니다.
- 코드 리팩터링/수정 시 주석을 꼼꼼히 작성합니다.
- 기본 원칙(명시): **"다시 찾을 때 헷갈리지않게 코드에 항상 꼼꼼하게 주석을 기록한다"**.
- `rules.md`에 없는 구현/운영 규칙이 나오면 본 파일에 즉시 추가합니다.
- 기존 rules와 충돌 가능성이 있는 요청이 들어오면, 먼저 사용자 확인(컨펌)을 받은 뒤 진행합니다.
