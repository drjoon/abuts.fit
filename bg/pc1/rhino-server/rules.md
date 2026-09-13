# Rhino Server Rules

루트 `rules.md`가 최종 기준입니다.

- 루트 축약본에서 제거된 상세 정책/히스토리 보존본: `.archive/rules.legacy-2026-07-29.md`
- 로컬 전체 상세 미러(공통 참조): `rules.legacy-full.md`
- rhino 상세 정책은 이 문서 + 공통 미러 + 스크립트 상단 `related files` 주석으로 보존합니다.

이 문서는 `bg/pc1/rhino-server` 폴더의 로컬 실행 메모와 트러블슈팅만 기록합니다.

## 0. 시간

- 루트 `rules.md` §1.4: 비즈니스 시각은 KST.
- Node 보조 스크립트(`stl-metadata/index.js` 등)는 `process.env.TZ = "Asia/Seoul"`을 엔트리에서 강제한다.
- Windows 호스트 OS TZ도 `Asia/Seoul` 유지.

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

## 1.1 Windows 재부팅 자동 기동 (PC1)

Windows Update 등으로 재부팅되면 Rhino/ESPRIT/브리지는 수동 실행이 아니면 안 뜬다. PC1은 GUI(Rhino·ESPRIT)가 필요하므로 NSSM Session 0이 아니라 **로그온 시 Task Scheduler**로 기동한다.

- 설치(원격 PC, **`bg\pc1`에서** 한 번):
  - `cd C:\Users\user\abuts.fit\bg\pc1`
  - `powershell -ExecutionPolicy Bypass -File .\Install-Pc1Autostart.ps1 -Action install`
- 기동 스크립트: `bg/pc1/Start-Pc1Apps.ps1` (또는 `Start-Pc1Apps.cmd`)
  - 순서: Rhino 8 + ScriptEditor wake → rhino.cmd(:8000) → Esprit.cmd(:8001) → bridge(:8002)
  - Rhino wake: `/runscript="_ScriptEditor"` → SendKeys `_ScriptEditor` → COM → 필요 시 Rhino 재시작
  - ESPRIT 스플래시/라이선스 `확인`은 수동 (자동 클릭 없음)
  - pipe가 생긴 뒤 `init_instance.py`로 health ping
  - 강제 재시작 테스트: `.\Start-Pc1Apps.ps1 -SkipDelay -ForceRhinoRestart`
- 로그: `bg/pc1/logs/autostart-YYYYMMDD.log`
- 전제: 제조 계정이 **로그온**되어야 한다. 로그인 화면에 멈추면 auto-logon을 켠다.
- 제거: `Install-Pc1Autostart.ps1 -Action uninstall`

관련 파일:
- `bg/pc1/Start-Pc1Apps.ps1`
- `bg/pc1/Install-Pc1Autostart.ps1`
- `bg/pc1/rhino-server/compute/scripts/init_instance.py`

## 2. 트러블슈팅

- `No active Rhino instances found via RhinoCode list`가 뜨면 Rhino 실행 후 `RhinoCode` 또는 `ScriptEditor`를 한 번 열어 RhinoCode 서비스를 깨웁니다. (자동 기동은 `Start-Pc1Apps.ps1`이 `_ScriptEditor` + `init_instance.py`로 동일 작업을 한다.)
- align 버전은 올라갔는데 `residual_to_X_deg` 로그가 안 보이면, 실행 경로의 `process_abutment_stl.py` 반영 여부를 먼저 확인합니다.
  - `align_stl_coordinate.py`만 반영되고 래퍼 로그 출력 코드가 누락되면 잔차 로그가 사라질 수 있습니다.
- **커넥션 Z 원점이 헥스에 붙는 경우(2026-08-18):**
  - ExoCAD 원본이 이미 커넥션 원점(헥스가 -Z, OSSTEM TS3 Regular는 약 -2.5mm)인 경우가 있다.
  - 크라운 주축으로 Z를 기울이거나, 직경 이진탐색이 교합면 개구의 허위 3.35mm를 고르면 원점이 헥스로 내려간다.
  - `align_stl_coordinate.py`는 bbox 최장축이 이미 Z이면 주축 회전을 건너뛰고, 직경 매칭에 원형성 점수를 쓴다.
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
