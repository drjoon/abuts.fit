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

- 프로세스 TZ (KST 강제)
  - `bootstrap/env.js` — `process.env.TZ = "Asia/Seoul"` (엔트리/스크립트 공통)
  - `../Procfile`, `../.ebextensions/06_timezone.config`, `../eb.sh`
  - `local.env` / `test.env` / `prod.env` 의 `TZ=Asia/Seoul`
- 로컬 agent/스크립트 DB (강제)
  - 조회·백필·reconcile 등 one-off는 **`MONGODB_URI_TEST`** (`abuts_fit_test`).
  - 실행: `ENV_FILE=local.env NODE_ENV=test` (`scripts/db/_mongo.js`가 TEST URI 선택).
  - Atlas 쓰기: `ABUTS_DB_FORCE=true`. Cursor 룰: `.cursor/rules/mongodb-uri-test.mdc`.
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
- practice 전송 / 의뢰자 유형
  - `modules/practiceTransfers/practiceTransfer.routes.js`
  - `controllers/practiceTransfers/practiceTransfer.controller.js`
  - `controllers/practiceTransfers/practiceTransferSettings.controller.js`
  - `controllers/practiceTransfers/roundBarAbutmentRequest.controller.js`
  - `controllers/admin/admin.roundBarAbutment.controller.js`
  - `models/roundBarAbutmentRequest.model.js`
  - `utils/roundBarAbutment.js`
  - `middlewares/practiceTransferAuth.middleware.js`
  - `utils/requestorCapabilities.js`
  - `models/businessAnchor.model.js` (`requestorCapabilities`)
  - `models/user.model.js` (`requestorCapabilities`)
  - `controllers/businesses/business.update.controller.js`
  - `scripts/db/backfill-requestor-capabilities.js`
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

### 구강스캔 · 기공의뢰서 경로

- **3Shape/TRIOS**: 스캔 데이터는 Communicate로 치과→지정 기공소(어벗츠기공소 포함) 직송. 어벗츠는 중간 플랫폼으로 스캔을 받지 않음.
- **기공의뢰서**: 치식·메모·수가·매칭 등은 어벗츠 기공의뢰(PracticeTransfer)로 작성.
- **비 3Shape**: STL/PLY/OBJ 등 현행처럼 웹앱에 업로드해 기공의뢰와 함께 전송.
- **UI**: Communicate/TRIOS 전용 안내 탭·배너·문구 없음.

- 신속 배송(`express`) 복원 메모:
  - Draft/Request `shippingMode` 필드를 다시 저장합니다. (`models/draftRequest.model.js`, `models/request.model.js`)
  - 생성 경로에서 `"normal"` 강제 금지: `draftRequest.controller.js`, `creation.draft.controller.js`, `creation.from-draft.controller.js`, `creation.request.controller.js`
  - 유효 모드 해석: `controllers/requests/shippingPriority.utils.js`의 `resolveEffectiveShippingMode`
  - 신속 추가 의뢰크레딧: `creditSettings.expressFee`(기본 2000)
    - 설정 API: `GET|PATCH /api/admin/settings/credits` (`authorize(["admin","devops"])`)
      - 공개 조회: `GET /api/credits/settings`
      - 저장/정규화: `admin.settings.controller.js` `updateCreditSettings` (기존 값 merge)
    - 견적/표시: `expressPrice.utils.js` `resolveQuotedPriceWithExpressFee` — 신속 지정 시 `price.amount`에 합산 + `price.expressFee` 기록
      - 생성: `creation.from-draft.controller.js`, `creation.request.controller.js`
      - 준비 단계 모드 전환: `shipping.Requestor.controller.js` `updateMyShippingMode`
      - 응답 정규화: `utils.js` `normalizeRequestForResponse`, 대시보드 recent/snapshot
    - 제출 잔액 체크: `creation.from-draft.controller.js`
    - 실제 차감: `common.review.helpers.js` `ensureRequestCreditSpendOnMachiningEnter`
      - 생산비: `request:<id>:machining_spend`
      - 신속 추가비: `request:<id>:express_surcharge` (분리 저널)
      - 누락 보정: `healMissingExpressSurchargesForBusiness` (크레딧 원장 조회 시)
      - 원장 표시: `creditLedger.utils.js`에서 생산비+신속추가비를 1행으로 합산
    - 지연/모드 전환 취소: `cancelExpressSurchargeIfShipDelayed` → `deleteExpressSurchargeAtomic` (표시 금액도 추가비 제외로 재동기화)
  - 디자인+생산 과금: `caseInfos.productMode === "design_custom_abutment"`일 때만
    - 공식: `(생산 단가 + designFee) × 어벗 수` — 1 STL에 여러 어벗 가능
    - 단가: 치과 청구 SSOT=`creditSettings.membershipProductionPrice`(기본 15,000) / `membershipDesignAndProductionPrice`(기본 25,000). **단일 고시**(치과 멤버십/일반·`pricingTier` 청구 분기 없음). `designFee`는 디자인+생산 − 생산만과 동기화(기본 10,000, **1어벗당**). 배송비 별도·박스당 과금. 신속=`expressFee`(기본 +2,000). 치과 멤버십 월정·가입 90일 1만원 없음. 기공소 자동 매칭 **월 참여 수수료 0원**(성공 `%`만). 루트 `rules.md` §2.3.
    - 특별 공급가: `creditSettings.specialRequestorPrices[]` — 의뢰자별 CNC/환봉 × 생산만·디자인+생산. `amount`=`productionPrice`(레거시). 지정 시 플랫폼 고시가보다 우선.
    - 어벗 수: `designPrice.utils.js` `countDesignAbutmentQty` (`toothWorks` 커스텀어벗·임플란트만, Pontic·작업X 제외 → `tooth` → 1)
    - 견적/표시: `resolveQuotedPriceWithDesignFee`
      - `price.amount` = `(생산단가 + designFee) × qty`
      - `price.designFee` = 디자인 총액, `price.abutmentQty` = qty (재견적 단가 복원)
      - 적용 순서: 디자인+생산 배수 → 신속비(생산=건당, 디자인+생산=어벗 수). 무상/0원 견적에는 미적용
      - 생성·CAM 차감·응답 정규화 경로에서 재적용
    - 차감: CAM `machining_spend` = `(생산단가 + 디자인비) × qty` (신속 `express_surcharge`와 분리)
    - 표시 라벨: `커스텀어벗 생산` / `커스텀어벗 디자인+생산` (생략 시 `생산` / `디자인+생산`)
    - SSOT: `.cursor/rules/design-fee.mdc`
  - 기본 배송 방식: `BusinessAnchor.shippingPolicy.defaultShippingMode` (`normal`|`express`)
    - PATCH: `business.update.controller.js` / 프론트 `NewRequestShippingSection` + `useBulkShippingPolicy`
  - 스케줄: `production.utils.js` `calculateInitialProductionSchedule({ shippingMode, productMode })`
    - 신속: **KST 12시 이전** 당일 영업일이면 당일 16:00 출고, 이후(또는 휴일)면 +1영업일
    - 신속 **선택 가능**: 신속 ETA YMD < 묶음 ETA YMD (`expressSelectable.utils.js` /
      프론트 `isExpressShippingSelectable`). 이점 없으면 UI 비활성·모드 변경 400·접수 시 normal 강등
    - 묶음: `resolveLeadDaysWithSameDayCutoff` — `minBusinessDays=N`이면 접수
      **익영업일부터** N영업일 생산 후 주간 발송 요일 정렬 (`resolveNextWeeklyBatchYmd`).
      lead=1 → 익영업일 16:00 (당일 출고 금지, `(N-1)` 사용 금지)
    - **디자인+생산** (`productMode === "design_custom_abutment"`): 묶음/신속 공통으로
      출고일에 디자인 리드 **+1영업일** (프론트 `estimateShipDate.ts`와 동일).
      안내 UI: `PricingPolicyDialog`, `NewRequestShippingSection`,
      `RequestorBulkShippingBannerCard`
  - 출고일 고정: 의뢰 시점 `originalEstimatedShipYmd`(=estimated)는 포장.발송 진입으로 바꾸지 않음
    (`packingEnterShipYmd.utils.js`). 14:00 이후 진입해도 16:00 집하(또는 당일 수동 집하)면 정시.
  - 자정 이후 정시 평가: `jobs/shippingOnTimeEvalWorker.js` + `shippingOnTime.utils.js`
    - 약속일 KST 자정까지 당일 집하 없으면 `shipOutcome=late`
    - 신속 late → `cancelExpressSurchargeIfShipDelayed`로 추가비 취소
  - 정시 성공률(묶음/신속): 지연 위험 요약에 표시 (`dashboardRiskSummary.service.js`)
  - 포장.발송 진입(`enterManufacturerShippingStage` / `updateCurrentEstimatedShipYmdOnPackingEnter` when `updateShipYmd: true`):
    빈 timeline 필드만 보정. 날짜를 오늘/다음 영업일로 밀지 않음.
  - 묶음 발송 요일 정렬: `resolveNextWeeklyBatchYmd` — YMD 달력일 요일은 서버 로컬 `getDay()` 금지
    (UTC noon 기준). UTC 서버에서 `T00:00:00+09:00`.getDay()를 쓰면 금→토로 읽고
    `fri+mon` 묶음이 화요일로 튀는 회귀가 난다.
  - 출고 우선순위 라벨: `shippingPriority.utils.js` (`출고 N일전` / `출고 N시간전`)
  - 출고일 재계산 스크립트: `scripts/db/fix-today-estimated-ship-ymd.js`
    (`ABUTS_DB_FORCE=true ENV_FILE=local.env|prod.env`, dry-run 후 `--apply`)
  - `getTodayYmdInKst(date?)`는 인자 날짜의 KST YMD를 반환(미지정 시 지금). 스케줄 재계산 시
    `toKstYmd(requestedAt)` / `getTodayYmdInKst(requestedAt)`를 써야 "오늘"로 밀리지 않음.
  - 우선순위: `sortByProductionPriority` 신속 부스트 (스케줄/ETA용). **장비 가공 큐 순서**는 아래 **가공 우선순위** SSOT.
  - 우편함: 신속 건 포함 시 주간 묶음 요일 제한 무시 (`shipping.controller.js` / frontend `shippingDay.helpers.ts`)
  - 대시보드 토글: `PATCH /my/shipping-mode` → `shipping.Requestor.controller.js` `updateMyShippingMode`

### 디자인 파트너 클레임·마감

- 접근: `BusinessAnchor.designAccessEnabled` (`/api/devops/design-access`). 제조사 큐 엔드포인트는
  `authorizeManufacturerOrDesignPartner`로 지정 의뢰자도 허용.
- 설정: `SystemSettings.designDeadlineSettings.claimHours` (기본 3, 1–24).
  API: `GET/PUT /api/devops/design-deadline` (devops/admin).
- 요청 필드: `Request.designClaim` `{ claimedBy, claimedByName, claimedAt, deadlineAt, claimHours }`
  - 활성 = `claimedBy` 존재 && `deadlineAt > now` (만료 lazy)
- 클레임: `POST /api/requests/:id/design-claim` (원자적 findOneAndUpdate, 충돌 409)
- 목록 (`GET /api/requests/all?productMode=design_custom_abutment`, `__designPartner`):
  - 본인 활성 / 미클레임·만료 / 타인 발표 60초만 노출. 발표 후 타인은 숨김. 마감 후 재공개.
  - 응답 메타: `designClaimMeta` / `designClaimPeerBusy` / `designClaimMine` / …
  - worksheet select에 `caseInfos.memo` / `toothWorks` / `prosthesisType` / `files` 포함(디자인 카드·모달).
- 승인: 디자인 파트너는 `design_custom_abutment` + stage=`request` + **본인 활성 클레임**만
  (`updateReviewStatusByStage`). 상수: 발표 60초·경고 30분 (`utils/designClaim.js`).
- 실시간: `request:design-claim-changed` (role=`requestor`/`admin`) — 클레임·발표 60초·마감·신규
  큐 입장 시 push. 스케줄 SSOT: `utils/designClaimRealtime.js`.
- 채팅: `GET /api/chats/request-room/:requestId` — 디자인 파트너는 의뢰 기공소(`request.requestor`)와
  1:1 룸(participants=`[designPartner, requestor]`, `relatedRequestId`). 제조사 룸과 분리.
- 파일: 디자인 파트너는 `original-file-url` 및 Request `caseInfos.file`/`files` S3 키 다운로드 허용.

### 가공 우선순위

장비 생산 큐(재생목록 / Next Up / 자동 연속 가공) 정렬·배정 SSOT.
UI 확인: `GET /api/cnc-machines/machining-priority-rules` + 가공 페이지 「우선순위」 버튼.
데이터 SSOT: `controllers/requests/machiningPriorityRules.js`

#### A. 장비 큐 정렬

- 비교 함수: `controllers/requests/production.utils.js`의 `compareMachiningQueueOrder`
- 배정 시 재번호: `placeRequestAtPolicyQueuePosition` (같은 파일)
- 정책 순위(`getMachiningQueuePolicyRank`, 낮을수록 앞):
  1. 아노다이징 ON + 신속배송
  2. 아노다이징 ON + 묶음배송
  3. 아노다이징 OFF + 신속배송
  4. 아노다이징 OFF + 묶음배송
