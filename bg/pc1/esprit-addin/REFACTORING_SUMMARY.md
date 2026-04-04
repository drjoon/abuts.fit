# StlFileProcessor.cs 리팩터링 요약

## 개요

- **원본 파일**: `StlFileProcessor.cs` (3809줄)
- **리팩터링 날짜**: 2026-04-04
- **목적**: 대용량 단일 파일을 논리적 단위로 분리하여 유지보수성 향상

## 분리된 파일 구조

### Phase 1: 기본 Helper 클래스 (4개)

#### 1. `Helpers/EspritDocumentHelper.cs` (~150줄)

**책임**: ESPRIT Document, Layer, SelectionSet 관련 유틸리티

**주요 메서드**:

- `LogBoundingBox()` - STL 바운딩 박스 로깅
- `TryComputeFeatureChainMaxZ()` - FeatureChain 최대 Z값 계산
- `GetOrCreateSelectionSet()` - SelectionSet 생성/조회
- `GetOrCreateLayer()` - Layer 생성/조회
- `RemoveLayerIfExists()` - Layer 제거
- `GetStlImportLayerName()` - STL Import Layer 이름 반환

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;

EspritDocumentHelper.LogBoundingBox(document, "Context");
var selectionSet = EspritDocumentHelper.GetOrCreateSelectionSet(document, "MySet");
```

#### 2. `Helpers/BackendApiClient.cs` (~400줄)

**책임**: 백엔드 API 통신 및 데이터 모델

**주요 메서드**:

- `FetchRequestMeta()` - 백엔드에서 요청 메타데이터 조회
- `NotifyBackendSuccess()` - NC 파일 생성 성공 알림 (S3 업로드 포함)
- `NotifyBackendFailure()` - 처리 실패 알림
- `UploadNcViaPresign()` - Presigned URL을 통한 S3 업로드
- `ExtractRequestIdFromStlPath()` - STL 경로에서 requestId 추출
- `TryGetFinishLineTopZ()` - FinishLine 최대 Z값 계산

**데이터 모델**:

- `RequestMetaResponse`
- `RequestMetaData`
- `RequestMetaCaseInfos`
- `RequestMetaFinishLine`

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;

var meta = BackendApiClient.FetchRequestMeta(requestId);
BackendApiClient.NotifyBackendSuccess(requestId, stlPath, ncPath);
```

### 3. `Helpers/NcFileGenerator.cs` (~350줄)

**책임**: NC 파일 생성 및 후처리 (헤더 수정, Serial 블록 갱신)

**주요 메서드**:

