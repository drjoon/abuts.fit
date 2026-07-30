# Frontend Rules

루트 `rules.md`가 최종 기준입니다.

- 루트 축약본에서 제거된 상세 정책/히스토리 보존본: `.archive/rules.legacy-2026-07-29.md`
- 로컬 전체 상세 미러(공통 참조): `rules.legacy-full.md`
- frontend 도메인 상세는 이 문서 + 공통 미러 + 코드 상단 `related files` 주석을 함께 SSOT로 유지합니다.

- 강제 준수: 루트 `rules.md`의 **[최상단 강제 규칙] 대규모 파일 수정 시 문서/주석 동시 갱신**을 항상 적용합니다.
  - 특히 5개 이상 파일을 탐색/수정한 작업은
    - 관련 rules 문서에 폴더/파일/변경내용 업데이트
    - 코드 내 `related files` 상호참조 주석 추가
    를 완료 조건으로 봅니다.

이 문서는 `web/frontend` 폴더에서만 필요한 **구현 메모**만 남깁니다.

## 1. 구조

- React + TypeScript + Vite + Tailwind 기준으로 작성합니다.
- 공통 UI는 `src/components/ui`에 둡니다.
- 도메인 기능은 `src/features`, 페이지는 `src/pages`, 공유 유틸은 `src/shared`를 우선 사용합니다.
- 페이지 폴더끼리 직접 import하지 않습니다.
- 앱 전역 role 타입 SSOT는 `src/shared/types/role.ts`를 사용합니다. (로컬 컴포넌트에서 role union 재정의 금지)

## 2. 구현 메모

- 스크류 로트 추적 UI(세척.패킹)는 루트 `rules.md` 섹션 **1.0.3**을 따릅니다.
  - 전역 설정 버튼/모달: `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
  - 카드 표시 정책: `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
  - 상세 표시 정책: `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`

- 수동 집하(포장.발송)에서 한진 외 발송 방식은 `shippingWorkflow.manualDeliveryMethods`를 표시/관리합니다.
  - 추적관리 발송 방식은 `manualDeliveryMethods` 대표 1개만 표시합니다(다중 폴백 금지).
  - 한진 외 발송 사유 목록(추가/수정/삭제)은 로컬 state가 아니라 서버 전역 설정 SSOT를 사용합니다.
    - 조회/저장 API: `GET/PUT /api/requests/shipping/manual-pickup-reasons`
  - 입력 UI: `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx`
  - 추적 표시: `src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx`
  - 우편함 상세 표시: `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx`
  - 타입: `src/types/request.ts`

- 제조사 워크시트 상단 검색 인풋 SSOT는 `WorksheetStageSearchInput` 단일 컴포넌트입니다.
  - 공정 탭(의뢰/CAM/가공/세척.패킹/포장.발송/추적관리)의 검색 폭 정책은 개별 페이지에서 재정의하지 않고
    `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetStageSearchInput.tsx`에서 공통으로 관리합니다.

- 포장.발송 우편함 상세 모달 캐시 일관성:
  - `RequestPage`에서 우편함 상세 모달 오픈 시, 요약(`mailboxSummaries.requestCount`)과 캐시 건수가 다르면 캐시를 사용하지 않고 `/api/requests/shipping/mailbox-requests`를 재조회합니다.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx`

- 의뢰자 BusinessAnchor의 기본 헥스 회전값(`requestSettings.defaultManufacturerHexRotation`, 레거시 `hexRotationAngle` 포함)이
  null(미확정)인 의뢰는 `PreviewModal` 승인 시 STL모델대로/헥스30도회전 동시 가공 여부를 확인하고,
  승인 요청 바디(`processBothHexVariants`)로 백엔드 복사 생성 분기를 전달합니다.
  - 관련 파일: `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`, `src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts`

- 헥스 회전 라벨은 **표시(UI)와 전달(canonical)을 total 기준으로 통일**합니다.
  - 코드에서 `보정`/`무보정` 문자열 사용 금지(레거시).
  - 발견 시 즉시 `STL모델대로`/`헥스30도회전`로 치환하고 rules에 기록합니다.
  - UI/백엔드 모두 `STL모델대로` / `헥스30도회전` / `헥스X도회전(total)` 사용
    - 예) `헥스40도회전`
  - legacy minor 라벨(`헥스10도회전`)은 입력 호환만 제공하고, 화면/저장은 total 라벨로 정규화합니다.
  - 디자인 소프트웨어 표시는 BusinessAnchor 전역값이 아니라 의뢰건 `caseInfos.designSoftware`를 우선 표시합니다.
  - 라벨 매핑/정규화 함수는 fallback 기본값을 두지 않고 명시 분기 + default error를 사용합니다.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/features/requests/components/RequestDetailDialog.tsx`
    - `src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx`

