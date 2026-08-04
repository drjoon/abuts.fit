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

// change-log:
// - 2026-08-03: Dashboard 상단 워크시트 공정 탭의 '의뢰' 라벨을 '준비'로 변경(표시 레벨). wsSummary 조회/표시 로직과 연동됨.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/dashboard/ManufacturerDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Users2,
  ClipboardList,
  Printer,
  Search,
  Sparkles,
  Share2,
  Clock,
  Boxes,
  Package,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { useChatRooms } from "@/shared/hooks/useChatRooms";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";

const sidebarItems = {
  requestor: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: FileText, label: "신규의뢰", href: "/dashboard/new-request" },
    { icon: Building2, label: "치과", href: "/dashboard/practice-transfers" },
    { icon: Share2, label: "소개", href: "/dashboard/referral-groups" },
    { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  salesman: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: Share2, label: "소개", href: "/dashboard/referral-groups" },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  devops: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: Share2, label: "소개", href: "/dashboard/referral-groups" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  practice: [
    { icon: LayoutDashboard, label: "파일전송", href: "/practice/dashboard" },
    { icon: MessageSquare, label: "문의", href: "/practice/inquiries" },
    { icon: Settings, label: "설정", href: "/practice/settings" },
  ],
  manufacturer: [
    { icon: ClipboardList, label: "작업", href: "/dashboard/worksheet" },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: Building2, label: "사업자", href: "/dashboard/businesses" },
    { icon: Users, label: "사용자", href: "/dashboard/users" },
    { icon: Wallet, label: "크레딧", href: "/dashboard/credits" },
    { icon: Users2, label: "소개그룹", href: "/dashboard/referral-groups" },
    {
      icon: FileText,
      label: "의뢰",
      href: "/dashboard/monitoring",
    },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: FileText, label: "세금계산서", href: "/dashboard/tax-invoices" },
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
    { icon: Shield, label: "보안", href: "/dashboard/security-settings" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
} as const;

type SidebarItem = { icon: LucideIcon; label: string; href: string };

type UserProfileApiResponse = {
  data?: {
    profileImage?: string;
  };
  profileImage?: string;
};

