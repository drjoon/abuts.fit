# [abuts.fit](http://abuts.fit) Rules (Slim)

이 문서는 **루트 단일 기준(SSOT)** 규칙입니다.  
중복/히스토리/트러블슈팅 상세는 제거했고, 과거 전문은 `.archive/rules.legacy-2026-07-29.md`에 보관합니다.

---

## 0) 운영 원칙

### 0.0 Git 커밋 및 푸시 규칙

- 모든 Git 커밋 메시지는 반드시 한글로 작성합니다.
- 커밋 메시지는 개발자가 직관적으로 이해할 수 있도록 구조화된 형식을 따릅니다.
  - 형식 예시:
    - `[기능 추가] 로그인 페이지 UI 구현`
    - `[리팩터링] 쓸데없는 백엔드 워커 로직 제거 및 구조 개선`
    - `[버그 수정] 스냅샷 재계산 오류 및 stale 경고 해결`
- 커밋을 진행하기 전, 변경된 파일 목록을 먼저 브리핑하고 사용자 승인을 받은 뒤 `git push`까지 완료합니다.

### 0.1 문서/코드 동시 갱신 (강제)

한 작업에서 **3개 이상 파일**을 수정/탐색하면 아래를 함께 수행합니다.

1. `rules.md`에는 **중요 진입 파일 위치만** 간단히 갱신
2. 실제 수정한 코드 파일 상단에 `related files:` 상호참조 주석 갱신
3. 1~2 누락 시 작업 완료로 간주하지 않음
4. 작업 중 발견한 중요 결정/예외/운영 기준은 루트 또는 해당 도메인 로컬 `rules.md`에 즉시 기록

### 0.2 룰 문서 경량화 원칙

- 루트 `rules.md`: 정책 **요약/불변 규칙/진입점 지도**만 유지
- **루트 룰에는 루트에 적합한 것(전역 원칙/역할 간 공통 진입점)만 기록**
- 도메인/로컬 구현 메모(예: 프론트 훅/컴포넌트 단위 세부)는 각 로컬 `rules.md`에 기록
- 구현 로그/원인 분석/히스토리: 코드 주석 또는 `.archive/` 문서로 분리
- 하위 `rules.md`는 로컬 메모만 유지 (충돌 시 루트 우선)

### 0.3 상호참조 주석 템플릿

```ts
// related files:
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
```

- 경로는 저장소 루트 기준 상대경로
- “해당 파일이 직접 연결되는 파일”만 기록 (과도한 나열 금지)

### 0.4 애매한 정책은 보류 후 사용자 컨펌 (강제)

- 요구사항/정책이 애매하면 임의 확장/임의 축소 금지
- fallback, 추정값, 임시 하드코딩으로 진행하지 않음
- 판단 보류 상태를 명시하고 사용자에게 확인 질문 후 진행
- 특히 권한(role), 과금/정산, 추천(리퍼럴) 범위는 컨펌 없이 변경 금지

### 0.5 작업 우선순위 원칙 (강제)

- 여러 작업을 동시에 진행할 때는 **중요도 순서**로 처리한다.
- 결제/크레딧/정산/권한/데이터무결성 같은 고위험 변경을 먼저 처리한다.
- 단순 반복 작업(예: 이름 교체, 문구 통일, 포맷 정리)은 핵심 로직 안정화 후에 처리한다.

---

## 1) 절대 원칙 (변경 금지)

### 1.1 레거시 제거 / SSOT 단일화

- 레거시 alias, 이중 경로, 임시 fallback 금지
- 데이터는 **하나의 필드만 SSOT**로 사용
- 읽기 경로에서 보정/추정하지 말고, 쓰기 이벤트 시점에만 SSOT 갱신

### 1.2 무분별 fallback 금지

- 값이 없을 때 임의 추정값 주입 금지
- 없으면 빈값/null/명시적 오류로 드러내고 원인 수정

### 1.3 보안

- 비밀번호/API키/DB URI/JWT secret 하드코딩 금지
- 환경변수 미설정 시 즉시 실패

### 1.4 시간

