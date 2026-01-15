# Dental Addin (UI 없는 버전)

Esprit용 덴탈 가공 자동화 애드인 - 패널 UI 없이 핵심 기능만 구현한 버전입니다.

## 구조

### 핵심 모듈

- **Connect.cs** - Esprit 애드인 진입점, 메뉴 등록 및 커맨드 처리
- **DentalPipeline.cs** - 전체 가공 프로세스 실행
- **DentalContext.cs** - 프로세싱 컨텍스트 및 파라미터 관리
- **LicenseValidator.cs** - 라이선스 검증

### 처리 모듈

- **CleanupModule.cs** - 문서 정리 (기존 FeatureChain, Layer 제거)
- **STLProcessor.cs** - STL 모델 분석 및 방향 처리
- **TurningProcessor.cs** - 선삭 가공 프로파일 생성
- **MillingProcessor.cs** - 밀링 가공 처리

### 설정 관리

- **DentalConfig.cs** - 설정 데이터 구조
- **ConfigManager.cs** - XML 기반 설정 저장/로드

## 사용 방법

1. **Esprit에서 실행**

   - View 메뉴 → Toolbars → Dental Process 선택
   - 또는 메뉴에서 직접 "Dental Process" 실행

2. **실행 흐름**

   ```
   문서 정리 → STL 분석 → 선삭 가공 → 밀링 가공 → 완료
   ```

3. **출력 확인**
   - Esprit Output Window에서 진행 상황 확인
   - 각 단계별 메시지 출력

## 기존 버전과의 차이

### 제거된 기능

- ❌ DentalPanel (UI 패널)
- ❌ Dialog1, Dialog2 (설정 다이얼로그)
- ❌ 사용자 입력 폼
- ❌ 실시간 파라미터 조정

### 유지된 기능

- ✅ STL 모델 자동 인식
- ✅ 선삭 프로파일 생성
- ✅ 밀링 가공 처리
- ✅ 라이선스 검증
- ✅ 설정 저장/로드

### 간소화된 기능

- 회전 밀링: 18단계로 간소화 (기존 복잡한 로직 제거)
- 파라미터: 기본값 사용 (DentalContext에서 설정)

## 빌드 방법

1. Visual Studio에서 `DentalAddin.csproj` 열기
2. 참조 경로 확인:
   - Esprit DLL: `C:\Program Files (x86)\D.P.Technology\ESPRIT\`
   - BouncyCastle: `DentalAddinDecomp\packages\`
3. 빌드 (Release 모드 권장)
4. COM 등록: `RegisterForComInterop=true` 설정됨

## 설치

1. 빌드된 `DentalAddin.dll`을 Esprit AddIns 폴더에 복사
2. 라이선스 파일 배치: `AddIns\DentalAddin\[SerialNumber].Lic`
3. Esprit 재시작

## 파라미터 조정

`DentalContext.cs`의 `Initialize()` 메서드에서 기본값 수정:

```csharp
TurningDepth = 0.5;      // 선삭 깊이
TurningExtend = 0.5;     // 선삭 연장
MillingDepth = 1.0;      // 밀링 깊이
Chamfer = 0.1;           // 챔퍼
RoughType = 1.0;         // 러핑 타입
```

## 참고

- 기존 코드: `DentalAddinDecomp/DentalAddin/` 및 `old/` 폴더 참조
- 복잡한 로직은 간소화하여 핵심 기능만 구현
- 추가 기능이 필요한 경우 각 Processor 모듈 확장

## 문제 해결

### 라이선스 오류

- Output Window에 "라이선스가 유효하지 않습니다" 메시지 확인
- `.Lic` 파일 위치 및 내용 확인

### STL 모델 없음

- "STL 모델을 찾을 수 없습니다" 메시지 확인
- Document에 STL 모델이 로드되어 있는지 확인

### 가공 실패

- Output Window에서 상세 오류 메시지 확인
- 각 단계별 경고/오류 로그 참조
