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
- Requestor workspace header: 기간 필터는 치과 `어벗디자인으로`·기공소 `어벗생산의뢰`(`/dashboard/new-request`) 상단. 헤더 버튼: `[정책 안내]` · `[진행중 x건]` · `[출고예정 x건]` · `[완료 내역 x건]` · `[불완전 가공 x건]` (x=기간 건수). 치과·기공소·어벗츠기공소는 대시보드 메뉴를 두지 않음(치과 `/dashboard` → 구강스캔, 기공소 → 기공의뢰수신, 제출 후 어벗생산/어벗디자인). 보유 크레딧·충전은 사이드바 `크레딧`(`/dashboard/credits`) — 내역/충전 탭, 충전 CTA=`?tab=charge`. 설정 결제 탭은 제거(구 `?tab=payment` → 크레딧 충전 리다이렉트). 설정 의뢰 탭도 제거 — 디자인소프트웨어·아노다이징은 어벗의뢰(`/dashboard/new-request`) 좌측 상단 버튼. 치과 설정 「구독」탭·헤더 `[구독]`은 제거(구 `?tab=subscription` → 계정). 아노다이징: 의뢰자 계정 기본값(`User.requestSettings.anodizingEnabled` / API `requestorAnodizingEnabled`) → **신규 업로드에만** `caseInfos.anodizingEnabled` 주입(이미 첨부된 카드·디자인소프트웨어와 동일하게 미변경). 사업체 `requestSettings.anodizingEnabled`는 레거시/미설정 폴백(기본 ON).
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
  - 마우스 호버 툴팁은 **0.6초 지연** 후 표시 (`delayDuration={600}`).
  - 가로폭은 **내용에 맞춤** (`w-max`), 좌우 여백 대칭 (`px-3`). 기본 상한
    `max-w-[min(100vw-2rem,20rem)]` — 표·긴 안내는 호출부에서만 `max-w` 완화.
  - SSOT: `src/components/ui/tooltip.tsx` (`TooltipProvider` 기본값 600),
    루트 `src/App.tsx`, `.cursor/rules/tooltip-delay.mdc`.
  - 중첩 `TooltipProvider`/`Tooltip`에 `delayDuration={0}`/`{200}` 등 다른 지연을 두지 말 것.
- Requestor dashboard: 상단 카드 '의뢰/취소' -> '준비'로 변경. 취소 항목은 카드에서 제거(내부 DB는 유지). 상세 정책/모달의 '의뢰' 문구는 '준비'로 변경함.
- 의뢰 취소 정책 SSOT: **준비 단계에서만** 취소 가능(불완전가공 판정 예외 유지). 레거시 '의뢰/CAM 단계 취소' 문구·판정 금지.
  - UI: `RequestorRecentRequestsCard` 취소 버튼/툴팁, `RequestorDashboardPage` 실패 토스트, `PricingPolicyDialog` 6절,
    `RequestorAbutmentPageHeader`+`PastRequestsModal`(건별·체크박스 일괄 취소, 취소 후 목록 모달 유지)
  - API: `PATCH /api/requests/:id/status` 취소 검증, `PATCH /api/requests/status/batch` 일괄 취소, 중복 replace(`from-draft`/`creation.request`)의 `isCancelableStage`. 취소 응답은 저장 직후 슬림 페이로드(웹소켓·정규화는 백그라운드).

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
  - `src/shared/components/RoleSelect.tsx` (역할 Select. 사업영역 주체 등)
- 실시간(웹소켓) 공통
  - `src/shared/realtime/socket.ts`
  - `src/shared/realtime/useAppEventListener.ts`
  - `src/shared/realtime/useAppEventDebouncedReload.ts`
  - `src/shared/realtime/creditBalanceEvent.ts`
  - `websocket-realtime-update-checklist.md` (웹소켓 실시간 업데이트 자동 점검 체크리스트)
- 의뢰자 가입·유형·게이트
  - `src/features/auth/SignupPage.tsx` (공개 가입: requestor|salesman. `/signup/staff`: manufacturer|devops|admin|labTeam|salesTeam)
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
  - `src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx` (치과 헤더 `[정책 안내]`만)
  - `src/pages/requestor/dashboard/components/RequestorDashboardStatsCards.tsx` (치과 행 라벨=구강스캔/어벗디자인)
  - `src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx` (완료 내역 버튼)
  - `src/pages/requestor/credits/RequestorCreditsPage.tsx` (사이드바 크레딧: 내역/충전)
  - `src/shared/legal/creditPrepaidCopy.ts` (기공료 선입금 UI/FAQ 카피)
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
  - `src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts`
  - `src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
  - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetStageSearchInput.tsx`
