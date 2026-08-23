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
  - 묶음 리드타임 SSOT: `minBusinessDays=N`이면 접수 당일을 1일차로 포함 → 추가 영업일 `(N-1)`
    (PricingPolicyDialog: 자정까지 1영업일=당일 집하). 이후 주간 발송 요일로 정렬.


### 1.5 구조

- 역할별 UI를 한 파일에서 분기하지 말고 역할 폴더 분리
- 소스 파일 800줄 초과 금지 (초과 시 분리)

---

## 2) 데이터/도메인 핵심 SSOT

### 2.1 사업자/권한

- 사업자 SSOT: `BusinessAnchor`
- 사용자-사업자 연결 키: `User.businessAnchorId`
- `subRole`만 사용 (`owner|staff|null`), 레거시 role 필드 금지
- 사업자 타입 허용: `requestor | manufacturer | internalLab | admin | salesman | devops | labTeam | salesTeam`
  - 코드 키(`salesman`, `admin`)는 유지. 한글 라벨만 층별로 나눈다.
    - BA(`BusinessAnchor.businessType`): `salesman`=**딜러사**, `admin`=**어벗츠**
    - User(`User.role`): `salesman`=**딜러**, `admin`=**관리자**
    - 제품명 **어벗츠.핏**은 랜딩·SMS·고객지원. 「관리자에게 문의」「관리자 UI」는 운영 카피로 유지.
    - SSOT: `web/frontend/src/shared/types/role.ts` (`USER_ROLE_LABEL` / `BUSINESS_TYPE_LABEL`), `web/backend/utils/roleLabels.js`
  - `internalLab`(어벗츠기공소): 어벗츠 기공소 직접 운영. 메뉴=기공의뢰(수신·어벗생산의뢰)·크레딧·정산·설정. 관리자 생성만(공개 가입 없음).
    - 동일 법인 BN을 `businessType`별로 공유 가능(`businessNumberNormalized`+`businessType` 복합 unique). 하위조직은 `parentBusinessAnchorId` → 예: admin「어벗츠 주식회사」←「기공사업부」.
  - `labTeam`(기공팀)·`salesTeam`(영업팀): 내부 직원. `/signup/staff`에서 가입. 사업영역 수익 분배 주체. `salesTeam`은 딜러와 별개.
  - `practice` role은 제거. 기존 계정은 `requestor`+`requestorCapabilities.practice` 마이그레이션 대상(신규 생성 금지). 백필: `scripts/db/backfill-requestor-capabilities.js --apply`.


### 2.2 의뢰 생성/공정

- 신규 의뢰 표준: `POST /api/requests/from-draft`
- 공정 SSOT: `Request.manufacturerStage`
  - `준비 → CAM → 가공 → 세척.패킹 → 포장.발송 → 추적관리`
- 크레딧 이벤트 발생 시점 SSOT:
  - `REQUEST_SPEND_HOLD` / `SHIPPING_SPEND_HOLD`: **의뢰 제출** 시 에스크로 보류(기공비·신속·배송비).
    치과 어벗디자인·기공소 어벗생산 배송비는 **의뢰 사업자 + 예정 출고일** 1회(치과명으로 쪼개지 않음).
    PTX(구강스캔) CA 배송비는 주문 기공소 크레딧(제조사→기공소). 동일 제출 배치에서도 1회.
  - `REQUEST_SPEND_COMMIT`: **CAM 승인(가공 진입)** 시 보류→매출 전환(레거시 무보류만 실차감)
  - `SHIPPING_SPEND_COMMIT`: **집하(우편함 비우기)** 시 배송 보류→매출 전환(레거시·PTX abuts는 기존 SSOT)
  - `REQUEST` 차감 삭제: **가공 롤백(CAM 복귀)** 시 대응 COMMIT 이벤트/라인 **물리 삭제**(HOLD는 유지)
  - `SHIPPING` 차감 삭제: **포장.발송 롤백(세척.패킹 복귀)** 시 대응 COMMIT 이벤트/라인 **물리 삭제**
  - 준비 단계 **취소**: 미전환 HOLD 전부 해제(물리 삭제)
  - BG 콜백은 파일 처리 결과 동기화 이벤트이며 승인/롤백 트랜지션이 아니므로,
    BG 콜백에서 크레딧/정산 장부 갱신을 수행하지 않음
