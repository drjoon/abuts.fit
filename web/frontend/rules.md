# Frontend Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `web/frontend` 폴더에서만 필요한 **구현 메모**만 남깁니다.

## 1. 구조

- React + TypeScript + Vite + Tailwind 기준으로 작성합니다.
- 공통 UI는 `src/components/ui`에 둡니다.
- 도메인 기능은 `src/features`, 페이지는 `src/pages`, 공유 유틸은 `src/shared`를 우선 사용합니다.
- 페이지 폴더끼리 직접 import하지 않습니다.

## 2. 구현 메모

- API 호출은 `src/shared/api/apiClient.ts`의 `apiFetch`를 우선 사용합니다.
- 서버 상태는 TanStack Query, 전역 UI 상태는 `src/store`를 사용합니다.
- 파일 드롭은 개별 구현보다 `@/features/requests/components/PageFileDropZone` 재사용을 우선합니다.
- UI에서 `requestId`는 서버 문자열을 그대로 표시합니다.

## 3. 정리 원칙

- 루트와 중복되는 정책은 여기 다시 쓰지 않습니다.
- 특정 화면 UX나 과거 리팩터링 기록은 가능한 한 코드 근처로 옮기고, 이 문서에는 남기지 않습니다.
- 새 규칙이 여러 역할/여러 페이지에 걸치면 루트 `rules.md`를 먼저 수정합니다.
