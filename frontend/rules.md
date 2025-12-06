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
- **프론트엔드(UI) 규칙**
  - 의뢰자(Requestor)가 보는 주요 화면(NewRequestPage, RequestList/상세, 대시보드 등)에는
    "부가세(VAT) 및 배송비 별도"임을 명시적으로 안내해야 합니다.
  - 배송 관련 기능(배송 신청 버튼/섹션) 주변에는 **배송비가 별도이며, 묶음 배송을 권장**한다는 안내를 배치합니다.
- **백엔드 연동 시 규칙**
  - 결제/청구 금액 필드(예: `amount`)는 기본적으로 **VAT/배송비 제외 금액**으로 해석합니다.
  - 향후 부가세/배송비를 합산한 총 결제금액이 필요할 경우, 별도의 필드(예: `vatAmount`, `shippingFee`, `totalAmount`)로 분리하여 관리합니다.
  - 외부 결제 모듈 연동 시에도 "서비스 금액 + 부가세 + 배송비" 구조가 유지되도록 요청/응답 스키마를 설계합니다.
