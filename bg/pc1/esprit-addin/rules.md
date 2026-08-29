# Esprit Add-in Rules

루트 `rules.md`가 최종 기준입니다.

- 루트 축약본에서 제거된 상세 정책/히스토리 보존본: `.archive/rules.legacy-2026-07-29.md`
- 로컬 전체 상세 미러(공통 참조): `rules.legacy-full.md`
- esprit 상세 정책은 이 문서 + 공통 미러 + 소스 상단 `related files` 주석으로 보존합니다.

이 문서는 `bg/pc1/esprit-addin` 폴더의 로컬 메모만 남깁니다.

## 0. 시간

- 루트 `rules.md` §1.4: 비즈니스 시각은 KST. Windows 제조 PC OS TZ를 `Asia/Seoul`로 유지.

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

- 기존 A/B 2분할 공정을 Front/Back 2-way로 고정한다.
  - Front: `Turn -> Rough -> Front Face`
  - Back: `Turn -> Rough`
  - `Middle_Turn` / `Middle_Rough`는 레거시로 **생성하지 않는다** (Front+Back로 커버)
- Finish 정책:
  - `retentionGroove=deep` → `Finish_Front`, `Finish_Back`
  - `retentionGroove=none` 및 `ALL_PHASE` → `Finish_All` 단일 패스

### 4.2 라벨명 SSOT

- Turning/Rough/Face 라벨은 아래 이름으로 고정한다.
  - `Front_Turn`, `Front_Rough`, `Front_Face`
  - `Back_Turn`, `Back_Rough`
  - 레거시(미생성): `Middle_Turn`, `Middle_Rough`
- Finish 라벨은 모드별로 아래 이름만 사용한다.
  - `Finish_All` 또는 `Finish_Front`, `Finish_Back`

### 4.3 Split 기준 SSOT

- `Splitline_1 = FrontPointX`
- `Splitline_2 = TwoPhaseSplitLine` (midpoint 사용 금지)
- 인접 툴패스:
  - Rough: **선행 끝 = 경계 정확**, **후행 시작 = 경계 tip쪽(그림 왼쪽, X-) 공구 반경**
    - `GetRoughAdjacentOverlapMm()` = 활성 rough 반경 (D4→`2.0`, `ROUGH_20` D2→`1.0`)
  - Finish: **Front 끝 = `Splitline_2`**, **Back 시작 = `Splitline_2` − 1피치**
    - 피치 SSOT: 백엔드 `retentionGroove` (`none`→`0.12`, `deep`→`0.20`) via `ABUTS_RETENTION_GROOVE`
    - `ABUTS_COMPOSITE_STEP_INCREMENT_A` **미사용**. none/deep 미수신 시 NC 중단 + 프론트 토스트
- `Middle_Turn` / `Middle_Rough`는 레거시로 **생성하지 않는다** (Front + Back로 커버)

### 4.3.1 SharedFinishSplit / Splitline_2 SSOT (검색 키워드: `SharedFinishSplitX`, `finishlineTop-1mm`, `X=-Z`, `GetRoughAdjacentOverlapMm`, `GetFinishAdjacentOverlapMm`, `ABUTS_RETENTION_GROOVE`)

- 목적: **한 식**으로 아래를 동일 경계 좌표에 둔다.
  - `Front_Rough` 끝
  - `Splitline_2` / `TwoPhaseSplitLine`
  - `Finish_Front` 끝
- 기준식:
  - `SharedFinishSplitX = finishLineTopX - 1.0` (tip 쪽 1mm, Z+1 ≡ X-1)
- 인접 후행 시작:
  - `Back_Rough` 시작 = `Splitline_2 - roughRadius` (D4→2.0)
  - `Finish_Back` 시작 = `SharedFinishSplitX - GetFinishAdjacentOverlapMm()`
    - 피치: `ResolveFinishFrontStepIncrementMmFromRetentionGroove()` (`none`→0.12, `deep`→0.20)
    - `StlFileProcessor.RequireBackendRetentionGrooveOrThrow` — none/deep만 허용, 미수신 시 예외
    - 실패 보고: `NotifyBackendFailure` → `/bg/register-file` status=failed → `request:async-action-failed` 토스트
