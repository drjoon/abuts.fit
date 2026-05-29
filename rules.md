# abuts.fit rules

이 문서는 프로젝트 전체의 **최신 단일 규칙 문서**입니다.

- 루트 `rules.md`가 **최종 기준**입니다.
- 하위 폴더의 `rules.md`는 **로컬 구현 메모**만 담아야 하며, 루트와 충돌하면 루트가 우선입니다.
- 제거하기로 한 레거시 규칙은 문서와 코드에 남겨두지 않습니다.

## 1. 기본 원칙

### 1.0 레거시 제거 원칙 (최우선)

**흡수 통합 시 레거시는 완전히 제거하고, SSOT 기준으로 모두 교체합니다.**

- ❌ **레거시 필드/alias/폴백 사용 금지**
  - 중복 필드를 만들지 않습니다
  - alias로 호환성을 유지하지 않습니다
  - 임시 폴백을 남기지 않습니다
- ✅ **SSOT가 유일한 진실의 원천**
  - 하나의 데이터는 하나의 필드에만 저장
  - 읽기/쓰기 모두 SSOT만 사용
  - 레거시 경로는 즉시 제거
- ✅ **향후 헷갈리지 않게 명확히 기록**
  - **메모리**: 레거시 제거 이유와 SSOT 위치 기록
  - **룰(rules.md)**: 정책 섹션에 명확히 문서화
  - **주석**: 코드에 "레거시 제거", "SSOT" 명시
- 📌 **예시: BusinessAnchor extracted → metadata 통합**
  - ❌ `extracted` 필드 완전 제거 (DB 모델, API, 프론트엔드)
  - ❌ `extracted` alias 제거 (백엔드 API에서 반환 안 함)
  - ✅ `metadata`만 사용 (SSOT)
  - ✅ 메모리, rules.md 섹션 2.1.1, 코드 주석에 명확히 기록

**이 원칙을 위반하면 데이터 불일치, 버그, 혼란이 발생합니다.**

---

### 1.1 보안 정보 관리

**보안 정보(비밀번호, API 키, DB URI 등)는 절대 하드코딩하지 않습니다.**

- ❌ **하드코딩 금지 항목**:
  - MongoDB URI (사용자명, 비밀번호 포함)
  - API 키 (AWS, Google, Kakao, Brevo 등)
  - JWT Secret
  - 공유 비밀키 (BRIDGE_SHARED_SECRET 등)
  - 계좌번호, 사업자번호 등 민감 정보
- ✅ **올바른 방법**:
  - 모든 보안 정보는 **환경변수**로만 관리
  - `local.env` 또는 `.env` 파일에 저장 (Git에 커밋하지 않음)
  - 환경변수가 없으면 **명확한 오류 메시지와 함께 프로그램 종료**
  ```javascript
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }
  ```
- ❌ **금지된 패턴**:
  ```javascript
  // 절대 이렇게 하지 마세요
  const MONGODB_URI =
    process.env.MONGODB_URI || "mongodb+srv://user:password@...";
  const API_KEY = process.env.API_KEY || "hardcoded_api_key_123";
  ```
- 📌 **예외**: 테스트용 mock 값은 허용하되, 실제 프로덕션 정보는 절대 포함하지 않음

**이 규칙을 위반하면 보안 사고가 발생할 수 있습니다.**

---

### 1.2 시간대 및 시각 기준

**모든 시각은 KST(한국 표준시, Asia/Seoul)를 기준으로 합니다.**

- 날짜/시각 표시, 계산, 저장 시 **KST 기준**을 사용합니다.
- 주문 마감: **정오(12:00 KST) 이전 접수분은 당일 16:00 집하**, 이후 접수분은 다음 영업일 16:00 집하
- 마감 시간: **발송 예정일(estimatedShipYmd) 16:00 KST**
- 백엔드 시간 유틸리티: `/web/backend/utils/krBusinessDays.js`
  - `toKstYmd()`: Date → YYYY-MM-DD (KST)
  - `getTodayYmdInKst()`: 오늘 날짜 (KST)
  - `addKoreanBusinessDays()`: 영업일 계산 (주말/공휴일 제외)
- 프론트엔드 마감 시간 계산: `/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts`
  - `getDeadlineInfo()`: 마감까지 남은 시간 계산
  - 마감 시각: `estimatedShipYmd 16:00 KST` (UTC+9)
- 프론트엔드 KST 포맷팅 유틸리티: `/web/frontend/src/shared/date/kst.ts`
  - `toKstYmd()`: Date → YYYY-MM-DD (KST)
  - `formatKstDateTimeToKo()`: KST 기준 날짜/시간 문자열 포맷 (ko-KR)
  - 모든 날짜/시간 표시는 이 유틸리티를 사용해야 함
- UTC 저장 시 KST 변환 주의:
  - KST 16:00 = UTC 07:00
  - `new Date("2026-04-02T16:00:00+09:00")` = `new Date("2026-04-02T07:00:00Z")`
- **한진 API `statusDate` 파싱 주의** (2026-04-23):
  - 한진 API는 `"YYYY-MM-DD HH:MM:SS"` 포맷으로 KST 시각을 반환하지만 timezone 정보 없음
  - AWS EBS(UTC)에서 `new Date()` 직접 파싱 시 UTC로 해석되어 +9h 오차 발생
  - `parseDate()` 함수(`shipping.Tracking.helpers.js`)에서 이 패턴을 `+09:00`로 강제 해석
  - ❌ `new Date("2026-04-23 15:48:51")` → UTC 15:48 (잘못됨)
  - ✅ `new Date("2026-04-23T15:48:51+09:00")` → KST 15:48 (올바름)

---

### 1.3 CNC 알람 코드

**Hi-Link CNC 장비 알람 코드 정의:**