- 전체 정렬 키 순서:
  1. 가공중(Now Playing)
  2. 정책 순위(아노/신속)
  3. `queuePosition`
  4. 발송예정(`scheduledShipPickup`) → `requestId`

#### B. 준비→가공 장비 배정

- `chooseMachineForCamMachining` (`common.review.machine.js`)
- 후보: 활성 CNC + `allowRequestAssign` + 현재 소재 직경 있음 + 소재 직경 ≥ 요청 `maxDiameter`
- 정렬: ① 커버 가능한 최소 소재 직경 ② 큐 부하(적은 쪽) ③ 오래된 `lastAssignmentAt` ④ `machineId`
- 8mm 이하 의뢰는 8mm 장비에 먼저 쌓고, 큐가 비어 있는 10mm 장비로 보내지 않는다.
- 당일/출고일 신속 14:00 마감이 위험하고 한 장비로는 못 맞출 때만 `expressDeadlineRebalance`가 여유(대형) 장비로 옮길 수 있다.

#### C. 신속배송 14:00 완료 — 빠른 가공 재배치

- 구현: `controllers/requests/expressDeadlineRebalance.utils.js` `rebalanceExpressJobsForFourteenOClockDeadline`
- 트리거: `CAM_STAGE_APPROVED` 후처리(`reviewApprovalQueue.service.js`), 수동 「재배정」
- 1단계(consolidate): 출고일 14:00(KST) 내 완료 가능하면 대형 소재 장비(M5 등)의 신속건을 **최소 커버 소재 장비**(M4 등)로 합친다 (`machineCanCoverRequest`).
- 2단계(spread): 한 장비 큐가 **출고일 14:00** 마감을 넘기면, 다른 여유 장비로 분산(소재 직경 작은 장비 우선).
- 조건: `estimatedShipYmd` 각 건의 출고일 14:00 — 당일만이 아님.
- 소재 직경 변경 시 Esprit force 재생성 (`REQUEST_STAGE_APPROVED` + `forceReprocess`)
- 메타/뱃지: `productionSchedule.fastMachiningRebalance` (`reason=express_deadline_14`) → 프론트 「빠른 가공 재배치」
- Alert: `SystemSettings.lastExpressDeadlineRebalance` + socket `machining:express-rebalance`
  - API: `GET /api/cnc-machines/queues/express-rebalance-alert`, queues `meta.expressRebalanceAlert`
  - 프론트는 모달/칩 닫기 시 Alert `id`를 dismissed로 저장하고, 같은 건은 새로고침해도 재표시하지 않는다.
- 가공시간 예측: `machiningDurationEstimate.utils.js` — 최근 완료건 `(duration/totalLength)` 최댓값(보수적)

#### D. 적용 경로

- 큐 조회: `getAllProductionQueues` / `getProductionQueues` (`controllers/cnc/production.js`)
- 승인·배정: `common.review.controller.js`, `services/reviewApprovalQueue.service.js`
- 자동 Next: `controllers/cnc/machiningBridge.js` `fetchPendingForAutoNext`
  - 호환 SSOT: 장착 소재 직경 ≥ `caseInfos.maxDiameter` (D6 의뢰 → D8/D10 장비 허용; 그룹 exact-match 금지)
  - 공유 헬퍼: `distribution.utils.js` `isRequestDiameterCompatibleWithMachineMaterial`
- 재배정: `controllers/cnc/production.js` redistribute — 소재≥maxDiameter 커버 + 최소 소재 우선 (`rankCoveringMachinesForRequest`; diameterGroup exact-match 금지) + express rebalance
  - 배정 소재 직경이 기존 NC와 다르면 `caseInfos.ncFile` `$unset` 후 Esprit force 재생성
- 소재 교체: `controllers/cnc/material.js` `updateMachineMaterial` — 해당 장비 대기 큐 중 직경 불일치 NC도 동일하게 재생성
- 준비→가공 진입: `common.review.controller.js` — 배정 장비 소재 직경 ≠ 기존 NC 직경이면 NC 제거 후 Esprit force 재생성 (기존 NC 재사용 금지)
- Next Up 수동 이동: `POST /api/cnc-machines/queues/move` (`moveProductionQueueRequest`) — 대기 건만, 대상 소재≥maxDiameter. **항상** `caseInfos.ncFile` `$unset` 후 `REQUEST_STAGE_APPROVED`+`forceReprocess`로 CAM/NC 재생성(이전 NC 재사용 금지). 메타는 `productionSchedule.manualMachineMove`(express `fastMachiningRebalance` 뱃지와 분리). 프론트: Next Up 카드 드래그→타 장비 Next Up 드롭; NC 없을 때 「CAM 생성 중」 블러 오버레이(준비 탭 라이노 작업중과 동일 패턴)
- 표시: 큐/lastCompleted/summary API에 `shippingMode` 포함 → 프론트 `ShippingModeBadge` (프리뷰 추가 round-trip 금지)
- 표시: 큐/lastCompleted에 `businessName`(BusinessAnchor.name) 포함 → 프론트 가공 카드·예약목록 의뢰자명
  - 배치 조회: `controllers/cnc/shared.js` `buildBusinessNameByAnchorIdMap`
- 인프라 마이그레이션 운영 체크(EB 단일 인스턴스 → LB+NAT, Atlas 비용 유지):
  - 안정화 관찰 기간(며칠) 동안 실사용 트래픽에서 핵심 기능(로그인, 주문/의뢰 등록)을 반복 점검합니다.
  - CloudWatch 알람/에러 리포팅을 확인하고, 피크 시간대 오토스케일링(최대 2대) 동작을 검증합니다.
  - NAT 인스턴스는 현재 단일 구성(비이중화)이므로 재부팅/장애 여부를 집중 모니터링합니다.
  - 장기적으로 CloudWatch 알람 + NAT ASG(최소=최대=1) 자동 복구 구성을 권장합니다.
  - 안정화 이후에는 기존 `abutsfit` 단일 인스턴스 환경을 종료하고, Atlas Network Access는 NAT IP만 남기고 기존 EIP를 제거합니다.
  - 멀티 인스턴스 백엔드에서는 워커 중복 실행 방지를 위해 Mongo 기반 분산락 SSOT를 사용합니다.
    - 공통 락 유틸: `utils/distributedJobLock.js`
    - 적용 워커: `services/reviewApprovalQueue.service.js`, `controllers/requests/shipping.TrackingPoller.js`, `jobs/dummyCncWorker.js`, `jobs/dailyReferralSnapshotWorker.js`