- 좌표 변환 (`EspritHttpServer`: `FrontPointX = -FrontPoint.z`):
  - MoveSTL 전: `FinishLineX = -finishLineTopZ`
  - MoveSTL 후: `finishLineTopX = BackPointX - finishLineTopZ`
  - 재해석: `finishLineTopX = BackPointX - FinishLineTopZ + DefaultStlShift`
- 구현:
  - `TryResolveSharedFinishSplitX` → `TryResolveTwoPhaseSplitLineTargetX`
  - Rough: `frontEnd = splitline2`, `backStart = splitline2 - GetRoughAdjacentOverlapMm()`, Middle skip
  - Finish: `Finish_Front` 끝 = `SharedFinishSplitX`, `Finish_Back` 시작 = `SharedFinishSplitX - GetFinishAdjacentOverlapMm()`
  - Finish_Front StepIncrement도 동일 groove 매핑으로 COM SetProperty (`TrySetCompositeStepIncrement`)
  - `safeBFirstMax`는 seam을 당기지 않는다(로그만)
  - 금지: `ABUTS_COMPOSITE_STEP_INCREMENT_A` 의존, Finish_Back의 D1.2 반경 앞당김, 고정 0.5mm 겹침, `Middle_Turn`/`Middle_Rough` 재도입, `Back + Z - stlTopZ` 구식 변환

### 4.4 Finish none 처리

- `Finish_All` 모드에서는:
  - 시작 퍼센트: `FirstPassPercent = 1.0`
  - 종료 퍼센트: `BackPointX` 기반 pass percent
- `ABUTS_RETENTION_GROOVE` 환경변수는 `StlFileProcessor`에서 실행 전 설정하고 실행 종료/초기화 시 해제한다.

### 4.5 CAM 직경 기반 불필요 가공 제거

- 백엔드가 전달한 CAM 직경(현재 SSOT: `LatheMachineSetup.BarDiameter`)을 기준으로,
  `Turn`/`Rough`에서 **공구 직경이 CAM 직경보다 큰 오퍼레이션(D12, D10 등)** 은 생성하지 않는다.
- 적용 범위:
  - 3-stage `TurningOp` (Front/Back; Middle legacy skip)
  - 3-stage `RoughFreeFromMillSplitAB` (Roughing, ZLevel; Middle legacy skip)
- 목적:
  - CAM 직경 8.0 케이스에서 대구경 선행 가공을 제거해 불필요 공정/시간을 줄인다.

### 4.6 Front Face/Back Turn 경계 보정 (2026-07-01)

- Front Face 종료점 정책(현행 SSOT):
  - `Face.RightX = FrontPointX + 3.0mm`
  - 단, 항상 `Face.RightX < Splitline_2` (`Splitline_2 - 0.001mm` 상한 클램프)
  - `LastAppliedFrontFaceDepthMm = 0.5mm` (`FrontFaceFixedDepthMm`)
  - 상수: `MainModuleComposite.FrontFaceEndOffsetFromFrontMm`
  - 구현 위치: `MainModuleComposite.ApplyFrontFaceFixedDepth` / `ClampFaceRightXBelowSplitline2`
  - 후속 안전 가드(`TryApplyFaceRightEndGuard`) 후에도 Splitline_2 상한을 다시 적용한다.

- Back Turn 시작점/퇴출 정책(현행 SSOT):
  - 시작점은 `FrontPointX` anchor로 통일한다. (`Front_Turn`과 동일 기준)
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
  - `BackRoughEndX = BackPointX + roughToolRadius`
  - 기본(D4): `+2.0mm`
  - `ROUGH_20=1` 실험(D2): `+1.0mm`
