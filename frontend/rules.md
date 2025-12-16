# Frontend Rules for abuts.fit

이 문서는 `abuts.fit` 프론트엔드 프로젝트의 구체적인 개발 규칙을 정의합니다.
**전체 프로젝트 공통 규칙(권한, 비즈니스 로직, 파일 크기 제한 등)은 프로젝트 루트의 `rules.md`를 반드시 참조하세요.**

## 1. 기술 스택 (Tech Stack)

- **Framework**: React (^18.3.1)
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI 기반)
- **Routing**: React Router DOM (^6.26.2)
- **State Management**: TanStack Query (^5.56.2)
- **Linting/Formatting**: ESLint, Prettier
- **Package Manager**: Bun

## 2. 코딩 스타일 및 컨벤션

- **언어**: 모든 코드는 TypeScript로 작성합니다.
- **컴포넌트**: 함수형 컴포넌트와 Hooks 사용을 원칙으로 합니다.
- **네이밍**:
  - 컴포넌트 파일: `PascalCase` (e.g., `UserProfile.tsx`)
  - 변수 및 함수: `camelCase` (e.g., `userData`)
  - 타입 및 인터페이스: `PascalCase` (e.g., `type User`)
- **스타일링**: Tailwind CSS 유틸리티 클래스를 사용합니다.

## 3. 디렉토리 구조

```
/src
|-- /assets         # 정적 에셋
|-- /components     # 공통 UI 컴포넌트
|   `-- /ui         # shadcn/ui 기본 컴포넌트
|-- /features       # 도메인/기능 단위 컴포넌트 (requestor, manufacturer 등)
|-- /shared         # 공유 컴포넌트/훅/유틸
|-- /pages          # 라우팅 단위 페이지
|-- /routes         # 라우팅 설정
|-- /store          # 전역 상태 (Zustand 등)
`-- /types          # 전역 타입
```

## 4. 페이지 및 컴포넌트 구조

### 4.1 Manufacturer
`pages/manufacturer/worksheet/` 하위에 `custom_abutment`, `crown` 등 제품군별 폴더를 두고, 그 하위에 공정 단계(`request`, `machining` 등)를 둡니다.

### 4.2 Requestor & Admin
기능 단위로 폴더를 구분합니다.
- Requestor: `new_request`, `worksheet`, `dashboard`, `settings`
- Admin: `users`, `monitoring`, `support`, `system`, `dashboard`

### 4.3 공통 규칙
- **페이지 전용 컴포넌트**: 해당 페이지 폴더 하위 `components/`에 위치
- **Page Import 금지**: 다른 페이지 폴더를 import하지 않음
- **Settings**: 역할별로 페이지 파일을 분리 (`pages/requestor/settings/SettingsPage.tsx` 등)

## 5. API 호출 규칙

- `src/lib/apiClient.ts`의 `apiFetch`를 사용하여 호출합니다.
- 직접적인 `fetch` 호출은 지양합니다.

## 6. 대시보드/워크시트 카드 UI 규칙

- **기준 컴포넌트**: `features/manufacturer/cnc/components/WorksheetCncMachineSection.tsx` 의 `WorksheetCncMachineCard` 스타일을 기본 카드 스타일로 사용합니다.
- **기본 카드 스타일 (클릭 가능한 카드)**
  - Tailwind 클래스 기준:
    - `relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg cursor-pointer`
  - 의미:
    - 살짝 둥근 모서리(2xl)와 옅은 그림자(shadow-sm)를 기본으로, hover 시 `shadow-lg`만 강하게 하여 **푸른 글로우 대신 자연스러운 카드 부각**을 사용합니다.
    - 배경은 `bg-white/80`, 테두리는 `border-gray-200`로 통일합니다.
