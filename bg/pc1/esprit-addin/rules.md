# Esprit Add-in Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `bg/pc1/esprit-addin` 폴더의 로컬 메모만 남깁니다.

## 1. 구현 메모

- Esprit는 `2-filled`를 입력으로 받아 `3-nc`를 생성합니다.
- 백엔드가 준 PRC 파일명이 비어 있거나 파일을 찾을 수 없으면 폴백 없이 실패합니다.
- 재기동 시 pending 전체를 자동 복구하지 않고, 승인된 단일 작업만 처리합니다.
- `UserData`와 PRC 경로 초기화는 자동 실행 경로에서도 UI와 동일하게 맞춰야 합니다.
- NC 출력 파일명은 최종적으로 `*.nc`로 정규화합니다.

## 2. 구현 체크포인트

- 공정 직전 피처/오퍼레이션 검증 로그를 남겨 원인 추적이 가능해야 합니다.
- Roughworkplane에서 STL 모델을 찾지 못하면 즉시 종료하고 로그를 남깁니다.
- TwoPhase에서 `Rough_A` 이후 `Face(EM2_0BALL)`가 실행될 때는 공구 파손 방지를 위해 우측 끝 안전 간격을 강제합니다.
  - 기준: `roughAEndX = splitX - 0.5mm`
  - 규칙: `(roughAEndX - faceRightX) < 0.3mm` 이면 `faceRightX = roughAEndX - 0.3mm`로 보정
  - 적용 위치: `MainModuleComposite.TryApplyFaceRightEndGuard` (실행 지점: `FrontFaceMill`, `TryRunFreeFormMillSafe`)

## 3. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Esprit 로컬 초기화와 디버깅 메모만 남깁니다.
- 코드 리팩터링/수정 시 주석을 꼼꼼히 작성합니다.
- `rules.md`에 없는 구현/운영 규칙이 나오면 본 파일에 즉시 추가합니다.
- 기존 rules와 충돌 가능성이 있는 요청이 들어오면, 먼저 사용자 확인(컨펌)을 받은 뒤 진행합니다.