- practice
  - `src/pages/practice/PracticeDropzonePage.tsx`
  - `src/pages/practice/PracticeFileTransferPage.tsx`
  - `src/pages/practice/hooks/usePracticeTransferStep1.ts` (최근 기공소 local+서버 merge)
  - `src/shared/components/practice/PracticeTransferFilePane.tsx`
  - `src/shared/components/practice/PracticeTransferFileDropTarget.tsx`
  - `src/shared/practice/practiceTransferAccept.ts`
  - `src/shared/files/extractDroppedFiles.ts`
  - `src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx`
    - 보철물 치식: 치아만 마키 → 각각 크라운. 드래그 경로가 `+`를 지나거나 `+` 클릭 → 브리지. 형태 글자 클릭 → 인레이→크라운→커스텀어벗→임시치아 / 브리지↔Pontic↔작업X↔유지장치↔임시치아. 유지장치는 브리지 계열(2치 이상 연결 필수). 임시치아는 1치부터 n치(단독·연결). 연결 스팬에서 유지장치·임시치아는 한쪽 변경 시 연결된 치아 전체가 같은 형태. 유지장치·임시치아처럼 연결 전체가 강제 변경된 뒤 브리지 등으로 돌아오면, 클릭하지 않은 치아는 진입 직전 내용(형태·어벗·임플란트)을 복원. 작업X는 칸에 X 표시, 기공비·크레딧 미소비. 크라운·브리지 아래 `어벗` 체크박스(체크 시 설정 모달, 해제 시 규격 삭제). full 16치 한 줄은 카드 `min-w-[3.5rem]`·브리지 + 슬롯(미연결 `w-2`, 연결 `w-1.5`)으로 어벗 라벨이 잘리지 않게. 커스텀어벗 칸·어벗 체크 후는 「설정」없이 `생산만`/`디자인+생산` 클릭으로 설정 모달. **기공의뢰(practice/dropzone)** 모달은 디자인+생산 고정, 생산만 클릭=`/dashboard/new-request`(어벗생산의뢰). **어벗생산의뢰** 모달은 생산만 고정, 디자인+생산 클릭=`/dashboard/practice-transfers?mode=send`(기공의뢰). 모달 하단 좌측 `프리셋 편집`(primary), 우측 취소/확인. 프리셋 목록은 4개까지 표시·초과 시 스크롤. 임플란트·스캔바디 프리셋이 모두 없으면 설정 모달과 함께 프리셋 편집을 연다. 임플란트·스캔바디 프리셋을 각각 한 번 고르면 확인과 같이 저장·닫힘. 취소·오버레이=열기 전 값 복원. 호버 툴팁: `CNC커스텀어벗 - 어벗츠 자체 제공` + 플랫폼 고시 단가 + `배송비 별도, 박스당 과금, 부가세 없음`. 모달 기본·계정 초기값=`design_custom_abutment`(디자인+생산). 한 번 바꾸면 `practiceTransferSettings.defaultAbutmentProductMode`에 저장하고 다음 모달 초기값으로 사용. 커스텀어벗은 기공소 수가가 아니라 어벗츠 단가. 전체해제·크게보기. 신규의뢰·기공의뢰서(practice/dropzone) 공통.
    - 기공의뢰서 상·하악 사이(크게보기·전송 상세 포함)에 견적(크레딧 소비액) 표시. 치과는 평소 블러, 호버 시 금액 공개. **지정 기공소 수가 Off**면 `견적 0만원` 대신 **기공비 미설정**(블러 없음). 어벗 디자인+생산비는 기공소 수가와 무관하게 표시. 기공소 수락은 마스터 On 필수 — 미설정 시 설정 탭(`?tab=lab-fees&setup=1&from=accept`) 포워드·안내 모달, API `409 lab_fee_unconfigured`. **자동매칭**은 최소 별(1~5)에 따른 플랫폼 고정수가(평균×배수) 견적·청구. 간단 합계 + 빠른툴팁 치식별 세부(컬럼: **보철기공비** / **어벗 디자인+생산비**. 둘 다 기공비. 기공소몫·어벗츠몫 헤더·구분선 없음). **배송비(주문 시 보류)** 를 크레딧 소비 총액에 합산 표시: 기공소 출발→치과→기공소, 어벗츠 출발→치과→어벗츠(`creditSettings.shippingFee`, 기본 3500·박스당). 둘 다 있으면 둘 다. 「지그 제작 불필요」는 견적 오른쪽 — **커스텀어벗(디자인+생산)만**일 때. 보철이 섞이면 숨기고 지그 포함 배송. 계정 `practiceTransferSettings.skipJig`(기본 **true**) → 전송 시 `production.skipJig` 스냅샷(보철 혼재 시 false). 체크 시 기공소 배송 면제. 환봉 요청중은 보철기공비에 `요청중`(또는 기공소 커스텀어벗 수가). `PracticeTransferFeeEstimate` / `GET /api/practice/transfers/quote-context`.
    - 기공소 의뢰카드·전송 상세: 주 표기(합산 라벨)=`기공비`·금액=보철기공비+어벗 디자인+생산비. 하청이면 보조로 수령=`기공비×(1−subcontractFeeRate)`. 원청(어벗츠 기공사업부)이 하청을 준 뒤 자기 화면은 전액 수주(수수료 0). 지정 기공소는 전액(지정 수수료 기본 off). 툴팁 트리거는「기공비」텍스트만(우측 ? 제외). 목록 `feeQuote` SSOT.
    - 프리셋 편집 패밀리 선택: Regular / Mini / Narrow / Small Narrow 고정 + 마지막「패밀리 추가」(직접 입력). 추가한 패밀리는 항목 옆 X로 삭제.
    - 프리셋 편집 제조사 선택 마지막「제조사 추가 요청」: 제조사·브랜드·패밀리 입력, 타입=`헥스(사이즈 미정)` 고정. 요청 시 관리자 문의 자동 접수 + 프리셋 저장 + 안내 모달. `PracticeToothImplantFields` / `POST /api/practice/transfers/round-bar-requests`.
  - `src/shared/components/practice/PracticeToothImplantFields.tsx`
  - `src/shared/practice/roundBarAbutment.ts`
  - `src/shared/practice/usePracticeToothWorkEditor.ts`
  - `src/shared/practice/toothWorkDraft.ts`
  - `src/shared/components/PracticeTransferDetailChatDialog.tsx`
- 관리자 사용자/사업자
  - `src/pages/admin/users/AdminUserManagement.tsx`
  - `src/pages/admin/businesses/AdminBusinessPage.tsx`
  - 관리자 UI에서 별도 `치과`(practice) role 필터/생성은 제거. 레거시 practice는 의뢰자로 표시하고, 의뢰자 `requestorCapabilities`(발신(치과)/수신(기공소·기공실)) 뱃지로 구분.
  - 롤 한글 SSOT: User=`USER_ROLE_LABEL`(salesman=딜러, admin=관리자), BA=`BUSINESS_TYPE_LABEL`(salesman=딜러사, admin=어벗츠). `src/shared/types/role.ts`. 제품명 어벗츠.핏·「관리자에게 문의」는 유지.
- 관리자 크레딧
  - `src/pages/admin/credits/AdminCreditPage.tsx` (탭: 치과 · 기공소 / 딜러)
  - `src/pages/admin/credits/hooks/useAdminCreditPage.ts`
  - `src/pages/admin/credits/components/RequestorCreditTab.tsx`
  - `src/pages/admin/credits/components/RequestorOrganizationsTab.tsx`
  - `src/shared/components/CreditLedgerModal.tsx` (내역: 잔액 카드 + rounded-2xl 테이블)
  - `src/features/settings/tabs/AdminCreditSettingsTab.tsx` (요금/expressFee·생산만·디자인+생산 전역 설정 UI)
  - `src/pages/admin/system/AdminPlatformSettingsPage.tsx` (크레딧 · 커스텀어벗 · 인증 기공소 · 어벗츠 수가 · 기공소 수가. 수수료율=`GET|PATCH /api/admin/settings/platform-fees`. 기공소 신규 기공비는 어벗츠 수가 탭 배지·하이라이트)
  - `src/pages/admin/partners/AdminPartnersPage.tsx` (사이드「사업영역」. 탭당 한 카드: 기공사업 · 어벗사업 · 플랫폼사업. 주체는 role Select(`RoleSelect`). 팀원 검색은 해당 주체 role만. 기공=기공팀·영업팀·개발운영사. 어벗=제조사·개발운영사·딜러사·어벗츠. 플랫폼=어벗츠·개발운영사. 구성원 분배액은 카드 안에서 수정. 분배는 매출에서 배송비를 먼저 차감한 잔여만(배송은 여기 미기재). 기공=내부기공소(기공사업부) 배당 건만 배송비 공통 지출 차감 후 내부 기공팀·영업팀 인센티브(면세)+개발운영사(+VAT). 어벗=건당 제조사 9,000(면세)·개발운영사 1,000·딜러사 3,000+VAT, 잔여 어벗츠. 의뢰서 소개코드(딜러사) 있으면 딜러사·없으면 어벗츠. 특별주문가는 주체별 배분액. 플랫폼=자동매칭·지정(현재 무료)을 어벗츠 90%/개발운영사 10%)
  - `src/features/settings/tabs/AdminAbutsLabFeeScheduleTab.tsx` (어벗츠 수가. 기공소 신규 항목은 Off·검토 대기; On=적용. 이벤트 `abuts-lab-fee:pending-items`)
  - `src/features/settings/tabs/AdminCreditSettingsTab.tsx` (`variant=credits`: 환영 무료 크레딧·배송 / `variant=customAbut`: 고시 생산·디자인+생산·딜러없음 분배·레거시 기공소 오버레이·환봉 추가요청)
  - `src/pages/admin/system/AdminRoundBarAbutmentTab.tsx` (어벗 추가 요청. 도입 전 CNC어벗/환봉어벗 선택. 종류가 치과 단가에 반영. `GET|PATCH /api/admin/round-bar-requests`)
  - `src/pages/devops/components/DevopsPlatformFeeTab.tsx` (매칭 % · 지정 적용 on/off + % · 월 참여. `PracticeTransferAutoMatchTab` 카드 안. SSOT `payoutRates.platformFeeRate` / `directPlatformFeeEnabled` / `directPlatformFeeRate`)