- 가격/리퍼럴 rolling 스냅샷:
  - 일일 재계산 워커: `jobs/dailyReferralSnapshotWorker.js`
    - `server.js`에서 `startDailyReferralSnapshotWorker()`로 기동 (EB web 프로세스 포함)
    - KST 일자당 1회 실행(당일 완료 마커 없으면 즉시 실행, 자정 1분 창에 의존하지 않음)
    - 이벤트 기반 스냅샷이 있어도 일일 배치(정산/warmup 포함)는 건너뛰지 않음
    - 멀티 인스턴스 중복 방지: `worker:daily-referral-snapshot` JobLock
    - 당일 완료 마커: `worker:daily-referral-snapshot:done:<ymd>` (TTL ~48h)
  - 가격 SSOT 자동 점검(`runPricingSsotConsistencyCheck`)은 워커/관리자 대시보드 노출에서 제외
  - 수동/CI 점검은 `scripts/db/check-pricing-ssot-consistency.js` / `npm run db:check-pricing-ssot` 유지
  - 이벤트 기반 재계산: `services/requestSnapshotTriggers.service.js`
    - 의뢰 취소/삭제 시 `triggerDashboardSummaryRefreshForAnchorId`가 카드 요약과
      출고예정(`bulkShippingSnapshot`)을 함께 재계산. `GET /api/requests/my/bulk-shipping`은
      `waitForBulkShippingSnapshotRefreshForAnchorId` 후 스냅샷을 반환(당일 예전 건수 재캐시 금지).
  - 관리자 대시보드 진입: `controllers/admin/admin.dashboard.controller.js`
  - 관리자 문자 템플릿 SSOT: `models/adminSmsTemplate.model.js` + `controllers/admin/adminSms.controller.js`
    - `GET/POST /api/admin/sms/templates`, `PUT/DELETE /api/admin/sms/templates/:id`, `POST /api/admin/sms/templates/sync-kakao`
    - 목록 조회 시 팝빌 알림톡 형식 기본 템플릿 7종 시드(#{변수}/강조표기, seedVersion) + 빈 코드는 팝빌 승인 템플릿명 자동매칭/env(`POPBILL_ATS_*`)로 연결
    - `ats_credit_charged`: 입금 매칭 후 기공료 선입금 반영 안내. SMS(90byte/한글 45자) 한 줄. 자동 발송 `utils/creditBPlanMatching.js` `notifyChargePrepaidApplied`. 알림톡 코드가 있으면 우선, 없으면 문자.
    - 관리자 문자/알림톡 발송은 큐가 아니라 팝빌 즉시 전송(`sendPopbillXMS` / `sendPopbillKakaoATS`)

- 커스텀 어벗 의뢰 단가 SSOT:
  - 관리자「플랫폼 설정 · 커스텀어벗」. 치과 고시·크레딧 차감=`membershipProductionPrice`(기본 15,000, 신속은 +`expressFee`). **청구 단일가** — `regular*`·「멤버/일반」은 딜러 유무 분배용.
  - 기공소 어벗생산의뢰 안내는 치과와 동일 플랫폼 고시(`membershipProductionPrice` / `membershipDesignAndProductionPrice`). 가입 90일 1만원 런칭가 없음.
  - 기준일 계산은 `resolveRequestorPricingBaseDate`를 사용하고, 신규 의뢰 견적/의뢰자 대시보드 집계가 동일 규칙명을 공유해야 합니다.
  - 관련 파일:
    - `controllers/requests/utils.js`
    - `controllers/requests/dashboard.controller.js`
    - `utils/creditSettingsDefaults.js`

- 역할별 크레딧 버킷 SSOT(강제):
  - **의뢰자 소비 잔액**: `유료크레딧`(`paidCredit`/`REQ_PAID_CREDIT`) + `무료크레딧`(`freeCredit` = `REQ_FREE_REQUEST_CREDIT` + `REQ_FREE_SHIPPING_CREDIT` 합) + (기공소만) `기공크레딧`(`settlementCredit`/`LAB_SETTLEMENT_CREDIT`). 사용처 제한 없음(기공의뢰·어벗생산·배송·신속비 모두 가능). 소진 시 **무료 → 기공(상계) → 유료**. GL 계정은 분리 유지. `balance`=paid+free, `spendableBalance`=paid+free+settlement.
  - **치과(`practice`)**: 유료/무료크레딧으로 기공비·생산·배송을 지불. 잔액/장부 UI에 `기공정산크레딧`/`settlementCredit`을 **노출하지 않음**(잔액 0).
  - **기공소(`lab`)**: 충전(선입금)·무료와 기공크레딧(치과 적립) **적립 경로는 분리 표시**. 주문 차감은 통합(`무료→기공→유료`). 기공 사용분=월 정산 상계. 잔여 기공크레딧 → `SETTLEMENT_PAYOUT`.
  - 잔액 API/`currentBalanceSnapshot`은 `freeCredit`·`spendableBalance`·`requestorKind`를 함께 내려 UI가 기공정산크레딧 행을 lab에만 그린다.
  - 소비 라인 `meta.usageKind`: `practice_transfer` | `abutment_production` | `shipping` | `express_surcharge`.

- 기공소 기존 거래처 · 기공정산크레딧 SSOT:
  - `LabTradingPartner`: lab 창 시작일=`max(pricingBaseDate, 2026-08-11)`부터 30일간 발급된 초대는 검증 완료 시 `status=active`(소개 치과). 30일 경과 후에도 초대 발급은 계속 허용하되(`invitedAfterWindow=true`), 검증 완료 시 `status=referred`로 승격된다. 플랫폼 수수료는 등록 여부와 무관하다.
  - 초대 링크 → 치과 가입 → 사업자 `verified` 시 `status=active|referred`(발급 시점의 `invitedAfterWindow`로 결정). API: `/api/lab-trading-partners`
  - 기공비: `BusinessAnchor.labFeeSchedule`(crown/bridge/inlay/pontic + items). **마스터 `active`(기본 off)가 켜져야 설정 완료.** 수가 디폴트는 기본값·항목 on. 꺼져 있으면 청구 0원(로그인 시 설정 탭 유도). **지정 의뢰 `mark-accepted`는 마스터 On + 해당 보철 제공 항목 수가 필수** — 항목 Off·0원이면 `409` `reason=lab_fee_unconfigured`(+`missingFeeNames`, 기공비 설정 탭에서 해당 카드 하이라이트). 치과 UI는 `견적 0만원` 대신 기공비 미설정. PTX CA는 기공소 수가이므로 해당 항목 Off·0원이면 수락 차단(`missingFeeNames`). 임시치아는 설정 카드 두 장(이름 모두 「임시치아」, 3치 이하·6치 이하)으로 분리하고, 의뢰서 「임시치아」 청구 시 치아 수 구간으로 합산. 유지장치는 연결 스팬당 1세트(같은 악궁이어도 `+`로 끊기면 별도 세트, 연결 정보 없는 레거시는 악궁당 1세트). **PTX 커스텀어벗 치과 청구:** 단독=기공소 `커스텀어벗(지그제외)`(기본 3만), 크라운·브리지·임시치아 등 보철+어벗=기공소 `커스텀어벗(지그포함)`(기본 4만). 레거시 항목명「커스텀어벗」은 지그포함으로 승격. 어벗츠 플랫폼 단가(생산 1.5만·디자인+생산 2.5만, `creditSettings.membership*`)는 **기공소→어벗츠 Request**. **크라운·브리지·임시치아에 어벗을 붙이면 기공수가 + 지그포함 수가.** 유지장치에 남은 커스텀 플래그는 어벗 과금하지 않는다. 브리지 스팬의 `작업X`는 보철이 아니므로 기공비·어벗 단가에서 제외. **기공소가 카탈로그에 없는 신규 항목을 저장하면** `SystemSettings.abutsLabFeeSchedule`에 **Off·`pendingReview`**로 동기화하고 `abuts-lab-fee:pending-items`로 관리자에게 알린다(관리자「어벗츠 수가」에서 검증 후 On=적용).
  - PracticeTransfer 에스크로 SSOT: **생성(`POST /api/practice/transfers`)** 시 치과 유료+무료 잔액 검사 후 기공소몫·어벗츠몫·예상 배송비를 각각 `PRACTICE_TRANSFER_SPEND_HOLD`로 `PLATFORM_ESCROW`에 보류. UI 견적: `GET /api/practice/transfers/quote-context`(지정 기공소 스케줄·수수료율·어벗 단가) + 치식별 합산(`labFeeSchedule.js`). **신규 의뢰는 지정 기공소(어벗츠기공소 포함)만** — 그 기공소 `labFeeSchedule` × 치과별 `labFeeMultiplier`(생성 시점 스냅샷, 이후 변경 소급 금지). 플랫폼 평균수가·별점 기공비 배수·평균수가 워커는 쓰지 않음. **치과 별점 하한·상한**(기본 3~4)은 지정 픽커·생성·하청 풀 수신 게이트(어벗츠 포함 유효 별점이 구간 안인 기공소만). 치과 평가 별점은 **수행 기공소**(하청 `assignee` 우선)에 남기며, 하청 시 치과에는 「인증 협력 기공소에서 처리」만 표시(실명 비공개·확정 후에도 동일). **우리 치과 1점**은 검색 가능·지정/하청 주문 불가. **어벗츠기공소 지정 의뢰**는 기공팀이 원하면 `open-subcontract`로 구간 안 인증 기공소 하청 풀을 연다. 치과 표시·과금은 원청(어벗츠) 수가+할증 유지. **수락(`mark-accepted`)** 시 보류 조정(`PRACTICE_TRANSFER_HOLD_ADJUST`)·`billing.billedAt` 확정. **기공소 발송=`mark-complete`** → lab share 해제, **제조사 발송=packing** → abutment share 해제. 목록 `feeQuote`: 치과=크레딧 소비(`total`), 기공소=설정 수가(`labFeeTotal`).
    - **자동 매칭 성공**(`matchingMode=auto`): 수수료 `BusinessAnchor.payoutRates.platformFeeRate`(기본 **10%**, 레거시 `nonPartnerFeeRate` fallback). 등록/미등록 치과를 나누지 않는다.
    - **지정 기공소**(`matchingMode=direct`): `payoutRates.directPlatformFeeEnabled`가 true일 때만 `directPlatformFeeRate`(기본 **5%**) 적용. **기본 off = 별도 공지 시까지 무료(실효 0%)**.
    - 걷힌 수수료 금액의 잔여 분배: 제조사는 하청 고정단가 경로와 분리. 수수료 잔액은 딜러사·개발운영사·어벗츠 상대비율로 재분배(루트 `rules.md` §2.3).
    - 자동 매칭 식별 정보: 레거시 `matchingMode=auto` 건만 마스킹 유지. **신규 의뢰는 지정 기공소(어벗츠기공소 포함) 수가 + `labFeeMultiplier` 할증.** 치과 평가=별점만(기공비 할인/할증 없음, 수행 기공소·하청 포함). 하한·상한 설정으로 지정·하청 수신 게이트. 기공소「치과 평가」=할증. 자동매칭 신규 작성·별점 기공비 배수는 쓰지 않음.
  - `isTradingPartner`(boolean)는 `active` 관계에서만 true. 거래처(`active`)만 커스텀어벗 생산의뢰 시 기공소 **유료/무료크레딧**에서 생산단가 강제 차감(치과 재차감 금지); `referred`/그 외는 기존처럼 청구 총액에 생산원가가 포함된 것으로 보고 별도 차감 없음.
  - eventType: `PRACTICE_TRANSFER_SPEND_HOLD` / `PRACTICE_TRANSFER_HOLD_ADJUST` / `PRACTICE_TRANSFER_ESCROW_RELEASE`(레거시 `PRACTICE_TRANSFER_SPEND_COMMIT` 유지); accountCode: `PLATFORM_ESCROW`, `LAB_SETTLEMENT_CREDIT`; creditKind: `SETTLEMENT`. 치과 장부: `기공비 보류` / 기공소: `기공크레딧` 적립(완료 시).
  - 월 정산: 기공소 `SETTLEMENT_PAYOUT`으로 기공정산크레딧 → 계좌 이체. 크레딧 페이지 탭은 내역·충전만(기공크레딧 정산 탭 없음; 내역 필터로 기공 버킷 조회).
  - 장부「잔액」(`balanceAfter`): 유료+무료+기공 합산 러닝(현재 잔액과 동일 기준). 버킷별 분리 표시 금지(기공 적립 시 잔액이 리셋되어 보임).
  - 어벗의뢰(직접 커스텀 어벗 생산 의뢰, `practicePrepaid=false`)는 의뢰자가 설정된 비용을 전액 부담한다. 제조사 하청은 어벗 1개당 고정단가이며, 잔여 분배(딜러사·개발운영사·어벗츠)는 별도 확정 전까지 기존 잔여 비율을 유지한다(`controllers/requests/common.review.helpers.js`).

- 스커리씁 로트 추적(세척.패킹)은 `rules.legacy-full.md` 섹션 **1.0.3**을 따릅니다.
- 한진 배송조회 자동동기화 장애 우회 정책:
  - 한진 API가 `403/InvalidApiKeyForGivenResource`를 반환하면 앱 기동/런타임을 중단하지 않고 auto-sync만 blocked mode로 전환합니다.
  - blocked mode 재시도 주기: 평일 1시간 간격, 주말은 중지 후 월요일 08:00(KST)부터 재개합니다.
  - 성공 응답이 확인되면 blocked mode를 자동 해제하고 정상 주기로 복귀합니다.
  - 서버 시작 시 `startHanjinTrackingAutoSyncWorker({ runImmediate: false })`를 사용해 부팅 직후 즉시 호출은 비활성화합니다.
  - 운송장번호 조회 SSOT는 숫자 12자리. 수동 집하 입력 `5373-3627-0634`는 하이픈을 제거한 뒤 `tracking-wbls`를 호출한다. 하이픈 그대로 조회하면 `ERROR-03` + 빈 `wrkList`가 나와 배송완료(66)로 전이되지 않는다.
  - 폴링 종료 조건은 집하완료(11)가 아니라 배송완료(66)/예약취소(03). 오류 행은 기존 `picked_up`을 `accepted`로 되돌리지 않는다.
  - 관련 구현: `controllers/requests/shipping.TrackingPoller.js`, `controllers/requests/shipping.Tracking.helpers.js`, `services/hanjin.service.js`, `server.js`
  - 전역 설정 저장 SSOT: `models/systemSettings.model.js` (`packingScrewLotSettings: [{type, lotNumber}]`)
  - 의뢰 스냅샷 SSOT: `models/request.model.js` (`screwTracking`)
  - API/정규화: `controllers/requests/common.requests.controller.js`
  - packing 승인 자동 반영: `controllers/requests/common.review.controller.js`

- `Request.requestId`는 서버가 생성합니다.
- 의뢰자 신규의뢰 생성(`POST /api/requests/from-draft`) 성공 시
  제조사/관리자 실시간 동기화를 위해 `worksheet:count-update` 이벤트를 발행합니다.
  - payload 기본: `stage=request`, `delta=생성건수`, `action=created`, `source=requestor-new-request`
- overview 성 집계는 스냅샷 컬렉션을 SSOT로 사용합니다.
- 브리지 큐 조회 실패 시 DB 스냅샷 fallback을 허용합니다.
- 가공 이력의 영속 SSOT는 `MachiningRecord` 입니다.
- 팝빌/세금계산서 작업은 web이 직접 처리하지 않고 큐에 넣습니다.
- BG 콜백 의뢰 매칭 우선순위는 `requestMongoId` → `requestId` → 파일명 fallback 입니다.
- Rhino filled STL(`sourceStep=2-filled`)은 `caseInfos.stlFile`에 저장한다(SSOT).
  - 레거시 호환: 동일 메타를 `caseInfos.camFile`에도 미러 기록. 읽기는 `stlFile || camFile` (`utils/filledStlFile.js`).
  - Esprit NC는 `caseInfos.ncFile` (camFile ≠ NC).
  - Rhino filled STL 재생성 성공 시 기존 `caseInfos.ncFile`을 `$unset` 한다.
  - 가공 단계 NC는 새 filled STL 기준으로 CAM(NC) 재생성이 필요하다.
  - 웹소켓 `bg-file-processed` / `request:stage-changed` payload에 `regenerated`, `ncCleared`, `uploadedAt`를 포함한다.
  - 구현: `controllers/bg/bg.controller.js`
- 의뢰 단계 승인(`review-status`, stage=request)에서
  의뢰자 BusinessAnchor의 `requestSettings.defaultManufacturerHexRotation`(레거시 `hexRotationAngle` 포함)이 null이고
  `processBothHexVariants=true`이면,
  반대 헥스 모드의 내부 복사본(`source=manufacturer_sample`, `price.rule=manufacturer_sample`)을 생성해
  별도 lot/NC를 처리합니다.
  - 구현: `controllers/requests/common.review.controller.js`
- 가공 Next Up 진입 승인(`review-status`, stage=machining + `nextUpCamRunGuard=true`) 시
  `manufacturerStage`를 `가공`으로 즉시 전환하고 장비 배정/크레딧 차감을 수행합니다.
  - NC 메타(`caseInfos.ncFile.s3Key`)가 없으면 가공 단계 전환은 유지한 채
    `REQUEST_STAGE_APPROVED` 큐를 추가 등록해 BG1/Esprit NC 생성을 트리거합니다.
  - 프론트 준비 탭 승인(화살표/프리뷰)은 반드시 `stage=machining` + `nextUpCamRunGuard=true`를 보냅니다.
    review 키 `cam`으로 준비→가공 진입을 보내지 않습니다(레거시 수신만 호환).
  - 준비→가공 진입 시 `reviewByStage.request`를 APPROVED로 기록하고,
    `reviewByStage.machining`은 세척.패킹 진입 승인까지 PENDING을 유지합니다.
  - 구현: `controllers/requests/common.review.controller.js`, `services/reviewApprovalQueue.service.js`
- BG request-meta(`GET /api/bg/request-meta`)의 lotNumber 전달 SSOT:
  - 백엔드 `ensureLotNumberForMachining` 로직을 사용해 `lotNumber.value`를 생성/보정합니다.
  - 발급 시점 SSOT는 제조사 **준비 단계 진입**입니다(`ensureLotNumberOnReadyEnter`).
    디자인+생산(`design_custom_abutment`)은 핸드오프(생산 승격) 때 발급합니다.
    가공/CAM 경로는 누락 시 보정만 합니다.
  - 생성된 `lotNumber.value`를 기준으로 `caseInfos.lotNumber`/`serialCode`를 계산해 전달합니다.
  - fallback 필드(`material`, `part`) 추론으로 대체하지 않습니다.
  - 구현: `controllers/bg/bg.controller.js`, `controllers/requests/utils.js`
- 가공 승인(준비→가공) 시 장비 배정 SSOT:
  - 승인 트랜잭션에서 `chooseMachineForCamMachining(requireCeil=true)`를 사용해 `caseInfos.maxDiameter` 기준 호환 장비를 선택하고
    `productionSchedule.assignedMachine/queuePosition`에 즉시 반영합니다.
  - 성능 규칙: `review-status` 승인 경로에서 "호환성 검사"와 "실제 배정"은 동일 선택 결과를 재사용해 장비 선택 쿼리를 1회로 유지합니다(중복 호출 금지).
  - 가공 진입 후처리 큐(`CAM_STAGE_APPROVED`)는 Now Playing 즉시 시작을 하지 않으며, Next Up(대기열) 반영/로트 보정만 담당합니다.
  - `manufacturerStage` 저장값으로 `CAM`을 쓰지 않습니다. 레거시 `CAM` 문서는 가공으로 취급/이관합니다.

- NC 롤백(가공→준비) 성능 규칙:
  - `DELETE /api/requests/:id/nc-file` 경로는 트랜잭션 내부 단일 조회 결과를 재사용합니다.
  - pre-read + tx-read 이중 조회를 금지하고, 롤백 판단(credit rollback)/이벤트 payload/cleanup 메타를 1회 조회 스냅샷에서 파생합니다.
  - 파일 보존 정책: `rollbackOnly=1`에서는 `caseInfos.ncFile` 및 실제 NC 파일(S3/bridge)을 삭제하지 않고 공정만 롤백합니다.

- Stage-file 롤백 성능 규칙:
  - `DELETE /api/requests/:id/stage-file?stage=...&rollbackOnly=1` 경로는 최소 필드 select를 사용해 문서 로딩 비용을 줄입니다.
  - 롤백/삭제 완료 시 elapsed(ms) 로그(`STAGE_FILE_ROLLBACK completed`, `STAGE_FILE_DELETE completed`)를 남겨 회귀를 관찰합니다.
  - Now Playing 시작은 `allowAutoMachining` OFF→ON 전환(장비 설정 저장) 또는 가공 완료/실패 후 auto-next 트리거 시점에서만 수행합니다.

- 제조사 헥스 회전 모드(`manufacturerHexRotation`)는 백엔드에서 fallback 기본값으로 보정하지 않습니다.
  - 허용값: canonical `STL모델대로` / `헥스30도회전` / `헥스X도회전(total)`
- 제조사 아노다이징 override는 `caseInfos.anodizingEnabled` SSOT로 저장합니다.
  - endpoint: `PATCH /api/requests/:id/anodizing-override`
  - 변경 가능 단계: `준비`, `가공` (레거시 `CAM` 호환, 그 외 단계는 409)
  - 생성 시: 의뢰건 `caseInfos.anodizingEnabled` 우선, 미설정이면 사업체 `requestSettings.anodizingEnabled`(기본 true).
  - 의뢰자 계정 기본값: `User.requestSettings.anodizingEnabled` (API: `requestorAnodizingEnabled`). 신규의뢰 토글 시 저장되고 업로드 시드에 사용.
  - 제조사 워크시트 응답의 `item.business.requestSettings.anodizingEnabled`를 함께 제공해
    프론트가 **레거시** `caseInfos` 미설정 시 사업자 기본값으로 표시할 수 있어야 합니다.
  - 관련: `creation.from-draft.controller.js`, `creation.request.controller.js`, `business.controller.js` request-settings
  - 전달 SSOT: `헥스X도회전`의 X는 `totalDeg(=30+minorDeg)`
    - 예) canonical `헥스40도회전`
  - 하위호환 입력: 레거시 `0`/`30`, 기존 minor 저장값(`헥스10도회전`)은 `헥스40도회전`으로 정규화 허용
  - 미지원/빈값은 request-meta 응답 및 저장 로직에서 즉시 오류로 처리합니다.
