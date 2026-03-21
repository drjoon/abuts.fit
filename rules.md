# abuts.fit rules

이 문서는 프로젝트 전체의 **최신 단일 규칙 문서**입니다.

- 루트 `rules.md`가 **최종 기준**입니다.
- 하위 폴더의 `rules.md`는 **로컬 구현 메모**만 담아야 하며, 루트와 충돌하면 루트가 우선입니다.
- 제거하기로 한 레거시 규칙은 문서와 코드에 남겨두지 않습니다.

## 1. 기본 원칙

- 대화와 문서는 한국어를 기본으로 하고, 코드와 식별자는 영문으로 작성합니다.
- 간결하게 구현합니다. 새 추상화는 실제로 재사용되거나 복잡도를 줄일 때만 추가합니다.
- 기존 코드가 이미 잘 만들어져 있으면 **새 파일/새 컴포넌트/새 훅을 만들기보다 공통으로 재사용할 수 있게 개조하는 방향을 우선 검토합니다.**
- 새 파일/새 컴포넌트/새 훅 생성이 필요해 보이더라도, 기존 구조를 재사용하기 어렵다면 **먼저 사용자 승인**을 받습니다.
- 파일이 커지면 바로 분리합니다. 컴포넌트/훅/컨트롤러는 **800줄 이하**를 유지합니다.
- 결정된 정책은 우회하지 않습니다. 임시 폴백, 이중 경로, 레거시 alias를 남기지 않습니다.
- SSOT로 관리하는 값은 **읽을 때 계산하지 않고**, 오직 해당 값을 바꾸는 **이벤트가 발생한 시점에만 write** 합니다.
  - 예: `소개 사업자 수`는 읽기 시 재계산하지 않고, 내 사업자를 소개자로 한 가입 완료 이벤트가 발생하면 그 순간 SSOT를 업데이트합니다.
  - read 경로는 저장된 SSOT를 그대로 읽기만 하고, 집계/계산/보정 로직을 덧씌우지 않습니다.
  - 소개 관계의 canonical SSOT는 현재 **`BusinessAnchor.referredByAnchorId` 단일 필드**입니다.
    - 별도 `소개 목록` 컬렉션을 추가하고 싶다면, 기존 `BusinessAnchor.referredByAnchorId`를 대체하는 **전면 migration**이 함께 있어야 합니다.
    - 기존 필드와 새 컬렉션을 병행 저장하는 방식은 소개 관계 SSOT를 2개로 만드는 것이므로 허용하지 않습니다.
- 코드가 헷갈릴 수 있는 부분, 특히 SSOT write 트리거와 이벤트 경계가 중요한 부분에는 **상세 주석**을 꼭 남깁니다.
  - 왜 이 시점에 write하는지
  - 어떤 이벤트가 SSOT를 갱신하는지
  - read 경로에서 계산하지 않는 이유가 무엇인지
    를 읽는 사람이 바로 이해할 수 있게 적습니다.

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
- `salesman`: 영업/소개/사업자 연결 관리
- `devops`: 플랫폼 개발/운영(메이븐 주식회사, 단독 사업자 기본값)
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

### 2.3 사업자 규칙

- 사업자 단위 데이터는 개인이 아니라 **사업자 SSOT**로 관리합니다.
- 현재 권장 구조는 **`User = 사람`, `BusinessAnchor = 법인/사업자 SSOT`, `Business = 멤버십/운영 UI 컨테이너`** 입니다.
- 의뢰 조회 범위는 기본적으로 **내 사업자 + 허용된 하위 범위** 기준입니다.
- 직계 멤버 집계는 사업자 단위로 계산합니다.
- requestor/salesman/manufacturer 등 role별 사업자의 내부 식별자는 Mongo `_id` 이지만, **사업자 anchor는 `organizationType + normalizedBusinessNumber`** 입니다.
- 사업자 이름(`name`), 대표자명, 주소는 수정 가능하지만 **사업자 anchor로 사용하지 않습니다.** 이름 변경 때문에 새 사업자를 만들면 안 됩니다.
- 사업자등록번호가 없는 사업자는 임시 사업자일 수 있지만, 사업자등록번호가 확정되면 **기존 사업자 재사용/attach** 를 우선하고 중복 새 사업자 생성을 피합니다.
- **검증 완료된 사업자**의 사업자등록번호는 일반 설정 수정으로 직접 바꾸지 않습니다. 필요 시 관리자 승인 기반의 별도 사업자 전환 절차를 사용합니다.
- 도메인 용어와 핵심 식별 필드는 `organization`이 아니라 **`business`(사업자)** 를 사용합니다.
- 법적/정산/소개/집계/실시간 동기화의 canonical 식별 필드는 **`businessAnchorId`** 입니다.
- request 문서의 사업자 귀속 필드는 과도기 명칭보다 **`requestorBusinessAnchorId`** 를 우선 사용합니다.
- 의뢰건, 크레딧, 수수료, 리퍼럴, 주문량/통계, 배송 박스/우편함 귀속의 기본 단위는 **유저가 아니라 사업자**입니다.
- requestor 역할에서 대표/직원 구분은 권한 모델일 뿐이며, 금액/집계/추천 보상/우편함/배송비 귀속 기준을 개인 사용자로 분기하지 않습니다.
- business owner는 사업자를 생성/검증 요청하는 사용자 역할일 뿐, 사업자 생성 이후 관련 데이터의 canonical 귀속 주체는 **owner가 아니라 business 엔터티 자체**입니다.
- 개인 사용자 기준 처리가 필요한 경우는 인증/세션/알림 수신 주체처럼 **사용자 자체가 엔터티인 기능**으로 한정합니다.