- 기존 `min_z` 기반 raw/translated 계산(`finishline min_z + 4.1`, `BackPointX + ...`)은 사용하지 않는다.
- 구현 위치:
  - `DentalAddinDecomp/DentalAddin/MainModuleComposite.cs`
    - `TryRunRoughFreeFromMillSplitAB`
- 디버깅 기준 로그:
  - `RoughFreeFromMillSplitAB - Back_Rough 끝점 고정 적용: ... roughDia=..., rough20=...`

### 4.10 ROUGH_20 실험 토글 SSOT (2026-07-11)

- 실험 플래그:
  - `ROUGH_20=1` → D2 rough 실험 모드
  - `ROUGH_20=0` 또는 미설정 → 기본(D4) 모드
- 템플릿 선택:
  - `ROUGH_20=1`이면 `Templates/Hanwha-20.est` 우선 사용
  - 파일이 없으면 `Templates/Hanwha.est`로 안전 폴백
  - 구현: `Helpers/EspritDocumentManager.ResolveTemplatePath`
- UserData Turning Extend 오버라이드:
  - `Tech_Default_Path.xml`의 `NumData[5]`를 기본값으로 읽되,
    `ROUGH_20=1`이면 런타임에서 `4.0mm`로 강제 오버라이드
  - 필요 시 `ROUGH_20_TURNING_EXTEND_MM` env로 값 조정 가능
  - 구현: `DentalAddin/DentalAddinConfigurator.ApplyRough20TurningExtendOverride`
- Rough PRC 선택:
  - `ROUGH_20=1`이면 `AcroDent/5_Rough prc/MillRough_3D_20.prc` 사용
  - 기본 모드면 `AcroDent/5_Rough prc/MillRough_3D.prc` 사용
  - 구현: `DentalAddinConfigurator.EnsurePrcBaseDefaults`(PRC[3] 주입), `MainModuleComposite.TryRunRoughFreeFromMillSplitAB`(split 경로)
- Rough 기술 파라미터 SSOT:
  - `MillRough_3D_20.prc`의 기술 파라미터(증분 깊이/절삭 속도/공차/코너값 포함)는
    코드에서 오버라이드하지 않고 PRC 값을 그대로 사용한다.
  - 구현: `MainModuleComposite.AddSplitOp`에서 Roughing/ZLevel에 별도 SetProperty 적용 금지
- Rough 경계(Front/Back) 겹침:
  - SSOT: `backStart = splitline2 - GetRoughAdjacentOverlapMm()` (D4→2.0)
  - `Middle_Turn` / `Middle_Rough` 미생성
  - 구현: `MainModuleComposite.TryRunRoughFreeFromMillSplitAB`

### 4.11 Finish_Cuff Back_Rough 스타일 SSOT (2026-07-11)

- 기본 공정 모드(SSOT):
  - Finish_Cuff는 Back_Rough와 동일한 Rough3D 기술 패턴(0/180 + 동일 boundary)을 사용한다.
  - 기존 Z_PARALLEL/FOLLOW_LINE 실험 경로는 사용하지 않는다.

- 시작/종료 정책:
  - 시작점은 `ABUTS_COMPOSITE_CUFF_START_X`(finishline `min_z + 0.70`)를 우선 사용한다.
  - 접촉 기준 보정으로 `-0.10mm`를 적용한다.
  - 종료점은 `BackPointX` 고정.

- 공구/기술 정책:
  - 기술은 Rough PRC(`PrcFilePath[3]`)를 사용한다.
  - `ROUGH_20=1`이면 `MillRough_3D_20.prc` 우선, 미존재 시 `PrcFilePath[3]` 폴백.
  - 공구는 Finish_Back과 동일하게 D1.2 볼엔드밀(`BM_D1.2`, T07) 강제.
  - 오퍼레이션 이름은 `Finish_Cuff`로 생성한다.

- 구현 위치:
  - `DentalAddinDecomp/DentalAddin/MainModuleComposite.cs`
    - `TryAddCompositeCuff`
    - `ResolveCompositeCuffBackRoughPrcPath`
    - `TryAddCompositeCuffBackRoughStylePasses`
    - `TryAddCompositeCuffBackRoughStyleOp`

