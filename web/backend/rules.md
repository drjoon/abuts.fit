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
  - `utils/creditRealtime.js`
- 실시간 소켓 공통
  - `socket.js`

## 1. 구조

- 런타임: Node.js + Express + MongoDB
- 라우트는 `modules/<domain>/*.routes.js`에 둡니다.
- 컨트롤러는 `controllers/<domain>/`로 묶습니다.
- 공통 모델의 기준 폴더는 `web/backend/models` 입니다.

## 2. 구현 메모

- 인프라 마이그레이션 운영 체크(EB 단일 인스턴스 → LB+NAT, Atlas 비용 유지):
  - 안정화 관찰 기간(며칠) 동안 실사용 트래픽에서 핵심 기능(로그인, 주문/의뢰 등록)을 반복 점검합니다.
  - CloudWatch 알람/에러 리포팅을 확인하고, 피크 시간대 오토스케일링(최대 2대) 동작을 검증합니다.
  - NAT 인스턴스는 현재 단일 구성(비이중화)이므로 재부팅/장애 여부를 집중 모니터링합니다.
  - 장기적으로 CloudWatch 알람 + NAT ASG(최소=최대=1) 자동 복구 구성을 권장합니다.
  - 안정화 이후에는 기존 `abutsfit` 단일 인스턴스 환경을 종료하고, Atlas Network Access는 NAT IP만 남기고 기존 EIP를 제거합니다.
  - 멀티 인스턴스 백엔드에서는 워커 중복 실행 방지를 위해 Mongo 기반 분산락 SSOT를 사용합니다.
    - 공통 락 유틸: `utils/distributedJobLock.js`
    - 적용 워커: `services/reviewApprovalQueue.service.js`, `controllers/requests/shipping.TrackingPoller.js`, `jobs/dummyCncWorker.js`

- 스크류 로트 추적(세척.패킹)은 루트 `rules.md` 섹션 **1.0.3**을 따릅니다.
- 한진 배송조회 자동동기화 장애 우회 정책:
  - 한진 API가 `403/InvalidApiKeyForGivenResource`를 반환하면 앱 기동/런타임을 중단하지 않고 auto-sync만 blocked mode로 전환합니다.
  - blocked mode 재시도 주기: 평일 1시간 간격, 주말은 중지 후 월요일 08:00(KST)부터 재개합니다.
  - 성공 응답이 확인되면 blocked mode를 자동 해제하고 정상 주기로 복귀합니다.
  - 서버 시작 시 `startHanjinTrackingAutoSyncWorker({ runImmediate: false })`를 사용해 부팅 직후 즉시 호출은 비활성화합니다.
  - 관련 구현: `controllers/requests/shipping.TrackingPoller.js`, `services/hanjin.service.js`, `server.js`
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
  - 강제 분리: practice는 `Request` 도메인 API(`/api/requests/*`)를 사용하지 않고,
    `PracticeTransfer` 도메인 API(`/api/practice/transfers/*`)만 사용합니다.
  - 레거시 혼입 경로(`/api/requests/practice/*`, practice의 Request draft 접근)는 제거 대상으로 유지합니다.
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