### 2.3.2 BusinessAnchor 전환 원칙

- `BusinessAnchor`는 법적/정산/소개 기준 사업자의 **canonical SSOT** 입니다.
- `BusinessAnchor.businessType`은 `requestor`, `salesman`, `manufacturer`, `devops`, `admin` 을 지원합니다.
- `BusinessAnchor`의 natural key는 **정규화된 사업자등록번호(`businessNumberNormalized`)** 이고, DB PK는 Mongo `ObjectId` 를 유지합니다.
- 소개 원본 DB의 canonical 관계는 `User.referredByBusinessId`가 아니라 **`BusinessAnchor.referredByAnchorId`** 방향으로 전환합니다.
- 주문, 크레딧, 정산, 소개 스냅샷, 관리자 overview 스냅샷은 **`businessAnchorId` 기준** 집계/귀속을 기본으로 합니다.
- `Business`는 멤버십/조직 UI/운영 컨테이너로만 남기고, 법적 식별/소개/정산 SSOT 책임은 `BusinessAnchor`로 이동합니다.
- DB 리셋 전제 작업에서는 레거시 `businessId`, `organizationId`, `referredByBusinessId` 호환을 두지 않고 **`businessAnchorId` / `referredByAnchorId` 단일 소스**를 사용합니다.
- 온보딩/사업자 설정 저장 시 사업자등록번호가 검증되면 **`BusinessAnchor`를 즉시 생성 또는 upsert** 하고, `Business.businessAnchorId` 및 해당 사업자 소속 `User.businessAnchorId`를 함께 동기화합니다.
- **정말 필수적인 초기값 외에는 fallback을 추가하지 않습니다.** 값이 비어 있으면 프론트에 숨겨 문제를 드러내고, 저장/동기화의 근본 원인을 수정합니다.
- 꼭 fallback 구현이 필요하면 **반드시 사용자 승인 후** 반영합니다.
- 크레딧 및 집계 SSOT:
  - `ChargeOrder`, `CreditLedger`, `TaxInvoiceDraft` 등 사업자 귀속 금전 모델의 canonical 키는 **`businessAnchorId`** 입니다.
  - 크레딧 조회/집계/러닝밸런스 계산은 **항상 `businessAnchorId` 기준**으로 수행합니다.
  - 백엔드 크레딧 관련 컨트롤러(`adminCredit.controller.js`, `creditLedger.controller.js`, `credit.controller.js` 등)의 쿼리/집계는 레거시 fallback 없이 `businessAnchorId`만 사용합니다.
  - 프론트 관리자 크레딧 페이지(`AdminCreditPage`)와 관련 모달은 조직 선택/표시/실시간 동기화 시 **`businessAnchorId`만** 사용합니다.
  - 크레딧 생성 지점(`upsertBonusLedger`, bonus grant 등)은 `Business.businessAnchorId`를 조회하여 `CreditLedger.businessAnchorId`에 저장합니다.

### 2.4 수익 분배 (매출 100 기준)

- 제조사(애크로덴트): 65
- 개발운영사(메이븐): 5~10
- 영업자(법인/개인): 5~7.5
- 관리자(어벗츠): 22.5~25
- 분배 비율은 개발운영사 설정 화면에서 관리하며, 변경 시 본 문서를 먼저 갱신합니다.

### 2.5 소개 네트워크 의미 규칙

- `requestor`의 소개는 **그룹 할인 네트워크**입니다.
  - 본인 사업자와 본인이 직접 소개한 사업자만 같은 그룹으로 봅니다.
  - 그룹 전체는 동일한 할인율을 적용받습니다.
  - 간접 소개는 그룹 할인에 포함하지 않습니다.
- `salesman`, `devops`의 소개는 **소개 사업자 네트워크**입니다.
  - 그룹 할인 개념이 아니라, 내가 소개한 하위 사업자/소개자를 보는 개념입니다.
  - 통계는 기본적으로 `소개 사업자 수`, `소개 사업자 주문합`, `내 사업자 주문수`를 분리해서 다룹니다.
  - `salesman`은 하위 `requestor`와 하위 `salesman`을 함께 소개 네트워크로 봅니다.
  - `devops`는 하위 `requestor`를 소개 네트워크로 봅니다.
- `admin`은 소개 구조의 **중립적 관찰자**입니다.
  - 관리자 UI는 특정 리더의 소개 네트워크를 조회/비교하는 관점으로 표현합니다.
  - 관리자 화면에서 `group`이라는 표현은 의뢰자 할인 네트워크에 한정하고, 그 외에는 `리더`, `소개 네트워크`, `소개 현황` 표현을 우선합니다.
- 소개 네트워크 차트의 주문량은 역할별 카드/통계와 같은 기준의 **실제 사업자 주문수**를 표시해야 합니다.

### 2.3.1 사업자 대표 가입 및 BusinessAnchor/Business 생성

- **사업자 대표(owner)가 가입할 때** 다음 흐름을 따릅니다:
  1. 사용자가 개인 계정 생성 (User 엔터티)
  2. 온보딩 또는 설정에서 사업자등록증 업로드 및 검증
  3. 검증 완료 시 canonical **BusinessAnchor** 생성 또는 기존 anchor attach
  4. 운영/멤버십 컨테이너인 **Business 엔터티 생성** 및 `businessAnchorId` 연결
  5. 대표 사용자는 해당 Business에 owner 권한으로 귀속
  6. 이후 가입하는 직원들도 같은 Business에 member 권한으로 귀속
