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

- 최근 변경 목록 파일: `web/frontend/modified_prep_stage_changes_2026-08-03.txt` (작업 공정 변경 이력, 프론트 표시 레벨)

Notes:
- Requestor workspace header: 기간 필터는 대시보드만. 지난 의뢰는 대시보드 `RequestorRecentRequestsCard` 헤더 우측. 보유 크레딧·충전은 사이드바 `크레딧`(`/dashboard/credits`) — 내역/충전 탭, 충전 CTA=`?tab=charge`. 설정 결제 탭은 제거(구 `?tab=payment` → 크레딧 충전 리다이렉트). 설정 의뢰 탭도 제거 — 디자인소프트웨어·아노다이징은 어벗의뢰(`/dashboard/new-request`) 좌측 상단 버튼. 아노다이징: 의뢰자 계정 기본값(`User.requestSettings.anodizingEnabled` / API `requestorAnodizingEnabled`) → **신규 업로드에만** `caseInfos.anodizingEnabled` 주입(이미 첨부된 카드·디자인소프트웨어와 동일하게 미변경). 사업체 `requestSettings.anodizingEnabled`는 레거시/미설정 폴백(기본 ON).
- Semantic color palette (강제, 앱 전체):
  - 의미 축 4 + 서비스 1만 사용. 같은 축 안 차이는 soft/muted/DEFAULT/strong 밝기만.
    - **Primary** (`--primary*`) — 브랜드·CTA·공정·묶음출고·정상/완료
    - **Attention** (`--accent*`) — 신속출고·불완전가공·마감임박·warning
    - **Danger** (`--destructive*`) — 취소·실패·치명
    - **Neutral** (muted/secondary/slate chrome) — 준비·추적·비활성·보조
    - **Service** (`--service-gigong*` / `--service-abut*`) — 기공 vs 어벗 구분만
      (기공=부드러운 푸른색 hue 208°, 어벗=눈 편한 골드/노랑 hue 46°, 채도 낮춤.
       Attention 앰버(25°)와는 어벗이 더 노란 골드로 구분)
  - raw Tailwind 팔레트(`sky`/`teal`/`violet`/`purple`/`emerald`/`green`/`yellow`/`orange`/`rose`/`indigo`/`cyan` 등)로 의미 색을 새로 쓰지 말 것.
  - SSOT: `src/index.css`, `tailwind.config.ts`, `src/shared/ui/semanticStatus.ts`,
    `src/shared/ui/gigongAbutAccent.ts`, `src/shared/shipping/shippingMode.ts`
- Tooltip (강제, 앱 전체):
  - 마우스 호버 툴팁은 **즉시** 표시 (`delayDuration={0}`).
  - SSOT: `src/components/ui/tooltip.tsx` (`TooltipProvider` 기본값 0),
    루트 `src/App.tsx`, `.cursor/rules/tooltip-instant.mdc`.
  - 중첩 `TooltipProvider`/`Tooltip`에 `delayDuration={200}` 등 지연을 두지 말 것.
- Requestor dashboard: 상단 카드 '의뢰/취소' -> '준비'로 변경. 취소 항목은 카드에서 제거(내부 DB는 유지). 상세 정책/모달의 '의뢰' 문구는 '준비'로 변경함.
- 의뢰 취소 정책 SSOT: **준비 단계에서만** 취소 가능(불완전가공 판정 예외 유지). 레거시 '의뢰/CAM 단계 취소' 문구·판정 금지.
  - UI: `RequestorRecentRequestsCard` 취소 버튼/툴팁, `RequestorDashboardPage` 실패 토스트, `PricingPolicyDialog` 6절
  - API: `PATCH /api/requests/:id/status` 취소 검증, 중복 replace(`from-draft`/`creation.request`)의 `isCancelableStage`

## 0. Frontend 중요 진입 파일 지도 (로컬)

- 시간/기간 (KST)
  - 루트 `rules.md` §1.4: 표시·필터·집계는 `Asia/Seoul`. 브라우저 로컬 TZ에 의존하는
    `Date#getDay()`/`toLocaleDateString()` 단독 사용 금지 → `timeZone: "Asia/Seoul"` 또는
    `src/shared/date/kst.ts` / `src/utils/dateFormat.ts` / `src/store/usePeriodStore.ts`
  - 출고 남은시간 뱃지: `src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts` `getDeadlineInfo`
    (문구: `출고 N일전` / `출고 N시간전` / 1시간 미만은 `출고 0시간전`,
     `출고시간 지남`은 16:00 KST 이후만. 기준시각: `estimatedShipYmd` 16:00 KST)
  - 신규의뢰 ETA: `src/pages/requestor/new_request/hooks/useLeadTimeForecast.ts`
    (묶음: `src/shared/shipping/weeklyBatchSchedule.ts` — 백엔드 `resolveNextWeeklyBatchYmd`와 동일 civil YMD 요일)
    (묶음: 백엔드와 동일하게 `minBusinessDays=N` → N영업일 후 출고, lead=1이면 익영업일.
     당일 출고·`(N-1)` 금지. 이후 주간 발송 요일 정렬)
    (신속: KST 12시 이전=당일, 이후=+1영업일 — 백엔드 `EXPRESS_CUTOFF_HOUR_KST=12`와 동일.
     선택 가능 조건: 신속 ETA YMD < 묶음 ETA YMD — `isExpressShippingSelectable`)
    (디자인+생산 `design_custom_abutment`: 묶음/신속 공통 출고 +1영업일 —
     `estimateShipDate.ts` / 백엔드 `needsDesignLeadDay`)
    (안내 카피: `PricingPolicyDialog` 출고 리드타임·출고 방식,
     `NewRequestShippingSection`, 대시보드 `RequestorBulkShippingBannerCard`)
- 앱/라우팅
  - `src/App.tsx`
  - `src/features/layout/DashboardLayout.tsx`
  - `src/features/layout/AccountSwitcher.tsx` (사이드바 계정 팝업 · 같은 사업자 계정 전환)
  - `src/store/useAuthStore.ts` (`switchAccount`)
- 공용 타입(역할 SSOT)
  - `src/shared/types/role.ts`
- 실시간(웹소켓) 공통
  - `src/shared/realtime/socket.ts`
  - `src/shared/realtime/useAppEventListener.ts`
  - `src/shared/realtime/useAppEventDebouncedReload.ts`
  - `src/shared/realtime/creditBalanceEvent.ts`
  - `websocket-realtime-update-checklist.md` (웹소켓 실시간 업데이트 자동 점검 체크리스트)
- 의뢰자 가입·유형·게이트
  - `src/features/auth/SignupPage.tsx` (공개 가입: requestor|salesman)
  - `src/shared/business/requestorCapabilities.ts`
  - `src/shared/business/useRequestorBusinessAccess.ts`
  - `src/shared/business/BusinessPaidAccessGate.tsx`
  - `src/shared/business/PracticeTransferRoleTabs.tsx`
  - `src/shared/components/business/RequestorCapabilitiesPicker.tsx`
  - `src/shared/components/business/settings/BusinessTab.tsx`
  - `src/shared/onboarding/SharedOnboardingWizardPage.tsx`
  - `src/shared/onboarding/wizard/SettingsWizard.tsx`
  - `src/shared/onboarding/wizard/steps/BusinessStep.tsx`
  - `src/shared/onboarding/wizard/steps/PracticeBusinessProfileStep.tsx`
- 의뢰자 신규의뢰/치과
  - `src/pages/requestor/new_request/NewRequestPage.tsx`
  - `src/pages/requestor/new_request/components/NewRequestShippingSection.tsx`
  - `src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx`
  - `src/pages/requestor/new_request/utils/patientGroups.ts` (구강스캔 자동묶음·파일크기 분류)
  - `src/pages/requestor/new_request/hooks/usePatientFileGroups.ts`
  - `src/shared/components/RequestorWorkspaceHeader.tsx` (대시보드 기간 필터+알림)
  - `src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx` (지난 의뢰 버튼)
  - `src/pages/requestor/credits/RequestorCreditsPage.tsx` (사이드바 크레딧: 내역/충전)
  - `src/shared/shipping/shippingMode.ts`
  - `src/pages/requestor/practice/RequestorPracticePage.tsx`
  - 디자인 큐
  - `src/pages/requestor/design/DesignPage.tsx`
  - `src/pages/requestor/design/DesignRequestCardGrid.tsx`
  - `src/pages/requestor/design/DesignRequestTransferView.tsx`
  - 제조사 워크시트
  - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
  - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx`
  - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
  - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`
  - `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
  - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetStageSearchInput.tsx`
