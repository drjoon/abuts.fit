# abuts.fit rules

이 문서는 프로젝트 전체의 **최신 단일 규칙 문서**입니다.

- 루트 `rules.md`가 **최종 기준**입니다.
- 하위 폴더의 `rules.md`는 **로컬 구현 메모**만 담아야 하며, 루트와 충돌하면 루트가 우선입니다.
- 제거하기로 한 레거시 규칙은 문서와 코드에 남겨두지 않습니다.

## 1. 기본 원칙

- 대화와 문서는 한국어를 기본으로 하고, 코드와 식별자는 영문으로 작성합니다.
- 간결하게 구현합니다. 새 추상화는 실제로 재사용되거나 복잡도를 줄일 때만 추가합니다.
- 파일이 커지면 바로 분리합니다. 컴포넌트/훅/컨트롤러는 **800줄 이하**를 유지합니다.
- 결정된 정책은 우회하지 않습니다. 임시 폴백, 이중 경로, 레거시 alias를 남기지 않습니다.

### 1.1 파일 크기 관리 (800줄 정책)

- **모든 소스 파일은 800줄을 초과하지 않도록 관리합니다.**
- 새 코드 추가 시 파일이 800줄을 초과할 것으로 예상되면 **자동으로 리팩터링**합니다.
- 리팩터링 방법:
  - **유틸리티 함수 추출**: 독립적인 헬퍼 함수를 `*.utils.ts` 또는 `*.helpers.js` 파일로 분리
  - **컴포넌트 분할**: 큰 컴포넌트를 작은 서브 컴포넌트로 분리
  - **훅 추출**: 복잡한 로직을 커스텀 훅으로 분리 (`use*.ts`)
  - **도메인 로직 분리**: 비즈니스 로직을 별도 모듈로 추출 (`*.logic.ts`, `*.service.js`)
  - **타입/상수 분리**: 타입 정의와 상수를 별도 파일로 분리 (`*.types.ts`, `*.constants.ts`)
- 분리된 파일 명명 규칙:
  - 백엔드: `원본파일명.세부기능.js` (예: `common.review.machine.js`, `common.review.helpers.js`)
  - 프론트엔드: `원본파일명세부기능.ts` (예: `requestFiltering.ts`, `requestPagination.ts`)
- 중복 코드와 레거시 코드는 리팩터링 시 제거합니다.
- 분할 후에도 각 파일의 역할이 명확해야 하며, 순환 참조를 피합니다.

## 2. 저장소와 권한 기준

### 2.1 저장소 구조

- `web/`: 프론트엔드 + 백엔드 본체
- `bg/`: 운영 중인 백그라운드 서비스
- `background/`: 레거시 참고용. **새 정책 반영 대상 아님**

### 2.2 역할

- `requestor`: 의뢰 생성/조회
- `salesman`: 영업/소개/조직 연결 관리
- `manufacturer`: 제조 공정 처리 (CA 제조사, 즉 CAM/가공을 담당하는 회사)
- `admin`: 운영/지원/관리

### 2.2.1 필드 명칭 구분

- **`implantManufacturer`**: 임플란트 브랜드 (OSSTEM, Straumann 등)
  - Request.caseInfos 내 저장
  - Connection, Preset 등에서도 `manufacturer` 필드는 임플란트 제조사를 의미
  - 프론트엔드 UI에서 "임플란트 제조사", "임플란트 브랜드" 등으로 표시
- **`caManufacturer`**: 우리 웹앱의 `manufacturer` role 사용자 (CAM/가공 담당 회사)
  - Request 문서의 최상위 필드
  - User.\_id 참조 (ObjectId)
  - 백엔드에서 `populate("caManufacturer", "name email business")` 형태로 사용
  - 프론트엔드에서 `request.caManufacturer` 또는 `req.caManufacturer`로 접근

**중요**: 기존 코드에서 `Request.manufacturer`, `populate("manufacturer")`, `request.manufacturer` 등을 발견하면 `caManufacturer`로 변경해야 합니다. 단, Connection/Preset의 `manufacturer` 필드는 임플란트 제조사이므로 변경하지 않습니다.

### 2.3 조직 규칙