- **canonical 귀속 키는 사업자등록번호 검증 완료 시점의 `businessAnchorId`** 이며, 이후 의뢰/크레딧/배송/소개/집계는 `businessAnchorId` 기준으로 처리합니다.
- 사업자 대표와 직원은 모두 같은 Business/BusinessAnchor에 속하며, 개인 사용자 ID가 아니라 **`businessAnchorId`** 를 기준으로 집계합니다.
- 온보딩과 설정 메뉴의 사업자등록 UI는 동일한 BusinessForm 컴포넌트를 공유하여 일관성을 유지합니다.

## 3. SSOT와 데이터 흐름

### 3.1 서버 SSOT

- 제출 완료된 의뢰의 SSOT는 **백엔드 + MongoDB + S3**입니다.
- 프론트 설정/토글/상태 변경은 항상 백엔드 API를 통해 먼저 저장합니다.
- BG 프로그램은 프론트나 브리지 로컬 상태를 직접 신뢰하지 않고 백엔드 기준으로 동작합니다.
- requestor 크레딧과 수수료 장부의 기본 귀속 단위는 **사업자**입니다. 대표/직원 개별 사용자 잔액처럼 분산 관리하지 않습니다.
- `ChargeOrder`, `CreditLedger`, `TaxInvoiceDraft`, `ShippingPackage` 등 금전/정산/배송 귀속 모델은 **`businessAnchorId` 기준**으로 쿼리/기록합니다.
- 배송비, 각종 사용 수수료, 환불, 보너스도 가능하면 **사업자 기준 ledger key / ref key** 로 일관되게 기록합니다.
- 배송 박스의 canonical SSOT는 **`shippingPackageId`** 입니다.
- `mailboxAddress`는 물리 우편함 위치일 뿐 박스 identity가 아니며, 운송장/집하/배송완료/추적관리 집계 키로 단독 사용하지 않습니다.
- 세척.패킹에서 포장.발송으로 승인되는 시점에 **배송 날짜 batch별 `shippingPackageId`** 를 생성하고, 이후 읽기 경로(포장.발송, MOCK 집하, MOCK 배송완료, 추적관리)는 그 저장된 `shippingPackageId`만 사용합니다.
- 같은 `mailboxAddress`가 다른 날짜에 다시 배정되더라도, 그날 새로 생성된 `shippingPackageId`가 다르면 **반드시 다른 박스** 로 취급합니다.
- requestor 크레딧 변동(CHARGE, BONUS, SPEND, REFUND, ADJUST)은 가능하면 모두 `credit:balance-updated` 실시간 이벤트를 함께 발행해 헤더와 대시보드가 즉시 동기화되게 합니다.
- 크레딧 실시간 반영도 전체 페이지 refetch 대신 **헤더/관련 카드 숫자만 국소 patch**하는 것을 기본으로 합니다.
- backend/controller, frontend consumer, `bg/` 연동 코드는 **`businessAnchorId` / `requestorBusinessAnchorId` 우선이 아니라 단일 기준**으로 사용합니다.
- 새 코드에서는 `businessId`, `organizationId`, `requestorOrganizationId`, `referredByBusinessId` fallback이나 alias를 두지 않습니다.

### 3.1.2 SSOT write-on-event 원칙

- `소개 사업자 수`, `그룹 멤버 수`, `직계 멤버 수`처럼 읽을 때 계산하고 싶어지는 값은 **반드시 하나의 canonical SSOT 필드**로 둡니다.
- 그 SSOT는 **이벤트 발생 시점에만 갱신**합니다.
  - 예: requestor가 자신의 소개 링크로 가입 완료되면, 그 순간 소개자/피소개자 관계와 그룹 멤버 SSOT를 함께 write합니다.
  - 예: 멤버 탈퇴/비활성화/사업자 전환처럼 관계가 바뀌는 이벤트도 write 트리거에 포함합니다.
  - 소개 관계 write 트리거는 **referrer 입력 시점만으로 끝나지 않을 수 있습니다.** child `businessAnchorId`가 아직 없으면, 실제 `BusinessAnchor` 생성/attach 이벤트에서 canonical 관계를 최종 확정합니다.
  - 따라서 소개 수/그룹 멤버 수/소개 트리는 `User.referredByAnchorId`가 아니라 **`BusinessAnchor.referredByAnchorId`만 읽습니다.**
- read API, 카드 렌더링, 통계 조회에서는 SSOT를 다시 계산하지 않습니다.
- 필요한 경우 배치/백필은 허용하지만, 그 목적은 **SSOT를 복구/정렬**하는 것이지 read-path 계산을 대체하는 것이 아닙니다.

### 3.1.1 bridge-server CNC 연속가공 SSOT

- `bridge-server`의 CNC 연속가공에서 **큐와 장비 플래그의 SSOT는 백엔드**입니다.
- 브리지는 재시작 시 `InitialSyncFromBackendOnce()`로 **백엔드 최신 큐 스냅샷**을 먼저 복구한 뒤 동작해야 합니다.
- 브리지는 `allowAutoMachining`, `allowJobStart` 같은 장비 플래그를 로컬 메모리나 프론트 상태로 추정하지 않고 **항상 백엔드 플래그 조회 결과 기준**으로 판단합니다.
- idle 상태에서 다음 job이 있더라도 **`allowAutoMachining=false`이면 프리로드/활성화/자동시작을 진행하지 않습니다.**
- 장비 플래그 의미는 다음처럼 구분합니다.
  - **`allowAutoMachining`**: `작업` 페이지에서 의뢰건 자동 가공을 허용하는 플래그입니다. 백엔드 생산 큐/브리지 자동 트리거/연속 가공의 기준 플래그는 이것입니다.
  - **`allowJobStart`**: `장비` 페이지에서 작업자가 샘플/수동 가공을 직접 시작하는 것을 허용하는 플래그입니다. 수동 start/reset 같은 장비 제어의 기준 플래그는 이것입니다.
  - 따라서 **의뢰건 자동 가공 경로는 `allowJobStart`에 의해 막히면 안 됩니다.** 자동 가공 시작 여부는 `allowAutoMachining` 기준으로만 판단합니다.