- 모든 날짜/집계/표시는 KST(Asia/Seoul) 기준
- 월 경계/기간 필터도 KST 기준
- **프로세스 TZ SSOT (강제):** Node/백그라운드 앱의 `process.env.TZ`는 항상 `Asia/Seoul`
  - EBS 호스트 OS는 UTC여도 앱 프로세스는 KST로 통일 (로컬 개발 Mac KST와 동일)
  - 적용 위치: `web/backend/bootstrap/env.js`, `web/Procfile`, `web/.ebextensions/06_timezone.config`,
    `web/eb.sh`(setenv), `local.env`/`test.env`/`prod.env`, bg Node 엔트리
  - `Date#getDay()` / `setHours()` 등 **로컬 TZ에 의존하는 API**를 YMD/요일 판정에 쓸 때는
    프로세스 TZ만 믿지 말고, 가능하면 `Asia/Seoul` 명시(`Intl` / `+09:00` / UTC noon 달력일)로 방어
  - 출고일·묶음요일·출고 뱃지·영업일 계산은 이 정책에 직접 영향 받음
    (`production.utils.js` `resolveNextWeeklyBatchYmd` / `resolveLeadDaysWithSameDayCutoff` 등)
  - 묶음 리드타임 SSOT: `minBusinessDays=N`이면 접수 익영업일부터 N영업일 생산 후
    주간 발송 요일로 정렬 (lead=1 → 다음 영업일 16:00 출고 가능).
    신속은 KST 12시 컷오프로 당일/익영업일 분기.
  - 디자인+생산 출고 SSOT: `productMode === "design_custom_abutment"`이면 묶음/신속 모두
    출고일에 디자인 리드 **+1영업일** (`production.utils.js` / `estimateShipDate.ts`).
    UI 안내: `PricingPolicyDialog`, `NewRequestShippingSection`,
    `RequestorBulkShippingBannerCard` `SHIP_OUT_INFO_MESSAGE`.
    표시 라벨: `커스텀어벗 생산` / `커스텀어벗 디자인+생산` (문맥상 생략 시 `생산` / `디자인+생산`).


### 1.5 구조

- 역할별 UI를 한 파일에서 분기하지 말고 역할 폴더 분리
- 소스 파일 800줄 초과 금지 (초과 시 분리)

---

## 2) 데이터/도메인 핵심 SSOT

### 2.1 사업자/권한

- 사업자 SSOT: `BusinessAnchor`
- 사용자-사업자 연결 키: `User.businessAnchorId`
- `subRole`만 사용 (`owner|staff|null`), 레거시 role 필드 금지
- 사업자 타입 허용: `requestor | manufacturer | admin | salesman | devops`
  - `practice` role은 제거. 기존 계정은 `requestor`+`requestorKind=practice`+`requestorServices.free` 마이그레이션 대상(신규 생성 금지). 백필: `scripts/db/backfill-requestor-capabilities.js --apply`.


### 2.2 의뢰 생성/공정

- 신규 의뢰 표준: `POST /api/requests/from-draft`
- 신규의뢰 첨부·구강 스캔 묶음 SSOT — **자동**만 파일 크기 기준 (파일명·환자명만으로 묶지 않음):
  - **>= 3MB**: 구강 스캔 → 같은 환자면 디자인+생산(`design_custom_abutment`) 1건으로 **자동** 합침
  - **< 3MB**: 커스텀어벗 디자인 STL → 동일 환자·동일 파일명이어도 **자동** 묶음 금지(각각 별도 건)
  - **수동** 연결(합치기)·해제(연결 끊기): **3MB 기준 미적용**. 모든 첨부 파일에 대해 사용자가 묶거나 풀 수 있다.
  - 구현: `web/frontend/.../patientGroups.ts` (`ORAL_SCAN_MIN_BYTES`). 자동만 `filterOralScanFileKeys`.
    수동: `groupSelectedFiles` / `ungroup` / `addFilesToGroup` / `removeFileFromGroups`.
    상세: `web/frontend/rules.md`, `.cursor/rules/oral-scan-file-size.mdc`
- 공정 SSOT: `Request.manufacturerStage`
  - `준비 → CAM → 가공 → 세척.패킹 → 포장.발송 → 추적관리`
- 크레딧 이벤트 발생 시점 SSOT:
  - `REQUEST_SPEND_COMMIT`: **CAM 승인(가공 진입)** 시 기록
  - `SHIPPING_SPEND_COMMIT`: **세척.패킹 승인(포장.발송 진입)** 시 기록
  - `REQUEST` 차감 삭제: **가공 롤백(CAM 복귀)** 시 대응 COMMIT 이벤트/라인 **물리 삭제**
  - `SHIPPING` 차감 삭제: **포장.발송 롤백(세척.패킹 복귀)** 시 대응 COMMIT 이벤트/라인 **물리 삭제**
  - BG 콜백은 파일 처리 결과 동기화 이벤트이며 승인/롤백 트랜지션이 아니므로,
    BG 콜백에서 크레딧/정산 장부 갱신을 수행하지 않음
- 샘플 정책(강제): `requestCategory in (rnd_sample, copied_sample)`는 크레딧/정산 무관 작업
  - 샘플은 장부에 **무기록(무자료/무상)** 처리