- 조직 단위 데이터는 개인이 아니라 **조직 SSOT**로 관리합니다.
- 의뢰 조회 범위는 기본적으로 **내 조직 + 허용된 하위 범위** 기준입니다.
- 직계 멤버 집계는 사업자 단위로 계산합니다.
- requestor/salesman/manufacturer 등 role별 조직의 내부 식별자는 Mongo `_id` 이지만, **사업자 조직 anchor는 `organizationType + normalizedBusinessNumber`** 입니다.
- 조직 이름(`name`), 대표자명, 주소는 수정 가능하지만 **조직 anchor로 사용하지 않습니다.** 이름 변경 때문에 새 조직을 만들면 안 됩니다.
- 사업자등록번호가 없는 조직은 임시 조직일 수 있지만, 사업자등록번호가 확정되면 **기존 조직 재사용/attach** 를 우선하고 중복 새 조직 생성을 피합니다.
- **검증 완료된 사업자**의 사업자등록번호는 일반 설정 수정으로 직접 바꾸지 않습니다. 필요 시 관리자 승인 기반의 별도 사업자 전환 절차를 사용합니다.
- 도메인 용어와 핵심 식별 필드는 `organization`이 아니라 **`business`(사업자)** 를 사용합니다. 1차 전환 이후 식별 필드는 `organizationId` 대신 **`businessId`** 를 기준으로 정리합니다.
- request 문서의 사업자 귀속 필드는 `requestorOrganizationId`가 아니라 **`requestorBusinessId`** 를 기준으로 사용합니다.
- 의뢰건, 크레딧, 수수료, 리퍼럴, 주문량/통계, 배송 박스/우편함 귀속의 기본 단위는 **유저가 아니라 사업자**입니다.
- requestor 역할에서 대표/직원 구분은 권한 모델일 뿐이며, 금액/집계/추천 보상/우편함/배송비 귀속 기준을 개인 사용자로 분기하지 않습니다.
- business owner는 사업자를 생성/검증 요청하는 사용자 역할일 뿐, 사업자 생성 이후 관련 데이터의 canonical 귀속 주체는 **owner가 아니라 business 엔터티 자체**입니다.
- 개인 사용자 기준 처리가 필요한 경우는 인증/세션/알림 수신 주체처럼 **사용자 자체가 엔터티인 기능**으로 한정합니다.

## 3. SSOT와 데이터 흐름

### 3.1 서버 SSOT

- 제출 완료된 의뢰의 SSOT는 **백엔드 + MongoDB + S3**입니다.
- 프론트 설정/토글/상태 변경은 항상 백엔드 API를 통해 먼저 저장합니다.
- BG 프로그램은 프론트나 브리지 로컬 상태를 직접 신뢰하지 않고 백엔드 기준으로 동작합니다.
- requestor 크레딧과 수수료 장부의 기본 귀속 단위는 **사업자**입니다. 대표/직원 개별 사용자 잔액처럼 분산 관리하지 않습니다.
- `ChargeOrder`, `CreditLedger`, `TaxInvoiceDraft`, `ShippingPackage` 등 금전/정산/배송 귀속 모델은 1차 전환 이후 **`businessId` 기준**으로 쿼리/기록합니다.
- 배송비, 각종 사용 수수료, 환불, 보너스도 가능하면 **사업자 기준 ledger key / ref key** 로 일관되게 기록합니다.
- requestor 크레딧 변동(CHARGE, BONUS, SPEND, REFUND, ADJUST)은 가능하면 모두 `credit:balance-updated` 실시간 이벤트를 함께 발행해 헤더와 대시보드가 즉시 동기화되게 합니다.
- 크레딧 실시간 반영도 전체 페이지 refetch 대신 **헤더/관련 카드 숫자만 국소 patch**하는 것을 기본으로 합니다.
- backend/controller, frontend consumer, `bg/` 연동 코드는 1차 전환 이후 **`businessId` / `requestorBusinessId` 우선 소비**를 기본으로 합니다.
- 다만 스키마/이벤트/route param 호환 때문에 `organizationId`, `organization`, `requestorOrganizationId`가 과도기로 일부 남아 있을 수 있으며, 이 경우에도 **새 코드는 반드시 business 우선 fallback 순서**를 사용합니다.

### 3.2 New Request 예외 규칙

- 새 의뢰 작성 중에는 **로컬 스토리지 + IndexedDB**가 임시 SSOT입니다.
- 파일 드롭/선택 시 즉시 S3 업로드하지 않습니다.
- `의뢰하기`를 누른 시점에만 백엔드 Draft 생성, S3 업로드, Request 생성이 일어납니다.
- 제출 성공 후 로컬 Draft는 즉시 비웁니다.
- 서버 Draft 복원은 V3 기준에서 사용하지 않습니다.

### 3.3 파일/식별자 규칙