- 브리지는 다음 경계 이벤트에서 **강제 백엔드 재동기화**를 수행해야 합니다.
  - 브리지 재시작 직후
  - 가공 완료 직후
  - alarm 감지 직후
  - `allowAutoMachining=false`로 시작이 차단된 직후
  - consume/queue 반영 재시도 성공 직후
- `AwaitingStart`는 **프로그램만 올라간 상태일 뿐 실제 가공 중이 아닙니다.** 이 상태를 idle로 취급하면 안 됩니다.
- `AwaitingStart` 상태에서도 장비 alarm을 계속 감지해야 하며, alarm 발생 시 즉시 실패 통보 후 백엔드 스냅샷을 다시 받아야 합니다.
- real CNC 모드에서는 실제 busy/start가 확인되기 전까지 `STARTED/NOW PLAYING` 상태를 올리지 않습니다. **실제 시작 판정은 busy 전환 기준**입니다.

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

### 4.3.1 CNC 샘플 가공 / 의뢰 과금 분리

- `POST /api/requests/:id/nc-file`는 첨1의 `장비` 페이지에서 제조사 관리자가 수동으로 실행하는 **샘플 가공 전용 엔드포인트**입니다.
- 이 엔드포인트는 **정식 의뢰건의 공정 진입/과금 경로로 사용하지 않습니다.**
- 따라서 `nc-file` 경로에는 **크레딧 차감, 잔액 검증, 의뢰 과금 로직을 넣지 않습니다.**
- 의뢰비의 canonical 규칙은 **제조사 CAM 승인(`review-status`) 시 차감 / 가공→CAM 롤백(`review-status`) 시 환불**입니다.
- 배송비의 canonical 규칙은 **세척.패킹 승인(`review-status`) 시 차감 / 포장.발송 롤백(`review-status`) 시 환불**입니다.
- 따라서 위 두 approval/rollback 포인트 외의 경로에서는 **크레딧 차감/환불을 하지 않습니다.**
- `machiningBridge`, `machiningCallback` 같은 CNC 완료/콜백 경로는 **공정 상태 전이와 동기화만 담당**하며, 크레딧 차감 책임을 가지지 않습니다.

### 4.4 가상 우편함

- 주소 형식: `{Shelf}{ShelfRow}{BinCol}{BinRow}`
- 실제 운용 선반은 `A~I`이며 화면에서는 `A-C`, `D-F`, `G-I` 3개 그룹으로 본다. 행 1~4, 빈 열 A~C, 빈 행 1~4
- 총 용량은 `9 x 4 x 3 x 4 = 432`
- **가공 완료로 세척.패킹 단계에 진입할 때** 자동 할당하며, 이미 같은 의뢰자 조직이 보유한 우편함이 있으면 재사용합니다.
- 포장.발송/배송 롤백 시 `mailboxAddress = null`로 해제합니다.
- 배송비는 **세척.패킹 승인 시점**에 같은 박스(묶음 배송 패키지) 기준으로 **1회만** 차감합니다.
- 포장.발송에서 세척.패킹으로 롤백되면 해당 배송비를 환불합니다.
- 택배 접수 후 **집하완료(statusCode 11) 전까지는** 의뢰를 `포장.발송`에 유지하고 우편함도 유지합니다.
- requestor 대시보드의 배송비 장부/오늘 발송 내역/최근 30일 발송 요약의 SSOT는 `ShippingPackage` 입니다.
- 배송비 크레딧 차감/환불은 `CreditLedger.refType = SHIPPING_PACKAGE` 기준으로 관리하며, 승인/롤백 cycle 단위 key로 **사이클당 정확히 1회만** 기록합니다.
- 배송 추적/집하 동기화는 **상태 반영만 담당**하며 배송비 과금 시점이 아닙니다.
- requestor 가격 정책 카드의 최근 30일 집계 문구는 완료 주문 기준이 아니라 **포장.발송 기준**으로 표시합니다.
- 레거시 잘못된 배송 데이터가 남아 있을 수는 있지만, 새 데이터 처리 규칙은 항상 **패키지 기준 1회 차감 + shipDateYmd 기준 요약**을 따릅니다.
- 이 구간에서는 한진 예약취소 API로 접수 취소할 수 있어야 하며, 제품 추가/제외 후 재접수할 수 있어야 합니다.
- 포장.발송의 실제 운영 순서는 **택배 접수(wblNo 획득) → 운송장 출력(wblNo 포함) → 창고 실물 대조 → 웹앱 수정 → 라벨 재출력 → 재접수(멱동성)** 입니다.
- 한진 API 프로세스:
  1. **택배 접수**: 한진 API로 주문 등록 → `wblNo`(운송장 번호) 획득 → `accepted` 상태
  2. **운송장 출력**: `wblNo` 포함하여 라벨 출력 → `printed` 상태
  3. **창고 실물 대조**: 출력된 라벨을 들고 창고에서 우편함 실물과 대조
  4. **웹앱 수정**: 중복 제품 제거, 누락 제품 처리 (부분 롤백 또는 전체 미발송)
  5. **라벨 재출력**: 변경된 우편함만 다시 출력
  6. **재접수**: 수정 후 택배 접수 재실행 (멱동성 처리로 안전)