- practice
  - `src/pages/practice/PracticeDropzonePage.tsx`
  - `src/pages/practice/PracticeFileTransferPage.tsx`
  - `src/pages/practice/hooks/usePracticeTransferStep1.ts` (최근 기공소 local+서버 merge)
  - `src/shared/components/practice/PracticeTransferFilePane.tsx`
  - `src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx`
    - 보철물 치식: 치아만 마키 → 각각 크라운. 드래그 경로가 `+`를 지나거나 `+` 클릭 → 브리지. 형태 글자 클릭 → 크라운→인레이→어벗 디자인 / 브리지↔Pontic. 어벗 디자인은 커스텀 체크박스(임플란트·스캔바디) 지원. 전체해제·크게보기. 신규의뢰·기공의뢰서(practice/dropzone) 공통.
  - `src/shared/practice/usePracticeToothWorkEditor.ts`
  - `src/shared/practice/toothWorkDraft.ts`
  - `src/shared/components/PracticeTransferDetailChatDialog.tsx`
- 관리자 사용자/사업자
  - `src/pages/admin/users/AdminUserManagement.tsx`
  - `src/pages/admin/businesses/AdminBusinessPage.tsx`
  - 관리자 UI에서 별도 `치과`(practice) role 필터/생성은 제거. 레거시 practice는 의뢰자로 표시하고, 의뢰자 `requestorCapabilities`(발신(치과)/수신(기공소·기공실)) 뱃지로 구분.
- 관리자 크레딧
  - `src/pages/admin/credits/AdminCreditPage.tsx`
  - `src/pages/admin/credits/hooks/useAdminCreditPage.ts`
  - `src/pages/admin/credits/components/RequestorCreditTab.tsx`
  - `src/pages/admin/credits/components/RequestorOrganizationsTab.tsx`
  - `src/shared/components/CreditLedgerModal.tsx`
  - `src/features/settings/tabs/AdminCreditSettingsTab.tsx` (요금/expressFee·designFee 전역 설정 UI)
- 개발·운영사 설정
  - `src/pages/devops/DevopsSettingsPage.tsx` (계정/사업자/임직원/**결제(입금 계좌)**/알림/보안)
  - `src/pages/devops/DevopsPartnerPage.tsx` 탭: **입금**(분배율) · 요금·크레딧 · **기공의뢰 자동매칭**
    - 요금·크레딧에 치과 납품 어벗 소매가(`abutmentRetailPrice`) 포함
    - 기공의뢰 자동매칭: 상단 `DevopsDesignDeadlineTab`(수락 후 마감 요약) + `PracticeTransferAutoMatchTab`(기공의뢰 자동매칭 ON). 구 `?tab=design|deadline` → `autoMatch`
  - 의뢰자(기공소) 설정: `requestorKind=lab`일 때 알림 **왼쪽**에 「거래 치과 등록」·「기공비」 탭
    - `src/pages/requestor/settings/SettingsPage.tsx`
    - `src/features/settings/tabs/LabTradingPartnersTab.tsx` — 거래처 O/X 결제 안내 + 초대
    - `src/features/settings/tabs/LabFeeScheduleTab.tsx` — crown/bridge/inlay/pontic/customAbutmentDesign(커스텀어벗 디자인, 기본 1만)
    - 등록 기간 D-day 배너: `LabTradingPartnerWindowBanner` — 기공의뢰수신·어벗의뢰 상단. 클릭 → `?tab=trading-partners`
      - `src/features/lab/LabTradingPartnerWindowBanner.tsx`
      - `src/shared/lab/useLabTradingPartnerWindow.ts` (`GET /api/lab-trading-partners/window`)
  - 수락 후 마감: `DevopsDesignDeadlineTab` — 디자인 클레임 후 작업 마감(`designDeadlineSettings.claimHours`, 기본 3시간). 파트너 **기공의뢰 자동매칭** 탭 상단
  - 기공의뢰 자동매칭: `PracticeTransferAutoMatchTab` — 검증 기공소 `BusinessAnchor.practiceTransferAutoMatchEnabled`. 파트너 **기공의뢰 자동매칭** 탭(페이지 무한스크롤, 내부 스크롤 없음)
  - 검증된 디자이너 지정: `DesignerAssignmentTab` / `BusinessAnchor.designAccessEnabled`(디자인 큐). API·게이트 유지, 파트너 탭 UI에서는 제거
  - 영업자 없을 때 분배: 설정된 영업자 분배비의 절반→제조사, 나머지 절반→관리자 (백엔드 `resolveRatesWithoutSalesman`와 동일 미리보기)
  - 관리자 대시보드/소통
  - `src/pages/admin/dashboard/AdminDashboardPage.tsx`
  - `src/pages/admin/support/AdminChatManagement.tsx`
  - `src/pages/admin/support/AdminSmsPage.tsx` (로컬 SMS 템플릿 CRUD·사업자/사용자 휴대폰 수신자 선택)
- 제조사 정산
  - `src/pages/manufacturer/payments/PaymentsPage.tsx`
  - `src/pages/admin/AdminPaymentsPage.tsx`

## 1. 구조

- React + TypeScript + Vite + Tailwind 기준으로 작성합니다.
- 공통 UI는 `src/components/ui`에 둡니다.
- 도메인 기능은 `src/features`, 페이지는 `src/pages`, 공유 유틸은 `src/shared`를 우선 사용합니다.
- 페이지 폴더끼리 직접 import하지 않습니다.
- 앱 전역 role 타입 SSOT는 `src/shared/types/role.ts`를 사용합니다. (로컬 컴포넌트에서 role union 재정의 금지)

## 2. 구현 메모

- 신규의뢰 첨부·구강스캔 묶음 (파일 크기 SSOT):
  - 목적: 첨부 시 **자동**으로 커스텀어벗 디자인 STL과 구강 스캔을 섞어 묶지 않는다.
  - 허용 확장자: **`.stl`만** (어벗생산의뢰). PLY/OBJ는 기공의뢰(`/dashboard/practice-transfers`)에서 받음.
  - **3MB 초과 드롭/파일 오픈**: 첨부 전 `ConfirmDialog`로 확인. 3D 프리뷰(`StlPreviewViewer`) + «커스텀 어벗 STL만 받음» + 구강스캔이면 **기공의뢰** 안내. 확인 시에만 어벗생산의뢰로 첨부. **기공의뢰** 클릭 시 `navigate(..., { state: { prefilledFiles } })`로 파일을 넘기고 `PracticeFileTransferPage`가 첨부.
  - 자동 분류·묶음 (3MB 단일 기준):
    - **>= 3MB** (`ORAL_SCAN_MIN_BYTES`): 구강 스캔 → 자동 묶음 대상. `productMode=design_custom_abutment`. 뱃지 `구강스캔`(툴팁: 커스텀어벗 디자인+생산).
    - **< 3MB** (`CUSTOM_ABUT_DESIGN_MAX_BYTES` = 동일): 커스텀어벗 디자인 → 자동 묶음 **제외**(각각 별도 건). `productMode=custom_abutment`. 뱃지 `어벗디자인`(툴팁: 커스텀어벗 생산).
    - `planAutoGroupsForNewFiles` / `planBatchGroupIfAmbiguous`는 **>=3MB만** 포함.
  - 수동 연결·해제: **3MB 기준 적용 안 함**. 체크/마키로 합치기·연결 끊기는 **모든 파일** 가능.
    - `groupSelectedFiles` / `ungroup` / `addFilesToGroup` / `removeFileFromGroups`에 크기 필터 금지.
    - 수동 묶음은 `design_custom_abutment`. 해제 시 크기 휴리스틱으로 productMode 복원.
  - 구현: `patientGroups.ts`, `usePatientFileGroups.ts`, UI `NewRequestAttachmentsPanel.tsx`, 게이트 `NewRequestPage.tsx` + `ConfirmDialog`.
  - Cursor 룰: `.cursor/rules/oral-scan-file-size.mdc`