- `requestId`의 SSOT는 MongoDB `Request` 문서입니다.
- 표준 파일 식별은 백엔드가 관리하는 `filePath`와 메타데이터를 기준으로 합니다.
- 업로더의 로컬 파일명은 `originalName`에만 보관합니다.
- finish line은 파일이 아니라 `caseInfos.finishLine.points`로 저장합니다.
- New Request 파일 키는 `getFileKey()`를 사용하며 기준은 `${normalizeNFC(file.name)}:${file.size}` 입니다.

## 4. 의뢰/공정 규칙

### 4.1 공정 단계

- 요청 흐름의 최종 단계는 **`tracking`(추적관리)** 입니다.
- 별도의 `completed` 단계 매핑은 사용하지 않습니다.
- 요청 단계 로직의 단일 기준은 `manufacturerStage` 입니다.
- `status`, `status2`, `의뢰접수`, `가공전`, `completed` 같은 레거시 단계 참조는 제거합니다.

### 4.2 중복 의뢰 처리

- 중복 기준: 같은 치과명 + 환자명 + 치아번호, 그리고 취소되지 않은 기존 의뢰
- `replace`: 기존 의뢰가 Request/CAM 단계일 때 교체
- `remake`: 기존 의뢰가 Machining 이후일 때 하나 더 생성
- `skip`: 기존 의뢰 유지, 새 의뢰 생성 안 함

### 4.3 ETA와 배송일

- 발송 예정일 SSOT는 백엔드입니다.
- 공휴일/주말 보정은 `normalizeKoreanBusinessDay({ ymd })`로 처리합니다.
- 프론트는 날짜를 로컬에서 재계산하지 않고 백엔드 반환값만 표시합니다.
- 리드타임 기준:
  - 최대 직경 8mm 이하: +1 영업일, 최대 +2
  - 최대 직경 10mm 이상: +4 영업일, 최대 +7

### 4.4 가상 우편함