- 포장.발송 화면의 기본 출발점은 **`택배 접수`** 이며, 접수 후 `wblNo`를 획득한 뒤 **`운송장 출력`** 을 실행합니다.
- 택배 접수는 우편함 선택 기반이 아니라, **해당 우편함에 현재 들어 있는 전체 제품**을 대상으로 실행합니다.
- 우편함 선택 기능은 제거합니다. 선택 배경, 전체선택/전체해제, 선택 개수 요약 UI를 두지 않습니다.
- 제품을 빼고 싶으면 선택이 아니라 **우편함 롤백(전체 또는 일부)** 으로 구성 자체를 수정한 뒤 다시 접수/출력합니다.
- 제조사 워크시트의 `완료포함` 토글은 `의뢰`, `CAM`, `가공`, `세척.패킹`, `포장.발송`, `추적관리` 전 공정에서 **현재 공정 건 + 당일 발송 배치(`timeline.estimatedShipYmd = 오늘 KST`)이면서 아직 집하완료(statusCode 11 / `pickedUpAt`) 전인 downstream 건만** 표시합니다.
- 즉, `완료포함`은 단순히 뒤 단계 전체를 다 보여주는 옵션이 아니라 **당일 작업 중인 미집하 건을 이어서 보는 옵션**입니다.
- 창고 실물과 라벨이 맞으면 박스에 담고 라벨을 붙입니다. 맞지 않는 우편함은 박스에 담지 않고 다시 우편함으로 돌려놓은 뒤, 웹앱에서 실제 창고 기준으로 우편함 구성을 수정합니다.
- 웹앱 수정 시 중복 제품이 있으면 하나만 남기고 제거하며, 누락 제품이 있으면 **부분 롤백 후 나머지 접수** 또는 **우편함 전체를 오늘 미발송 처리 후 다음날 발송** 중 제조사 직원이 선택합니다.
- `택배 접수` 버튼은 접수 후 `택배 취소`로 토글되며, 취소 시 다시 `택배 접수` 상태로 돌아갑니다.
- `운송장 재출력` 실행 시 해당 우편함이 이미 접수된 상태라면, 백엔드가 SSOT 기준으로 **기존 접수를 취소한 뒤 재접수한 것처럼 상태를 갱신**하고 프론트에는 접수 업데이트 토스트를 노출합니다.
- 한진 API에 직접적인 update 동작이 없더라도, 시스템 동작은 **취소 후 재접수**와 동일한 백엔드 상태 전이로 정의합니다.
- 멱동성 처리: 같은 우편함에 대해 여러 번 택배 접수를 시도해도 안전합니다. 이미 `accepted` 상태인 우편함은 스킵하고, 중복 에러 발생 시 상태를 `accepted`로 설정합니다.
- 위 `accepted` / `printed` 일일 작업 상태는 **오후 4시 집하(code 11)** 가 확인되면 리셋됩니다. 이후 다음 날 작업은 다시 `택배 접수`부터 시작합니다.
- `tracking` 단계 전환은 예약접수 시점이나 배송완료 시점이 아니라 **집하완료(statusCode 11 / `pickedUpAt`) 확인 시점**에 수행합니다.
- `배송완료(deliveredAt)`는 최종 배송 결과 표시에만 사용하며, `tracking` 단계 전환 기준으로 사용하지 않습니다.
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

### 4.5 가공 보드 미배정(온라인 장비 없음) 표시

- 세척.패킹 롤백 후 **온라인 + 소재 호환 조건을 만족하는 장비가 없을 때** 해당 의뢰건은 `queueMap.unassigned`로 올라오며 “미배정” 상태로 남습니다.
- “미배정”은 **별도 카드/머신으로 렌더링하지 않고**, 가공 보드 상단 컨트롤 라인에서 `재배정` 버튼과 같은 줄 중앙에 위치한 버튼으로 요약 표시합니다.
- 버튼에는 첫 번째 미배정 의뢰건의 치과/환자/치아/LOT 정보가 `MachiningRequestLabel` 형식으로 표시되고, 나머지 건수는 `외 N건` 텍스트로 표기합니다.
- 버튼을 클릭하면 모달을 열어 **미배정 전체 목록**을 순서대로 보여주며, 각 항목은 LOT·치과·환자·치아 정보가 포함된 카드로 표시합니다.
- 모달은 정보 노출 전용이며, 미배정 의뢰는 조건이 충족되는 장비가 다시 생기면 자동 재배정 또는 `재배정` 액션을 통해 배정되므로, 별도 수동 드롭다운/카드 이동 UI를 만들지 않습니다.

### 4.6 CNC 장비 배정 정책

#### 4.6.1 배정 대상 단계

- 장비 배정 대상은 **CAM 단계와 가공 단계**만 포함합니다.
- **의뢰 단계는 CAM 승인 전**이므로 가공 큐에 포함되지 않습니다.
- `MACHINING_ASSIGN_STAGE_SET = ["CAM", "가공"]`

#### 4.6.2 배정 시점

- **CAM 승인 시**: `common.review.controller.js`의 `ensureMachineCompatibilityOrThrow` 호출
- **세척.패킹 롤백 시**: 가공 단계로 복귀하므로 재배정 필요
- **자동 재배정**: `production.js`의 `rebalanceProductionQueuesInternal` - 미배정 건 발견 시 자동 실행