- 샘플 정책(강제): `requestCategory in (rnd_sample, copied_sample)`는 크레딧/정산 무관 작업
  - 샘플은 장부에 **무기록(무자료/무상)** 처리
  - 작업용 샘플(`rnd.doneAt=null`)은 일반 의뢰와 동일하게 직경 요약·우편함 배정·포장.발송·추적관리까지 진행한다.
  - 포장.발송 우편함 상세에서 **샘플만 삭제**할 수 있다(일반 의뢰는 삭제 불가).
  - R&D 보관 샘플(`rnd.doneAt!=null`)만 R&D 탭 전용으로 분리한다.
- 제조사 직접 NC 가공 정책(강제): `requestId`/`request._id` 등 의뢰 식별 메타가 없는 수동 NC 작업은
  크레딧/정산 대상이 아니며 장부에 **무기록(무자료/무상)** 처리
- 불완전가공(RnD unmachinable) 정책(강제):
  - 불완전가공은 샘플이 아니며, CAM 승인으로 이미 발생한 크레딧 차감은 유지한다.
  - 불완전가공 판정으로 CAM 복귀가 발생해도 장부 삭제/환불을 수행하지 않는다.
  - 준비 단계 취소만 차감 미발생 상태로 처리한다.

### 2.3 크레딧/정산

- **부가세(VAT) / 면세 정책(강제) — 겸영(과세+면세) 이중 체계:**
  - **어벗츠는 겸영사업자**다. 면세 매출(기공·커스텀어벗·크레딧)과 과세 매출(스토어 기성품·딜러/개발운영 지급)을 분리한다.
  - **면세(치과–기공소–제조사–어벗츠 · 커스텀어벗·크레딧)**: 크레딧 충전·소비·기공정산·치과↔기공소 기공의뢰·어벗츠 잔여·제조사 하청·커스텀어벗 기공품. `vatAmount = 0`. 증빙은 **계산서**(세금계산서 아님). 이 경로의 고객/약관 가격 안내에 "VAT 별도·부가세 포함·VAT 10%" 금지(배송비 별도 안내는 유지).
  - **과세(스토어 기성품 · 어벗츠↔딜러사 · 어벗츠↔개발운영사)**:
    - **스토어(치과 공급 기성품)**: 부가세 **10%**. 고객 표시는 **부가세 포함가**. 증빙은 **세금계산서**. 커스텀어벗 기공품과 동일 장바구니/동일 (세금)계산서에 합치지 않는다.
    - **딜러사·개발운영사 지급**: 지급 시 부가세 **10%**. 어벗츠가 수취하는 **세금계산서**.
  - **(세금)계산서 마이너스 발행**: 팝빌 전송 성공 후 상계는 원본 `SENT`를 유지하고, 음수 금액의 `kind=REVERSE` draft를 **별도 문서**로 발행한다. 원본을 `CANCELLED`로 강등하거나 목록에서 지우지 않는다. `CANCELLED`는 미발행 초안 폐기에만 쓴다.
  - 크레딧은 선불전자지급수단(선불페이)이 아니라 **기공물 구매용 기공료 선입금(선납 대금)**이다. 충전 화면·FAQ·약관·입금 확인 메시지에 `크레딧(기공료 선입금)`을 명시한다.
  - 크레딧 충전: `vatAmount = 0`, `amountTotal = supplyAmount`(공급가 = 입금/결제 금액).
  - 의뢰자 소비·비제조사 `REV_*` 라인·제조사 `REV_MANUFACTURER`: 공급가 기준, `vatAmount = 0`.
  - 딜러사·개발운영사 수수료/잔여 장부는 공급가(`vatAmount = 0`). **지급 시** 부가세 10%를 더해 **입금·세금계산서**에 반영한다(`SETTLEMENT_PAYOUT`: `amountExcludingVat`=공급가 잔액 차감, `vatAmount`=부가세, `amountIncludingVat`=실입금).
  - 보존식·의뢰자 잔액 집계는 `amountExcludingVat`(없으면 `amount`) = 공급가. 딜러사·개발운영사 지급 VAT는 어벗츠 추가 지급분(의뢰자 크레딧에서 차감하지 않음).
  - 장부: 과세 스토어 매출 이벤트/계정은 `STORE_SALE` / `REV_STORE_TAXABLE`. 결제 확정(입금 매칭·관리자 승인) 시 저널 기록. 면세 기공·크레딧 장부와 분리 집계.