- 주소 형식: `{Shelf}{ShelfRow}{BinCol}{BinRow}`
- 선반 A~X, 행 1~4, 빈 열 A~D, 빈 행 1~4
- 총 용량은 `24 x 4 x 4 x 4 = 1536`
- **가공 완료로 세척.패킹 단계에 진입할 때** 자동 할당하며, 이미 같은 의뢰자 조직이 보유한 우편함이 있으면 재사용합니다.
- 포장.발송/배송 롤백 시 `mailboxAddress = null`로 해제합니다.
- 배송비는 세척.패킹 승인 시 선차감하지 않습니다.
- 택배 접수 성공 시 같은 박스(묶음 배송 패키지) 기준으로 배송비를 **1회만** 부과합니다.
- 택배 접수 후 **집하완료(statusCode 11) 전까지는** 의뢰를 `포장.발송`에 유지하고 우편함도 유지합니다.
- requestor 대시보드의 배송비 장부/오늘 발송 내역/최근 30일 발송 요약의 SSOT는 `ShippingPackage` 입니다.
- 배송비 크레딧 차감은 `CreditLedger.refType = SHIPPING_PACKAGE` 기준으로 관리하며, `uniqueKey = shippingPackage:{pkgId}:shipping_fee` 로 **패키지당 정확히 1회만** 기록합니다.
- 배송비 크레딧 차감 시점은 택배 예약접수 시점이 아니라 **집하완료(statusCode 11)** 시점입니다.
- requestor 가격 정책 카드의 최근 30일 집계 문구는 완료 주문 기준이 아니라 **포장.발송 기준**으로 표시합니다.
- 레거시 잘못된 배송 데이터가 남아 있을 수는 있지만, 새 데이터 처리 규칙은 항상 **패키지 기준 1회 차감 + shipDateYmd 기준 요약**을 따릅니다.
- 이 구간에서는 한진 예약취소 API로 접수 취소할 수 있어야 하며, 제품 추가/제외 후 재접수할 수 있어야 합니다.
- 포장.발송의 실제 운영 순서는 **오후 2시 운송장(라벨) 일괄 출력 → 창고 실물 대조 → 웹앱 수정 → 택배 접수** 입니다.
- 포장.발송 화면의 기본 출발점은 **`운송장 출력/저장`** 이며, 출력된 라벨을 들고 창고에서 우편함 실물과 대조한 뒤, 수정이 끝난 우편함만 **별도로 택배 접수**합니다.
- 운송장 출력은 접수와 분리된 독립 단계입니다. 첫 출력 이후 해당 우편함은 `printed` 상태가 되며, 버튼 라벨은 `운송장 재출력`으로 바뀝니다.
- `운송장 재출력`은 **이전 출력 스냅샷과 비교해 변경된 우편함만 다시 출력**하는 것이 기본입니다.
- `택배 접수`는 우편함 선택 기반이 아니라, **해당 우편함에 현재 들어 있는 전체 제품**을 대상으로 실행합니다.
- 우편함 선택 기능은 제거합니다. 선택 배경, 전체선택/전체해제, 선택 개수 요약 UI를 두지 않습니다.
- 제품을 빼고 싶으면 선택이 아니라 **우편함 롤백(전체 또는 일부)** 으로 구성 자체를 수정한 뒤 다시 출력/접수합니다.
- 창고 실물과 라벨이 맞으면 박스에 담고 라벨을 붙입니다. 맞지 않는 우편함은 박스에 담지 않고 다시 우편함으로 돌려놓은 뒤, 웹앱에서 실제 창고 기준으로 우편함 구성을 수정합니다.
- 웹앱 수정 시 중복 제품이 있으면 하나만 남기고 제거하며, 누락 제품이 있으면 **부분 롤백 후 나머지 접수** 또는 **우편함 전체를 오늘 미발송 처리 후 다음날 발송** 중 제조사 직원이 선택합니다.
- `택배 접수` 버튼은 접수 후 `택배 취소`로 토글되며, 취소 시 다시 `택배 접수` 상태로 돌아갑니다.
- `운송장 재출력` 실행 시 해당 우편함이 이미 접수된 상태라면, 백엔드가 SSOT 기준으로 **기존 접수를 취소한 뒤 재접수한 것처럼 상태를 갱신**하고 프론트에는 접수 업데이트 토스트를 노출합니다.
- 한진 API에 직접적인 update 동작이 없더라도, 시스템 동작은 **취소 후 재접수**와 동일한 백엔드 상태 전이로 정의합니다.
- 위 `printed` / `accepted` 일일 작업 상태는 **오후 4시 집하(code 11)** 가 확인되면 리셋됩니다. 이후 다음 날 작업은 다시 `운송장 출력`부터 시작합니다.
- `tracking` 단계 전환은 예약접수 시점이 아니라 **집하완료 이후 배송 추적 단계 진입이 확인된 시점**에 수행합니다.
- 운송장 출력도 제품별이 아니라 **조직(박스)별 1매**가 SSOT입니다.
- 한 우편함은 한 조직의 한 박스를 의미하며, 운송장 `address_list`/라벨/ZPL도 박스당 1행만 생성합니다.
- 운송장 라벨 비고는 `우편함번호 / 사업자명 / 제품수` 형식(예: `A1A3 / 메이븐 / 5건`)을 사용합니다.
- 운영 기준 시각은 **오후 2시 라벨 출력, 오후 4시 집하(code 11)** 입니다. `printed`는 출력 완료, `accepted`는 접수 완료, `picked_up`는 집하 완료, `completed`는 최종 배송 완료를 의미합니다.
- 분실은 별도 배송 예외 처리로 관리하고, 취소는 `canceled`, 오류는 `error` 상태로 관리하며 재시도를 허용합니다.
- 우편함 상태 테두리 색상 규칙 (프론트/백엔드 공통 기준)
  - `printed`: 검정색 점선
  - `accepted`: 파란색 점선
  - `picked_up`/`completed`: 파란색 실선
  - `error`: 빨간색 실선
  - 선택 상태 색상은 사용하지 않습니다.
  - 추가 상태 색상이 필요하면 본 문서를 우선 업데이트한 뒤 구현합니다.

## 5. Frontend 규칙

### 5.1 공통 UI

- 브라우저 기본 `alert`, `confirm`, `prompt`는 사용하지 않습니다.
- 확인 UI는 `@/features/support/components/ConfirmDialog`를 사용합니다.
- 설정 화면은 저장 버튼 없이 자동 저장합니다.
  - 입력: `blur`
  - 토글/체크: 즉시 저장
  - 성공 토스트는 기본적으로 생략하고 실패만 노출

### 5.2 레이아웃

- 페이지 루트에 `min-h-screen` 같은 강한 높이 고정을 두지 않습니다.
- 기본 패턴은 `flex flex-col h-full min-h-0` 입니다.
- 스크롤은 각 섹션 내부의 `flex-1 min-h-0 overflow-auto`로 가둡니다.

### 5.3 스타일

- 전체 UI는 중립적인 glass 톤을 유지하고, 강조는 파란색 계열만 사용합니다.
- 초록 배경 위주의 강조는 지양합니다.
- placeholder 색상은 `placeholder:text-slate-300` 기준을 사용합니다.

### 5.4 파일 업로드와 실시간