- **알람 501 (type=4, no=501)**: X축 overflow - 제한 범위를 넘는 X축 공구 이동 좌표
  - 공구가 X축 제한 범위를 벗어나는 좌표로 이동하려고 할 때 발생
  - 관련 파일: `bg/pc1/bridge-server/` (C# bridge-server)
  - NC 프로그램의 X축 좌표값 검토 필요

---

- 대화와 문서는 한국어를 기본으로 하고, 코드와 식별자는 영문으로 작성합니다.
- 간결하게 구현합니다. 새 추상화는 실제로 재사용되거나 복잡도를 줄일 때만 추가합니다.
- 기존 코드가 이미 잘 만들어져 있으면 **새 파일/새 컴포넌트/새 훅을 만들기보다 공통으로 재사용할 수 있게 개조하는 방향을 우선 검토합니다.**
- 새 파일/새 컴포넌트/새 훅 생성이 필요해 보이더라도, 기존 구조를 재사용하기 어렵다면 **먼저 사용자 승인**을 받습니다.
- 파일이 커지면 바로 분리합니다. 컴포넌트/훅/컨트롤러는 **800줄 이하**를 유지합니다.
- 결정된 정책은 우회하지 않습니다. 임시 폴백, 이중 경로, 레거시 alias를 남기지 않습니다.
- **문맥에 맞지 않는 fallback은 제거합니다.** 값이 없을 때 조용히 다른 값으로 채우는 fallback은 실제 버그를 숨기고 엉뚱한 데이터를 반환합니다. 값이 없으면 차라리 빈 결과/null/오류가 낫습니다.
  - 예: `businessType`이 없다고 "requestor"로 가정하지 않습니다.
  - 예: 쿼리 필터에서 `{ $exists: false }`, `{ businessType: "" }`, `{ businessType: null }` 같은 "없으면=특정타입" 확장은 하지 않습니다.
  - 예: 역할 기반 쿼리 필터에서 타입이 없을 때 `{}` (전체 매치)를 반환하지 않습니다.
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

### 1.4 파일 크기 관리 (800줄 정책)

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

### 2.0 인증 및 사용자 정보 동기화

**JWT 토큰과 사용자 정보 불일치 문제:**

- JWT 토큰은 발급 시점의 사용자 정보 스냅샷입니다.
- 사용자 정보가 변경되어도 (예: `businessAnchorId` 업데이트) JWT 토큰은 변경되지 않습니다.
- **해결 방법**: `/api/auth/me` 엔드포인트는 `req.user` (JWT 토큰 정보)를 그대로 반환하지 않고, **DB에서 최신 사용자 정보를 조회**하여 반환합니다.
- 이를 통해 사업자등록증 업로드, 온보딩 완료 등으로 인한 사용자 정보 변경이 프론트엔드에 즉시 반영됩니다.

**영향받는 API:**

- `GET /api/auth/me` - DB 조회로 최신 정보 반환
- `GET /api/requests/my/dashboard-summary` - `req.user.businessAnchorId` 필수
- `GET /api/requests/my/bulk-shipping` - `req.user.businessAnchorId` 필수

**프론트엔드 동기화:**

- `useAuthStore`의 `loginWithToken` 함수가 `/api/auth/me`를 호출하여 최신 정보 반영
- 사업자 정보 업데이트 후 프론트엔드는 자동으로 최신 사용자 정보를 받게 됨

**사업자 정보 저장 후 데이터 동기화 (2026-03-31 버그 수정 #1):**

- **문제**: 온보딩 완료 후 사업자등록증 및 필드 손실
- **원인**:
  1. `business.update.controller.js`에서 업데이트 후 조회 시 `businessLicense` 필드를 select하지 않음
  2. `BusinessAnchor` 모델에 `extracted`와 `metadata` 필드가 분리되어 있었으나, 생성 시 `extracted` 필드를 저장하지 않음
  3. `useBusinessDataManagement.ts`에서 서버 데이터 hydrate 시 로컬 드래프트를 우선하는 로직
  4. `BusinessTab.tsx`에서 저장 후 `businessMeCache`를 무효화하지 않아 stale 데이터 표시
- **해결**:
  1. **extracted/metadata 통합**: `BusinessAnchor` 모델에서 `extracted` 필드 제거, `metadata`로 통합 관리
     - AI 파싱 결과도 사용자 확인/검증을 거치므로 "추출"이 아닌 "검증된 메타데이터"
     - `metadata`가 SSOT이며 `extracted` alias는 제공하지 않음
  2. `useBusinessDataManagement.ts`: 서버에 `businessLicense`가 있으면 무조건 서버 데이터를 적용하도록 로직 추가
  3. `business.update.controller.js`: 업데이트 후 조회 시 `businessLicense` 필드를 select에 포함
  4. `BusinessTab.tsx`: 저장 성공 후 `invalidateBusinessMeCache` 호출 및 `force: true` 옵션으로 서버 데이터 강제 재로드
- **핵심**:
  - 저장 성공 후에는 로컬 상태보다 **서버 데이터를 우선**하여 SSOT 원칙 준수
  - AI 파싱 후 사용자 확인/검증을 거친 데이터는 `metadata`에 저장 (extracted 필드 사용 안 함)

**온보딩 단계 건너뛰기 방지 (2026-03-31 버그 수정 #2):**

- **문제**: DB 리셋 후 로그인 시 온보딩 1/4 단계가 아닌 4/4 단계로 바로 이동
- **원인**: 브라우저 localStorage에 이전 온보딩 진행 상태가 남아있어서 복원됨
- **해결**: DB 버전 기반 localStorage 초기화
  1. **백엔드**: `/web/backend/config/dbVersion.js`에서 `DB_VERSION` 상수 관리
  2. **백엔드**: `/web/backend/scripts/db/reset.js`가 DB 리셋 시 자동으로 버전 증가
  3. **백엔드**: `/api/auth/me`에서 `dbVersion` 필드를 함께 반환
  4. **프론트엔드**: `SettingsWizard.tsx`에서 localStorage의 `dbVersion`과 서버의 `dbVersion` 비교
  5. **프론트엔드**: 버전이 다르면 온보딩 관련 localStorage 초기화 후 첫 단계부터 시작
- **핵심**: 정상적인 온보딩 진행 중에는 localStorage 유지, DB 리셋 시에만 초기화
- **DB 리셋 절차**: `node web/backend/scripts/db/reset.js` 실행 (DB 버전 자동 증가 + DB 리셋)

### 2.1 저장소 구조

- `web/`: 프론트엔드 + 백엔드 본체
- `bg/`: 운영 중인 백그라운드 서비스
- `background/`: 레거시 참고용. **새 정책 반영 대상 아님**

### 2.1.1 BusinessAnchor extracted 필드 제거 정책 (2026-03-31)

**배경:**

- 기존: `BusinessAnchor` 모델에 `extracted`(AI 파싱 결과)와 `metadata`(사용자 입력) 필드가 분리
- 문제: AI 파싱 후에도 사용자가 확인/검증하므로 "추출"과 "메타데이터"를 구분할 필요 없음

**변경 사항 (SSOT 통합):**

1. **DB 모델**: `BusinessAnchor.extracted` 필드 **완전 제거**
2. **SSOT**: 모든 사업자 데이터는 `BusinessAnchor.metadata`에 저장
3. **백엔드 API**: `getMyBusiness`는 `metadata`만 반환 (extracted alias 제거)
4. **프론트엔드**: `data.metadata` 사용 (extracted 레거시 제거)
5. **타입 정의**: `BusinessMetadata` 타입 사용 (`LicenseExtracted`는 deprecated)

**레거시 제거 원칙:**

- ❌ extracted 필드/alias 사용 금지
- ✅ metadata가 유일한 SSOT
- ✅ 흡수 통합 시 레거시 완전 제거, SSOT 기준으로 모두 교체
- ✅ 향후 헷갈리지 않게 메모리, 룰, 주석에 명확히 기록

**필드명 통일:**

- `metadata.businessType`: 업태 (구 businessCategory)
- `metadata.businessItem`: 종목
- 프론트엔드와 백엔드 필드명 완전 통일

### 2.2 역할 (role + subRole)

**User 역할 구조:**

- `role`: 사용자의 주요 역할 (requestor | manufacturer | admin | salesman | devops)
  - `requestor`: 의뢰 생성/조회
  - `manufacturer`: 제조 공정 처리 (CA 제조사, 즉 CAM/가공을 담당하는 회사)
  - `admin`: 운영/지원/관리
  - `salesman`: 영업/소개/사업자 연결 관리
  - `devops`: 플랫폼 개발/운영(메이븐 주식회사, 단독 사업자 기본값)

- `subRole`: 사업자 내 역할 (owner | staff | null)
  - `owner`: 사업자 대표 (사업자 등록 완료 시 자동 설정)
  - `staff`: 사업자 직원 (대표가 승인한 소속 직원)
  - `null`: 사업자 미가입 상태 (회원가입만 완료, 사업자 등록 미완료)

**중요:**

- `subRole`은 사업자 가입 완료 시에만 설정됩니다.
- 회원가입 직후에는 `subRole = null` (사업자 미가입)
- 사업자 등록 완료 시 `subRole = "owner"` 자동 설정
- 직원으로 승인될 때 `subRole = "staff"` 자동 설정
- 모든 role (requestor, manufacturer, admin, salesman, devops)에서 `subRole`을 동일하게 사용합니다

**레거시 필드 제거 (2026-03-31):**

- ❌ **`requestorRole`, `manufacturerRole`, `adminRole` 필드 완전 제거**
  - User 모델에서 레거시 필드 자동 설정 로직 제거
  - 모든 컨트롤러, 서비스, 워커에서 레거시 필드 사용 제거
  - 라우터 미들웨어에서 레거시 옵션 파라미터 제거
- ✅ **`subRole`이 유일한 SSOT**
  - `authorize` 미들웨어는 `subRoles` 옵션만 사용
  - 모든 역할에 대해 통합된 `subRoles` 체크 적용
  - DB 쿼리는 `subRole` 필드만 사용
- ✅ **변경된 파일 목록**:
  - `models/user.model.js`: 레거시 필드 자동 설정 로직 제거
  - `middlewares/auth.middleware.js`: `authorize` 함수 `subRoles` 옵션으로 통합
  - `modules/requests/request.routes.js`: 모든 라우트 `subRoles` 옵션 사용
  - `modules/admin/admin.routes.js`: 모든 라우트 `subRoles` 옵션 사용
  - `modules/manufacturer/manufacturer.routes.js`: 모든 라우트 `subRoles` 옵션 사용
  - `modules/snapshots/snapshot.routes.js`: 모든 라우트 `subRoles` 옵션 사용
  - `services/pricingReferralSnapshot.service.js`: `subRole` 필드 사용
  - `scripts/db/seed/data.js`: `subRole` 필드 사용
  - `jobs/monthlyReferralSnapshotWorker.js`: `subRole` 필드 사용
  - `jobs/dailyReferralSnapshotWorker.js`: `subRole` 필드 사용

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
- 현재 구조는 **`User = 사람`, `BusinessAnchor = 법인/사업자 SSOT`** 입니다.
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
- business owner는 사업자를 생성/검증 요청하는 사용자 역할일 뿐, 사업자 생성 이후 관련 데이터의 canonical 귀속 주체는 **owner 개인이 아니라 BusinessAnchor 엔터티 자체**입니다.
- 개인 사용자 기준 처리가 필요한 경우는 인증/세션/알림 수신 주체처럼 **사용자 자체가 엔터티인 기능**으로 한정합니다.

### 2.3.2 BusinessAnchor SSOT 원칙 (Business 컬렉션 완전 제거)

- `BusinessAnchor`는 **모든 사업자 데이터의 단일 SSOT**입니다 (법적 식별, 정산, 소개, 멤버십 통합).
- **`Business` 컬렉션은 완전히 제거되었습니다.** 모든 사업자 관련 데이터는 `BusinessAnchor`에서 관리합니다.
- `BusinessAnchor.businessType`은 `requestor`, `salesman`, `manufacturer`, `devops`, `admin`을 지원합니다.
- `BusinessAnchor`의 natural key는 **정규화된 사업자등록번호(`businessNumberNormalized`)** 이고, DB PK는 Mongo `ObjectId`를 유지합니다.

#### BusinessAnchor 필드 구조

- **법적 식별**: `businessNumberNormalized`, `businessType`, `name`, `metadata` (companyName, address, representativeName 등)
- **멤버십**: `primaryContactUserId` (주대표), `owners` (공동대표 배열), `members` (직원 배열), `joinRequests` (가입 신청 배열)
- **정산**: `payoutAccount`, `payoutRates`
- **소개**: `referredByAnchorId`, `defaultReferralAnchorId`, `referralMembershipAggregate`

#### 핵심 원칙

- 소개 관계의 canonical 키는 **`BusinessAnchor.referredByAnchorId`** 입니다.
- 주문, 크레딧, 정산, 소개 스냅샷, 관리자 overview 스냅샷은 **`businessAnchorId` 기준** 집계/귀속을 기본으로 합니다.
- `User.businessAnchorId`만 사용하며, 레거시 `User.businessId`는 제거되었습니다.
- 온보딩/사업자 설정 저장 시 사업자등록번호가 검증되면 **`BusinessAnchor`를 즉시 생성 또는 upsert**하고, 해당 사업자 소속 `User.businessAnchorId`를 함께 동기화합니다.
- **정말 필수적인 초기값 외에는 fallback을 추가하지 않습니다.** 값이 비어 있으면 프론트에 숨겨 문제를 드러내고, 저장/동기화의 근본 원인을 수정합니다.

#### 크레딧 및 집계 SSOT

- `ChargeOrder`, `CreditLedger`, `TaxInvoiceDraft` 등 사업자 귀속 금전 모델의 canonical 키는 **`businessAnchorId`** 입니다.
- 크레딧 조회/집계/러닝밸런스 계산은 **항상 `businessAnchorId` 기준**으로 수행합니다.
- 백엔드 크레딧 관련 컨트롤러의 쿼리/집계는 `businessAnchorId`만 사용합니다.
- 프론트 관리자 크레딧 페이지와 관련 모달은 조직 선택/표시/실시간 동기화 시 **`businessAnchorId`만** 사용합니다.

#### 역할별 잔액 표시 규칙

**의뢰자 (requestor)**:

- **크레딧 소비액**: 총 사용한 크레딧 금액 (`spentAmount`)
- **크레딧 잔액**: 현재 사용 가능한 크레딧 잔액 (`balance`)
- 내부 데이터: `CreditLedger` 기반 집계

**제조사/영업자/개발운영사/관리자 (manufacturer/salesman/devops/admin)**:

- **미정산 잔액**: 아직 정산되지 않은 수익 금액 (기간 필터 무관, 누적)
- **정산 잔액**: 선택한 기간 동안 정산된 금액 (기간 필터 적용)
- 내부 데이터: 의뢰자의 `spentAmount`(미정산), `balance`(정산 완료) 필드를 재사용하되, UI 라벨만 역할별로 다르게 표시

**중요**: 백엔드는 동일한 필드(`spentAmount`, `balance`)를 제공하고, 프론트엔드에서 `businessType`에 따라 라벨만 변경하여 표시합니다.

### 2.4 수익 분배 (매출 100% 기준)

분배율은 `BusinessAnchor.payoutRates`에 저장되며, **개발운영사 설정 저장 이벤트**에서만 갱신합니다 (SSOT write-on-event).
읽기 경로(대시보드/통계 조회)에서는 저장된 값을 그대로 사용하고, 재계산하지 않습니다.

#### 저장 필드

| 필드                                            | 기본값 | 의미                          |
| ----------------------------------------------- | ------ | ----------------------------- |
| `BusinessAnchor.payoutRates.manufacturerRate`   | 0.65   | 제조사 분배율                 |
| `BusinessAnchor.payoutRates.baseCommissionRate` | 0.05   | 개발운영사 직접 소개 수수료율 |
| `BusinessAnchor.payoutRates.adminRate`          | 0.25   | 관리자 분배율 (나머지)        |

#### 의뢰자 유형별 수수료 (거래 1건 기준)

| 의뢰자 유형                               | 제조사 | 개발운영사  | 영업자         | 관리자         |
| ----------------------------------------- | ------ | ----------- | -------------- | -------------- |
| 소개자 없음 (`referredByAnchorId` = null) | 65%    | 10% (5%+5%) | 0              | 나머지 (25%)   |
| 영업자가 직접 소개                        | 65%    | 5%          | 5%             | 나머지 (25%)   |
| 영업자 간접 소개 (하위 영업자 체인)       | 65%    | 5%          | 7.5% (5%+2.5%) | 나머지 (22.5%) |

> 영업자와 개발운영사 수수료는 동일 거래에 **중복 합산되지 않습니다.**

#### 관리자 범위

- **동적 계산** = 100% - 제조사(65%) - 개발운영사 수수료 - 영업자 수수료
  (나머지 전체를 관리자가 수취)

분배 비율은 개발운영사 설정 화면에서 관리하며, 변경 시 본 문서를 먼저 갱신합니다.

#### 관리자 수익 분배

- **레저**: `AdminCreditLedger` (별도 컬렉션)
- **타입**: `EARN`, `PAYOUT`, `ADJUST`
- **트리거**: 의뢰 결제 시 자동 `EARN` 생성, 정산 시 `PAYOUT` 처리

### 2.5 소개 네트워크 의미 규칙

- `requestor`의 소개는 **그룹 할인 네트워크**입니다.
  - direct circle 기준은 **본인 + 본인을 직접 소개한 사업자 1단계 + 본인이 직접 소개한 사업자 1단계** 입니다.
  - 위 direct circle 멤버는 **모두 같은 소개 할인**을 적용받습니다.
  - **2단계 이상 간접 소개는 제외**합니다.
  - 예: 내 소개자의 다른 소개 사업자는 내 그룹이 아닙니다.
- `salesman`, `devops`의 소개는 **소개 사업자 네트워크**입니다.
  - 그룹 할인 개념이 아니라, 내가 소개한 하위 사업자/소개자를 보는 개념입니다.
  - 통계는 기본적으로 `소개 사업자 수`, `소개 사업자 주문합`, `내 사업자 주문수`를 분리해서 다룹니다.
  - `salesman`은 하위 `requestor`와 하위 `salesman`을 함께 소개 네트워크로 봅니다.
  - `devops`는 하위 `requestor`를 소개 네트워크로 봅니다.
- `admin`은 소개 구조의 **중립적 관찰자**입니다.
  - 관리자 UI는 특정 리더의 소개 네트워크를 조회/비교하는 관점으로 표현합니다.
  - 관리자 화면에서 `group`이라는 표현은 의뢰자 할인 네트워크에 한정하고, 그 외에는 `리더`, `소개 네트워크`, `소개 현황` 표현을 우선합니다.
- 소개 네트워크 차트의 주문량은 역할별 카드/통계와 같은 기준의 **실제 사업자 주문수**를 표시해야 합니다.

### 2.3.1 사업자 대표 가입 및 BusinessAnchor 생성

- **사업자 대표(owner)가 가입할 때** 다음 흐름을 따릅니다:
  1. 사용자가 개인 계정 생성 (User 엔터티)
  2. 온보딩 또는 설정에서 사업자등록증 업로드 및 검증
  3. 검증 완료 시 canonical **BusinessAnchor** 생성 또는 기존 anchor attach
  4. 대표 사용자는 해당 `BusinessAnchor.owners`/`primaryContactUserId`로 귀속
  5. 이후 가입하는 직원들도 같은 `BusinessAnchor.members`로 귀속
- **canonical 귀속 키는 사업자등록번호 검증 완료 시점의 `businessAnchorId`** 이며, 이후 의뢰/크레딧/배송/소개/집계는 `businessAnchorId` 기준으로 처리합니다.
- 사업자 대표와 직원은 모두 같은 BusinessAnchor에 속하며, 개인 사용자 ID가 아니라 **`businessAnchorId`** 를 기준으로 집계합니다.
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
  - requestor 소개 그룹 SSOT는 **direct circle(부모 1단계 + 본인 + 자식 1단계)** 기준으로 유지합니다.
  - rolling 30일 주문합처럼 시간 경과만으로도 값이 바뀌는 집계는 **write-on-event + 일자 경계 rollover/reconcile** 방식으로 유지합니다.
  - 따라서 소개 수/그룹 멤버 수/소개 트리는 `User.referredByAnchorId`가 아니라 **`BusinessAnchor.referredByAnchorId`만 읽습니다.**
  - read API, 카드 렌더링, 통계 조회에서는 SSOT를 다시 계산하지 않습니다.
  - 필요한 경우 배치/백필은 허용하지만, 그 목적은 **SSOT를 복구/정렬**하는 것이지 read-path 계산을 대체하는 것이 아닙니다.
- requestor 할인/주문합 집계는 **조회 시 계산**이 아니라 **materialized aggregate**로 유지합니다.
  - 관계 집계는 `BusinessAnchor.referredByAnchorId` 기준의 **direct circle membership aggregate** 를 사용합니다.
  - 주문 집계는 사업자별 **일자 bucket aggregate** 를 기본 단위로 사용하고, rolling 30일 값은 그 bucket 합으로 유지합니다.
  - read path는 aggregate를 그대로 읽고, 집계가 비어 있다고 해서 레거시 실시간 전체 재계산으로 되돌아가지 않습니다.
- requestor direct circle aggregate에 영향을 주는 canonical 이벤트는 다음과 같습니다.
  - `BusinessAnchor` 생성/attach
  - `BusinessAnchor.referredByAnchorId` 변경
  - `BusinessAnchor.businessType` 변경
  - `BusinessAnchor.status` 변경(`active`, `inactive`, `merged`)
  - 사업자 삭제, anchor 삭제, 사업자 재연결/이관
- requestor rolling 30일 주문합 aggregate에 영향을 주는 canonical 이벤트는 다음과 같습니다.
  - `shippingPackageId` 기준 request의 박스 편입/제거
  - `shipDateYmd` 변경
  - 배송 완료/취소/롤백처럼 **박스 기준 주문합 포함 여부**가 바뀌는 이벤트
  - 사업자 변경 등으로 `businessAnchorId` 귀속이 바뀌는 이벤트
- 다음 이벤트는 requestor rolling 주문합 aggregate의 canonical source로 직접 삼지 않습니다.
  - 단순 `request-created`
  - 단순 `enter-machining`
  - aggregate 포함 여부를 바꾸지 않는 일반 공정 이동
- event-driven aggregate는 **idempotent event 처리**를 기본으로 합니다.
  - 같은 이벤트를 두 번 받아도 결과가 같아야 합니다.
  - 가능하면 `eventKey` 또는 source document version 기준으로 중복 반영을 막습니다.
  - 실패 복구를 위해 aggregate는 anchor 단위 targeted rebuild가 가능해야 합니다.
- 배치 작업은 제거 대상이 아니라 역할이 축소되는 대상입니다.
  - 전체 read-path 계산을 대신하지 않고, **자정 rollover**, **누락 복구**, **reconcile/backfill** 만 담당합니다.

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

### 4.3.2 신규 의뢰 생성 엔드포인트 (SSOT)

**신규 의뢰 생성은 `POST /api/requests/from-draft` 엔드포인트만 사용합니다.**

- **표준 엔드포인트**: `POST /api/requests/from-draft`
  - Draft 기반 워크플로우 사용
  - 파일 업로드 → Draft 생성 → Draft 수정 → Draft를 Request로 전환
  - 중복 체크, 크레딧 체크, 트랜잭션 처리 모두 포함
  - 프론트엔드: `useNewRequestSubmitV2.ts` 사용
  - 백엔드: `creation.from-draft.controller.js`의 `createRequestsFromDraft` 함수
- **Deprecated**: `POST /api/requests/bulk`
  - 레거시 엔드포인트 (Draft 없이 직접 생성)
  - 2026-04-08 이후 사용 금지
  - 기존 코드 호환성을 위해 유지하되, 새 기능 개발 시 사용하지 않음
  - 프론트엔드: `useNewRequestSubmit.ts` (사용 중단 예정)
  - 백엔드: `creation.request.controller.js`의 `createRequestsBulk` 함수
- **통합 이유**:
  - 두 엔드포인트가 같은 목적(신규 의뢰 생성)으로 중복 사용됨
  - Draft 기반 워크플로우가 더 안정적이고 확장 가능
  - 크레딧 체크 로직 중복 방지
  - 유지보수 복잡도 감소

### 4.3.3 신규 의뢰 시 크레딧 사전 체크

**의뢰자가 신규 의뢰를 생성할 때, 향후 발생할 의뢰비와 배송비를 사전에 체크하여 부족 시 의뢰 생성을 거부합니다.**

- **체크 시점**:
  1. **프론트엔드 사전 체크** (의뢰하기 버튼 클릭 시)
     - Draft 조회하여 배송 날짜별 그룹화 (`GET /api/requests/drafts/:draftId`)
     - 크레딧 잔액 조회 (`GET /api/credits/balance`)
     - 예상 비용 계산:
       - 의뢰비: 건당 10,000원 가정
       - 배송비: `estimatedShipYmd`별로 그룹화하여 박스 수 계산 → 박스 수 × 3,500원
     - 부족 시 **업로드 전에 차단**하고 10초 토스트 표시
     - 목적: 사용자에게 빠른 피드백 제공, 불필요한 업로드 방지
  2. **백엔드 최종 체크** (의뢰 생성 API 호출 시)
     - 정확한 가격 계산 후 크레딧 체크
     - 트랜잭션 내에서 최종 검증
     - 목적: 데이터 무결성 보장
- **체크 항목**:
  1. **의뢰비 (machining fee)**: 전체 의뢰 건수 × 건당 가격
  2. **배송비 (shipping fee)**: 묶음 배송 박스 수 × 박스당 배송비
- **크레딧 구분**:
  - **의뢰비 사용 가능 크레딧**: `paidCredit + bonusRequestCredit`
  - **배송비 사용 가능 크레딧**: `paidCredit + bonusShippingCredit`
  - `paidCredit`은 의뢰비/배송비 모두 사용 가능
  - `bonusRequestCredit`은 의뢰비만 사용 가능
  - `bonusShippingCredit`은 배송비만 사용 가능
- **거부 조건**:
  - 의뢰비 사용 가능 크레딧 < 전체 의뢰비 → **전체 거부**
  - 배송비 사용 가능 크레딧 < 전체 배송비 → **전체 거부**
  - 일부만 의뢰하는 방식은 사용하지 않음
- **에러 응답**:
  - HTTP 402 Payment Required
  - 메시지: 부족한 크레딧 종류와 필요 금액을 명확히 안내
  - 예: "의뢰비 크레딧이 부족합니다. 필요: 50,000원, 보유: 30,000원. 크레딧을 충전한 뒤 다시 시도해주세요."
  - 예: "배송비 크레딧이 부족합니다. 필요: 10,000원, 보유: 5,000원. 크레딧을 충전한 뒤 다시 시도해주세요."
  - 예: "의뢰비와 배송비 크레딧이 모두 부족합니다. 의뢰비 필요: 50,000원 (보유: 30,000원), 배송비 필요: 10,000원 (보유: 5,000원). 크레딧을 충전한 뒤 다시 시도해주세요."
- **프론트엔드 처리**:
  - 402 에러 수신 시 토스트로 안내 메시지 표시
  - **크레딧 부족 토스트 duration: 10초** (사용자가 충분히 읽을 수 있도록)
  - 일반 에러 토스트 duration: 3-5초
  - 크레딧 충전 페이지로 이동할 수 있는 버튼 제공 (향후 추가)
- **주의사항**:
  - 실제 차감은 여전히 CAM 승인(의뢰비) / 세척.패킹 승인(배송비) 시점에 발생
  - 사전 체크는 의뢰 생성 가능 여부만 판단하는 용도
  - 의뢰 생성 후 ~ 차감 전 사이에 크레딧이 부족해질 수 있으므로, 차감 시점에도 잔액 체크 필요

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
- **의뢰자별 주간 발송 요일(`BusinessAnchor.shippingPolicy.weeklyBatchDays`) 필터**:
  - 의뢰자는 발송 요일을 **복수 선택**할 수 있으며, 실제 발송일은 **오늘 기준 가장 먼저 도래하는 선택 요일**입니다.
  - 우편함에 먼저 생산되어 들어와 있던 제품도 조기 발송하지 않고, **그 가장 빠른 다음 발송일이 올 때까지 계속 모아 두었다가 한 번에 같은 박스로 발송**합니다.
  - 우편함이 속한 의뢰자 조직의 `weeklyBatchDays`에 오늘(KST 요일)이 포함되지 않으면, 즉 **가장 빠른 다음 발송일이 오늘이 아니면** 해당 우편함은 **오늘 발송 대상에서 자동 제외**합니다.
  - 대상 액션: 운송장 출력(초기 선택 및 수동 선택), 택배 접수/취소, MOCK 집하. (단순 `리셋`은 모든 점유 우편함을 대상으로 유지.)
  - UI: 해당 우편함은 앰버(호박) 색 배경 + 점선 테두리로 구분되고, 좌상단에 다음 발송 요일 뱃지를 표시하며 툴팁에 `다음 발송: #요일` 문구를 덧붙입니다.
  - SSOT: 프론트는 `/api/requests?view=worksheet&worksheetProfile=shipping` 응답의 `item.business.shippingPolicy.weeklyBatchDays`를 사용합니다. 정책이 비어 있으면(`weeklyBatchDays.length === 0`) 기존 동작과 동일하게 **오늘 발송 가능**으로 간주합니다(하위 호환).
- 한진 API 프로세스:
  1. **택배 접수**: 한진 API로 주문 등록 → `wblNo`(운송장 번호) 획득 → `accepted` 상태
  2. **운송장 출력**: `wblNo` 포함하여 라벨 출력 → `printed` 상태
  3. **창고 실물 대조**: 출력된 라벨을 들고 창고에서 우편함 실물과 대조
  4. **웹앱 수정**: 중복 제품 제거, 누락 제품 처리 (부분 롤백 또는 전체 미발송)
  5. **라벨 재출력**: 변경된 우편함만 다시 출력
  6. **재접수**: 수정 후 택배 접수 재실행 (멱동성 처리로 안전)

#### 4.4.1 한진 라벨 출력 엔드포인트 구분 (SSOT)

**라벨 출력에는 두 가지 백엔드 엔드포인트가 있으며, 반드시 상황에 맞게 선택해야 합니다.**

- **`POST /api/requests/shipping/hanjin/pickup-and-print`** (통합 접수+출력)
  - 사용 조건: 대상 우편함 중 하나라도 `accepted` / `picked_up` 상태가 **아닌** 경우
  - 동작: 한진 API에 접수 요청 → `wbl_num` 획득 → ZPL 라벨 생성 → 출력/PDF 변환
  - `wbl_num`이 없으면 ZPL이 빈 문자열로 생성되어 라벨이 정상 출력되지 않으므로, 반드시 이 엔드포인트를 먼저 호출해야 함
  - 멱등성 보장: 이미 `accepted` 상태인 우편함은 내부적으로 스킵하고 `wbl_num`만 재사용

- **`POST /api/requests/shipping/hanjin/print-labels`** (라벨 재출력 전용)
  - 사용 조건: 대상 우편함이 **모두** `accepted` 또는 `picked_up` 상태인 경우 (DB에 `wbl_num` 이미 존재)
  - 동작: DB에서 `wbl_num` 직접 조회 → ZPL 라벨 생성 → 출력/PDF 변환
  - `wbl_num` 없이 이 엔드포인트를 호출하면 빈 ZPL이 생성되고 `saveGeneratedWaybillPngs`에서 필터링되어 아무것도 다운로드되지 않음

**프론트엔드 라우팅 원칙 (`handlePrintOnly`):**

- `needsPickupBeforePrint = effectiveTargetAddresses.some(addr => status !== "accepted" && status !== "picked_up")`
- `needsPickupBeforePrint === true` → `pickup-and-print` 사용
- `needsPickupBeforePrint === false` → `print-labels` 사용

**`wbl_num` (운송장 번호) 의존성:**

- ZPL 라벨 생성의 SSOT는 `wbl_num`입니다.
- `wbl_num`은 한진 API 접수(pickup) 시 획득되며, DB의 `request.deliveryInfoRef` 또는 한진 응답에서 관리됩니다.
- `wbl_num` 없이 ZPL을 생성하면 빈 문자열이 반환되고, 프론트엔드의 `saveGeneratedWaybillPngs`는 `wbl_num`이 없는 row를 필터링합니다.
- 따라서 최초 출력은 반드시 `pickup-and-print`를 통해 `wbl_num`을 먼저 확보해야 합니다.

**출력 모드:**

- `shippingOutputMode = "pdf"`: ZPL → PDF 변환 후 브라우저 다운로드 (비동기)
- `shippingOutputMode = "print"`: ZPL을 직접 프린터 서버(`WBL_PRINT_SERVER_BASE`)에 전송

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
- 운영 기준 시각은 **오후 2시 라벨 출력, 오후 4시 집하(code 11)** 입니다. `printed`는 출력 완료, `accepted`는 접수 완료, `picked_up`는 집하 완료, `completed`는 최종 배송 완료를 의미합니다. **정오(12:00 KST) 이전 접수분은 같은 날 집하(16:00), 이후 접수분은 다음 영업일 집하** 기준으로 작업을 계획합니다.
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

### 4.7 승인 직렬 큐 처리 정책 (ReviewApprovalQueue)

**배경:**

- 제조사 워크시트에서 작업자가 의뢰/CAM 단계 의뢰를 빠르게 연속 승인하면, 백엔드와 BG 앱(rhino, esprit, bridge, lot, pack, wbls)이 동시 요청을 받아 충돌 및 과부하가 발생한다.

**정책:**

1. **모달 즉시 닫기**: 승인 버튼 클릭 → `keepPreviewOpen: false` → 모달 즉시 닫힘. 다음 의뢰는 자동으로 열리지 않는다.
2. **다음 의뢰 자동 열기 금지**: `onOpenNextRequest` / `handleOpenNextRequest` 호출을 제거한다. 작업자가 직접 다음 의뢰 카드를 선택한다.
3. **BG 트리거 직렬 큐**: DB 트랜잭션(credit 차감, stage 변경 등)은 HTTP 요청 내에서 즉시 처리하되, BG 앱 트리거(Esprit NC 생성, 장비 배정, 자동 가공 시작 등)는 `ReviewApprovalQueue` 컬렉션에 enqueue한다.
4. **워커 직렬 처리**: 서버 시작 시 `startReviewApprovalWorker()`가 실행되어 큐를 FIFO 순서로 하나씩 처리한다. 처리 중인 항목이 있으면 다음 항목은 PENDING 상태로 대기한다.
5. **중복 방지**: `uniqueKey = taskType:requestMongoId`로 unique index. 이미 PENDING/PROCESSING 상태인 항목은 중복 등록하지 않는다.
6. **재시도**: 처리 실패 시 최대 3회(기본값) 재시도. 초과 시 FAILED로 기록하고 프론트에 `request:async-action-failed` 이벤트를 발행한다.
7. **잠금 해제**: LOCK_TIMEOUT_MS(기본 30초) 초과 시 잠금을 해제하여 워커 크래시 대비.

**적용 단계:**

- `REQUEST_STAGE_APPROVED` (의뢰 단계): Esprit NC 생성 트리거
- `CAM_STAGE_APPROVED` (CAM 단계): 장비 배정 + CNC 자동 가공 트리거

**관련 파일:**

- `web/backend/models/reviewApprovalQueue.model.js` — 큐 컬렉션 스키마
- `web/backend/services/reviewApprovalQueue.service.js` — enqueue/worker/executeTask 로직
- `web/backend/controllers/requests/common.review.controller.js` — enqueueApproval 호출
- `web/backend/server.js` — startReviewApprovalWorker() 등록
- `web/frontend/…/components/PreviewModal.tsx` — keepPreviewOpen: false + onOpenChange(false)
- `web/frontend/…/components/RequestPage.tsx` — onOpenNextRequest prop 제거
- `web/frontend/…/packing/components/PackingPageContent.tsx` — onOpenNextRequest prop 제거

**금지 사항:**

- 승인 즉시 다음 의뢰 자동 열기 (`handleOpenNextRequest` 재도입 금지)
- BG 트리거를 HTTP 요청 내에서 직접 동기/비동기 실행하는 방식 재도입 금지 (연속 요청 충돌 원인)
- 큐 없이 `Promise.resolve().then()` 패턴으로 BG 트리거를 처리하는 방식 금지

**모니터링:**

- `GET /api/requests/approval-queue/status` — 큐 상태(pending/processing/failed/completed24h) 조회 (제조사/관리자)
- 환경변수: `REVIEW_APPROVAL_QUEUE_POLL_MS` (폴링 간격, 기본 1500ms), `REVIEW_APPROVAL_QUEUE_LOCK_TIMEOUT_MS` (잠금 해제 기준, 기본 30000ms)

### 4.8 가공 워크시트/장비 페이지 큐 완전 분리 정책

**두 가공 경로는 반드시 독립적으로 운영되며 절대 혼용하지 않는다.**

#### 4.8.1 채널 정의

| 채널                             | 데이터 소스                                    | 관리 주체                              | 화면                 |
| -------------------------------- | ---------------------------------------------- | -------------------------------------- | -------------------- |
| **의뢰건 자동 가공 (Worksheet)** | `Request.manufacturerStage = "가공"` (MongoDB) | 생산 큐 (`getProductionQueues`)        | 작업-가공 페이지     |
| **수동 파일 가공 (Equipment)**   | `CncMachine.bridgeQueueSnapshot` (DB 스냅샷)   | 브리지 큐 (`getBridgeQueueForMachine`) | 장비 페이지 예약목록 |

#### 4.8.2 브리지 큐 스냅샷 오염 금지

- **장비 페이지 브리지 큐**에는 `source = "manual_upload"` 항목(작업자가 장비 페이지에서 직접 올린 파일)만 포함되어야 한다.
- `source = "request_auto"` 항목(의뢰건 자동 가공)은 브리지 큐 스냅샷에 **절대 저장하지 않는다.**
- 의뢰건 자동 가공 트리거(`triggerNextAutoMachiningAfterComplete`)는 브리지 `process-file` API를 **직접 호출**하여 즉시 실행하며, 브리지가 자체 큐에 올리더라도 **백엔드 DB 스냅샷은 갱신하지 않는다.**
- 가공 완료 후 브리지 큐를 재읽어 스냅샷을 동기화할 때는 `requestId`가 있는 항목(의뢰건)을 **자동으로 제거**하고 저장한다.

#### 4.8.3 우선순위 정책

가공 완료 후 다음 작업 결정 순서:

1. **장비 페이지 수동 파일 우선**: 브리지 큐 스냅샷에 `source = "manual_upload"` 항목이 남아 있으면, 의뢰건 자동 가공을 **건너뛴다.** 수동 파일은 브리지가 자체적으로 순서대로 처리한다.
2. **의뢰건 자동 가공**: 수동 파일 큐가 비어 있을 때만 다음 의뢰건을 `process-file`로 트리거한다.

#### 4.8.4 관련 플래그 구분

- **`allowAutoMachining`**: 작업-가공 페이지 의뢰건 자동 가공 허용 여부. 의뢰건 자동 가공 트리거(`triggerNextAutoMachiningAfterComplete`)의 실행 조건.
- **`allowJobStart`**: 장비 페이지 작업자 수동 가공 시작 허용 여부. 수동 파일 큐 실행 조건.
- 두 플래그는 독립적이며 혼용하지 않는다.

#### 4.8.5 스냅샷 정리 (reconcile)

- `POST /api/cnc-machines/:machineId/bridge-queue/reconcile`: 현재 브리지 큐 스냅샷에서 `requestId` 있는 의뢰건 항목을 제거하고 저장하는 관리자/제조사 전용 엔드포인트.
- DB 마이그레이션이나 수동 정리 시 사용한다.

#### 4.8.6 프론트엔드 업로드 훅 분리

**두 업로드 경로는 완전히 다른 API를 사용하여 섞일 수 없도록 강제됩니다.**

| 훅 파일                                                                    | 용도                           | API 경로                                                            | 특징                                                                        |
| -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useLabUpload.ts` | 의뢰건 자동 가공 (작업 페이지) | `POST /api/cnc-machines/:machineId/lab/presign` + `.../lab/enqueue` | requestId 포함, S3 presign 업로드 → DB 생산 큐 등록, source="request_auto"  |
| `/web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useManUpload.ts` | 수동 파일 업로드 (장비 페이지) | `POST /api/cnc-machines/:machineId/man/upload`                      | requestId 없음, 파일 → 백엔드 경유 → bridge 큐 등록, source="manual_upload" |

**경로 이름 의미**:

- `/lab/` = **laboratory(기공소)**. 기공소에서 접수된 의뢰건의 자동가공 전용. 프론트가 S3에 직접 presign PUT 업로드.
- `/man/` = **manual(수동)**. 작업자가 장비 페이지에서 직접 올리는 수동 업로드 전용. 파일을 백엔드 경유로 수신 후 bridge-store 저장.

**구 경로 → 신 경로 매핑** (코드 내 레거시 참조 금지):

- `/direct/presign` + `/direct/enqueue` → `/lab/presign` + `/lab/enqueue`
- `/continuous/upload`, `/smart/upload` → `/man/upload`
- S3 저장 경로: `bg/3-direct/` → `bg/3-lab/` (Lab), `bg/3-man/` (Man)

**중요**: 두 훅은 서로 다른 백엔드 엔드포인트를 호출하므로, 애초에 섞일 수 없는 구조입니다. 별도의 강제 구분 코드가 필요하지 않습니다.

#### 4.8.7 금지 사항

- `triggerNextAutoMachiningAfterComplete` 완료 후 브리지 큐 스냅샷을 재읽어 DB에 저장하는 것 금지.
- 의뢰건 NC 파일 경로가 브리지 큐 스냅샷 `jobs` 배열에 `requestId`와 함께 남아 있는 것 금지.
- 두 업로드 훅을 같은 컴포넌트에서 혼용하는 것 금지 (각 페이지는 하나의 훅만 사용).
- 두 큐를 하나의 `bridgeQueueSnapshot`으로 합산하여 표시하는 것 금지.

---

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

#### 5.2.1 반응형 디자인 정책

**대시보드 통계 카드 그리드:**

- 모바일 (기본): 1열
- sm (≥ 640px): 2열
- md (≥ 768px): 4열
- xl (≥ 1280px): 6열
- 기본 클래스: `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5`
- 위치: `/web/frontend/src/shared/ui/dashboard/DashboardShell.tsx`

**대시보드 중앙 카드 섹션 (topSection):**

- 모바일 (기본): 1열
- lg (≥ 1024px): 2열
- xl (≥ 1280px): 3열
- 기본 클래스: `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-stretch`
- 적용 대상:
  - 의뢰자 대시보드: 가격 정책, 발송 요약, 묶음 배송 카드
  - 제조사 대시보드: 소재, 공구, 장비, 제품 관리 카드

**통계 카드 텍스트 크기:**

- 카드 제목: `text-sm sm:text-md`
- 통계 값: `text-lg sm:text-xl md:text-2xl`
- 변화율 텍스트: `text-xs` + `truncate`
- 아이콘: `flex-shrink-0` 추가하여 텍스트 넘침 방지

**텍스트 간결화 원칙:**

- 공백 최소화: `+0% / +0%` → `+0%/+0%`
- 단위 축약: `0건/0박스` → `0/0박`
- 라벨 축약: `전 기간 대비` → `전기간대비`
- 말줄임표: 긴 텍스트에 `truncate` 클래스 적용

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

### 5.4.1 STL 프리뷰 캐시 무효화 (2026-05-20)

**문제**: Rhino 백엔드가 filled STL 파일을 재생성 후 S3에 업로드하고 DB 메타데이터를 갱신해도, 프론트 IndexedDB 캐시 키가 변경되지 않으면 구 STL 파일이 계속 표시됨.

**캐시 키 구성**:

- `buildBlobCacheKey()`는 `s3Key + fileSize + uploadedAt` 조합으로 캐시 키 생성
- 백엔드가 새 파일을 S3에 업로드하면 `uploadedAt`이 갱신되어 캐시 키가 변경됨
- 캐시 miss 시 새 파일 다운로드, 캐시 hit 시 IndexedDB에서 로드

**무효화 흐름**:

1. **Rhino-server 재생성 완료** → 백엔드 `registerProcessedFile` 호출
2. **백엔드 DB 갱신** → `caseInfos.camFile.uploadedAt`에 `new Date()` 저장
3. **실시간 이벤트 발행** → `request:stage-changed` with `payload.request` (최신 메타데이터 포함)
4. **프론트 즉시 패치** → `applyRequestPatch()`로 리스트 상태 동기 갱신 (새 `uploadedAt` 반영)
5. **캐시 키 변경 인식** → 새 키로 프리뷰 로드 시 IndexedDB miss → S3에서 신규 다운로드

**중요한 구현 패턴**:

1. **Stale closure 방지**: `useWorksheetRealtimeStatus`의 `onNotification` 핸들러에서 `previewOpen`, `previewFiles`, `fetchRequestsCore`, `handleOpenPreview`를 deps에 넣지 않고 항상 최신값 참조하려면 `latestRef.current` 패턴 사용

   ```typescript
   const latestRef = useRef({
     previewOpen,
     previewFiles,
     fetchRequestsCore,
     handleOpenPreview,
   });
   latestRef.current = {
     previewOpen,
     previewFiles,
     fetchRequestsCore,
     handleOpenPreview,
   };
   // 핸들러 내부에서는 latestRef.current.previewOpen 등으로 접근
   ```

2. **이벤트 payload 즉시 활용**: `request:stage-changed` 이벤트는 이미 `normalizedUpdatedRequest` (새 `camFile.uploadedAt` 포함)를 `payload.request`에 담고 있음. 단순히 `fetchRequests(true)`만 트리거하면 re-fetch 완료 전 사용자가 프리뷰 열어 구 캐시 키 사용 가능. 반드시 `applyRequestPatch()`로 먼저 동기 적용 후 re-fetch.

3. **수동 재계산 버튼**: `PreviewModal`의 재계산 버튼은 `recalculate()` 폴링 완료 후 `onRefreshPreview(activeReq, { forceRefresh: true })` 호출. `forceRefresh=true`는 IndexedDB 캐시 읽기/쓰기 모두 우회하여 S3에서 직접 다운로드.

**관련 파일**:

- `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts` — 소켓 이벤트 핸들러, stale closure fix, 즉시 패치 로직
- `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader.ts` — 캐시 키 생성, `forceRefresh` 옵션 처리
- `web/backend/controllers/bg/bg.controller.js` — `registerProcessedFile`, `uploadedAt` 갱신, `request:stage-changed` 이벤트 발행

### 5.5 Guide Tour

- Guide Tour 기능은 더 이상 사용하지 않습니다.
- 관련 코드와 문서는 제거합니다.

### 5.6 코드 구조 및 파일 위치 규칙

#### 역할별 폴더 분리

- 각 역할(role)에 특화된 페이지/컴포넌트는 반드시 해당 역할의 폴더에만 작성합니다.
  - `pages/salesman/` — 영업자 전용
  - `pages/devops/` — 개발운영사 전용
  - `pages/requestor/` — 의뢰자 전용
  - `pages/admin/` — 관리자 전용
  - `pages/manufacturer/` — 제조사 전용
- 하나의 파일 안에서 `isDevops`, `isSalesman` 등의 플래그로 여러 역할 UI를 혼용하지 않습니다.
  - 역할별로 별도 파일을 만들고, 공통 로직만 `shared/` 또는 `features/`로 추출합니다.

#### 공통 코드 위치

- 여러 역할이 공유하는 코드는 반드시 `features/` 또는 `shared/`에 작성합니다.
  - `features/` — 도메인 특화 공통 로직: 훅, 비즈니스 로직, 타입 (예: `features/commission/`)
  - `shared/` — 범용 UI 컴포넌트, API 클라이언트, 유틸리티, 공통 훅 (예: `shared/hooks/`, `shared/ui/`)
- 백엔드도 동일 원칙: 역할 공통 로직은 `controllers/common/` 또는 `*.helpers.js` 파일로 분리합니다.

#### 주석 필수 위치

- 헷갈릴 수 있는 코드, 특히 다음 경우에는 반드시 상세 주석을 남깁니다.
  - 역할별 수수료 계산 분기 (devops vs salesman 차이)
  - SSOT write 트리거와 이벤트 경계
  - 공통 훅/컴포넌트를 역할별로 다르게 사용하는 지점

## 6. Backend 규칙

### 6.1 공통

- 백엔드는 프로젝트의 허브입니다.
- 외부 장비, BG 서비스, 프론트 간 실시간/제어 흐름은 백엔드가 중개합니다.
- overview 성 집계는 프론트 재합산이 아니라 백엔드 스냅샷을 SSOT로 사용합니다.
- requestor 대시보드 계열 성능 최적화는 **요청 시 재계산보다 이벤트 기반 스냅샷/증분 캐시 갱신**을 우선합니다.
- 대상 API는 우선 `pricing-referral-stats`, `bulk-shipping`, `dashboard-summary`로 보고, canonical 집계 키는 **user가 아니라 `businessAnchorId`** 기준을 사용합니다.
- 스냅샷/증분 캐시 갱신 시점은 최소한 **소개 가입자 생성, 신규의뢰 생성, CAM 승인에 따른 의뢰 과금 진입, 세척.패킹 승인에 따른 배송비 과금 진입, 포장.발송/발송/집하 상태 변경, 관련 롤백, 매일 자정 배치**를 포함해야 합니다.
- **제조사 공정 승인/롤백 시 캐시 무효화**: 제조사가 공정을 승인하거나 롤백할 때마다 해당 의뢰자의 `dashboard-summary`, `bulk-shipping`, `pricing-referral-stats` 캐시를 즉시 무효화하고 스냅샷을 재계산합니다. 이는 `common.review.controller.js`의 `updateReviewStatusByStage` 함수에서 `triggerDashboardSummaryRefreshForAnchorId`를 호출하여 구현됩니다.
- **캐시 무효화 대상**: 의뢰자(requestor), 영업자(salesman), 개발운영사(devops), 관리자(admin) 모두 동일한 이벤트 기반 무효화 메커니즘을 사용합니다. 공정 변경 시 관련된 모든 역할의 캐시가 무효화됩니다.
- 위 API들은 cold path 단축을 위해 **읽기 시 fallback 재계산은 최소화**하고, 가능하면 이벤트 후처리/배치에서 미리 값을 준비합니다.
- `bulk-shipping`은 `businessAnchorId + ymd` 기준 materialized snapshot을 사용하고, payload는 `pre`, `post`, `waiting` 세 묶음을 저장합니다. 읽기 API는 snapshot을 우선 조회하고, 누락 시에만 최소 fallback 재계산 후 snapshot을 채웁니다.
- `dashboard-summary`는 한 번에 모든 카드를 재계산하지 말고 조각 snapshot으로 분해합니다. 현재 1차 대상은 `stats`와 `manufacturingSummary`이며, `businessAnchorId + ymd + periodKey` 기준으로 저장합니다. `riskSummary`, `recentRequests`처럼 변동성이 크거나 상세 리스트 성격이 강한 구간은 우선 live 계산을 유지하고, 이후 별도 snapshot 또는 증분 캐시로 분리합니다.

### 6.1.1 제조사 정산 페이지

- 제조사 정산은 **자정 배치 스냅샷 방식을 사용하지 않는다**. `ManufacturerDailySettlementSnapshot` 컬렉션 기반 접근은 폐기 방향이며, 신규 구현은 원장(ledger) 라이브 집계를 사용한다.
- **일별 정산 집계 API**: `GET /api/manufacturer/credits/daily-summary`
  - `ManufacturerCreditLedger`에서 `$dateToString timezone: "Asia/Seoul"`로 KST 일자별 `$group` 집계
  - `EARN(non-SHIPPING_PACKAGE)` → `earnRequest`, `EARN(SHIPPING_PACKAGE)` → `earnShipping`, `REFUND`, `PAYOUT`, `ADJUST` 별도 합산
  - `netAmount = earnRequest + earnShipping + refund + payout + adjust`
  - 쿼리 파라미터: `fromYmd`, `toYmd` (KST YYYY-MM-DD), `limit` (최대 366)
- **정산 원장 API**: `GET /api/manufacturer/credits/ledger` — 페이지네이션 + 검색, 무한스크롤
- **입금 내역 API**: `GET /api/manufacturer/payments` — 페이지네이션 + 상태 필터, 무한스크롤
- 모든 날짜 표시는 `timeZone: "Asia/Seoul"` 명시 필수.
- 원장 `type` 표시: `EARN=적립`, `REFUND=환불`, `PAYOUT=정산`, `ADJUST=조정`.
- `SnapshotRecalcAllButton`(수동 재계산 버튼)은 제조사 정산 페이지에서 사용하지 않는다.

### 6.1.2 영업자·개발운영사 정산 페이지

- 영업자(`SalesmanPaymentsPage`)와 개발운영사(`DevopsDashboardPage`) 정산 데이터는 **`useCommissionDashboard` 훅**을 공유한다. 역할별 UI 분기는 각 페이지에서 처리하며, 훅 내부에는 두지 않는다.
- 데이터 소스: `GET /api/salesman/dashboard?period=...` — 스냅샷 없음, 항상 live 계산.
- 정산 원장: `SalesmanLedgerModal` (영업자) 또는 `CommissionLedgerInline` (개발운영사) 컴포넌트 사용.
- `commissionRate`, `indirectCommissionRate`(영업자 전용), `payoutDayOfMonth`는 백엔드가 반환하며 프론트는 그대로 표시한다.

### 6.1.3 관리자 정산 페이지

- **영업자·개발운영사 크레딧 overview API**: `GET /api/admin/credits/salesmen/overview?period=...`
  - `AdminSalesmanCreditsOverviewSnapshot` 스냅샷 **읽기를 사용하지 않는다**. 요청마다 live 계산(`recalcAdminSalesmanCreditsOverviewSnapshot`)을 수행하고 결과를 반환한다.
  - `recalcAdminSalesmanCreditsOverviewSnapshot`은 계산 결과를 `AdminSalesmanCreditsOverviewSnapshot`에 side-effect로 기록한다(`getAdminSnapshotsStatus` 참조용). 이 기록은 read path에서 사용하지 않는다.
- **salesmen 목록 API**: `GET /api/admin/credits/salesmen` — `startDate`/`endDate` 쿼리 파라미터로 기간 필터 적용 필수. 프론트에서 `periodToRangeQuery(period)`로 변환하여 전달.
- **제조사 summary API**: `GET /api/admin/credits/manufacturer/summary?period=...` — `ManufacturerCreditLedger` live 집계.
- 프론트에서 `businessAnchorId` 기준 그룹핑(영업자 탭 카드)을 수행하는 `useMemo` 집계 로직은 추후 백엔드 endpoint(`/api/admin/credits/salesmen/by-anchor`)로 이관 예정.
- `recalcAllSnapshots`(`POST /api/snapshots/recalc-all`)은 **admin 전용**. 현재는 referral 스냅샷(`PricingReferralRolling30dAggregate`)만 재계산한다. 제조사·영업자 크레딧 스냅샷 재계산 로직은 제거됨.

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

**CreditLedger 필드 구조 및 집계:**

- `CreditLedger`는 `type`과 `refType`으로 크레딧 종류를 구분합니다.
- **무료 의뢰 크레딧** (`bonusRequestCredit`):
  - 충전: `type = "BONUS"` AND `refType ≠ "FREE_SHIPPING_CREDIT"`
  - 소비: `type = "SPEND"` AND `refType ≠ "SHIPPING_PACKAGE"` AND `spentBonusAmount > 0`
- **무료 배송비 크레딧** (`bonusShippingCredit`):
  - 충전: `type = "BONUS"` AND `refType = "FREE_SHIPPING_CREDIT"`
  - 소비: `type = "SPEND"` AND `refType = "SHIPPING_PACKAGE"` AND `spentBonusAmount > 0`
- **유료 크레딧** (`paidCredit`):
  - 충전: `type IN ["CHARGE", "REFUND"]`
  - 조정: `type = "ADJUST"`
  - 소비: `type = "SPEND"` AND `spentPaidAmount > 0`
- **프론트엔드 표시용 무료 잔액** (`bonusBalance`): `bonusRequestCredit + bonusShippingCredit`
- **총 잔액** (`balance`): `paidCredit + bonusRequestCredit + bonusShippingCredit`

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
  - 그룹은 **나를 소개한 사업자(부모) + 나 + 내가 직접 소개한 사업자(자녀)** 로 구성됩니다.
  - 직접 연결(부모↔나↔자녀) 관계만 그룹에 포함되며, 2단계 이상 간접 소개는 그룹 할인에 포함되지 않습니다.
  - 각 사업자의 할인 단가는 **자신이 속한 모든 그룹 구성원의 주문량을 합산**하여 개별적으로 결정됩니다.
  - 예: A가 B·C를 소개하고, B가 D를 소개한 경우
    - A: A+B+C 합산 (자녀: B·C)
    - B: A+B+D 합산 (부모: A, 자녀: D)
    - C: A+C 합산 (부모: A, 자녀 없음)
    - D: B+D 합산 (부모: B, 자녀 없음)
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
- **소개 코드 포맷 정책**: 역할별 고정 포맷을 사용하며, 가입 시점부터 올바른 포맷으로 생성합니다.
  - `salesman`, `devops`: **3자리 대문자 영숫자** (`^[A-Z0-9]{3}$`, 예: `G5D`, `N3F`)
  - `requestor`: **5자리 대문자 영숫자** (`^[A-Z0-9]{5}$`, 예: `A3K9Z`)
  - `salesman.controller.js`의 `getSalesmanDashboard`는 DB에 저장된 코드가 `^[A-Z0-9]{3}$` 형식이 아닐 경우 자동 교정 후 저장합니다 (기존 계정 마이그레이션용 안전망).

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

#### 6.4.8 공구 슬롯 / 교체 워크플로우 / 가공 통계

장비별 내부 슬롯에 장착된 공구의 메타데이터, 교체 시기, 가공 사용량을 백엔드(`CncMachine.tooling`)에서 SSOT로 관리합니다.

**Hi-Link / 브리지 비의존 원칙 (필수):**

- 공구 수명/슬롯/교체 이력/가공 통계는 **백엔드 DB(SSOT)에서만 기록·읽기**하며 Hi-Link DLL이나 `bridge-server`에 의존하지 않습니다.
- 관련 dataType (`GetToolLifeInfo`, `GetToolSlots`, `GetToolStats`, `UpdateToolLife`, `RecordToolReplacement`, `BeginToolRemoval`, `CompleteToolReplacement`, `UpdateToolSlotMeta`, `UpdateToolOffset`, `RecordMachiningJobStats`)는 `callRawProxy` 안에서 DB 스냅샷만 읽고 응답합니다. `bridge-server`로 raw 호출이 전달되지 않습니다(브리지 측에서도 Mode2 dataType은 명시적으로 거부).
- 가공 1건 완료 통계 누적은 `recordMachiningCompleteForBridge` 안의 `appendMachiningJobStats` 직접 호출로 처리되며, 별도의 브리지 HTTP 라운드트립이 없습니다.
- 따라서 브리지/Hi-Link가 오프라인이어도 공구 모달 열기·교체 워크플로우·통계 누적은 정상 동작해야 합니다.

**데이터 모델 (`CncMachine.tooling`):**

- `toolLifeRows`(`uiSnapshot`): 작업자가 입력한(또는 NC 프로그램에서 누적된) 공구 사용/설정 카운트 (`useCount`, `configCount`, `warningCount`). 백엔드 DB가 SSOT이며 Hi-Link 폴링 동기화는 사용하지 않습니다.
- `toolSlots`: 슬롯별 공구 메타데이터 + 교체 워크플로우 상태.
  - 필드: `toolNum`, `toolName`, `toolType`(`drill|mill|reamer|other`), `toolNote`, `replacementStatus`(`mounted|removing|removed`), `removalRequestedAt/By/ByName`, `lastReplacedAt/By/ByName`.
- `replacementHistory`: 교체 이력 (정상/비정상 구분, 메모, 교체 직전 사용량 스냅샷 포함).
- `observations`: 사용량 변화 관찰 로그.
- `machiningStats`: 슬롯별 가공 통계.
  - 필드: `toolNum`, `totalJobCount`, `totalMachiningSeconds`(절대 누계), `currentJobCount`, `currentMachiningSeconds`(현재 장착 이후, 교체 시 리셋), `lastJobAt`, `dailyBuckets[]`(KST 기준 `YYYY-MM-DD` 일별 버킷, 최대 60일).
  - `toolNum=0`은 장비 단위 통계 키로 예약합니다.

**3단계 교체 워크플로우 (작업자 흐름):**

1. **웹앱에서 해제 요청** (`BeginToolRemoval`)
   - 작업자가 공구 상태 모달에서 "해제" 버튼 클릭.
   - 슬롯 상태를 `mounted → removing`으로 전환하고 `removalRequestedAt/By`를 기록.
2. **장비에서 실제 공구 교체**
   - 작업자가 직접 CNC 장비에서 공구를 분리/장착.
   - 웹앱 UI는 "장비에서 공구를 교체하세요" 안내 화면을 표시.
3. **웹앱에서 교체 완료 기록** (`CompleteToolReplacement`)
   - 작업자가 "교체 완료 확인" 버튼 클릭.
   - 슬롯 상태를 `mounted`로 전환, `lastReplacedAt/By` 기록.
   - 공구 메타(`toolName/toolType/toolNote`)를 함께 업데이트(공구 변경 시).
   - `toolLifeRows.useCount`를 0으로 리셋, `replacementHistory`에 `kind`(`normal|abnormal`) + 메모 + 직전 사용량 스냅샷 추가.
   - `machiningStats.currentJobCount/currentMachiningSeconds`를 0으로 리셋(절대 누계는 유지).

**교체 알람 정책:**

- `toolingSummary.alertLevel`은 `useCount/predictedReplacementUseCount` 비율과 알람 임계값 기반으로 산출.
  - `ratio >= 1` → `alarm` (교체 필요)
  - `ratio >= 0.95` → `warn` (교체 임박)
  - 그 외 → `ok`
- 슬롯 카드 / 목록에는 슬롯 `replacementStatus`도 함께 배지로 표시:
  - `removing` → 주황 "해제중"
  - `removed` → 빨강 "교체대기"

**가공 통계 누적 정책:**

- 가공 1건 완료 시(`recordMachiningCompleteForBridge`) `MachiningRecord.durationSeconds`를 사용해 자동으로 `toolNum=0`(장비 단위) 통계에 누적합니다. 통계 누적 실패는 메인 워크플로우에 영향을 주지 않도록 `try/catch`로 보호합니다.
- 슬롯 단위(`toolNum > 0`) 통계는 추후 NC 프로그램 사용 공구를 식별할 수 있을 때 별도 `RecordMachiningJobStats` 호출로 누적합니다.
- 일별 버킷(`dailyBuckets`)은 KST 기준 `YYYY-MM-DD`로 키잉하며 최근 60일치만 유지합니다(오래된 버킷은 자동 삭제).
- 공구 교체 시 `currentJobCount/currentMachiningSeconds`는 리셋되지만 `totalJobCount/totalMachiningSeconds`는 절대 누계로 유지합니다.

**API 엔드포인트 (`POST /api/machines/:uid/raw`, `dataType` 기반):**

- 조회: `GetToolLifeInfo`, `GetToolSlots`, `GetToolStats`
- 수정: `UpdateToolLife`, `UpdateToolSlotMeta`
- 워크플로우: `BeginToolRemoval`, `CompleteToolReplacement`, `RecordToolReplacement`(레거시 1단계 교체)
- 통계: `RecordMachiningJobStats`(브리지/슬롯별 호출용)

**프론트엔드 훅:**

- `useCncToolSlots` — 슬롯/통계 데이터 로드 + 교체 워크플로우 API 호출.
- `useCncToolPanels` — UI 모달(공구 상태, 3단계 교체, 가공 통계)을 빌드. `useCncToolSlots`가 제공하는 데이터/콜백을 props로 주입받아 슬롯 강화 UI(`openToolDetailWithSlots`)와 통계 모달(`openMachiningStatsModal`)을 렌더링합니다.

**사용 페이지:**

- `EquipmentPage` (`/manufacturer/equipment`) — 장비 대시보드.
- `MachiningQueueBoard` (`/manufacturer/worksheet/.../machining`) — 가공 작업 보드.
- `WorksheetCncMachineSection` — 읽기 전용(쓰기 가드 차단), 슬롯 워크플로우 비활성.

### 6.5 채팅

- 의뢰 채팅은 `Request.messages`를 사용합니다.
- 독립 채팅은 별도 ChatRoom/Chat 모델을 사용합니다.
- Requestor와 Manufacturer의 직접 채팅은 허용하지 않고 Admin이 중간 허브가 됩니다.

### 6.6 세금계산서/팝빌

- 입금 매칭 후 `TaxInvoiceDraft`를 만들고 관리자 승인 뒤 팝빌 발행합니다.
- **팝빌 `registIssue`는 동기 API**이므로 큐/워커 없이 컨트롤러에서 직접 호출합니다. 성공·실패가 즉시 반환됩니다.
- 발행 성공 시 `TaxInvoiceDraft.status = SENT`, 실패 시 `FAILED`로 업데이트합니다.
- 팝빌 웹훅은 발행 처리용이 아닌 이벤트 알림(매입처 수신 등)용입니다.
- 공급자 정보는 `POPBILL_SUPPLIER_*` 환경변수에서 읽습니다. `POPBILL_CORP_NUM`의 대시(-)는 API 호출 전 제거합니다.
- 관리 키(`mgtKey`)는 MongoDB ObjectId(`_id` 앞 24자)를 사용합니다.

### 6.7 한진 REST 인증

- 한진 REST API의 인증 SSOT는 최신 스펙 문서입니다.
- Authorization 헤더는 `HMAC-SHA256 Credential=...` 같은 AWS 스타일을 사용하지 않습니다.
- 한진 REST Authorization 형식은 반드시 `client_id={CLIENT_ID} timestamp={yyyyMMddHHmmss} signature={hex_hmac}` 를 사용합니다.
- signature 원문은 `timestamp + METHOD + queryString + secretKey` 순서이며, 결과 인코딩은 `hex` 입니다.
- `customer-check` 검증 성공(`resultCode=OK`)을 기준으로 인증 로직을 확인한 뒤 주문/취소 API를 연동합니다.
- 한진 REST 주문/취소/고객검증 경로는 문서 기준 `/parcel-delivery/v1/...` 를 우선 사용합니다.

#### 6.7.0 한진 송하인 정보 DB 관리 정책 (EBS 한글 인코딩 버그)

**배경:**

AWS EBS 환경변수는 한글 문자열을 올바른 UTF-8로 Node.js `process.env`에 전달하지 못합니다.

- EBS 콘솔에 `HANJIN_SENDER_BASE_ADDR=경상남도 김해시 흥동`을 설정해도 `process.env`로 읽으면 `"???? ??? ??"` 처럼 깨집니다.
- 수하인 정보(`rcvrBaseAddr`, `rcvrNm` 등)는 MongoDB에서 읽어오므로 정상이지만, 송하인 정보는 환경변수 의존 시 깨집니다.

**정책:**

- **한글 포함 필드** (`baseAddr`, `dtlAddr`, `name`)는 `SystemSettings.hanjinSenderInfo`(DB)에서 관리합니다.
- **ASCII 필드** (`zip`, `tel`, `mobile`)는 환경변수 fallback을 허용합니다.
- `SystemSettings.hanjinSenderInfo` 스키마에 default 값이 정의되어 있어 별도 seeding 없이도 `upsert + setDefaultsOnInsert` 패턴으로 항상 올바른 값이 보장됩니다.
- 값 변경이 필요하면 MongoDB에서 직접 `SystemSettings` 문서의 `hanjinSenderInfo` 필드를 수정합니다 (코드/환경변수 변경 불필요).

**현재 default 값 (systemSettings.model.js 기준):**

| 필드                        | 값                     |
| --------------------------- | ---------------------- |
| `hanjinSenderInfo.zip`      | `50965`                |
| `hanjinSenderInfo.baseAddr` | `경상남도 김해시 흥동` |
| `hanjinSenderInfo.dtlAddr`  | `전하로 85번길 5`      |
| `hanjinSenderInfo.name`     | `어벗츠 주식회사`      |
| `hanjinSenderInfo.tel`      | `1588-3948`            |

**관련 코드:**

- 모델: `web/backend/models/systemSettings.model.js` → `hanjinSenderInfo` 필드
- 읽기: `web/backend/controllers/requests/shipping.Hanjin.helpers.js` → `getHanjinSenderInfo()`
- 환경변수 `HANJIN_SENDER_BASE_ADDR`, `HANJIN_SENDER_DTL_ADDR`, `HANJIN_SENDER_NAME`은 더 이상 사용하지 않습니다 (EBS에서 삭제 가능).

#### 6.7.1 한진 API 성능 및 타임아웃

- 한진 운송장 출력 API(`print-wbls`)는 응답까지 **10초 이상** 걸릴 수 있습니다.
- 기본 타임아웃은 `HANJIN_TIMEOUT_MS` 환경변수로 설정하며, 기본값은 **30초**입니다.
- 프론트엔드는 운송장 출력 시작 시 "한진 API 응답까지 10초 이상 걸릴 수 있습니다" 안내 토스트를 8초간 표시합니다.
- 백엔드는 한진 API 호출 시작/완료 시점에 성능 로그(`elapsedMs`, `elapsedSec`)를 남깁니다.
- 성능 로그는 `[hanjin]` 및 `[shipping][hanjin-print]` 태그로 구분하여 추적 가능합니다.

### 6.8 택배사 루틴 방문 및 운송장번호 관리 정책

**기본 원칙: 택배사는 매일 루틴하게 방문하며, 우리는 별도 방문 접수를 하지 않습니다.**

- **택배사 방문 방식**: 택배사(한진)는 매일 정해진 시간에 루틴하게 찾아오며, 우리는 별도의 방문 접수 신청을 하지 않습니다.
- **운송장번호 부여**: 운송장 출력이 필요할 때마다 한진 API를 통해 새로운 운송장번호를 부여받습니다.
- **운송장번호 폐기**: 부여받은 운송장번호를 사용하지 않을 경우, **취소 API를 호출하지 않고 폐기 처리합니다.**
  - 이유: 한진 택배에는 운송장번호 취소 API가 없음
  - 폐기된 운송장번호는 자동으로 무효화됨
- **accepted 상태 불필요**: 기존의 `accepted` 상태는 더 이상 사용하지 않습니다.
  - 운송장번호 부여 시점을 `printed` 상태로 통합 관리
  - `printed` = 운송장번호 부여받고 라벨 출력 완료된 상태
- **상태 단순화**:
  - `printed`: 운송장번호 부여 및 라벨 출력 완료
  - `picked_up`: 택배사 집하 완료 (statusCode 11)
  - `completed`: 최종 배송 완료
  - `canceled`: 사용자 취소
  - `error`: 오류 발생
- **일일 작업 리셋**: 오후 4시 집하완료(statusCode 11) 확인 후 모든 `printed` 상태를 리셋하고 다음 날 작업을 시작합니다.

**프론트엔드 UI 변경 사항:**

- 재출력 다이얼로그에서 `accepted` 상태 체크 로직 제거
- 모든 우편함은 `printed` 상태 기준으로 신규/기출력 구분
- 신규 우편함: 아직 운송장 출력되지 않은 우편함
- 기출력 우편함: 이미 `printed` 상태인 우편함 (재출력 대상)

**백엔드 API 변경 사항:**

- `pickup-and-print` 엔드포인트: 항상 새로운 운송장번호 부여 및 `printed` 상태로 설정
- `print-labels` 엔드포인트: 기존 운송장번호로 재출력 (상태 유지)
- `accepted` 상태 관련 로직 모두 제거

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

### 7.4.1 유지홈(retentionGroove) 옵션

의뢰자가 임플란트 정보 입력 시 선택하는 **유지홈** 옵션은 5축 Composite Finishing 작업의 `StepIncrement`(스텝 간격) 값을 의뢰별로 변경합니다.

- **SSOT (백엔드)**: `Request.caseInfos.retentionGroove` (`"none" | "shallow" | "deep"`, 기본값 `"deep"`)
- **치과별 디폴트 (프론트 localStorage)**: `ClinicPreset.defaultRetentionGroove` — 의뢰자가 새 의뢰 화면에서 유지홈 값을 바꾸면 선택된 치과의 디폴트로 자동 저장되며, 같은 치과를 다시 선택하면 그 값이 자동으로 채워집니다 (favorite 임플란트와 동일 패턴, 서버 저장 없음).
- **값 매핑 (`StepIncrement` mm)**:
  - `none` → `0.1`
  - `shallow` → `0.2`
  - `deep` → `0.3`
- **API 노출**: `GET /api/bg/request-meta`의 `caseInfos.retentionGroove`로 esprit-addin에 전달.
- **esprit-addin 적용 방식 (PRC 파일 무변경)**:
  - `StlFileProcessor.TryApplyRetentionGrooveToStepIncrementEnv()`가 매핑된 numeric 값을 환경변수 `ABUTS_COMPOSITE_STEP_INCREMENT_A`에 주입.
  - `MainModuleComposite.TryRunComposite2SplitAB`이 `5axisComposite_A.prc`로 `opA`를 로드한 직후, `MainModuleComposite.TrySetCompositeStepIncrement`가 `opA.GetType().InvokeMember("StepIncrement", BindingFlags.SetProperty, …)`로 COM 객체에 직접 SetProperty (PRC `StepIncrement; 217;` DispId 동치).
  - `_B.prc`는 변경하지 않음. PRC 파일 원본을 절대 수정하지 않으며, 임시 사본도 만들지 않음.
- 값 누락/비정상이면 env를 비워 PRC 원본 `StepIncrement`를 그대로 사용 (안전 디폴트).

### 7.5 CAM 직경 호환성

- CAM 단계에서 STL 최대 직경과 장비 소재 직경 그룹의 호환성을 검사합니다.
- 호환되지 않으면 카드에 경고를 띄우고 CAM을 중단합니다.
- Esprit에는 장비에 실제 세팅된 소재 직경값을 그대로 전달합니다.

### 7.6 패킹 라벨 출력 정책 (2026-04-23 변경)

**패킹 라벨은 각인 인식 이전에 수동으로 미리 모두 출력한다. 각인 인식 시 라벨 출력하지 않는다.**

**플로우**:

1. **오전 작업**: 작업자가 PackingPageContent에서 '패킹 라벨 출력' 버튼으로 당일 세척.패킹 의뢰 라벨 전체 사전 출력
2. **lot-server**: 현미경 촬영 이미지를 백엔드에 업로드
3. **백엔드**: AI로 각인 코드 인식 → 해당 의뢰건 찾기 → 포장.발송 단계로 이동 (라벨 출력 없음)
4. **프론트**: 웹소켓 이벤트(`packing:capture-processed`)로 인식 결과 UI 업데이트

**백엔드 처리** (`/web/backend/controllers/ai/lotCapture.controller.js`):

- 각인 인식 성공 후 의뢰를 포장.발송 단계로 이동만 처리
- **라벨 자동 출력 없음**: `printPackingLabelViaBgServer()` 호출하지 않음
- 처리 완료 후 `packing:capture-processed` 웹소켓 이벤트 발송

**프론트엔드**:

- **수동 사전 출력**: `PackingPageContent`의 '패킹 라벨 출력' 버튼으로 수동 출력 (유지)
- **각인 인식 결과**: 웹소켓 이벤트 수신 후 UI 업데이트만 처리 (라벨 출력 없음)

**주요 규칙**:

- ✅ 패킹 라벨은 반드시 각인 인식 **이전에 수동으로 미리** 출력한다
- ✅ 각인 인식(lot-server 또는 프론트 드롭)은 단계 이동만 처리한다
- ❌ 각인 인식 시 자동 라벨 출력 금지 (source=manual/worker 불문)
- ❌ `printPackingLabelViaBgServer()` 를 lotCapture 흐름에서 호출하지 않는다

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

## 10. Brevo 인바운드 이메일 수신

### 10.1 개요

Brevo의 Inbound Parse Webhook을 통해 수신한 이메일을 관리자 페이지에서 확인할 수 있습니다.

**선택 이유**: 영구 무료 플랜 (300통/일), 발신도 Brevo 사용 중

### 10.2 아키텍처

**모델**: 기존 `Mail` 모델 재사용 (`/web/backend/models/mail.model.js`)

- `direction: "inbound"` - 수신 메일 구분
- `status: "received"` - 수신 완료 상태
- `folder: "inbox" | "spam" | "trash"` - 폴더 관리
- `s3RawKey` - Brevo 메타데이터를 JSON 문자열로 저장
  - `uuid`, `spamScore`, `brevoAttachments`, `headers` 등

**컨트롤러**: `/web/backend/controllers/admin/adminInboundEmail.controller.js`

- `handleInboundEmailWebhook` - Brevo webhook 수신 (인증 불필요, items 배열)
- `adminListInboundEmails` - 메일 목록 조회
- `adminGetInboundEmail` - 메일 상세 조회
- `adminMarkInboundEmailAsRead/Unread` - 읽음 상태 관리
- `adminMoveInboundEmailToSpam/Trash` - 폴더 이동
- `adminRestoreInboundEmail` - 받은편지함 복원
- `adminDeleteInboundEmail` - 영구 삭제
- `adminGetInboundEmailStats` - 폴더별 미읽음 개수

**라우트**: `/web/backend/modules/admin/admin.routes.js`

- `POST /api/admin/inbound-email/webhook` (인증 미들웨어 전에 정의)
- `GET /api/admin/inbound-email` - 목록
- `GET /api/admin/inbound-email/stats` - 통계
- `GET /api/admin/inbound-email/:id` - 상세
- `PATCH /api/admin/inbound-email/:id/read|unread|spam|trash|restore`
- `DELETE /api/admin/inbound-email/:id`
- `GET /api/admin/inbound-email/:id/attachments/:downloadToken`

**백엔드 라우트**: `/web/backend/modules/admin/admin.routes.js`

- `POST /api/admin/inbound-email/webhook` (Brevo webhook 수신, 인증 미들웨어 전에 정의)

**기존 메일 API 활용** (`/web/backend/controllers/notifications/mail.controller.js`):

- `GET /api/admin/mails?direction=inbound&folder=inbox` - 수신 메일 목록
- `GET /api/admin/mails/:id` - 메일 상세
- `POST /api/admin/mails/:id/read` - 읽음 표시
- `POST /api/admin/mails/:id/unread` - 읽지 않음 표시
- `POST /api/admin/mails/:id/spam` - 스팸으로 이동
- `POST /api/admin/mails/:id/trash` - 휴지통으로 이동
- `POST /api/admin/mails/:id/restore-to-sent` - 복원

**프론트엔드 접근 경로**:

- 개발: `http://localhost:5173/dashboard/mail`
- 프로덕션: `https://abuts.fit/dashboard/mail`

**프론트엔드**: `/web/frontend/src/pages/admin/support/AdminMailPage.tsx`

- 기존 메일 페이지의 "수신함(inbox)" 탭에서 Brevo 인바운드 메일 표시
- `direction: "inbound"`, `folder: "inbox"`로 조회
- 받은편지함/발신함/스팸/휴지통 탭
- 검색, 읽음/읽지않음 토글, 폴더 이동, 삭제 기능
- 첨부파일 개수 및 스팸 점수 표시

### 10.3 도메인 및 DNS 설정

**도메인**: `mail.abuts.fit`

**Route53 MX 레코드**:

```
레코드 이름: mail.abuts.fit
레코드 타입: MX
값:
  10 inbound1.sendinblue.com
  20 inbound2.sendinblue.com
TTL: 300
```

**Route53 설정 방법**:

1. Route53 → Hosted zones → `abuts.fit` 선택
2. `mail.abuts.fit` MX 레코드 추가/편집
3. 두 개의 MX 레코드 모두 추가 (우선순위 10, 20)
4. "Save changes" 클릭

**DNS 전파 확인**:

```bash
dig MX mail.abuts.fit
# 결과:
# mail.abuts.fit. 300 IN MX 10 inbound1.sendinblue.com.
# mail.abuts.fit. 300 IN MX 20 inbound2.sendinblue.com.
```

### 10.5 데이터 저장 구조

**Brevo webhook payload → Mail 모델 매핑**:

- `item.MessageId` → `messageId`
- `item.From.Address` → `from`
- `item.To[].Address` → `to[]`
- `item.Subject` → `subject`
- `item.ExtractedMarkdownMessage` → `bodyText`
- `item.RawHtmlBody` → `bodyHtml`
- `item.SpamScore > 5` → `folder: "spam"` (자동 분류)
- Brevo 메타데이터 → `s3RawKey` (JSON 문자열)
  - `uuid`, `spamScore`, `brevoAttachments`, `headers`

### 10.4 Brevo 설정

**1. 도메인 인증**:

- Brevo 대시보드 → Settings → Domains
- `mail.abuts.fit` 도메인 추가
- DNS 레코드 확인 (5-30분 소요)

**2. Webhook 등록**:

```bash
curl -X POST 'https://api.brevo.com/v3/webhooks' \
  -H 'accept: application/json' \
  -H 'api-key: YOUR_BREVO_API_KEY' \
  -H 'content-type: application/json' \
  -d '{
  "type": "inbound",
  "events": ["inboundEmailProcessed"],
  "url": "https://abuts.fit/api/admin/inbound-email/webhook",
  "domain": "mail.abuts.fit",
  "description": "Abuts.fit inbound email webhook"
}'
```

**3. 환경변수 설정** (`local.env`):

```bash
BREVO_API_KEY=your_brevo_api_key_here
```

### 10.6 주요 규칙

- **중복 방지**: `messageId`로 중복 체크
- **스팸 자동 분류**: `spamScore > 5`인 메일은 자동으로 spam 폴더로 이동
- **첨부파일**: Brevo API를 통해 다운로드 (토큰 기반)
- **기존 Mail 모델 활용**: 별도 InboundEmail 모델 생성하지 않음
- **Webhook 인증 불필요**: `/api/admin/inbound-email/webhook`는 인증 미들웨어 전에 정의
- **items 배열**: Brevo는 items 배열로 여러 메일 전송 가능

### 10.7 테스트

1. 테스트 메일 발송: `test@mail.abuts.fit`
2. 관리자 페이지 확인: `https://abuts.fit/dashboard/mail` (수신함 탭)
3. Webhook 로그 확인: 백엔드 콘솔에서 `[InboundEmail]` 로그 확인
4. DB 확인: `Mail` 컬렉션에서 `direction: "inbound"` 문서 조회

---

## 11. 한진 운송장 라벨 출력 아키텍처

### 11.1 출력 흐름 (label 모드)

```
프론트 → 백엔드 → 프론트 → 백엔드 → wbls-server → 프린터
```

1. **프론트 → 백엔드** `POST /api/requests/shipping/hanjin/print-labels`
   - `shippingOutputMode: "label"`, `printer`, `paperProfile` 포함
2. **백엔드 → 한진 API** ZPL 생성 후 `address_list + zplLabels` 를 프론트로 반환
   - `wblPrint.outputMode: "label-png"` 시그널 포함 (wbls-server로 직접 ZPL 전송 안 함)
3. **프론트** 브라우저 Canvas로 PNG 렌더링 (한글 폰트 완벽 지원, 고해상도 4배)
4. **프론트 → 백엔드** `POST /api/requests/shipping/wbl/print-png` (base64 PNG)
5. **백엔드 → wbls-server** `POST /print-png` 프록시
6. **wbls-server → 프린터**
   - Windows: PowerShell `System.Drawing.Printing.PrintDocument` (lp 불필요)
   - Linux/Mac: `lp` 명령

### 11.2 이 아키텍처의 이유

- wbls-server(Windows)에는 `lp` 명령이 없음 → ZPL을 wbls-server에서 직접 PDF 변환 후 lp 출력하면 `ENOENT` 에러 발생
- 브라우저 Canvas 렌더링이 wbls-server의 pdfkit 렌더링보다 한글/레이아웃 정확도가 훨씬 높음
- PNG는 플랫폼 독립적: Windows `System.Drawing` / Linux `lp` 모두 처리 가능

### 11.3 관련 파일

| 역할                 | 파일                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| PNG 렌더링 + POST    | `web/frontend/.../mailboxGrid.helpers.ts` (`printGeneratedWaybillPngs`) |
| label-png 신호 반환  | `web/backend/.../shipping.Hanjin.helpers.js` (`triggerWblServerPrint`)  |
| PNG 프록시 컨트롤러  | `web/backend/.../shipping.Hanjin.controller.js` (`wblPrintPng`)         |
| PNG 라우트           | `web/backend/modules/requests/request.routes.js`                        |
| wbls-server PNG 출력 | `bg/pc3/wbls-server/app.js` (`printPngWindows`, `/print-png`)           |

### 11.4 image 모드 vs label 모드

|                  | image 모드            | label 모드                        |
| ---------------- | --------------------- | --------------------------------- |
| 용도             | 미리보기/저장         | 실제 프린터 출력                  |
| PNG 처리         | ZIP으로 파일 다운로드 | wbls-server로 POST 후 프린터 출력 |
| wbls-server 관여 | 없음                  | 있음 (`/print-png`)               |

---

## 12. 패킹 라벨 렌더러

패킹 라벨 렌더러는 **두 곳에 별도로 존재**한다. 디자인 변경 시 **반드시 양쪽 모두 수정**해야 한다.

| 경로                                                                            | 파일                                                  | 비고                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ |
| 프론트 수동 출력 (`PackingPageContent.tsx` → `/api/requests/packing/print-zpl`) | `web/frontend/.../packing/utils/packLabelRenderer.ts` | 브라우저 Canvas API 사용 |
| 백엔드 직접 출력 (수동 호출 시, `packPrint.utils.js`)                           | `web/backend/utils/packLabelRenderer.js`              | Node.js canvas-node 사용 |

- **패킹 라벨 출력은 프론트 수동 출력 경로만 정상 운영 경로이다** (각인 인식 경로에서는 출력하지 않음)
- 프론트 렌더러는 `import.meta.env`(VITE*PACK*\*)로 브랜딩 정보 주입
- 백엔드 렌더러는 `opts` 객체(productName, modelName 등)로 브랜딩 정보 주입 (pack-server `/branding` 엔드포인트에서 가져옴)
- 백엔드 렌더러에서 browser-only API(`new Image`, `URL.createObjectURL` 등) 사용 불가

---

## 13. EBS 배포 최적화

### 13.1 node_modules 캐싱 전략

**배포 시간을 1-2분으로 단축하기 위해 `node_modules` 캐싱을 사용합니다.**

#### 동작 방식

1. **Pre-deploy 단계** (`.ebextensions/03_cache_node_modules.config`)
   - `package-lock.json`의 MD5 해시 계산
   - 캐시된 해시와 비교하여 일치하면 `/var/cache/abuts-fit/node_modules`에서 복원
   - 복원 성공 시 `.npm-cache-restored` 마커 파일 생성

2. **Install 단계** (`.platform/hooks/predeploy/01_install_backend.sh`)
   - `.npm-cache-restored` 마커 파일이 있으면 `npm ci` 스킵
   - 마커 파일이 없으면 정상적으로 `npm ci` 실행

3. **Post-deploy 단계** (`.ebextensions/03_cache_node_modules.config`)
   - 배포 완료 후 `/var/app/current/backend/node_modules`를 캐시로 복사
   - `package-lock.json` 해시를 `/var/cache/abuts-fit/node_modules/package-lock.hash`에 저장

#### 캐시 무효화 조건

- `package-lock.json` 내용이 변경되면 자동으로 캐시 무효화
- 새로운 패키지 추가/제거/업데이트 시 자동으로 재설치

#### 관련 파일

| 파일                                              | 역할                          |
| ------------------------------------------------- | ----------------------------- |
| `.ebextensions/03_cache_node_modules.config`      | 캐싱 훅 스크립트 정의         |
| `.platform/hooks/predeploy/01_install_backend.sh` | 캐시 복원 확인 및 npm install |

#### 효과

- **첫 배포**: 4분 (정상 설치)
- **이후 배포** (package-lock.json 변경 없음): 1-2분 (캐시 복원)
- **패키지 변경 시**: 4분 (재설치 후 캐시 갱신)

### 13.2 @napi-rs/canvas 패키지

**서버 사이드 Canvas 렌더링을 위해 `@napi-rs/canvas`를 사용합니다.**

- **용도**: 패킹 라벨 ZPL 생성 (`packLabelRenderer.js`)
- **선택 이유**:
  - `node-canvas`보다 설치 시간 빠름 (사전 빌드된 바이너리)
  - Python/Cairo 의존성 없음
  - 네이티브 성능
- **시스템 폰트**: Amazon Linux 2023에서 Noto Sans CJK 폰트 자동 설치 (`.platform/hooks/predeploy/01_install_backend.sh`)

---

## 15. DB Seeding 체계

### 15.1 스크립트 위치

모든 seeding 스크립트는 `web/backend/scripts/db/` 에 위치합니다.

| 스크립트               | npm 명령                                   | 역할                                          |
| ---------------------- | ------------------------------------------ | --------------------------------------------- |
| `reset.js`             | `npm run db:reset`                         | 전체 컬렉션 deleteMany 후 DB_VERSION 증가     |
| `seed-account.js`      | `npm run db:seed-account`                  | 계정 생성 (필수 계정 + 벌크 계정)             |
| `seed-data.js`         | `npm run db:seed-data [건수]`              | 의뢰/CreditLedger/정산 더미 데이터 생성       |
| `seed-prc-mappings.js` | `npm run db:implant-preset` 또는 직접 실행 | 로컬 PRC 파일을 읽어 PrcMapping 컬렉션 upsert |
| `implant-preset.js`    | `npm run db:implant-preset`                | 임플란트 프리셋 add-only upsert               |

### 15.2 내부 모듈 구조

| 파일                         | 역할                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `_mongo.js`                  | DB 연결/해제 유틸리티                                                                              |
| `_core.shared.js`            | `SystemSettings` upsert, `Connection` upsert, `FilenameRule` upsert — 모든 seed에서 공통 호출      |
| `seed/accounts.js`           | `seedEssentialAccounts()`, `seedBulkAccounts()` — `.essential-accounts.config.json` 기반 계정 생성 |
| `seed/data.js`               | `seedRequestData()` — 랜덤 Request/CreditLedger/SalesmanLedger 생성                                |
| `seed/utils.js`              | `findOrCreateUser`, `generateRequestId` 등 공통 유틸                                               |
| `data/connections.seed.js`   | `CONNECTIONS_SEED` — implant Connection 데이터                                                     |
| `data/filenameRules.seed.js` | `FILENAME_RULES_SEED` — 파일명 규칙 데이터                                                         |

### 15.3 권장 실행 순서

```bash
npm run db:reset          # 1. 전체 초기화
npm run db:seed-account   # 2. 계정 생성 (필수 계정 config 파일 필요)
npm run db:seed-data      # 3. 더미 의뢰 데이터 생성
npm run db:implant-preset # 4. 임플란트 프리셋 (선택)
```

### 15.4 안전장치

- **production에서는 기본적으로 DB 변경 거부** — 강제 실행 시 `ABUTS_DB_FORCE=true` 환경변수 필요
- `reset`은 `dropDatabase`가 아니라 각 컬렉션 `deleteMany`로 처리
- `seed-data`는 기존 계정을 사용하므로 `seed-account` 먼저 실행 필요
- `implant-preset`은 기존 데이터 유지, 없는 항목만 추가 (add-only)

### 15.5 계정 설정 파일

- `scripts/db/seed/.essential-accounts.config.json` — 필수 계정 명세 (git 비추적)
- `scripts/db/seed/.essential-accounts.json` — 생성된 계정 자격증명 출력 (git 비추적)
- `scripts/db/seed/.bulk-accounts.config.json` — 벌크 계정 명세 (git 비추적)

---

## 16. 한글 설정값 DB SSOT 정책

**AWS EBS 환경변수는 한글 UTF-8 문자열을 Node.js에 올바르게 전달하지 못합니다.**
예: EBS 콘솔에 "경상남도 김해시 흥동" 입력 → `process.env`로 읽으면 "???? ??? ??"처럼 깨짐.

→ **한글이 포함된 모든 설정값은 `SystemSettings` DB(key: "global")에서 관리합니다.**

### 16.1 packLabelBranding (패킹 라벨 브랜딩)

**SSOT: `SystemSettings.packLabelBranding` (MongoDB)**

- 백엔드(`packPrint.utils.js`)가 렌더링 시 `SystemSettings`에서 직접 읽어 `opts`로 주입
- 값 변경 시: `web/backend/scripts/db/data/packLabelBranding.seed.js` 수정 후 아래 명령 실행

```bash
cd web/backend && npm run db:seed-branding
```

**필드 목록:**

| 필드                   | 설명                                | 현재 값                                                         |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `productName`          | 품목명                              | 치과용임플란트 상부구조물                                       |
| `modelName`            | 모델명 (로트번호 미포함)            | CA6512 (의뢰별 계산: CA + 각도aaa + 직경ddd + 길이lll)          |
| `licenseNo`            | 품목허가번호                        | 제3583호                                                        |
| `manufacturerName`     | 제조자명                            | (주)애크로덴트                                                  |
| `manufacturerAddr`     | 제조자 주소                         | 경남 김해시 전하로85번길 5, 나동(흥동)                          |
| `manufacturerTelFax`   | 제조자 전화/팩스                    | T 055-314-4607 F 055-901-0241                                   |
| `manufacturerPermitNo` | 제조업허가번호                      | 제3583호                                                        |
| `sellerName`           | 판매원명                            | 어벗츠 주식회사                                                 |
| `sellerPermit`         | 판매업허가번호                      | 제00001호                                                       |
| `sellerAddr`           | 판매원 주소                         | 경남 거제시 거제중앙로29길 6, 3층                               |
| `sellerTel`            | 판매원 전화                         | 1588-3948                                                       |
| `udiGtin`              | UDI GTIN                            | 08800123600154                                                  |
| `certInfo`             | 품목인증번호·포장단위·보관방법 문구 | 품목인증번호: 제인 26-0000호, 포장단위:1set, 보관방법: 실온보관 |
| `homepageUrl`          | 제품 홈페이지 URL                   | www.acrodent.com                                                |
| `manualQrLabel`        | 사용자매뉴얼 QR 라벨                | 사용자매뉴얼                                                    |

### 16.2 hanjinSenderInfo (한진 운송장 발신인)

**SSOT: `SystemSettings.hanjinSenderInfo` (MongoDB)**

- 백엔드(`shipping.Hanjin.helpers.js`)가 `SystemSettings`에서 직접 읽음
- wbls-server `GET /print-settings`는 보조 override 역할 (로컬 PC 테스트용)
- DB model default 값이 정의되어 있어 seed 없이도 `findOneAndUpdate + upsert`로 자동 생성

**필드 목록:**

| 필드       | 설명                            |
| ---------- | ------------------------------- |
| `zip`      | 우편번호 (50965)                |
| `baseAddr` | 기본주소 (경상남도 김해시 흥동) |
| `dtlAddr`  | 상세주소 (전하로 85번길 5)      |
| `name`     | 발신인명 (어벗츠 주식회사)      |
| `tel`      | 전화 (1588-3948)                |
| `mobile`   | 휴대폰                          |

### 16.3 금지 사항

- ❌ EBS 환경변수에 한글 값 저장 금지 (깨짐 버그)
- ❌ `pack-server/local.env`의 한글 값을 SSOT로 사용 금지
- ✅ 한글 포함 설정값은 반드시 `SystemSettings` DB에서 관리
- ✅ seed 파일(`packLabelBranding.seed.js`) 수정 후 `npm run db:seed-branding` 실행

---

## 17. Esprit CAM 가공 파라미터 정책

### 17.1 FirstPassPercent (첫 패스 퍼센트) 런타임 오버라이드

**배경:**

- Esprit Composite 공정의 `FirstPassPercent`는 PRC 파일에 정적 값(`3`)으로 저장됨
- 의뢰별 치아 번호에 따라 전치부(1/2/3번)와 구치부(4/5/6/7번)를 구분하여 다른 값을 적용해야 함

**정책 (런타임 오버라이드):**

- **PRC 파일은 수정하지 않습니다.** 정적 파일에 의뢰별 분기 로직을 넣을 수 없음
- **런타임 환경변수** `ABUTS_COMPOSITE_FIRST_PASS_PERCENT_A`를 통해 Esprit COM API로 값을 주입
- **치아 번호 파싱**: `request-meta.caseInfos.tooth`의 마지막 숫자를 기준으로 판별
  - **1, 2, 3 (전치부)**: `FirstPassPercent = 5`
  - **4, 5, 6, 7 (구치부)**: `FirstPassPercent = 1`
- **유효하지 않은 치아번호**: 환경변수를 설정하지 않아 **PRC 원본 값(3)을 유지**
  - ❌ silent fallback 금지: 임의로 전치/구치를 추정하여 값을 채우지 않음
  - ✅ 명시적 미설정으로 PRC 기본값 사용

**구현 경로:**

1. **`StlFileProcessor.cs`**: 의뢰 로드 시 `TryApplyCompositeFirstPassPercentEnv(tooth)` 호출
   - 유효한 치아번호 → `Environment.SetEnvironmentVariable(CompositeFirstPassPercentAEnv, value)`
   - 무효/누락 → `Environment.SetEnvironmentVariable(CompositeFirstPassPercentAEnv, null)`
   - `ResetPerRunState()`에서 매 의뢰 시작 시 환경변수 초기화 (이전 값 남지 않도록)

2. **`MainModuleComposite.cs`** (Split AB 경로): `TryGetCompositeFirstPassPercentOverride()`로 env 읽어 `opA.FirstPassPercent` 적용

3. **`MainModule.cs`** (일반 Composite2 경로): 동일하게 env 읽어 `techLatheMill5xComposite.FirstPassPercent` 적용

**값 Clamp:**

- 유효 범위: 0.0 ~ 100.0 (또는 Split AB에서는 0.0 ~ splitPercent)
- 파싱 실패 또는 범위 이탈 시 env 값 무시하고 PRC 원본 유지

**로그:**

- 적용 성공: `DentalAddin: tooth='35' -> FirstPassPercent=1 적용 (env=ABUTS_COMPOSITE_FIRST_PASS_PERCENT_A)`
- 미지정/무효: `DentalAddin: tooth 미지정 - FirstPassPercent 기본값(PRC 원본) 유지`

---

## 14. 운영 메모

- 하위 `rules.md`는 루트 규칙을 반복 작성하지 않습니다.
- 구현 세부, 트러블슈팅, 서비스별 로컬 설정만 남깁니다.
- 운영 문서(`README`, 운영 가이드, 장비 사용 문서)는 규칙 문서가 아니며, 실제 동작 기준은 코드와 루트 `rules.md`입니다.
- 과거 요약 문서(`*_SUMMARY.md`, 임시 작업 메모)는 규칙 문서가 아닙니다. 루트 정책과 충돌하면 폐기하거나 보관 폴더로 이동합니다.

### 14.1 자주검사 성적서(Connection 스펙) 규칙

- 자주검사 성적서의 `기준직경`, `L2`, `헥사치수`, `내부게이지/돌출길이` 기준값은
  백엔드 `Connection` 컬렉션을 SSOT로 조회합니다.
- 프론트엔드는 seed 파일을 직접 참조하지 않고 API만 사용합니다.
- 조회 API: `GET /api/requests/by-request/:requestId/connection-spec`
  - request의 implant 정보(`manufacturer/brand/family/type`)를 기준으로 조회
  - 타입은 요청 타입 우선, 미일치 시 `Hex` -> `Non-Hex` 순으로 fallback
- `Connection` 스키마 확장 필드:
  - `hexSize` (number)
  - `internalGauge` (string)
  - `protrusionLength` (number)
- seed 업서트 시 같은 필드를 `$set`과 `$setOnInsert`에 동시에 넣지 않습니다
  (Mongo path conflict 방지).

### 14.2 시드 데이터 조직 귀속 규칙

- `seedRequestData`의 requestor 풀 조건은 `businessAnchorId` 기준으로 판단합니다.
- seed에서 생성하는 `Request`/`CreditLedger`/`ShippingPackage`의 조직 귀속 필드는
  `businessAnchorId`를 사용합니다.
- seed용 `ShippingPackage.mailboxAddress`는 중복 인덱스 충돌이 없도록
  패키지 단위로 고유값을 생성합니다.