#### 4.6.3 균등 분배 로직

- 장비 배정은 **`common.review.machine.js`의 `chooseMachineForCamMachining` 함수**를 사용합니다.
- 배정 우선순위:
  1. **큐 길이** (적은 것 우선) - `queueCounts` 기준
  2. **소재 직경** (작은 것 우선, 낭비 최소화)
  3. **최근 배정 시간** (오래된 것 우선, 균등 분산)
  4. **장비 ID** (알파벳 순, 최후 기준)
- 큐 길이가 동일한 경우 알파벳 순으로 선택하여 안정적인 분배를 보장합니다.
- **session 전달**: 같은 트랜잭션 내 배정이 큐 계산에 반영되도록 `session` 파라미터를 전달합니다.

#### 4.6.4 배정 로직 통합

- 장비 배정 로직은 **단일 함수(`chooseMachineForCamMachining`)**로 통합되어 있습니다.
- CAM 승인, 세척.패킹 롤백, 자동 재배정 모두 동일한 함수를 사용합니다.
- 중복 구현을 피하고 일관성을 유지합니다.

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
- requestor 대시보드 계열 성능 최적화는 **요청 시 재계산보다 이벤트 기반 스냅샷/증분 캐시 갱신**을 우선합니다.
- 대상 API는 우선 `pricing-referral-stats`, `bulk-shipping`, `dashboard-summary`로 보고, canonical 집계 키는 **user가 아니라 `businessAnchorId`** 기준을 사용합니다.
- 스냅샷/증분 캐시 갱신 시점은 최소한 **소개 가입자 생성, 신규의뢰 생성, CAM 승인에 따른 의뢰 과금 진입, 세척.패킹 승인에 따른 배송비 과금 진입, 포장.발송/발송/집하 상태 변경, 관련 롤백, 매일 자정 배치**를 포함해야 합니다.
- 위 API들은 cold path 단축을 위해 **읽기 시 fallback 재계산은 최소화**하고, 가능하면 이벤트 후처리/배치에서 미리 값을 준비합니다.
- `bulk-shipping`은 `businessAnchorId + ymd` 기준 materialized snapshot을 사용하고, payload는 `pre`, `post`, `waiting` 세 묶음을 저장합니다. 읽기 API는 snapshot을 우선 조회하고, 누락 시에만 최소 fallback 재계산 후 snapshot을 채웁니다.
- `dashboard-summary`는 한 번에 모든 카드를 재계산하지 말고 조각 snapshot으로 분해합니다. 현재 1차 대상은 `stats`와 `manufacturingSummary`이며, `businessAnchorId + ymd + periodKey` 기준으로 저장합니다. `riskSummary`, `recentRequests`처럼 변동성이 크거나 상세 리스트 성격이 강한 구간은 우선 live 계산을 유지하고, 이후 별도 snapshot 또는 증분 캐시로 분리합니다.

### 6.2 실시간

- 표준 채널은 Socket.io 기반 `app-event` 입니다.
- 백엔드 emit helper를 사용하고, 페이지별 개별 소켓 연결을 만들지 않습니다.
- BG/외부 장비/관리자 처리 결과는 각 로컬 서비스가 직접 프론트를 갱신하지 않고, **반드시 백엔드 API에 반영한 뒤 백엔드가 표준 `app-event`를 emit** 합니다.
- 실시간 이벤트 payload는 화면 전체 재조회가 아니라 **해당 엔티티/집계 일부만 국소 갱신**할 수 있도록 설계합니다.
- 크레딧, 대시보드 카운트, 카드 상태, 최근 목록 등은 가능하면 **delta 또는 최소 필드 payload**를 보내고 프론트는 해당 값만 patch 합니다.
- 제조 공정 승인/롤백에서 외부 I/O, 파일 정리, BG/CAM/NC/브리지 트리거처럼 응답 지연을 유발하는 작업은 **DB 저장/응답 이후 비동기 후처리**로 분리합니다.
- 제조 공정 비동기 후처리 실패는 백엔드가 **표준 `app-event`(`request:async-action-failed`)** 로 발행하고, 프론트는 전체 refetch 대신 **토스트 + 국소 patch**로 사용자에게 알립니다.
- 제조사 워크시트 승인/롤백 UI는 성공 시 전체 목록 refetch보다 **즉시 로컬 patch 우선** 원칙을 따릅니다. full refetch는 patch 불가/재동기화 목적일 때만 허용합니다.

### 6.3 크레딧

- 신규 가입 기공소에는 **가입축하 무료 크레딧 30,000원**을 1회 지급합니다.
- requestor 크레딧과 수수료 장부의 기본 귀속 단위는 **사업자**입니다. 대표/직원 개별 사용자 잔액처럼 분산 관리하지 않습니다.
- 배송비, 각종 사용 수수료, 환불, 보너스도 가능하면 **사업자 기준 ledger key / ref key** 로 일관되게 기록합니다.
- requestor 크레딧 변동(CHARGE, BONUS, SPEND, REFUND, ADJUST)은 가능하면 모두 `credit:balance-updated` 실시간 이벤트를 함께 발행해 헤더와 대시보드가 즉시 동기화되게 합니다.
- 크레딧 실시간 반영도 전체 페이지 refetch 대신 **헤더/관련 카드 숫자만 국소 patch**하는 것을 기본으로 합니다.

### 6.3.2 크레딧 종류 및 사용 규칙

**크레딧 종류:**