- 페이지별로 drag/drop를 직접 구현하지 말고 공용 drop zone을 우선 사용합니다.
- Socket 연결은 앱 루트에서 한 번만 초기화합니다.
- 모든 role, 모든 페이지의 실시간 반영은 **전역 공통 Socket 연결 + 백엔드 중개 `app-event`** 기준으로 통일합니다.
- UI 이벤트용 웹소켓 구독은 개별 화면에서 순간적인 socket 인스턴스에 직접 매달지 말고, **전역 구독 레지스트리**를 통해 유지합니다.
- 실시간 훅은 렌더마다 재구독하지 말고 **1회 구독 + 최신 state/ref 참조** 패턴을 사용해 구독 유실을 막습니다.
- 프론트는 소켓 이벤트 수신 시 전체 invalidate/refetch보다 **해당 데이터만 로컬 state 또는 query cache를 patch**하는 방식을 우선합니다.
- 실시간 갱신은 스켈레톤 재노출이나 전체 카드 재마운트 없이 **플리커링 최소화**를 기본 원칙으로 합니다.
- 프론트는 BG/bridge/pack/wbl 서버에 직접 붙지 않습니다.
- pack/wbl 기능은 항상 **백엔드 프록시 API**를 통해 호출합니다.
- 라벨/문서/공정 표시값처럼 **백엔드가 소유한 비즈니스 데이터**는 프론트가 임의 기본값(`|| ""`, 하드코딩 토큰, 제조사별 추정값 등)으로 보정하지 않습니다.
- 필요한 값이 비어 있으면 프론트는 조용히 채우지 말고 **에러를 노출하고 실패**해야 합니다.
- 표시 조합이 필요하면 프론트가 규칙을 새로 만들지 말고, **백엔드가 정한 필드를 그대로 사용**합니다.

### 5.5 Guide Tour

- Guide Tour 기능은 더 이상 사용하지 않습니다.
- 관련 코드와 문서는 제거합니다.

## 6. Backend 규칙

### 6.1 공통

- 백엔드는 프로젝트의 허브입니다.
- 외부 장비, BG 서비스, 프론트 간 실시간/제어 흐름은 백엔드가 중개합니다.
- overview 성 집계는 프론트 재합산이 아니라 백엔드 스냅샷을 SSOT로 사용합니다.

### 6.2 실시간

- 표준 채널은 Socket.io 기반 `app-event` 입니다.
- 백엔드 emit helper를 사용하고, 페이지별 개별 소켓 연결을 만들지 않습니다.
- BG/외부 장비/관리자 처리 결과는 각 로컬 서비스가 직접 프론트를 갱신하지 않고, **반드시 백엔드 API에 반영한 뒤 백엔드가 표준 `app-event`를 emit** 합니다.
- 실시간 이벤트 payload는 화면 전체 재조회가 아니라 **해당 엔티티/집계 일부만 국소 갱신**할 수 있도록 설계합니다.
- 크레딧, 대시보드 카운트, 카드 상태, 최근 목록 등은 가능하면 **delta 또는 최소 필드 payload**를 보내고 프론트는 해당 값만 patch 합니다.

### 6.3 크레딧

- 신규 가입 기공소에는 **가입축하 무료 크레딧 30,000원**을 1회 지급합니다.
- requestor 크레딧과 수수료 장부의 기본 귀속 단위는 **사업자**입니다. 대표/직원 개별 사용자 잔액처럼 분산 관리하지 않습니다.
- 배송비, 각종 사용 수수료, 환불, 보너스도 가능하면 **사업자 기준 ledger key / ref key** 로 일관되게 기록합니다.
- requestor 크레딧 변동(CHARGE, BONUS, SPEND, REFUND, ADJUST)은 가능하면 모두 `credit:balance-updated` 실시간 이벤트를 함께 발행해 헤더와 대시보드가 즉시 동기화되게 합니다.
- 크레딧 실시간 반영도 전체 페이지 refetch 대신 **헤더/관련 카드 숫자만 국소 patch**하는 것을 기본으로 합니다.

### 6.3.2 신규의뢰 크레딧 검증

- 신규의뢰 생성 시 **유/무료 크레딧 합계가 최소 10,000원 이상**이어야 합니다. 미만이면 신규의뢰를 차단합니다.
- 배송비 결제는 **유료 크레딧 기준**으로만 가능합니다. 무료 크레딧으로는 배송비를 결제할 수 없습니다.
- 배송비 결제 시 유료 크레딧이 부족하면 배송비 결제를 실패 처리합니다.
- 관리자는 필요 시 **배송비 무료 크레딧**을 별도로 지급할 수 있습니다. 이 경우 해당 배송비 결제는 예외 허용됩니다.
- 배송비 무료 크레딧은 `BonusGrant.type = FREE_SHIPPING_CREDIT`로 기록하며, `CreditLedger.refType = FREE_SHIPPING_CREDIT`로 관리합니다.