- 개발·운영사 설정
  - `src/pages/devops/DevopsSettingsPage.tsx` (계정/사업자/임직원/**결제(입금 계좌)**/알림/보안)
  - `src/pages/devops/DevopsPartnerPage.tsx` 탭: **입금**(분배율) · 요금·크레딧 · **기공의뢰 자동매칭**
    - 요금·크레딧에 치과 납품 어벗 소매가(`abutmentRetailPrice`) 포함
    - 기공의뢰 자동매칭: 상단 `DevopsDesignDeadlineTab`(수락 후 마감 요약) + `PracticeTransferAutoMatchTab`(인증 기공소). 구 `?tab=design|deadline` → `autoMatch`
  - 의뢰자(기공소) 설정: `requestorKind=lab`일 때 알림 **왼쪽**에 「기공비」 탭
    - `src/pages/requestor/settings/SettingsPage.tsx`
    - 구 `?tab=auto-match`·`trading-partners` → 계정. 인증 신청 UI 제거(관리자 `PracticeTransferAutoMatchTab`)
    - `src/features/settings/tabs/LabFeeScheduleTab.tsx` — 항목 카드(이름·단위·원가/리메이크). 하단 저장 버튼 없음, 항목 변경은 디바운스 자동 저장. 제목 오른쪽 마스터 On/Off(기본 off, 켜면 설정 완료·즉시 저장). 로그인 시 미설정이면 `LabFeeSetupPrompt` → `?tab=lab-fees&setup=1`로 스위치 하이라이트. **수락 클릭 시 미설정이면** `?tab=lab-fees&setup=1&from=accept`로 포워드·안내 모달. 유지장치는 연결 스팬당 1세트(같은 악궁이어도 끊기면 별도). 임시치아는 카드 두 장(이름 모두 「임시치아」, 3치·6치 이하). 청구는 의뢰서 「임시치아」에 치아 수 구간으로 합산. **카탈로그에 없는 신규 항목 저장 시 어벗츠 수가에 Off로 동기화·관리자 알림.**
    - 가입 이유 배너: `LabDashboardTopBanners` — 기공소 사이드 설정과 계정 팝업 사이(짧은 카피).
      - 가입 이유 (`LabPlatformBenefitsBanner`) → 클릭 시 모달
      - 대시보드 `[정책 안내]` 옆 `[가입 이유]`로도 동일 모달 열기(기공소)
      - `src/features/platform/PlatformBenefitsDialog.tsx` (`variant`: lab | practice)
      - `src/shared/platform/platformBenefitsContent.ts`
      - `src/features/platform/PlatformBenefitsShareButtons.tsx` (안내+링크 클립보드 복사)
  - 의뢰자(치과) 설정: 구독 탭 없음. 구 `?tab=subscription` → 계정. 대시보드 헤더는 `[정책 안내]`만.
    - `src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx`
    - `src/shared/ui/PricingPolicyDialog.tsx` — 치과=어벗디자인 생산 1.5만 · 구강스캔 디자인+생산 2.5만(구강지그 제외). 기공소=어벗생산의뢰/기공의뢰수신 동일 고시(디자인+생산도 구강지그 제외). 신속 +2,000 · 배송 3,500. 풀세트·환봉·디자인비+지그 행 없음. 멤버십/구독 UI 없음.
  - 수락 후 마감: `DevopsDesignDeadlineTab` — 디자인 클레임 후 작업 마감(`designDeadlineSettings.claimHours`, 기본 3시간). 파트너 **기공의뢰 자동매칭** 탭 상단
  - 기공의뢰 자동매칭: `PracticeTransferAutoMatchTab`(카드·탭 **인증 기공소**) — 수수료 스트립(매칭%/지정 on·off·%/월) + 기공소별 인증 ON·기공 테스트·메모. 기공소 설정 탭은 없음. 관리자 테스트 통과/`enabled` 시 풀 참여. 매칭 성공 `platformFeeRate%` · 지정은 기본 무료(`directPlatformFeeEnabled` off) · on 시 `directPlatformFeeRate%`. 관리자 플랫폼 설정「인증 기공소」탭
  - 기공소 어벗츠 인증: 가입 시 미신청 → 신청 → 기공 테스트 → 통과 시 인증. 상태·테스트·메모 SSOT `BusinessAnchor.abutsLabCertification` / `src/shared/practice/abutsLabCertification.ts`
  - 검증된 디자이너 지정: `DesignerAssignmentTab` / `BusinessAnchor.designAccessEnabled`(디자인 큐). API·게이트 유지, 파트너 탭 UI에서는 제거
  - 딜러사 없을 때 분배: 설정된 딜러사 분배비의 절반→제조사, 나머지 절반→어벗츠 (백엔드 `resolveRatesWithoutSalesman`와 동일 미리보기)
  - 관리자 대시보드/소통
  - `src/pages/admin/dashboard/AdminDashboardPage.tsx`
  - `src/pages/admin/support/AdminChatManagement.tsx`
  - `src/pages/admin/support/AdminSmsPage.tsx` (로컬 SMS 템플릿 CRUD·사업자/사용자 휴대폰 수신자 선택)
- 역할별 정산
  - 공통 UI: `src/shared/settlement/settlementUi.tsx` · VAT 카피 `src/shared/settlement/affiliateVat.ts` (의뢰자 크레딧/기공크레딧 최신 스타일)
  - 기공소/어벗츠기공소: `src/features/settings/tabs/LabSettlementPayoutTab.tsx` — 면세 계산서
  - 제조사: `src/pages/manufacturer/payments/PaymentsPage.tsx` — 거래 원장(일시·지급상태·금액·잔액·거래내역). 유형 열은 생략(모두 커스텀어벗 생산+배송비). **생산·배송은 KST 하루 1행**(의뢰 1건=어벗 1개라 기공의뢰처럼 못 묶음). 클릭 상세는 의뢰/배송을 별 섹션으로 나누고, 그 안에서 수취자(우편함)별. 장부는 공급가(어벗 1개당 9,000, 면세). 무료 크레딧은 지급 0.
  - 딜러: `src/pages/salesman/SalesmanPaymentsPage.tsx` — 공급가 장부, 지급 시 부가세·세금계산서(실입금=공급가+VAT)
  - 개발운영사: `src/pages/devops/DevopsPaymentsPage.tsx` — 잔여 분배 공급가, 지급 시 부가세·세금계산서(실입금=공급가+VAT)
  - 관리자: `src/pages/admin/AdminPaymentsPage.tsx` — 어벗츠 3사업 축 + 관계사 잔여 분배(어벗츠 면세)

## 1. 구조