- **어벗츠 사업 다각화 SSOT:**
  1. **커스텀 어벗 생산·공급** — 기공소 디자인 → 애크로덴트 생산 → 치과 납품(하청 정산).
  2. **자동매칭 수수료** — 기공비의 `platformFeeRate`(기본 10%). 관리자 플랫폼 설정.
  3. **기공소 직접 운영** — 치과 의뢰를 어벗츠가 직접 처리·기공료 수취. Role SSOT: `internalLab`(어벗츠기공소).
  - 가격 안내 UI(`PricingPolicyDialog`)는 커스텀 어벗 단가·출고 정책 안내용이며, 사업 축 정의와 혼용하지 않는다.
  - 관리자 정산 UI: `AdminPaymentsPage` 상단 3사업 축(선택형) · 집계 `GET /api/admin/credits/settlement-business-overview`. 분배 설정 UI: 관리자「사업영역」(`/dashboard/partners`, 기공·어벗·플랫폼).
- **매칭 과금 SSOT(강제):**
  - 한 줄: **기공소 월 참여 수수료 0원. 치과 멤버십 월 과금 없음.**
  - 기공소(`lab`): 자동 매칭 **월 참여 수수료(`autoMatchMonthlyFee`)는 0원 고정(정책)**. 참여 ON/OFF만 운영. 과금은 자동 매칭 **성공 수수료(`platformFeeRate`%)만** — 작업완료 정산(에스크로 해제) 시 기공비에서 공제. 지정 의뢰는 `directPlatformFeeEnabled` **기본 off=무료**(별도 공지 시까지); on 시 `directPlatformFeeRate%`.
  - 치과(`practice`): 커스텀어벗은 플랫폼 고시 단가(**단일가**, `membership*` 키)만. 월 구독·가입 90일 1만원·멤버십/일반 청구 분기 없음.
  - 유료 크레딧 사용처: 기공물·어벗 주문 대금. 기공소 매칭 월정·플랫폼 SaaS 과금에는 쓰지 않는다.
  - 설정: 단가·신속비=`AdminCreditSettingsTab` / `PATCH /api/admin/settings/credits`. 매칭 성공율·지정 수수료 on/off·월정(0)=`DevopsPlatformFeeTab` / `PATCH /api/admin/settings/platform-fees`.
- 단일 SSOT 장부: `LedgerJournal` + `LedgerLine`(논리적으로 하나의 General Ledger)
- 기존 분리 원장(`CreditLedger`, `ManufacturerCreditLedger`, `SalesmanLedger`, `AdminCreditLedger`)은
  **레거시로 간주하며 단계적 이관 후 삭제**한다. 이관 중 이중기록(dual-write) 금지.
- 필수 이벤트 타입 SSOT(저장형):
  - `REQUEST_SPEND_HOLD`, `REQUEST_SPEND_COMMIT`, `SHIPPING_SPEND_HOLD`, `SHIPPING_SPEND_COMMIT`
  - `PRACTICE_MEMBERSHIP_SPEND`(레거시 치과 멤버십 월 구독. 신규 과금 없음)
  - `CHARGE_PAID`, `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`, `ADJUST`, `SETTLEMENT_PAYOUT`, `STORE_SALE`
