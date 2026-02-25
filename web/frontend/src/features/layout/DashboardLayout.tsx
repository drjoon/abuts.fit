import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
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
  Wallet,
  Shield,
  Users2,
  ClipboardList,
  Factory,
  Printer,
  Search,
  Sparkles,
} from "lucide-react";
import { AbutsLogo } from "@/components/branding/AbutsLogo";

const sidebarItems = {
  requestor: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: FileText, label: "신규의뢰", href: "/dashboard/new-request" },
    { icon: Users2, label: "리퍼럴그룹", href: "/dashboard/referral-groups" },
    { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  salesman: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  manufacturer: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: ClipboardList, label: "작업", href: "/dashboard/worksheet" },
    { icon: Factory, label: "장비", href: "/dashboard/cnc" },
    { icon: Wallet, label: "정산", href: "/dashboard/payments" },
    { icon: MessageSquare, label: "문의", href: "/dashboard/inquiries" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: Users, label: "사용자", href: "/dashboard/users" },
    { icon: Wallet, label: "크레딧", href: "/dashboard/credits" },
    { icon: Users2, label: "리퍼럴그룹", href: "/dashboard/referral-groups" },
    {
      icon: FileText,
      label: "의뢰",
      href: "/dashboard/monitoring",
    },
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

const getRoleLabel = (role: string) => {
  switch (role) {
    case "requestor":
      return "의뢰자";
    case "salesman":
      return "영업자";
    case "manufacturer":
      return "제조사";
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
    case "manufacturer":
      return "secondary";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

export const DashboardLayout = () => {
  const { user, logout, token, loginWithToken } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loadingCreditBalance, setLoadingCreditBalance] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [worksheetSearch, setWorksheetSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [bootstrappingAuth, setBootstrappingAuth] = useState(false);
  const [bootstrappedOnce, setBootstrappedOnce] = useState(false);
  const [sidebarProfileImage, setSidebarProfileImage] = useState<string>("");

  const isWizardRoute = location.pathname.startsWith("/dashboard/wizard");
  const onboardingCompleted = Boolean(user?.onboardingWizardCompleted);
  const shouldForceOnboarding =
    user?.role !== undefined &&
    ["requestor", "salesman", "manufacturer", "admin"].includes(user.role);

  useEffect(() => {
    if (!token) return;
    if (!user) return;
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

  if (bootstrappingAuth) {
    return null;
  }

  if (!token || !user || !user.id) {
    return null;
  }

  const refreshSidebarProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<any>({
        path: "/api/users/profile",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const body: any = res.data || {};
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

  const fetchCreditBalance = useCallback(async () => {
    if (!token) return;
    if (!user) return;
    if (user.role !== "requestor") {
      setCreditBalance(null);
      return;
    }
    if (!user.organizationId) {
      setCreditBalance(null);
      return;
    }

    setLoadingCreditBalance(true);
    try {
      const res = await apiFetch<any>({
        path: "/api/credits/balance",
        method: "GET",
        token,
      });
      if (!res.ok) {
        setCreditBalance(null);
        return;
      }
      const body: any = res.data || {};
      const data = body.data || body;
      setCreditBalance(Number(data?.balance ?? 0));
    } catch {
      setCreditBalance(null);
    } finally {
      setLoadingCreditBalance(false);
    }
  }, [token, user]);

  useEffect(() => {
    fetchCreditBalance();
  }, [fetchCreditBalance]);

  useEffect(() => {
    const onCreditsUpdated = () => {
      fetchCreditBalance();
    };

    window.addEventListener("abuts:credits:updated", onCreditsUpdated);
    return () => {
      window.removeEventListener("abuts:credits:updated", onCreditsUpdated);
    };
  }, [fetchCreditBalance]);

  const isMockUser = Boolean((user as any)?.mockUserId);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "requestor") return;
    if ((user as any).approvedAt) return;
    if (isMockUser) return;
    if (location.pathname.startsWith("/dashboard")) {
      navigate("/signup?mode=social_complete", { replace: true });
    }
  }, [isMockUser, location.pathname, navigate, user]);

  useEffect(() => {
    if (!token) return;
    if (!user) return;
    if (user.role !== "requestor") return;
    if (!user.organizationId) return;

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
          apiFetch<any>({ path: "/api/credits/balance", method: "GET", token }),
          apiFetch<any>({
            path: "/api/credits/insights/spend",
            method: "GET",
            token,
          }),
        ]);

        if (cancelled) return;
        if (!balanceRes.ok || !insightsRes.ok) return;

        const balanceData = (balanceRes.data as any)?.data || balanceRes.data;
        const insightsData =
          (insightsRes.data as any)?.data || insightsRes.data;

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
  }, [location.pathname, location.search, navigate, toast, token, user]);

  type SidebarItem = { icon: any; label: string; href: string };
  const baseMenuItems = (sidebarItems[user.role as keyof typeof sidebarItems] ||
    []) as unknown as SidebarItem[];
  const menuItems = (() => {
    return baseMenuItems;
  })();

  const resolvedMenuItems = (() => {
    return menuItems;
  })();

  const isManufacturer = user.role === "manufacturer";
  const isEquipmentRoute =
    location.pathname.startsWith("/dashboard/cnc") ||
    location.pathname.startsWith("/dashboard/printer");
  const isWorksheetRoute =
    isManufacturer && location.pathname.startsWith("/dashboard/worksheet");

  const worksheetParams = new URLSearchParams(location.search);
  const worksheetType = worksheetParams.get("type") || "cnc";
  const worksheetStage = worksheetParams.get("stage") || "request";

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

  if (isWizardRoute) {
    return (
      <div className="min-h-screen">
        <Outlet />
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

          <nav className="flex-1 p-3 lg:p-4">
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
                        <span className="truncate">{item.label}</span>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
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
                      src={
                        sidebarProfileImage ||
                        String((user as any)?.profileImage || "") ||
                        undefined
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
                      variant={getRoleBadgeVariant(user.role)}
                      className="w-fit mt-1"
                    >
                      {getRoleLabel(user.role)}
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

        <main className="flex-1 flex flex-col lg:ml-0 min-w-0">
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
                <PeriodFilter value={period} onChange={setPeriod} />
              </div>
            )}
          <div
            className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-blue-100"
            data-dashboard-scroll="1"
          >
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
                        <Button
                          variant={
                            worksheetType === "cnc" ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() =>
                            navigate(
                              "/dashboard/worksheet?type=cnc&stage=request",
                            )
                          }
                        >
                          커스텀어벗
                        </Button>
                        <Button
                          variant={
                            worksheetType === "printer" ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() =>
                            navigate("/dashboard/worksheet?type=printer")
                          }
                        >
                          크라운
                        </Button>
                      </div>

                      {worksheetType === "cnc" && (
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
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=request",
                                )
                              }
                            >
                              의뢰
                            </Button>
                            <Button
                              variant={
                                worksheetStage === "cam" ? "default" : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=cam",
                                )
                              }
                            >
                              CAM
                            </Button>
                            <Button
                              variant={
                                worksheetStage === "machining"
                                  ? "default"
                                  : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=machining",
                                )
                              }
                            >
                              가공
                            </Button>
                            <Button
                              variant={
                                worksheetStage === "packing"
                                  ? "default"
                                  : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=packing",
                                )
                              }
                            >
                              세척.패킹
                            </Button>
                            <Button
                              variant={
                                worksheetStage === "shipping"
                                  ? "default"
                                  : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=shipping",
                                )
                              }
                            >
                              포장.발송
                            </Button>
                            <Button
                              variant={
                                worksheetStage === "tracking"
                                  ? "default"
                                  : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=tracking",
                                )
                              }
                            >
                              추적관리
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
                            onChange={(e) => setShowCompleted(e.target.checked)}
                          />
                          <span>완료포함</span>
                        </label>
                        <div className="relative w-full max-w-[110px] lg:max-w-[200px]">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="검색..."
                            value={worksheetSearch}
                            onChange={(e) => setWorksheetSearch(e.target.value)}
                            className="pl-10 h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className="p-2 sm:p-4 lg:p-6 flex flex-col items-stretch min-h-max">
              <main className="flex-1 bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-lg min-h-[calc(100vh-140px)] overflow-x-hidden">
                <Outlet
                  context={{
                    worksheetSearch,
                    setWorksheetSearch,
                    showCompleted,
                    setShowCompleted,
                    creditBalance,
                    loadingCreditBalance,
                  }}
                />
              </main>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