- React + TypeScript + Vite + Tailwind 기준으로 작성합니다.
- 공통 UI는 `src/components/ui`에 둡니다.
- 도메인 기능은 `src/features`, 페이지는 `src/pages`, 공유 유틸은 `src/shared`를 우선 사용합니다.
- 페이지 폴더끼리 직접 import하지 않습니다.
- 앱 전역 role 타입 SSOT는 `src/shared/types/role.ts`를 사용합니다. (로컬 컴포넌트에서 role union 재정의 금지)
  User 라벨=`USER_ROLE_LABEL`, BA·정산 주체=`BUSINESS_TYPE_LABEL`/`sharePartyLabel`. 제품명=`PRODUCT_NAME`(어벗츠.핏).

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
    - 디자인비는 디자인+생산 − 생산만. 어벗 수는 `toothWorks` 커스텀어벗·임플란트 치아(Pontic·작업X 제외).
    - 안내·청구 정가 SSOT (`creditSettings` + `src/shared/pricing/abutsAbutmentService.ts`): 생산만 **1.5만원**, 디자인+생산 **2.5만원**(`membership*` 필드). 신속 `expressFee`(기본 +2,000). 배송비 별도·박스당 과금. 치과 멤버십 월정·가입 90일 1만원 없음. 기공소 매칭 월정 0·성공%만 — 루트 `rules.md` §2.3.
    - 생산(`custom_abutment`)은 Request/STL당 생산 1개. 신속비는 건당.
    - 디자인+생산 신속비는 **어벗 수 배수** (`expressFee × abutmentQty`).
    - 표시 라벨: `커스텀어벗 생산` / `커스텀어벗 디자인+생산` (생략 시 `생산` / `디자인+생산`).
    - 출고일: 묶음/신속 공통 **+1영업일**(디자인). 안내 카피 SSOT는 `.cursor/rules/design-fee.mdc` UI 절.
    - 의뢰카드는 `+디자인` 뱃지만. 의뢰 상세(`RequestDetailDialog`)에는 비용 세부(생산/디자인/배송·신속) 표시.
    - 표시: `PricingPolicyDialog`, `RequestDetailDialog`. 생산만/디자인+생산 정가와 배송비 별도(박스당 과금). 신규의뢰 우측에는 금액 미표시.
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
    - `src/shared/pricing/abutsAbutmentService.ts`
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
  - 모달/칩 닫기 = 확인. 같은 Alert `id`는 `localStorage` dismissed 목록에 남아 새로고침해도 재표시하지 않음. 새 재배치는 다시 Alert.
  - 재배치 건 뱃지: `fastMachiningRebalance` → `MachiningRequestLabel` 「빠른 가공 재배치」
- 신속/묶음 뱃지: 가공카드(Complete/Now Playing/Next Up)·재생목록·프리뷰(`PreviewModal`)에 `ShippingModeBadge` 상시 표시
  - `MachiningRequestLabel.tsx`, `CncPlaylistDrawer.tsx`, `PreviewModal.tsx`
  - 큐 API(`/api/cnc-machines/queues`)·worksheet 목록에 `shippingMode`/`finalShipping`/`originalShipping` 포함 → 프리뷰는 **추가 fetch 없이** 큐/목록 페이로드만 사용
  - 재생목록 항목 클릭 → PreviewModal (코드 에디터는 프리뷰 내 버튼)

- 커스텀 어벗 의뢰 단가 표시 SSOT:
  - 치과 정책 안내·크레딧 차감은 관리자「플랫폼 설정 · 커스텀어벗」고시 생산가(기본 15,000). 신속은 +신속 의뢰비.
  - 기공소 커스텀어벗 안내도 치과와 동일 고시(`membershipProductionPrice` / `membershipDesignAndProductionPrice`). 라벨만 `어벗생산의뢰`·`기공의뢰수신`. 가입 90일 1만원 고정가 없음.
  - 기공소 어벗츠 인증: 관리자 `PracticeTransferAutoMatchTab`에서 신청·테스트·상태 관리. **월 참여 수수료 0원**(정책). 매칭 성공 `platformFeeRate%` · 지정 거래 수수료는 **별도 공지 시까지 무료**(`directPlatformFeeEnabled` 기본 off). 구 거래 치과 소개 UI는 제거(초대 API는 레거시 유지). 구 기공소 설정「어벗츠 인증」탭 제거.
  - 기공소 사이드 설정과 계정 팝업 사이: 가입 이유 배너. 어벗생산의뢰 상단은 생산 현황 헤더(`[정책 안내]`·진행중·출고예정·완료·불완전가공).
  - 크레딧 잔액·장부 UI(`CreditLedgerModal` / 의뢰자 크레딧 페이지):
    - 잔액 요약은 기공크레딧 탭과 동일하게 rounded-2xl 카드 그리드(현재/유료/무료/[기공]).
    - 테이블·필터·관리자 모달도 rounded-2xl·slate border 톤으로 통일.
    - **치과**: 유료크레딧(+무료·의뢰/배송)만 표시. `기공크레딧` 잔액 행·정산 필터 숨김. 기공의뢰 차감은 유료크레딧에서 나가며 장부 항목=`기공비`. 기공의뢰 치식 차트(상·하악 사이)·전송 상세에 견적(크레딧 소비액) 표시.
    - **기공소 기공의뢰수신**: 의뢰카드·전송 상세에 수령액(청구 − 플랫폼 수수료) 표시.
    - **기공소**: 유료(선입금)·무료·기공크레딧을 **경로별로 분리 표시**. 주문 차감은 무료→기공→유료 통합. 기공 사용=월 정산 상계. 크레딧 페이지 탭은 내역·충전만. 내역 필터: 버킷(유료/무료/기공)·동작(충전/소비/조정). `SPEND_SETTLEMENT`=기공크레딧 주문 사용.
    - **기공소 기공의뢰 장부**: 보철기공비와 어벗 디자인+생산비는 모두 기공비. 금액 호버는 두 열+배송. **지급 상태는 기공비만**(지급되었으면 지급완료). 행 클릭 상세는 기공소 견적 뷰(열: 보철기공비|어벗 디자인+생산비). CA 디자인비 원장(`abutment_design_lab_fee`)을 생산의뢰 행으로 따로 표시하지 않는다.
    - **치과 장부**: 구강스캔 기공의뢰=`기공의뢰-구강스캔으로`. 금액 호버는 견적 열 기준 **보철기공비**(지르 등 기공수가)·**어벗 디자인+생산비**(구강스캔 2.5만, 구강지그 제외)·배송. 정산 경로 보류(디자인비를 기공소몫에 합쳐 7만+1.5만으로 보이는 것)는 쓰지 않는다. 어벗디자인(치과)·어벗생산(기공소) 의뢰비·배송비는 **의뢰 사업자+예정 출고일** 1박스(`기공의뢰-어벗디자인으로`). 치과명으로 쪼개지 않음. 거래내역은 의뢰 사업자+건수, 클릭 시 의뢰/배송 상세(신속/묶음 뱃지). 지급 상태는 구강스캔과 같이 보류/일부 지급/지급 완료.
  - 안내 모달([정책 안내])·어벗 라인 요약카드(무료 재제작 잔여) 문구는 동일한 `90일` 기준을 사용해야 합니다.
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
  - 레이아웃: 카드는 `layout="stack"`(기본), PreviewModal은 `layout="row"`(가로 3열)로 요약 높이를 줄여 STL 영역을 확보합니다. 열 너비를 넘는 문구는 다음 줄로 넘깁니다(1줄 nowrap 강제 금지).
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
  - 라이노 작업 전 카드: 의뢰 생성 직후 준비 탭에 즉시 표시하되, `caseInfos.camFile.s3Key`(2-filled)가 없으면
    카드 본문을 블러하고 「라이노 작업중」 오버레이로 클릭을 막는다.
    라이노 완료 웹소켓(`request:stage-changed` source=`bg-file-processed`,
    `request:stl-metadata-updated` source=`bg-file-processed:2-filled`,
    notification `bg-file-processed` step=`2-filled`)으로 camFile이 패치되면 블러를 해제한다.
    Filled STL/NC 재생성 완료 시 IndexedDB 캐시(s3Key·버전 키)를 삭제한다.
    디자인+생산 큐(`DesignRequestTransferView`)에는 적용하지 않는다.
  - 준비 탭 의뢰카드 오른쪽에는 로트번호 3글자(영문) 뱃지를 표시합니다.
    발급 SSOT는 백엔드 준비 단계 진입(`ensureLotNumberOnReadyEnter`). 세척.패킹과 동일 각인코드 뱃지.
  - 관련 파일:
    - `src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx`
    - `src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts`
    - `src/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering.ts`
    - `web/backend/controllers/bg/bg.controller.js`

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
  - 테이블 `balanceAfter` 칼럼 라벨은 「잔액」이며, 각 행 시점의 총잔액(유료+무료+기공)입니다.
  - 의뢰(REQUEST) 차감은 의뢰 사업자+예정 출고일 1박스로 `기공의뢰-어벗디자인으로` 1행(치과명 무관). 거래내역은 의뢰 사업자+건수, 클릭 시 의뢰/배송 상세·신속/묶음 뱃지. 지급 상태는 보류 저널이면 「지급 보류」, 보류+확정 혼재면 「일부 지급」, 확정만이면 「지급 완료」.
  - 기존 기공의뢰(PRACTICE_TRANSFER)는 `기공의뢰-구강스캔으로`.
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

