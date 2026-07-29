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

## 2. 구현 메모

- 스크류 로트 추적 UI(세척.패킹)는 루트 `rules.md` 섹션 **1.0.3**을 따릅니다.
  - 전역 설정 버튼/모달: `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
  - 카드 표시 정책: `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
  - 상세 표시 정책: `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`

- 수동 집하(포장.발송)에서 한진 외 발송 방식은 `shippingWorkflow.manualDeliveryMethods`를 표시/관리합니다.
  - 추적관리 발송 방식은 `manualDeliveryMethods` 대표 1개만 표시합니다(다중 폴백 금지).
  - 입력 UI: `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx`
  - 추적 표시: `src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx`
  - 우편함 상세 표시: `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx`
  - 타입: `src/types/request.ts`

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
- API 호출은 `src/shared/api/apiClient.ts`의 `apiFetch`를 우선 사용합니다.
- 서버 상태는 TanStack Query, 전역 UI 상태는 `src/store`를 사용합니다.
- 파일 드롭은 개별 구현보다 `@/features/requests/components/PageFileDropZone` 재사용을 우선합니다.
- UI에서 `requestId`는 서버 문자열을 그대로 표시합니다.

## 3. 정리 원칙

- 루트와 중복되는 정책은 여기 다시 쓰지 않습니다.
- 특정 화면 UX나 과거 리팩터링 기록은 가능한 한 코드 근처로 옮기고, 이 문서에는 남기지 않습니다.
- 새 규칙이 여러 역할/여러 페이지에 걸치면 루트 `rules.md`를 먼저 수정합니다.
