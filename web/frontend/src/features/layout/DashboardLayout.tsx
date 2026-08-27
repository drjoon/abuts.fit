import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { AdminPeriodDateFilter } from "@/shared/ui/AdminPeriodDateFilter";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { normalizeLastDashboardPath } from "@/shared/navigation/lastDashboardPath";
import {
  DEFAULT_SIDEBAR_OPEN,
  normalizeSidebarOpen,
} from "@/shared/layout/sidebarOpen";
import { cn } from "@/shared/ui/cn";

// - 2026-08-28: 사이드바 토글 UI를 로컬 오버라이드로 유지(/me 레이스·스토어 덮어쓰기 방지). 접기 버튼 z-index.
// - 2026-08-27: 데스크톱 사이드바 펼침을 계정 preferences.sidebarOpen으로 서버 저장·복원(기본 open). 모바일 드로어는 분리.
// - 2026-08-25: 기공의뢰수신(lab) 캘린더는 fillHeight 복구. 사이드 aside에 shrink-0·min-w로 펼침 폭 고정.
// - 2026-08-24: 작업영역 하단 여백 — 일반 페이지는 min-h-full 문서 흐름(+pb-12), credits/payments만 fillHeight 고정.
// - 2026-08-23: 치과 사이드 — 스토어를 정산 위로.
// - 2026-08-23: 작업영역 스크롤바 — 둥근 카드는 overflow clip, 안쪽 직사각 스크롤로 카드 오른쪽 끝에 붙이고 콘텐츠 여백은 상·하·좌·우 동일.
// - 2026-08-22: 치과·기공소 사이드바 크레딧 → 정산 라벨.
// - 2026-08-22: 치과 사이드 — 크레딧 아래「스토어」(/dashboard/store).
// - 2026-08-21: 기공소(requestor lab) 사이드 고스트「정산」제거(클릭 시 /dashboard 이탈).
// - 2026-08-21: 기공소·어벗츠기공소 기공의뢰 하위 — 치과로부터 수신 / 어벗츠로 의뢰.
// - 2026-08-20: 관리자 포함 전 롤 사이드를 DashboardSidebarNav로 통일. 접히면 아이콘·툴팁·배지.
// - 2026-08-20: 모바일 작업영역 흰 카드 min-w-0·p-3로 좌우 잘림 완화.
// - 2026-08-20: 구강스캔으로·어벗디자인으로 사이드 아이콘. 접힌 레일에서도 클릭.
// - 2026-08-20: 데스크톱 사이드 닫힘 — 아이콘 레일(w-24) 유지. 모바일만 화면 밖으로 숨김.
// - 2026-08-19: 기공의뢰수신 작업영역 — 흰 카드 외곽·바깥 여백 제거해 캘린더를 넓게.
// - 2026-08-19: 기공소 사이드 — 가입 이유 배너를 설정과 계정 팝업 사이.
// - 2026-08-19: 기공소·어벗츠기공소 사이드 — 대시보드/대기보드 제거. 기공의뢰 그룹(수신·어벗생산의뢰).
// - 2026-08-19: 펼친 사이드 메인 메뉴는 아이콘 왼쪽·라벨 가운데. 배지는 우측 고정. 라벨은 줄이지 않음.
// - 2026-08-19: 구강스캔으로 툴팁 — 디자인+생산 구강지그 제외.
// - 2026-08-18: 치과 사이드 — 대시보드 제거. 어벗디자인 헤더가 기간·출고·지난의뢰·불완전가공.
// - 2026-08-18: 치과 사이드 — 기공의뢰 메인 + 구강스캔으로/어벗디자인으로 서브.
// - 2026-08-18: 치과 사이드 — 기공의뢰 그룹 아래 구강스캔/어벗디자인 서브(관리자 섹션과 동일).
// - 2026-08-18: 계정 뱃지 salesman=딜러, admin=관리자 (USER_ROLE_LABEL).
// - 2026-08-17: 관리자 설정 그룹에「사업영역」(플랫폼 설정 아래).
// - 2026-08-17: (레거시) 기공소·어벗츠기공소·개발운영사 사이드에 정산 복구 — 기공소(requestor)는 2026-08-21 제거.
// - 2026-08-17: unread-updated 이벤트는 lab 수신 배지 조회 가능할 때만 반영(치과 유령 배지 방지).
// - 2026-08-17: 접힌 사이드바에도 practice-transfers/lab-work 미확인 배지 표시.
// - 2026-08-17: 어벗츠기공소「기공의뢰수신」(/lab-work)에도 수신 미확인·채팅 사이드 배지.
// - 2026-08-17: 치과「기공의뢰」배지 — 수신 미확인(received-unread) 제외, lab「기공의뢰수신」만 합산.
// - 2026-08-17: 어벗츠기공소 사이드 — 대기보드·기공의뢰수신·어벗생산의뢰·크레딧·설정.
// - 2026-08-15: 어벗츠기공소 사이드 — 기공의뢰수신·설정 2메뉴(대시보드·어벗디자인·정산 제거).
// - 2026-08-15: 모드 전환은 치과 기공의뢰 카드로 이전(사이드바 제거).
// - 2026-08-14: 기공소 신규 기공비 → 관리자 토스트·플랫폼 설정 배지.
// - 2026-08-19: 수락 시 미설정이면 설정 탭 포워드·안내 모달.
// - 2026-08-13: 파트너 페이지 → 관리자「플랫폼 설정」이전. 개발운영사 파트너 메뉴 제거. 설정 그룹(플랫폼 설정·설정).
// - 2026-08-11: 개발운영사·관리자 사이드·라우트에서 소개 제거(영업자만 유지).
// - 2026-08-11: 의뢰자 사이드·라우트에서 소개 제거(소개 할인 정책 종료).
// - 2026-08-11: 작업영역(흰 카드)이 outlet 높이를 채우도록 — 충전 탭 수직 중앙·내역 테이블 스크롤 고정.
// - 2026-08-16: 잔액 < 50만원이면 사이드바 크레딧에 깜빡이는 충전 뱃지·클릭 시 ?tab=charge.
// - 2026-08-11: 잔액 < 충전단위면 사이드바 크레딧에 깜빡이는 충전 뱃지·클릭 시 ?tab=charge.
// - 2026-08-11: 의뢰자 사이드바에 크레딧 메뉴 추가. 충전 토스트 CTA → /dashboard/credits?tab=charge.
// - 2026-08-11: 기공/어벗 사이드 — 버튼 그라데이션 제거, 가로 연결선만 적용.
// - 2026-08-11: 기공의뢰/기공의뢰수신 사이드 툴팁에 커스텀어벗 디자인 포함.
// - 2026-08-11: 기공소 사이드 — 의뢰수신 → 기공의뢰수신.
// - 2026-08-11: 기공의뢰/기공의뢰수신·어벗의뢰 사이드 메뉴에 기공/어벗 그라데이션 액센트 적용.
// - 2026-08-11: 의뢰자 사이드 — 디자인 메뉴/페이지 삭제·의뢰수신 통합. 기공의뢰/기공의뢰수신↑·어벗의뢰↓.
// - 2026-08-10: 의뢰자·치과 사이드메뉴에서 소개 제거.
// - 2026-08-10: 의뢰자 사이드메뉴를 kind별로 분기 — practice(디자인 제외·유료게이트), lab(디자인·무게이트).
// - 2026-08-10: 의뢰자 역할 뱃지를 requestorKind에 따라 의뢰자·치과 / 의뢰자·기공소로 표기.
// - 2026-08-09: 모든 role 최근 사이드바 경로를 계정 디폴트 진입점으로 서버 저장·복원. `/dashboard` 홈 클릭 시 last path pin.
// - 2026-08-09: 제조사 사이드메뉴 가공작업→생산.
// - 2026-08-09: 제조사 사이드메뉴 디자인 추가·작업→가공작업. 계정별 최근 대시보드 경로 서버 저장. 디자인은 상단 기간필터 헤더만.
// - 2026-08-08: 미확인 배지 초기 API는 토큰당 1회만. 가시성 refetch 제거(소켓만 갱신).
// - 2026-08-08: 기공의뢰서 미확인 배지를 30s 폴링 → 소켓(practice:transfer-*)로 전환.
// - 2026-08-05: 사이드바 계정 팝업에서 같은 사업자 동료 계정으로 비밀번호 확인 후 전환(모든 role).
// - 2026-08-05: 설정 메뉴를 계정 드롭다운에서 사이드바 맨 아래 항목으로 복원(모든 role 공통). 관리자 보안은 계정 드롭다운에 유지.
// - 2026-08-05: 문의 메뉴를 계정 드롭다운에서 사이드바 맨 아래 항목으로 복원(requestor/salesman/practice/admin). manufacturer·devops는 제외.
// - 2026-08-04: 치과(practice) 문의/설정도 사이드메뉴에서 제거하고 하단 계정 드롭다운으로 이동.
// - 2026-08-04: 의뢰자/영업자/개발운영사/제조사도 문의·설정을 사이드메뉴에서 제거하고 하단 계정 드롭다운으로 이동. 미사용 ManufacturerDashboardPage 참조 정리.
// - 2026-08-04: 관리자 사이드메뉴에서 보안/설정을 제거하고 하단 계정 드롭다운으로 이동.
// - 2026-08-03: Dashboard 상단 워크시트 공정 탭의 '의뢰' 라벨을 '준비'로 변경(표시 레벨). wsSummary 조회/표시 로직과 연동됨.
// related files:
// - web/frontend/src/features/layout/AccountSwitcher.tsx
// - web/frontend/src/features/settings/LabFeeSetupPrompt.tsx
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/shared/layout/sidebarOpen.ts
// - web/frontend/src/shared/navigation/lastDashboardPath.ts
// - web/backend/controllers/users/user.controller.js
// - web/backend/utils/sidebarOpen.util.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/modules/auth/auth.routes.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/design/DesignPage.tsx
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/features/layout/DashboardSidebarNav.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { LabFeeSetupPrompt } from "@/features/settings/LabFeeSetupPrompt";
import { LabDashboardTopBanners } from "@/features/lab/LabDashboardTopBanners";
import { getRequestorRoleBadgeLabel } from "@/shared/business/requestorCapabilities";
import { getAppUserRoleLabel } from "@/shared/types/role";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  MessageSquare,
  Mail,
  Send,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  PanelLeftOpen,
  PanelLeft,
  Users,
  Building2,
  Wallet,
  Shield,
  ClipboardList,
  Printer,
  Search,
  Share2,
  Clock,
  Boxes,
  Package,
  CheckCircle,
  SlidersHorizontal,
  Layers,
  ScanLine,
  PenTool,
  Store,
} from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { useChatRooms } from "@/shared/hooks/useChatRooms";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import {
  AccountSwitcherMenuSection,
  AccountSwitchPasswordDialog,
  type ColleagueAccount,
} from "@/features/layout/AccountSwitcher";
import {
  DashboardSidebarNav,
  sidebarItemPath,
  type DashboardSidebarItem,
  type DashboardSidebarSection,
} from "@/features/layout/DashboardSidebarNav";