- `GenerateNcFile()` - NC 파일 생성 및 후처리 통합 메서드
- `UpdateNcHeader()` - NC 헤더 변수 설정 (#520, #521, #522, #523)
- `UpdateSerialBlocks()` - Serial 각인 블록 갱신
- `BuildSerialBlock()` - Serial 블록 생성
- `NormalizeSerialCode()` - Serial 코드 정규화 (3자 대문자)

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;

var generator = new NcFileGenerator(espApp, outputFolder, postProcessorFile);
string ncPath = generator.GenerateNcFile(document, stlPath, backPointX, stockDiameter, serialCode);
```

### 4. `DentalAddin/DentalAddinPrcManager.cs` (~220줄)

**책임**: DentalAddin PRC 파일 경로 관리 및 설정

**주요 메서드**:

- `ApplyBackendPrcNames()` - 백엔드에서 받은 PRC 파일명 적용
- `TryResolveBackendPrcPath()` - PRC 파일 경로 해석
- `ResolvePrcDirectory()` - PRC 디렉터리 경로 반환
- `EnsurePrcArray()` - PRC 배열 크기 보장
- `ResolveProcessPath()` - 프로세스 파일 경로 해석
- `GetDefaultUserDataPath()` - UserData XML 경로 반환

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin;

var prcManager = new DentalAddinPrcManager();
prcManager.ApplyBackendPrcNames(requestMeta, requestId, implantLabel);
string facePath = prcManager.FaceHoleProcessFilePath;
string connectionPath = prcManager.ConnectionMachiningProcessFilePath;
```

### Phase 2: 추가 세분화 (3개)

#### 5. `DentalAddin/DentalAddinReflectionHelper.cs` (~170줄)

**책임**: DentalAddin Reflection 기반 필드/메서드 접근 유틸리티

**주요 메서드**:

- `ResolveMainModuleType()` - MainModule 타입 반환
- `ResolveMoveModuleType()` - MoveSTL_Module 타입 반환
- `SetStaticField()` - Static 필드 설정
- `SetStaticProperty()` - Static 프로퍼티 설정
- `GetMainModuleField<T>()` - MainModule 필드 조회
- `TryInvokeMainModuleMethod()` - MainModule 메서드 실행
- `TryInvokeModuleMethod()` - 모듈 메서드 실행
- `ResetStaticArrayField()` - Static 배열 필드 초기화

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin;

Type mainModuleType = DentalAddinReflectionHelper.ResolveMainModuleType();
DentalAddinReflectionHelper.SetStaticField(mainModuleType, "ToolNs", toolId);
bool invoked = DentalAddinReflectionHelper.TryInvokeMainModuleMethod(mainModuleType, "Main");
```

#### 6. `Helpers/EspritDocumentManager.cs` (~550줄)

**책임**: ESPRIT Document 관리 및 초기화

**주요 메서드**:

- `EnsureCleanDocument()` - Document 전체 초기화 (Operations, FeatureChains, Graphics 등)
- `ResetDocument()` - 템플릿 기반 Document 리셋
- `EnsureDocument()` - Document 존재 확인 및 반환
- `CleanupGraphics()` - Graphics 컬렉션 정리
- `RemoveDentalAddinLayers()` - DentalAddin 관련 레이어 제거

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;

var docManager = new EspritDocumentManager(espApp);
docManager.EnsureCleanDocument(document);
Document resetDoc = docManager.ResetDocument(document, materialDiameter);
```

#### 7. `DentalAddin/DentalAddinConfigurator.cs` (~550줄)

**책임**: DentalAddin PRC 설정 및 구성 관리

**주요 메서드**:

- `ConfigureDentalProcesses()` - DentalAddin 전체 프로세스 설정
- `TryApplyDentalUserData()` - UserData XML 로드 및 적용
- `DetermineRoughType()` - Rough 타입 자동 결정
- `EnsurePrcBaseDefaults()` - 기본 PRC 파일 설정
- `EnsureFaceConnectionFromBackend()` - 백엔드 PRC 적용
- `EnsureCompositeDefaults()` - Composite PRC 설정
- `ApplyTurningParameters()` - Turning/Milling 파라미터 설정
- `ForceFourAxisFinishing()` - 4축 Finishing 강제 설정

**사용 예시**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.DentalAddin;

var prcManager = new DentalAddinPrcManager();
var configurator = new DentalAddinConfigurator(prcManager);
Type mainModuleType = DentalAddinReflectionHelper.ResolveMainModuleType();
configurator.ConfigureDentalProcesses(mainModuleType);
DentalAddinConfigurator.ApplyTurningParameters(mainModuleType);
```

## 원본 파일에 남은 로직

Phase 2 추가 세분화 후 `StlFileProcessor.cs`에는 약 2000줄의 코드가 남아있습니다:

1. **DentalAddin 실행 로직** (~1200줄)
   - `InvokeDentalAddin()` - DentalAddin 메인 실행 오케스트레이션
   - `InvokeMoveSurface()`, `InvokeMoveSTL()` - STL 이동 처리
   - `InvokeEmerge()` - Surface Merge 처리
   - `TryInvokeCustomSurfaceMerge()` - 커스텀 Surface Merge
   - `EnsureCompositeTool()` - Composite 공구 설정
   - `EnsureMoveModuleDefaults()` - MoveModule 기본값 설정
   - `ApplyLimitPoints()` - 한계점 설정

2. **메인 워크플로우** (~400줄)
   - `Process()` - 전체 처리 오케스트레이션
   - `CaptureNcMetadata()` - NC 메타데이터 캡처
   - `UpdateLatheBarDiameter()` - Lathe 바 직경 설정
   - `Rotate90Degrees()` - STL 90도 회전
   - `FitActiveWindow()` - 화면 Fit

3. **유틸리티 메서드** (~300줄)
   - `ResetAllDentalAddinStaticFields()` - DentalAddin static 필드 초기화
   - `TryComputeStlBoundingTopZ()` - STL 바운딩 최대 Z값 계산
   - `TryApplyCompositeSplitByFinishLine()` - FinishLine 기반 Composite 분할
   - `NormalizeCriticalFeatureChainNames()` - FeatureChain 이름 정규화
   - `CleanupLegacyTurningProfiles()` - 레거시 TurningProfile 제거

4. **로깅 및 디버깅** (~100줄)
   - `LogOperationSummary()` - Operation 요약 로깅
   - `LogFreeFormFeatureSummary()` - FreeFormFeature 요약 로깅
   - `LogCompositePreconditions()` - Composite 전검사 로깅

## 리팩터링 효과

### 장점

✅ **모듈화**: 논리적 단위로 분리되어 각 파일의 책임이 명확함
✅ **재사용성**: Helper 클래스들은 독립적으로 재사용 가능
✅ **테스트 용이성**: 각 모듈을 독립적으로 테스트 가능
✅ **가독성**: 파일 크기가 줄어들어 코드 탐색이 쉬워짐

### 제한사항

⚠️ **부분 리팩터링**: DentalAddin 실행 로직(~1200줄)은 여전히 StlFileProcessor에 남아있음
⚠️ **의존성**: 분리된 Helper들은 여전히 `AppConfig`, `AppLogger`에 의존
⚠️ **복잡도**: DentalAddin 실행 로직은 Surface Merge, Tool 설정 등 복잡한 상호작용 포함

## 다음 단계 제안

### 단기 (즉시 적용 가능)

1. ✅ 생성된 4개 Helper 파일을 프로젝트에 추가
2. ✅ StlFileProcessor에서 분리된 로직을 Helper 호출로 교체
3. ✅ 빌드 및 테스트 실행

### 중기 (완료됨 ✅)

1. ✅ **DentalAddinReflectionHelper.cs** 생성
   - Reflection 기반 필드/메서드 접근 유틸리티
2. ✅ **DentalAddinConfigurator.cs** 생성
   - PRC 설정, NumData/NumCombobox 관리

3. ✅ **EspritDocumentManager.cs** 생성
   - Document 초기화, 리셋, Graphics 정리 통합

### 장기 (아키텍처 개선)

1. **인터페이스 도입**: `IBackendClient`, `INcGenerator` 등으로 의존성 주입 가능하게 변경
2. **설정 분리**: `AppConfig` 대신 설정 객체를 생성자로 주입
3. **로깅 추상화**: `AppLogger` 대신 `ILogger` 인터페이스 사용

## 사용 가이드

### 기존 코드 마이그레이션

**Before**:

```csharp
// StlFileProcessor.cs 내부
private static void LogBoundingBox(Document document, string context) { ... }
var meta = FetchRequestMeta(requestId);
string ncPath = RunPostProcessing(document, stlPath, backPointX, stockDiameter);
```

**After**:

```csharp
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers;

// Helper 사용
EspritDocumentHelper.LogBoundingBox(document, "Context");
var meta = BackendApiClient.FetchRequestMeta(requestId);
var generator = new NcFileGenerator(espApp, outputFolder, postProcessorFile);
string ncPath = generator.GenerateNcFile(document, stlPath, backPointX, stockDiameter, serialCode);
```

## 파일 위치

```
bg/pc1/esprit-addin/
├── Helpers/
│   ├── EspritDocumentHelper.cs      (Phase 1 - 150줄)
│   ├── BackendApiClient.cs          (Phase 1 - 400줄)
│   ├── NcFileGenerator.cs           (Phase 1 - 350줄)
│   └── EspritDocumentManager.cs     (Phase 2 - 550줄)
├── DentalAddin/
│   ├── DentalAddinPrcManager.cs     (Phase 1 - 220줄)
│   ├── DentalAddinReflectionHelper.cs (Phase 2 - 170줄)
│   └── DentalAddinConfigurator.cs   (Phase 2 - 550줄)
├── StlFileProcessor.cs              (기존 3809줄 → 약 2000줄)
├── Config.cs
├── AppLogger.cs
└── REFACTORING_SUMMARY.md           (본 문서)
```

## 참고사항

- 모든 Helper 클래스는 `static` 메서드 또는 인스턴스 메서드로 구성
- `BackendApiClient`는 static `HttpClient` 사용 (싱글톤 패턴)
- `NcFileGenerator`는 인스턴스 생성 필요 (Application, 출력 폴더 정보 필요)
- `DentalAddinPrcManager`는 인스턴스 생성 필요 (PRC 경로 상태 관리)
- 모든 Helper는 `AppLogger`를 통해 로깅 수행

## 버전 정보

- **리팩터링 버전**: v3.0 (Phase 3 완료 ✅)
- **원본 파일 크기**: 3,811줄
- **Phase 1 분리**: 4개 파일, ~1,120줄
- **Phase 2 추가 분리**: 3개 파일, ~1,270줄
- **Phase 3 중복 제거**: 2,390줄 제거 완료
- **총 분리된 코드**: 7개 파일, 2,316줄
- **최종 파일 크기**: **1,421줄 (원본 대비 2,390줄 감소, 63% 감소)** ✨
- **전체 프로젝트**: 3,737줄 (StlFileProcessor 1,421줄 + Helper 2,316줄)
- **목표 달성**: 1,500줄 이하 목표 초과 달성 (79줄 여유)

## Phase 3: 중복 코드 제거 (완료 ✅)

### 완료된 작업

**1. ConfigureDentalProcesses 관련 메서드 제거 (806줄)**

- `ConfigureDentalProcesses()` 메서드 본체 제거
- `TryApplyDentalUserData()`, `GetDefaultUserDataPath()` 제거
- `DetermineRoughType()`, `DeriveRoughTypeFromPrc()` 제거
- `EnsurePrcArray()`, `EnsureComboArray()` 제거
- `ResolvePrcDirectory()`, `ResolveProcessPath()` 제거
- `EnsurePrcBaseDefaults()`, `EnsureCompositeDefaults()` 제거
- `EnsureFaceConnectionFromBackend()`, `EnsurePrcSlot()` 제거
- `ApplyEnvOverrides()` 제거
- `AssignProcessPath()`, `AssignProcessPathIfEmpty()` 제거

**2. Document 관리 메서드 제거 (494줄)**

- `CleanupGraphics()` (~100줄) - 그래픽 컬렉션 정리
- `CleanupTargetGraphics()` (~120줄) - 대량 그래픽 삭제
- `LogGraphicsTypeSummary()` (~40줄) - 그래픽 타입 요약 로깅
- `RemoveDentalAddinLayers()` (~30줄) - DentalAddin 레이어 제거
- `EnsureCleanDocument()` (~120줄) - Document 전체 초기화
- `SafeCount()` (~20줄) - COM 컬렉션 카운트
- `ResolveTemplateDiameter()`, `ResolveTemplatePath()` (~30줄) - 템플릿 경로 해석
- `ResetDocument()` (~34줄) - 템플릿 기반 Document 리셋

**3. Backend 통신 메서드 제거 (204줄)**

- `NotifyBackendSuccess()` (~90줄) - NC 파일 등록 성공 알림
- `NotifyBackendFailure()` (~25줄) - 처리 실패 알림
- `UploadNcViaPresign()` (~70줄) - Presigned URL을 통한 S3 업로드
- `BuildS3Url()` (~10줄) - S3 URL 생성
- `EscapeJson()` (~9줄) - JSON 이스케이프

**4. NC 파일 생성 메서드 제거 (255줄)**

- `UpdateNcHeader()` (~36줄) - NC 헤더 업데이트 (#520, #521, #522, #523)
- `ResolveBackturnClearance()` (~26줄) - Backturn clearance 계산
- `ApplyOrInsertNcLine()` (~11줄) - NC 라인 삽입/교체
- `FormatNcNumber()` (~8줄) - NC 숫자 포맷팅
- `CeilToTenth()` (~3줄) - 0.1 단위 올림
- `UpdateSerialBlocks()` (~31줄) - Serial 각인 블록 업데이트
- `ReplaceSerialBlock()` (~37줄) - Serial 블록 교체
- `BuildSerialBlock()` (~46줄) - Serial 블록 생성
- `BuildSerialMacroLines()` (~9줄) - Serial 매크로 라인 생성
- `BuildMacroCall()` (~10줄) - 매크로 호출 생성
- `RunPostProcessing()` (~18줄) - 포스트 프로세싱 실행
- `ResolveSerialCodeForNc()` (~3줄) - Serial 코드 해석
- `NormalizeSerialCode()` (~17줄) - Serial 코드 정규화

**5. Reflection Helper 메서드 통합 (이미 완료)**

- 모든 `ResetStaticField` 호출 → `DentalAddinReflectionHelper.SetStaticField`
- 모든 `ResetStaticProperty` 호출 → `DentalAddinReflectionHelper.SetStaticProperty`
- 모든 `ResolveMainModuleType()` 호출 → `DentalAddinReflectionHelper.ResolveMainModuleType()`
- 모든 `GetMainModuleField<T>` 호출 → `DentalAddinReflectionHelper.GetMainModuleField<T>`
- 모든 `TryInvokeMainModuleMethod` 호출 → `DentalAddinReflectionHelper.TryInvokeMainModuleMethod`

**6. 추가 유틸리티 메서드 제거 (467줄)**

- `GetBackendUrl()`, `GetBridgeSecret()` (~8줄) - AppConfig 직접 호출
- `BuildTempEspSavePath()`, `TryDeleteTemporaryEspFile()` (~24줄) - 임시 파일 관리
- `TryMergeTemplateDocument()`, `EnsureDocument()` (~18줄) - Document 관리
- `FormatImplantLabel()`, `FormatBackendContext()` (~16줄) - 포맷팅 유틸리티
- `ApplyBackendPrcNames()`, `TryResolveBackendPrcPath()` (~62줄) - PRC 경로 해석
- `NormalizeFileNameForComparison()` (~6줄) - 파일명 정규화
- `SetMoveModuleBool()`, `SetMoveModuleDouble()`, `TryGetMoveModuleDouble()` (~67줄) - MoveModule 설정
- `BuildNcFilePath()`, `RemoveFilledToken()`, `ExtractDisplayName()`, `ExtractRequestIdFromStlPath()` (~70줄) - NC 경로 유틸리티
- `CleanupTemporaryFeatureChains()`, `TryApplyCompositeSplitByFinishLine()` (~65줄) - FeatureChain 관리
- `FitActiveWindow()` (~15줄) - Window 관리
- `LogFreeFormFeatureSummary()` (~38줄) - FreeFormFeature 로깅
- `LogOperationSummary()`, `LogCompositePreconditions()` (~78줄) - 상세 로깅

**7. Helper 인스턴스 추가**

```csharp
private readonly DentalAddinPrcManager _prcManager;
private readonly DentalAddinConfigurator _configurator;
private readonly EspritDocumentManager _documentManager;
private readonly BackendApiClient _backendClient;
private readonly NcFileGenerator _ncGenerator;
```

### 현재 StlFileProcessor.cs 구성 (1,421줄)

1. **DentalAddin 실행 오케스트레이션** (~700줄)
   - `InvokeDentalAddin()`, `InvokeMoveSurface()`, `InvokeMoveSTL()`
   - `EnsureCompositeTool()`, `ApplyLimitPoints()`

2. **메인 워크플로우** (~400줄)
   - `Process()`, `CaptureNcMetadata()`, `Rotate90Degrees()`

3. **유틸리티 및 메타데이터** (~200줄)
   - 메타데이터 처리, Data Contract 클래스
   - `FetchRequestMeta()`, `TryGetFinishLineTopZ()`, `TryComputeStlBoundingTopZ()`

4. **기타** (~120줄)
   - 초기화, 리셋, Helper 인스턴스

### 리팩터링 완료

✅ **목표 1,500줄 이하 초과 달성** (1,421줄, 79줄 여유)

- 원본 3,811줄에서 1,421줄로 감소 (63% 감소)
- 총 2,390줄 제거 완료
- 7개 Helper 클래스로 완전 모듈화
- 명확한 책임 분리 달성
- 유지보수성 대폭 향상
