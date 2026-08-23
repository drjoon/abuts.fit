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
- Turn/Rough 경계는 rough 공구 반경 + 안전여유(`+0.2mm`) 오버컷을 적용한다.
  - 기본(D4): `±2.2mm`
  - `ROUGH_20=1` 실험(D2): `±1.2mm`

### 4.3.1 SharedFinishSplit / Splitline_2 SSOT (검색 키워드: `SharedFinishSplitX`, `finishlineTop-1mm`, `X=-Z`)

- 목적: **한 식**으로 아래를 모두 동일 좌표에 둔다.
  - `Front_Rough` 끝
  - `Splitline_2` / `TwoPhaseSplitLine`
  - `Finish_Front` 끝
  - `Finish_Back` 시작
- 기준식:
  - `SharedFinishSplitX = finishLineTopX - 1.0` (tip 쪽 1mm, Z+1 ≡ X-1)
- 좌표 변환 (`EspritHttpServer`: `FrontPointX = -FrontPoint.z`):
  - MoveSTL 전: `FinishLineX = -finishLineTopZ`
  - MoveSTL 후: `finishLineTopX = BackPointX - finishLineTopZ`
  - 재해석: `finishLineTopX = BackPointX - FinishLineTopZ + DefaultStlShift`
- 구현:
  - `TryResolveSharedFinishSplitX` → `TryResolveTwoPhaseSplitLineTargetX`
  - Rough: `frontEnd = splitline2`
  - Finish: `opA.LastPassPercent = opB.FirstPassPercent` (안전클램프 시에도 함께 이동)
- 금지: B만 단독 클램프, `Back + Z - stlTopZ` 구식 변환

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
  - `Face.RightX = FrontPointX + 3.0mm`
  - 단, 항상 `Face.RightX < Splitline_2` (`Splitline_2 - 0.001mm` 상한 클램프)
  - `LastAppliedFrontFaceDepthMm = 0.5mm` (`FrontFaceFixedDepthMm`)
  - 상수: `MainModuleComposite.FrontFaceEndOffsetFromFrontMm`
  - 구현 위치: `MainModuleComposite.ApplyFrontFaceFixedDepth` / `ClampFaceRightXBelowSplitline2`
  - 후속 안전 가드(`TryApplyFaceRightEndGuard`) 후에도 Splitline_2 상한을 다시 적용한다.

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
- Rough 경계(Front/Middle/Back) 오프셋:
  - 공통식: `roughToolRadius + 0.2`
  - 기본(D4): `2.2mm`, 실험(D2): `1.2mm`
  - 구현: `MainModuleComposite.GetRoughBoundaryOffsetMm`

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

### 4.13 제조사 헥스 회전 모드 정책 (2026-07-28 개정)

검색 키워드: `manufacturerHexRotation`, `hexRotation.appliedDeg`, `request-meta`, `헥스40도회전`, `minorDeg`, `totalDeg`

- `request-meta.caseInfos.manufacturerHexRotation` canonical은 `STL모델대로` / `헥스30도회전` / `헥스X도회전(total)`.
  - 전달 SSOT: `헥스X도회전`의 X는 **totalDeg(=30+minorDeg)**.
  - 예) 프론트 minor 10도 선택(`헥스10도회전`) → 백엔드/Esprit 전달값 `헥스40도회전`.
  - 레거시 `"0"`/`"30"`, `헥스10도회전`(minor)은 하위호환으로 정규화 허용.
  - **default fallback 주입 금지**: 빈값/미지원값은 즉시 예외 처리.
- 제조사 헥스 기본값(다음 의뢰 시드):
  - 저장: PreviewModal에서 제조사가 mode를 바꾸면 `User.requestSettings.defaultManufacturerHexRotation` 우선, 개인 계정 없으면 `BusinessAnchor.requestSettings.defaultManufacturerHexRotation`.
  - 조회: User → BusinessAnchor → designSoftware(`ExoCAD`=`헥스30도회전`, 그 외=`STL모델대로`).
  - NC는 저장된 `caseInfos.hexRotation.mode`만 따르며 designSoftware를 직접 보지 않는다.
- STL 회전 SSOT:
  - `STL모델대로` / `헥스30도회전` 모두 동일하게
    `Rotate90Degrees` 후 `+30 + (-hexRotation.appliedDeg)` 적용.
- NC C축 후처리 SSOT(공구 기반):
  - `STL모델대로` → T4848/T0909/T0606 근접 `C0`·`C30` 잔여분을 `C0.0`으로 강제 (ExoCAD designSoftware와 무관, mode SSOT만)
  - `헥스30도회전` / `헥스X도회전` → PRC `C0`를 T0909/T0606에만 `totalDeg`로 치환
  - `T4848` → **항상 `C0.0`** (모드/`minorDeg`와 무관. `minorDeg`는 라벨·로그용만)
  - `T0909`, `T0606` → `totalDeg` 적용
  - 공구번호 미검출/미지원은 즉시 예외 발생(백엔드 실패 콜백 경유 → 프론트 토스트)
- 재제작(시작 공정=가공)으로 복사된 NC는 원본 헥스 모드 기준이다. 준비 단계에서 mode를 바꾸면 `updateRndHexRotation`이 `caseInfos.ncFile`을 비워 다음 승인 때 Esprit가 재생성한다.
- NC 축 워드 소수점 강제 (CNC 인식):
  - 금지: `C30`, `C0`, `X10`, `Z0` 처럼 소수점 없는 정수 워드.
  - 필수: `C30.0`, `C0.0`, `X10.0`, `Z0.0` (이미 소수점이 있으면 유지).
  - `ToString("0.###")` / `"0.###############"` / 정수 단축 / `TrimEnd('0')` 금지. 30.0 이 `"30"` 으로 떨어진다.
  - SSOT: `FormatRotationNumber`, `FormatNcNumber`, `EnsureNcDecimalLiteral`, `EnsureNcCoordinateDecimalsOnFile`.
  - G/M/T/O/P/N/S/F 정수 코드(G0, M50, T0909, F1000)는 그대로 둔다.
- 구현 위치:
  - `Helpers/NcFileGenerator.cs`
    - `TryResolveHexRotationTargets` (total→minor 계산)
    - `FindNearestToolCodeNearLine` (상방 10줄 공구 탐색)
    - `ApplyManufacturerHexRotationToNc` (공구별 C축 치환)
    - `FormatRotationNumber` / `EnsureNcCoordinateDecimalsOnFile` (C30.0 소수점 강제)
  - `StlFileProcessor.Process` (request-meta 전달/에러 전파)
  - `Helpers/BackendApiClient.RequestMetaCaseInfos` (request-meta 바인딩)

## 5. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Esprit 로컬 초기화와 디버깅 메모만 남깁니다.
- 코드 리팩터링/수정 시 주석을 꼼꼼히 작성합니다.
- 기본 원칙(명시): **"다시 찾을 때 헷갈리지않게 코드에 항상 꼼꼼하게 주석을 기록한다"**.
- `rules.md`에 없는 구현/운영 규칙이 나오면 본 파일에 즉시 추가합니다.
- 헥스 회전 관련 코드에서 `보정`/`무보정` 문자열이 발견되면 즉시 `STL모델대로`/`헥스30도회전`으로 치환하고, 발견 위치를 규칙 문서에 기록합니다.
- 기존 rules와 충돌 가능성이 있는 요청이 들어오면, 먼저 사용자 확인(컨펌)을 받은 뒤 진행합니다.
