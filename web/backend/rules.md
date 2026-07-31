# Backend Rules

루트 `rules.md`가 최종 기준입니다.

- 루트 축약본에서 제거된 상세 정책/히스토리 보존본: `.archive/rules.legacy-2026-07-29.md`
- 로컬 전체 상세 미러(누락 방지): `rules.legacy-full.md`
- backend 도메인 상세는 이 문서 + `rules.legacy-full.md` + 코드 상단 `related files` 주석을 함께 SSOT로 유지합니다.

- 강제 준수: 루트 `rules.md`의 **[최상단 강제 규칙] 대규모 파일 수정 시 문서/주석 동시 갱신**을 항상 적용합니다.
  - 특히 5개 이상 파일을 탐색/수정한 작업은
    - 관련 rules 문서에 폴더/파일/변경내용 업데이트
    - 코드 내 `related files` 상호참조 주석 추가
    를 완료 조건으로 봅니다.

이 문서는 `web/backend` 폴더에서만 필요한 **구현 메모**만 남깁니다.

## 0. Backend 중요 진입 파일 지도 (로컬)

- 서버 엔트리
  - `app.js`
  - `server.js`
- 의뢰/공정
  - `modules/requests/request.routes.js`
  - `controllers/requests/creation.from-draft.controller.js`
  - `controllers/requests/common.review.controller.js`
  - `controllers/requests/common.review.helpers.js`
  - `controllers/requests/common.requests.controller.js`
  - `controllers/requests/mailbox.utils.js`
  - `controllers/requests/shipping.controller.js`
  - `controllers/admin/admin.dashboard.controller.js`
- CNC/브리지
  - `controllers/cnc/machiningBridge.js`
- 채팅
  - `modules/chat/chat.routes.js`
  - `controllers/chats/chat.controller.js`
- practice 전송
  - `modules/practiceTransfers/practiceTransfer.routes.js`
  - `controllers/practiceTransfers/practiceTransfer.controller.js`
  - `controllers/practiceTransfers/practiceTransferSettings.controller.js`
  - `models/businessAnchor.model.js`
- 관리자 사용자 권한
  - `controllers/admin/admin.users.controller.js`
- 관리자 크레딧
  - `controllers/admin/adminCredit.controller.js`
  - `modules/admin/admin.routes.js`

## 1. 구조

- 런타임: Node.js + Express + MongoDB
- 라우트는 `modules/<domain>/*.routes.js`에 둡니다.
- 컨트롤러는 `controllers/<domain>/`로 묶습니다.
- 공통 모델의 기준 폴더는 `web/backend/models` 입니다.

## 2. 구현 메모

- 스크류 로트 추적(세척.패킹)은 루트 `rules.md` 섹션 **1.0.3**을 따릅니다.
  - 전역 설정 저장 SSOT: `models/systemSettings.model.js` (`packingScrewLotSettings: [{type, lotNumber}]`)
  - 의뢰 스냅샷 SSOT: `models/request.model.js` (`screwTracking`)
  - API/정규화: `controllers/requests/common.requests.controller.js`
  - packing 승인 자동 반영: `controllers/requests/common.review.controller.js`

- `Request.requestId`는 서버가 생성합니다.
- overview 성 집계는 스냅샷 컬렉션을 SSOT로 사용합니다.
- 브리지 큐 조회 실패 시 DB 스냅샷 fallback을 허용합니다.
- 가공 이력의 영속 SSOT는 `MachiningRecord` 입니다.
- 팝빌/세금계산서 작업은 web이 직접 처리하지 않고 큐에 넣습니다.
- BG 콜백 의뢰 매칭 우선순위는 `requestMongoId` → `requestId` → 파일명 fallback 입니다.
- 의뢰 단계 승인(`review-status`, stage=request)에서
  의뢰자 BusinessAnchor의 `requestSettings.defaultManufacturerHexRotation`(레거시 `hexRotationAngle` 포함)이 null이고
  `processBothHexVariants=true`이면,
  반대 헥스 모드의 내부 복사본(`source=manufacturer_sample`, `price.rule=manufacturer_sample`)을 생성해
  별도 lot/NC를 처리합니다.
  - 구현: `controllers/requests/common.review.controller.js`

- 제조사 헥스 회전 모드(`manufacturerHexRotation`)는 백엔드에서 fallback 기본값으로 보정하지 않습니다.
  - 허용값: canonical `STL모델대로` / `헥스30도회전` / `헥스X도회전(total)`