- `manufacturerStage` request 단계 SSOT는 `준비` 단일값입니다. (`의뢰`, `request` 저장/비교 금지)
- 의뢰 취소 정책 SSOT: `PATCH /api/requests/:id/status`로 `manufacturerStage=취소` 시
  정규화 단계가 `request`(준비)인 경우만 허용. 불완전가공(`rnd.unmachinableAt`)은 예외로 취소 가능.
  - 레거시 문구/판정(`의뢰 또는 CAM 단계`) 사용 금지.
  - 중복 replace(`from-draft`/`creation.request`)의 `isCancelableStage`도 `stageOrder<=0`(준비)만 허용.
  - 취소 HTTP 응답은 준비 단계면 트랜잭션 없이 uniqueKeys 조회+`updateOne` 후 슬림 페이로드. 웹소켓 정규화·크레딧 emit은 백그라운드.
  - 일괄 취소: `PATCH /api/requests/status/batch` `{ ids, manufacturerStage: "취소" }`. 같은 출고박스 형제 재보류 생략 후 `updateMany`. 웹소켓·스냅샷은 응답 후.
  - 관련 파일: `controllers/requests/common.requests.controller.js`,
    `controllers/requests/creation.from-draft.controller.js`,
    `controllers/requests/creation.request.controller.js`
- 의뢰 제출(`POST /api/requests/from-draft`)의 `caseInfos.requestorHexRotation`은
  케이스별 `caseInfos.designSoftware`(+ExoCAD면 `exoCadVersion`)를 기준으로 계산합니다.
  - 케이스 디자인 소프트웨어가 비어 있으면 요청을 실패(400) 처리합니다.
  - `ExoCAD` + `exoCadVersion=le_3_0`(3.0 이하, 또는 버전 미지정 레거시) => `헥스30도회전`
  - `ExoCAD` + `exoCadVersion=ge_3_2`(3.2 이상) => `STL모델대로`
  - `3Shape` 및 기타(custom 포함) => `STL모델대로`
  - ExoCAD를 **처음** 설정하면 `requestSettings.hexVerificationSamplePending=true`(User 우선, BA 차선).
    첫 제조 의뢰 생성 시 반대 헥스 복사샘플(`source=manufacturer_sample`, `requestCategory=copied_sample`,
    `caseInfos.hexVerificationSample=true`, 라벨 **헥스 확인용 무료 샘플**)을 1건 추가하고 pending을 소진한다.
    - 3.2+: 원본=STL모델대로, 복사=헥스30도회전
    - 3.0 이하: 원본=헥스30도회전, 복사=STL모델대로
  - 라이노(2-filled)는 원본만 실행하고 샘플에 `stlFile`(legacy `camFile` 미러)을 복사. Esprit NC(`ncFile`)는 샘플의 반대 헥스로 별도 생성.
  - 의뢰자(기공소/치과) 취소·삭제 시 원본↔헥스 확인 샘플을 **함께** `취소` 처리한다
    (`findHexVerificationCancelSiblings` → `updateRequestStatus` / batch / `deleteRequest`).
  - 관리자 헥스 확인 완료: `requestSettings.hexVerificationCompletedAt/By` + `hexVerificationResultHex`
    (`STL모델대로`|`헥스30도회전`). 대시보드 카드·`GET/POST /api/admin/hex-verification/*`.
    - `GET .../in-progress`는 ExoCAD 전체(진행중+확정)를 반환한다. `pendingCount`/`confirmedCount`/`status`.
    - `POST .../complete`는 최초 확정뿐 아니라 확정값 수정도 허용한다.
    - `POST .../revert`는 확정값을 unset해 미확인(pending)으로 되돌린다.
  - 의뢰 단건(`GET /api/requests/:id` → `normalizeRequestForResponse`)의 `business.requestSettings`에도
    `hexVerificationResultHex`를 포함해 제조사 PreviewModal 확정/미정 뱃지에 쓴다.
  - ExoCAD 제조사 헥스 해석 SSOT(`resolveExoCadManufacturerHexRotation`):
    1) 첫의뢰 pending → designSoftware(+exoCadVersion) **시드만** 강제
       (3.2+ 시드=STL이어도 샘플 결과에 따라 헥스30도회전일 수 있음.
        제조사는 준비 단계에서 의뢰 단위로 변경 가능)
    2) 관리자 `hexVerificationResultHex`(User→BA) — **샘플 테스트 후 확정, 최종 SSOT**
       (확정 후 제조사 `updateRndHexRotation` 변경 불가)
    3) 제조사 `defaultManufacturerHexRotation`(User→BA)
    4) designSoftware(+exoCadVersion)
    - `POST .../complete`는 확정값과 함께 `defaultManufacturerHexRotation`도 동일 값으로 맞춘다.
  - 관련: `utils/designSoftwareHex.js`, `services/hexVerificationSample.service.js`,
    `controllers/admin/admin.hexVerification.controller.js`
- 워크시트 응답(`GET /api/requests/all?view=worksheet`)의 `item.business`에는
  `requestSettings.designSoftware`를 포함할 수 있으나, 제조사/의뢰자 UI의 실제 표시는 `caseInfos.designSoftware`를 SSOT로 사용합니다.
  - 관련 파일:
    - `controllers/requests/common.requests.controller.js`
    - `controllers/requests/common.review.controller.js`
    - `controllers/bg/bg.controller.js`
- `requestCategory="rnd_sample"`(R&D 보관 원본)은 BG 자동 업데이트 대상에서 제외합니다.
- practice 전송 상태 표준(치과/의뢰자 공통)은 `발송완료 | 취소 | 수신완료 | 의뢰수락 | 자동매칭 | 작업완료 | 생산진행`을 사용합니다.
  - 읽음 판정 SSOT: `PracticeTransfer.requestorReadAt`
    - 자동매칭 공개 풀(`openPool`)은 `POST .../mark-read`가 no-op(`requestorReadAt` 미설정).
      미클레임 건은 열람만으로 안읽음 배지가 줄지 않으며, 수락(claim) 시 읽음·배지 갱신.
  - 의뢰수락 판정 SSOT: `PracticeTransfer.requestorDownloadedAt`(레거시 필드명 유지; API alias `requestorAcceptedAt`/`isAccepted`)
  - 잔액 검사 SSOT: `POST /api/practice/transfers`에서 `assertPracticeTransferPaidCreditSufficient` + `holdPracticeTransferCredits`(유료+무료 합산, 함수명 하위호환)
  - 과금 SSOT: 수락=`adjustPracticeTransferHold`(금액 확정), 기공소 발송=`releasePracticeTransferLabShare`(+`lab_platform_fee`), 제조사 발송=`releasePracticeTransferAbutmentShare`. 파일 다운로드는 상태·과금에 영향 없음
  - **자동매칭 SSOT** (`matchingMode: "auto"`):
    - 생성 시 `targetLabAnchorId=null`, 공개 풀. `manufacturerStage` UI=`자동매칭`(공정 뱃지 집계는 **의뢰**). 자격(**인증 기공소**): `verified` + `practiceTransferAutoMatchEnabled`(참여 ON) + (requestor lab 수신 가능 **또는** `businessType=internalLab`) (`utils/practiceTransferAutoMatch.js`). 관리자 목록은 `verifiedLabCapableAnchorFilter`. **인증 파이프라인** `BusinessAnchor.abutsLabCertification`(`none|applied|testing|certified|rejected`, `testStatus`, `memo`) — 가입 시 미신청 → 기공소 신청 → 어벗츠 기공 테스트 → 통과 시 인증(ON). 유틸 `utils/abutsLabCertification.js`
    - **어벗츠 우선창**: 생성 시 적격 스냅샷에 `internalLab`이 있으면 `autoMatch.priorityLabAnchorIds` + `priorityUntil=createdAt+5분`. 그 동안 타 기공소 수신 목록·클레임 미노출. 만료 또는 **어벗츠 거부 시 `priorityUntil` 조기 종료** 후 타 기공소 노출·소켓. 적격에 어벗츠가 없으면 전원 즉시 공개(2B: 예산·참여 동일 게이트)
    - 기공소 `POST /api/businesses/me/auto-match-participation` `{ active:true }`: 미인증이면 **인증 신청**만(`applied`, 풀 ON 금지). 인증 완료 후 재호출 시 참여(ON). `{ active:false }`는 해지 예약. 관리자 `PATCH /api/devops/practice-transfer-auto-match/:anchorId` `{ enabled, testStatus, memo, status }` — 테스트 통과/`enabled:true` 시 인증 ON. **월정 0원**(`autoMatchMonthlyFee`). 매칭 성공 `platformFeeRate` · 지정은 `directPlatformFeeEnabled`(기본 off=무료) / on 시 `directPlatformFeeRate`. 표시명 마스킹(`redactAutoMatch*`).
    - 수신 목록: 내 지정 건 ∪ (eligible이면) 공개 풀(미배정, **우선창이면 priority lab만**). 타인 활성 claim은 숨김
    - 수락=`mark-accepted` 원자 FCFS claim(강제 시간 만료 없음; **우선창 클레임 게이트 동일**) + 보류액 확정. 치과에 `practice:transfer-updated`(action=`accepted`, 확정 `feeQuote`) emit. **CA 포함 시 수락 직후** 구강스캔(`files`) 기반 어벗츠 Request 조기 생성(`design_custom_abutment`, **주문 기공소 수취·출고목표=치과도착일−2영업일**). 작업완료=`POST .../mark-complete`(크라운 결과파일 필수, **shippingMode 불필요**, 에스크로 해제·기공크레딧 지급). 작업취소=`POST .../mark-release`(auto는 풀 재공개·우선창 종료·치과는 「자동매칭」, direct는 수락 해제+과금 롤백·치과 「취소」). 수락 전 거부=`POST .../mark-reject`(auto 공개풀=해당 기공소만 decline, direct=활성 유지·작업취소로 치과 「취소」·기공소 「거부」; canceled 휴지통 아님)
    - 어벗 디자인: 기공의뢰(PTX) CA는 **수락 기공소**가 design-claim/handoff. 업로드 시 lab confirm 자동·제조 즉시 착수 + `grantAbutmentDesignLabFee`(`abutmentDesignLabFee`×어벗수 → `LAB_SETTLEMENT_CREDIT`, 기공소 장부 라인 `refType=PRACTICE_TRANSFER` — 보철기공비와 **한 기공의뢰 행**). 레거시 `POST .../confirm-abutment-design`은 미컨펌 건 호환용. 어벗생산의뢰(비PTX)는 기존 디자인 파트너 큐.
    - 치과=`POST .../confirm-production` — (a) 크라운 완료 전·CA·미생략: 어벗 디자인 생산 게이트 (b) 크라운 완료 후: `작업완료→생산진행` (Request 재생성 없음)
    - 「디자인 컨펌 생략」체크 UI는 계정 `practiceTransferSettings.skipDesignConfirm`(기본 **true**). 전송 시 `PracticeTransfer.production.skipDesignConfirm` 스냅샷. 해제 시 FE 안내 모달. 체크된 건은 기공소 `mark-complete` 시 생산진행 자동. 미체크면 어벗 생산에 치과 디자인 컨펌도 필요
    - **레거시(2026-08-22 삭제)**: 「지그 제작 불필요」(`skipJig`) UI/계정 옵션 제거. `production.skipJig`·`practiceTransferSettings.skipJig`는 구 스냅샷 호환용. **기공소→치과·치과→기공소 배송비는 무료**(크레딧과 무관)
    - 작업 기한은 치과 도착일·채팅 소통. (레거시 3시간 `deadlineAt` 만료 재공개는 폐기)
    - 기공소 수신 카드(의뢰수락): `PracticeTransferFileDropTarget` + `[작업완료]`(크라운) / `[어벗 디자인 확인]` / `[작업취소]` (`RequestorPracticePage`). 배송선택 모달 없음
  - 가상 의뢰 행 매핑 기준: `controllers/practiceTransfers/practiceTransfer.controller.js#toVirtualRequestRows`
  - practice 전송 목록/취소/복구 권한 범위 SSOT: 동일 치과 `practiceBusinessAnchorId`(=`req.user.businessAnchorId`) 구성원 공유.
    구현: `buildPracticeOwnedScope` (`getMyPracticeTransfers` / `cancelPracticeTransfersBatch` / `restorePracticeTransfersBatch` / draft list·DELETE by id).
    동일 치과 practice 멤버의 `practiceUserId`도 포함해 앵커 미기입 레거시 문서를 함께 조회한다.
    앵커 없는 계정은 `practiceUserId` 본인 범위로 폴백한다.
    draft 작성 폼 GET(`GET /draft`)·기본 DELETE는 본인 `practiceUserId`만 대상으로 한다.
  - practice 파일전송 생성(`POST /api/practice/transfers`) 성공 시 관련 임시저장(`draftId` 또는 작성자 활성 draft)을 **완전 삭제**(휴지통 아님)하고 `draft-cleared`를 fan-out한다. 전송 건은 최근 전송 내역에만 남는다.
  - 기공의뢰 납기 영업일: 낮 12시 이전은 주문일(오늘) 포함, 이후는 제외. `resolvePracticeTransferArrivalPolicy` → `countWeekdayBusinessDays(..., now)`. 프론트 `getPracticeWorkPeriodDays`와 동일. 1+2 이상 허용(0+2 거부).
  - 수락 전(의뢰=`발송완료|수신완료|자동매칭`) 내용 수정: `POST /api/practice/transfers/:transferId/update-content`. transferId·채팅방 유지, 파일·치식·메모·기공소·보류액 갱신, `requestorReadAt` 초기화, `practice:transfer-updated` action=`content-updated`. 수락·취소·거부 이후 409. 기공소·치식·지그·할증이 같으면 크레딧 rollback+hold를 건너뛴다.
  - `draft-upserted` 이벤트는 `transferMemo`·`files` 스냅샷을 포함해 수신측이 추가 GET 없이 폼을 반영할 수 있다.
    임시저장은 `practice:transfer-updated` + `action: draft-upserted|draft-cleared`.
    구현: `emitPracticeTransferEventToPracticeUsers`.

