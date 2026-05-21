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
- UTC 저장 시 KST 변환 주의: 예시 포함

---

## 1.3 자주검사 성적서(Connection 스펙) 규칙

- 자주검사 성적서의 `기준직경`, `L2`, `헥사치수`, `내부게이지/돌출길이` 기준값은
  백엔드 `Connection` 컬렉션을 SSOT로 조회합니다.
- 프론트엔드는 seed 파일을 직접 참조하지 않고 API만 사용합니다.
- 조회 API: `GET /api/requests/by-request/:requestId/connection-spec`
  - request의 implant 정보(`manufacturer/brand/family/type`)를 기준으로 조회
  - 타입은 요청 타입 우선, 미일치 시 `Hex` → `Non-Hex` 순으로 fallback
- `Connection` 스키마 확장 필드:
  - `hexSize` (number)
  - `internalGauge` (string)
  - `protrusionLength` (number)
- seed 업서트 시 같은 필드를 `$set`과 `$setOnInsert`에 동시에 넣지 않습니다
  (Mongo path conflict 방지).

## 1.4 시드 데이터 조직 귀속 규칙

- `seedRequestData`의 requestor 풀 조건은 `businessAnchorId` 기준으로 판단합니다.
- seed에서 생성하는 Request/CreditLedger/ShippingPackage의 조직 귀속 필드는
  `businessAnchorId`를 사용합니다.
- seed용 `ShippingPackage.mailboxAddress`는 중복 인덱스 충돌이 없도록
  패키지 단위로 고유값을 생성합니다.