- 신규의뢰 배송 방식(묶음/신속):
  - 의뢰카드에서 `shippingMode`(`normal`|`express`)를 건별로 선택합니다.
  - 우측 배송 설정은 안내/요일 설정 + 제출만 담당합니다.
  - 신속 추가 의뢰크레딧 금액은 `creditSettings.expressFee`(기본 2,000원)를 사용합니다.
  - 디자인+생산(`design_custom_abutment`): `(생산 단가 + 디자인비) × 어벗 수`.
    - 디자인비는 `creditSettings.designFee`(기본 15,000원 / 1어벗). 어벗 수는 `toothWorks` 커스텀어벗·임플란트 치아(Pontic 제외).
    - 생산(`custom_abutment`)은 Request/STL당 생산 1개. 신속비는 건당.
    - 디자인+생산 신속비는 **어벗 수 배수** (`expressFee × abutmentQty`).
    - 표시 라벨: `커스텀어벗 생산` / `커스텀어벗 디자인+생산` (생략 시 `생산` / `디자인+생산`).
    - 출고일: 묶음/신속 공통 **+1영업일**(디자인). 안내 카피 SSOT는 `.cursor/rules/design-fee.mdc` UI 절.
    - 의뢰카드는 `+디자인` 뱃지만. 의뢰 상세(`RequestDetailDialog`)에는 비용 세부(생산/디자인/배송·신속) 표시.
    - 표시: `PricingPolicyDialog`, `RequestDetailDialog`. 오늘의 생산 가격 카드는 생산 단가·할인만(디자인비 미표시). 신규의뢰 우측에는 금액 미표시.
  - 설정 UI SSOT: 관리자 설정(결제) + 개발·운영사 설정(요금) → `AdminCreditSettingsTab`
    - API: `GET /api/credits/settings`, `PATCH /api/admin/settings/credits` (`admin`|`devops`)
  - 표시 금액 SSOT: 신속배송이면 생산비+추가비를 합산해 보여줍니다 (`resolveQuotedPriceAmount` in `shippingMode.ts`).
    - 백엔드가 `price.amount`/`price.expressFee`/`price.designFee`를 내려주면 이중 합산하지 않습니다.
    - 카드/상세: `RequestorRecentRequestsCard.tsx`, `RequestDetailDialog.tsx`
  - 우측 기본 배송 방식(`normal`|`express`)은 로컬스토리지 + `BusinessAnchor.shippingPolicy.defaultShippingMode`에 저장합니다.
  - 신속 선택: `isExpressShippingSelectable` — 신속 예상 출고일이 묶음보다 빠를 때만 UI 활성
    (`estimateShipDate.ts`, `NewRequestShippingSection` / `NewRequestAttachmentsPanel`).
  - 의뢰카드 하단(마감시간 옆)에 `shippingMode`에 따라 `신속배송`/`묶음배송` 뱃지를 항상 표시합니다.
    (`ShippingModeBadge`, `WorksheetCardGrid`, 대시보드 의뢰 리스트)
  - 워크시트 목록 API(`view=worksheet`) projection에 `shippingMode`/`finalShipping`/`originalShipping`을 포함해야 합니다.
  - 대시보드 묶음/신속 토글: `PATCH /api/requests/my/shipping-mode` (`RequestorBulkShippingBannerCard.tsx`)
  - 우편함: 신속 건 포함 시 오늘 발송 가능으로 처리 (`shippingDay.helpers.ts`)
  - 관련 파일:
    - `src/pages/requestor/new_request/NewRequestPage.tsx`
    - `src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx`
    - `src/pages/requestor/new_request/components/NewRequestShippingSection.tsx`
    - `src/pages/requestor/dashboard/components/RequestorBulkShippingBannerCard.tsx`
    - `src/shared/shipping/shippingMode.ts`
    - `src/shared/shipping/ShippingModeBadge.tsx`
    - `src/shared/ui/PricingPolicyDialog.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/shippingDay.helpers.ts`

- 지정 디자이너 디자인 큐 (`/dashboard/design`):
  - 접근: `BusinessAnchor.designAccessEnabled` (`/api/devops/design-access`). 사이드바·`DesignAccessGate`.
  - 목록: `design_custom_abutment` + 준비. PeriodFilter는 흰 패널 안(좌우상하 여백 동일).
  - UI: 기공의뢰서형 카드 + `PracticeTransferDetailChatDialog`(상세·치식·파일·기공소 채팅).
    `RequestPage detailMode="transferChat"` — 제조 `WorksheetCardGrid`/`PreviewModal` 미사용.
  - 클레임: 「수락」 → `POST /api/requests/:id/design-claim`
    - 타 디자이너: 클레임 후 60초간 「다른 디자이너 작업중」 → 이후 목록에서 숨김
    - 마감(`designDeadlineSettings.claimHours`, 기본 3h, 클레임 시각 기준) 만료 시 재공개
    - 본인만 승인(화살표). 남은 시간 ≤30분이면 마감 임박 경고
  - 채팅: `GET /api/chats/request-room/:requestId` (디자인 파트너 ↔ 의뢰 기공소)
  - 관련: `DesignPage.tsx`, `DesignRequestCardGrid.tsx`, `DesignRequestTransferView.tsx`,
    `RequestPage.tsx`, `PracticeTransferDetailChatDialog.tsx`, `DevopsDesignDeadlineTab.tsx`

### 가공 우선순위

제조 워크시트 재생목록 / Next Up 순서는 백엔드 SSOT를 따른다.

- 상세: `web/backend/rules.md` **가공 우선순위**
- 정렬: `compareMachiningQueueOrder` — 가공중 → 아노 ON → 신속 → 묶음 → `queuePosition`
- 프론트는 `/api/cnc-machines/queues` 응답 순서를 그대로 표시한다.
  - `src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts`
  - `src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx`
- 「우선순위」 버튼 → `MachiningPriorityRulesModal` (`GET /api/cnc-machines/machining-priority-rules`)
- 신속배송 14:00 빠른 가공 재배치:
  - socket `machining:express-rebalance` / queues `meta.expressRebalanceAlert`
  - Alert 칩 클릭 → `ExpressRebalanceAlertModal` (장비별 배정·예상 가공시간·예상 완료·예측 기준)
  - 재배치 건 뱃지: `fastMachiningRebalance` → `MachiningRequestLabel` 「빠른 가공 재배치」
- 신속/묶음 뱃지: 가공카드(Complete/Now Playing/Next Up)·재생목록·프리뷰(`PreviewModal`)에 `ShippingModeBadge` 상시 표시
  - `MachiningRequestLabel.tsx`, `CncPlaylistDrawer.tsx`, `PreviewModal.tsx`
  - 큐 API(`/api/cnc-machines/queues`)·worksheet 목록에 `shippingMode`/`finalShipping`/`originalShipping` 포함 → 프리뷰는 **추가 fetch 없이** 큐/목록 페이로드만 사용
  - 재생목록 항목 클릭 → PreviewModal (코드 에디터는 프리뷰 내 버튼)

- 신규 기공소 런칭 이벤트 가격 표시 SSOT:
  - 가입 승인일 기준 `90일` 동안 커스텀 어벗 `개당 10,000원` 고정가를 적용합니다.
  - 기존 거래 치과 등록은 `max(pricingBaseDate, 2026-08-11)` 기준 **30일**간만 신규 초대 가능(D-day 배지·상단 배너). 탭 라벨: 「거래 치과 등록」.
  - 기공소 화면(기공의뢰수신·어벗의뢰) 상단에 등록 잔여일 alert 배너 표시(기간 중만). 클릭 시 설정 탭 이동.
  - 치과 장부 라벨: 기공비 / 어벗의뢰비 / 배송비. 기공소 기공크레딧은 의뢰·배송 잔액과 분리 표시.
  - 안내 모달/대시보드 헤더([정책]·무료 재제작 잔여) 문구는 동일한 `90일` 기준을 사용해야 합니다.
  - 관련 파일:
    - `src/shared/ui/PricingPolicyDialog.tsx`
    - `src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx`

- 스커리씁 로트 추적 UI(세척.패킹)는 `rules.legacy-full.md` 섹션 **1.0.3**을 따릅니다.
  - 전역 설정 버튼/모달: `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
  - 카드 표시 정책: `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
  - 상세 표시 정책: `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`

