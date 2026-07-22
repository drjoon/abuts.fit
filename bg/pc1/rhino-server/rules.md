# Rhino Server Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `bg/pc1/rhino-server` 폴더의 로컬 실행 메모와 트러블슈팅만 기록합니다.

## 1. 구현 메모

- Rhino 서버는 `1-stl`을 입력으로 받아 `2-filled`를 생성합니다.
- 파일 감시는 이벤트 기반으로 처리합니다.
- Rhino 안정성을 위해 단일 인스턴스/전역 락 기준을 유지합니다.
- 처리 완료 결과는 백엔드 `register-file`로 등록합니다.
- 정렬(align) 단계는 헥스 기준 Z축 실회전을 수행하지 않고, 헥스 각도는 telemetry-only로 측정/기록합니다.
  - 로그 키: `before_to_X`, `virtual_applied`, `residual_to_X_deg`
  - `hexRotation.appliedDeg` 의미 SSOT: Rhino 미적용 가상 보정량(`-phase_mod`)
  - `residual_to_X_deg` 초과는 실패가 아니라 경고로 처리합니다.
- **finishline Z 메타데이터 명칭 SSOT는 `max_z`, `min_z`입니다.**
  - `top_z` 같은 별칭은 저장/전달하지 않습니다.
  - finishline payload에는 `max_z`, `min_z`와 함께 `max_z_point`, `min_z_point`를 포함합니다.
  - 목적: 백엔드/프론트/에스프릿이 동일 기준점을 재탐색 없이 재사용하도록 통일하기 위함입니다.

관련 파일:
- `bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py`
- `bg/pc1/rhino-server/compute/scripts/finishline_detection.py`
- `bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py`
- `web/backend/controllers/bg/bg.controller.js`
- `web/backend/models/request.model.js`
- `web/frontend/src/features/requests/hooks/useStlMetadata.ts`
- `web/frontend/src/features/requests/components/StlPreviewViewer.tsx`
- `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`

## 2. 트러블슈팅

- `No active Rhino instances found via RhinoCode list`가 뜨면 Rhino 실행 후 `RhinoCode` 또는 `ScriptEditor`를 한 번 열어 RhinoCode 서비스를 깨웁니다.
- align 버전은 올라갔는데 `residual_to_X_deg` 로그가 안 보이면, 실행 경로의 `process_abutment_stl.py` 반영 여부를 먼저 확인합니다.
  - `align_stl_coordinate.py`만 반영되고 래퍼 로그 출력 코드가 누락되면 잔차 로그가 사라질 수 있습니다.
- **원격 PC 실행 경로 주의(2026-07-08):**
  - 운영 로그의 절대 경로(예: `C:\Users\user\abuts.fit\...`)는 개발 PC 경로와 다를 수 있습니다.
  - 경로 문자열이 달라도 동일 모듈 버전(`moduleVersion`)과 로그 키로 반영 여부를 판단합니다.
  - 로컬 디버깅 시에도 경로 동일성을 기준으로 오판하지 않습니다.

관련 파일:
- `bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py`

## 3. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Rhino 로컬 실행 메모와 트러블슈팅만 남깁니다.
- 로컬 `rules.md` 수정 시에도 관련 코드 파일 경로를 함께 기록합니다.