- practice 취소 API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/cancel-batch`
  - request body: `transferIds?: string[]`, `transferMongoIds?: string[]` (둘 중 하나 이상 필수)
  - response: `{ success: true, data: { successCount: number, failedIds: string[] } }`
  - `failedIds`에는 무효 식별자/미존재/권한범위 밖/이미 취소된 대상이 포함될 수 있습니다.

- 문의 실시간 이벤트 SSOT:
  - 문의 생성 시(admin 대상)
    - `comm:badge-update` (`key=inquiry`, `delta=+1`)
    - `support:inquiry-created`
  - 문의 상태 변경 시(admin 대상)
    - 상태 전이(`open↔resolved`)에 맞춘 `comm:badge-update` 증감
    - `support:inquiry-updated`
  - 구현 파일: `controllers/support/support.controller.js`

- practice 채팅/전송 정책:
  - practice 채팅방 연결은 `GET /api/chats/practice/transfer-room/:transferId`만 사용합니다.
  - legacy request-room 경로(`/api/chats/practice/request-room/:requestId`)는 제거 대상이며 신규 코드에서 사용 금지합니다.
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
  - 불완전가공 판정으로 CAM 복귀가 일어나도, 크레딧 차감 이력은 유지합니다(삭제/환불 금지).
  - 관련 파일:
    - `controllers/requests/common.requests.controller.js`
    - `models/request.model.js`

- 제조사 워크시트 stage 파일 삭제 정책:
  - `DELETE /api/requests/:id/stage-file?preserveStage=1`은 공정 롤백 없이 stage 파일/파일메타만 삭제하고 해당 review status를 `PENDING`으로 갱신합니다.
  - 기본 삭제(`preserveStage` 미지정)는 기존 롤백 동작을 유지합니다.

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
  - 샘플은 크레딧/정산 장부에 무기록(무자료/무상) 처리합니다.
  - 관련 구현: `controllers/requests/common.review.controller.js`, `controllers/requests/common.requests.controller.js`
- 단일 SSOT 장부(General Ledger) 정책:
  - 장부는 논리적으로 1개만 사용하며, 물리 구조는 `LedgerJournal`(헤더) + `LedgerLine`(라인) 2컬렉션으로 구성합니다.
  - 제조사 정산 조회(`/api/manufacturer/credits/ledger`, `/api/manufacturer/credits/daily-summary`, `/api/manufacturer/credits/daily-snapshots/recalc`)는 `LedgerLine` 집계를 SSOT로 사용합니다.
  - 레거시 분리 원장(`CreditLedger`, `ManufacturerCreditLedger`, `SalesmanLedger`, `AdminCreditLedger`)은
    이관 완료 후 반드시 삭제합니다. 이관 기간에도 이중기록(dual-write) 금지.

- LedgerJournal 스키마 초안(필수 필드):
  - `journalId`(UUID, unique)
  - `eventType`(저장형):
    - `REQUEST_SPEND_COMMIT`
    - `SHIPPING_SPEND_COMMIT`
    - `CHARGE_PAID`, `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`, `ADJUST`, `SETTLEMENT_PAYOUT`
  - `businessAnchorId`(의뢰자 기준 키)
  - `refType`, `refId` (`REQUEST`, `SHIPPING_PACKAGE`, `CHARGE_ORDER` 등)
  - `stageFrom`, `stageTo` (워크시트 승인/롤백 전이 기록)
  - `idempotencyKey`(unique)
  - `occurredAt`, `createdAt`, `createdBy`
  - `status` (`POSTED`만 허용; 롤백은 삭제 정책이므로 별도 VOID 상태 운용 금지)

- LedgerLine 스키마 초안(필수 필드):
  - `journalId`(FK), `lineNo`
  - `accountCode`:
    - 크레딧 버킷: `REQ_PAID_CREDIT`, `REQ_FREE_REQUEST_CREDIT`, `REQ_FREE_SHIPPING_CREDIT`
    - 수익 귀속: `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - `ownerRole` (`requestor|manufacturer|devops|salesman|admin`)
  - `ownerId` (원칙적으로 BusinessAnchor 식별자)
  - `amount`, `amountExcludingVat`, `vatAmount`, `amountIncludingVat`
  - `creditKind` (`PAID|FREE_REQUEST|FREE_SHIPPING|null`)
  - `meta` (requestId, shippingPackageId, settlementBatchId 등)