### 6.3.1 사업자 단위 집계 원칙

- requestor 의뢰건/매출/주문량/배송 요약/가격 정책 통계는 **로그인한 개별 사용자 기준이 아니라 해당 사업자 기준**으로 계산합니다.
- 소개 코드/소개 그룹/소개 보상은 requestor의 경우에도 **사업자 자체**를 canonical 귀속 주체로 사용합니다.
- 대표(owner)/직원(member)은 같은 사업자에 매달린 사용자일 뿐이며, 집계 키를 owner user id로 삼아 business를 우회하지 않습니다.
- 프론트 문구/카드/표/모달도 가능하면 `조직`보다 `사업자` 표현을 우선하고, 실제 집계 기준이 사업자라면 사용자 개인 기준처럼 오해될 표현을 피합니다.
- 사용자 노출 문구에서는 `리퍼럴` 대신 **`소개`** 를 사용합니다.
- 사용자 노출 문구에서는 `직계1단계` 같은 표현 대신 **`직접 소개` / `간접 소개`** 를 사용합니다.
- 직접 소개는 **내가(내 사업자가) 직접 소개한 사용자/사업자**, 간접 소개는 **내가 직접 소개한 사용자/사업자가 다시 소개한 사용자/사업자**를 뜻합니다.
- 소개 정책과 소개 관련 UI/통계는 **requestor / salesman role에만 유효한 개념**으로 취급합니다.

### 6.4 브리지/CNC 제어

#### 6.4.1 기본 원칙

- 브리지 제어는 백엔드 DB 저장이 먼저입니다.
- Frontend는 bridge에 직접 연결하지 않습니다.
- CNC 제어와 브리지 호출은 기본적으로 **1회만 시도**합니다.
- 실패 시 자동 재시도 대신 원인을 그대로 반환합니다.
- 제조사별 더미 가공 설정(`dummySettings`)의 SSOT는 백엔드 DB입니다.
- 더미 가공 스케줄 판단은 브리지가 폴링하지 않고 **백엔드 스케줄러가 DB를 읽어 수행**합니다.
- 더미 가공은 `enabled=true` 이고 현재 분에 일치하는 스케줄이 있을 때만 실행합니다.
- 스케줄 시각의 더미 가공은 성공/실패와 무관하게 **해당 분에 1회만 시도**하고 자동 재시도하지 않습니다.
- 브리지가 `mock` 모드면 실제 장비 제어 없이도 더미 가공 요청에 성공 응답을 반환해야 합니다.

#### 6.4.2 SSOT 및 데이터 흐름

**브리지 재시동 시:**

- `InitialSyncFromBackendOnce()` 실행으로 백엔드 스냅샷 조회
- `GET /cnc-machines/bridge/queue-snapshot/:machineId` 호출
- 백엔드 응답으로 메모리 큐 전체 교체
- 초기화는 1회만, 이후는 백엔드 push(`/api/bridge/queue/:machineId/replace`)로 동기화

**프론트 세팅값 저장:**

- `Machine` 모델(MongoDB)에 저장: `allowAutoMachining`, `allowJobStart`, `allowProgramDelete`, `allowRequestAssign`
- 변경 시 백엔드 DB 즉시 업데이트 → `invalidateBridgeFlagsCache(machineId)` 호출 → 웹소켓으로 프론트 통보

**플래그 캐시 무효화:**

- 브리지는 플래그를 5초간 캐시 (성능 최적화)
- 백엔드에서 플래그 변경 시 즉시 `POST /api/cnc/invalidate-flags-cache` 호출
- 브리지가 캐시 무효화 → 다음 조회 시 최신값 반영

#### 6.4.3 브리지→백엔드 통보

**메시지 전달 경로:**

- `POST /cnc-machines/bridge/machining/tick/:machineId` - 실시간 상태 (STARTED/RUNNING/ALARM/COMPLETED)
- `POST /cnc-machines/bridge/machining/start/:machineId` - 가공 시작
- `POST /cnc-machines/bridge/machining/complete/:machineId` - 가공 완료
- `POST /cnc-machines/bridge/machining/fail/:machineId` - 가공 실패

**브리지 함수:**

- `NotifyMachiningTick(job, machineId, phase, message)` - tick 전송 (경과시간 포함)
- `NotifyMachiningStarted(job, machineId)` - 시작 통보
- `NotifyMachiningCompleted(job, machineId)` - 완료 통보
- `NotifyMachiningFailed(job, machineId, error, alarms)` - 실패 통보 (알람 정보 포함)