### 4.12 Finish_Cuff 디버깅 로그 기준 (2026-07-11)

- `startX/endX/startXSource`
- `boundaryKey/prc/angle(0,180)`
- 생성 결과: `BackRoughStyle 종료(created=...)`

### 4.13 제조사 헥스 회전 모드 정책 (2026-08-29 개정)

검색 키워드: `manufacturerHexRotation`, `hexRotation.appliedDeg`, `request-meta`, `STL모델+`, `헥스30+`, `HEX_C_AXIS`, `ApplyManufacturerHexRotationToNc`

- `request-meta.caseInfos.manufacturerHexRotation` canonical은 `STL모델대로` / `헥스30도회전` / `STL모델+` / `헥스30+`.
  - 플러스 모드(구 헥스40도회전 분기):
    - `STL모델+` → modeBase **0.0**
    - `헥스30+` → modeBase **30.0**
    - 가산량 `addDeg = 30 + hexRotation.appliedDeg` (예: 30+(-29.77)=**0.23**)
    - T4848 → `C(0.0 + addDeg)` (예: C0.23)
    - T0909/T0606 → `C(modeBase + addDeg)` (STL모델+: C0.23, 헥스30+: C30.23)
  - 레거시 `"헥스40도회전"` / `"헥스10도회전"` / 기타 `헥스X도회전` → `STL모델+` 로 정규화.
  - 레거시 `"0"`/`"30"` 허용. **default fallback 주입 금지**.
- 제조사 헥스 기본값(다음 의뢰 시드):
  - 저장: PreviewModal에서 제조사가 mode를 바꾸면 `User.requestSettings.defaultManufacturerHexRotation` 우선, 개인 계정 없으면 `BusinessAnchor.requestSettings.defaultManufacturerHexRotation`.
  - 조회: User → BusinessAnchor → designSoftware(`ExoCAD`=`헥스30도회전`, 그 외=`STL모델대로`).
  - NC는 저장된 `caseInfos.hexRotation.mode`만 따르며 designSoftware를 직접 보지 않는다.
- STL 회전 SSOT:
  - `STL모델대로` / `헥스30도회전` / `STL모델+` / `헥스30+` 모두
    `Rotate90Degrees` 후 `+30 + (-hexRotation.appliedDeg)` 적용.
  - 플러스 모드의 차이는 **NC C축 후처리**뿐 (STL 실회전은 보정=STL모델대로와 동일).
- NC C축 후처리 SSOT(공구 기반, 검색: `HEX_C_AXIS_MAX_MATCHES`):
  - 지정 C축 후보(현재 최대 6곳: T4848 1 + T0909/T0606 5). 개수 변경 시 `ApplyManufacturerHexRotationToNc` 상수·화이트리스트만 수정.
  - `STL모델대로` → 전부 `C0.0` (C30 잔여분 강제)
  - `헥스30도회전` → T4848=`C0.0`, T0909/T0606=`C30.0`
  - `STL모델+` / `헥스30+` → 위 플러스 공식 (appliedDeg 필수)
  - 출력은 반드시 `C##.0` 형태 (`FormatRotationNumber`)
  - 공구번호 미검출/미지원은 즉시 예외
- 재제작(시작 공정=가공)으로 복사된 NC는 원본 헥스 모드 기준이다. 준비 단계에서 mode를 바꾸면 `updateRndHexRotation`이 `caseInfos.ncFile`을 비워 다음 승인 때 Esprit가 재생성한다.
- NC 축 워드 소수점 강제 (CNC 인식):
  - 금지: `C30`, `C0`, `X10`, `Z0` 처럼 소수점 없는 정수 워드.
  - 필수: `C30.0`, `C0.0`, `C0.23`, `X10.0`, `Z0.0`
  - SSOT: `FormatRotationNumber`, `FormatNcNumber`, `EnsureNcDecimalLiteral`, `EnsureNcCoordinateDecimalsOnFile`.
