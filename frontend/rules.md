# Project Rules for abuts.fit

이 문서는 `abuts.fit` 프론트엔드 프로젝트의 개발 규칙을 정의합니다. 모든 개발자는 이 규칙을 숙지하고 준수해야 합니다.

## 1. 기술 스택 (Tech Stack)

이 프로젝트는 다음 기술 스택을 기반으로 합니다.

- **Framework**: React (^18.3.1)
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI 기반)
- **Routing**: React Router DOM (^6.26.2)
- **State Management**: TanStack Query (^5.56.2)
- **Linting/Formatting**: ESLint, Prettier (설정 파일 기반)
- **Package Manager**: Bun (bun.lockb 파일 존재)

## 2. 코딩 스타일 및 컨벤션

- **언어**: 모든 코드는 TypeScript로 작성합니다.
- **컴포넌트**: 함수형 컴포넌트와 Hooks 사용을 원칙으로 합니다.
- **네이밍**:
  - 컴포넌트 파일 및 폴더: `PascalCase` (e.g., `UserProfile.tsx`, `SharedComponents/`)
  - 변수 및 함수: `camelCase` (e.g., `userData`, `fetchUserData`)
  - 타입 및 인터페이스: `PascalCase` (e.g., `type User`, `interface Post`)
- **스타일링**: Tailwind CSS 유틸리티 클래스를 사용합니다. CSS-in-JS나 별도의 CSS 파일 작성은 지양합니다.
- **Linter & Formatter**: ESLint와 Prettier 설정을 준수합니다. 커밋 전에 항상 코드 포맷팅을 실행해주세요.

## 3. 디렉토리 구조

프로젝트의 주요 디렉토리 구조는 다음과 같습니다.

```
/src
|-- /assets         # 이미지, 폰트 등 정적 에셋
|-- /components     # 공통 UI 컴포넌트 (주로 shadcn/ui 래퍼)
|   `-- /ui         # shadcn/ui 기본 컴포넌트 모음
|-- /features       # 도메인/기능 단위 컴포넌트 및 로직 (requestor, manufacturer 등)
|-- /shared         # 여러 feature에서 재사용되는 공용 레이어
|   |-- /ui         # 도메인 맥락이 살짝 섞인 재사용 UI (예: 공용 대시보드 카드)
|   |-- /hooks      # 전역/공용 커스텀 Hooks
|   `-- /lib        # 공용 유틸리티 함수
|-- /hooks          # (레거시) 기존 경로 호환용 re-export, 신규 코드는 shared/hooks 사용 권장
|-- /lib            # 도메인별/페이지별로만 쓰이는 유틸 등
|-- /pages          # 라우팅 단위의 페이지 컴포넌트
|-- /providers      # Context Provider
|-- /routes         # 라우팅 설정
|-- /store          # 전역 상태 관리 (e.g., Zustand, Jotai)
|-- /types          # 전역 타입 정의
`-- main.tsx        # 애플리케이션 진입점
```

## 4. Git & 브랜치 전략

- **브랜치 이름**: `feature/기능이름`, `fix/버그이름`, `refactor/리팩토링내용` 형식으로 생성합니다.
- **커밋 메시지**: Conventional Commits 규칙을 따릅니다. (e.g., `feat: Add user login page`)
- **PR (Pull Request)**: `main` 브랜치로 PR을 생성하기 전, 최신 `main` 브랜치의 변경 사항을 반영(rebase)해야 합니다.

## 5. 의존성 관리

- **패키지 설치**: `bun install` 명령어를 사용하여 의존성을 설치합니다.
- **패키지 추가**: `bun add [package-name]` 명령어를 사용하여 새로운 패키지를 추가합니다.

## 6. CNC 프로그램 번호 및 파일명 규칙

- CNC 프로그램 번호는 Fanuc 계열 규칙을 기준으로 합니다.
- CNC 장비 내부 프로그램 번호 형식: `O` + 네 자리 숫자 (예: `O0001`, `O3001`).
- 브리지 서버/로컬에 저장되는 프로그램 파일명은 `O####.nc` 형식을 사용합니다.
  - 예: `O3001.nc`, `O0123.nc`.
- CNC 장비로 전송할 때는 확장자를 사용하지 않고, 숫자 프로그램 번호만 사용합니다.
- 파일명에서 프로그램 번호를 추출할 때는 `O####` 패턴을 우선적으로 해석합니다.

## 7. 페이지 및 컴포넌트 구조 (Manufacturer)

제조사(Manufacturer) 관련 페이지는 다음과 같은 계층 구조를 따릅니다.

```
pages/manufacturer/worksheet/
|-- custom_abutment/    # 커스텀 어벗먼트 관련
|   |-- request/        # 의뢰 목록 (RequestPage.tsx)
|   |-- cam/            # CAM (예정)
|   |-- machining/      # 가공 (MachiningPage.tsx)
|   `-- ...             # 세척, 발송 등 단계별 폴더
|-- crown/              # 크라운 관련 (예정)
`-- ...
```