#### 6.4.4 백엔드→프론트 웹소켓 이벤트

- `cnc-machining-tick` - 모든 상태 변경 (경과시간, phase, percent 포함)
- `cnc-machining-alarm` - 알람 발생 시 전용 이벤트 (즉시 UI 알림)
- `cnc-machining-started` - 가공 시작
- `cnc-machining-completed` - 가공 완료
- `cnc-machining-canceled` - 가공 취소
- `cnc-machine-settings-changed` - 설정 변경 (allowAutoMachining 등)

#### 6.4.5 브리지 폴링 및 상태 감지

**폴링 주기:** 3초 (`Timer` 기반 `Tick()` 함수)

**감지 항목:**

- **Busy 신호:** `TryGetMachineBusy()` - 가공 중/정지 상태
- **알람:** `TryGetMachineAlarms()` - 알람 발생 시 즉시 실패 통보
- **생산 수량:** `TryGetProductCount()` - 카운트 증가로 완료 확인

**상태별 통보:**

- **가공 중:** 1초마다 RUNNING tick 전송 (경과시간 로그 포함)
- **알람 감지:** `NotifyMachiningFailed()` + ALARM tick 전송 → 가공 즉시 중단
- **완료 감지:** `NotifyMachiningCompleted()` + COMPLETED tick 전송
- **Busy=0 감지:** 완료 후보로 판단, 생산 수량 확인

**완료 감지 조건:**

1. Busy=1을 한번이라도 봤고 (SawBusy=true)
2. 이후 Busy=0이 되고
3. 생산 수량이 이전보다 증가

**Fallback:** Busy=0 후 1분 경과 또는 시작 후 60분 경과 시 강제 완료

#### 6.4.6 파일 완료 시 자동 다음 작업

**완료 처리 흐름:**

1. 브리지가 완료 감지 → `NotifyMachiningCompleted()` 호출
2. 백엔드 `recordMachiningCompleteForBridge()` 처리
3. DB 큐에서 완료 작업 제거
4. `triggerNextAutoMachiningAfterComplete()` 자동 호출
5. 대기 중인 다음 작업을 브리지 `/api/bridge/process-file`로 전송
6. 대기 작업 없으면 `allowAutoMachining` 자동 OFF + 브리지 캐시 무효화

#### 6.4.7 안전성 보장

- ✅ 브리지는 하이링크 DLL로 CNC 장비 제어 (실제 하드웨어 연동)
- ✅ 모든 상태 변경은 백엔드(SSOT)에 즉시 통보
- ✅ 백엔드가 다음 작업 지시 권한 보유
- ✅ 알람 발생 시 즉시 중단 및 통보
- ✅ 플래그 변경 시 캐시 즉시 무효화
- ✅ 재시동 시 백엔드 스냅샷으로 초기화
- ✅ 자동 재시도 없음 (명시적 제어만 허용)

### 6.5 채팅

- 의뢰 채팅은 `Request.messages`를 사용합니다.
- 독립 채팅은 별도 ChatRoom/Chat 모델을 사용합니다.
- Requestor와 Manufacturer의 직접 채팅은 허용하지 않고 Admin이 중간 허브가 됩니다.

### 6.6 세금계산서/팝빌

- 입금 매칭 후 `TaxInvoiceDraft`를 만들고 관리자 승인 뒤 익일 배치 전송합니다.
- 팝빌 작업은 web에서 직접 처리하지 않고 큐 + 전용 워커가 처리합니다.
- 모든 큐 작업은 idempotency key를 둡니다.

### 6.7 한진 REST 인증

- 한진 REST API의 인증 SSOT는 최신 스펙 문서입니다.
- Authorization 헤더는 `HMAC-SHA256 Credential=...` 같은 AWS 스타일을 사용하지 않습니다.
- 한진 REST Authorization 형식은 반드시 `client_id={CLIENT_ID} timestamp={yyyyMMddHHmmss} signature={hex_hmac}` 를 사용합니다.
- signature 원문은 `timestamp + METHOD + queryString + secretKey` 순서이며, 결과 인코딩은 `hex` 입니다.
- `customer-check` 검증 성공(`resultCode=OK`)을 기준으로 인증 로직을 확인한 뒤 주문/취소 API를 연동합니다.
- 한진 REST 주문/취소/고객검증 경로는 문서 기준 `/parcel-delivery/v1/...` 를 우선 사용합니다.

## 7. BG 서비스 규칙

### 7.1 배치와 포트

- `PC1`: rhino(8000), esprit(8001), bridge(8002)
- `PC2`: lot(8003), pack(8004)
- `PC3`: wbl(8005)

