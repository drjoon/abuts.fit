# DentalAddin Feature/Process Rules

## 전체 공정 흐름
1. STL 병합/회전 → MoveSTL(위치 보정)
2. Boundry: RoughBoundry 포함 FeatureChain 생성 (RoughType>1 이면 2/3까지)
3. Roughworkplane / WorkPlane: RoughType 조건에 따라 `3DRoughMilling_*`, `3DMilling_*` FreeFormFeature 생성
4. OperationSeq: 13개의 PRC 공정을 순서대로 실행하며 각 단계 직전에 `PreOp:<공정명>` 로그로 FeatureChain/FreeFormFeature 상태를 검증함
   - CustomCycle → TurningOp → (RoughType==1? RoughMill+OP36 : RoughFreeFromMill) → FreeFormMill → (MarkSign? MarkText) → CustomCycle2

## 중요한 전역/설정 의존성
- **UserData(DefaultXmlFileName)**
  - `PrcDirectory`, `PrcFilePath`, `PrcFileName`, `NumData`, `NumCombobox` 등을 로드해 MainModule에 주입해야 원래 DLL과 동일한 상태가 됨
  - 자동 실행 경로(StlFileProcessor)에서 reflection으로 SerializableData.Load 호출하여 동일하게 적용
- **RoughType**
  - `PrcFilePath[3]` (Rough PRC 경로)에 따라 자동 결정
    - 경로에 `\5_Rough`, `MillRough_3D`, `0-120-240` 등이 포함되면 3.0
    - `\8_0-180` 포함 시 2.0
    - 그 외 1.0
  - Boundry와 Roughworkplane의 피쳐 생성 분기에 직접 영향
- **NumCombobox[3]**
  - FreeFormMill 이후 Emerge/Composite2 추가 여부 결정

## 피쳐/공정 검증 규칙
- `ValidateBeforeOperation` 헬퍼가 각 공정 호출 직전에 실행되어
  - FeatureChains/FreeFormFeatures의 개수와 이름을 로그로 남기고
  - 요구되는 이름이 없으면 `미발견 ...`으로 즉시 확인 가능
- Roughworkplane 실행 시 `espSTL_Model`을 찾지 못하면 바로 로그 후 종료해 원인 파악이 쉬움

## 작업 반영 사항(2026-01-18)
- StlFileProcessor에서 UserData 로드/적용을 복원해 UI 없이도 동일 초기화가 이뤄지도록 함
- RoughType을 rough PRC 경로 기반으로 자동 산정하여 임의 세팅을 제거함
- OperationSeq에 PreOp 로그/검증 로직을 추가해 13개 공정 모두 피쳐 생성 상태를 기록
- Roughworkplane에 디버그 로그 및 STL 누락 가드를 넣어 피쳐 미생성 원인을 추적 가능하게 함
- UserData 경로(Program Files)에서 PRC 파일을 못 찾을 경우 동일 상대경로를 `c:\abuts.fit\bg\esprit-addin\AcroDent` 에서 재탐색하여 자동 대체, 로그로 경로 교체 내역을 기록함