- `WorkSheet.tsx`는 라우팅 래퍼(Routing Wrapper) 역할만 수행하며, 실제 로직은 하위 폴더의 컴포넌트(Page)로 분리합니다.
- URL 파라미터(`type`, `stage`)에 따라 적절한 하위 페이지를 렌더링합니다.

## 8. 페이지 및 컴포넌트 구조 (Requestor & Admin)

의뢰자(Requestor) 및 관리자(Admin) 페이지도 기능 단위로 폴더를 구분하여 관리합니다.

### Requestor

```
pages/requestor/
|-- new_request/    # 의뢰 생성 (NewRequestPage.tsx)
|-- worksheet/      # 의뢰 관리
|   `-- list/       # 의뢰 목록 (RequestListPage.tsx)
|-- dashboard/      # 대시보드 (RequestorDashboardPage.tsx)
```

### Admin

```
pages/admin/
|-- users/          # 사용자 관리
|-- monitoring/     # 의뢰 모니터링
|-- support/        # 채팅 및 고객지원
|-- system/         # 시스템 분석 및 보안
|-- dashboard/      # 대시보드
```

## 9. 요금 및 결제 안내 정책

- **가격 정책**
  - 기본 서비스 금액(견적/결제 금액)은 **부가가치세(VAT)** 및 **배송비**가 포함되지 않은 **순수 제작비 기준**으로 관리합니다.
  - 부가세(VAT)와 배송비는 항상 **별도 청구**를 원칙으로 합니다.
  - 동일 환자명 + 동일 치아번호의 커스텀 어벗 재의뢰(리메이크/수정 의뢰)는 개당 **10,000원(VAT·배송비 별도)** 으로 고정합니다.
- **프론트엔드(UI) 규칙**
  - 의뢰자(Requestor)가 보는 주요 화면(NewRequestPage, RequestList/상세, 대시보드 등)에는
    "부가세(VAT) 및 배송비 별도"임을 명시적으로 안내해야 합니다.
  - 배송 관련 기능(배송 신청 버튼/섹션) 주변에는 **배송비가 별도이며, 묶음 배송을 권장**한다는 안내를 배치합니다.
- **백엔드 연동 시 규칙**
  - 결제/청구 금액 필드(예: `amount`)는 기본적으로 **VAT/배송비 제외 금액**으로 해석합니다.
  - 향후 부가세/배송비를 합산한 총 결제금액이 필요할 경우, 별도의 필드(예: `vatAmount`, `shippingFee`, `totalAmount`)로 분리하여 관리합니다.
  - 외부 결제 모듈 연동 시에도 "서비스 금액 + 부가세 + 배송비" 구조가 유지되도록 요청/응답 스키마를 설계합니다.

## 10. 대시보드/워크시트 카드 UI 규칙

- **기준 컴포넌트**: `features/manufacturer/cnc/components/WorksheetCncMachineSection.tsx` 의 `WorksheetCncMachineCard` 스타일을 기본 카드 스타일로 사용합니다.
- **기본 카드 스타일 (클릭 가능한 카드)**
  - Tailwind 클래스 기준:
    - `relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg cursor-pointer`
  - 의미:
    - 살짝 둥근 모서리(2xl)와 옅은 그림자(shadow-sm)를 기본으로, hover 시 `shadow-lg`만 강하게 하여 **푸른 글로우 대신 자연스러운 카드 부각**을 사용합니다.
    - 배경은 `bg-white/80`, 테두리는 `border-gray-200`로 통일합니다.
- **대시보드용 카드 컴포넌트 규칙**
  - Requestor/Manufacturer/Admin 대시보드 및 워크시트에서 새로 만드는 카드형 UI는 기본적으로 위 스타일을 따릅니다.
  - 통계 카드, 최근 리스트 카드, 위험 요약 카드, 배너 카드 등은 모두
    - `relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg`
    - 필요 시 `flex-1`, `min-h-[220px]` 등 레이아웃 관련 클래스만 추가합니다.
  - 특수 테마 카드(예: 경고/배너)는 테두리 색상/배경색만 변형합니다.
    - 예: 묶음 배송 배너 → `border-orange-300 bg-orange-50/80` + 나머지는 동일.
- **금지 사항**
  - 카드 hover 시 임의의 파란색 그림자, box-shadow 커스텀 CSS 등은 사용하지 않습니다.
  - 동일한 페이지 내에서 카드마다 다른 shadow/rounded 조합을 쓰지 않습니다.

## 11. 로트넘버(생산번호) 규칙

- **커스텀 어벗(Custom Abutment)**

  - prefix: `AB`
  - 형식: `AB[YYYYMMDD]-[영문 대문자 3글자]`
  - 예시:
    - `AB20251206-AAA` : 2025년 12월 6일 **가공 시작된 1번째** 커스텀 어벗 의뢰건
    - `AB20251206-AAB` : 같은 날 2번째 커스텀 어벗 의뢰건
    - `AB20251206-ABA` : 같은 날 27번째 커스텀 어벗 의뢰건
    - `AB20251207-AAA` : 2025년 12월 7일 **가공 시작된 1번째** 커스텀 어벗 의뢰건 (날짜가 바뀌면 시퀀스 초기화)

- **보철(Crown)**

  - prefix: `CR`
  - 형식: `CR[YYYYMMDD]-[영문 대문자 3글자]`
  - 커스텀 어벗과 동일하게, 날짜별로 3자리 알파벳 시퀀스를 사용합니다.

- **공통 시퀀스 규칙**

  - 우측 3글자 코드는 해당 날짜/해당 prefix(AB 또는 CR)에 대해 **가공 시작된 건수** 기준의 영문 대문자 3자리 시퀀스입니다.
  - 1번째: `AAA`, 2번째: `AAB`, ..., 26번째: `AAZ`, 27번째: `ABA` 형태로 증가합니다.

- **부여 시점 및 저장 위치**
  - 로트넘버는 의뢰 접수 시점이 아니라, **상태가 `가공전`(가공 시작)으로 변경되는 순간**에 백엔드에서 자동 할당합니다.
  - DB에는 `Request.lotNumber` 필드로 저장되며, prefix는
    - `patientCases[].files[].workType`에 `abutment`가 포함된 경우 → `AB`
    - 그렇지 않고 `crown`만 포함된 경우 → `CR`

## 12. API 호출 규칙

- **공통 API 유틸 사용 (apiClient)**

  - 프론트엔드에서 HTTP 요청을 보낼 때는 `src/lib/apiClient.ts`의 `apiFetch` (alias: `request`)를 사용합니다.
  - 새로 작성하는 코드는 `fetch`를 직접 호출하지 않습니다.
  - `apiFetch`는 다음을 공통으로 처리합니다.
    - `Authorization: Bearer <token>` 헤더 자동 추가 (옵션으로 전달된 경우)
    - JSON body(`jsonBody`) 직렬화 및 `Content-Type: application/json` 설정
    - 응답 JSON 파싱 및 `(ok, status, data, raw)` 형태로 반환

- **기존 코드 마이그레이션 전략**

  - 현재 코드베이스에 남아 있는 `fetch` 직접 호출은 **점진적으로** `apiFetch`로 교체합니다.
  - 리팩터링 시에는 다음 순서를 권장합니다.
    - 공통 옵션(토큰, 기본 헤더 등)을 `apiFetch` 호출로 옮긴다.
    - 에러 처리/토스트 로직은 기존 UX를 유지하되, `apiFetch` 반환값을 기반으로 재구성한다.

- **전역 fetch 가드 유지**
  - `main.tsx`에서 설치하는 전역 fetch 가드(`installFetchGuard`)는 **마이그레이션 이후에도 유지**합니다.
  - 과도한 외부 API 호출(예: `/api/ai/parse-filenames`에 대한 무한 루프)을 1차적으로 차단하는 안전 장치로 사용합니다.

## 13. 페이지 컴포넌트 라인 수 제한

- 라우팅 단위 페이지 컴포넌트(`src/pages/**`)는 **800줄을 넘기지 않습니다.**
- 800줄을 초과할 것 같으면 아래 순서로 분리합니다.
  - UI 섹션 단위: `pages/.../components/`로 분리
  - 복잡한 상태/계산/이벤트 로직: `pages/.../hooks/` 또는 `features/.../hooks/`로 분리
  - 페이지 파일에는 **wiring(훅 호출/props 전달/섹션 조립)** 만 남깁니다.

## 14. 배송/도착일(ETA) 규칙

- **기준**: 모든 배송 관련 날짜 표기는 **의뢰인이 받는 날짜(도착일)** 기준으로 합니다.
- **대시보드 표기**: `WorksheetDiameterCard`의 `shipLabel`은 “지금 의뢰 시 예상 도착일(의뢰인이 받는 날짜)”을 표시합니다.
- **직경별 기본 도착 리드타임(초기값)**
  - `6mm`, `8mm`: 의뢰접수(오늘) + **2일**
  - `10mm`, `10+mm`: 의뢰접수(오늘) + **5일**
- **관리자 설정**
  - 직경별 리드타임은 admin이 변경 가능하며, 변경 시 모든 역할(의뢰인/제조사/어드민)에서 동일한 기준을 사용합니다.
  - 기본 API:
    - 통계: `GET /api/requests/diameter-stats`
    - 설정 조회/수정: `GET /api/admin/settings`, `PUT /api/admin/settings` (`deliveryEtaLeadDays`)

## 15. 레거시 제거 원칙

- 기능/필드/타입/응답 스펙을 제거하기로 결정했으면, "남겨두는 레거시"는 두지 않습니다.
  - 프론트 타입/컴포넌트 props
  - 백엔드 컨트롤러 계산 로직
  - API 응답 payload
  - (해당 시) DB 스키마/테스트/문서
    위 항목에서 함께 제거하여 단일 소스로 유지합니다.

## 16. 제조사(Manufacturer) 단일 운영 전제

- 현재 제조사 역할은 **애크로덴트 단일 운영**을 전제로 합니다.
- 제조사 화면에서 의뢰 조회/통계 계산 시에는 다음을 기본으로 포함합니다.
  - 제조사에게 **할당된 의뢰**
  - 아직 제조사 지정이 없는 **미할당 의뢰** (`manufacturer=null` 또는 필드 미존재)