- 승인/롤백 이벤트 정책(강제):
  - `REQUEST_SPEND_COMMIT`: **CAM 승인(가공 진입)** 시 기록
  - `SHIPPING_SPEND_COMMIT`: **세척.패킹 승인(포장.발송 진입)** 시 기록
  - `REQUEST` 차감 삭제: **가공 롤백(CAM 복귀)** 시 대응 커밋 이벤트/라인 **물리 삭제**
    - 롤백 엔드포인트(`DELETE /api/requests/:id/nc-file`, `DELETE /api/requests/:id/stage-file?stage=machining`)도 동일 정책으로 `ensureRequestCreditRollbackDeleteOnRollbackToCam`를 반드시 호출해야 합니다.
    - 삭제 대상 커밋 탐색은 idempotencyKey 매칭을 우선하고, 누락 시 `refType/refId`, `journal.meta.requestMongoId|requestId`, `LedgerLine 역탐색`까지 사용해 원본 COMMIT 저널을 식별/삭제합니다.
    - 샘플(`rnd_sample|copied_sample`)은 `no_spend`를 정상으로 허용합니다.
    - 일반 의뢰는 기본적으로 `no_spend`를 409로 중단하되, 요청자 소비 라인(`REQ_PAID_CREDIT|REQ_FREE_REQUEST_CREDIT`, refType=REQUEST, refId=request._id, amount<0)이 이미 없으면 idempotent success로 허용합니다.
  - `SHIPPING` 차감 삭제: **포장.발송 롤백(세척.패킹 복귀)** 시 대응 커밋 이벤트/라인 **물리 삭제**
  - 롤백에서 REFUND 이벤트/라인 추가 금지
  - 조회 호환성: `type=REFUND` 레거시 조회 파라미터 지원은 제거했습니다.
    조회/표시 타입은 SSOT 목록(`CHARGE_*`, `SPEND_*`, `ADJUST`)만 허용합니다.
  - BG 콜백(예: CNC 처리 완료/실패 콜백)은 파일 상태 동기화 전용이며 승인/롤백 트랜지션이 아니므로,
    크레딧/정산 이벤트를 적재하지 않음
  - 불완전가공(RnD unmachinable) 판정은 크레딧 롤백 사유가 아님
    - 이미 CAM 승인으로 발생한 `REQUEST_SPEND_COMMIT`은 유지
    - 불완전가공으로 CAM 복귀가 일어나도 장부 삭제/환불 금지
    - CAM 이전 취소(의뢰/CAM 단계)만 차감 미발생 상태
  - 조회/표시 타입은 `CHARGE`/`SPEND` 단일값 금지
    - 충전: `CHARGE_PAID` / `CHARGE_FREE_REQUEST` / `CHARGE_FREE_SHIPPING`
    - 소비: `SPEND_PAID` / `SPEND_FREE_REQUEST` / `SPEND_FREE_SHIPPING`
  - `GET /api/credits/balance`는 `LedgerLine` 직접 집계(GL SSOT)만 사용합니다.
    - 프로세스 메모리 캐시를 사용하지 않아 승인/롤백 직후 잔액을 즉시 반영해야 합니다.
  - 웹소켓 실시간 업데이트 발행/수신 SSOT:
    - 송신측은 대상 role 전체에 fan-out emit 합니다.
    - 수신측은 로그인된 role에서 이벤트를 수신하되, 현재 열려 있는 페이지(활성 화면)에서만 즉시 반영합니다.
    - 비활성 페이지 데이터는 페이지 진입 시 재조회(또는 캐시 무효화)로 동기화합니다.
  - 이벤트 발행 payload 설계 공통 원칙(강제):
    - 이벤트는 수신측 부분 갱신이 가능하도록 식별자 중심 payload를 포함합니다.
      (예: `businessAnchorId`, `requestId`, `requestMongoId`, `transferId`, `roomId`)
    - 수신측이 전체 재조회 없이 대상 엔티티 1건을 갱신할 수 있는 API/키를 함께 보장합니다.
    - fan-out emit 자체는 유지하되, 수신 화면이 payload 조건으로 이벤트를 좁혀 처리할 수 있어야 합니다.
  - 대시보드 성능 표준 패턴(강제):
    - 무거운 대시보드는 `heavy summary`와 `cards summary` 경량 API를 분리합니다.
    - 이벤트 직후 화면 반응용 데이터는 경량 API에서 빠르게 반환되도록 스냅샷/최소 집계를 우선 사용합니다.
    - 이벤트 payload에는 최소한 `fromStage`, `toStage`, `requestId|requestMongoId`, `businessAnchorId`(해당 도메인)를 포함해 프론트 즉시 patch를 지원합니다.
    - refetch를 전제로 한 broad emit은 허용하되, 수신측이 이벤트 1회당 전체 대시보드 재계산을 강제당하지 않도록 API를 설계합니다.
  - 관리자 크레딧(`credit:balance-updated`)은 `requestor`, `admin` role fan-out으로 발행하고,
    각 페이지는 payload(`businessAnchorId` 등) 조건이 맞을 때만 갱신합니다.
  - `emitCreditBalanceUpdatedToBusiness` payload 표준:
    - `businessAnchorId`(필수), `balanceDelta`, `reason`, `refId`, `emittedAt`
    - `businessAnchorId`가 있으면 DB 재조회 없이 해당 값을 SSOT로 emit합니다.
  - 관리자 사업자 크레딧 목록 API(`GET /api/admin/credits/businesses`)는
    `businessAnchorId` query를 지원하며, 이벤트 수신 시 대상 row 1건 부분 갱신 용도로 사용합니다.
  - `BusinessCreditBalance`는 레거시 스냅샷 컬렉션으로 간주하며, 런타임 잔액 판정/표시 경로에서 사용하지 않습니다.
  - 잔액 집계 성능 인덱스(필수): `LedgerLine(ownerRole, ownerId, accountCode, occurredAt)`
  - 레거시 `bonus*` alias/fallback은 런타임 경로에서 제거했습니다.