- 제조사 워크시트 샘플 구분 SSOT는 `Request.requestCategory`를 사용합니다.
  - 값: `order`, `rnd_sample`, `copied_sample`
  - 작업용 샘플(`rnd.doneAt=null`)은 일반 의뢰와 동일한 공정 탭 흐름(의뢰~추적관리)으로 처리합니다.
  - R&D 보관 샘플(`rnd.doneAt!=null`)은 R&D 탭 전용으로 분리합니다.
  - 차이는 크레딧 정책만 유지합니다(샘플 미차감).
  - 프론트는 `source+rnd.doneAt` 조합 추정 대신 `utils/request.ts`의 `isAnySampleRequest`, `isRndSampleRequest`를 사용합니다.
  - 관련 파일:
    - `src/types/request.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/usePackingWorksheetData.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/hooks/useDiameterQueue.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/machining/utils/label.ts`
    - `src/pages/manufacturer/equipment/cnc/components/CompletedMachiningRecordsModal.tsx`

- 불완전가공 의뢰자 `계속 진행` 이력 표시 정책:
  - 제조사 워크시트 카드/프리뷰는 `rnd.requestorContinueAt/by/message`를 표시해
    의뢰자가 문제 가능성을 인지하고 진행 요청했는지 즉시 확인할 수 있어야 합니다.
  - 화면 표시는 배지 + 요약 문구(요청 시각 포함)로 통일합니다.
  - 관련 파일:
    - `src/types/request.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`

- practice 전송 상태 표준(치과/의뢰자 공통): `발송완료 | 취소 | 수신전 | 수신완료`
  - practice 페이지 상태 정규화 기준: `src/pages/practice/PracticeFileTransferPage.tsx`의 `toStatusLabel`
  - 의뢰자 치과 페이지 읽음 배지 기준: `src/pages/requestor/practice/RequestorPracticePage.tsx` (`isRead` → `수신전/수신완료`)

- 치과(practice) 가입 절차 SSOT
  - 일반 회원가입(`src/features/auth/SignupPage.tsx`)에서 `practice` 역할은 `src/pages/practice/PracticeDropzonePage.tsx`와 동일한 최소 항목(`clinicName`, `staffName`, `phone`, `address`, `addressDetail`, `zipCode`, `password`)으로 가입합니다.
  - API는 일반 `/api/auth/register`가 아니라 `POST /api/auth/practice/register`를 사용합니다.
  - 치과 역할은 소개코드 단계/이메일 인증 단계를 거치지 않고 치과 정보 입력 후 가입 완료로 진행합니다.
  - UI는 전용 스텝 컴포넌트(`src/features/auth/signup/SignupWizardPracticeAccountStep.tsx`)에서 2열 입력(치과명/담당자명, 전화번호/접속 비밀번호) + 공통 주소 컴포넌트(`BusinessAddressFields`)를 사용하며, 비밀번호 확인 필드는 두지 않습니다.
  - 관리자 사용자/사업자 화면(`src/pages/admin/users/AdminUserManagement.tsx`, `src/pages/admin/businesses/AdminBusinessPage.tsx`)에서는 `practice`를 별도 역할(`치과`)로 표시/필터링해야 합니다.
  - 정책 고정: practice는 전송 전용 role이므로 크레딧/정산/추천(리퍼럴) UI(탭/카드/집계) 범위로 확장하지 않습니다.

