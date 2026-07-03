# SESSION HANDOFF — 2026-07-03 (OrientationProfile start point mismatch)

## 1) 현재 상태
- 브랜치: `main`
- 최신 커밋:
  - `f933e74876167507b26ba38b5f3ce9cf7d9abb27`
  - 메시지: `esprit: orientation profile strategy consts and MoveSTL sync attempts`
- 푸시 완료: `origin/main`

## 2) 사용자 증상 (미해결)
- `CompositeOrientationProfile_A`가 여전히 원점 근처(좌측)에서 시작하여,
  STL 본체 이동 위치와 시작점이 불일치.

## 3) 핵심 로그 근거
- MoveSTL 후 좌표:
  - `FrontPointX:1.0867`, `BackPointX:13.0267`
- OrientationProfile 생성 로그:
  - `startX=0.050`, `startXSource=ABUTS_COMPOSITE_ORIENTATION_PROFILE_START_X`
- 즉, 현재 케이스에서 env startX가 FrontPointX와 크게 어긋나며 실제 시작점을 잘못 끌어내림.

## 4) 이번 세션 코드 변경 요약
### A. 전략 상수화
- `MainModuleComposite.cs`
  - `CompositeOrientationStrategyDefault = 1`
  - `CompositeOrientationStrategyProfile = 4`

### B. 시작점 동기화 시도
- `StlFileProcessor.cs`
  - `ABUTS_COMPOSITE_ORIENTATION_PROFILE_START_X` 주입 로직 추가
  - MoveSTL 직후 STL shadow 기반 `minX` 계산하여 env 주입
- `MainModuleComposite.cs`
  - 시작점 우선순위: env → shadow minX → `MoveSTL_Module.FrontPointX`
  - 이후 보강: env/shadow 값이 `FrontPointX`와 과도하게 차이나면 폐기하고 `FrontPointX` 사용
- `MoveSTL_Module.cs`
  - MoveSTL selectionSet에 `CompositeOrientationProfile*` 체인도 포함해 deltaX 동시 이동

### C. 문서화
- `bg/pc1/esprit-addin/rules.md`에 Orientation SSOT 섹션 추가

## 5) 다음 세션에서 바로 할 일 (우선순위)
1. **단일 SSOT 강제**
   - OrientationProfile 시작점을 `MoveSTL_Module.FrontPointX`로만 고정 (env/shadow 비활성).
   - 목적: 경로 간 좌표계 불일치 제거.
2. **시각 검증 로그 강화**
   - 생성 직전: `FrontPointX`, `BackPointX`, `envStartX`, `chosenStartX`를 1줄로 출력.
3. **실행 순서 확인**
   - 생성 시점이 MoveSTL 이후인지 재확인 (`Composite2SplitLine2` 진입 시점 로그로 교차검증).
4. **필요 시 임시 가드**
   - `abs(chosenStartX - FrontPointX) > 0.2mm`면 강제로 `FrontPointX`로 override.

## 6) 관련 파일
- `bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs`
- `bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MoveSTL_Module.cs`
- `bg/pc1/esprit-addin/StlFileProcessor.cs`
- `bg/pc1/esprit-addin/rules.md`