- **유료 크레딧**: 의뢰 결제 + 배송비 결제 모두 가능
- **무료 크레딧**: 의뢰 결제만 가능 (배송비 결제 불가)
- **무료 배송비 크레딧**: 배송비 결제만 가능 (의뢰 결제 불가)
- 관리자 무료 크레딧(`WELCOME_BONUS`, `FREE_SHIPPING_CREDIT`) 지급 대상은 **의뢰자 사업자(`requestor`)만** 허용합니다. `admin`, `manufacturer`, `salesman`, `devops` 사업자에는 프론트/백엔드 모두 지급을 막습니다.

**신규의뢰 크레딧 검증:**

- 신규의뢰 생성 시 **유료 크레딧 + 무료 크레딧 합계가 최소 10,000원 이상**이어야 합니다. 미만이면 신규의뢰를 차단합니다.
- 의뢰 결제는 유료 크레딧과 무료 크레딧 모두 사용 가능합니다.

**배송비 크레딧 검증:**

- 배송비 결제는 **유료 크레딧 또는 무료 배송비 크레딧**으로만 가능합니다.
- 무료 크레딧으로는 배송비를 결제할 수 없습니다.
- 배송비 결제 시 유료 크레딧과 무료 배송비 크레딧이 모두 부족하면 배송비 결제를 실패 처리합니다.

**무료 배송비 크레딧:**

- 관리자는 필요 시 **배송비 무료 크레딧**을 별도로 지급할 수 있습니다.
- 배송비 무료 크레딧은 `BonusGrant.type = FREE_SHIPPING_CREDIT`로 기록하며, `CreditLedger.refType = FREE_SHIPPING_CREDIT`로 관리합니다.

### 6.3.3 크레딧 설정 (관리자)

**설정 항목:**

- `minCreditForRequest`: 신규의뢰 최소 크레딧 (기본값: 10,000원)
- `shippingFee`: 배송비 (기본값: 3,500원)
- `defaultFreeShippingCredit`: 신규 가입 시 배송비 무료 크레딧 기본값 (기본값: 3,500원)

**관리 방식:**

- 모든 크레딧 설정은 `SystemSettings` 모델의 `creditSettings` 필드에 저장합니다.
- 프론트엔드는 `useSystemSettings()` 훅으로 설정값을 조회합니다.
- 애드민 [결제] 탭에서 설정값을 수정할 수 있습니다.
- 설정값은 하드코딩하지 않고 항상 백엔드에서 조회합니다.

**대시보드 크레딧 경고:**

- **의뢰불가 경고**: 의뢰 단계의 의뢰건이 하나라도 있으면서 `유료 크레딧 + 무료 크레딧 < minCreditForRequest`이면 경고를 표시합니다.
- **배송불가 경고**: 의뢰 단계 또는 포장.발송 단계의 의뢰건이 있으면서 `유료 크레딧 < shippingFee`이면 경고를 표시합니다.
  - 무료 크레딧으로는 배송비를 결제할 수 없으므로, 유료 크레딧만으로 판단합니다.
  - 의뢰가 진행되어 포장.발송 단계로 가면 배송이 불가능하므로, 의뢰 단계에서도 미리 경고합니다.
- 경고 메시지는 대시보드 헤더 subtitle과 [보유 크레딧] 버튼의 빨간 테두리로 표시합니다.

### 6.3.1 사업자 단위 집계 원칙

- requestor 의뢰건/매출/주문량/배송 요약/가격 정책 통계는 **로그인한 개별 사용자 기준이 아니라 해당 사업자 기준**으로 계산합니다.
- 소개 코드/소개 그룹/소개 보상은 requestor의 경우에도 **사업자 자체**를 canonical 귀속 주체로 사용합니다.
- 대표(owner)/직원(member)은 같은 사업자에 매달린 사용자일 뿐이며, 집계 키를 owner user id로 삼아 business를 우회하지 않습니다.
- 프론트 문구/카드/표/모달도 가능하면 `조직`보다 `사업자` 표현을 우선하고, 실제 집계 기준이 사업자라면 사용자 개인 기준처럼 오해될 표현을 피합니다.
- 사용자 노출 문구에서는 `리퍼럴` 대신 **`소개`** 를 사용합니다.
- 사용자 노출 문구에서는 `직계1단계` 같은 표현 대신 **`직접 소개` / `간접 소개`** 를 사용합니다.
- 직접 소개는 **내가(내 사업자가) 직접 소개한 사용자/사업자**, 간접 소개는 **내가 직접 소개한 사용자/사업자가 다시 소개한 사용자/사업자**를 뜻합니다.
- 소개 정책과 소개 관련 UI/통계는 **requestor / salesman / devops role에 유효한 개념**으로 취급합니다.
- **의뢰자 소개 할인 정책**:
  - 의뢰자는 **직접 소개로 연결된 모든 사업자를 하나의 그룹**으로 묶어 사용량을 합산하여 할인합니다.
  - 같은 그룹 내 모든 사업자는 동일한 할인율을 적용받습니다.
  - 직접 소개 관계만 그룹에 포함되며, 간접 소개(한 단계 이상 건너뛴 관계)는 그룹 할인에 포함되지 않습니다.
  - 예: A가 B, C를 직접 소개하고, B가 D를 소개한 경우 → A, B, C는 같은 그룹(합산 할인), D는 별도 그룹
- **의뢰자 주문량 할인 수치**:
  - 최근 30일 주문량 기준으로 **주문 1건당 20원**이 할인됩니다.
  - 최대 할인액은 **5,000원**입니다.
  - 할인 상한은 **250건**이며, 250건 이상이면 최대 할인액이 적용됩니다.