- practice 파일전송 임시저장(다른 PC 이어쓰기) 정책:
  - 임시저장 SSOT API: `GET/POST/DELETE /api/practice/transfers/draft`
  - 프론트는 로컬스토리지 단독 보관이 아니라 서버 draft를 우선 사용합니다.
  - 임시저장 파일은 `File`(temp upload) 참조를 기준으로 유지하며, 전송 성공 시 draft를 삭제합니다.
  - 관련 파일:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/shared/hooks/useS3TempUpload.ts`

- practice↔requestor 실시간(웹소켓 app-event) 구현 메모:
  - 소켓 공용 레이어: `src/shared/realtime/socket.ts`
    - `onNotification`, `onNewMessage`, CNC 이벤트 리스너 포함 모든 소켓 이벤트 구독은 공통 구독 레이어(`subscribeSocketEvent`)를 통해 지연 초기화/재연결 시에도 유실 없이 동작해야 합니다.
    - 인증 토큰이 변경되면 기존 소켓을 재사용하지 않고 연결을 재초기화해 권한/구독 컨텍스트를 최신화합니다.
  - 소켓 부트스트랩 훅: `src/shared/hooks/useSocket.ts`
    - 토큰 존재 시 매 렌더 주기에서 안전하게 `initializeSocket`을 호출하고, 토큰이 비면 즉시 `disconnectSocket`으로 정리합니다.
  - app-event 디바운스 재조회 공통 훅: `src/shared/realtime/useAppEventDebouncedReload.ts`
  - 채팅방 목록 실시간 동기화: `src/shared/hooks/useChatRooms.ts`
  - 채팅 메시지 실시간 동기화: `src/shared/hooks/useChatMessages.ts`
  - 채팅 role 라벨/뱃지 표시에서는 `practice`를 fallback("사용자")로 처리하지 말고 명시적으로 `치과`로 매핑합니다.
  - 페이지 반영 지점:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/pages/requestor/practice/RequestorPracticePage.tsx`
    - `src/features/chat/components/*`

- 문의(admin/support) 실시간 반영 메모:
  - 관리자 문의 페이지는 `support:inquiry-created`, `support:inquiry-updated`, `comm:badge-update(key=inquiry)` app-event를 수신해 목록을 디바운스 재조회합니다.
  - 구현 파일: `src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx`

- practice 채팅/전송 파일 다운로드 정책:
  - S3 원본 URL 직접 오픈 대신 동일 오리진 프록시(`GET /api/files/s3/download`)를 사용합니다.
  - 프론트 fetch는 `cache: "no-store"` + `_ts` 쿼리로 재검증(304) 지연을 줄입니다.
  - 다중(전체) 다운로드는 순차 루프 대신 `Promise.all(...)` 병렬 처리로 체감 속도를 우선합니다.
  - 적용 파일:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/pages/requestor/practice/RequestorPracticePage.tsx`
- API 호출은 `src/shared/api/apiClient.ts`의 `apiFetch`를 우선 사용합니다.
- 서버 상태는 TanStack Query, 전역 UI 상태는 `src/store`를 사용합니다.
- 파일 드롭은 개별 구현보다 `@/features/requests/components/PageFileDropZone` 재사용을 우선합니다.
- UI에서 `requestId`는 서버 문자열을 그대로 표시합니다.

## 3. 정리 원칙

- 루트와 중복되는 정책은 여기 다시 쓰지 않습니다.
- 특정 화면 UX나 과거 리팩터링 기록은 가능한 한 코드 근처로 옮기고, 이 문서에는 남기지 않습니다.
- 새 규칙이 여러 역할/여러 페이지에 걸치면 루트 `rules.md`를 먼저 수정합니다.