- 제조사 워크시트 의뢰 정보 표시 SSOT (`RequestInfoSummary`):
  - 카드/프리뷰 본문의 환자·임플란트·생산 정보는 개별 JSX로 흩뿌리지 말고
    `src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx`를 사용합니다.
  - 의미 단위 섹션 고정: **환자** → **임플란트** → **생산**(있을 때만).
  - 레이아웃: 카드는 `layout="stack"`(기본), PreviewModal은 `layout="row"`(가로 3열)로 요약 높이를 줄여 STL 영역을 확보합니다.
  - 중복 금지 / 배치:
    - 상단 조직 줄: 기공소명(`requestor.business|business.name|requestorBusinessAnchor.name|requestor.name`) · 날짜. 기공소명은 1회만.
    - 환자 줄: `치과명 / 환자명 / 치아` (치과명·환자명 나란히, 옆 치아번호).
    - 기공소명과 치과명이 같거나 포함 관계면 환자 줄에서 치과명을 생략합니다.
    - PreviewModal에서 STL 뷰어 오버레이가 보이는 경우(가공 NC 텍스트 단계 제외) 커넥션/최대직경/길이는 요약에서 생략하고 오버레이만 사용합니다.
  - 시각 토큰 통일: 컨테이너 `rounded-lg border-slate-200/80 bg-slate-50/70`, 본문 `text-[13px] text-slate-700`, 섹션 라벨 `text-[10px] text-slate-400`, 구분자는 `•`.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestInfoSummary.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`

- 수동 집하(포장.발송)에서 한진 외 발송 방식은 `shippingWorkflow.manualDeliveryMethods`를 표시/관리합니다.
  - 추적관리 발송 방식은 `manualDeliveryMethods` 대표 1개만 표시합니다(다중 폴백 금지).
  - 한진 외 발송 사유 목록(추가/수정/삭제)은 로컬 state가 아니라 서버 전역 설정 SSOT를 사용합니다.
    - 조회/저장 API: `GET/PUT /api/requests/shipping/manual-pickup-reasons`
  - 입력 UI: `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx`
  - 추적 표시: `src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx`
  - 우편함 상세 표시: `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx`
  - 타입: `src/types/request.ts`

- 제조사 워크시트 검색 SSOT는 헤더 `worksheetSearch`입니다.
  - 상태/입력: `src/features/layout/DashboardLayout.tsx` (헤더 우측 검색)
  - Outlet context로 `worksheetSearch`를 공정 페이지에 전달합니다.
  - 컨텐츠 영역 중복 검색 바(`WorksheetStageSearchInput`)는 워크시트 공정 페이지에서 사용하지 않습니다.
  - `WorksheetStageSearchInput`은 모달 등 독립 검색 UI(예: SelfInspectionReportModal)에서만 재사용합니다.

- 제조사 워크시트 `request`(준비) 탭 필터 SSOT:
  - 카드 목록 필터는 `deriveStageForFilter` 결과 `준비`를 기준으로 판정합니다.
  - request 탭 API 조회는 `manufacturerStageIn=준비` 단일값만 전달합니다.
  - `manufacturerStage` request 단계 레거시 값(`의뢰`, `request`) 사용/비교는 금지합니다.
  - 상단 카운터/카드 목록 불일치 방지를 위해 탭별 API stage 필터와 클라이언트 stage 비교 문자열을 동일하게 유지합니다.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering.ts`

- 작업 공정 변경:
  - `PreviewModal`과 `WorksheetCardGrid`의 화살표 액션은 동일 공정 전이 규칙을 사용합니다.
  - 작업 탭 화살표 기준은 `준비 ↔ 가공` 흐름입니다. CAM 단계는 UI 탭/전이 키로 쓰지 않습니다.
    - 승인(`→`): `review-status`에 `stage=machining` + `nextUpCamRunGuard=true`를 보냅니다.
      - 클릭 즉시 "가공 이동 요청 전송됨" 진행 토스트를 띄우고, `request:stage-changed` 웹소켓에서 `toStage=가공` 수신 시 진행 토스트를 닫습니다.
      - Next Up 진입 시에만 `caseInfos.ncFile.s3Key`(NC 메타) 존재 여부를 검사합니다.
      - NC 메타가 없으면 승인 자체는 진행(가공 이동)하고, 백엔드에 BG1/Esprit NC 생성 큐를 등록하며 `CAM 실행` 토스트를 표시합니다.
      - 레거시 review 키 `cam`으로 준비→가공 진입을 보내지 않습니다.
    - 롤백(`←`): 가공에서 준비로 직접 롤백합니다.
      - 클릭 즉시 "준비 롤백 요청 전송됨" 진행 토스트를 띄웁니다. (카드 화살표 + PreviewModal + MachiningBoard Next Up/Now Playing 경로 포함)
      - `request:stage-changed` 웹소켓에서 `toStage=준비` 수신 시 진행 토스트를 닫습니다.
      - PreviewModal의 승인/롤백 후에는 자동 next-open을 수행하지 않고 모달을 닫습니다.
      - 승인/롤백 직후 동일 의뢰를 자동으로 다시 여는 동작은 금지합니다.
      - 다음 의뢰 열기는 작업자가 `Skip(S)` 등 명시 동작으로만 수행합니다.
      - 롤백 stage-changed 웹소켓은 현재 탭 필터에 맞는 의뢰가 리스트에 없으면 즉시 prepend patch를 적용해 카드 누락을 방지합니다.
      - rollback 계열 웹소켓 source(`stage-file-rollback-only|stage-file-rollback-with-delete|nc-rollback-only|nc-rollback-with-delete`)는 payload patch 우선으로 반영하고 즉시 목록 재조회는 생략해 중복 refetch를 줄입니다.
      - 롤백 진행 토스트는 토스트 중복 억제 예외(`skipDuplicateCheck`)로 처리해, 연속 클릭 테스트에서도 클릭 직후 안내가 항상 보이도록 합니다.
      - 파일 보존 정책: rollbackOnly 롤백에서는 NC/공정 파일 메타를 삭제하지 않고 공정만 되돌립니다.
  - 헤더/라우팅 탭에서 CAM 탭은 노출하지 않으며, `stage=cam` legacy URL은 `machining`으로 매핑해 처리합니다.
  - 세척.패킹/포장.발송/추적관리 구간은 기존 `rollbackOnly` 기반 전이를 유지합니다.
  - 관련 파일:
    - `src/features/layout/DashboardLayout.tsx`
    - `src/pages/manufacturer/worksheet/WorksheetPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/hooks/useCardActions.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts`
  - NC 생성 메타(`caseInfos.ncFile.s3Key`)가 있는 의뢰건은 카드/프리뷰 상단에 `NC` 뱃지를 표시합니다.
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`
  - 가공 보드 표기 정책:
    - 실제 RUNNING/PROCESSING(또는 nowPlayingHint) 항목이 없으면 `Now Playing`은 비워두고, 큐 맨 앞 항목을 `Next Up`으로 표시합니다.
    - `src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachineQueueCard.tsx`
    - Complete/Now Playing/Next Up·예약(재생)목록 라벨에 의뢰자명(`businessName`)을 치과명 앞에 표시합니다.
      - API: 큐 `GET /api/cnc-machines/queues`, last-completed `GET /api/cnc-machines/machining/last-completed?includeRequests=true`
      - 표시: `MachiningRequestLabel`(`business`) · `CncPlaylistDrawer` · `formatMachiningLabel`
- 기본 공용 검색 입력 컴포넌트는 `src/components/ui/input.tsx` (`@/components/ui/input`)입니다.
  - 관리자 크레딧 페이지 검색 UI 배치 기준 파일:
    - `src/pages/admin/credits/AdminCreditPage.tsx`
    - `src/pages/admin/credits/components/RequestorCreditTab.tsx`

- 관리자 크레딧 원장 모달(`src/shared/components/CreditLedgerModal.tsx`) 표시 정책:
  - 모달 상단 잔액 요약은 단일 SSOT 장부 API의 `currentBalanceSnapshot` 값을 사용합니다.
  - 테이블 `balanceAfter`는 현재 총잔액이 아니라 “행 시점 잔액”으로 표기합니다.
  - 의뢰(REQUEST) 차감 행에는 신속/묶음배송 뱃지를 표시합니다 (`ShippingModeBadge`).
  - 신속 추가비(`express_surcharge`)는 API에서 생산비(`machining_spend`)와 합산해 1행으로 내려줍니다(표시 금액=생산비+추가비).
  - 레거시 `BONUS` 타입 문구/분기 사용 금지. 이벤트 타입/계정코드(`LedgerJournal.eventType`, `LedgerLine.accountCode`)를 기준으로 표시합니다.
  - 표시 타입은 아래로 고정합니다.
    - `CHARGE_PAID`, `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`
    - `SPEND_PAID`, `SPEND_FREE_REQUEST`, `SPEND_FREE_SHIPPING`
    - `ADJUST`
  - `REFUND` 레거시 조회/표시 경로는 제거했습니다.
  - 유료/무료 수익은 모두 표시하되, 지급(PAYOUT) 대상은 유료만 구분 표기해야 합니다.
  - `DashboardLayout`→의뢰자 대시보드 Outlet context 크레딧 키는 `freeRequestCredit`, `freeShippingCredit`을 SSOT로 사용합니다.
  - 관리자 크레딧 탭의 사업자 정렬 키는 `freeBalance`를 사용합니다.
  - 관리자 크레딧 집계 카드는 `totalChargedFreeAmount`, `totalSpentFreeAmount` 또는
    `totalFreeRequest+totalFreeShipping`, `totalSpentFreeRequestAmount+totalSpentFreeShippingAmount`를 SSOT로 사용합니다.

- 부가세(VAT) / 면세 UI 정책(강제, 루트 `rules.md` §2.3):
  - 운영 주체는 면세 사업자. 가격·충전·약관·정산 안내에서 "VAT 별도 / 부가세 포함 / VAT 10%" 문구 금지.
  - 크레딧 충전 UI: 결제·입금 금액 = 공급가. `vatAmount` 표시·가산 금지.
    구현: `src/features/settings/tabs/CreditPaymentTab.tsx`
    충전 단위 SSOT: 기공소(`lab`) 50만원, 치과(`practice`) 100만원.
    첫 충전 기본 1단위. 2회차부터 기본 추천 = 월사용량(90일/3)의 1/3을 단위로 반올림(0이면 최소 1단위).
    백엔드: `utils/creditChargeUnit.js`, `creditBPlan.controller.js`, `credit.controller.js` insights.
  - 공개 안내/약관: `ServicePage`, `TermsPage` — 면세·부가세 없음, 환불은 잔여 유료 크레딧(공급가)만.
  - 가격 정책/대시보드: `PricingPolicyDialog`, 의뢰자 단가 카드 — "배송비 별도"만 유지.
  - 제조사 정산규칙 안내: 분배율만 안내하고 "+ VAT 10%" 표기 금지.
  - 관리자 세금계산서 직접발행: 공급가 입력 시 세액 자동 10% 금지(기본 세액 0).

- 단일 SSOT 장부 UI 필드 계약(초안):
  - Journal: `journalId`, `eventType`, `businessAnchorId`, `refType`, `refId`, `stageFrom`, `stageTo`, `occurredAt`
  - Line: `lineNo`, `accountCode`, `ownerRole`, `ownerId`, `amount`, `amountExcludingVat`, `vatAmount`, `amountIncludingVat`, `creditKind`
    - 면세 정책상 신규 적재는 `vatAmount = 0`, `amount = amountExcludingVat = amountIncludingVat`
  - 수익 계정코드: `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - 워크시트/정산 저장 이벤트: `REQUEST_SPEND_COMMIT`, `SHIPPING_SPEND_COMMIT`, `SETTLEMENT_PAYOUT`
  - 발생 타이밍: `REQUEST_SPEND_COMMIT`=가공 진입 승인(준비→가공), `SHIPPING_SPEND_COMMIT`=세척.패킹 승인(포장.발송 진입)
  - 롤백은 별도 저널 이벤트를 만들지 않고 대응 COMMIT 이벤트 삭제로 처리하며,
    UI에서는 "환불"이 아니라 "소비 내역 삭제"로 표기합니다.
  - BG 콜백은 승인/롤백 트랜지션이 아니므로 크레딧 차감/삭제 트리거로 사용하지 않습니다.