- 수익 계정 SSOT:
  - `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - **제조사(하청)**: % 분배 금지. **어벗 1개당** 고정 공급가(면세) — `creditSettings.manufacturerRequestUnitPrice`(기본 9,000)·`manufacturerShippingUnitPrice`(기본 3,500, 박스당). 고객의 유료·무료 크레딧을 구분하지 않고 **모든 의뢰·배송에 약정 단가를 지급**. 매달 말일 일괄 지급 전까지는 미정산 잔액으로 적립.
  - **어벗 생산 분배**: 판매가(배송비 제외)에서 건당 제조사 9,000(면세) · 개발운영사 1,000 · 딜러사 3,000을 공급가로 떼고, 개발운영사·딜러사 지급 시 부가세 10%. 잔여 → 어벗츠(면세). 딜러사 없으면 딜러사 몫은 어벗츠. 특별주문가는 주체별 배분액. 설정 UI: 관리자「사업영역」어벗사업. 제조사 박스당 배송 지급은 장부 출고 룰이며 사업영역 분배 UI에는 기재하지 않음.
  - **배송 분배**: 사업영역 분배 재원에서 제외. 매출에서 배송비를 먼저 차감한 나머지만 분배. 제조사 배송 공급가(면세)·고객 배송비 잔여는 출고 장부 흐름.
  - **플랫폼 분배**: 기공소 자동매칭 수수료·지정 수수료(현재 무료)를 어벗츠 90% / 개발운영사 10%(비율 수정 가능). 개발운영사 지급 시 부가세.
  - **기공(어벗츠기공소) 분배**: 내부기공소(기공사업부)에 배당된 건만, 배송비를 공통 지출로 먼저 차감한 뒤 나머지를 주체(role) 비율 → 주체 내 팀원 비율로 배분. 초기 주체 기공팀·영업팀·개발운영사. 설정 UI: 관리자「사업영역」기공사업.
  - 동일 의뢰 `machining_spend`+`express_surcharge`: 제조사 고정단가는 **어벗 개수×1회**만. express는 잔여 분배에만 포함.
  - paid/free/settlement 혼합 소비는 의뢰자 잔액에서 **무료 → 기공(settlement 상계) → 유료** 순으로 차감
  - 수익 라인(`REV_*`)의 paid/free 표시는 role 순서가 아니라 소비된 paid/free 총량을 role base에 비례 배분(무편향)해 기록
  - 딜러사·개발운영사·어벗츠의 무료 수익은 지급 0원으로 정산완료 상태만 표시 가능. **제조사는 예외**(유료·무료 모두 약정 단가 지급, 말일 일괄).
- 커스텀 어벗 의뢰 단가 SSOT: 관리자「플랫폼 설정 · 커스텀어벗」`creditSettings.membershipProductionPrice`(기본 **15,000원**). **신규 Request는 항상 생산만**(`custom_abutment`). `design_custom_abutment`·`membershipDesignAndProductionPrice`(옛 2.5만)는 **레거시 읽기 전용**(신규 쓰기·청구 분기 없음). 기공의뢰 CA 디자인은 수주 기공소·`labFeeSchedule` 커스텀어벗 수가. 신속=`expressFee`(기본 **+2,000원**). 기공소 어벗생산의뢰는 `labProductionPrice` 오버레이. **치과 멤버십/일반 청구 이중가 없음**. `regular*`·관리자「멤버/일반」은 **딜러 유무 분배**용. 가입 90일 1만원·치과 멤버십 월정 없음.
- 롤백 원칙:
  - 롤백은 REFUND 추가가 아니라 원본 커밋 이벤트 및 대응 라인의 **물리 삭제**
- 조회/표시 타입 원칙:
  - 충전은 `CHARGE_PAID` / `CHARGE_FREE_REQUEST` / `CHARGE_FREE_SHIPPING`으로 분리 표기 (`CHARGE` 단일표시 금지)
  - 소비는 `SPEND_PAID` / `SPEND_FREE_REQUEST` / `SPEND_FREE_SHIPPING`으로 분리 표기 (`SPEND` 단일표시 금지)
- 정산 보존식 SSOT(의뢰 단위):
  - `의뢰자 순소비(현존 COMMIT 이벤트 기준)` = `어벗츠/제조사/개발운영사/딜러사` **공급가** 합(`amountExcludingVat`)
  - 합계 비교는 공급가(`amountExcludingVat`) 우선 (`null`이면 `amount`)
- 제조사/역할 정산 건수 SSOT(강제):
  - 일별·기간 정산의 의뢰/배송 **건수**는 `LedgerLine` 개수가 아니라 `(eventType, creditKind, refId)` 유니크다.
  - 동일 의뢰의 `machining_spend` + `express_surcharge`(각각 `REQUEST_SPEND_COMMIT`)는 제조사 단가=어벗 개수·건수 의뢰 1건.
  - paid/free 혼합으로 `REV_*` 라인이 쪼개져도 같은 `creditKind`·`refId`는 1건이다.
  - 구현: `controllers/manufacturers/manufacturer.controller.js` (`buildManufacturerEarnCollapseAndGroupStages`)
- 정산 지급 가능 잔액 집계 원칙:
  - `SETTLEMENT_PAYOUT`은 포함
  - **제조사**: 공급가(`amountExcludingVat`) 기준, 면세 계산서. 고객 유료·무료와 무관하게 `EARN/ADJUST` 전액이 지급 대상. 매달 말일 일괄 지급 전까지 미정산 잔액.
  - **어벗츠·기공소**: 공급가(`amountExcludingVat`) 기준, 면세 계산서. `EARN/ADJUST`는 `creditKind=PAID|null`만 포함 (무료 제외)
  - **딜러사·개발운영사**: 장부 적립은 공급가. 지급 시 부가세 10%를 더해 **입금·세금계산서** 수취
  - 딜러사·개발운영사·어벗츠의 무료(`FREE_REQUEST|FREE_SHIPPING`) 수익은 지급 대상에서 제외(표시·확인용만). 제조사는 포함.
- CreditLedger → GL 이관 보정 원칙:
  - 레거시 `CreditLedger`를 원본으로 이관하되, 정책 위반/무효 행(예: 0원 SPEND, 참조 누락된 상쇄형 SHIPPING SPEND/REFUND 쌍)은 장부 반영 대신 무시 처리
  - 샘플(`rnd_sample|copied_sample`) 및 비의뢰 수동 NC 작업은 장부 무기록 원칙 유지
- 잔액 조회 SSOT:
  - `GET /api/credits/balance` 및 잔액 파생 조회는 `LedgerLine` 직접 집계값을 사용
  - `BusinessCreditBalance`는 레거시 스냅샷으로 취급하며 런타임 잔액 판정/표시에 사용하지 않음
- 가입 환영 무료 크레딧(강제):
  - 의뢰자·기공소(`requestorKind=lab`) `BusinessAnchor` **신규 생성(실 사업자등록번호)** 또는 **synthetic(`practice-*`)→실BN 검증 승격** 시에 `defaultRequestFreeCredit`(기본 30,000원)을 사업자번호당 **무료크레딧 1회** 지급
  - 의뢰자·치과(`requestorKind=practice`)는 지급 대상에서 제외
  - 구현: `business.update.controller.js` 생성 분기·synthetic 승격 분기 → `business.freeCredit.util.js` (`grantWelcomeFreeCreditIfEligible`)
  - 무BN synthetic 앵커 생성만으로는 지급하지 않음. 일반 사업자 정보 수정·재로그인·설정 저장 경로에서는 지급 호출 금지
  - 사업자등록번호당 `FreeCreditGrant`(`REQUEST_FREE_CREDIT`, legacy `WELCOME_BONUS`/`SHIPPING_FREE_CREDIT`/`FREE_SHIPPING_CREDIT` 포함)로 중복 지급 차단. GL은 `CHARGE_FREE_REQUEST`로만 기록
  - 레거시 `defaultShippingFreeCredit` 설정 필드는 0 고정(분리 환영 지급 폐기). 관리자 수동 배송 무료크레딧 override 경로는 별도 유지 가능
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

### 2.4 의뢰자 유형(발신/수신) · 가입/온보딩 · 기공의뢰서 전송

- 가입 role SSOT: **requestor** | **salesman**만. `practice` role은 **제거**(신규 생성·공개 가입·드롭존 가입·관리자 생성 모두 금지). 기존 `practice` 계정은 `requestor`+`requestorKind=practice`(의뢰 발신자)로 마이그레이션. 관리자 UI의 별도 치과 role 필터도 제거.
- **네이밍 SSOT**: 발신(치과) 유형 식별자는 `practice`다. 예전 `clinic`과 동일 의미 — 코드/스키마에서 `clinic`이 발견되면 `practice`로 바꾼다.
  - `requestorCapabilities.practice` (레거시 키 `clinic`은 normalize·백필에서만 호환)
  - `clinicName`/`clinicPhone` 등 **연락처 필드**는 별도(점진 개명). filename-rule·묶음배송·Clinic CRUD 엔티티의 `clinic`은 해당 도메인 유지.
- 드롭존(치과 전용 공개 전송):
  - 가입·로그인도 `requestor`로 통일
  - `requestorCapabilities`는 **practice만** 체크(`{ practice: true, lab: false }`) — 수신(lab) 선택 UI/저장 없음
  - 최소 가입: 이메일(+인증) + 비밀번호 + 담당자 휴대폰(+인증). `practiceProfile`/Org 앵커는 만들지 않음
  - 가입 직후 **첫 PracticeTransfer**까지 드롭존에서 전송 가능(성공 후 대시보드로 보내지 않음)
  - 게이트: **성공한 첫 전송 이후** 추가 의뢰 작성·대시보드 진입 시 온보딩 유도(`onboardingWizardCompleted` 미완료). 로그인 세션(~3년)과 무관
  - 온보딩에서 `practiceProfile` 완료 시 **BusinessAnchor를 생성**한다(첫 가입자=`owner`). 사업자등록번호가 없으면 synthetic `practice-*` BN. 이후 설정에서 lab을 추가·검증하면 **동일 앵커**에 실BN·license를 올린다.
- 유형 SSOT(체크박스 OR, 최소 1개): `requestorCapabilities = { practice: boolean, lab: boolean }`
  - Org SSOT: `BusinessAnchor` (`businessType: "requestor"`). practice/lab은 같은 조직의 캡일 뿐이며 “무앵커 발신 전용 조직” 경로는 없다.
  - 캡 SSOT: `BusinessAnchor.requestorCapabilities` (User 필드는 미링크·온보딩 중 미러)
  - 해석 우선순위: 앵커 → 유저 → 레거시 폴백(미기입 requestor·구 practice role 데이터 → practice / verified requestor → lab). 폴백은 마이그레이션 전까지만.
- UI 라벨 SSOT(`REQUESTOR_CAPABILITY_LABEL` / `REQUESTOR_CAPABILITY_OPTIONS`):
  - `practice`: **의뢰 발신자 (치과)** — 생산의뢰, 사업자등록증 필수
  - `lab`: **의뢰 수신자 (기공소와 기공실)** — 생산의뢰, 사업자등록증 필수
- `requestorServices`는 **paid-only**. `free`(기공의뢰서) 옵션은 폐기. 읽기 시 레거시 `free`는 `paid`로 승격, 쓰기는 `{free:false,paid:true}`.
- 가입·온보딩 흐름:
  1. `/signup` → 계정(이메일·비번) → 로그인. 드롭존 → 계정(이메일·비번·담당자 휴대폰 인증) → **첫 기공의뢰 전송**
  2. `/dashboard/wizard` 온보딩: 프로필 → 휴대전화(드롭존에서 이미 인증되면 스킵) → 역할(owner/staff) → 사업자
  3. 사업자 단계에서 `RequestorCapabilitiesPicker`로 practice/lab 선택(드롭존 가입자는 practice 고정). 서비스 체크 UI 없음(paid 고정)
  4. 역할 선택 시 사업자등록증 등록·검증 필수
  5. 온보딩 완료 후 → `/dashboard` (생산의뢰는 `paid` + 사업자 검증)
- 접근성 게이트:
  - **생산의뢰**: `requestorServices.paid`(레거시 free는 paid 승격) AND `BusinessAnchor.status === "verified"`
  - 미검증이면 설정 > 사업자에서 사업자등록증 검증 필요
- 기공의뢰서(PracticeTransfer) 권한:
  - **발신**: `requestor` + `practice` (의뢰 발신자)
  - **수신**: `requestor` + `lab` (의뢰 수신자)
  - 제출은 Request 생성 경유 금지. 저장 SSOT: `PracticeTransfer`
- 환봉방식 커스텀어벗: 치과 프리셋 편집 제조사 선택 마지막「제조사 추가 요청」→ 제조사·브랜드·패밀리 입력, 타입 `헥스(사이즈 미정)` 고정. 요청 시 관리자 문의 자동 접수 + 프리셋 일단 저장. 관리자 플랫폼 설정에서 도입 체크 시 해당 치과 프리셋 정식 채택(되돌리기 가능). 가격 안내는 별도 고지. 프리셋 편집 패밀리 선택은 Regular / Mini / Narrow / Small Narrow +「패밀리 추가」. 기공의뢰 기공비 툴팁 컬럼 순서: 기공소 기공물 / 기공소 어벗 / 어벗츠 어벗. **PTX CA(환봉 요청중·도입·CNC) 치과 청구는 기공소 `커스텀어벗` 수가.** 어벗츠 플랫폼 단가(생산 1.5만·디자인+생산 2.5만)는 **기공소→어벗츠 Request**.
- SSOT API:
  - 생성: `POST /api/practice/transfers`
  - 조회(발신): `GET /api/practice/transfers/my`
  - 조회(수신): `GET /api/practice/transfers/received`
  - 취소: `POST /api/practice/transfers/cancel-batch`
  - **커스텀어벗 Abuts-first**: 수락 시 스캔 기반 Request 생성 → **수락 기공소가 디자인** → design-handoff 업로드 시 제조 자동 착수. 치과→기공소=`labFeeSchedule` 커스텀어벗 수가(기공비 정산). 기공소→어벗츠=생산비(플랫폼 1.5만, Request 과금). 레거시(치과 어벗츠 단가 선납)만 `abutmentDesignLabFee` 외주 지급. **생산 후 주문 기공소 수취**(치과 직납 아님). 제조사 출고 목표=`치과도착일 − 2영업일`(`resolveManufacturerTargetShipYmd`). 기공소 `mark-complete`는 크라운 업로드만(배송선택 없음). 어벗생산의뢰(직접 Request) 디자인 파트너 큐와 분리.
- 제조사 워크시트 조회에서 practice 전송 태그 의뢰 제외
- 크레딧/정산은 유료(검증된 수신자·lab) 경로에만 해당. 실 사업자등록번호가 없는 synthetic 앵커에는 환영 크레딧을 지급하지 않으며, synthetic→실BN 검증 승격 시 1회 지급
- 소개(리퍼럴) 페이지·링크: 발신(practice) 포함 모든 requestor가 접근 가능. 소개 귀속(`referredByAnchorId`)·그룹 할인 적용은 추천인 사업자 앵커 기준. lab 체크·검증되면 유료 소개 혜택 경로로 이어짐
- 공통 헬퍼/권한: `web/backend/utils/requestorCapabilities.js`, `web/frontend/src/shared/business/requestorCapabilities.ts`, `practiceTransferAuth.middleware.js`, `web/backend/controllers/businesses/requestorOrgAnchor.util.js`
- 레거시 혼입 경로(예: `/api/requests/practice/*`)는 제거 대상으로 관리
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
- 우편함 배정 시점: 가공→세척.패킹 진입. 같은 수신자면 집하 전까지 한 칸에 모음(1회 택배비). 포장.발송은 기존 배정 유지. 포장.발송↔세척.패킹·세척.패킹→가공 롤백도 우편함 유지(패킹 라벨 SSOT). 가공→준비 롤백에서만 해제.
- 합류 키: 수신자 BusinessAnchor. PTX CA도 주문 기공소 BA. 신속/묶음은 같은 수신자면 같이 묶음.
- 배송비 과금 시점: 집하(우편함 비우기) 1회. 운송장 라벨에는 건수를 출력하지 않음(웹앱에서 확인).
- 신속 배송 추가 의뢰크레딧: `creditSettings.expressFee`(기본 **2,000원**), **가공 진입(CAM 승인) 시 별도 `express_surcharge` 저널로 차감**
  - 설정 UI: 관리자 플랫폼 설정「크레딧」(배송) / 「커스텀어벗」(단가) — `AdminCreditSettingsTab` / `PATCH /api/admin/settings/credits` (`admin`|`devops`)
  - 약속 출고일 자정까지 당일 집하 실패(또는 신속→묶음 전환) 시 신속 추가비만 물리 삭제 취소
    (`shippingOnTimeEvalWorker` / `cancelExpressSurchargeIfShipDelayed`). 16시 이후 당일 수동 집하는 정시.
  - 의뢰자 대시보드: `PATCH /api/requests/my/shipping-mode` (준비 단계만)
  - 견적/표시 금액 SSOT: 신속 지정 시점부터 `price.amount`에 추가비를 합산하고 `price.expressFee`에 기록 (`expressPrice.utils.js` `resolveQuotedPriceWithExpressFee`)
    - 적용 경로: 생성(`from-draft`/`createRequest`), 준비 단계 모드 전환, 대시보드/상세 응답 정규화
    - 실제 크레딧 차감 시점(CAM)과 표시 금액 반영 시점을 혼동하지 말 것
- 디자인+가공 과금: `productMode === "design_custom_abutment"`일 때만 적용
  - **1 STL에 여러 어벗** 가능. 공식: `(가공 단가 + 디자인비) × 어벗 수`
  - 단가: 치과 청구 SSOT=`creditSettings.membershipProductionPrice`(기본 **15,000**) / `membershipDesignAndProductionPrice`(기본 **25,000**). `designFee`는 디자인+생산 − 생산만과 동기화(기본 **10,000원 / 1어벗**). 기공의뢰(PTX) CA 치과 청구는 기공소 수가. 기공소→어벗츠 생산비는 플랫폼 고시. 레거시 선납 건만 `abutmentDesignLabFee` 외주 지급. 배송비 별도·박스당 과금. 신속=`expressFee`(기본 **+2,000**). **청구는 고시 단일가**(치과 멤버십/일반·`pricingTier` 분기 없음). CNC 관리자「멤버/일반」·`regular*`는 딜러 유무 분배용이며 치과 구독·청구와 무관.
  - 어벗 수: `caseInfos.toothWorks` 유효 행(없으면 `tooth` 파싱, 최소 1) — `countDesignAbutmentQty`
  - 설정 UI: 동일 `AdminCreditSettingsTab`(`variant=customAbut`) / `PATCH /api/admin/settings/credits`
  - 견적/표시: `designPrice.utils.js` `resolveQuotedPriceWithDesignFee`
    - `price.amount` = `(가공단가 + designFee) × qty`, `price.designFee` = 디자인 총액, `price.abutmentQty` = qty
  - 적용 순서: 디자인+가공 배수 → 신속비(건당, 배수 없음). 무상/0원 견적에는 미적용
  - 차감: CAM `machining_spend` = `(가공단가 + 디자인비) × qty` (신속비와 분리)
  - UI: `PricingPolicyDialog`, 의뢰 상세 비용 세부. 신규의뢰 우측·의뢰카드는 금액 미표시(`+디자인` 뱃지만)
  - 상세: `.cursor/rules/design-fee.mdc`
- 추적관리 진입 기준: 집하완료(statusCode 11 / picked_up)
- 한진 배송조회 운송장번호는 숫자 12자리. 수동 입력 하이픈은 조회 전 제거 (`shipping.Tracking.helpers.js`). 배송완료 전이는 statusCode 66.

### 2.8 R&D 샘플

- 의뢰 분류 SSOT: `Request.requestCategory`
  - `order | rnd_sample | copied_sample`
- 운영 통계(대시보드·매출·배지)에는 샘플 제외
- 작업용 샘플(`rnd.doneAt=null`)은 제조사 워크시트에서 정식 의뢰와 동일 취급:
  - 준비 탭 직경별 요약(6/8/10/12) 카운트 포함
  - 우편함 점유/합류·포장.발송·추적관리 포함
- R&D 보관(`rnd.doneAt!=null`)만 R&D 탭 전용

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
  - `web/frontend/src/shared/business/requestorCapabilities.ts` (의뢰자 유형·유료게이트)
  - 요약 카드(정산·크레딧): 클릭→상세 모달, 수식·설명 문단 상시 노출 금지 → `web/frontend/rules.md`, `.cursor/rules/ui-summary-cards.mdc`
- 프론트 상세 진입 파일 지도는 `web/frontend/rules.md`를 참조합니다.

### 4.2 Backend

- 루트에는 전역 진입점만 유지합니다.
  - `web/backend/bootstrap/env.js` (프로세스 `TZ=Asia/Seoul` 강제)
  - `web/backend/app.js`
  - `web/backend/server.js`
  - `web/backend/utils/distributedJobLock.js` (멀티 인스턴스 워커 락 SSOT)
  - `web/backend/utils/requestorCapabilities.js` (의뢰자 유형·기공의뢰서 권한)
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