/** DashboardLayout StrictMode remount에도 토큰당 unread 시드 API 1회만 */
const practiceUnreadSeededTokens = new Set<string>();

type SidebarItem = DashboardSidebarItem;

/** 사이드바 충전 뱃지 임계(공급가). 충전 단위(기공소 50만/치과 100만)와 별개. */
const CREDIT_LOW_BALANCE_THRESHOLD = 500_000;
const CREDITS_HREF = "/dashboard/credits";
const CREDITS_CHARGE_HREF = "/dashboard/credits?tab=charge";
const STORE_HREF = "/dashboard/store";

const requestorSidebarCommonTail: SidebarItem[] = [
  { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
  { icon: Settings, label: "설정", href: "/dashboard/settings" },
];

const ABUTMENT_REQUEST_TOOLTIP =
  "커스텀어벗 디자인을 올려서 CNC 생산 의뢰";
const PRACTICE_ORAL_SCAN_HREF = "/dashboard/practice-transfers?mode=send";
const PRACTICE_ABUTMENT_DESIGN_HREF = "/dashboard/new-request";
const LAB_RECEIVE_HREF = "/dashboard/practice-transfers?mode=receive";
const INTERNAL_LAB_RECEIVE_HREF = "/dashboard/lab-work";
const LAB_ABUTMENT_PRODUCTION_HREF = "/dashboard/new-request";
const PRACTICE_ORAL_SCAN_REQUEST_TOOLTIP =
  "구강스캔으로 커스텀어벗 디자인+생산(구강지그 제외), 임시치아·지르 보철 의뢰";
const PRACTICE_ABUTMENT_DESIGN_REQUEST_TOOLTIP =
  "완성된 어벗 디자인(STL)으로 CNC 생산 의뢰";
const LAB_RECEIVE_TOOLTIP =
  "구강스캔 파일을 받아서 인레이, 크라운, 브리지, 커스텀어벗 디자인 등 보철 기공 처리";

const buildLabGigongRequestSidebarGroup = (
  receiveHref: string,
  receiveTooltip = LAB_RECEIVE_TOOLTIP,
): SidebarItem => ({
  icon: Building2,
  label: "기공의뢰",
  href: receiveHref,
  tooltip: "치과 기공의뢰 수신과 어벗 CNC 생산 의뢰",
  children: [
    {
      icon: Building2,
      label: "치과로부터 수신",
      href: receiveHref,
      tooltip: receiveTooltip,
      accent: "기공",
    },
    {
      icon: FileText,
      label: "어벗츠로 의뢰",
      href: LAB_ABUTMENT_PRODUCTION_HREF,
      tooltip: ABUTMENT_REQUEST_TOOLTIP,
      accent: "어벗",
    },
  ],
});

const buildRequestorSidebarItems = (
  kind: "practice" | "lab" | null,
): SidebarItem[] => {
  if (kind === "lab") {
    return [
      buildLabGigongRequestSidebarGroup(LAB_RECEIVE_HREF),
      { icon: Wallet, label: "정산", href: CREDITS_HREF },
      ...requestorSidebarCommonTail,
    ];
  }

  return [
    {
      icon: Building2,
      label: "기공의뢰",
      href: PRACTICE_ORAL_SCAN_HREF,
      tooltip: "구강스캔 또는 완성 디자인으로 기공 의뢰",
      children: [
        {
          icon: ScanLine,
          label: "구강스캔으로",
          href: PRACTICE_ORAL_SCAN_HREF,
          tooltip: PRACTICE_ORAL_SCAN_REQUEST_TOOLTIP,
          accent: "기공",
        },
        {
          icon: PenTool,
          label: "어벗디자인으로",
          href: PRACTICE_ABUTMENT_DESIGN_HREF,
          tooltip: PRACTICE_ABUTMENT_DESIGN_REQUEST_TOOLTIP,
          accent: "어벗",
        },
      ],
    },
    { icon: Store, label: "스토어", href: STORE_HREF },
    { icon: Wallet, label: "정산", href: CREDITS_HREF },
    ...requestorSidebarCommonTail,
  ];
};

const sidebarItems = {
  requestor: buildRequestorSidebarItems("practice"),
  salesman: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: Share2, label: "소개", href: "/dashboard/referral-groups" },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  devops: [
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  practice: [
    {
      icon: LayoutDashboard,
      label: "기공의뢰",
      href: "/practice/dashboard",
      accent: "기공",
    },
    { icon: MessageSquare, label: "문의", href: "/practice/inquiries" },
    { icon: Settings, label: "설정", href: "/practice/settings" },
  ],
  manufacturer: [
    { icon: ClipboardList, label: "생산", href: "/dashboard/worksheet" },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  internalLab: [
    buildLabGigongRequestSidebarGroup(
      INTERNAL_LAB_RECEIVE_HREF,
      "어벗츠기공소 기공의뢰 수신·작업",
    ),
    { icon: Wallet, label: "크레딧", href: CREDITS_HREF },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: Building2, label: "사업자", href: "/dashboard/businesses" },
    { icon: Users, label: "사용자", href: "/dashboard/users" },
    { icon: Wallet, label: "크레딧", href: "/dashboard/credits" },
    {
      icon: FileText,
      label: "의뢰",
      href: "/dashboard/monitoring",
    },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: Wallet, label: "정산 배치", href: "/dashboard/settlement-batches" },
    { icon: FileText, label: "세금계산서", href: "/dashboard/tax-invoices" },
    { icon: Store, label: "스토어", href: "/dashboard/store-admin" },
    {
      icon: MessageSquare,
      label: "채팅",
      href: "/dashboard/chat-management",
    },
    {
      icon: Send,
      label: "메시지",
      href: "/dashboard/sms",
    },
    {
      icon: Mail,
      label: "메일",
      href: "/dashboard/mail",
    },
    {
      icon: MessageSquare,
      label: "문의",
      href: "/dashboard/inquiries",
    },
    { icon: SlidersHorizontal, label: "플랫폼 설정", href: "/dashboard/platform-settings" },
    { icon: Layers, label: "사업영역", href: "/dashboard/partners" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  labTeam: [{ icon: Settings, label: "설정", href: "/dashboard/settings" }],
  salesTeam: [{ icon: Settings, label: "설정", href: "/dashboard/settings" }],
} as const;

const accountMenuItemsByRole: Record<string, SidebarItem[]> = {
  admin: [
    { icon: Shield, label: "보안", href: "/dashboard/security-settings" },
  ],
};

type UserProfileApiResponse = {
  data?: {
    profileImage?: string;
  };
  profileImage?: string;
};

type CreditBalanceApiResponse = {
  data?: {
    balance?: number;
    spendableBalance?: number;
    paidCredit?: number;
    freeRequestCredit?: number;
    freeShippingCredit?: number;
    settlementCredit?: number;
  };
  balance?: number;
  spendableBalance?: number;
  paidCredit?: number;
  freeRequestCredit?: number;
  freeShippingCredit?: number;
  settlementCredit?: number;
};

type SpendInsightsApiResponse = {
  data?: {
    avgDailySpendSupply?: number;
    estimatedDaysFor500k?: number;
  };
  avgDailySpendSupply?: number;
  estimatedDaysFor500k?: number;
};

type WorksheetSummaryResponse = {
  success?: boolean;
  data?: {
    requestCount?: number;
    camCount?: number;
    machiningCount?: number;
    packingCount?: number;
    shippingCount?: number;
    shippingBoxes?: number;
    trackingCount?: number;
    trackingBoxes?: number;
    rndCount?: number;
    unmachinableCount?: number;
  };
};

const adminSidebarSections: DashboardSidebarSection[] = [
  {
    title: "운영",
    items: [
      { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
      { icon: Building2, label: "사업자", href: "/dashboard/businesses" },
      { icon: Users, label: "사용자", href: "/dashboard/users" },
    ],
  },
  {
    title: "재무",
    items: [
      { icon: Wallet, label: "크레딧", href: "/dashboard/credits" },
      { icon: Wallet, label: "정산", href: "/dashboard/payments" },
      { icon: FileText, label: "세금계산서", href: "/dashboard/tax-invoices" },
    ],
  },
  {
    title: "소통",
    items: [
      { icon: FileText, label: "의뢰", href: "/dashboard/monitoring" },
      {
        icon: MessageSquare,
        label: "채팅",
        href: "/dashboard/chat-management",
      },
      { icon: Send, label: "메시지", href: "/dashboard/sms" },
      { icon: Mail, label: "메일", href: "/dashboard/mail" },
      { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    ],
  },
  {
    title: "설정",
    items: [
      {
        icon: SlidersHorizontal,
        label: "플랫폼 설정",
        href: "/dashboard/platform-settings",
      },
      { icon: Layers, label: "사업영역", href: "/dashboard/partners" },
      { icon: Settings, label: "설정", href: "/dashboard/settings" },
    ],
  },
];

const getRoleLabel = (
  role: string,
  requestorKind?: "practice" | "lab" | null,
) => {
  if (role === "requestor") return getRequestorRoleBadgeLabel(requestorKind);
  if (role === "practice") {
    return getRequestorRoleBadgeLabel(requestorKind ?? "practice");
  }
  return getAppUserRoleLabel(role);
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "requestor":
      return "default";
    case "salesman":
      return "secondary";
    case "devops":
      return "secondary";
    case "manufacturer":
      return "secondary";
    case "internalLab":
      return "secondary";
    case "labTeam":
      return "secondary";
    case "salesTeam":
      return "secondary";
    case "practice":
      return "default";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

export const DashboardLayout = () => {
  const { user, logout, token, loginWithToken, setLastDashboardPath, setSidebarOpen } =
    useAuthStore();
  const {
    period,
    setPeriod,
    customStartDate,
    customEndDate,
    setCustomDateRange,
    clearCustomDateRange,
  } = usePeriodStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [paidCredit, setPaidCredit] = useState<number | null>(null);
  const [freeRequestCredit, setFreeRequestCredit] = useState<number | null>(
    null,
  );
  const [freeShippingCredit, setFreeShippingCredit] = useState<number | null>(
    null,
  );
  const [settlementCredit, setSettlementCredit] = useState<number | null>(null);
  const [loadingCreditBalance, setLoadingCreditBalance] = useState(false);
  /** 토글 직후 /me 등이 스토어를 덮어도 데스크톱 접힘 UI는 유지 */
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean | null>(
    null,
  );
  const sidebarOpen = normalizeSidebarOpen(
    desktopSidebarOpen ?? user?.sidebarOpen ?? DEFAULT_SIDEBAR_OPEN,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showExpandedChrome = sidebarOpen || mobileNavOpen;
  const sidebarCollapsed = !showExpandedChrome;
  const [worksheetSearch, setWorksheetSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [bootstrappingAuth, setBootstrappingAuth] = useState(false);
  const [bootstrappedOnce, setBootstrappedOnce] = useState(false);
  const [sidebarProfileImage, setSidebarProfileImage] = useState<string>("");
  const [pendingBusinessName, setPendingBusinessName] = useState<string | null>(
    null,
  );
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [switchColleague, setSwitchColleague] =
    useState<ColleagueAccount | null>(null);
  const [requestorPracticeUnreadCount, setRequestorPracticeUnreadCount] =
    useState(0);
  const [abutsFeePendingCount, setAbutsFeePendingCount] = useState(0);
  const { rooms: chatRooms } = useChatRooms();
  const {
    canUsePaid: requestorCanUsePaid,
    kind: requestorKind,
    loading: requestorAccessLoading,
  } = useRequestorBusinessAccess();

  const isWizardRoute = location.pathname.startsWith("/dashboard/wizard");
  const isPracticeUser = Boolean(user?.role === "practice");
  const onboardingCompleted = Boolean(
    user?.onboardingWizardCompleted || user?.businessVerified,
  );
  const shouldForceOnboarding =
    user?.role !== undefined &&
    [
      "requestor",
      "practice",
      "salesman",
      "manufacturer",
      "admin",
      "devops",
    ].includes(user?.role);

  // 계정별 최근 대시보드 경로 서버 저장 (pathname + search)
  const persistLastDashboardPath = useCallback(
    (rawPath: string) => {
      if (!token || !user?.id) return;
      const nextPath = normalizeLastDashboardPath(rawPath);
      if (!nextPath) return;
      if (nextPath === user.lastDashboardPath) return;
      setLastDashboardPath(nextPath);
      void apiFetch({
        path: "/api/users/last-dashboard-path",
        method: "PUT",
        token,
        jsonBody: { path: nextPath },
      }).catch(() => {
        // 저장 실패는 UX를 막지 않음
      });
    },
    [setLastDashboardPath, token, user?.id, user?.lastDashboardPath],
  );

  useEffect(() => {
    if (!token || !user?.id) return;
    if (isWizardRoute) return;
    if (!onboardingCompleted && shouldForceOnboarding) return;

    const nextPath = normalizeLastDashboardPath(
      `${location.pathname}${location.search}`,
    );
    if (!nextPath) return;
    if (nextPath === user.lastDashboardPath) return;

    const timer = window.setTimeout(() => {
      persistLastDashboardPath(nextPath);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    isWizardRoute,
    location.pathname,
    location.search,
    onboardingCompleted,
    persistLastDashboardPath,
    shouldForceOnboarding,
    token,
    user?.id,
    user?.lastDashboardPath,
  ]);

  /** 사이드바 이동. `/dashboard` 홈은 last path를 먼저 pin해 허브 리다이렉트와 충돌하지 않게 한다. */
  const goSidebarHref = useCallback(
    (href: string) => {
      if (href === "/dashboard") {
        persistLastDashboardPath("/dashboard");
      }
      navigate(href);
      setMobileNavOpen(false);
    },
    [navigate, persistLastDashboardPath],
  );

  /** 데스크톱 접기/펼치기 아이콘 — 의도적 변경만 서버 저장 */
  const persistSidebarOpen = useCallback(
    (nextOpen: boolean) => {
      const open = normalizeSidebarOpen(nextOpen);
      setDesktopSidebarOpen(open);
      setSidebarOpen(open);
      if (!token || !user?.id) return;
      void apiFetch({
        path: "/api/users/sidebar-open",
        method: "PUT",
        token,
        jsonBody: { open },
      }).catch(() => {
        // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
      });
    },
    [setSidebarOpen, token, user?.id],
  );

  useEffect(() => {
    setDesktopSidebarOpen(null);
  }, [user?.id]);

  useEffect(() => {
    if (!token) return;
    if (!user || !user.id) return;
    if (!shouldForceOnboarding) return;
    if (isWizardRoute) return;
    if (onboardingCompleted) return;

    navigate("/dashboard/wizard?mode=account", { replace: true });
  }, [
    isWizardRoute,
    navigate,
    onboardingCompleted,
    shouldForceOnboarding,
    token,
    user,
  ]);
  useEffect(() => {
    if (bootstrappedOnce) return;
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    if (!user || !user.id) {
      setBootstrappingAuth(true);
      loginWithToken(token)
        .then((result) => {
          if (
            result.status === "unauthorized" &&
            useAuthStore.getState().token === token
          ) {
            logout();
            navigate("/login", { replace: true });
          }
        })
        .finally(() => {
          setBootstrappingAuth(false);
          setBootstrappedOnce(true);
        });
      return;
    }

    setBootstrappedOnce(true);
    if (user.role === "admin") return;
    loginWithToken(token).then((result) => {
      if (
        result.status === "unauthorized" &&
        useAuthStore.getState().token === token
      ) {
        logout();
        navigate("/login", { replace: true });
      }
    });
  }, [bootstrappedOnce, loginWithToken, logout, navigate, token, user]);

  useEffect(() => {
    if (!token || !user || !user.id) return;
    if (isWizardRoute) return;
    if (!onboardingCompleted) return;
    if (isPracticeUser) return;
    if (user.role !== "requestor" && user.role !== "manufacturer") return;
    if (user.businessVerified) return;

    const businessType = resolveBusinessType(user.role);
    if (!businessType) return;

    loadBusinessMeCached({ token, businessType })
      .then((data) => {
        const membership = String(data?.membership || "");
        if (membership === "pending") {
          const name = String(
            data?.business?.name || data?.business?.companyName || "",
          ).trim();
          setPendingBusinessName(name || "사업자");
        } else {
          setPendingBusinessName(null);
        }
      })
      .catch(() => {});
  }, [token, user, isPracticeUser, isWizardRoute, onboardingCompleted]);



  const refreshSidebarProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<UserProfileApiResponse>({
        path: "/api/users/profile",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const body = res.data || {};
      const data = body.data || body;
      setSidebarProfileImage(String(data?.profileImage || "").trim());
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refreshSidebarProfile();
  }, [refreshSidebarProfile, token, user?.id]);

  useEffect(() => {
    const onProfileUpdated = () => {
      void refreshSidebarProfile();
    };
    window.addEventListener("abuts:profile:updated", onProfileUpdated);
    return () => {
      window.removeEventListener("abuts:profile:updated", onProfileUpdated);
    };
  }, [refreshSidebarProfile]);

  // 수신 미확인: lab requestor「기공의뢰수신」+ internalLab「기공의뢰수신」(/lab-work).
  // 치과「기공의뢰」에는 합산하지 않는다(최근 전송과 배지 불일치 방지).
  const canFetchRequestorPracticeUnread =
    Boolean(token) &&
    Boolean(user) &&
    !isPracticeUser &&
    (user?.role === "internalLab" ||
      (user?.role === "requestor" && requestorKind === "lab"));

  const fetchRequestorPracticeUnreadCount = useCallback(async () => {
    if (!canFetchRequestorPracticeUnread || !token) {
      setRequestorPracticeUnreadCount(0);
      return;
    }

    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/received-unread-count",
        method: "GET",
        token,
      });
      if (!res.ok) {
        setRequestorPracticeUnreadCount(0);
        return;
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as Record<string, unknown>)
          : {};
      const data =
        body.data && typeof body.data === "object"
          ? (body.data as Record<string, unknown>)
          : body;
      const nextCount = Math.max(0, Number(data.unreadCount || 0));
      setRequestorPracticeUnreadCount(nextCount);
    } catch {
      setRequestorPracticeUnreadCount(0);
    }
  }, [canFetchRequestorPracticeUnread, token]);

  const fetchCreditBalance = useCallback(async () => {
    if (!token) return;
    if (!user) return;
    if (isPracticeUser || (user.role !== "requestor" && user.role !== "internalLab")) {
      setCreditBalance(null);
      setPaidCredit(null);
      setFreeRequestCredit(null);
      setFreeShippingCredit(null);
      return;
    }
    if (!user.businessAnchorId) {
      setCreditBalance(null);
      setPaidCredit(null);
      setFreeRequestCredit(null);
      setFreeShippingCredit(null);
      return;
    }

    const shouldShowLoading =
      creditBalance === null &&
      paidCredit === null &&
      freeRequestCredit === null &&
      freeShippingCredit === null &&
      settlementCredit === null;

    if (shouldShowLoading) {
      setLoadingCreditBalance(true);
    }

    try {
      const res = await apiFetch<CreditBalanceApiResponse>({
        path: "/api/credits/balance",
        method: "GET",
        token,
      });
      if (!res.ok) {
        setCreditBalance(null);
        setPaidCredit(null);
        setFreeRequestCredit(null);
        setFreeShippingCredit(null);
        setSettlementCredit(null);
        return;
      }
      const body = res.data || {};
      const data = body.data || body;
      const paid = Number(data?.paidCredit ?? 0);
      const freeReq = Number(data?.freeRequestCredit ?? 0);
      const freeShip = Number(data?.freeShippingCredit ?? 0);
      const settlement = Number(data?.settlementCredit ?? 0);
      const spendable = Number(
        data?.spendableBalance ??
          data?.balance ??
          paid + freeReq + freeShip + settlement,
      );
      setCreditBalance(spendable);
      setPaidCredit(paid);
      setFreeRequestCredit(freeReq);
      setFreeShippingCredit(freeShip);
      setSettlementCredit(settlement);
    } catch {
      setCreditBalance(null);
      setPaidCredit(null);
      setFreeRequestCredit(null);
      setFreeShippingCredit(null);
      setSettlementCredit(null);
    } finally {
      if (shouldShowLoading) {
        setLoadingCreditBalance(false);
      }
    }
  }, [
    creditBalance,
    freeRequestCredit,
    freeShippingCredit,
    isPracticeUser,
    paidCredit,
    settlementCredit,
    token,
    user,
  ]);

  useEffect(() => {
    fetchCreditBalance();
  }, [fetchCreditBalance]);

  // StrictMode remount에도 토큰당 초기 조회 1회만 (세션 시드용). 이후는 소켓·커스텀 이벤트.
  // kind가 lab↔practice로 바뀌면 시드를 지워 재조회·치과 전환 시 카운트 0 처리.
  useEffect(() => {
    if (!canFetchRequestorPracticeUnread || !token) {
      setRequestorPracticeUnreadCount(0);
      if (token) practiceUnreadSeededTokens.delete(token);
      return;
    }
    if (practiceUnreadSeededTokens.has(token)) return;
    practiceUnreadSeededTokens.add(token);
    void fetchRequestorPracticeUnreadCount();
  }, [canFetchRequestorPracticeUnread, fetchRequestorPracticeUnreadCount, token]);

  useAppEventListener({
    enabled: canFetchRequestorPracticeUnread,
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    deferWhenEditing: false,
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const unreadCount = Number(payload.unreadCount);
      if (Number.isFinite(unreadCount) && unreadCount >= 0) {
        setRequestorPracticeUnreadCount(unreadCount);
        return;
      }
      // unreadCount 없는 이벤트(일부 cancel fan-out 등)는 1회 보정 조회
      void fetchRequestorPracticeUnreadCount();
    },
  });

  useEffect(() => {
    const onUnreadUpdated = (evt: Event) => {
      if (!canFetchRequestorPracticeUnread) return;
      const custom = evt as CustomEvent<{ unreadCount?: unknown }>;
      const maybeCount = Number(custom.detail?.unreadCount);
      if (Number.isFinite(maybeCount) && maybeCount >= 0) {
        setRequestorPracticeUnreadCount(maybeCount);
      }
      // count 없으면 무시 — 시드/소켓이 SSOT. 불필요 API 재호출 방지.
    };

    window.addEventListener(
      "abuts:practice-transfers:unread-updated",
      onUnreadUpdated,
    );
    return () => {
      window.removeEventListener(
        "abuts:practice-transfers:unread-updated",
        onUnreadUpdated,
      );
    };
  }, [canFetchRequestorPracticeUnread]);



  useAppEventDebouncedReload({
    enabled:
      Boolean(token) &&
      Boolean(user) &&
      !isPracticeUser &&
      (user?.role === "requestor" || user?.role === "internalLab") &&
      Boolean(user?.businessAnchorId),
    eventTypes: ["credit:balance-updated"],
    delayMs: 80,
    shouldHandle: (evt) => isCreditEventForBusiness(evt, user?.businessAnchorId),
    onMatch: () => {
      // silent refetch: 기존 값 유지 + loading 플래그 없이 /api/credits/balance 재조회
      void fetchCreditBalance();
    },
  });

  const isMockUser = Boolean(user.mockUserId);

  useEffect(() => {
    if (!user) return;
    if (isPracticeUser || user.role !== "requestor") return;
    if (user.approvedAt) return;
    if (isMockUser) return;
    if (location.pathname.startsWith("/dashboard")) {
      navigate("/signup?mode=social_complete", { replace: true });
    }
  }, [isMockUser, isPracticeUser, location.pathname, navigate, user]);

  useEffect(() => {
    if (!token) return;
    if (!user) return;
    if (isPracticeUser || user.role !== "requestor") return;
    if (!user.businessAnchorId) return;

    // 크레딧 안내는 신규 의뢰 흐름에서만 노출한다.
    // (설정/대시보드 등에서 자동 토스트가 뜨며 흐름을 방해하는 문제 방지)
    if (!location.pathname.startsWith("/dashboard/new-request")) return;

    const today = new Date();
    const yyyyMmDd = toKstYmd(today) || "";
    const storageKey = `abuts_credit_nudge:${String(user.id)}:${yyyyMmDd}`;

    try {
      if (localStorage.getItem(storageKey) === "1") return;
    } catch {
      // ignore
    }

    const params = new URLSearchParams(location.search);
    const isOnCreditCharge =
      (location.pathname.startsWith("/dashboard/credits") &&
        params.get("tab") === "charge") ||
      (location.pathname.startsWith("/dashboard/settings") &&
        params.get("tab") === "payment");

    if (isOnCreditCharge) {
      try {
        localStorage.setItem(storageKey, "1");
      } catch {
        // ignore
      }
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const [balanceRes, insightsRes] = await Promise.all([
          apiFetch<CreditBalanceApiResponse>({
            path: "/api/credits/balance",
            method: "GET",
            token,
          }),
          apiFetch<SpendInsightsApiResponse>({
            path: "/api/credits/insights/spend",
            method: "GET",
            token,
          }),
        ]);

        if (cancelled) return;
        if (!balanceRes.ok || !insightsRes.ok) return;

        const balanceData = balanceRes.data?.data || balanceRes.data;
        const insightsData = insightsRes.data?.data || insightsRes.data;

        const balance = Number(
          balanceData?.spendableBalance ?? balanceData?.balance ?? 0,
        );
        const avgDailySpendSupply = Number(
          insightsData?.avgDailySpendSupply || 0,
        );
        const estimatedDaysFor500k = insightsData?.estimatedDaysFor500k;
        const fallbackDailySpend =
          typeof estimatedDaysFor500k === "number" && estimatedDaysFor500k > 0
            ? 500000 / estimatedDaysFor500k
            : 0;

        const dailySpend =
          avgDailySpendSupply > 0 ? avgDailySpendSupply : fallbackDailySpend;

        if (balance <= 0) {
          try {
            localStorage.setItem(storageKey, "1");
          } catch {
            // ignore
          }

          toast({
            title: "크레딧 부족",
            description: "크레딧을 충전한 뒤 다시 시도해주세요.",
            variant: "destructive",
            duration: 5000,
            action: (
              <ToastAction
                altText="크레딧 충전하기"
                onClick={() => navigate("/dashboard/credits?tab=charge")}
              >
                충전하기
              </ToastAction>
            ),
          });
          return;
        }

        if (!(dailySpend > 0)) return;

        const estimatedDaysLeft = balance / dailySpend;
        if (!(estimatedDaysLeft <= 7)) return;

        try {
          localStorage.setItem(storageKey, "1");
        } catch {
          // ignore
        }

        toast({
          title: "크레딧이 부족할 수 있어요",
          description: "곧 크레딧이 소진될 수 있습니다. 미리 충전해주세요.",
          duration: 5000,
          action: (
            <ToastAction
              altText="크레딧 충전하기"
              onClick={() => navigate("/dashboard/credits?tab=charge")}
            >
              충전하기
            </ToastAction>
          ),
        });
      } catch {
        // ignore
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isPracticeUser, location.pathname, location.search, navigate, toast, token, user]);

  const effectiveSidebarRole = isPracticeUser
    ? "practice"
    : (user.role as keyof typeof sidebarItems);
  const baseMenuItems = (sidebarItems[effectiveSidebarRole] ||
    []) as unknown as SidebarItem[];
  const menuItems = (() => {
    if (user.role !== "requestor") return baseMenuItems;
    return buildRequestorSidebarItems(requestorKind);
  })();

  const isCreditLow =
    (user.role === "requestor" || user.role === "internalLab") &&
    typeof creditBalance === "number" &&
    Number.isFinite(creditBalance) &&
    creditBalance < CREDIT_LOW_BALANCE_THRESHOLD;

  const displayRole = isPracticeUser ? "practice" : user.role;
  const adminMenuSections = user.role === "admin" ? adminSidebarSections : null;
  const accountMenuItems = accountMenuItemsByRole[displayRole] || [];

  const { getBadgeForHref, clearBadgeForPath } = useAdminCommBadges();

  useEffect(() => {
    clearBadgeForPath(location.pathname);
  }, [location.pathname, clearBadgeForPath]);

  useEffect(() => {
    if (user.role !== "admin" || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{
          success?: boolean;
          data?: {
            pendingCount?: number;
            items?: Array<{ pendingReview?: boolean }>;
          };
        }>({
          path: "/api/admin/settings/abuts-lab-fee-schedule",
          method: "GET",
          token,
        });
        if (cancelled || !res.ok) return;
        const payload = res.data?.data;
        if (typeof payload?.pendingCount === "number") {
          setAbutsFeePendingCount(Math.max(0, payload.pendingCount));
          return;
        }
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setAbutsFeePendingCount(
          items.filter((item) => item.pendingReview === true).length,
        );
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user.role]);

  useAppEventListener({
    enabled: user.role === "admin",
    eventTypes: ["abuts-lab-fee:pending-items"],
    deferWhenEditing: false,
    onMatch: (evt) => {
      const data =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as {
              pendingCount?: number;
              labName?: string;
              items?: Array<{ name?: string }>;
            })
          : {};
      const count = Number(data.pendingCount);
      if (Number.isFinite(count) && count >= 0) {
        setAbutsFeePendingCount(count);
      } else {
        const added = Array.isArray(data.items) ? data.items.length : 1;
        setAbutsFeePendingCount((prev) => Math.max(0, prev + added));
      }
      const names = (Array.isArray(data.items) ? data.items : [])
        .map((item) => String(item?.name || "").trim())
        .filter(Boolean);
      const labLabel = String(data.labName || "기공소").trim() || "기공소";
      toast({
        title: "신규 기공비 검토",
        description:
          names.length > 0
            ? `${labLabel}에서 「${names.join(", ")}」을(를) 추가했습니다. 기본 기공수가에서 검증 후 On으로 적용하세요.`
            : `${labLabel}에서 신규 기공비를 추가했습니다. 기본 기공수가에서 검증 후 On으로 적용하세요.`,
        action: (
          <ToastAction
            altText="기본 기공수가 열기"
            onClick={() => {
              navigate("/dashboard/platform-settings?tab=abutsFees");
            }}
          >
            확인
          </ToastAction>
        ),
      });
    },
  });

  useEffect(() => {
    if (user.role !== "admin") return;
    const onPending = (evt: Event) => {
      const custom = evt as CustomEvent<{ pendingCount?: unknown }>;
      const next = Number(custom.detail?.pendingCount);
      if (Number.isFinite(next) && next >= 0) {
        setAbutsFeePendingCount(next);
      }
    };
    window.addEventListener("abuts:abuts-lab-fee-pending", onPending);
    return () => {
      window.removeEventListener("abuts:abuts-lab-fee-pending", onPending);
    };
  }, [user.role]);

  const resolvedMenuItems = (() => {
    if (!isCreditLow) return menuItems;
    return menuItems.map((item) => {
      if (sidebarItemPath(item.href) !== CREDITS_HREF) return item;
      return { ...item, href: CREDITS_CHARGE_HREF };
    });
  })();

  const requestorPracticeChatUnreadCount = useMemo(() => {
    if (user.role !== "requestor" && user.role !== "internalLab") return 0;
    return chatRooms.reduce((sum, room) => {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) return sum;
      return sum + Math.max(0, Number(room.unreadCount || 0));
    }, 0);
  }, [chatRooms, user.role]);

  const getSidebarBadgeCount = useCallback(
    (href: string) => {
      const path = sidebarItemPath(href);
      const adminCommBadge = Number(getBadgeForHref(path) || 0);
      const transferUnread = Math.max(0, Number(requestorPracticeUnreadCount || 0));
      const chatUnread = Math.max(0, Number(requestorPracticeChatUnreadCount || 0));
      if (path === "/dashboard/lab-work" && user.role === "internalLab") {
        return adminCommBadge + transferUnread + chatUnread;
      }
      if (
        path === "/dashboard/practice-transfers" &&
        user.role === "requestor"
      ) {
        // lab: 수신 미확인 + 채팅. practice(치과 발신): 채팅만.
        const labTransferUnread = requestorKind === "lab" ? transferUnread : 0;
        return adminCommBadge + labTransferUnread + chatUnread;
      }
      if (path === "/dashboard/platform-settings" && user.role === "admin") {
        return adminCommBadge + Math.max(0, abutsFeePendingCount);
      }
      return adminCommBadge;
    },
    [
      abutsFeePendingCount,
      getBadgeForHref,
      requestorKind,
      requestorPracticeChatUnreadCount,
      requestorPracticeUnreadCount,
      user.role,
    ],
  );

  const isManufacturer = user.role === "manufacturer";
  const isEquipmentRoute =
    location.pathname.startsWith("/dashboard/cnc") ||
    location.pathname.startsWith("/dashboard/printer");
  const isWorksheetRoute =
    isManufacturer && location.pathname.startsWith("/dashboard/worksheet");
  const isLabReceiveWorkArea =
    location.pathname.startsWith("/dashboard/lab-work") ||
    (location.pathname.startsWith("/dashboard/practice-transfers") &&
      requestorKind === "lab");
  const isPracticeOralScanWorkArea =
    location.pathname.startsWith("/dashboard/practice-transfers") &&
    requestorKind === "practice";
  // 충전·정산·기공의뢰수신·치과 구강스캔 캘린더 — 래퍼를 뷰포트 높이에 고정(중첩 스크롤).
  // 그 외(설정 등)는 문서 흐름으로 키워 하단 pb가 스크롤 끝에 보이게 함.
  const isFillHeightWorkArea =
    location.pathname.startsWith("/dashboard/credits") ||
    location.pathname.startsWith("/dashboard/payments") ||
    isLabReceiveWorkArea ||
    isPracticeOralScanWorkArea;
  const worksheetParams = new URLSearchParams(location.search);
  const worksheetType = worksheetParams.get("type") || "cnc";
  const worksheetStageRaw = worksheetParams.get("stage") || "request";
  // 작업 공정 변경: CAM 탭은 노출하지 않고 legacy URL(stage=cam)은 가공 탭으로 매핑한다.
  const worksheetStage = worksheetStageRaw === "cam" ? "machining" : worksheetStageRaw;

  // Worksheet summary data for header bar
  const { data: worksheetSummaryResponse, refetch: refetchWorksheetSummary } = useQuery({
    queryKey: ["worksheet-assigned-summary", period],
    enabled: Boolean(token) && isManufacturer && isWorksheetRoute,
    queryFn: async () => {
      const res = await apiFetch<WorksheetSummaryResponse>({
        path: `/api/requests/assigned/dashboard-summary?period=${period}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("요약 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: Infinity,
    refetchInterval:
      Boolean(token) && isManufacturer && isWorksheetRoute ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
  });

  const wsSummary = worksheetSummaryResponse?.success
    ? worksheetSummaryResponse.data
    : {};

  useAppEventDebouncedReload({
    enabled: Boolean(token) && isManufacturer && isWorksheetRoute,
    eventTypes: [
      "request:stage-changed",
      "request:delivery-updated",
      "request:delivery-updated-batch",
      "worksheet:count-update",
    ],
    delayMs: 120,
    onMatch: async () => {
      await refetchWorksheetSummary();
    },
  });

  const handleLogout = () => {
    logout();
    navigate("/");
  };



  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  if (bootstrappingAuth) {
    return null;
  }

  if (!token || !user || !user.id) {
    return null;
  }

  if (isWizardRoute) {
    return (
      <div className="min-h-screen">
        <Outlet />
      </div>
    );
  }

  if (pendingBusinessName !== null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-accent-soft flex items-center justify-center">
              <Clock className="h-8 w-8 text-accent-strong" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">승인 대기 중</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {pendingBusinessName}
              </span>
              의 대표자 승인을 기다리고 있습니다.
            </p>
            <p className="text-sm text-muted-foreground">
              승인이 완료되면 플랫폼을 정상적으로 이용하실 수 있습니다.
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LabFeeSetupPrompt
        isLab={requestorKind === "lab" || user.role === "internalLab"}
        ready={!requestorAccessLoading || user.role === "internalLab"}
      />
      <div className="flex h-screen">
        <div
          className={cn(
            "fixed inset-0 z-50 bg-black/20 backdrop-blur-sm lg:hidden",
            mobileNavOpen ? "block" : "hidden",
          )}
          onClick={() => setMobileNavOpen(false)}
        ></div>

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-border bg-card",
            "transform transition-all duration-300 ease-in-out",
            showExpandedChrome ? "w-60 min-w-60" : "w-24 min-w-24",
            mobileNavOpen
              ? "translate-x-0 lg:relative"
              : "-translate-x-full lg:relative lg:translate-x-0",
          )}
        >
          <div className="p-4 lg:p-6 border-b border-border">
            <AbutsLogo
              showWordmark={!sidebarCollapsed}
              className="flex-1 min-w-0"
              iconClassName="h-9 w-9 lg:h-12 lg:w-12 flex-shrink-0"
              wordmarkClassName="text-lg lg:text-xl whitespace-nowrap"
              variant="light"
            />
          </div>

          <button
            type="button"
            aria-label={sidebarOpen ? "사이드 메뉴 접기" : "사이드 메뉴 펼치기"}
            onClick={() => persistSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center absolute top-20 -right-4 z-10 w-8 h-8 rounded-full bg-card border border-border shadow-sm hover:bg-muted/60 hover:border-muted-foreground/40 transition-colors"
          >
            {sidebarOpen ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          <nav className="hover-scrollbar flex-1 overflow-y-auto p-3 lg:p-4">
            <DashboardSidebarNav
              items={resolvedMenuItems}
              sections={adminMenuSections ?? undefined}
              isCollapsed={sidebarCollapsed}
              pathname={location.pathname}
              isCreditLow={isCreditLow}
              userRole={user.role}
              requestorKind={requestorKind}
              requestorCanUsePaid={requestorCanUsePaid}
              onNavigate={goSidebarHref}
              getBadgeCount={getSidebarBadgeCount}
            />
          </nav>

          <div className="p-3 lg:p-4 space-y-2">
            <LabDashboardTopBanners collapsed={sidebarCollapsed} />
            <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full p-2 h-auto gap-1.5 transition-all ${
                    sidebarCollapsed ? "justify-center" : "justify-start"
                  }`}
                >
                  <Avatar className="h-6 w-6 lg:h-8 lg:w-8 flex-shrink-0">
                    <AvatarImage
                      seed={user.email || user.id}
                      fallbackInitial={user.name}
                      src={
                        sidebarProfileImage || String(user.profileImage || "") || undefined
                      }
                      alt={user.name}
                    />
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-xs lg:text-sm font-medium truncate">
                        {user.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {user.companyName}
                      </div>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                    <Badge
                      variant={getRoleBadgeVariant(displayRole)}
                      className="w-fit mt-1"
                    >
                      {getRoleLabel(displayRole, requestorKind)}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accountMenuItems.length > 0 && (
                  <>
                    {accountMenuItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem
                          key={item.href}
                          onClick={() => navigate(item.href)}
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
                {user.businessAnchorId ? (
                  <>
                    {accountMenuItems.length > 0 ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    <AccountSwitcherMenuSection
                      menuOpen={accountMenuOpen}
                      getInitials={getInitials}
                      onSelectColleague={(colleague) => {
                        setAccountMenuOpen(false);
                        setSwitchColleague(colleague);
                      }}
                    />
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>로그아웃</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AccountSwitchPasswordDialog
              colleague={switchColleague}
              getInitials={getInitials}
              onClose={() => setSwitchColleague(null)}
            />
          </div>
        </aside>

        <main className="flex-1 flex flex-col lg:ml-0 min-w-0 min-h-0">
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button variant="ghost" size="sm" onClick={() => setMobileNavOpen(true)}>
              <div className="flex flex-col space-y-1">
                <div className="w-4 h-0.5 bg-current"></div>
                <div className="w-4 h-0.5 bg-current"></div>
                <div className="w-4 h-0.5 bg-current"></div>
              </div>
            </Button>
            <AbutsLogo
              iconClassName="h-9 w-9"
              wordmarkClassName="text-base font-bold"
              variant="light"
            />
            <div className="w-9" />
          </div>

          {user.role === "admin" &&
            !location.pathname.startsWith("/dashboard/settings") && (
              <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
                <AdminPeriodDateFilter
                  period={period}
                  onPeriodChange={setPeriod}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  onCustomRangeChange={setCustomDateRange}
                  onClearCustomRange={clearCustomDateRange}
                />
              </div>
            )}
          <div className="flex-1 min-h-0 bg-gradient-to-br from-gray-50 to-primary-soft">
            <div className="flex flex-col h-full">
              {(isManufacturer && isEquipmentRoute) || isWorksheetRoute ? (
                <div className="sticky top-0 z-10 border-b border-border bg-background/80">
                  <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4 sm:py-2.5">
                    {isManufacturer && isEquipmentRoute && (
                      <div className="flex gap-2">
                        <Button
                          variant={
                            location.pathname.startsWith("/dashboard/cnc")
                              ? "default"
                              : "ghost"
                          }
                          size="sm"
                          onClick={() => navigate("/dashboard/cnc")}
                        >
                          자동선반
                        </Button>
                        <Button
                          variant={
                            location.pathname.startsWith("/dashboard/printer")
                              ? "default"
                              : "ghost"
                          }
                          size="sm"
                          onClick={() => navigate("/dashboard/printer")}
                        >
                          프린터
                        </Button>
                      </div>
                    )}

                    {isWorksheetRoute && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:flex-nowrap sm:justify-between">
                        <div className="flex gap-2 flex-shrink-0">
                          <PeriodFilter value={period} onChange={setPeriod} />
                        </div>

                        {(worksheetType === "cnc" ||
                          worksheetType === "custom_abutment") && (
                          <>
                            <div className="hidden sm:block h-8 w-px bg-muted-foreground/60 flex-shrink-0" />
                            <div className="scroll-x-bar-top -mx-1 flex min-w-0 flex-nowrap gap-1 px-1 text-xs">
                              <Button
                                variant={
                                  worksheetStage === "request"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=request",
                                  )
                                }
                              >
                                <span>준비</span>
                                <span className="tabular-nums opacity-70">
                                  {wsSummary.requestCount ?? 0}
                                </span>
                              </Button>

                              <Button
                                variant={
                                  worksheetStage === "machining"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=machining",
                                  )
                                }
                              >
                                <span>가공</span>
                                <span className="tabular-nums opacity-70">
                                  {(wsSummary.machiningCount ?? 0) +
                                    (wsSummary.camCount ?? 0)}
                                </span>
                              </Button>
                              <Button
                                variant={
                                  worksheetStage === "packing"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=packing",
                                  )
                                }
                              >
                                <span>세척·패킹</span>
                                <span className="tabular-nums opacity-70">
                                  {wsSummary.packingCount ?? 0}
                                </span>
                              </Button>
                              <Button
                                variant={
                                  worksheetStage === "shipping"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=shipping",
                                  )
                                }
                              >
                                <span>포장·발송</span>
                                <span className="tabular-nums opacity-70">
                                  {wsSummary.shippingCount ?? 0} /
                                  {wsSummary.shippingBoxes ?? 0}
                                </span>
                              </Button>
                              <Button
                                variant={
                                  worksheetStage === "tracking"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=tracking",
                                  )
                                }
                              >
                                <span>추적관리</span>
                                <span className="tabular-nums opacity-70">
                                  {wsSummary.trackingCount ?? 0} /
                                  {wsSummary.trackingBoxes ?? 0}
                                </span>
                              </Button>
                              <Button
                                variant={
                                  worksheetStage === "rnd" ? "default" : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=rnd",
                                  )
                                }
                              >
                                <span>R&D</span>
                                <span className="tabular-nums opacity-70">
                                  {wsSummary.rndCount ?? 0}
                                </span>
                              </Button>
                              <Button
                                variant={
                                  worksheetStage === "unmachinable"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-8 shrink-0 gap-1 px-2 text-xs"
                                onClick={() =>
                                  navigate(
                                    "/dashboard/worksheet?type=cnc&stage=unmachinable",
                                  )
                                }
                              >
                                <span>불완전가공</span>
                                <span className="tabular-nums opacity-70">
                                  {wsSummary.unmachinableCount ?? 0}
                                </span>
                              </Button>
                            </div>
                          </>
                        )}

                        <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-end gap-2 shrink-0 sm:flex-nowrap">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground select-none whitespace-nowrap shrink-0">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-muted-foreground/40 text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                              checked={showCompleted}
                              onChange={(e) =>
                                setShowCompleted(e.target.checked)
                              }
                            />
                            <span>완료포함</span>
                          </label>
                          <div className="relative w-[120px] lg:w-[180px] shrink-0">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="검색..."
                              value={worksheetSearch}
                              onChange={(e) =>
                                setWorksheetSearch(e.target.value)
                              }
                              className="pl-10 h-9 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className={cn(
                    "flex h-full min-h-0 flex-col items-stretch",
                    // 모바일: 카드 바깥 여백으로 가장자리 스크롤·터치 제스처 공간 확보
                    isLabReceiveWorkArea || isPracticeOralScanWorkArea
                      ? "p-0"
                      : "p-3.5 sm:p-4 lg:p-6",
                  )}
                >
                  <main
                    className={cn(
                      "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                      isLabReceiveWorkArea || isPracticeOralScanWorkArea
                        ? "rounded-none bg-white shadow-none"
                        : "box-border rounded-2xl bg-white/80 shadow-lg backdrop-blur-xl",
                    )}
                  >
                    <div
                      className={cn(
                        "custom-scrollbar h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden",
                        isFillHeightWorkArea && "flex flex-col",
                      )}
                      data-dashboard-scroll="1"
                    >
                      <div
                        className={cn(
                          "box-border min-w-0",
                          isFillHeightWorkArea
                            ? "flex min-h-0 flex-1 flex-col"
                            : "min-h-full",
                          isLabReceiveWorkArea || isPracticeOralScanWorkArea
                            ? "p-3 sm:p-4"
                            : "px-4 pb-8 pt-5 sm:px-6 sm:pb-12 sm:pt-6",
                        )}
                      >
                        <Outlet
                          context={{
                            worksheetSearch,
                            setWorksheetSearch,
                            showCompleted,
                            setShowCompleted,
                            creditBalance,
                            paidCredit,
                            freeRequestCredit,
                            freeShippingCredit,
                            settlementCredit,
                            loadingCreditBalance,
                          }}
                        />
                      </div>
                    </div>
                  </main>


                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