- 포장.발송 우편함 상세 모달 캐시 일관성:
  - `RequestPage`에서 우편함 상세 모달 오픈 시, 요약(`mailboxSummaries.requestCount`)과 캐시 건수가 다르면 캐시를 사용하지 않고 `/api/requests/shipping/mailbox-requests`를 재조회합니다.
  - stale-while-revalidate: 건수 일치 캐시가 있으면 즉시 모달에 표시하고 백그라운드로 재동기화합니다.
  - 점유 우편함 hover 시 `onBoxPrefetch`로 상세를 미리 받아 클릭 체감을 줄입니다.
  - 조회는 요약 `requestIds`를 쿼리로 넘겨 단축 경로를 사용합니다.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxShelfGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx`
    - `web/backend/controllers/requests/shipping.controller.js`

- 세척.패킹/포장.발송 stage 이미지 삭제 후 프리뷰 상태 동기화:
  - 프리뷰 모달의 stage 이미지 삭제 버튼은 `preserveStage` 모드로 호출해 **현재 공정을 유지**하고, 파일/파일명만 즉시 리셋합니다.
  - stage 파일 삭제 성공 시 `previewStageUrl`/`previewStageName`을 즉시 비워, 모달에 깨진 이미지/이전 파일명이 잔존하지 않도록 합니다.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`

- 의뢰자 BusinessAnchor의 기본 헥스 회전값(`requestSettings.defaultManufacturerHexRotation`, 레거시 `hexRotationAngle` 포함)이
  null(미확정)인 의뢰는 `PreviewModal` 승인 시 STL모델대로/헥스30도회전 동시 가공 여부를 확인하고,
  승인 요청 바디(`processBothHexVariants`)로 백엔드 복사 생성 분기를 전달합니다.
  - 관련 파일: `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`, `src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts`

- `PreviewModal` 상단 아노다이징 체크박스 표시/override 정책:
  - 의뢰건 SSOT는 `caseInfos.anodizingEnabled`. 신규의뢰에서 카드 단위로 저장·생성 시 스냅샷.
  - 표시 우선순위는 `caseInfos.anodizingEnabled` → (레거시 미설정만) `business.requestSettings.anodizingEnabled` → 기본 ON.
  - 제조사 override 저장은 준비/가공 단계에서만 허용합니다.
  - 저장 API: `PATCH /api/requests/:id/anodizing-override`
  - 관련 파일: `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`, `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`, `src/pages/requestor/new_request/NewRequestPage.tsx`

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
  - 샘플(`rnd_sample`, `copied_sample`)은 크레딧/정산 장부에 **무기록(무자료/무상)** 처리합니다.
  - `requestId`/의뢰 메타가 없는 제조사 직접 NC 수동 작업(장비 큐 전용)은 UI에서도 과금/정산과 분리된 무상 작업으로 취급합니다.
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

- 제조사 정산(일별) 표시 정책:
  - 제조사 결제 페이지의 일별 정산 표는 `의뢰/배송/환불·지급·조정(단일 셀)/유료 순액/무료 순액(의뢰·배송·합계)` 컬럼으로 표시합니다.
  - 의뢰/배송 **건수**는 백엔드가 반환하는 의뢰·패키지 유니크 건수를 그대로 표시한다.
    (`machining_spend`와 `express_surcharge`를 프론트에서 각각 세지 않는다.)
  - 일별 목록은 KST **오늘 이후(미도래 일자)를 표시하지 않는다**. `이번달` 프리셋 종료일도 오늘이다.
  - `환불·지급·조정` 셀은 `환불 ₩x / 지급 ₩y / 조정 ₩z` 형식으로 항목 라벨과 금액을 함께 표기합니다.
  - `무료(의뢰+배송)` 필터에서는 `환불·지급·조정/유료 순액`을 `-`로 표시하고 무료 분해값/무료 순액만 노출합니다.
  - `유료(의뢰+배송)` 필터에서는 무료 순액을 `-`로 표시합니다.
  - 정산 유료 순액은 지급 대상 기준과 일치해야 하며, 무료 기원 조정은 지급 잔액 계산에 포함하지 않습니다.
  - 상단 합계 카드는 `DashboardShell.statsGridClassName`을 명시해 카드가 과도하게 좁아지지 않도록 유지합니다.