- 관리자 사용자 role 변경/생성 API는 `practice`를 **신규로 허용하지 않는다**(제거).
  - 적용 파일: `controllers/admin/admin.users.controller.js`
  - `validRoles` 기준은 루트 규칙(사업자 타입 허용값)과 동기화합니다. (`internalLab`·`labTeam`·`salesTeam` 포함)
  - 기존 `practice` 계정은 `requestor`+`practice` 마이그레이션 대상입니다.
  - `internalLab`(어벗츠기공소): 어벗츠 기공소 직접 운영. 디자인 파트너·기공의뢰 수신·사업자/크레딧 API 허용. 공개 가입 없음.
  - 동일 법인 BN 공유: `BusinessAnchor` unique는 `{ businessNumberNormalized, businessType }`. 하위조직 `parentBusinessAnchorId`(예: admin「어벗츠 주식회사」← internalLab「기공사업부」). `ensureBusinessAnchor`도 type 스코프.

- 의뢰자 역할·서비스 · 가입/온보딩 SSOT (2026-08, 루트 §2.4 상세)
  - 가입 role SSOT: 공개 `/signup`은 `requestor` | `salesman`. `/signup/staff`는 `manufacturer` | `devops` | `admin` | `labTeam` | `salesTeam`. `practice` role **제거**(신규 생성 금지). `internalLab`은 관리자 생성만.
  - 필드 SSOT: `BusinessAnchor.requestorKind` (`practice|lab`) + `requestorServices` (paid-only). User 미러 동일.
  - 레거시 `requestorCapabilities`는 resolve/백필 폴백만. 신규 쓰기 금지.
  - `requestorServices.free` 폐기: 읽기 시 paid 승격, 쓰기는 `{free:false,paid:true}`.
  - 헬퍼: `utils/requestorCapabilities.js`, `requestorOrgAnchor.util.js`
    - `requiresBusinessLicense`(any service) / `canUsePaidServices`(paid+verified)
    - `canSendPracticeTransfer`(practice) / `canReceivePracticeTransfer`(lab)
    - `resolveRequestorProfile`: kind+services 우선, 없으면 레거시 caps 파생
  - 사업자 저장(`business.update.controller.js`): body `requestorKind`/`requestorServices`(또는 레거시 caps) → normalize·검증. paid면 미검증 저장 거부(검증 플로우 중 제외). 홈택스 검증 성공 시 `requestorServices={free:false,paid:true}`.
  - 기공의뢰서: `practiceTransferAuth.middleware.js` — 발신 practice, 수신 lab
  - 생산의뢰: `paidRequestor.middleware.js` — `POST /api/requests`, `/from-draft`, `/bulk`
  - 공개 가입: `POST /api/auth/register`. 발신 프로필: `practiceProfile` → `ensureRequestorOrgAnchor`.
  - 백필: `scripts/db/backfill-requestor-capabilities.js` (`--apply`)
  - 크레딧/정산: 유료(paid+verified)만. synthetic BN 환영 크레딧 없음.
    환영 무료 크레딧은 `requestorKind=lab`만(치과 practice 제외).

- 드롭존 가입(치과 전용, requestor+practice):
  - `POST /api/auth/practice/register`는 **practice role을 만들지 않는다**.
    `role=requestor` + `requestorKind=practice` + `requestorServices={free:false,paid:true}` + 휴대폰 인증·치과명·담당자명을 저장.
    완전한 주소/Org 앵커는 온보딩(`PUT /api/users/profile` → `ensureRequestorOrgAnchor`)에서 생성.
  - 필수: `email` + `password` + `phone` + `clinicName` + `staffName`. 로그인 식별은 이메일.
    `name`/`practiceProfile.staffName`=담당자명, `practiceProfile.clinicName`=치과명.
  - `assertSignupVerifications({ email, phone })` 강제 후 `consumeSignupVerifications` 소진.
    - 이메일: `POST /api/auth/signup/email-verification/send|verify`, `GET .../status` (일 10회)
    - 휴대폰: `POST /api/auth/signup/phone-verification/send|verify`, `GET .../status` (일 5회; 개발모드 자동완료 금지)
    - status API는 `verifiedAt` 있고 `consumedAt` 없을 때만 `verified: true`
  - 비밀번호 찾기/변경(`POST /api/auth/practice/password/find|change`) 대상은 `requestor`(practice).
  - 치과명 로그인(`POST /api/auth/practice/login`)은 마이그레이션 호환용: `practice` 또는 `requestor`+`clinic`(business/`practiceProfile.clinicName` 매칭). 장기적으로 제거 대상.
  - 같은 사업자 계정 전환(모든 role):
    - `GET /api/auth/colleagues` — 동일 `businessAnchorId` 활성·승인 계정(본인 제외)
    - `POST /api/auth/switch-account` `{ userId, password }` — JWT 재발급
    - 구현: `controllers/auth/auth.controller.js`, `modules/auth/auth.routes.js`
    - 롤 한글 SSOT: `utils/roleLabels.js` (User=딜러/관리자, BA=딜러사/어벗츠). 코드 키 salesman/admin 유지.
  - 기공의뢰서 저장 SSOT는 `PracticeTransfer`(`/api/practice/transfers/*`). Request 도메인 혼입 금지.
  - 레거시 혼입 경로(`/api/requests/practice/*`, 구 practice draft)는 제거 대상으로 유지합니다.

- practice 파일전송 임시저장(다른 PC 이어쓰기) SSOT:
  - 저장 모델: `models/practiceTransferDraft.model.js`
  - API:
    - `GET/POST/DELETE /api/practice/transfers/draft` → 작성 중인 draft
      - GET 기본: 본인 활성(`deletedAt: null`) draft 중 **최신 1건**
      - GET `?draftId=`: 동일 치과 범위의 활성 draft (불러온 같은 케이스)
      - POST 기본(`draftId` 없음): **새 draft 생성**(사용자당 다중 활성)
      - POST `draftId`: 불러온 draft에 join해 **같은 문서를 갱신**(소유자 유지). 없거나 휴지통이면 **새 draft 생성**(stale id 폴백)
      - DELETE: **소프트 삭제**(휴지통). `deletedAt` 설정. `draftId`면 해당 건
    - `POST /api/practice/transfers/draft/restore` `{ draftId }` → 휴지통에서 복구
      - 다른 활성 draft는 유지(다중 활성)
    - `POST /api/practice/transfers/trash/empty` → 휴지통 비우기(영구 삭제)
      - 동일 치과 범위의 소프트 삭제 draft(`deletedAt != null`)와 `status: "canceled"` 전송을 완전 삭제
      - 응답: `{ draftDeletedCount, transferDeletedCount, draftIds, transferMongoIds }`
      - 성공 시 `practice:transfer-updated` `action: trash-emptied`(치과) / `purged`(기공소) fan-out
    - `GET /api/practice/transfers/drafts` → 활성 목록
    - `POST /api/practice/transfers/drafts/clear-all` → 활성 임시저장 전체 소프트 삭제(휴지통)
      - 동일 치과 범위의 `deletedAt: null` draft를 모두 휴지통으로 이동
      - 응답: `{ draftClearedCount, draftIds }`
      - 성공 시 `practice:transfer-updated` `action: drafts-cleared` fan-out
    - `GET /api/practice/transfers/drafts?trashed=1` → 휴지통 목록
    - `GET /api/practice/transfers/drafts?trashed=all` → `{ drafts, trashed }` 1쿼리(페이지 로드용)
  - 활성 draft는 사용자당 **여러 건** 허용. `POST`에 `draftId`가 없으면 **항상 새 draft 생성**, 있으면 해당 건 갱신(join).
  - 기공의뢰 UI는 수동 「임시 저장」스냅샷을 제공하지 않는다. 작성본은 autosave로 같은 draft를 갱신한다.
  - 「새로 작성」은 화면만 비우고 서버 임시저장은 유지. 서버/휴지통 이동은 임시저장 카드 삭제로만 수행.
  - 복구 시 다른 활성 draft를 휴지통으로 보내지 않는다.
  - draft `files`는 `File` 컬렉션의 temp 업로드 파일 소유권(`uploadedBy`) 검증 후 저장합니다.
    동일 치과 practice 구성원이 업로드한 파일도 이어쓰기 저장을 허용합니다.
  - POST/DELETE/restore 성공 시 동일 치과 practice 구성원에게 `practice:transfer-updated`(draft-upserted|draft-cleared)를 fan-out한다.
    payload의 `draftId`가 활성 케이스와 같으면 작성 폼에 반영하고, 다르면 목록만 갱신한다.
  - practice 전송 생성 성공 시 서버가 draft를 완전 삭제하고 `draft-cleared`/`transfer-created`를 fan-out한다.
    프론트는 작성자 전송 성공·동료 이벤트 수신 시 의뢰 폼 localStorage를 함께 초기화한다.
  - 관련 파일:
    - `modules/practiceTransfers/practiceTransfer.routes.js`
    - `controllers/practiceTransfers/practiceTransfer.controller.js`
    - `models/file.model.js`

- practice 전송 설정 SSOT:
  - 저장 위치: `BusinessAnchor.practiceTransferSettings`
  - API: `GET/POST /api/practice/transfers/settings`
  - 필드: `arrivalDefaultDays`(계정 전역 fallback), `labArrivalDefaults[{ labAnchorId, labName, arrivalDefaultDays, updatedAt }]`(기공소별 주문→치과도착 달력 일수), `prosthesisTypes`, `memoSnippets`, `promoNoticeDismissedAt`, `skipDesignConfirm`, `skipJig`(레거시·미사용), `defaultAbutmentProductMode`, `implantFavorites`(환봉 요청 시 `roundBar`/`adopted`/`roundBarRequestId`)
  - `labArrivalDefaults`: 기공의뢰에서 기공소 선택 시 해당 일수로 주문-치과도착 적용. 날짜 변경 시 선택 기공소에 upsert(`labArrivalDefault` 단건 또는 `labArrivalDefaults` 전체). 미등록 기공소는 `arrivalDefaultDays`.
  - UI: 설정 `/dashboard/practice-settings?tab=transfer`, 기공의뢰 작성 화면에서 자동 저장.
  - `memoSnippets`는 의뢰 메모 문장 즐겨찾기(최대 40개, 공백/중복 제거)이며 프론트는 로컬스토리지에도 미러링합니다.
  - `defaultAbutmentProductMode`: 커스텀어벗 설정 모달 계정 기본값. 미설정·신규는 `design_custom_abutment`(디자인+생산). 모달에서 바꾸면 저장하고 다음 모달 초기값으로 씀. 치아별 스냅샷은 `toothWorks.abutmentProductMode`(레거시 미설정=생산만).
  - 관련 파일:
    - `controllers/practiceTransfers/practiceTransferSettings.controller.js`
    - `models/businessAnchor.model.js`
    - `web/frontend/src/pages/practice/PracticeFileTransferPage.tsx`
    - `web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx`
    - `web/frontend/src/shared/practice/labArrivalDefaults.ts`
    - `web/frontend/src/pages/practice/PracticeSettingsPage.tsx`
    - `web/frontend/src/pages/practice/components/PracticeTransferArrivalSettingsTab.tsx`