- 구현 위치:
  - `Helpers/NcFileGenerator.cs`
    - `TryResolveHexRotationTargets` / `ResolvePlusModeAddDeg`
    - `FindNearestToolCodeNearLine`
    - `ApplyManufacturerHexRotationToNc` (공구별 C축 치환)
    - `FormatRotationNumber` / `EnsureNcCoordinateDecimalsOnFile`
  - `StlFileProcessor.Process` (request-meta 전달/에러 전파)
  - `Helpers/BackendApiClient.RequestMetaCaseInfos` (request-meta 바인딩)
  - PreviewModal Select: `STL모델대로` / `헥스30도회전` / `STL모델+` / `헥스30+`

## 5. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Esprit 로컬 초기화와 디버깅 메모만 남깁니다.
- 코드 리팩터링/수정 시 주석을 꼼꼼히 작성합니다.
- 기본 원칙(명시): **"다시 찾을 때 헷갈리지않게 코드에 항상 꼼꼼하게 주석을 기록한다"**.
- `rules.md`에 없는 구현/운영 규칙이 나오면 본 파일에 즉시 추가합니다.
- 헥스 회전 관련 코드에서 `보정`/`무보정` 문자열이 발견되면 즉시 `STL모델대로`/`헥스30도회전`으로 치환하고, 발견 위치를 규칙 문서에 기록합니다.
- 기존 rules와 충돌 가능성이 있는 요청이 들어오면, 먼저 사용자 확인(컨펌)을 받은 뒤 진행합니다.

## 6. 레거시 비툴패스 피쳐 (2026-08-23)

캡쳐 피쳐 트리에서 **자식 오퍼레이션이 없는** 진단/잔여 FeatureChain은 생성하지 않거나 공정 종료 시 제거한다.

- 생성 스킵(현행 `machinetype=2` 4축):
  - `Boundry1` / `Boundry2` / `RoughBoundry1..` (`MoveSTL_Module.Boundry`)
  - `3DMilling_90/180/270Degree` (`WorkPlane`) — 빈 FreeForm
  - `Splitline_1` / `Splitline_2` / `TwoPhaseSplitLine` 가이드 라인
- 공정 종료 시 잔여 제거 (`CleanupLegacyNonToolpathFeatures`):
  - `Turning` / `TurningProfile*` (TurnRgn 생성 원본)
  - 기본명 `N 연결`
  - 위 Boundry/Splitline 잔여분
- **유지(툴패스 입력)**:
  - `RoughBoundryFront1` / `RoughBoundryBack1` — Rough `BoundaryProfiles`
  - `CompositeOrientationProfile_*` — Finish OrientationProfile
  - `TurnRgn*` / `3DMilling_0Degree` / `3DMilling_FrontFace` / `3DRoughMilling_*`


## 성능 측정 (PERF)

- 로그 타임스탬프는 `yyyy-MM-dd HH:mm:ss.fff` (ms).
- `[PERF] name START/END elapsedMs=...` 또는 `DentalLogger.Measure("name")` 구간으로 before/after 비교.
- 핵심 구간: `StlFileProcessor.Process`, `ResetDocument`, `InvokeDentalAddin`, `OperationSeq.*`, `MainFree`, `Composite2SplitLine2`, `TryAddOperation:*`, `GenerateNc`.
- 기준 샘플(2026-08-23 KJAWMLCS): 총 ~39s. 병목 = Finish_A Add(~10s), Rough Add, 문서 리셋(~4s), NC(~4s), 중복 MainFree/실패 Composite.
- 개선: Middle 제거(로컬 반영), MainFree 2회차 스킵, FinishingMethod==1 시 legacy Composite 스킵, B_PHASE A OrientationProfile 스킵.
- 비교: 로그에서 `[PERF]` / `DentalLogger.Measure` END 줄의 `elapsedMs` 합산. `TryAddOperation:* elapsedMs`가 ESPRIT 툴패스 계산 시간.
