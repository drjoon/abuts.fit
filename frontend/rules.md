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
|-- /components     # 공통 UI 컴포넌트 (shadcn/ui 기반)
|   |-- /ui         # shadcn/ui 기본 컴포넌트
|   `-- /shared     # 여러 페이지에서 재사용되는 조합 컴포넌트
|-- /constants      # 전역 상수
|-- /hooks          # 커스텀 Hooks
|-- /lib            # 유틸리티 함수, API 클라이언트 등
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

이 규칙은 프로젝트의 일관성을 유지하고 협업 효율을 높이기 위해 만들어졌습니다. 규칙에 대한 수정이나 추가 제안이 있다면 팀과 논의해주세요.