- 환봉방식 커스텀어벗(제조사 추가 요청) SSOT:
  - 치과 프리셋 편집에서 카탈로그에 없는 제조사를 요청. 타입은 `헥스(사이즈 미정)` 고정.
  - 생성: `POST /api/practice/transfers/round-bar-requests` — 문의(`manufacturer_add_request`) 자동 접수 + `RoundBarAbutmentRequest` + 치과 `implantFavorites`에 일단 저장(`roundBar=true`, `adopted=false`).
  - 관리자: `GET|PATCH /api/admin/round-bar-requests` — 프리셋 내용 편집. 도입 전에 `adoptedKind=cnc|round_bar` 필수. 도입 체크 시 해당 치과 프리셋 `adopted=true` + 종류 저장. 치과 단가: CNC=CNC어벗, 환봉=환봉어벗. 체크 해제=`adopted=false` + 문의 재오픈. 실시간 `practice:round-bar-request-updated`. UI는 플랫폼 설정「커스텀어벗 > 어벗 추가 요청」.
  - 요금 필드: 청구 고시=`membershipRoundBarProductionPrice` / `membershipRoundBarDesignAndProductionPrice` (0이면 별도 고지). `regularRoundBar*`는 딜러분배 레거시 키(청구 분기 없음).
  - 기공의뢰 견적 툴팁: **보철기공비** / **어벗 디자인+생산비**(둘 다 기공비. 기공소몫·어벗츠몫 헤더 없음). **기공소→치과·치과→기공소 배송 무료**(기공수가「배송비」폐지·`lab_shipping` hold 없음). **기공소→어벗츠 배송**: CA 미러 Request가 `(기공소 BA + 예정 출고일)` 박스당 1회 `SHIPPING_SPEND_HOLD`(수락 시 `holdRequestCreditsOnSubmit`). **포장.발송 진입** 시 `enterManufacturerShippingStage()`가 보류→매출. 단가=`creditSettings.shippingFee`. 레거시 PTX 건당 `abuts_shipping`/`lab_shipping` hold는 `chargePracticeTransferLabShipping`/`releasePracticeTransferObsoleteShippingHolds`로 해제(치과 크레딧 복원, 매출 전환 없음). **환봉 요청중(미도입, `헥스(사이즈 미정)`)** 은 보철기공비 — 어벗츠 단가 제외, 기공소 `커스텀어벗` 항목 수가가 있으면 그 금액. 도입되면 어벗 디자인+생산비.
  - 관련 파일:
    - `models/roundBarAbutmentRequest.model.js`
    - `utils/roundBarAbutment.js`
    - `controllers/practiceTransfers/roundBarAbutmentRequest.controller.js`
    - `controllers/admin/admin.roundBarAbutment.controller.js`

- practice 취소 API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/cancel-batch`
  - request body: `transferIds?: string[]`, `transferMongoIds?: string[]` (둘 중 하나 이상 필수)
  - response: `{ success: true, data: { successCount: number, failedIds: string[] } }`
  - `failedIds`에는 무효 식별자/미존재/권한범위 밖/이미 취소된 대상이 포함될 수 있습니다.

- practice 복구(되살리기) API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/restore-batch`
  - request body: `transferIds?: string[]`, `transferMongoIds?: string[]` (둘 중 하나 이상 필수)
  - response: `{ success: true, data: { successCount: number, failedIds: string[] } }`
  - 대상은 `status: "canceled"` 문서만 복구하며, 성공 시 `status: "active"`로 되돌리고 `canceledAt`/`canceledBy`를 초기화합니다.
  - `failedIds`에는 무효 식별자/미존재/권한범위 밖/취소 상태가 아닌 대상이 포함될 수 있습니다.

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
  - 채팅 권한 SSOT: 전송 작성자·대상 기공소뿐 아니라 **동일 치과(`practiceBusinessAnchorId`) 구성원**(레거시 `role=practice` 및 `role=requestor`+practice)도
    transfer-room 조회와 메시지 조회/발송에 참여할 수 있습니다. 작성자·수락 담당자는 기존 방 `participants`에 없어도 합류합니다. 동료가 처음 열면 해당 채팅방 `participants`에 추가합니다.
- practice 채팅/전송 첨부 다운로드 정책:
  - 다운로드 SSOT 엔드포인트: `GET /api/files/s3/download?key=...&fileName=...`
  - S3 파일은 signed-url 리다이렉트가 아니라 서버 프록시 스트리밍(`pipe`)으로 응답합니다.
  - gzip으로 저장된 객체(`ContentEncoding=gzip`)는 프록시/버퍼 조회 시 자동 해제해 원본 바이트로 내려줍니다.
  - temp 업로드:
    - `POST /api/files/temp/presign` (단건 PUT, optional `contentEncoding`)
    - `POST /api/files/temp/multipart/init|complete|abort` (8MB+ 대용량)
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
  - 우편함 배정·포장.발송 진입도 일반 의뢰와 동일 SSOT(`assignMailboxForCleaningPackingEnter`, `enterManufacturerShippingStage`)를 따릅니다.
  - 우편함 **점유 집계**에도 작업용 샘플을 포함한다(`loadActiveMailboxOccupancy` — order만 보면 샘플 점유 칸이 비어 합류/충돌이 깨짐).
  - `stageProgressionWorker` 세척.패킹→포장.발송 자동 진행에서도 샘플을 제외하지 않는다.
  - 포장.발송 우편함 상세에서 **샘플만 완전 삭제** 가능(`DELETE /api/requests/:id`).
  - R&D 보관 샘플(`rnd.doneAt!=null`)은 R&D 탭 운영 정책으로 분리합니다.
  - 샘플은 크레딧/정산 장부에 무기록(무자료/무상) 처리합니다.
  - 관련 구현: `controllers/ai/lotCapture.controller.js`, `controllers/requests/common.review.controller.js`, `controllers/requests/common.requests.controller.js`, `shipping/components/MailboxContentsModal.tsx`
- 단일 SSOT 장부(General Ledger) 정책:
  - 장부는 논리적으로 1개만 사용하며, 물리 구조는 `LedgerJournal`(헤더) + `LedgerLine`(라인) 2컬렉션으로 구성합니다.
  - 제조사 정산 조회(`/api/manufacturer/credits/ledger`, `/api/manufacturer/credits/daily-summary`, `/api/manufacturer/credits/daily-snapshots/recalc`)는 `LedgerLine` 집계를 SSOT로 사용합니다.
  - 제조사 원장 **표시**는 의뢰 1건=어벗 1개라 기공의뢰처럼 못 묶고, KST 하루 단위로 생산·배송을 묶는다. 클릭 상세 데이터는 우편함(수취자)별이며, 프론트는 의뢰/배송을 별 섹션으로 나눈다. **ADJUST는 KST 하루 1행**으로 묶고 의뢰별로 합산한다. 구현: `utils/manufacturerLedgerDisplay.js`.
  - 일별/스냅샷 정산 **건수**는 라인·저널 수가 아니라 `(eventType, creditKind, refId)` 유니크다.
    - 동일 의뢰의 `machining_spend` + `express_surcharge`는 금액 합산, 건수 1.
    - paid/free 분해로 `REV_MANUFACTURER` 라인이 복수여도 같은 creditKind·refId는 1건.
    - 구현: `buildManufacturerEarnCollapseAndGroupStages` (`controllers/manufacturers/manufacturer.controller.js`)
  - 레거시 분리 원장(`CreditLedger`, `ManufacturerCreditLedger`, `SalesmanLedger`, `AdminCreditLedger`)은
    이관 완료 후 반드시 삭제합니다. 이관 기간에도 이중기록(dual-write) 금지.

- LedgerJournal 스키마 초안(필수 필드):
  - `journalId`(UUID, unique)
  - `eventType`(저장형):
    - `REQUEST_SPEND_HOLD`, `REQUEST_SPEND_COMMIT`
    - `SHIPPING_SPEND_HOLD`, `SHIPPING_SPEND_COMMIT`
    - `PRACTICE_TRANSFER_SPEND_COMMIT`
    - `PRACTICE_TRANSFER_SPEND_HOLD`
    - `PRACTICE_TRANSFER_HOLD_ADJUST`
    - `PRACTICE_TRANSFER_ESCROW_RELEASE`
    - `CHARGE_PAID`, `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`, `LAB_SETTLEMENT_CHARGE`, `ADJUST`, `SETTLEMENT_PAYOUT`
  - `businessAnchorId`(의뢰자 기준 키)
  - `refType`, `refId` (`REQUEST`, `SHIPPING_PACKAGE`, `CHARGE_ORDER` 등)
  - `stageFrom`, `stageTo` (워크시트 승인/롤백 전이 기록)
  - `idempotencyKey`(unique)
  - `occurredAt`, `createdAt`, `createdBy`
  - `status` (`POSTED`만 허용; 롤백은 삭제 정책이므로 별도 VOID 상태 운용 금지)