- 샘플 정책(강제):
  - `requestCategory in (rnd_sample, copied_sample)`는 장부 무관 작업으로 간주
  - 샘플은 크레딧 차감/수익 귀속/정산 이벤트를 **전혀 기록하지 않음**(무자료/무상)

- 제조사 직접 NC 가공(비의뢰) 정책(강제):
  - `requestId`/`request._id`/`businessAnchorId` 등 의뢰 과금 메타가 없는 NC 수동 작업(`manual_upload`, direct queue job 등)은
    크레딧/정산 이벤트를 **전혀 기록하지 않음**(무자료/무상)
  - 해당 작업은 생산/장비 운영 이벤트로만 취급하고 General Ledger 쓰기를 금지합니다.

- 정산/지급 정책:
  - 유료/무료 모두 `REV_*` 수익 라인은 기록해 확인 가능해야 합니다.
  - 정산 지급(PAYOUT) 대상은 유료 수익만 허용합니다.
  - 지급 가능 잔액 계산 시 `EARN/ADJUST`는 `creditKind=PAID|null`만 포함하고, 무료(`FREE_REQUEST|FREE_SHIPPING`)는 제외합니다.
  - 배송비 정산은 제조사 실비 부담 정책을 반영해 `SHIPPING_SPEND_COMMIT` 수익을 전액 `REV_MANUFACTURER`로 귀속합니다.
  - 무료 수익은 지급금액 0으로 정산 완료 상태만 표시할 수 있습니다.
  - paid/free 혼합 소비는 의뢰자 잔액에서 **무료 우선 차감 후 부족분만 유료 차감**을 사용합니다.
  - 수익 라인(`REV_*`)의 paid/free 표시는 role 순서가 아니라, 소비된 paid/free 총량을 role별 수익 base에 비례 배분(무편향)해 기록합니다.
  - 수익 분배 계산 SSOT는 `services/creditRevenuePolicy.service.js`를 사용합니다.
    - 런타임 적재(`controllers/requests/common.review.helpers.js`)와 이관 스크립트(`scripts/db/migrate-request-spend-to-gl.js`, `scripts/db/migrate-legacy-creditledger-to-gl.js`)는 동일 함수를 공유해 분배 정책 드리프트를 금지합니다.

- 관리자 credit-reconcile API 정책:
  - `credit-reconcile/check`는 General Ledger 기준 누락 의심 건만 점검합니다.
  - `credit-reconcile/execute`는 누락 이벤트를 직접 생성하지 않으며,
    `BusinessCreditBalance` 스냅샷을 GL 기준으로 재동기화만 수행합니다.
  - 레거시 `CreditLedger` 직접 보정/삽입 로직은 사용 금지합니다.
  - `web/backend/scripts/*`의 `CreditLedger` 직접 수정/삭제 스크립트는 DEPRECATED 처리하며,
    운영 점검은 `reconcile-business-credit-spends.mjs`(GL snapshot diff/upsert),
    `scripts/db/migrate-request-spend-to-gl.js`(의뢰 이력 기반 소비 검증/이관),
    `scripts/db/migrate-legacy-creditledger-to-gl.js`(legacy 원장 기준 일괄 이관/보정),
    또는 관리자 reconcile API만 사용합니다.
  - 이관 전 백업은 `scripts/db/backup-credit-migration-snapshot.mjs`로 수행합니다.
  - legacy 이관에서 `amount=0` 소비행, 참조 누락된 상쇄형 SHIPPING SPEND/REFUND 쌍은 `resolvedIgnored`로 분류해 미적재 처리합니다(오류 unresolved로 취급하지 않음).
  - 기존 GL 배송 수익 분배 보정은 `scripts/db/rebalance-shipping-revenue-to-manufacturer.js`로 수행합니다.
  - 기존 GL 혼합 소비(paid/free) 분해를 최신 무편향 분해 정책(의뢰자 무료우선 소비 + 수익라인 비례배분)으로 정렬하는 보정은 `scripts/db/rebalance-mixed-spend-free-first.js`로 수행합니다.