- 제조사 아노다이징 override는 `caseInfos.anodizingEnabled` SSOT로 저장합니다.
  - endpoint: `PATCH /api/requests/:id/anodizing-override`
  - 변경 가능 단계: `의뢰`, `CAM` (그 외 단계는 409)
  - 제조사 워크시트 응답의 `item.business.requestSettings.anodizingEnabled`를 함께 제공해
    프론트가 `caseInfos` 미설정 시 사업자 기본값으로 표시할 수 있어야 합니다.
  - 전달 SSOT: `헥스X도회전`의 X는 `totalDeg(=30+minorDeg)`
    - 예) canonical `헥스40도회전`
  - 하위호환 입력: 레거시 `0`/`30`, 기존 minor 저장값(`헥스10도회전`)은 `헥스40도회전`으로 정규화 허용
  - 미지원/빈값은 request-meta 응답 및 저장 로직에서 즉시 오류로 처리합니다.
- 의뢰 제출(`POST /api/requests/from-draft`)의 `caseInfos.requestorHexRotation`은
  케이스별 `caseInfos.designSoftware`를 기준으로 계산합니다.
  - 케이스 디자인 소프트웨어가 비어 있으면 요청을 실패(400) 처리합니다.
  - `ExoCAD` => `헥스30도회전`
  - `3Shape` 및 기타(custom 포함) => `STL모델대로`
- 워크시트 응답(`GET /api/requests/all?view=worksheet`)의 `item.business`에는
  `requestSettings.designSoftware`를 포함할 수 있으나, 제조사/의뢰자 UI의 실제 표시는 `caseInfos.designSoftware`를 SSOT로 사용합니다.
  - 관련 파일:
    - `controllers/requests/common.requests.controller.js`
    - `controllers/requests/common.review.controller.js`
    - `controllers/bg/bg.controller.js`
- `requestCategory="rnd_sample"`(R&D 보관 원본)은 BG 자동 업데이트 대상에서 제외합니다.
- practice 전송 상태 표준(치과/의뢰자 공통)은 `발송완료 | 취소 | 수신완료 | 다운로드완료`를 사용합니다.
  - 읽음 판정 SSOT: `PracticeTransfer.requestorReadAt`
  - 다운로드완료 판정 SSOT: `PracticeTransfer.requestorDownloadedAt`
  - 가상 의뢰 행 매핑 기준: `controllers/practiceTransfers/practiceTransfer.controller.js#toVirtualRequestRows`

- 관리자 사용자 role 변경/생성 API는 `practice`를 유효 role로 허용해야 합니다.
  - 적용 파일: `controllers/admin/admin.users.controller.js`
  - `validRoles` 기준은 루트 규칙(사업자 타입 허용값)과 동기화합니다.

- practice 역할 범위(정책 고정):
  - practice는 파일 전송 전용 경량 role이며, 크레딧/정산/추천(리퍼럴) 도메인에는 포함하지 않습니다.
  - 따라서 `adminCredit`, `admin.dashboard`, `admin.referral`의 requestor 중심 집계를 practice로 임의 확장하지 않습니다.
  - 위 범위를 바꾸려면 사전 정책 컨펌을 받고 별도 변경으로 진행합니다.

- practice 파일전송 임시저장(다른 PC 이어쓰기) SSOT:
  - 저장 모델: `models/practiceTransferDraft.model.js`
  - API: `GET/POST/DELETE /api/practice/transfers/draft`
  - draft `files`는 `File` 컬렉션의 temp 업로드 파일 소유권(`uploadedBy`) 검증 후 저장합니다.
  - practice 전송 생성 성공 후 draft 정리는 프론트에서 `DELETE /draft` 호출로 수행합니다.
  - 관련 파일:
    - `modules/practiceTransfers/practiceTransfer.routes.js`
    - `controllers/practiceTransfers/practiceTransfer.controller.js`
    - `models/file.model.js`

- 문의 실시간 이벤트 SSOT:
  - 문의 생성 시(admin 대상)
    - `comm:badge-update` (`key=inquiry`, `delta=+1`)
    - `support:inquiry-created`
  - 문의 상태 변경 시(admin 대상)
    - 상태 전이(`open↔resolved`)에 맞춘 `comm:badge-update` 증감
    - `support:inquiry-updated`
  - 구현 파일: `controllers/support/support.controller.js`