- 부가세(VAT) / 면세 UI 정책(강제, 루트 `rules.md` §2.3) — 이중 체계:
  - **고객·기공 경로(면세)**: 가격·충전·약관에서 "VAT 별도 / 부가세 포함 / VAT 10%" 문구 금지. 증빙은 **계산서**.
  - **과세 지급**: 어벗츠↔딜러사, 어벗츠↔개발운영사. 지급 UI에 공급가·부가세·합계와 **세금계산서** 표시.
  - **면세**: 치과·기공소·제조사·어벗츠. 공급가·**계산서**.
  - 공통 UI: `src/shared/settlement/settlementUi.tsx`, VAT 카피 `src/shared/settlement/affiliateVat.ts`
  - 크레딧 충전 UI: 결제·입금 금액 = 공급가. `vatAmount` 표시·가산 금지.
    화면 제목/안내: **크레딧(기공료 선입금)** — 선불페이(전자금융업)가 아니라 B2B 기공물 대금 선납임을 충전 화면·FAQ·약관에 명시.
    카피 SSOT: `src/shared/legal/creditPrepaidCopy.ts`
    구현: `src/features/settings/tabs/CreditPaymentTab.tsx`
    FAQ: `src/pages/public/HelpPage.tsx`, 의뢰자 문의 `InquiriesPage`
    약관 제7조: `src/pages/public/TermsPage.tsx` (선결제 잔액 표현 금지)
    충전 단위 SSOT: 기공소(`lab`) 50만원, 치과(`practice`) 100만원.
    첫 충전 기본 1단위. 2회차부터 기본 배수 3(단위≈월사용량 1/3 → 약 한 달분). 추천 버튼은 월사용량 반올림.
    잔액 < 50만원이면 사이드바 `크레딧`에 깜빡이는 충전 뱃지·클릭 시 `?tab=charge` (`DashboardLayout`).
    백엔드: `utils/creditChargeUnit.js`, `creditBPlan.controller.js`, `credit.controller.js` insights.
  - 공개 안내/약관: `ServicePage`, `TermsPage`, `HelpPage` — 치과·기공소 경로는 면세·부가세 없음, 크레딧=기공료 선입금(선납 대금).
  - 가격 정책/대시보드: `PricingPolicyDialog` — 치과 고시 어벗디자인으로 생산 1.5만 · 구강스캔으로 디자인+생산 2.5만(구강지그 제외). 기공소는 어벗생산의뢰/기공의뢰수신 동일 고시. 신속 출고 +2,000(1개당) · 배송비 3,500(1박스당). 풀세트·환봉·디자인비+지그 행 없음. 멤버십/구독 행 없음.
  - 관리자 플랫폼 설정「커스텀어벗」: 고시(생산·디자인+생산) + 딜러없음 분배 단가. 멤버/일반·디자인비+지그 카드 없음. 기공소 공급은 레거시 오버레이 안내.
  - 제조사 정산규칙: 원청–하청 고정단가(의뢰·배송 공급가, 면세). % 분배 안내 금지.
  - 관리자 고객향 세금계산서 직접발행: 공급가 입력 시 세액 자동 10% 금지(기본 세액 0). 딜러사·개발운영사 `AFFILIATE_TO_ABUTS`만 과세.