- 관리자 크레딧 응답 필드 정책:
  - `adminCredit` 계열 응답에서 무료 크레딧 SSOT 키는 `freeRequestCredit`, `freeShippingCredit`, `freeBalance`입니다.
  - `bonus*` 계열 alias 응답/분기/정렬은 제거하고 SSOT 키만 사용합니다.

- 보존식(의뢰 단위) SSOT:
  - `의뢰자 순소비(현존 COMMIT 이벤트 기준)` = `REV_MANUFACTURER + REV_DEVOPS + REV_SALESMAN + REV_ADMIN`
  - 합계 비교 기준은 VAT 제외 공급가(`amountExcludingVat`) 우선

- 구현 강제사항:
  - 승인/롤백/정산 이벤트는 모두 단일 저널 트랜잭션으로 처리
  - `idempotencyKey` unique 인덱스로 중복기록 차단
  - GL 직집계 모드의 동시 차감(overspend) 방지:
    - `CreditBalanceGuard(businessAnchorId unique)` 문서를 spend 트랜잭션에서 `$inc(version)`하여
      동일 앵커 동시 차감을 write-conflict로 직렬화
  - 외부 session 트랜잭션 경로는 snapshot 가시성 때문에 idempotencyKey를 committed view(session=null)로 1회 추가 확인합니다.
    - 목적: 동시성 상황에서 중복 insert(11000)로 트랜잭션이 불필요하게 깨지는 것을 예방
  - 파생 조회(제조사 정산/관리자 대시보드/의뢰자 잔액)는 단일 SSOT 장부 집계값만 사용
- 우편함/배송 무결성 정책(포장.발송):
  - 우편함 재사용/배정은 **BusinessAnchor 단일 점유**를 반드시 보장합니다.
  - `businessAnchorId`가 비어 있는 점유 의뢰는 `UNKNOWN`으로 취급하되,
    같은 주소의 재사용 판정에서 `UNKNOWN`은 혼입 판정에서 제외합니다.
    (anchor 누락 데이터 때문에 동일 업체 박스가 분할 생성되는 현상 방지)
  - 우편함 점유(active) 단계는 `세척.패킹`, `포장.발송`, `추적관리`를 공통으로 사용합니다.
    - 단, `추적관리` 중 `picked_up|completed|canceled` 또는 `trackingStatusCode>=11`(집하완료 이후) 건은 점유에서 제외합니다.
  - 우편함 배정 시점 SSOT: `세척.패킹` 진입 시 선배정하지 않고, `포장.발송` 진입 승인 시점에만 배정합니다.
  - 포장.발송 진입 승인마다 동일 `businessAnchorId`의 다른 활성 점유를 매번 재조회해 우편함을 재결정합니다.
  - 배송비/패키지 보정 시에도 "현재 의뢰 자신의 과거 shippingPackageId"는 우편함 재결정 근거로 쓰지 않습니다.
    - 다른 활성 의뢰가 점유한 패키지만 재사용하고, 자기 과거 패키지는 현재 배정 우편함으로 동기화해 재사용합니다.
  - 롤백/재승인 시 의뢰 문서에 남아있는 기존 `mailboxAddress`는 재사용 근거로 쓰지 않습니다.
    - 같은 `businessAnchorId`의 "다른 활성 의뢰"가 점유 중이면 그 주소로 수렴
    - 아니면 현재값이 있어도 무시하고 첫 번째 빈칸을 재할당
  - `review-status` 승인 트랜잭션에서 우편함 할당 쿼리는 반드시 같은 `session`으로 읽어
    동일 BusinessAnchor의 직전 배정 주소를 같은 트랜잭션 내에서도 재사용해야 합니다.
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