type CreditBalanceApiResponse = {
  data?: {
    balance?: number;
    paidCredit?: number;
    freeRequestCredit?: number;
    freeShippingCredit?: number;
  };
  balance?: number;
  paidCredit?: number;
  freeRequestCredit?: number;
  freeShippingCredit?: number;
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

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

const adminSidebarSections: SidebarSection[] = [
  {
    title: "운영",
    items: [
      { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
      { icon: Building2, label: "사업자", href: "/dashboard/businesses" },
      { icon: Users, label: "사용자", href: "/dashboard/users" },
      { icon: Users2, label: "소개그룹", href: "/dashboard/referral-groups" },
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
    title: "관리",
    items: [
      { icon: Shield, label: "보안", href: "/dashboard/security-settings" },
      { icon: Settings, label: "설정", href: "/dashboard/settings" },
    ],
  },
];

const getRoleLabel = (role: string) => {
  switch (role) {
    case "requestor":
      return "의뢰자";
    case "salesman":
      return "영업자";
    case "devops":
      return "개발운영사";
    case "manufacturer":
      return "제조사";
    case "practice":
      return "치과병의원";
    case "admin":
      return "어벗츠.핏";
    default:
      return "사용자";
  }
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
    case "practice":
      return "default";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

export const DashboardLayout = () => {
  const { user, logout, token, loginWithToken } = useAuthStore();
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
  const [loadingCreditBalance, setLoadingCreditBalance] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [worksheetSearch, setWorksheetSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [bootstrappingAuth, setBootstrappingAuth] = useState(false);
  const [bootstrappedOnce, setBootstrappedOnce] = useState(false);
  const [sidebarProfileImage, setSidebarProfileImage] = useState<string>("");
  const [pendingBusinessName, setPendingBusinessName] = useState<string | null>(
    null,
  );
  const [requestorPracticeUnreadCount, setRequestorPracticeUnreadCount] =
    useState(0);
  const { rooms: chatRooms } = useChatRooms();

  const isWizardRoute = location.pathname.startsWith("/dashboard/wizard");
  const isPracticeUser = Boolean(user?.role === "practice");
  const onboardingCompleted = Boolean(
    user?.onboardingWizardCompleted || user?.businessVerified,
  );
  const shouldForceOnboarding =
    !isPracticeUser &&
    user?.role !== undefined &&
    ["requestor", "salesman", "manufacturer", "admin", "devops"].includes(
      user?.role,
    );

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
        .then((ok) => {
          if (!ok) {
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
    loginWithToken(token).then((ok) => {
      if (!ok) {
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

  const fetchRequestorPracticeUnreadCount = useCallback(async () => {
    if (!token || !user) {
      setRequestorPracticeUnreadCount(0);
      return;
    }
    if (isPracticeUser || user.role !== "requestor") {
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
  }, [isPracticeUser, token, user]);

  const fetchCreditBalance = useCallback(async () => {
    if (!token) return;
    if (!user) return;
    if (isPracticeUser || user.role !== "requestor") {
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
      freeShippingCredit === null;

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
        return;
      }
      const body = res.data || {};
      const data = body.data || body;
      setCreditBalance(Number(data?.balance ?? 0));
      setPaidCredit(Number(data?.paidCredit ?? 0));
      setFreeRequestCredit(Number(data?.freeRequestCredit ?? 0));
      setFreeShippingCredit(Number(data?.freeShippingCredit ?? 0));
    } catch {
      setCreditBalance(null);
      setPaidCredit(null);
      setFreeRequestCredit(null);
      setFreeShippingCredit(null);
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
    token,
    user,
  ]);

  useEffect(() => {
    fetchCreditBalance();
  }, [fetchCreditBalance]);

  useEffect(() => {
    void fetchRequestorPracticeUnreadCount();
  }, [fetchRequestorPracticeUnreadCount]);

  useEffect(() => {
    if (!token || !user || isPracticeUser || user.role !== "requestor") return;

    const tick = () => {
      void fetchRequestorPracticeUnreadCount();
    };

    const timer = window.setInterval(tick, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, [fetchRequestorPracticeUnreadCount, isPracticeUser, token, user]);

  useEffect(() => {
    const onUnreadUpdated = (evt: Event) => {
      const custom = evt as CustomEvent<{ unreadCount?: unknown }>;
      const maybeCount = Number(custom.detail?.unreadCount);
      if (Number.isFinite(maybeCount) && maybeCount >= 0) {
        setRequestorPracticeUnreadCount(maybeCount);
        return;
      }
      void fetchRequestorPracticeUnreadCount();
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
  }, [fetchRequestorPracticeUnreadCount]);



  useAppEventDebouncedReload({
    enabled:
      Boolean(token) &&
      Boolean(user) &&
      !isPracticeUser &&
      user?.role === "requestor" &&
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
    const isOnPaymentTab =
      location.pathname.startsWith("/dashboard/settings") &&
      params.get("tab") === "payment";

    if (isOnPaymentTab) {
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

        const balance = Number(balanceData?.balance || 0);
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
                onClick={() => navigate("/dashboard/settings?tab=payment")}
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
              onClick={() => navigate("/dashboard/settings?tab=payment")}
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
    return baseMenuItems;
  })();

  const displayRole = isPracticeUser ? "practice" : user.role;
  const adminMenuSections = user.role === "admin" ? adminSidebarSections : null;

  const { getBadgeForHref, clearBadgeForPath } = useAdminCommBadges();

  useEffect(() => {
    clearBadgeForPath(location.pathname);
  }, [location.pathname, clearBadgeForPath]);

  const resolvedMenuItems = (() => {
    return menuItems;
  })();

  const requestorPracticeChatUnreadCount = useMemo(() => {
    if (user.role !== "requestor") return 0;
    return chatRooms.reduce((sum, room) => {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) return sum;
      return sum + Math.max(0, Number(room.unreadCount || 0));
    }, 0);
  }, [chatRooms, user.role]);

  const getSidebarBadgeCount = useCallback(
    (href: string) => {
      const adminCommBadge = Number(getBadgeForHref(href) || 0);
      if (href === "/dashboard/practice-transfers" && user.role === "requestor") {
        const transferUnread = Math.max(0, Number(requestorPracticeUnreadCount || 0));
        const chatUnread = Math.max(0, Number(requestorPracticeChatUnreadCount || 0));
        return adminCommBadge + transferUnread + chatUnread;
      }
      return adminCommBadge;
    },
    [
      getBadgeForHref,
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
            <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
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
      <div className="flex h-screen">
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          style={{ display: isOpen ? "block" : "none" }}
          onClick={() => setIsOpen(false)}
        ></div>

        <aside
          className={`
          fixed lg:relative inset-y-0 left-0 z-50 ${
            isCollapsed ? "w-24" : "w-52"
          } bg-card border-r border-border flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        >
          <div className="p-4 lg:p-6 border-b border-border">
            <AbutsLogo
              showWordmark={!isCollapsed}
              className="flex-1 min-w-0"
              iconClassName="h-9 w-9 lg:h-12 lg:w-12 flex-shrink-0"
              wordmarkClassName="text-lg lg:text-xl whitespace-nowrap"
              variant="light"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="hidden lg:flex items-center justify-center absolute top-20 -right-4 w-8 h-8 rounded-full bg-card border border-border shadow-sm hover:bg-muted/60 hover:border-muted-foreground/40 transition-colors"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </button>

          <nav className="hover-scrollbar flex-1 overflow-y-auto p-3 lg:p-4">
            {adminMenuSections ? (
              <div className="space-y-4 lg:space-y-5">
                {adminMenuSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    {!isCollapsed && (
                      <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                        {section.title}
                      </div>
                    )}
                    <ul className="space-y-1 lg:space-y-2">
                      {section.items.map((item) => {
                        const isRootDashboard = item.href === "/dashboard";
                        const isActive = isRootDashboard
                          ? location.pathname === item.href
                          : location.pathname === item.href ||
                            location.pathname.startsWith(`${item.href}/`);

                        return (
                          <li key={item.href}>
                            <Button
                              variant="ghost"
                              className={`w-full h-9 lg:h-10 text-sm lg:text-base transition-all ${
                                isCollapsed
                                  ? "justify-center px-2"
                                  : "justify-start px-3 lg:px-4"
                              } ${
                                isActive
                                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                              }`}
                              onClick={() => {
                                navigate(item.href);
                                setIsOpen(false);
                              }}
                              aria-current={isActive ? "page" : undefined}
                            >
                              <item.icon
                                className={`h-4 w-4 flex-shrink-0 ${
                                  isCollapsed ? "" : "mr-2 lg:mr-3"
                                }`}
                              />
                              {!isCollapsed && (
                                <span className="truncate flex-1">
                                  {item.label}
                                </span>
                              )}
                              {!isCollapsed &&
                                (() => {
                                  const badgeCount = getSidebarBadgeCount(item.href);
                                  return badgeCount > 0 ? (
                                    <Badge
                                      variant="destructive"
                                      className="ml-auto h-5 min-w-[1.25rem] flex items-center justify-center px-1 text-[10px] font-semibold leading-none flex-shrink-0"
                                    >
                                      {badgeCount > 99 ? "99+" : badgeCount}
                                    </Badge>
                                  ) : null;
                                })()}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-1 lg:space-y-2">
                {resolvedMenuItems.map((item) => {
                  const isRootDashboard = item.href === "/dashboard";
                  const isActive = isRootDashboard
                    ? location.pathname === item.href
                    : location.pathname === item.href ||
                      location.pathname.startsWith(`${item.href}/`);

                  return (
                    <li key={item.href}>
                      <Button
                        variant="ghost"
                        className={`w-full h-9 lg:h-10 text-sm lg:text-base transition-all ${
                          isCollapsed
                            ? "justify-center px-2"
                            : "justify-start px-3 lg:px-4"
                        } ${
                          isActive
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }`}
                        onClick={() => {
                          navigate(item.href);
                          setIsOpen(false);
                        }}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <item.icon
                          className={`h-4 w-4 flex-shrink-0 ${
                            isCollapsed ? "" : "mr-2 lg:mr-3"
                          }`}
                        />
                        {!isCollapsed && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {!isCollapsed &&
                          (() => {
                            const badgeCount = getSidebarBadgeCount(item.href);
                            return badgeCount > 0 ? (
                              <Badge
                                variant="destructive"
                                className="ml-auto h-5 min-w-[1.25rem] flex items-center justify-center px-1 text-[10px] font-semibold leading-none flex-shrink-0"
                              >
                                {badgeCount > 99 ? "99+" : badgeCount}
                              </Badge>
                            ) : null;
                          })()}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <div className="p-3 lg:p-4 space-y-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full p-2 h-auto transition-all ${
                    isCollapsed ? "justify-center" : "justify-start"
                  }`}
                >
                  <Avatar
                    className={`h-6 w-6 lg:h-8 lg:w-8 flex-shrink-0 ${
                      isCollapsed ? "" : "mr-2 lg:mr-3"
                    }`}
                  >
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
                  {!isCollapsed && (
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
              <DropdownMenuContent className="w-56" align="end" forceMount>
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
                      {getRoleLabel(displayRole)}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>로그아웃</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        <main className="flex-1 flex flex-col lg:ml-0 min-w-0 min-h-0">
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)}>
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
          <div
            className="flex-1 min-h-0 bg-gradient-to-br from-gray-50 to-blue-100"
            data-dashboard-scroll="1"
          >
            <div className="flex flex-col h-full">
              {(isManufacturer && isEquipmentRoute) || isWorksheetRoute ? (
                <div className="border-b border-border bg-background/80 sticky top-0 z-10">
                  <div className="px-4 py-2 flex flex-col gap-2">
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
                            <div className="flex flex-wrap gap-1 text-xs flex-shrink-0">
                              <Button
                                variant={
                                  worksheetStage === "request"
                                    ? "default"
                                    : "ghost"
                                }
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
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
                                className="h-7 px-2 text-xs gap-1"
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
                                className="h-7 px-2 text-xs gap-1"
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
                                className="h-7 px-2 text-xs gap-1"
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
                                className="h-7 px-2 text-xs gap-1"
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
                                className="h-7 px-2 text-xs gap-1"
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
                                className="h-7 px-2 text-xs gap-1"
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

                        <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-end gap-2 min-w-0 sm:flex-nowrap">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none ">
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
                          <div className="relative w-full max-w-[110px] lg:max-w-[200px]">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="검색..."
                              value={worksheetSearch}
                              onChange={(e) =>
                                setWorksheetSearch(e.target.value)
                              }
                              className="pl-10 h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              <div className="flex-1 min-h-0 overflow-auto">
                <div className="p-2 sm:p-4 lg:p-6 flex flex-col flex-1 min-h-0 items-stretch">
                  <main className="flex flex-col flex-1 min-h-0 bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-lg">
                    <div className="flex-1 min-h-0 overflow-auto">
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
                          loadingCreditBalance,
                        }}
                      />
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
