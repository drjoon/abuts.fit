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
- **간결성**: 로직과 코드량을 최소화해 간결하게 작성하고, 불필요한 예외 처리·분기 추가를 자제합니다.
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

## 6.1 의뢰번호(requestId) 표시 규칙

- 대시보드/리스트/최근의뢰 등 UI에서 `requestId`는 **서버가 생성한 문자열을 그대로 표시**합니다.
- 프론트에서 임의로 **6자리 숫자/해시 등으로 변환(마스킹)하지 않습니다.**

## 7. 크레딧 및 의뢰 관리 정책

### 7.1 크레딧 관리 정책

- **표시 단위**: 조직(Organization) 단위로 크레딧 표시
- **잔액 조회**: 조직 내 모든 멤버가 동일한 크레딧 잔액 조회
- **충전**: 조직 단위로 크레딧 충전 (대표/직원 구분 없음)
- **사용**: 의뢰 생성 시 조직 크레딧에서 자동 차감
- **환불**: 의뢰 취소 시 조직 크레딧으로 자동 복원

### 7.2 생산 프로세스 및 배송 옵션 정책 (UI)

**생산 프로세스 이해**:

```
[의뢰] → (대기) → [CAM] → (20분) → [생산 완료] → (15:00 운송장 입력 마감 / 16:00 택배 수거) → [발송] → (1영업일) → [완료]
```

- **의뢰 단계**: 생산 시작 대기 (한참 걸릴 수 있음)
- **CAM → 생산 완료**: 20분 내 빠르게 진행
- **운송장 입력 마감**: 매일 15:00(KST)
- **택배 수거**: 매일 16:00(KST)
- **총 소요**: CAM 시작 → 20분 생산 → 다음 16:00 수거 → +1영업일 도착

**배송 모드**:

- **신속배송**: (당일 00:00까지 주문) 즉시 CAM 시작 → 당일 15:00 운송장 마감 포함 → 16:00 수거 → +1영업일 도착
- **묶음배송**: 직경별 대기 후 CAM 시작 (CNC 소재 관리)
  - **6-8mm 그룹**: 대기 0시간 (여러 장비에 세팅)
  - **10mm+ 그룹**: 대기 72시간 (모여서 한꺼번에 생산)

**배송 옵션 변경 (Fire & Forget)**:

- **변경 가능 시점**: 의뢰 단계에서만
- **원본 데이터 보존**: `originalShipping` (신규 의뢰 시 선택)
- **변경 데이터**: `finalShipping` (배송 대기 중 변경 가능)
- **Fire & Forget**: API 즉시 응답, 백그라운드 처리 (UI 대기 없음)
- 변경 시 생산 스케줄 자동 재계산

**UI 표시 규칙**:

- 공정 단계: `stageKey` 또는 `stageLabel` 사용
- 레거시 필드: `status1`, `status2` 사용 금지
- 도착예정일: `productionSchedule.estimatedDelivery` (Date) 또는 `timeline.estimatedCompletion` (YYYY-MM-DD)
- 배송 모드: `finalShipping.mode` (없으면 `originalShipping.mode`)
- **지연 위험**: `riskSummary`의 `delayedCount`, `warningCount` 표시
  - 지연/경고 건수를 눈에 띄게 표시 (빨간색 배지 등)
  - 제조사/관리자 대시보드에서 긴급 상황 인지 가능

**배송 대기 내역 UI**:

- 스위치 버튼으로 신속/묶음 전환
- 의뢰 단계에서만 활성화
- CAM 단계부터는 비활성화 (변경 불가)
- **즉시 응답**: 버튼 클릭 시 즉시 UI 업데이트 (Fire & Forget)
- 백그라운드에서 실제 스케줄 재계산 (사용자 대기 없음)

### 7.3 의뢰 취소 정책 (UI)

- 의뢰 취소는 <b>의뢰</b> 단계에서만 가능합니다.
- <b>CAM 단계부터는</b> 취소 버튼을 숨기거나 비활성 처리합니다.

### 7.2 의뢰건 조회 권한 정책

**기본 원칙**: 동일 조직(RequestorOrganization) 소속이면 역할(owner/staff)과 무관하게 조직 내 모든 의뢰를 조회/접근할 수 있습니다.

- 모든 멤버: 조직 내 모든 멤버가 생성한 의뢰 조회 가능
- 의뢰 목록 API(`GET /api/requests/my`)는 서버에서 조직 단위로 필터링

## 8. 채팅 기능 규칙

## 9. 드래그 앤 드롭(파일 업로드) 규칙

- 파일 드래그&드롭을 지원해야 하는 화면에서는 **개별 페이지에서 drag/drop 이벤트를 직접 구현하지 않습니다.**
- 반드시 공용 컴포넌트 `components/PageFileDropZone.tsx`를 사용해 **페이지 전체 드롭**을 기본으로 지원합니다.
- 드롭존 내부 UI(버튼 업로드 등)는 페이지 전용 컴포넌트로 유지하되, drop 이벤트 수신/파일 추출/전파는 `PageFileDropZone`에서 처리합니다.

### 8.1 채팅 타입

- **Request Chat (의뢰 채팅)**: `useRequestChat` 훅 사용

  - 특정 의뢰(Request)에 종속된 채팅
  - API: `POST /api/requests/:id/messages`
  - 참여자: Requestor + Manufacturer (할당시) + Admin

- **Direct Chat (독립 채팅)**: `useChatRooms`, `useChatMessages` 훅 사용
  - 의뢰와 무관한 일반 소통
  - API: `/api/chats/rooms`, `/api/chats/rooms/:roomId/messages`
  - Admin은 모든 사용자와 채팅 가능, 일반 사용자는 Admin과만 가능

### 8.2 채팅 훅 사용법

**useRequestChat** (`shared/hooks/useRequestChat.ts`):

```typescript
const { messages, loading, sendMessage } = useRequestChat({
  requestId: "...",
  currentUserId: user?.id,
  currentUserRole: user?.role,
  currentUserName: user?.name,
});
```

**useChatRooms** (`shared/hooks/useChatRooms.ts`):

```typescript
const { rooms, loading, fetchRooms, createOrGetChatRoom } = useChatRooms();
```

**useChatMessages** (`shared/hooks/useChatMessages.ts`):

```typescript
const { messages, loading, sendMessage } = useChatMessages({ roomId });
```

**useUserSearch** (`shared/hooks/useUserSearch.ts`):

```typescript
const { users, searchUsers } = useUserSearch();
await searchUsers("검색어", "admin"); // 역할 필터링 선택사항
```

### 8.3 파일 첨부

- 파일은 먼저 `/api/files/upload` 로 S3에 업로드
- 반환된 메타데이터를 `attachments` 배열에 포함하여 `sendMessage` 호출
- 기존 `useS3TempUpload` 훅 활용 가능

### 8.4 채팅 UI 컴포넌트

- **ChatWidget** (`components/ChatWidget.tsx`): 전역 채팅 위젯 (기존)
- **ChatConversation** (`components/chat/ChatConversation.tsx`): 대화 UI
- **AdminChatManagement** (`pages/admin/support/AdminChatManagement.tsx`): Admin 채팅 관리

새로운 채팅 UI를 추가할 때는 위 훅들을 활용하여 구현하고, 일관된 디자인을 유지합니다.