### 7.2 공통 원칙

- BG 서비스는 재기동 시 백엔드 기준으로 필요한 입력을 복구합니다.
- 결과물은 S3 업로드 + 백엔드 등록까지 완료해야 합니다.
- 로컬 storage는 작업용 캐시이며, 15일 TTL purge를 유지합니다.

### 7.3 Rhino / Esprit / Bridge / Lot

- Rhino: `1-stl` 입력, `2-filled` 출력
- Esprit: `2-filled` 입력, `3-nc` 출력
- Bridge: `3-nc` 또는 `3-direct` 기준으로 CNC 업로드/가공 진행
- Lot: 캡처 결과를 S3 + 백엔드에 등록

### 7.4 Esprit 안전 규칙

- 백엔드가 준 PRC 파일명이 비어 있거나 찾을 수 없으면 **폴백 없이 실패**합니다.
- 잘못된 PRC로 가공하는 것보다 안전하게 중단하는 것이 우선입니다.
- Esprit는 재기동 시 `pending-nc` 백로그를 자동 복구하지 않고, 승인된 단일 작업만 처리합니다.

### 7.5 CAM 직경 호환성

- CAM 단계에서 STL 최대 직경과 장비 소재 직경 그룹의 호환성을 검사합니다.
- 호환되지 않으면 카드에 경고를 띄우고 CAM을 중단합니다.
- Esprit에는 장비에 실제 세팅된 소재 직경값을 그대로 전달합니다.

## 8. 용어 통일

- `Manufacturer / Brand / Family / Type` 용어를 사용합니다.
- 현재 canonical 필드에서 `system`은 Brand, `family`는 Family 의미로 취급합니다.
- Family를 다시 System이라고 부르는 문구는 만들지 않습니다.

## 9. BG 서비스 배포 및 STL 메타데이터 처리

### 9.1 배포 구조

- **개발 환경**: macOS (Windsurf IDE)
- **운영 환경**: 원격 Windows PC (3대)
  - PC1: rhino-server, esprit-addin, bridge-server
  - PC2: lot-server, pack-server
  - PC3: wbls-server

### 9.2 STL 메타데이터 처리 흐름

**초기 처리 (CAM 파일 생성 시)**:

```
rhino-server (Python)
  ↓
1) Finish line 계산 (Python 코드)
  ↓
2) subprocess로 Node.js 호출 (stl-metadata/index.js)
  ↓
3) Node.js에서 메타데이터 계산
   - maxDiameter (최대 직경)
   - connectionDiameter (커넥션 직경)
   - totalLength (전체 길이)
   - taperAngle (테이퍼 각도)
   - tiltAxisVector (경사축 벡터)
   - frontPoint (프론트 포인트)
  ↓
4) 백엔드에 등록
   - /bg/register-file (CAM 파일)
   - /bg/register-finish-line (finish line)
   - /bg/register-stl-metadata (메타데이터)
```

**재계산 (프론트 "메타데이터 재계산" 버튼)**:

```
프론트: POST /bg/recalculate-stl-metadata/{requestId}
  ↓
백엔드: rhino-server에 재계산 요청
  ↓
rhino-server (Python)
  ↓
1) 백엔드에서 CAM 파일 경로 및 finish line 조회
  ↓
2) subprocess로 Node.js 호출
  ↓
3) 메타데이터 계산
  ↓
4) 백엔드에 등록 (/bg/register-stl-metadata)
```

**구현 규칙**:

- **Finish line은 메타데이터 계산에 필수입니다.** finish line이 없으면 메타데이터 계산을 실행하지 않습니다.
- finish line이 있을 때만 다음 메타데이터를 계산합니다:
  - maxDiameter, connectionDiameter, totalLength (기본)
  - taperAngle, tiltAxisVector, frontPoint (finish line 기반)
- 재계산 API 호출 시 finish line이 없으면 400 에러를 반환합니다.
- 초기 처리 시 finish line이 없으면 메타데이터 계산을 건너뜁니다.

## 10. 운영 메모

- 하위 `rules.md`는 루트 규칙을 반복 작성하지 않습니다.
- 구현 세부, 트러블슈팅, 서비스별 로컬 설정만 남깁니다.
- 운영 문서(`README`, 운영 가이드, 장비 사용 문서)는 규칙 문서가 아니며, 실제 동작 기준은 코드와 루트 `rules.md`입니다.
- 과거 요약 문서(`*_SUMMARY.md`, 임시 작업 메모)는 규칙 문서가 아닙니다. 루트 정책과 충돌하면 폐기하거나 보관 폴더로 이동합니다.