- 제조사 워크시트 크레딧 승인/롤백 정책:
  - 가공 진입 승인으로 `가공` 단계 이동 시 의뢰 크레딧 소비가 발생합니다.
  - `가공`에서 준비로 롤백 시 소비된 의뢰 크레딧은 "환불" 행 추가가 아니라, 기존 소비 행 삭제로 복구됩니다.
  - 세척.패킹 승인으로 `포장.발송` 진입 시 배송 크레딧 소비가 발생합니다.
  - `포장.발송`에서 세척.패킹 롤백 시 소비된 배송 크레딧은 "환불" 행 추가가 아니라, 기존 소비 행 삭제로 복구됩니다.
  - 불완전가공(RnD unmachinable) 판정은 샘플 처리나 크레딧 롤백 사유가 아닙니다.
    - 불완전가공으로 CAM 복귀가 되더라도, 이미 CAM 승인 시점에 발생한 의뢰 크레딧 차감은 유지됩니다.
    - 즉, UI 문구/배지는 불완전가공 상태 변경과 크레딧 삭제를 연결해 안내하면 안 됩니다.
  - 준비 단계 취소만 차감 미발생 상태로 간주합니다.
  - 제조사 워크시트 UI는 위 정책을 기준으로 라벨/안내 문구를 구성합니다.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/WorksheetPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/cam/CamPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/packing/PackingPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/shipping/ShippingPage.tsx`
    - `web/backend/controllers/requests/common.review.controller.js`
    - `web/backend/controllers/requests/common.review.helpers.js`

- 불완전가공 의뢰자 `계속 진행` 이력 표시 정책:
  - 제조사 워크시트 카드/프리뷰는 `rnd.requestorContinueAt/by/message`를 표시해
    의뢰자가 문제 가능성을 인지하고 진행 요청했는지 즉시 확인할 수 있어야 합니다.
  - 화면 표시는 배지 + 요약 문구(요청 시각 포함)로 통일합니다.
  - 관련 파일:
    - `src/types/request.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx`

- 의뢰자 역할·서비스·유료게이트 SSOT (2026-08, 루트 §2.4 상세)
  - 가입 role: `requestor` | `salesman`만. `practice` role **제거**.
  - 공개 가입(`/signup`): `requestor` | `salesman`. 복원 draft에 `practice`가 있으면 requestor로 전환.
  - 온보딩(`/dashboard/wizard`): 프로필 → 휴대전화 → 역할 → 사업자.
  - 사업자 단계(`BusinessTab` + `RequestorCapabilitiesPicker`):
    - 역할 라디오: `REQUESTOR_KIND_LABEL` — practice=`치과 (기공실 포함)`, lab=`기공소`
    - 온보딩: `forceFreeServices` — 서비스 UI 숨김, `{free:true,paid:false}` 고정. 유료는 이후 사업자등록증 검증으로 개방
    - 설정: 서비스 체크 표시. `paid` 선택 시 미검증이면 저장 차단
    - free-only + practice로 등록증 건너뛰면 `practiceProfilePhase` → `PracticeBusinessProfileStep`
  - 온보딩 완료 랜딩: 유료 미가용(`!paid` 또는 미검증) → `/dashboard/practice-transfers`, 그 외 → `/dashboard`
  - 유료 게이트: `canUsePaidServices({ businessVerified, services })` = `paid && verified`
    - `BusinessPaidAccessGate`, 사이드바 `isPaidRequestorPath`, 설정 `PAID_REQUESTOR_SETTINGS_TABS`
    - 변경 후 `notifyRequestorAccessUpdated`
  - 기공의뢰서: 발신=`kind===practice && free`, 수신=`kind===lab && free` (`PracticeTransferRoleTabs`)
  - 접근 훅: `useRequestorBusinessAccess` (kind/services + verified)
  - 계정 전환: `AccountSwitcher`

- practice 전송 상태 표준(치과/의뢰자 공통): `발송완료 | 취소 | 수신완료 | 의뢰수락 | 자동매칭 | 작업완료`
  - 치과 전송 내역(`GET /api/practice/transfers/my`)은 동일 치과 businessAnchor 구성원 전송을 공유한다.
  - practice 페이지 상태 정규화 기준: `src/pages/practice/PracticeFileTransferPage.tsx`의 `toStatusLabel`
  - 의뢰자 치과 페이지 상태 배지 기준: `src/pages/requestor/practice/RequestorPracticePage.tsx` (`isRead/requestorReadAt`, `isAccepted`/`requestorDownloadedAt`=의뢰수락)
  - 기공소 의뢰수락: 상세 다이얼로그 「의뢰수락」→ `POST .../mark-accepted`(과금). 파일 다운로드는 뱃지/과금과 무관.
  - **자동매칭**: 치과에서 「자동 매칭」선택 → `matchingMode=auto`. 검증·devops ON 기공소만 공개 풀 수신. 선착순 수락(3시간)·「작업 완료」(`mark-complete`). 만료 시 재공개. devops UI: `PracticeTransferAutoMatchTab` (파트너 **기공의뢰 자동매칭** 탭)

- 드롭존 가입(치과 전용, requestor+practice+free)
  - 공개 드롭존(`PracticeDropzonePage`)은 기공의뢰서 **발신(치과)** 전용. kind/lab·paid 선택 UI 없음.
  - Step 2 임베디드 로그인/가입/비밀번호 변경. 라벨은 「의뢰인 계정」.
  - 최소 가입: `POST /api/auth/practice/register` → `role=requestor` + `requestorKind=practice` + `requestorServices={free:true,paid:false}`.
    필수: `email`, `password`, `phone`, `clinicName`, `staffName`.
    `practiceProfile.clinicName/staffName/phone`과 계정 `name(=staffName)`을 저장. 주소/Org 앵커는 온보딩에서 완성.
  - 가입 전 이메일·담당자 휴대폰 인증 필수(공통 signup verification API). 로컬 캐시: `practice_dropzone_signup_verification_v1`.
  - 가입 직후 같은 페이지에서 **첫 PracticeTransfer** 전송. 성공 시 대시보드로 이동하지 않고 드롭존 성공 UI 유지.
  - 게이트: 전송 이력 ≥ 1건이고 `onboardingWizardCompleted` 미완료면 추가 의뢰 시 `/dashboard/wizard?mode=account`로 유도(로그인 세션과 무관, 첫 전송 성공이 기준).
  - 로그인: `POST /api/auth/login` — `requestor` + practice 발신 가능 계정만 허용.
  - 비밀번호 변경: `POST /api/auth/practice/password/change`(`email`+`phone`+`newPassword`, requestor).
  - 드롭존 의뢰 폼은 대시보드와 동일 localStorage(`practice_transfer_form_local_v1`). 첨부 캐시(`practice_dropzone_file_cache_meta_v1` + IndexedDB) 공유.
  - 비회원 문의(`GuestChatModal`): 드롭존 라이트 테마 유지.
  - 레거시 `practice` role·`/practice/dashboard`·치과명 로그인 UI는 제거 대상(마이그레이션 후 삭제).

- practice 파일전송 임시저장(다른 PC 이어쓰기) 정책:
  - 임시저장 SSOT API: `GET/POST/DELETE /api/practice/transfers/draft`
  - 프론트는 로컬스토리지 단독 보관이 아니라 서버 draft를 우선 사용합니다.
  - 서버 draft 로드 시 파일뿐 아니라 기공소/메모/치아보철 메타도 폼에 복원합니다.
  - 동일 치과 businessAnchor 구성원의 최신 draft를 공유해 동료/다른 PC에서 이어쓸 수 있습니다.
  - 임시저장 파일은 `File`(temp upload) 참조를 기준으로 유지하며, 전송 성공 시 draft를 삭제합니다.
  - 관련 파일:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/shared/hooks/useS3TempUpload.ts`
    - `src/shared/hooks/useFilePreUpload.ts`
    - `src/shared/hooks/compressMeshFile.ts`

- S3 temp 업로드 가속(SSOT) — 기공의뢰·어벗생산의뢰 공통:
  - 동시 업로드 풀: 최대 8 (`useS3TempUpload`).
  - 첨부 직후 백그라운드 사전 업로드(`useFilePreUpload`). 로그인 세션이 있을 때:
    - 기공의뢰: Dropzone·FileTransfer
    - 생산의뢰: `useNewRequestPage` → 제출 시 `ensureFilesUploaded` 재사용 (`useNewRequestSubmitV2`)
  - 8MB 이상: S3 multipart (`POST /api/files/temp/multipart/{init,complete,abort}`) + 파트/단건 PUT 재시도.
  - STL/PLY/OBJ: 클라이언트 gzip(유의미할 때만). S3 `ContentEncoding=gzip`, 원본 파일명 유지.
  - 다운로드 프록시는 gzip 객체를 풀어 원본 바이트로 응답 (`getObjectStreamFromS3` / `getObjectBufferFromS3`).
  - 하위 호환: `usePracticeFilePreUpload`는 `useFilePreUpload` re-export.