- **신규 가입 90일 고정가**:
  - 신규 가입 사업자는 승인일로부터 90일 동안 **건당 10,000원**이 우선 적용됩니다.
  - 이 기간에는 주문량 할인보다 10,000원 고정가가 우선합니다.
- **영업자/개발운영사 소개 정책**: 기존 정책 유지 (직접 소개 수수료 + 간접 소개 수수료)
- **소개 네트워크 차트 표시 깊이 정책**:
  - **의뢰자**: `maxDepth=1` (직접 소개만 표시, 간접 소개 미표시)
  - **영업자**: `maxDepth=2` (직접 + 간접 소개 표시, 1단계 5% + 2단계 2.5% 수수료 적용)
  - **개발운영사**: `maxDepth=1` (직접 소개만 표시, 영업자가 없는 계정의 기본 소개자 역할)
  - **관리자**: `maxDepth` 제한 없음 (전체 트리 표시)
- 회원가입 소개 링크 정책은 다음과 같이 고정합니다.
  - 의뢰자 소개 링크로는 **의뢰자만 가입**할 수 있습니다.
  - 영업자 소개 링크로는 **의뢰자 또는 영업자만 가입**할 수 있습니다.
  - `devops`는 **회원가입 소개 링크의 직접 소개자 역할로 사용하지 않습니다.**
- 영업자 소개자가 명시적으로 등록되지 않은 **의뢰자 회원가입/온보딩** 케이스에서는 **기본값으로 개발운영사(`devops`) 사업자를 소개자**로 내부 등록합니다.
- 소개 그룹, 소개 코드, 소개 보상, 소개 수수료, 관리자 소개/크레딧 UI에서는 `devops`를 `salesman`과 함께 **소개자 버킷**으로 집계합니다.
- **개발운영사(`devops`)는 외부 사용자에게 노출되는 안내 문구, 정책 설명, 마케팅 자료에서 언급하지 않습니다.** 내부 관리 및 시스템 로직에서만 사용합니다.
- 소개 리더 집계는 사용자 개인이 아니라 **business 기준으로 대표 1명만 canonical leader**로 사용합니다.
- 프론트의 canonical 소개 가입 링크는 **`/signup/referral?ref={REFERRAL_CODE}`** 이며, 소개 링크 복사/공유/CTA는 이 경로를 사용합니다.

### 6.4 브리지/CNC 제어

#### 6.4.1 기본 원칙

- 브리지 제어는 백엔드 DB 저장이 먼저입니다.
- Frontend는 bridge에 직접 연결하지 않습니다.
- CNC 제어와 브리지 호출은 기본적으로 **1회만 시도**합니다.
- 실패 시 자동 재시도 대신 원인을 그대로 반환합니다.
- 제조사별 더미 가공 설정(`dummySettings`)의 SSOT는 백엔드 DB입니다.
- 더미 가공 스케줄 판단은 브리지가 폴링하지 않고 **백엔드 스케줄러가 DB를 읽어 수행**합니다.
- CNC 장비 페이지의 **모터 온도/공구 수명/공구 오프셋 모달 데이터도 백엔드 DB 스냅샷 SSOT**로 처리합니다.
  - 프론트는 브리지 직접 호출 실패로 모달 오픈이 막히면 안 됩니다.
  - `GetMotorTemperature`, `GetToolLifeInfo`, `UpdateMotorTemperature`, `UpdateToolLife`, `UpdateToolOffset` 은 백엔드가 DB 스냅샷을 읽고/저장한 뒤 응답합니다.
  - 브리지 재시동 시 `GET /cnc-machines/bridge/queue-snapshot/:machineId` 응답에 포함된 `uiSnapshot`도 함께 받아 메모리 상태를 복구합니다.
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

## 8.1 의뢰카드 마감 시간 표시

- 의뢰카드 우하단 뱃지는 `마감 #시간`을 기준으로 유지하고, 그 오른쪽에 현재 공정단계 뱃지를 추가합니다.
- 기존처럼 `[의뢰] [마감 #시간]` 순서로 별도 재정의하지 않습니다. canonical 표시는 `[마감 #시간] [공정단계]` 입니다.
- 의뢰카드의 테두리 색상은 `마감 #시간` 뱃지와 동일한 색상 규칙을 따라갑니다.
- 마감 시간 계산 기준: `timeline.estimatedShipYmd` (발송 예정일 23:59:59)
- **영업일 기준**: 주말(토일)과 한국 공휴일 제외
- 색상 규칙 (테두리 + 뱃지 배경):
  - **초록색**: 2영업일 초과 (충분한 여유) - `border-green-500`, `bg-green-50`
  - **노란색**: 1영업일 초과 ~ 2영업일 이하 (주의) - `border-yellow-500`, `bg-yellow-50`
  - **주황색**: 0영업일 초과 ~ 1영업일 이하 (긴급) - `border-orange-500`, `bg-orange-50`
  - **빨간색**: 0영업일 이하 (마감 초과) - `border-red-500`, `bg-red-50`
- 마감 뱃지 텍스트는 `마감 19시간`, `마감 3일 2시간`, `마감됨` 형식을 사용합니다.
- 공정단계 뱃지는 마감 뱃지 오른쪽에 붙이며, 예: `의뢰`, `CAM`, `가공`, `세척·패킹`, `포장·발송`, `추적관리`
- 구현 파일: `WorksheetCardGrid.tsx`, `utils/request.ts`

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