- practice 채팅/전송 첨부 다운로드 정책:
  - 다운로드 SSOT 엔드포인트: `GET /api/files/s3/download?key=...&fileName=...`
  - S3 파일은 signed-url 리다이렉트가 아니라 서버 프록시 스트리밍(`pipe`)으로 응답합니다.
  - 권한 판정은 다음 중 하나를 만족해야 합니다:
    - 관리자
    - 업로더 본인
    - 사업자 라이선스 파일 소유 조직 구성원
    - PracticeTransfer 연관 파일의 작성자/대상 기공소/동일 치과 businessAnchor 구성원
    - Chat 첨부파일의 경우 해당 채팅방 참여자
  - 관련 파일:
    - `controllers/files/file.controller.js`
    - `modules/files/file.routes.js`
    - `utils/s3.utils.js`
- 요청자 목록(`getMyRequests`)에서는 `requestCategory!="order"` 의뢰를 제외해 의뢰자에게 노출하지 않습니다.
  - 구현: `controllers/requests/common.requests.controller.js`
- 불완전가공 `continue` 처리 SSOT:
  - `PATCH /api/requests/:id/rnd-unmachinable/continue`는 불완전가공 상태를 해제하면서
    `rnd.requestorContinueAt/by/message`를 함께 기록합니다.
  - 제조사가 다시 불완전가공 판정할 때(`PATCH /api/requests/:id/rnd-unmachinable`)는
    위 `requestorContinue*` 필드를 초기화합니다.
  - 관련 파일:
    - `controllers/requests/common.requests.controller.js`
    - `models/request.model.js`

- 제조사 워크시트 샘플 분류 SSOT는 `Request.requestCategory`입니다.
  - 값: `order`, `rnd_sample`, `copied_sample`
  - 샘플 관련 API/이벤트는 `source` 추정 대신 `requestCategory`를 반환/필터에 사용합니다.
  - 기존 데이터는 `npm --prefix web/backend run db:migrate-request-category`로 백필합니다.
  - 관련 파일:
    - `models/request.model.js`
    - `controllers/requests/common.requests.controller.js`
    - `controllers/requests/common.review.controller.js`
    - `controllers/requests/mailbox.utils.js`
    - `controllers/bg/bg.controller.js`
    - `controllers/cnc/production.js`
    - `controllers/cnc/machiningBridge.js`
    - `services/requestDashboardStats.service.js`
    - `scripts/db/migrate-request-category.js`
    - `package.json`
- 제조사 샘플(`source=manufacturer_sample`, `requestCategory=rnd_sample|copied_sample`)은
  작업용 상태(`rnd.doneAt=null`)에서 일반 의뢰와 동일하게 `포장.발송`/`추적관리` 공정을 진행합니다.
  - R&D 보관 샘플(`rnd.doneAt!=null`)은 R&D 탭 운영 정책으로 분리합니다.
  - 차이는 크레딧 정책만 유지합니다(샘플은 의뢰비/배송비 미차감).
  - 관련 구현: `controllers/requests/common.review.controller.js`, `controllers/requests/common.requests.controller.js`
- 크레딧 버킷(유료/무료) 무결성 SSOT:
  - `CreditLedger.SPEND`는 `spentPaidAmount`/`spentBonusAmount`를 저장해야 합니다.
  - `CreditLedger.REFUND`는 원본 SPEND의 버킷 분해값을 그대로 복원해 저장해야 합니다.
    (환불을 일괄 유료로 적립하면 안 됨)
  - 잔액 계산은 SPEND/REFUND의 분해 필드가 있으면 이를 우선 사용하고,
    레거시 데이터(분해값 없음)에만 refType 기반 fallback을 적용합니다.
  - 같은 `businessAnchorId`에서 동시 처리로 잔액이 음수로 내려가지 않도록,
    크레딧 소비·환불은 `BusinessCreditBalance` 단일 문서의 원자 갱신으로 처리합니다.
  - 요청 과금(`refType=REQUEST`)은 **CNC 가공 시작 콜백(`sourceStep=cnc`, success)** 시점에 수행합니다.
  - 가공 실패 콜백(`sourceStep=cnc`, failed)에서는 요청 과금을 즉시 환불합니다.
  - 요청 과금/환불은 재시도·중복 콜백에서도 idempotent 하게 동작해야 하며,
    이전 시도 환불 완료 후 재가공 시작 시 재차감이 가능해야 합니다.
  - `BusinessCreditBalance`를 `businessAnchorId`별 잔액 SSOT로 사용하며,
    요청 과금/요청 환불/배송비 과금/배송비 환불은 `creditBalance.service`의 원자 갱신으로 처리합니다.
  - 의뢰자/인증/관리자 크레딧 조회는 `BusinessCreditBalance`를 우선 조회하고,
    문서가 없는 앵커만 ledger 기반 백필로 생성해 읽습니다.
  - 관리자 원장 API(`GET /api/admin/credits/businesses/:id/ledger`)는
    응답 `currentBalanceSnapshot`을 `BusinessCreditBalance` SSOT로 제공합니다.
    원장 행 `balanceAfter`는 “행 시점 잔액(러닝밸런스)”으로 해석합니다.
  - 백필 스크립트: `scripts/db/backfill-business-credit-balances.js`
  - 관련 구현: `models/businessCreditBalance.model.js`, `services/creditBalance.service.js`, `controllers/requests/common.review.helpers.js`, `controllers/requests/common.review.controller.js`, `controllers/bg/bg.controller.js`, `controllers/requests/common.requests.controller.js`, `controllers/credits/credit.controller.js`, `controllers/auth/auth.controller.js`