- practice 최근 전송 기공소(기공소 선택 드롭다운) SSOT:
  - 서버: `GET /api/practice/transfers/my` 응답의 `caseInfos.practiceRouting.targetLabAnchorId/targetLabName`(최신순)이 권위 소스.
  - 로컬 캐시: `localStorage.practice_recent_labs_v2` (최대 8개). 전송 성공 시 `rememberLab`, 목록 로드 시 `syncRecentLabsFromTransfers`로 merge.
  - 「새로 작성」은 의뢰 폼/임시저장 캐시만 비우고, 최근 기공소 목록은 드롭다운 후보로만 유지한다. 기공소 선택은 비워 다시 고르게 한다. 보철물 차트는 M(전치부) 위치로 되돌린다.
  - 「임시 저장」은 작성 중인 의뢰서를 목록에 스냅샷 저장한 뒤 폼을 해당 draft에서 분리한다. 이후 입력이 바뀌면 `draftId` 없이 새 임시저장이 생성된다.
  - 기공소 전송 성공·draft 삭제 후에는 작성자/동료/다른 탭 모두 폼을 비운다. 페이지 remount 시에도 최근 기공소를 자동 선택하지 않는다(드롭다운 후보만 유지).
  - 구현: `src/pages/practice/hooks/usePracticeTransferStep1.ts`, `PracticeFileTransferPage.tsx`

- practice 전송 취소 API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/cancel-batch`
  - request body: `transferIds?: string[]`, `transferMongoIds?: string[]` (둘 중 하나 이상 필수)
  - response: `data.successCount`, `data.failedIds`
  - UI는 `failedIds`가 존재할 수 있음을 전제로 부분 성공 토스트/재동기화를 처리해야 합니다.

- practice 전송 복구(되살리기) API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/restore-batch`
  - request body: `transferIds?: string[]`, `transferMongoIds?: string[]` (둘 중 하나 이상 필수)
  - response: `data.successCount`, `data.failedIds`
  - 치과 휴지통 복구와 관리자 취소건 되살리기에서 동일 API를 사용합니다.