- 단일 SSOT 장부 UI 필드 계약(초안):
  - Journal: `journalId`, `eventType`, `businessAnchorId`, `refType`, `refId`, `stageFrom`, `stageTo`, `occurredAt`
  - Line: `lineNo`, `accountCode`, `ownerRole`, `ownerId`, `amount`, `amountExcludingVat`, `vatAmount`, `amountIncludingVat`, `creditKind`
    - 의뢰자·제조사 포함 `REV_*`: `vatAmount = 0`, `amount = amountExcludingVat = amountIncludingVat`
  - 수익 계정코드: `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - 워크시트/정산 저장 이벤트: `REQUEST_SPEND_COMMIT`, `SHIPPING_SPEND_COMMIT`, `SETTLEMENT_PAYOUT`
  - 발생 타이밍: `REQUEST_SPEND_COMMIT`=가공 진입 승인(준비→가공), `SHIPPING_SPEND_COMMIT`=집하(우편함 비우기)
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
  - 하청 고정단가: **어벗 1개당** 9,000 / 배송 박스당 3,500(면세). 상단 카드·상세는 의뢰/배송을 **분리** 표시(공급가·건수). 유료/무료는 보조 필터(`유료`/`무료`).
  - 원장 목록은 생산·배송 EARN을 **KST 하루 1행**으로 묶고, 유형 열은 생략한다. 클릭 상세는 의뢰/배송을 별 섹션으로 나누고, 그 안에서 수취자(우편함)별 생산·발송·배송비를 보여준다. 지급/조정은 별행.
  - 일별 카드 컬럼(daily-summary): `의뢰/배송/환불·지급·조정/지급 순액·참고(유료·무료 분해)`.
  - 의뢰/배송 **건수**는 백엔드 유니크 건수 SSOT. (`machining_spend`+`express_surcharge`를 프론트에서 각각 세지 않음.)
  - 일별 목록은 KST **오늘 이후(미도래 일자)를 표시하지 않는다**. `이번달` 프리셋 종료일도 오늘이다.
  - 제조사 지급 대상은 **유료 하청비만**(면세 · 계산서). 무료는 적립·표시만 하고 지급 0. 상단 카드는 의뢰·배송 분해.
  - 상단 합계 카드는 `DashboardShell.statsGridClassName`을 명시해 카드가 과도하게 좁아지지 않도록 유지합니다.

- 관리자 정산(`AdminPaymentsPage`) 표시 정책:
  - 상단 3사업 축(선택형 카드): (1) 커스텀 어벗 생산·공급 — 기공소 디자인 → 애크로덴트 생산 → 치과 납품(하청 정산) (2) 자동매칭 수수료 (3) 기공소 직접 운영.
  - 집계 API: `GET /api/admin/credits/settlement-business-overview` (기간=`period`/`startDate`/`endDate`).
    - (1) 의뢰자 유료 소비(`REQUEST_SPEND_COMMIT`/`SHIPPING_SPEND_COMMIT`) + 제조사 하청 보조지표
    - (2) `PRACTICE_TRANSFER_ESCROW_RELEASE.meta.abutsRevenueAmount`
    - (3) `internalLab` `LAB_SETTLEMENT_CREDIT` 적립
  - 카드 선택 시 해당 사업 상세 패널. 하단「관계사 잔여 분배」는 딜러사·개발운영사(과세·세금계산서)·제조사·어벗츠(면세·계산서).
  - 기간 필터는 `PeriodFilter`(KST). `PricingPolicyDialog`는 가격·출고 안내만(사업 축 UI 아님).
  - UI: `creditPageUi` 패널/스탯 타일 + 선택형 사업 카드.

- 어벗츠기공소(`internalLab`) UI SSOT:
  - Role: top-level `User.role=internalLab`(제조사와 대칭). 공개 가입 없음·관리자 생성. UI 라벨 「어벗츠기공소」.
  - 사이드: 기공의뢰수신(`/dashboard/lab-work`, 디자인 큐 포함) · 설정(`/dashboard/settings`).
  - 상단 `LabDashboardTopBanners`(가입 이유)는 미표시.
  - 페이지: `src/pages/internalLab/labWork` — 기공의뢰수신 셸. 구 `/dashboard/abut-design` → `/dashboard/lab-work`.
  - 랜딩: `/dashboard/lab-work`.
  - 조직: 법인「어벗츠 주식회사」하위 「기공사업부」(`parentBusinessAnchorId` + 설정 `InternalLabOrgBanner`). 사업자등록증·BN은 법인과 공유(type별 앵커).

- 제조사 워크시트 크레딧 승인/롤백 정책:
  - 가공 진입 승인으로 `가공` 단계 이동 시 의뢰 크레딧 소비가 발생합니다.
  - `가공`에서 준비로 롤백 시 소비된 의뢰 크레딧은 "환불" 행 추가가 아니라, 기존 소비 행 삭제로 복구됩니다.
  - 집하(우편함 비우기) 시 배송 크레딧 소비가 발생합니다.
  - `포장.발송`에서 세척.패킹 롤백 시, 집하 전 정상 건은 배송비 차감이 없고 레거시 패키지만 기존 소비 행 삭제로 복구됩니다.
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
    - 서비스 선택 UI 없음. `requestorServices`는 paid-only(`{free:false,paid:true}`). 레거시 free는 읽기 시 paid 승격
    - 역할 선택 시 사업자등록증 등록·검증 필수
  - 온보딩 완료 랜딩: `/dashboard`
  - 생산의뢰 게이트: `canUsePaidServices({ businessVerified, services })` = `paid && verified`
    - `BusinessPaidAccessGate`, 사이드바 `isPaidRequestorPath`, 설정 `PAID_REQUESTOR_SETTINGS_TABS`
    - 변경 후 `notifyRequestorAccessUpdated`
  - 기공의뢰서: 발신=`kind===practice`, 수신=`kind===lab` (`PracticeTransferRoleTabs`)
  - 치과 사이드: 「기공의뢰」메인 행 + 서브 `구강스캔으로`(`/dashboard/practice-transfers?mode=send`, 서비스 2·3) · `어벗디자인으로`(`/dashboard/new-request`, 서비스 1). 대시보드 메뉴 없음.
  - 기공소·어벗츠기공소 사이드: 「기공의뢰」메인 행 + 서브 `기공의뢰수신`(lab=`/dashboard/practice-transfers?mode=receive`, 어벗츠기공소=`/dashboard/lab-work`) · `어벗생산의뢰`(`/dashboard/new-request`). 대시보드/대기보드 메뉴 없음(`/dashboard` → 수신, 제출 후 어벗생산의뢰).
  - 치과 대시보드 요약 행 라벨: `구강스캔` / `어벗디자인` (기공소는 `기공` / `어벗`). 액센트는 기공·어벗 토큰. 치과·기공소는 대시보드 페이지를 쓰지 않고 같은 기간 건수를 어벗디자인/어벗생산의뢰 헤더 버튼으로 연다. 기공 수신 건수는 기공의뢰수신 상태 탭.
  - 접근 훅: `useRequestorBusinessAccess` (kind/services + verified)
  - 계정 전환: `AccountSwitcher`

- practice 전송 상태 표준(치과/의뢰자 공통): `발송완료 | 취소 | 수신완료 | 의뢰수락 | 자동매칭 | 작업완료 | 생산진행`
  - 상단 필터 뱃지 UI(기공의뢰·기공의뢰수신·대시보드 구강스캔 행): **의뢰 · 수락 · 완료 · 발송 · 추적관리** (수신 뱃지 없음. `수신완료`·`자동매칭` 공개 풀은 의뢰 집계·필터에 합산. 발송=`포장.발송` 슬롯). 카드 뱃지 문구도 동일(`toStatusBadgeLabel`: 자동매칭/발송·수신완료→의뢰, 의뢰수락→수락). 상대 표시명만「자동 매칭」마스킹(실명은 DB·앵커에 보존).
  - 치과 전송 내역(`GET /api/practice/transfers/my`)은 동일 치과 businessAnchor 구성원 전송을 공유한다.
  - 수락 전(의뢰 단계) 내용 수정: 최근의뢰 연필(카드 헤더)·상세 좌측 의뢰정보 「의뢰 수정」→ 작성 폼 복원 → `POST .../update-content`. 수락 이후는 삭제와 같이 잠금. 수정 저장은 임시저장 목록 재조회를 기다리지 않음. 최근의뢰·임시저장·휴지통 카드 메타는 1행 1항목(세로 스택, 잘림 없음).
  - practice 페이지 상태 정규화 기준: `src/pages/practice/PracticeFileTransferPage.tsx`의 `toStatusLabel`
  - 의뢰자 치과 페이지 상태 배지 기준: `src/pages/requestor/practice/RequestorPracticePage.tsx` (`isRead/requestorReadAt`, `isAccepted`/`requestorDownloadedAt`=의뢰수락)
    - 자동매칭 공개 풀 상세 열람만으로는 `mark-read`/사이드바 안읽음 배지를 내리지 않는다(수락 시 갱신).
  - 기공소 의뢰수락: 상세 다이얼로그 왼쪽 「전체 다운로드」, 오른쪽 「치과와의 소통」 중앙에 안내 문구+「수락」→ `POST .../mark-accepted`(과금). 파일 다운로드는 뱃지/과금과 무관. 작업완료/취소는 모달이 아니라 메인 카드에서. 수락 시 `practice:transfer-updated`(action=`accepted`, `feeQuote` 확정)로 치과 UI가「확정 기공비」를 즉시 표시.
  - **자동매칭(레거시)**: 치과 기공소 픽커의 「자동 매칭」항목은 제거. 신규 의뢰는 지정 기공소 또는 어벗츠기공소(고정). 기존 `matchingMode=auto` 건·공개 풀·우선창 엔진은 유지하되, 작성 UI에서는 쓰지 않는다. 레거시 draft는 어벗츠기공소로 복원. 표시명 마스킹·수신 뱃지 합산 규칙은 기존 건에 적용. UI: `PracticeTransferAutoMatchTab` (관리자 플랫폼 설정「인증 기공소」)
  - 의뢰상세·채팅 우측 상단 평가: 치과=`PracticeLabRatingControl`(1~5점만, 수가·배정 미사용). 기공소=`LabPracticeFeeSurchargeControl` variant=`evaluate`(별점 없음, 해당 치과 수가 할증·다음 의뢰부터). 설정 탭 거래처 할증은 동일 컴포넌트 variant=`surcharge`.
  - 기공소 수신 카드(상태=의뢰수락): 카드 점선 외곽 + 카드 스코프 `PracticeTransferFileDropTarget`(로컬드롭) · `[UploadCloud 작업완료]`(크라운 결과파일)·`[작업취소]`. **커스텀어벗 배송선택 모달 없음.** CA면 수락 시 Request(`design_custom_abutment`) 조기 생성. **수락 기공소가 디자인**해 상단 디자인 큐에서 STL 업로드 → 제조 자동 주문·어벗디자인비 지급. **생산 후 치과 직납**(출고 목표=치과도착일−2영업일). 레거시 미컨펌 건만 「어벗 디자인 확인」 CTA.


- 드롭존 가입(치과 전용, requestor+practice)
  - 공개 드롭존(`PracticeDropzonePage`)은 기공의뢰서 **발신(치과)** 전용. kind/lab 선택 UI 없음.
  - Step 2 임베디드 로그인/가입/비밀번호 변경. 라벨은 「의뢰인 계정」.
  - 최소 가입: `POST /api/auth/practice/register` → `role=requestor` + `requestorKind=practice` + `requestorServices={free:false,paid:true}`.
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
    - `src/shared/hooks/useBackgroundTempUpload.ts`
    - `src/shared/components/upload/BackgroundUploadList.tsx`
    - `src/shared/hooks/compressMeshFile.ts`

- S3 temp 업로드 가속(SSOT) — 기공의뢰·어벗생산의뢰 공통:
  - 동시 업로드 풀: 최대 8 (`useS3TempUpload`).
  - 첨부 직후 백그라운드 사전 업로드(`useFilePreUpload`). 페이지 이동·복원 시 S3/File 메타가 있으면 재업로드하지 않는다(공유 캐시 + sessionStorage). 로그인 세션이 있을 때:
    - 기공의뢰: Dropzone·FileTransfer. 파일카드에 `uploadProgress` 프로그레스바.
      제출([기공소로 전송])은 캐시된 결과를 재사용하고, 미완료면 백그라운드 업로드만 기다린다. 재업로드 토스트를 띄우지 않는다.
    - 생산의뢰: `useNewRequestPage` 첨부 직후 `preUploadFiles`. 파일카드 프로그레스바·%(업로드 중)·「업로드됨」(완료, 파란 바). 제출은 `ensureFilesUploaded` 재사용 (`useNewRequestSubmitV2`). `POST /api/requests/from-draft`는 S3를 다시 올리지 않고, 「의뢰 접수중」토스트 지연은 서버 생성(가격·스케줄·크레딧 보류) 경로다. 제출 시작 시 초안 PATCH debounce는 멈춘다(`suspendDraftPatches`).
      치과는 제출 후 같은 `/dashboard/new-request`에 잔류하므로, 성공 시 로컬 초안을 `setFiles([])`보다 먼저 지우고 입력 중 `check-duplicate`는 generation으로 무효화한다(성공 토스트와 중복 모달이 동시에 뜨지 않게).
      헤더 [출고예정]/[진행중]은 `RequestorAbutmentPageHeader`가 `request:stage-changed`·`credit:balance-updated`를 구독해 `requestor-bulk-shipping` / `requestor-dashboard-cards-summary`를 재조회한다.
    - 채팅 첨부: `useBackgroundTempUpload` + `BackgroundUploadList`
      (첨부 즉시 백그라운드 업로드, 칩 프로그레스바. 전송 시 `ensureUploaded` 재사용)
      - 지원 채팅: `ChatComposer` / `NewChatWidget` / `AdminChatManagement`
      - 기공의뢰·디자인 상세 채팅: `PracticeTransferDetailChatDialog`
  - 진행률 키: `name:size:lastModified` (`toTempUploadFileKey`).
  - 8MB 이상: S3 multipart (`POST /api/files/temp/multipart/{init,complete,abort}`) + 파트/단건 PUT 재시도.
  - STL/PLY/OBJ: 클라이언트 gzip(유의미할 때만). S3 `ContentEncoding=gzip`, 원본 파일명 유지.
  - 다운로드 프록시는 gzip 객체를 풀어 원본 바이트로 응답 (`getObjectStreamFromS3` / `getObjectBufferFromS3`).
  - 하위 호환: `usePracticeFilePreUpload`는 `useFilePreUpload` re-export.

- practice 최근 전송 기공소(기공소 선택 드롭다운) SSOT:
  - 서버: `GET /api/practice/transfers/my` 응답의 `caseInfos.practiceRouting.targetLabAnchorId/targetLabName`(최신순)이 권위 소스.
  - 로컬 캐시: `localStorage.practice_recent_labs_v3` (최대 8개). 전송 성공 시 `rememberLab`, 목록 로드 시 `syncRecentLabsFromTransfers`로 merge.
  - 사용자 고정: `localStorage.practice_pinned_labs_v1` (최대 5개, 어벗츠 제외). 드롭다운 「고정」= 어벗츠기공소(항상) + 사용자 pin. 「최근」= 지정/최근 기공소(pin·어벗츠 제외). `togglePinLab`로 토글(어벗츠 해제 불가). 치과 픽커에서 「자동 매칭」항목은 제거. 레거시 자동매칭 draft는 어벗츠기공소로 복원.
  - 「새로 작성」은 의뢰 폼/임시저장 캐시만 비우고, 최근 기공소 목록은 드롭다운 후보로만 유지한다. 기공소 선택은 비워 다시 고르게 한다. 보철물 차트는 M(전치부) 위치로 되돌린다.
  - 기공의뢰 상단에는 수동 「임시 저장」버튼이 없다. 목록 반영은 기공소·환자명 입력 후 자동 동기화만 수행한다.
  - 기공의뢰 상단 툴바(Express/Expert 공통): 「새로 작성」·「최근 의뢰」·「임시저장」·「휴지통」. 최근 의뢰=전체보기 모달, 임시저장/휴지통=다이얼로그. Expert는 우측 목록 없이 작성 폼 전폭(치식 full 차트, 카드 min-w로 어벗 라벨 표시).
  - 신규 draft 생성(autosave) 및 갱신: 기공소·환자명 둘 다 필요. 치아·메모·파일만으로는 목록에 올리지 않는다. 둘 다 입력된 뒤의 기존 draft 갱신에서는 치아 변경도 동기화한다.
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

- practice 임시저장 전체삭제 API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/drafts/clear-all`
  - 동일 치과 범위의 활성 임시저장(`deletedAt: null`)을 모두 휴지통으로 옮깁니다.
  - response: `data.draftClearedCount`, `data.draftIds`
  - UI는 확인 없이 호출하고, `drafts-cleared` 실시간 이벤트로 동료 화면을 동기화합니다.

