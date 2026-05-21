# Backend Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `web/backend` 폴더에서만 필요한 **구현 메모**만 남깁니다.

## 1. 구조

- 런타임: Node.js + Express + MongoDB
- 라우트는 `modules/<domain>/*.routes.js`에 둡니다.
- 컨트롤러는 `controllers/<domain>/`로 묶습니다.
- 공통 모델의 기준 폴더는 `web/backend/models` 입니다.

## 2. 구현 메모

- `Request.requestId`는 서버가 생성합니다.
- overview 성 집계는 스냅샷 컬렉션을 SSOT로 사용합니다.
- 브리지 큐 조회 실패 시 DB 스냅샷 fallback을 허용합니다.
- 가공 이력의 영속 SSOT는 `MachiningRecord` 입니다.
- 팝빌/세금계산서 작업은 web이 직접 처리하지 않고 큐에 넣습니다.

## 3. 정리 원칙

- 루트와 중복되는 정책은 여기 다시 쓰지 않습니다.
- 과거 리팩터링 기록, 장문 정책 설명, UI 설명은 남기지 않습니다.
- 새 규칙이 프로젝트 전체에 적용되면 이 파일이 아니라 루트 `rules.md`를 먼저 수정합니다.

## 4. Connections (임플란트 커넥션) 관련

- 임플란트 제조사/브랜드/패밀리/타입에 따른 커넥션 직경(`diameter`)과 내부 레퍼런스(`l2`)은
  DB의 `Connection` 컬렉션을 SSOT로 사용합니다.

- DB에 값이 없는 경우(예: `connection.diameter`가 null)에는 서버 시드 파일
  `web/backend/scripts/db/data/connections.seed.js`의 값을 폴백으로 사용합니다. 시드 파일은
  프로젝트에 포함된 참조 데이터이며, 시드가 변경되면 DB 업서트 스크립트와 함께 배포해야 합니다.

- 프론트엔드에서 커넥션 값을 필요로 할 때는 백엔드 API를 통해 조회하세요. 새로 추가된 엔드포인트:
  - GET `/api/system/connections/lookup?manufacturer=...&brand=...&family=...&type=...`
    - 우선 DB 조회 → 시드 폴백 → 없으면 null을 반환합니다.
    - 반환 형식: `{ success: true, data: { diameter: number|null, l2: number|null, source: 'db'|'seed'|'none' } }`
    - 매칭 우선순위: exact(manufacturer+brand+family+type) → manufacturer+brand+family → manufacturer+brand → manufacturer

- 구현 시 유의사항:
  - 프론트엔드는 이 API를 SSOT로 사용하고, 로컬에 시드 복사본을 두지 않도록 권장합니다.
  - 시드 파일의 내용이 변경될 경우 `scripts/db/_core.shared.js`의 업서트 로직을 통해 DB에 반영하세요.
  - 케이스/공백 등의 표기 차이로 매칭이 실패할 수 있으니, 조회는 대소문자 무시(case-insensitive) 방식으로 합니다.

## 5. Request 데이터 마이그레이션: connectionDiameter

- 목적: 기존 Request 문서들 가운데 `caseInfos.connectionDiameter`가 비어있거나 0인 경우,
  임플란트 정보(제조사/브랜드/패밀리/타입) 또는 PRC 파일명으로부터 적절한 커넥션 직경을 계산해 저장합니다.

- 스크립트:
  - `web/backend/scripts/db/backfill-request-connection-diameter.js`
  - 동작: DB 접속 → `Request` 컬렉션에서 `caseInfos.connectionDiameter`가 없거나 0 이하인 도큐먼트 순회 →
    `resolveConnectionTargetDiameter(caseInfos)`를 호출해 직경을 얻으면 `caseInfos.connectionDiameter` 및
    `caseInfos.connectionTargetDiameter`(호환성 필드)를 업데이트합니다.

- 실행 방법(운영 환경에서):
  1. 서버의 애플리케이션 환경변수(.env 등)가 올바른지 확인합니다.
  2. 아래 명령으로 실행합니다:
     ```bash
     # 애플리케이션 루트에서
     node web/backend/scripts/db/backfill-request-connection-diameter.js
     ```
  3. 스크립트는 처리한 건수와 변경한 건수를 콘솔에 출력합니다.

- 주의 사항:
  - 이 스크립트는 안전하게 설계되었으나, 운영 DB에서 실행하기 전에 스테이징 환경에서 먼저 실행해 결과를 검증하세요.
  - 새로운 값을 저장하면 downstream 프로세스(Rhino 처리, CAM 파일 매핑 등)에 영향을 줄 수 있으므로
    배치 실행 전 작업 시간(배치 창)을 확보하시기 바랍니다.
  - 시드/DB에 매핑 정보가 불완전한 경우 일부 의뢰는 여전히 매칭되지 않을 수 있으니, 로그를 수집하여
    추가 매핑이 필요한 브랜드/타입을 보강하세요.

## 6. 자주검사 성적서 연동 규칙 (2026-05)

- 프론트 `SelfInspectionReportModal`은 커넥션 기준값을 하드코딩하지 않고
  `GET /api/requests/by-request/:requestId/connection-spec`로 조회합니다.
- 컨트롤러: `common.requests.controller.js#getConnectionSpecByRequestId`
  - request의 implant 필드 정규화 후 `Connection` 조회
  - 타입 미일치 시 `Hex`/`Non-Hex` fallback 허용
- `Connection` 문서는 `diameter`, `l2`, `hexSize`, `internalGauge`, `protrusionLength`
  필드를 유지합니다.

## 7. Seed 스크립트 구현 주의사항

- `scripts/db/_core.shared.js`의 connection upsert는
  동일 필드를 `$set` + `$setOnInsert`에 중복 기입하지 않습니다.
- `scripts/db/seed/data.js`의 request/ledger/shipping 샘플 데이터 생성은 비활성화했습니다.
  (`db:seed-data`는 core shared 데이터만 시딩)
- 추후 샘플 데이터가 필요하면 별도 opt-in 스크립트로 분리합니다.