- 제조사 직접 NC 가공 정책(강제): `requestId`/`request._id` 등 의뢰 식별 메타가 없는 수동 NC 작업은
  크레딧/정산 대상이 아니며 장부에 **무기록(무자료/무상)** 처리
- 불완전가공(RnD unmachinable) 정책(강제):
  - 불완전가공은 샘플이 아니며, CAM 승인으로 이미 발생한 크레딧 차감은 유지한다.
  - 불완전가공 판정으로 CAM 복귀가 발생해도 장부 삭제/환불을 수행하지 않는다.
  - 준비 단계 취소만 차감 미발생 상태로 처리한다.

### 2.3 크레딧/정산

- **부가세(VAT) / 면세 정책(강제):**
  - 운영 주체는 **면세 사업자**다. 크레딧 충전·앱 내 과금·정산·안내 문구 모두 **부가세 없음**.
  - 크레딧 충전: `vatAmount = 0`, `amountTotal = supplyAmount`(공급가 = 입금/결제 금액).
  - 앱 내 의뢰/배송/정산 금액·장부(`LedgerLine`)·UI 표시는 **공급가(원)** 기준. 수익 라인에 VAT를 가산하지 않는다(`vatAmount = 0`).
  - 합계 비교·잔액 집계는 `amountExcludingVat`(없으면 `amount`)를 쓰며, 이는 공급가와 동일하다.
  - 사용자/약관/가격 안내에서 "VAT 별도·부가세 포함·VAT 10%" 표현 금지. 배송비 별도 안내는 유지.
- 단일 SSOT 장부: `LedgerJournal` + `LedgerLine`(논리적으로 하나의 General Ledger)
- 기존 분리 원장(`CreditLedger`, `ManufacturerCreditLedger`, `SalesmanLedger`, `AdminCreditLedger`)은
  **레거시로 간주하며 단계적 이관 후 삭제**한다. 이관 중 이중기록(dual-write) 금지.
- 필수 이벤트 타입 SSOT(저장형):
  - `REQUEST_SPEND_COMMIT`, `SHIPPING_SPEND_COMMIT`, `PRACTICE_TRANSFER_SPEND_COMMIT`
  - `CHARGE_PAID`, `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`, `LAB_SETTLEMENT_CHARGE`, `ADJUST`, `SETTLEMENT_PAYOUT`