- 우편함/배송 무결성 정책(포장.발송):
  - 우편함 재사용/배정은 **BusinessAnchor 단일 점유**를 반드시 보장합니다.
  - `businessAnchorId`가 비어 있는 점유 의뢰는 `UNKNOWN`으로 취급하되,
    같은 주소의 재사용 판정에서 `UNKNOWN`은 혼입 판정에서 제외합니다.
    (anchor 누락 데이터 때문에 동일 업체 박스가 분할 생성되는 현상 방지)
  - 우편함 점유(active) 단계는 `세척.패킹`, `포장.발송`, `추적관리`를 공통으로 사용합니다.
  - `review-status` 배치 승인 트랜잭션에서 우편함 할당 쿼리는 반드시 같은 `session`으로 읽어
    동일 BusinessAnchor의 직전 배정 주소를 같은 트랜잭션 내에서도 재사용해야 합니다.
    (가공→세척.패킹 대량 승인 시 의뢰건별 우편함 분할 생성 방지)
  - BusinessAnchor 비교는 문자열 단순 캐스팅 대신 `_id/id`까지 포함해 정규화한 값으로 판정합니다.
    (`[object Object]` 형태 오인식으로 인한 재사용 실패 방지)
  - 택배/배송 그룹핑 및 병합 기준에서 `trackingNumber`를 `shippingPackageId`보다 우선 SSOT로 사용합니다.
  - 수동 집하(`POST /api/requests/shipping/hanjin/manual-pickup-complete`)는 우편함 단위 집하를 강제합니다.
    - packageId 매칭 건 + 미할당(shippingPackageId 없음) 건을 함께 처리합니다.
    - 같은 우편함의 같은 집하 처리에서는 trackingNumber를 1개로 통일합니다.
    - 수동 집하 입력은 우편함별 운송장번호를 허용합니다. (`trackingNumberByMailbox`)
    - `한진택배 외 발송` 선택 시 `nonHanjinShippingMethods`를 받아
      `Request.shippingWorkflow.manualDeliveryMethods`에 저장합니다.
    - 한진 외 발송 사유 목록 마스터는 시스템 전역 설정(`SystemSettings.manualPickupReasonOptions`)으로 관리합니다.
      - API: `GET/PUT /api/requests/shipping/manual-pickup-reasons`
    - `DeliveryInfo.carrier`는 한진 외일 때 항상 `"한진 외"`로 저장합니다.
    - `useNonHanjinShippingMethods=true`이면 발송 방식 1개 이상을 강제합니다.
    - 한진 외 발송은 운송장번호 없이 허용하며, 워크플로우는 `completed(배송완료)`로 즉시 반영합니다.
    - 레거시 데이터(`carrier="한진 외"` + manualDeliveryMethods 빈값)는
      `resolveShippingWorkflowState`에서 `"방문 전달"`로 정규화 보정합니다.
    - 수동 집하 시각은 사용자 입력을 받지 않고 서버에서 당일 16:00(KST)로 고정 기록합니다.
    - 레거시 `mock-pickup-complete` 경로는 하위 호환 alias로 동일 로직을 사용합니다.
- 분리 tracking 병합 보정 스크립트:
  - `web/backend/scripts/db/merge-tracking-number-by-request-ids.mjs`
  - dry-run 기본, `--yes`일 때만 반영

- 헥스 회전 문자열 SSOT: 신규/수정 코드에서 `보정`/`무보정` 사용 금지.
  - 발견 시 즉시 `STL모델대로`/`헥스30도회전`로 치환하고 변경 내역을 rules에 기록합니다.

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