- practice 휴지통 비우기 API 계약(SSOT):
  - endpoint: `POST /api/practice/transfers/trash/empty`
  - 동일 치과 범위의 임시저장 휴지통(`deletedAt != null`)과 취소 전송(`status: "canceled"`)을 영구 삭제합니다.
  - response: `data.draftDeletedCount`, `data.transferDeletedCount`
  - UI는 확인 다이얼로그 후 호출하고, `trash-emptied` 실시간 이벤트로 동료 화면을 동기화합니다.

- practice 채팅 라우팅 SSOT:
  - practice 화면과 requestor 수신 화면은 모두 `transferId` 기반 채팅(`/api/chats/practice/transfer-room/:transferId`)만 사용합니다.
  - legacy request 기반 practice 채팅 경로(`/api/chats/practice/request-room/:requestId`)는 사용 금지합니다.
  - 동일 치과 구성원(레거시 practice 및 requestor+practice)은 동료가 보낸 전송 채팅에도 참여할 수 있습니다(백엔드 participants 자동 추가). 수락 후 기존 방이 있어도 작성자·수락 기공소는 403 없이 합류합니다.
  - 지정 기공소(`targetLabAnchorId`) requestor 구성원도 primaryContact 해석 실패 시 본인으로 lab 참여자를 잡아 치과(`practiceUserId`)와 연결합니다.
  - 자동매칭 공개 풀: 치과는 「기공소에서 의뢰 수락 후 채팅방을 열 수 있습니다.」, 기공소는 「의뢰수락 후…」 안내. 수락 시 서버가 채팅방을 만들고 치과 모달은 실시간으로 재연결.
  - 기공소 의뢰 상세 모달: 지정 기공소는 수락 전이라도 치과 채팅 내역을 본다. 수락 CTA는 채팅 상단 바. 자동매칭 공개 풀은 수락 전까지 방이 없어 빈 상태 + 수락 바.
  - 의뢰 상세·채팅 모달(`PracticeTransferDetailChatDialog`) 가로폭: `max-w-[90rem]` (`w-[95vw]`).
  - draft 공동 작성 동기화: `draft-upserted` 이벤트 스냅샷을 즉시 반영(`delayMs=0`, `deferWhenEditing=false`). 동일 계정 다중 탭도 fingerprint/서버 updatedAt LWW로 맞춤(editor echo skip 금지).
  - 한글 IME: 환자명/메모는 `ImeSafeInput`으로 조합 중 로컬 draft 유지. 조합 중 autosave·원격 폼 반영은 미루고, 조합 종료 후 처리.
  - 기공소 전송 성공 후 작성자·동료 모두 의뢰 접수 폼 localStorage(`practice_transfer_form_local_v1`, `practice_dropzone_draft_v2`)와 화면 입력을 초기화한다.
    - 작성자: 전송 API 성공 시 `resetIntakeFormAfterTransfer`
    - 동료/다른 탭: `transfer-created`(clearedDraftId) · `draft-cleared`(활성 케이스) 수신 시 동일 초기화
    - 재진입 보호: local form에 `activeDraftId`를 저장하고, 서버 draft 목록에 없으면 복원값을 버린다.
    - **작성 중 1건만 전송**: `[기공소로 전송]`은 폼의 `activeDraftId`만 서버에서 삭제·전송한다. 다른 임시저장은 목록에 남긴다.
    - 전송/새로 작성 후 `activeDraftId`가 비면 최신 임시저장을 폼에 자동 주입하지 않는다(연속 전송 방지). 목록 클릭으로만 이어서 작성.
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
  - 채팅 첨부 백그라운드 업로드: `src/shared/hooks/useBackgroundTempUpload.ts`
    + `src/shared/components/upload/BackgroundUploadList.tsx`
  - 채팅 role 라벨/뱃지 표시에서는 레거시 `practice` role을 `의뢰자`로 매핑합니다(치과는 requestorCapabilities.practice).
  - 페이지 반영 지점:
    - `src/pages/practice/PracticeFileTransferPage.tsx`
    - `src/pages/requestor/practice/RequestorPracticePage.tsx`
    - `src/pages/admin/credits/hooks/useAdminCreditPage.ts`
    - `src/pages/admin/AdminPaymentsPage.tsx`
    - `src/shared/components/CreditLedgerModal.tsx`
    - `src/shared/components/AbutmentDesignLedgerDetailDialog.tsx`
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
  - 원장 `GET /api/manufacturer/credits/ledger`는 생산·배송 EARN을 **KST 하루 1행**으로 묶어 반환한다. 목록에서 유형은 생략. 상세(`mailboxGroups`)는 의뢰/배송 섹션으로 나누고, 그 안에서 수취자(우편함)별 생산·발송·배송비. 지급/조정은 별행.
  - 백엔드 `GET /api/manufacturer/credits/daily-summary`는 `LedgerLine` 집계 결과를 반환하며, 프론트는 해당 응답을 SSOT로 사용합니다.
  - 건수 필드(`earnRequest*Count`, `earnShipping*Count`)는 의뢰/패키지 `refId` 유니크이며, 라인·저널 수가 아니다.
  - 의뢰/배송 금액은 공급가 필드를 우선 표시. paid/free 분해는 `earnRequestPaid*` 등 SSOT.
  - 분해 필드 누락/합계 불일치 시 행을 화면에서 제외하고 오류 토스트/배너로 예외를 노출합니다.
  - 운영자 확인은 관리자 대시보드의 `systemAlerts` 경고를 통해 추적합니다.