- LedgerLine 스키마 초안(필수 필드):
  - `journalId`(FK), `lineNo`
  - `accountCode`:
    - 크레딧 버킷: `REQ_PAID_CREDIT`, `REQ_FREE_REQUEST_CREDIT`, `REQ_FREE_SHIPPING_CREDIT`, `LAB_SETTLEMENT_CREDIT`, `PLATFORM_ESCROW`
    - 수익 귀속: `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - `ownerRole` (`requestor|manufacturer|devops|salesman|admin`)
  - `ownerId` (원칙적으로 BusinessAnchor 식별자)
  - `amount`, `amountExcludingVat`, `vatAmount`, `amountIncludingVat`
  - `creditKind` (`PAID|FREE_REQUEST|FREE_SHIPPING|SETTLEMENT|null`)
  - `meta` (requestId, shippingPackageId, settlementBatchId, practiceTransferId, labFee, abutmentRetail 등)

- 승인/롤백 이벤트 정책(강제):
  - `REQUEST_SPEND_HOLD` / `SHIPPING_SPEND_HOLD`: **의뢰 제출** 시 `PLATFORM_ESCROW` 보류. 치과 어벗디자인·기공소 어벗생산·PTX CA 배송비는 의뢰 사업자+예정 출고일 1회(치과명 무관). PTX 건당 abuts hold 폐지.
    같은 제출에서 원장 잔액 집계·CreditBalanceGuard 락은 앵커당 1회 재사용(`holdRequestCreditsOnSubmit`).
    신규 제출 보류 저널은 선행 idempotency 조회 없이 `postGeneralLedgerJournals` insertMany(저널·라인 병렬).
    같은 출고일 배송비 보류 형제 저널은 `getJournalsByIdempotencyKeys`로 그룹당 1회 조회.
    기존 형제 보류 없이 이번 제출에서 배송비 hold만 새로 올린 그룹은 reconcile 재조회 skip.
    `from-draft`는 가격기준일·devops·공휴일·생산스케줄을 트랜잭션 밖에서 prefetch/memo하고,
    리메이크 가격 조회는 중복 조회 결과를 재사용하며, requestId는 로컬 생성, 세션 시작은 스케줄과 병렬,
    로트번호는 `$inc` 1회로 발급한다.
    잔액은 생성 전 사전검사(402), credit hold·헥스 샘플·대시보드 refresh는 201 `finish` 이후.
    hold 실패 시 방금 생성 의뢰는 `취소`(보류 전이므로 환불 없음).
    성공 body는 `{ count, requestIds, requestMongoIds }` lean.
    cards/bulk-shipping GET은 in-flight refresh를 기다리지 않고 스냅샷 upsert(stale-while-revalidate).
  - `REQUEST_SPEND_COMMIT`: **가공 진입 승인(준비→가공)** 시 보류→매출(레거시 무보류만 실차감)
  - `SHIPPING_SPEND_COMMIT`: **포장.발송 진입(세척.패킹 승인)** 시 배송 보류→매출. 집하는 패키지 연결만 보강(`ensureShippingFeeSpendOnMailboxPickup`).
  - **포장.발송 진입 SSOT**: `enterManufacturerShippingStage()` (`controllers/requests/common.review.helpers.js`) — 우편함 유지·수취인 스냅샷·배송비 commit·단계 매핑. 세척.패킹 승인·lot-capture·stageProgressionWorker 등 **모든** 진입 경로는 이 함수만 호출. 새 경로 추가 시에도 동일(백필·단위 테스트 제외).
  - 우편함 합류: 합류 의뢰의 중복 `SHIPPING_SPEND_HOLD` 해제. 칸당 보류 1개 불변.
  - 준비 단계 **취소**: 미전환 HOLD 전부 물리 삭제(잔액 복원)
  - `REQUEST` 차감 삭제: **가공→준비 롤백** 시 대응 커밋 이벤트/라인 **물리 삭제**
    - 롤백 엔드포인트(`DELETE /api/requests/:id/nc-file`, `DELETE /api/requests/:id/stage-file?stage=machining`)도 동일 정책으로 `ensureRequestCreditRollbackDeleteOnRollbackToCam`를 반드시 호출해야 합니다.
    - 삭제 대상 커밋 탐색은 idempotencyKey 매칭을 우선하고, 누락 시 `refType/refId`, `journal.meta.requestMongoId|requestId`, `LedgerLine 역탐색`까지 사용해 원본 COMMIT 저널을 식별/삭제합니다.
    - LedgerLine 역탐색은 `REQUEST_SPEND_COMMIT`만 대상으로 합니다. `REQUEST_SPEND_HOLD`/`SHIPPING_SPEND_HOLD`는 준비 단계 취소에서 별도 해제합니다.
    - 샘플(`rnd_sample|copied_sample`)은 `no_spend`를 정상으로 허용합니다.
    - 일반 의뢰는 기본적으로 `no_spend`를 409로 중단하되, **COMMIT** 소비 라인(`REQ_PAID_CREDIT|REQ_FREE_REQUEST_CREDIT`, refType=REQUEST, refId=request._id, amount<0, journal.eventType=`REQUEST_SPEND_COMMIT`)이 이미 없으면 idempotent success로 허용합니다.
  - `SHIPPING` 차감 삭제: **포장.발송 롤백(세척.패킹 복귀)** 시, 집하 전에 차감된 레거시 패키지가 있으면 대응 커밋을 물리 삭제. 집하 전 정상 건은 `shippingPackageId`가 없어 no-op.
  - 롤백에서 REFUND 이벤트/라인 추가 금지
  - 조회 호환성: `type=REFUND` 레거시 조회 파라미터 지원은 제거했습니다.
    조회/표시 타입은 SSOT 목록(`CHARGE_*`, `SPEND_*`, `ADJUST`)만 허용합니다.
  - BG 콜백(예: CNC 처리 완료/실패 콜백)은 파일 상태 동기화 전용이며 승인/롤백 트랜지션이 아니므로,
    크레딧/정산 이벤트를 적재하지 않음
  - 불완전가공(RnD unmachinable) 판정은 크레딧 롤백 사유가 아님
    - 이미 가공 진입 승인으로 발생한 `REQUEST_SPEND_COMMIT`은 유지
    - 불완전가공으로 준비 복귀가 일어나도 장부 삭제/환불 금지
    - 준비 단계 취소만 차감 미발생 상태
  - 조회/표시 타입은 `CHARGE`/`SPEND` 단일값 금지
    - 충전: `CHARGE_PAID` / `CHARGE_FREE_REQUEST` / `CHARGE_FREE_SHIPPING`
    - 소비: `SPEND_PAID` / `SPEND_FREE_REQUEST` / `SPEND_FREE_SHIPPING`
  - `GET /api/credits/balance`는 `LedgerLine` 직접 집계(GL SSOT)만 사용합니다.
    - 프로세스 메모리 캐시를 사용하지 않아 승인/롤백 직후 잔액을 즉시 반영해야 합니다.
  - 가입 환영 무료 크레딧(강제, 1회):
    - 대상: 의뢰자·기공소(`requestorKind=lab`)만. 의뢰자·치과(`practice`) 제외
    - 금액 SSOT: `creditSettings.defaultRequestFreeCredit`(기본 30,000). 무료크레딧 단일 버킷으로 지급
    - 호출 허용: `business.update.controller.js`에서 **BusinessAnchor를 새로 생성한 분기**
      및 synthetic→실BN 검증 승격 분기 (`grantWelcomeFreeCreditIfEligible`)
    - 금지: 기존 사업자 정보 업데이트 분기, 기존 앵커 연결(attach), 로그인/설정 저장 등 기타 경로
    - 멱등: `FreeCreditGrant`(물리 컬렉션 `bonusgrants`)를 사업자등록번호당 1건으로 유지.
      legacy type(`WELCOME_BONUS`, `SHIPPING_FREE_CREDIT`, `FREE_SHIPPING_CREDIT`)도 기지급으로 간주
    - GL 기록: `CHARGE_FREE_REQUEST`만, meta.source=`business_auto_free_credit`
    - 레거시 `defaultShippingFreeCredit`는 0 고정(자동 환영 배송 분리 지급 폐기)
    - 관련 파일: `controllers/businesses/business.freeCredit.util.js`,
      `models/freeCreditGrant.model.js`
### 웹소켓 업데이트 표준 (무플리커 + 부하완화)

  - 웹소켓 실시간 업데이트 발행/수신 SSOT:
    - 송신측은 대상 role 전체에 fan-out emit 합니다.
    - 수신측은 로그인된 role에서 이벤트를 수신하되, 현재 열려 있는 페이지(활성 화면)에서만 즉시 반영합니다.
    - 비활성 페이지 데이터는 페이지 진입 시 재조회(또는 캐시 무효화)로 동기화합니다.
  - 이벤트 발행 payload 설계 공통 원칙(강제):
    - 이벤트는 수신측 부분 갱신이 가능하도록 식별자 중심 payload를 포함합니다.
      (예: `businessAnchorId`, `requestId`, `requestMongoId`, `transferId`, `roomId`)
    - 수신측이 전체 재조회 없이 대상 엔티티 1건을 갱신할 수 있는 API/키를 함께 보장합니다.
    - fan-out emit 자체는 유지하되, 수신 화면이 payload 조건으로 이벤트를 좁혀 처리할 수 있어야 합니다.
  - 대시보드 성능 표준 패턴(강제) — `HEAVY/LIGHT SUMMARY SPLIT`:
    - 무거운 대시보드는 `heavy summary`와 `cards summary` 경량 API를 분리합니다.
    - 이벤트 직후 화면 반응용 데이터는 경량 API에서 빠르게 반환되도록 스냅샷/최소 집계를 우선 사용합니다.
    - 이벤트 payload에는 최소한 `fromStage`, `toStage`, `requestId|requestMongoId`, `businessAnchorId`(해당 도메인)를 포함해 프론트 즉시 patch를 지원합니다.
    - refetch를 전제로 한 broad emit은 허용하되, 수신측이 이벤트 1회당 전체 대시보드 재계산을 강제당하지 않도록 API를 설계합니다.
    - 프론트 처리 순서를 지원하도록 payload는 `즉시 patch 가능한 최소 필드`를 우선 포함합니다.
  - 폴링성 요약 API 성능(강제):
    - `GET /api/requests/dashboard-risk-summary`: period `dateFilter` + 출고 전 stage(`준비/CAM/가공`)로 쿼리를 좁히고,
      `services/dashboardRiskSummary.service.js`에서 우선순위 계산을 병렬 처리한다. 전체 populate 금지.
    - `GET /api/requests/assigned/dashboard-summary`: `requestDashboardCache` 짧은 TTL + in-flight coalesce.
      집계는 `getAssignedLikeDashboardSummary`에서 병렬 aggregate.
    - `GET /api/requests/shipping/mailbox-requests`: case-insensitive regex/`populate` 금지.
      uppercase exact `mailboxAddress` + lean + User/BusinessAnchor/DeliveryInfo 배치 hydrate,
      packing/tracking 분리 조회, 선택적 `requestIds` 단축 경로, 15s 메모리 캐시.
      구현: `controllers/requests/shipping.controller.js` (`getShippingMailboxRequests`).
    - `GET /api/practice/transfers/received-unread-count`: 짧은 TTL 캐시 +
      인덱스 `PracticeTransfer(targetLabAnchorId, status, requestorReadAt)`.
      BusinessAnchor 선행 조회 금지(캐시 히트 경로 경량). 프론트는 소켓
      `practice:transfer-created|updated`의 `unreadCount`로 배지 갱신하고,
      로그인(토큰)당 초기 시드 1회만 이 API를 호출한다(가시성/폴링 금지).
    - 인증 `authenticate`: User 조회 30s TTL 캐시(폴링 공통 병목 완화). 계정 비활성 시 즉시 invalidate.
    - `GET /api/admin/dashboard`: 20s TTL 캐시, File 전수 집계/recent populate 제거, 해피콜 집계와 크레딧 점검을 병렬화,
      unmachinable items는 DB에서 limit 10. 구현: `controllers/admin/admin.dashboard.controller.js`.
      해피콜 온보딩 사유는 하한+상한 구간을 적용한다
      (`new_signup_no_first_request_14d`: 가입 14~30일, `no_completion_30d_from_join`: 가입 30~60일).
      판정 SSOT: `controllers/admin/happyCallReasons.js`.
    - Jest DB 안전(강제): `tests/setup.js`는 **로컬 Mongo만** 연결/wipe 한다.
      `MONGODB_URI_TEST`가 Atlas(`mongodb+srv` / `mongodb.net`)이면 연결 전에 실패하고 `deleteMany`를 실행하지 않는다.
      가드 SSOT: `tests/mongoSafety.js`. 공유 `abuts_fit_test`에 export 후 jest 실행 금지.
    - requests 유실 원인(2026-08-07): Jest `tests/setup.js`의 `afterEach/afterAll clearCollections()`가
      `mongoose.connection.collections`에 등록된 모델에 `deleteMany({})`를 수행함.
      `export MONGODB_URI_TEST=<Atlas abuts_fit_test>` 후
      `distribution.coverRank.test.js`(→ `distribution.utils.js`가 `Request` import) 실행으로
      **requests만** 전량 삭제됨(ledger/machining/delivery/shippingpackages 등은 잔존).
      재발 방지: `tests/mongoSafety.js` 로컬 URI 가드.
    - requests 응급 복구(스냅샷): `scripts/db/restore-requests-from-snapshots.js`
      (`ENV_FILE=local.env ABUTS_DB_FORCE=true`, dry-run 기본 / `--yes` 적용).
      `requestordashboardsummarysnapshots.recentRequests` + anchor→requestor 매핑.
      완전 복구는 Atlas PITR이 우선.
    - 스냅샷 복구 후 상태 교정: `scripts/db/heal-requests-from-satellites.js`
      (잔존 machiningrecords/deliveryinfos/shippingpackages로 stage·링크 필드 보정).
    - requests 정기 백업(강제 권장): `jobs/hourlyRequestBackupWorker.js`
      + `services/requestBackup.service.js`.
      1시간 증분: watermark(`maxId`/`maxUpdatedAt`) 이후 신규·수정 문서만 저장.
      주 1회 전체: 마지막 full 기준 7일 경과 시 자동 full (`REQUEST_BACKUP_WEEKLY_FULL_MS`).
      증분이고 requests stage 분포 + 핵심 컬렉션(count/max _id) 지문이 동일하면 생략.
      백업 대상: requests/businessanchors/users/ledger*/machiningrecords/deliveryinfos/
      shippingpackages/draftrequests/files/happyCall/systemsettings/connections 등
      (`CRITICAL_BACKUP_COLLECTIONS`, `REQUEST_BACKUP_COLLECTIONS`로 덮어쓰기 가능).
      파일은 삭제하지 않음(S3 `db-backups/critical/{full|incremental}/...`
      또는 로컬 `backups/critical-hourly/{full|incremental}/`).
      복구: 최신 full 적용 후 이후 incremental을 `_id` upsert 순으로 적용.
      수동: `npm run db:backup-requests-once` / `--full` / `--incremental`.
      비활성: `REQUEST_BACKUP_DISABLED=true`.
    - Atlas PITR(완전 원복): Atlas UI → Database → cluster → Backup →
      Point in Time Restore → Date&Time(wipe 직전 KST) →
      Restore database(s)/collection(s) → `abuts_fit_test.requests`
      (Create as new 권장 후 검증, 필요 시 Overwrite). Continuous Cloud Backup 켜져 있어야 함.
    - `GET /api/requests?view=monitoring`: find+stage aggregate 병렬, page>1은 includeTotal 없이 목록만,
      projection은 카드 UI 필드만. 인덱스 `Request(createdAt, _id)`.
      샘플 제외 + 제조사 준비 큐(productModeNe)와 동일 — PTX 디자인 미완료·레거시 `design_custom_abutment` 제외.
    - `GET /api/admin/comm-badges` 의뢰(request) 배지도 동일 준비 큐 범위(PTX 디자인 대기 제외).
    - 어드민/제조사 대시보드 `inProgress*`(`requestDashboardStats`)도 준비 stage에서 동일 준비 큐 필터.
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

- 부가세(VAT) / 면세 정책(강제, 루트 `rules.md` §2.3) — 겸영(과세+면세) 이중 체계:
  - **겸영**: 어벗츠는 면세 매출(기공·커스텀어벗·크레딧)과 과세 매출(스토어 기성품·제조사/딜러/개발운영 지급)을 분리한다.
  - **면세**: 치과–기공소–어벗츠. 크레딧 충전·소비·기공정산·커스텀어벗(고객 청구). `vatAmount = 0`. 증빙은 계산서.
  - **과세**:
    - 스토어 기성품: 부가세 10% · 고객 표시=부가세 포함가 · 세금계산서. 커스텀어벗 계산서와 합치지 않음.
    - 어벗츠↔제조사·딜러사·개발운영사 지급: 부가세 10% · 세금계산서. 장부는 공급가, 지급 시 VAT. 제조사=일반과세(기공소 전환 없음).
  - **마이너스 발행**: 전송 성공 후 상계는 원본 `SENT` 유지 + `kind=REVERSE` 별도 draft. 원본을 `CANCELLED`로 강등하지 않음.
  - 장부: `STORE_SALE` / `REV_STORE_TAXABLE` — 스토어 결제 확정 시 기록. **전액 어벗츠(admin). 딜러/제조 분배 없음.** 면세 기공과 분리.
  - 스토어 결제: 크레딧(유료) 또는 B-plan 입금 → 재고 차감 → `STORE_SALE` → `fulfillmentStatus=READY`. **건별 과세 draft 없음**(월말 합산). 출고 `SHIPPED`·배송완료 `DELIVERED`. 구현: `storeSale.service.js`, `modules/store/store.routes.js`.
  - 장바구니 합치기 금지: 한 체크아웃에 기공+스토어 금지. 같은 선수금 잔액으로 각각 결제는 허용.
  - 팝빌: `POPBILL_IS_TEST=false`(prod)면 실홈택스 발행. local/test는 `true`.
  - 크레딧은 선불전자지급수단이 아니라 **B2B 거래 선수금/예치금**(계약 물품·용역만). 충전 화면·FAQ·약관·입금 확인에 동일 용어.
    프론트 카피: `web/frontend/src/shared/legal/creditPrepaidCopy.ts`
    입금 매칭 알림: `utils/creditBPlanMatching.js` `notifyChargePrepaidApplied` / 템플릿 `ats_credit_charged`
  - 충전 주문(`ChargeOrder`): `vatAmount = 0`, `amountTotal = supplyAmount`. **충전 확정 시 TaxInvoiceDraft 생성·발행 금지.**
  - 월말 고객 증빙: `services/customerMonthlyInvoice.service.js` — 전월 사용분 `ABUTS_TO_CUSTOMER` 면세/과세 각각 합산. 크론 `jobs/monthlyCustomerInvoiceWorker.js`.
  - 충전 단위: `utils/creditChargeUnit.js` — 기공소 50만원, 치과(practice) 100만원. 절대 상한 5,000만원.
    주문 검증 `creditBPlan.controller.js`, insights(월사용량/3·한 달분) `credit.controller.js`.
    UI 2회차 기본 배수 3은 프론트(`CreditPaymentTab`). 잔액 < 50만원 시 사이드바 충전 뱃지는 `DashboardLayout`.
    구현: `controllers/credits/creditBPlan.controller.js`
  - `REV_*`(제조사 포함): `amount = amountExcludingVat = base`, `vatAmount = 0`.
    구현: `controllers/requests/common.review.helpers.js`, `services/creditRevenuePolicy.service.js`
  - 의뢰자 잔액·보존식 집계는 `amountExcludingVat`(없으면 `amount`) = 공급가. 딜러사·개발운영사 지급 VAT는 어벗츠 추가 지급.
  - 고객향 계산서 직접발행 세액 기본 0(면세). 정산 배치 Draft: 기공소=면세, 제조사·딜러사·개발운영사=과세 10%.

- (세금)계산서 발행 방향/위수탁 정책(강제, `TaxInvoiceDraft.direction`):
  - `ABUTS_TO_CUSTOMER`: 사용분 월합(기공·어벗=면세, 스토어=과세). `issuanceMode="SELF"`. 충전(ChargeOrder) 시점 발행 금지. 과거 충전 건별 draft는 유지.
  - `LAB_TO_PRACTICE`(①치과→기공소 기공의뢰비의 반대방향, 월합계): `taxType="면세"`, `issuanceMode="TRUSTEE"`. 실제 공급자는 기공소이지만 기공소는 팝빌 회원가입/인증서가 불필요하고, 어벗츠가 수탁자로 위수탁발행한다(치과·기공소·어벗츠 3자 모두 부가세 면세 원칙 — 어벗츠 공동대표가 기공사라 기공소로 간주).
  - `AFFILIATE_TO_ABUTS`(어벗츠→딜러사·개발운영사·제조사·기공소 정산의 반대방향): 제조사·딜러사·개발운영사는 `taxType="과세"`(부가세 10%), 기공소는 `taxType="면세"`. 모두 `issuanceMode="TRUSTEE"`. 실제 공급자(기공소·제조사·딜러사·개발운영사)는 팝빌 회원 불필요, 어벗츠가 수탁자로 위수탁발행.
  - 정산 배치 확정(`adminConfirmSettlementBatch`) 시 위 역할별 Draft 자동 생성. SSOT: `resolveSettlementInvoiceDraftSpec` in `services/settlement.service.js`.
  - 위수탁발행(`issueType:"위수탁"` + `trusteeCorpNum` 등)은 팝빌 `TaxinvoiceService`가 과세/면세 모두 동일하게 지원한다(별도 서비스 아님). 수탁자(어벗츠)만 팝빌 회원/인증서가 필요하고, 위탁자(실제 공급자)는 회원가입이 불필요하다.
  - 구현: `utils/popbill.util.js`(`buildTaxinvoiceObject`의 `issuanceMode`/`seller`/`taxType`), `models/taxInvoiceDraft.model.js`.

- 정산/지급 정책:
  - 관리자 3사업 축 집계: `GET /api/admin/credits/settlement-business-overview` (`adminGetSettlementBusinessOverview`). 기간은 `period` 또는 `startDate`/`endDate`.
  - 유료/무료 모두 `REV_*` 수익 라인은 기록해 확인 가능해야 합니다.
  - **제조사(하청)**: 고정 매입가(부가세 포함) — `creditSettings.manufacturerRequestUnitPrice`(기본 8,800, **어벗 1개당**)·`manufacturerShippingUnitPrice`(기본 3,500, 박스당). 장부=공급가(÷1.1)+VAT. 리메이크는 제조사 무료 생산(지급 0). 그 외(무료 크레딧 결제 포함)는 약정 단가 전액 지급. 매달 말일 일괄 지급 전까지 미정산 잔액. 지급액=공급가+VAT·세금계산서. 제조사=일반과세사업자.
  - **딜러사·개발운영사**: 장부 적립은 공급가. 지급 시 부가세 10%를 더해 **입금·세금계산서**. 구현: `services/settlement.service.js`(`resolveSettlementPayoutAmounts` / `postSettlementPayoutJournal`). 배치 항목 `amount`=입금합계, `supplyAmount`/`vatAmount` 분해.
  - **어벗츠·기공소**: 정산 지급(PAYOUT)은 유료 수익만(면세 계산서). `EARN/ADJUST`는 `creditKind=PAID|null`만 포함.
  - **제조사**: 정산 지급(PAYOUT)은 유료·무료 수익 전액(과세·세금계산서). `computeAffiliateSettlementBalance`가 manufacturer는 creditKind를 가리지 않음.
  - 배송: 제조사 고정 배송 매입가(부가세 포함). 고객 배송비−제조사 공급가 잔여 → 관리자(`vatAmount=0`).
  - 딜러사·개발운영사·어벗츠의 무료 수익은 지급금액 0으로 정산 완료 상태만 표시할 수 있습니다. 제조사는 예외.
  - paid/free/settlement 혼합 소비는 의뢰자 잔액에서 **무료 → 기공 → 유료** 차감을 사용합니다.
  - 수익 라인(`REV_*`)의 paid/free 표시는 role 순서가 아니라, 소비된 paid/free 총량을 role별 수익 base에 비례 배분(무편향)해 기록합니다.
  - 수익 분배 계산 SSOT는 `services/creditRevenuePolicy.service.js`를 사용합니다.
    - 런타임 적재(`controllers/requests/common.review.helpers.js`)와 이관 스크립트는 동일 함수를 공유해 분배 정책 드리프트를 금지합니다.
    - 제조사 = 고정 공급가(어벗 1개당 / 배송 박스당). 잔여 = 소비 공급가 − 제조사 공급가 → 딜러사·개발운영사·어벗츠 상대비율(`BusinessAnchor.payoutRates`의 salesman/devops/admin). 딜러사 없으면 salesman 몫을 admin에 가산. 잔여 분배율은 추후 별도 확정.
    - 기공의뢰 성공 수수료: 매칭 `platformFeeRate`(기본 10%) · 지정 `directPlatformFeeEnabled`(기본 **off=무료**) / on 시 `directPlatformFeeRate`(기본 5%) · 월 참여 `autoMatchMonthlyFee`(**정책 0원**) — 관리자 플랫폼 설정「인증 기공소」. 루트 `rules.md` §2.3.
    - `machining_spend`+`express_surcharge`: 제조사 단가 1회만(`manufacturerUnitApplied` / 기존 의뢰 유니크와 정합).

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
  - 제조사 하청 고정단가(어벗 1개당 매입가 8,800 부가세 포함→공급가+VAT) 보정은 `scripts/db/rebalance-manufacturer-unit-price.js`로 수행합니다(타 역할 REV 미변경).

- 관리자 크레딧 응답 필드 정책:
  - `adminCredit`/잔액 응답에서 무료 크레딧 SSOT 키는 `freeCredit`(합), 하위호환으로 `freeRequestCredit`/`freeShippingCredit`/`freeBalance`입니다.
  - `bonus*` 계열 alias 응답/분기/정렬은 제거하고 SSOT 키만 사용합니다.

- 보존식(의뢰 단위) SSOT:
  - `의뢰자 순소비(현존 COMMIT 이벤트 기준)` = `REV_MANUFACTURER + REV_DEVOPS + REV_SALESMAN + REV_ADMIN`
  - 의뢰자 순소비는 `REQ_PAID_CREDIT|REQ_FREE_REQUEST_CREDIT` 라인의 **부호 있는 합의 음수**다.
    - 소비(COMMIT)=음수, 환불/ADJUST 복구=양수. 음수만 절대화하면 환불을 누락한다.
  - 수익 합도 동일하게 부호 있는 합(환불 시 `REV_*` 음수 라인 포함)
  - 합계 비교 기준은 공급가(`amountExcludingVat`) 우선 (`null`이면 `amount`; 면세이므로 VAT 가산분 없음)

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
  - 우편함 배정 SSOT (가공→세척.패킹 진입):
    1) 같은 수신자(`businessAnchorId` / PTX CA도 주문 기공소 BA)가 `세척.패킹`/`포장.발송`/`가공`(우편함 유지)에 이미 있으면 그 우편함으로 합류
       - PTX: 치과 BA가 같아도 수취인 지문(이름/전화/우편번호/주소/상세)이 둘 다 있고 다르면 합류하지 않는다
       - 신속/묶음은 같은 수신자면 한 박스
    2) 없으면 A1A1부터 순서상 가장 가까운 빈칸 할당
    - 목적: 다른 날짜에 나온 제품도 집하 전까지 같은 박스로 모아 택배비 1회
    - 합류는 `세척.패킹`·`포장.발송`·우편함을 유지한 `가공` 점유만 본다
    - 빈칸 판정은 위 합류 점유 + **집하 전 추적관리** 점유를 본다
    - 이미 배정된 `mailboxAddress`는 타 수신자 점유가 아니면 유지한다 (패킹 라벨/재가공)
    - 포장.발송 진입에서는 이미 배정된 `mailboxAddress`를 유지한다 (없으면 위 로직으로 1회 보정)
    - 포장.발송 → 세척.패킹, 세척.패킹 → 가공 롤백에서도 우편함을 유지한다
    - 가공 → 준비 롤백에서만 `mailboxAddress = null`로 해제한다
    - 배송비 보류 SSOT: 의뢰 제출(및 PTX CA 수락 시 미러 Request)에서 의뢰 사업자+예정 출고일 1회 `SHIPPING_SPEND_HOLD`(치과명으로 쪼개지 않음). 우편함 합류 시 중복 보류 해제. **포장.발송 진입** 시 `enterManufacturerShippingStage()` → 보류→매출(`SHIPPING_SPEND_COMMIT`). **기공소→치과·치과→기공소 배송 무료**(PTX `lab_shipping` hold 미생성·레거시는 해제).
    - 배송비 차감 SSOT: 집하(수동 집하 / 한진 status 11) 때 우편함 1회. `ShippingPackage`는 집하 장부 행이며 점유 정체성이 아니다
    - `(businessAnchorId, shipDateYmd, mailboxAddress)` unique 인덱스는 쓰지 않는다. 같은 칸을 하루에 두 번 비울 수 있다
    - 운송장 라벨 비고는 `우편함 / 사업자명`만. 건수는 웹앱에서 확인
  - 우편함 점유(active) 단계(요약/집하 등): `세척.패킹`, `포장.발송`, `추적관리`
    - `추적관리` 중 `picked_up|completed|canceled` 또는 `trackingStatusCode>=11` 건은 점유에서 제외
  - `review-status` 승인 트랜잭션에서 우편함 할당 쿼리는 같은 `session`으로 읽어
    동일 BusinessAnchor의 직전 배정 주소를 같은 트랜잭션 내에서도 재사용한다.
  - BusinessAnchor 비교는 `normalizeBusinessAnchorId`(24hex만)로 한다.
    - Mongoose Document `String(doc)`은 inspect 덤프라 id로 쓰지 않는다.
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
    - 수동 집하 시각(`pickedUpAt`/`deliveredAt`)은 사용자 입력을 받지 않고 서버의 실제 처리 시각(`now`)으로 기록합니다.
      (예정 수거 시각 `scheduledShipPickup=16:00 KST`와 별개)
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