- 수익·버킷 계정 SSOT:
  - `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - 역할별 크레딧 버킷 표시 SSOT(강제):
    - **치과(`practice`)**: 입금·충전 잔액은 **유료크레딧**(`REQ_PAID_CREDIT` / `paidCredit`). 기공의뢰(기공비·어벗 소매가)도 이 유료크레딧에서 차감한다. 치과 UI에 `기공크레딧`/`settlementCredit` 잔액 행·필터를 **표시하지 않는다**(치과는 `LAB_SETTLEMENT_CREDIT` 소유자가 아님).
    - **기공소(`lab`)**: (1) **유료크레딧** — 기공소가 입금·충전한 `paidCredit`, 생산의뢰·배송 등 앱 내 소비에 사용. (2) **기공크레딧** — 치과에서 받은 정산 대기액 `LAB_SETTLEMENT_CREDIT` (`creditKind=SETTLEMENT`), 의뢰/배송 유료크레딧과 **완전 분리**, 매월 `SETTLEMENT_PAYOUT`으로 기공소 계좌 이체.
  - 유료/무료 모두 수익 라인을 기록하되, 제조사·역할 정산 지급은 유료만 대상. 기공소 기공크레딧 지급은 `SETTLEMENT_PAYOUT` 경로.
  - 배송비 정책(강제): 배송 크레딧 소비(`SHIPPING_SPEND_COMMIT`)의 수익은 **전액 제조사 귀속**으로 기록
  - paid/free 혼합 소비는 의뢰자 잔액에서 **무료 우선 차감 후 부족분만 유료 차감**을 적용
  - 수익 라인(`REV_*`)의 paid/free 표시는 role 순서가 아니라 소비된 paid/free 총량을 role base에 비례 배분(무편향)해 기록
  - 무료 수익은 지급 0원으로 정산완료 상태만 표시 가능
- 신규 기공소 런칭 이벤트 가격 SSOT: 가입 승인일 기준 `90일` 동안 커스텀 어벗 `개당 10,000원` 고정가를 우선 적용
- **기공소 기존 거래처 · 기공의뢰 과금 SSOT:**
  - `LabTradingPartner`: lab이 `pricingBaseDate`(기존 90일 런칭과 동일 기준)와 기능 출시일(`2026-08-11`) 중 **늦은 날**부터 **30일**간 기존 거래 치과 초대. 만료 후 **신규 등록만 불가**(active/invited 유지·완료 가능)
  - 초대 링크 → 치과 가입 → 사업자등록증 **검증(`verified`)** 시 `status=active`
  - 가격: 기공비=`BusinessAnchor.labFeeSchedule`(기공소 설정; crown/bridge/inlay/pontic/customAbutmentDesign, 기본 6만/6만/5만/4만/1만), 치과 납품 어벗 소매가=`creditSettings.abutmentRetailPrice`(devops 「요금 · 크레딧」), 생산단가=기존 `computePriceForRequest`. `커스텀어벗 디자인`은 기공비만(어벗 소매가 미부과)
  - 치과는 기공비(+어벗 소매가)를 **기공소 의뢰수락 시 유료크레딧**에서 1회 차감. 장부 UI 항목=`기공비`. 기공소 적립 버킷 UI=`기공크레딧`(account=`LAB_SETTLEMENT_CREDIT`) — 치과 화면에는 동일 라벨 잔액을 두지 않음
  - **거래처 O**: 전액 → 기공소 `LAB_SETTLEMENT_CREDIT`. 커스텀어벗은 기공소가 어벗츠에 생산의뢰하고 **생산단가를 기공소 유료크레딧(의뢰)에서 강제 차감**(치과 재차감 금지)
  - **거래처 X**: 기공비만 기공소 기공크레딧, 어벗 소매가는 어벗츠 `REV_*`(직납과 동일)
- 롤백 원칙:
  - 롤백은 REFUND 추가가 아니라 원본 커밋 이벤트 및 대응 라인의 **물리 삭제**
- 조회/표시 타입 원칙:
  - 충전은 `CHARGE_PAID` / `CHARGE_FREE_REQUEST` / `CHARGE_FREE_SHIPPING` / `LAB_SETTLEMENT_CHARGE`으로 분리 표기 (`CHARGE` 단일표시 금지)
  - 소비는 `SPEND_PAID` / `SPEND_FREE_REQUEST` / `SPEND_FREE_SHIPPING`으로 분리 표기 (`SPEND` 단일표시 금지)
- 정산 보존식 SSOT(의뢰 단위):
  - `의뢰자 순소비(현존 COMMIT 이벤트 기준)` = `어벗츠/제조사/개발운영사/영업자 수익합` (+ 기공의뢰 분배 시 `LAB_SETTLEMENT_CREDIT` 충전합)
  - 합계 비교는 공급가(`amountExcludingVat`) 우선 (`null`이면 `amount`; 면세이므로 VAT 가산분 없음)
- 제조사/역할 정산 건수 SSOT(강제):
  - 일별·기간 정산의 의뢰/배송 **건수**는 `LedgerLine` 개수가 아니라 `(eventType, creditKind, refId)` 유니크다.
  - 동일 의뢰의 `machining_spend` + `express_surcharge`(각각 `REQUEST_SPEND_COMMIT`)는 금액은 합산하되 건수는 의뢰 1건으로 센다.
  - paid/free 혼합으로 `REV_*` 라인이 쪼개져도 같은 `creditKind`·`refId`는 1건이다.
  - 구현: `controllers/manufacturers/manufacturer.controller.js` (`buildManufacturerEarnCollapseAndGroupStages`)
- 정산 지급 가능 잔액 집계 원칙(공통):
  - `SETTLEMENT_PAYOUT`은 포함
  - `EARN/ADJUST`는 `creditKind=PAID|null`만 포함 (무료 수익/무료 조정은 지급 대상 제외)
- CreditLedger → GL 이관 보정 원칙:
  - 레거시 `CreditLedger`를 원본으로 이관하되, 정책 위반/무효 행(예: 0원 SPEND, 참조 누락된 상쇄형 SHIPPING SPEND/REFUND 쌍)은 장부 반영 대신 무시 처리
  - 샘플(`rnd_sample|copied_sample`) 및 비의뢰 수동 NC 작업은 장부 무기록 원칙 유지
- 잔액 조회 SSOT:
  - `GET /api/credits/balance` 및 잔액 파생 조회는 `LedgerLine` 직접 집계값을 사용
  - `BusinessCreditBalance`는 레거시 스냅샷으로 취급하며 런타임 잔액 판정/표시에 사용하지 않음
- 가입 환영 무료 크레딧(강제):
  - 의뢰자 `BusinessAnchor` **신규 생성(실 사업자등록번호)** 또는 **synthetic(`practice-*`)→실BN 검증 승격** 시에 `defaultRequestFreeCredit` / `defaultShippingFreeCredit`를 사업자번호당 1회 지급
  - 구현: `business.update.controller.js` 생성 분기·synthetic 승격 분기 → `business.freeCredit.util.js`
  - 무BN synthetic 앵커 생성만으로는 지급하지 않음. 일반 사업자 정보 수정·재로그인·설정 저장 경로에서는 지급 호출 금지
  - 사업자등록번호당 `FreeCreditGrant`(`REQUEST_FREE_CREDIT`/`SHIPPING_FREE_CREDIT`, legacy `WELCOME_BONUS`/`FREE_SHIPPING_CREDIT` 포함)로 중복 지급 차단
- 실시간 이벤트 발행 SSOT: 송신측은 대상 role 전체에 fan-out emit 한다.
- 수신측 SSOT: 로그인한 role 클라이언트는 이벤트를 수신하되, 현재 열려 있는 페이지(활성 화면)만 즉시 갱신한다.
- 비활성 페이지 데이터는 즉시 갱신하지 않고, 페이지 진입 시 재조회(또는 캐시 무효화)로 동기화한다.
- 웹소켓 업데이트 표준(무플리커 + 부하완화):
  - `window.location.reload`/페이지 전체 reset 기반 동기화 금지
  - payload 조건 매칭 후 **부분 patch(무플리커)**를 우선하고, 전체 재조회는 불가피한 경우에만 최소 범위로 수행
  - 이벤트 반영 때문에 입력중 폼/모달/선택 상태를 깨지 않는다(작업 비간섭)
  - 이벤트별 payload 파싱/매칭 로직을 페이지마다 중복 구현하지 않고 도메인 공통 헬퍼를 사용한다
  - 대시보드류 페이지는 `heavy summary`(목록/상세)와 `cards summary`(상단 카운트)를 분리하고, 이벤트 반영 시 cards 경량 API를 우선 사용한다.
  - 이벤트 1회당 재조회는 "즉시 payload patch → 단일 coalesced 백그라운드 검증 refetch" 순서를 기본값으로 한다.
  - 이벤트별로 queryKey별 갱신 대상을 명시적으로 매핑한다(예: stage 변경=카드+해당 리스트, credit 변경=잔액/카드만).
- 잔액 집계 성능 인덱스(필수): `LedgerLine(ownerRole, ownerId, accountCode, occurredAt)`
- 동시 차감(overspend) 방지: spend 트랜잭션에서 `CreditBalanceGuard`를 통한 앵커 단위 직렬화 적용
- 이벤트 기반 캐시 갱신 우선, 조회 시 대규모 재계산 지양

### 2.4 의뢰자 역할(치과/기공소) × 서비스(무료/유료) · 가입/온보딩 · 기공의뢰서

- 가입 role SSOT: **requestor** | **salesman**만. `practice` role은 **제거**(신규 생성·공개 가입·드롭존 가입·관리자 생성 모두 금지). 기존 `practice` 계정은 `requestor`+`requestorKind=practice`+`requestorServices.free`로 마이그레이션.
- **역할 XOR SSOT**: `requestorKind = "practice" | "lab"`
  - `practice`: **치과 (기공실 포함)** — 기공의뢰서 **발신**, 유료 시 어벗츠 **생산의뢰**
  - `lab`: **기공소** — 기공의뢰서 **수신**, 유료 시 어벗츠 **생산의뢰** (디자인 큐는 별도 `designAccessEnabled`)
- **서비스 OR SSOT**(최소 1개): `requestorServices = { free: boolean, paid: boolean }`
  - `free`: 기공의뢰서(치과↔기공소)
  - `paid`: 생산의뢰(대시보드·신규의뢰·결제 설정). **`BusinessAnchor.status === "verified"` 필수**
- Org SSOT: `BusinessAnchor` (`businessType: "requestor"`). 필드 SSOT는 앵커의 `requestorKind`/`requestorServices`(User는 미링크·온보딩 미러).
- **레거시**: `requestorCapabilities.{practice,lab}`·`clinic` 키는 normalize/백필/resolve 폴백만. 신규 쓰기 금지.
- **네이밍**: 치과 역할 식별자는 `practice`(예전 `clinic`과 동일 의미). `clinicName`/`clinicPhone` 등 연락처 필드·filename-rule·Clinic CRUD는 별도.
- 드롭존(치과 전용 공개 전송):
  - 가입·로그인 `requestor`, `requestorKind=practice`, `requestorServices={ free:true, paid:false }` 고정
  - 최소 가입: 이메일(+인증) + 비밀번호 + 담당자 휴대폰(+인증). `practiceProfile`/Org 앵커는 만들지 않음
  - 가입 직후 **첫 PracticeTransfer**까지 드롭존에서 전송 가능
  - 온보딩에서 `practiceProfile` 완료 시 Org 앵커 생성(synthetic `practice-*` BN 가능). 이후 유료 선택·검증 시 동일 앵커에 실BN·license 승격
- UI 라벨: `REQUESTOR_KIND_LABEL` / `REQUESTOR_SERVICE_LABEL` / `REQUESTOR_ROLE_BADGE_LABEL`(의뢰자·치과 / 의뢰자·기공소 / 의뢰자)
- 가입·온보딩:
  1. `/signup` 또는 드롭존 가입 → 로그인
  2. `/dashboard/wizard`: 프로필 → 휴대전화 → 역할(owner/staff) → 사업자
  3. 사업자 단계: 역할 라디오(치과/기공소)만. **이용 서비스는 기공의뢰서(무료) 고정**(체크 UI 없음). 드롭존은 practice+free 고정
  4. practice면 사업자등록증 선택(`practiceProfile`로 Org 가능). **lab이면 사업자등록증 등록·검증 필수**. 유료는 가입 후(또는 lab 검증 시) 설정/검증으로 `paid` 개방
  5. 완료 후: 유료 미가용 → `/dashboard/practice-transfers`, 유료 가용 → `/dashboard`
- 접근성 게이트:
  - **유료**: `requestorServices.paid && verified` — kind와 무관. 가입 기본은 `paid=false`; 사업자등록증 검증 성공 시 `paid=true`로 승격. FE `BusinessPaidAccessGate` + BE `authorizePaidRequestor`
  - **무료**: `requestorServices.free` — 기공의뢰서. 가입 시 기본
- 기공의뢰서(PracticeTransfer):
  - **발신**: `kind===practice && free`
  - **수신**: `kind===lab && free`
  - 저장 SSOT: `PracticeTransfer` (Request 생성 경유 금지)
  - 유료 기공의뢰: 치과 `paid+verified` 크레딧으로 소매가 차감 후 §2.3 거래처 분배. 파일 라우팅·채팅 권한 SSOT는 유지
  - **자동매칭**: `matchingMode=auto` — devops가 `practiceTransferAutoMatchEnabled` ON한 검증 기공소 공개 풀, 선착순 수락(3h)·작업완료·만료 시 과금 롤백 후 재공개. 지정 기공소(`direct`)는 기존과 동일
  - **작업완료**: 기공소 수락 카드에서 결과파일 업로드 필수(`resultFiles`). 커스텀어벗 포함 시 배송모드(`production.shippingMode`) 선택
  - **생산 진행**: 치과가 결과파일 확인 후 `POST .../confirm-production`. 커스텀어벗이면 기공소→어벗츠 Request 자동 생성(`partnerBilling` 연동)
- SSOT API: `POST/GET /api/practice/transfers`, `GET .../received`, `POST .../mark-accepted`, `POST .../mark-complete`, `POST .../confirm-production`, `POST .../cancel-batch`
- devops 자동매칭 ON: `GET/PATCH /api/devops/practice-transfer-auto-match`
- 기공소 거래처 API: `POST/GET /api/lab-trading-partners`, `POST .../:id/cancel`
- 크레딧/정산은 유료(paid+verified) 경로. synthetic BN에는 환영 크레딧 없음(실BN 검증 승격 시 1회)
- 소개(리퍼럴): 영업자만 소개 메뉴·라우트. 의뢰자·개발운영사·관리자 UI 없음(소개 할인 종료). **거래처(`LabTradingPartner`)는 리퍼럴 트리와 별도 edge**
- 헬퍼: `web/backend/utils/requestorCapabilities.js`, `web/frontend/src/shared/business/requestorCapabilities.ts`, `practiceTransferAuth.middleware.js`, `paidRequestor.middleware.js`, `requestorOrgAnchor.util.js`
- 백필: `web/backend/scripts/db/backfill-requestor-capabilities.js` (`--apply`)

### 2.5 채팅

- 일반 의뢰 기반 채팅: `GET /api/chats/request-room/:requestId`
- practice 전송 기반 채팅: `GET /api/chats/practice/transfer-room/:transferId`
- 채팅 연결 판단은 라우팅 필드 SSOT 기준으로 처리

### 2.6 CNC/브리지

- 브리지/장비 상태 SSOT는 백엔드 DB
- 자동가공(Worksheet) 큐와 수동업로드(Equipment) 큐 절대 분리
- `allowAutoMachining`(자동가공)과 `allowJobStart`(수동시작) 의미 혼용 금지

### 2.7 배송/우편함

- 배송 방식 SSOT: `Request.shippingMode` + `finalShipping.mode` / `originalShipping.mode`
  - `normal`(묶음) | `express`(신속)
- 묶음 배송 식별은 박스/패키지 기준으로 유지
- 배송비 과금 시점: 세척.패킹 승인
- 신속 배송 추가 의뢰크레딧: `creditSettings.expressFee`(기본 2,000원), **가공 진입(CAM 승인) 시 별도 `express_surcharge` 저널로 차감**
  - 설정 UI: 관리자 설정(결제) + 개발·운영사 설정(요금) — `AdminCreditSettingsTab` / `PATCH /api/admin/settings/credits` (`admin`|`devops`)
  - 약속 출고일 자정까지 당일 집하 실패(또는 신속→묶음 전환) 시 신속 추가비만 물리 삭제 취소
    (`shippingOnTimeEvalWorker` / `cancelExpressSurchargeIfShipDelayed`). 16시 이후 당일 수동 집하는 정시.
  - 의뢰자 대시보드: `PATCH /api/requests/my/shipping-mode` (준비 단계만)
  - 견적/표시 금액 SSOT: 신속 지정 시점부터 `price.amount`에 추가비를 합산하고 `price.expressFee`에 기록 (`expressPrice.utils.js` `resolveQuotedPriceWithExpressFee`)
    - 적용 경로: 생성(`from-draft`/`createRequest`), 준비 단계 모드 전환, 대시보드/상세 응답 정규화
    - 실제 크레딧 차감 시점(CAM)과 표시 금액 반영 시점을 혼동하지 말 것
- 디자인+생산 과금: `productMode === "design_custom_abutment"`일 때만 적용
  - **1 STL에 여러 어벗** 가능. 공식: `(생산 단가 + 디자인비) × 어벗 수`
  - 디자인비: `creditSettings.designFee`(기본 **15,000원 / 1어벗**)
  - 어벗 수: `caseInfos.toothWorks` 커스텀어벗·임플란트 치아만(Pontic·단순 보철 제외; 없으면 `tooth` 파싱, 최소 1) — `countDesignAbutmentQty`
  - 설정 UI: 동일 `AdminCreditSettingsTab` / `PATCH /api/admin/settings/credits`
  - 견적/표시: `designPrice.utils.js` `resolveQuotedPriceWithDesignFee`
    - `price.amount` = `(생산단가 + designFee) × qty`, `price.designFee` = 디자인 총액, `price.abutmentQty` = qty
  - 적용 순서: 디자인+생산 배수 → 신속비(생산=건당, 디자인+생산=어벗 수 배수). 무상/0원 견적에는 미적용
  - 차감: CAM `machining_spend` = `(생산단가 + 디자인비) × qty` (신속비와 분리)
  - 출고일: 묶음/신속 공통으로 디자인 리드 **+1영업일** (`production.utils.js` /
    프론트 `estimateShipDate.ts`)
  - UI: `PricingPolicyDialog`, 의뢰 상세 비용 세부. 오늘의 생산 가격 카드·신규의뢰 우측·의뢰카드는 디자인비 금액 미표시(`+디자인` 뱃지만)
  - 표시 라벨: `커스텀어벗 생산` / `커스텀어벗 디자인+생산` (생략 시 `생산` / `디자인+생산`)
  - 상세: `.cursor/rules/design-fee.mdc`
  - 지정 디자이너 클레임·마감: `Request.designClaim` + `designDeadlineSettings.claimHours`(기본 3h).
    UI 「수락」 후 60초 공지 → 타인 숨김, 마감 만료 시 재공개, 본인만 승인. 상세는
    `web/frontend/rules.md` / `web/backend/rules.md` 디자인 파트너 절.
- 추적관리 진입 기준: 집하완료(statusCode 11 / picked_up)

### 2.8 R&D 샘플

- 의뢰 분류 SSOT: `Request.requestCategory`
  - `order | rnd_sample | copied_sample`
- 운영 통계에는 샘플 제외, 작업 카드에는 정책에 따라 표시

---

## 3) 주요 금지사항 요약

- 브라우저 `alert/confirm/prompt` 사용 금지 (`ConfirmDialog` 사용)
- 프론트가 BG/브리지 서버 직접 호출 금지 (백엔드 프록시 경유)
- 규칙 우회용 임시 분기/레거시 보존 금지
- 정책 변경 없이 색상/단계명/필드명 임의 확장 금지

---

## 4) 중요 진입 파일 지도 (rules에는 이것만 유지)

아래 파일은 도메인 진입점이므로, 정책 변경 시 우선 확인합니다.

### 4.1 Frontend

- 루트에는 전역 진입점만 유지합니다.
  - `web/frontend/src/App.tsx`
  - `web/frontend/src/features/layout/DashboardLayout.tsx`
  - `web/frontend/src/shared/types/role.ts`
  - `web/frontend/src/shared/business/requestorCapabilities.ts` (의뢰자 역할·서비스·유료게이트)
- 프론트 상세 진입 파일 지도는 `web/frontend/rules.md`를 참조합니다.

### 4.2 Backend

- 루트에는 전역 진입점만 유지합니다.
  - `web/backend/bootstrap/env.js` (프로세스 `TZ=Asia/Seoul` 강제)
  - `web/backend/app.js`
  - `web/backend/server.js`
  - `web/backend/utils/distributedJobLock.js` (멀티 인스턴스 워커 락 SSOT)
  - `web/backend/utils/requestorCapabilities.js` (의뢰자 역할·서비스·기공의뢰서 권한)
  - `web/backend/middlewares/paidRequestor.middleware.js` (생산의뢰 유료 가드)
  - `web/Procfile`, `web/.ebextensions/06_timezone.config`, `web/eb.sh` (EBS TZ)
- 백엔드 상세 진입 파일 지도는 `web/backend/rules.md`를 참조합니다.

### 4.3 Background

- BG 상세 진입 파일 지도는 각 프로그램 로컬 `rules.md`를 참조합니다.
  - `bg/pc1/rhino-server/rules.md`
  - `bg/pc1/esprit-addin/rules.md`
  - `bg/pc1/bridge-server/rules.md`
  - `bg/pc2/lot-server/rules.md`
  - `bg/pc2/pack-server/rules.md`
  - `bg/pc3/wbls-server/rules.md`

### 4.4 단위 프로그램 로컬 rules 위치

- Frontend: `web/frontend/rules.md`
- Backend: `web/backend/rules.md`
- Rhino: `bg/pc1/rhino-server/rules.md`
- Esprit: `bg/pc1/esprit-addin/rules.md`
- Bridge: `bg/pc1/bridge-server/rules.md`
- LOT: `bg/pc2/lot-server/rules.md`
- Pack: `bg/pc2/pack-server/rules.md`
- WBL: `bg/pc3/wbls-server/rules.md`

### 4.5 상세 정책 참조 인덱스 (누락 방지)

- 원문 보존본(archive): `.archive/rules.legacy-2026-07-29.md`
- 로컬 전체 상세 미러(운영 참조본): `rules.legacy-full.md`
- 원칙:
  - 루트 `rules.md`는 요약/진입점/불변 원칙만 유지
  - 세부 정책/히스토리/예외 규칙은 각 로컬 `rules.md` + 전체 상세 미러에서 참조
  - 정책 해석 충돌 시 우선순위: 루트 요약 원칙 > 해당 도메인 로컬 rules > 전체 상세 미러

---

## 5) 변경 체크리스트 (작업 종료 전)

- [ ] 레거시/중복 필드 제거 완료
- [ ] fallback 없이 SSOT 단일 경로로 정리
- [ ] 수정 파일 상단 `related files` 주석 갱신
- [ ] 루트 `rules.md`의 중요 진입점 필요 시 갱신
- [ ] 가능하면 최소 범위 테스트/검증 실행

---

## 6) 인프라 마이그레이션 완료 기준 (EB → LB+NAT)

- 목표 SSOT:
  - EB 단일 인스턴스 구조를 **로드밸런싱 + NAT 인스턴스 구조**로 전환
  - MongoDB Atlas 비용은 기존 수준을 유지
- 안정화 관찰 기간(며칠):
  - 실사용 트래픽 기준 핵심 기능 점검(로그인, 주문/의뢰 등록 등)
  - 에러 리포팅/CloudWatch 알람 확인
  - 피크 시간대 오토스케일링 동작 확인(최대 2대 시나리오)
  - 단일 NAT 인스턴스 재부팅/장애 없이 안정 동작하는지 확인
- 보강 권장(선택):
  - NAT 자동 복구를 위해 CloudWatch 알람 + Auto Scaling Group(최소=최대=1) 구성 검토
- 마이그레이션 최종 종료 조건:
  - 안정화 기간 동안 이상 없음
  - 기존 `abutsfit`(단일 인스턴스) 환경 종료
  - Atlas Network Access에서 기존 EIP 제거 후 NAT IP만 유지

---

## 부록) 문서 범위 밖 항목

- 상세 이력/긴 트러블슈팅/과거 정책 비교표는 루트 rules에서 제거
- 필요 시 `.archive/` 또는 각 도메인 로컬 문서로 관리