- API 호출은 `src/shared/api/apiClient.ts`의 `apiFetch`를 우선 사용합니다.
- 서버 상태는 TanStack Query, 전역 UI 상태는 `src/store`를 사용합니다.
- 파일 드롭은 개별 구현보다 공통 컴포넌트 재사용을 우선합니다.
  - 페이지 전역: `@/features/requests/components/PageFileDropZone`
  - 요소(카드/첨부 UI) 클릭+로컬 드롭: `@/shared/components/practice/PracticeTransferFileDropTarget`
  - 치과 intake 첨부 UI: `@/shared/components/practice/PracticeTransferFilePane` (DropTarget 래핑, 카드에 사전 업로드 프로그레스바)
  - 드롭 파일 추출: `@/shared/files/extractDroppedFiles.ts`
  - 확장자 SSOT: `@/shared/practice/practiceTransferAccept.ts`
- UI에서 `requestId`는 서버 문자열을 그대로 표시합니다.

## 3. 정리 원칙

- 루트와 중복되는 정책은 여기 다시 쓰지 않습니다.
- 특정 화면 UX나 과거 리팩터링 기록은 가능한 한 코드 근처로 옮기고, 이 문서에는 남기지 않습니다.
- 새 규칙이 여러 역할/여러 페이지에 걸치면 루트 `rules.md`를 먼저 수정합니다.