- practice 휴지통 비우기 API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/trash/empty`
  - 동일 치과 범위의 임시저장 휴지통(`deletedAt != null`)과 취소 전송(`status: "canceled"`)을 영구 삭제합니다.
  - response: `data.draftDeletedCount`, `data.transferDeletedCount`
  - UI는 확인 다이얼로그 후 호출하고, `trash-emptied` 실시간 이벤트로 동료 화면을 동기화합니다.

- practice 채팅 라우팅 SSOT:
  - practice 화면과 requestor 수신 화면은 모두 `transferId` 기반 채팅(`/api/chats/practice/transfer-room/:transferId`)만 사용합니다.
  - legacy request 기반 practice 채팅 경로(`/api/chats/practice/request-room/:requestId`)는 사용 금지합니다.
  - 동일 치과 practice 구성원은 동료가 보낸 전송 채팅에도 참여할 수 있습니다(백엔드 participants 자동 추가).
  - draft 공동 작성 동기화: `draft-upserted` 이벤트 스냅샷을 즉시 반영(`delayMs=0`, `deferWhenEditing=false`). 동일 계정 다중 탭도 fingerprint/서버 updatedAt LWW로 맞춤(editor echo skip 금지).
  - 한글 IME: 환자명/메모는 `ImeSafeInput`으로 조합 중 로컬 draft 유지. 조합 중 autosave·원격 폼 반영은 미루고, 조합 종료 후 처리.
  - 기공소 전송 성공 후 작성자·동료 모두 의뢰 접수 폼 localStorage(`practice_transfer_form_local_v1`, `practice_dropzone_draft_v2`)와 화면 입력을 초기화한다.
    - 작성자: 전송 API 성공 시 `resetIntakeFormAfterTransfer`
    - 동료/다른 탭: `transfer-created`(clearedDraftId) · `draft-cleared`(활성 케이스) 수신 시 동일 초기화
    - 재진입 보호: local form에 `activeDraftId`를 저장하고, 서버 draft 목록에 없으면 복원값을 버린다.
    - 공유 유틸: `src/shared/practice/practiceTransferFormLocal.ts`

### 웹소켓 업데이트 표준 (무플리커 + 부하완화)

- 웹소켓 실시간 업데이트(app-event) 구현 메모:
  - 발행 SSOT: 백엔드는 대상 role 전체 fan-out emit을 사용합니다.
  - 반영 SSOT: 프론트는 "현재 열려 있는 페이지"에서만 이벤트를 반영합니다.
    - 방법: 라우트/탭 페이지 컴포넌트 마운트 상태에서만 `useAppEventListener`/`useAppEventDebouncedReload`를 등록
    - 이벤트 payload 조건(예: `businessAnchorId`, `requestId`)이 맞는 경우에만 재조회/상태갱신
    - 비활성 페이지는 즉시 갱신하지 않고, 페이지 재진입 시 서버 재조회로 동기화
  - UX 안정성(강제): 이벤트 반영 때문에 사용자의 진행 중 작업을 방해하지 않습니다.
    - 입력 중 폼/타이핑/선택 상태를 깨는 전체 리렌더/강제 새로고침 금지
    - 모달/다이얼로그는 이벤트 수신 때문에 닫았다 다시 열지 않음
    - 가능하면 payload 기반 부분 patch를 우선하고, 필요 시 최소 범위 재조회
    - 디바운스 재조회 시 기본값 `deferWhenEditing=true`를 유지해 입력 포커스 중 반영을 지연
    - 채팅/알림 배지처럼 즉시성 우선 기능만 `deferWhenEditing=false`를 명시적으로 허용
  - 소켓 공용 레이어: `src/shared/realtime/socket.ts`
    - `onNotification`, `onNewMessage`, CNC 이벤트 리스너 포함 모든 소켓 이벤트 구독은 공통 구독 레이어(`subscribeSocketEvent`)를 통해 지연 초기화/재연결 시에도 유실 없이 동작해야 합니다.
    - 인증 토큰이 변경되면 기존 소켓을 재사용하지 않고 연결을 재초기화해 권한/구독 컨텍스트를 최신화합니다.
  - 소켓 부트스트랩 훅: `src/shared/hooks/useSocket.ts`
    - 토큰 존재 시 매 렌더 주기에서 안전하게 `initializeSocket`을 호출하고, 토큰이 비면 즉시 `disconnectSocket`으로 정리합니다.
  - app-event 수신 공통 훅: `src/shared/realtime/useAppEventListener.ts`
    - 기본값으로 `requireVisible=true`(활성 탭에서만 반영), `deferWhenEditing=true`(입력 포커스 중 이벤트 반영 지연)을 적용합니다.
    - 페이지/도메인 훅에서 `onAppEvent` 직접 구독은 신규 코드에서 금지하고, 공통 훅으로 통일합니다.
  - 이벤트 payload 파싱/매칭 공통화(강제):
    - 이벤트별 payload 매칭 로직을 페이지마다 중복 작성하지 않고 `src/shared/realtime/*Event.ts` 공통 헬퍼를 사용합니다.
    - 기존 크레딧 이벤트 헬퍼: `src/shared/realtime/creditBalanceEvent.ts`
      - `DashboardLayout`, `CreditLedgerModal`, `useAdminCreditPage`에서 공통 헬퍼로 필터링합니다.
    - 레거시 window 커스텀 이벤트(`abuts:credits:updated`) 기반 동기화는 신규 코드에서 사용하지 않습니다.
  - app-event 디바운스 재조회 공통 훅: `src/shared/realtime/useAppEventDebouncedReload.ts`
    - 내부적으로 `useAppEventListener`를 사용하며, 입력 중에는 재조회 콜백 실행을 지연합니다.
  - 웹소켓 반영 UX 원칙(모든 페이지 공통, 강제):
    - 이벤트 수신으로 전체 화면 스켈레톤 전환/목록 초기화(reset)/모달 닫힘이 발생하면 안 됩니다.
    - `onMatch`에서는 가능한 한 `setState` 부분 patch 또는 무로딩(silent) 재조회를 사용합니다.
    - 강한 일관성이 필요한 경우에도 전체 재조회는 `withLoading=false` 또는 섹션 단위 최소 로더로 제한합니다.
    - payload에 식별자(`requestId`, `businessAnchorId`, `transferId` 등)가 있으면 해당 엔티티만 갱신합니다.
    - 위 원칙은 크레딧/정산/의뢰/배송/practice/채팅 등 모든 app-event에 동일하게 적용합니다.
    - 추가 강제: 이벤트성 재조회 때문에 페이지의 `isInitialLoading`이 다시 true가 되지 않게 설계합니다.
      - 초기 진입 1회 로딩만 전역/페이지 스켈레톤을 허용하고, 이후 이벤트 재조회는 기존 데이터 유지 + silent refresh를 사용합니다.
      - 특히 Layout 레벨의 보조 데이터(예: 크레딧 잔액) 재조회 플래그를 페이지 전체 스켈레톤 조건에 직접 연결하지 않습니다.
      - 권장 패턴: `loading` 플래그는 `값이 비어있는 첫 fetch`에서만 true, 이후는 background refresh로 처리합니다.
  - 대시보드 리팩터링 표준 패턴(강제) — `HEAVY/LIGHT SUMMARY SPLIT`:
    - 쿼리 분리: `cards summary(경량)`와 `heavy summary(목록/상세)`를 분리합니다.
    - 이벤트 처리 순서(고정): `payload 즉시 patch` → `coalesced 검증 refetch 1회`
    - 이벤트-섹션 매핑 규칙: 이벤트 타입별로 영향 queryKey만 갱신하고 broad refetch를 기본값으로 쓰지 않습니다.
    - 이벤트 즉시 반영: `queryClient.setQueryData`로 카드/리스트를 먼저 patch하고, refetch는 검증 목적의 백그라운드 1회만 실행합니다.
    - 재조회 병합: in-flight refetch가 있으면 다음 plan을 큐에 합쳐(coalescing) 중복 요청을 막습니다.
    - 플랜 기반 갱신: 이벤트 타입별로 `cardsSummary/heavySummary/bulk/unmachinableOverview/shippingSummary/pricing/referral`를 명시적으로 선택합니다.
    - 기본 구현 위치: 페이지 컴포넌트의 이벤트 핸들러 근처에 `DashboardRefreshPlan` 타입과 merge/executor를 함께 둡니다.
    - 쿼리 옵션: `placeholderData: previous`를 유지해 refetch 중에도 스켈레톤 전환(플리커)을 방지합니다.

  - 이번 세션 구현 기준(운영 메모):
    - 의뢰자 크레딧은 사이드바 `/dashboard/credits`(내역/충전). `CreditLedgerModal` embedded·Dialog 모두 `credit:balance-updated` 시 목록/스냅샷만 재조회
    - 관리자 `AdminPaymentsPage`는 `request:stage-changed`/`credit:balance-updated`/배송 업데이트를 디바운스 수신해 무플리커 동기화
    - 관리자 `useAdminCreditPage`는 `credit:balance-updated` 수신 시 전체 목록 reset 대신 payload 대상 사업자 1건만 부분 갱신합니다.
      - 조회 경로: `GET /api/admin/credits/businesses?businessAnchorId=:id&limit=1&skip=0`
  - 채팅방 목록 실시간 동기화: `src/shared/hooks/useChatRooms.ts`
  - 채팅 메시지 실시간 동기화: `src/shared/hooks/useChatMessages.ts`
  - 채팅 role 라벨/뱃지 표시에서는 레거시 `practice` role을 `의뢰자`로 매핑합니다(치과는 requestorCapabilities.practice).
  - 페이지 반영 지점:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/pages/requestor/practice/RequestorPracticePage.tsx`
    - `src/pages/admin/credits/hooks/useAdminCreditPage.ts`
    - `src/pages/admin/AdminPaymentsPage.tsx`
    - `src/shared/components/CreditLedgerModal.tsx`
    - `src/features/chat/components/*`
  - 제조사 워크시트 리팩터링 메모(웹소켓 업데이트 표준 적용):
    - `TrackingPage`: 이벤트 수신 시 `runTrackingFetch({ silent: true, append: false })`로 무플리커 재동기화합니다.
    - `WorksheetCncMachineSection`: `request:stage-changed`/배송/카운트 이벤트를 디바운스 수신해 큐 요약만 최소 재조회합니다.
    - `PreviewModal`: 현재 열려 있는 의뢰(`requestId`/`requestMongoId`)와 payload를 매칭한 경우에만 force refresh를 수행합니다.
    - `useAppEventDebouncedReload`: `enabled=false`(예: 모달 닫힘) 전환 시 예약된 debounce 타이머를 즉시 취소해야 하며, 닫힌 모달을 이벤트 지연 콜백으로 재오픈하면 안 됩니다.
    - `PackingPage`/`ShippingPage` 래퍼에서는 중복 처리하지 않고 `RequestPage -> useWorksheetRealtimeStatus` 공통 경로를 SSOT로 사용합니다.
    - 공통 원칙: 이벤트 재동기화로 `isInitialLoading`을 다시 true로 올리지 않고, 기존 데이터 유지 + silent refresh를 기본값으로 유지합니다.
    - CAM/가공 카드 액션(승인/롤백) 즉시반영 표준:
      - 카드 클릭 직후 현재 리스트와 `worksheet-assigned-summary` 카운터를 먼저 optimistic patch합니다.
      - 성공 시 즉시 전체 refetch를 난사하지 않고, `coalesced verify refetch`를 1회 지연 실행합니다.
      - 실패 시 optimistic patch(리스트/카운터)를 즉시 되돌립니다.
      - 이 최적화는 프론트 상태/쿼리 계층에서만 처리하며, BG(Rhino/Esprit/Bridge) API 계약/호출 파이프라인은 변경하지 않습니다.

- 문의(admin/support) 실시간 반영 메모:
  - 관리자 문의 페이지는 `support:inquiry-created`, `support:inquiry-updated`, `comm:badge-update(key=inquiry)` app-event를 수신해 목록을 디바운스 재조회합니다.
  - 이벤트 재조회는 `silent` 모드(기존 리스트 유지, 전체 로딩 스피너 재진입 금지)로 처리합니다.
  - 구현 파일: `src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx`

- practice 실시간 목록 동기화(무플리커):
  - `PracticeFileTransferPage`, `RequestorPracticePage`는 `practice:transfer-created|updated` 수신 시
    전체 로딩 상태를 다시 켜지 않고(silent) 기존 목록 유지 + 백그라운드 갱신으로 동기화합니다.
  - `PracticeFileTransferPage`는 `action: draft-upserted|draft-cleared` 수신 시 임시저장(GET /draft)을 silent 재조회하고,
    그 외 transfer 이벤트는 최근 전송 목록을 silent 재조회한다.
  - 이벤트 payload로 즉시 patch 가능한(read/download/cancel) 경우는 먼저 부분 patch하고,
    필요 시 coalesced/silent 재조회로 최종 정합성만 검증합니다.

- practice 채팅/전송 파일 다운로드 정책:
  - S3 원본 URL 직접 오픈 대신 동일 오리진 프록시(`GET /api/files/s3/download`)를 사용합니다.
  - 프론트 fetch는 `cache: "no-store"` + `_ts` 쿼리로 재검증(304) 지연을 줄입니다.
  - 다중(전체) 다운로드는 순차 루프 대신 `Promise.all(...)` 병렬 처리로 체감 속도를 우선합니다.
  - 적용 파일:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/pages/requestor/practice/RequestorPracticePage.tsx`
- 제조사 정산(`src/pages/manufacturer/payments/PaymentsPage.tsx`) 표시 정책:
  - 백엔드 `GET /api/manufacturer/credits/daily-summary`는 `LedgerLine` 집계 결과를 반환하며, 프론트는 해당 응답을 SSOT로 사용합니다.
  - 건수 필드(`earnRequest*Count`, `earnShipping*Count`)는 의뢰/패키지 `refId` 유니크이며, 라인·저널 수가 아니다.
  - paid/free 분해값 표시는 fallback 없이 `earnRequestPaid*`, `earnRequestFree*`, `earnShippingPaid*`, `earnShippingFree*`를 SSOT로 사용합니다.
  - 분해 필드 누락/합계 불일치 시 행을 화면에서 제외하고 오류 토스트/배너로 예외를 노출합니다.
  - 운영자 확인은 관리자 대시보드의 `systemAlerts` 경고를 통해 추적합니다.

- API 호출은 `src/shared/api/apiClient.ts`의 `apiFetch`를 우선 사용합니다.
- 서버 상태는 TanStack Query, 전역 UI 상태는 `src/store`를 사용합니다.
- 파일 드롭은 개별 구현보다 `@/features/requests/components/PageFileDropZone` 재사용을 우선합니다.
- UI에서 `requestId`는 서버 문자열을 그대로 표시합니다.

## 3. 정리 원칙

- 루트와 중복되는 정책은 여기 다시 쓰지 않습니다.
- 특정 화면 UX나 과거 리팩터링 기록은 가능한 한 코드 근처로 옮기고, 이 문서에는 남기지 않습니다.
- 새 규칙이 여러 역할/여러 페이지에 걸치면 루트 `rules.md`를 먼저 수정합니다.
