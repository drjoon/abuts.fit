import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  FileText,
  BarChart3,
  Settings,
  LogOut,
  PanelLeftOpen,
  PanelLeft,
  Users,
  Shield,
  ClipboardList,
  Factory,
  Printer,
  Search,
} from "lucide-react";
import logo from "@/assets/logo.png";

const sidebarItems = {
  requestor: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: FileText, label: "신규 의뢰", href: "/dashboard/new-request" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  manufacturer: [
    { icon: LayoutDashboard, label: "대시보드", href: "/dashboard" },
    { icon: ClipboardList, label: "작업", href: "/dashboard/worksheet" },
    { icon: Factory, label: "장비", href: "/dashboard/cnc" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "어벗츠.핏 대시보드", href: "/dashboard" },
    { icon: Users, label: "사용자 관리", href: "/dashboard/user-management" },
    {
      icon: FileText,
      label: "의뢰 모니터링",
      href: "/dashboard/request-monitoring",
    },
    {
      icon: MessageSquare,
      label: "채팅 관리",
      href: "/dashboard/chat-management",
    },
    {
      icon: BarChart3,
      label: "시스템 통계",
      href: "/dashboard/system-analytics",
    },
    {
      icon: Shield,
      label: "보안 설정",
      href: "/dashboard/security-settings",
    },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
} as const;

const getRoleLabel = (role: string) => {
  switch (role) {
    case "requestor":
      return "의뢰자";
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
    case "manufacturer":
      return "secondary";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

export const DashboardLayout = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [worksheetSearch, setWorksheetSearch] = useState("");

  if (!user) {
    navigate("/login");
    return null;
  }

  const menuItems = sidebarItems[user.role as keyof typeof sidebarItems] || [];

  const isManufacturer = user.role === "manufacturer";
  const isEquipmentRoute =
    location.pathname.startsWith("/dashboard/cnc") ||
    location.pathname.startsWith("/dashboard/printer");
  const isWorksheetRoute =
    isManufacturer && location.pathname.startsWith("/dashboard/worksheet");

  const worksheetParams = new URLSearchParams(location.search);
  const worksheetType = worksheetParams.get("type") || "cnc";
  const worksheetStage = worksheetParams.get("stage") || "receive";

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
            <div className="flex items-center space-x-1 flex-1 min-w-0">
              <img
                src={logo}
                alt="Abuts.fit"
                className="h-9 w-9 lg:h-12 lg:w-12 flex-shrink-0"
              />
              {!isCollapsed && (
                <span className="text-lg lg:text-xl font-bold bg-gradient-hero bg-clip-text text-transparent whitespace-nowrap">
                  abuts.fit
                </span>
              )}
            </div>
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
              {menuItems.map((item) => {
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

          <div className="p-3 lg:p-4">
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
            <div className="flex items-center space-x-2">
              <img src={logo} alt="Abuts.fit" className="h-9 w-9" />
              <span className="font-bold bg-gradient-hero bg-clip-text text-transparent">
                abuts.fit
              </span>
            </div>
            <div className="w-9" />
          </div>

          <div className="flex-1 overflow-auto">
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex gap-2">
                        <Button
                          variant={
                            worksheetType === "cnc" ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() =>
                            navigate(
                              "/dashboard/worksheet?type=cnc&stage=receive"
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
                          <div className="hidden sm:block h-8 w-px bg-muted-foreground/60" />
                          <div className="flex flex-wrap gap-1 text-xs">
                            <Button
                              variant={
                                worksheetStage === "receive"
                                  ? "default"
                                  : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=receive"
                                )
                              }
                            >
                              의뢰, CAM
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
                                  "/dashboard/worksheet?type=cnc&stage=machining"
                                )
                              }
                            >
                              가공
                            </Button>
                            <Button
                              variant={
                                worksheetStage === "qc" ? "default" : "ghost"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                navigate(
                                  "/dashboard/worksheet?type=cnc&stage=qc"
                                )
                              }
                            >
                              세척,검사,포장
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
                                  "/dashboard/worksheet?type=cnc&stage=shipping"
                                )
                              }
                            >
                              발송
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
                                  "/dashboard/worksheet?type=cnc&stage=tracking"
                                )
                              }
                            >
                              추적관리
                            </Button>
                          </div>
                        </>
                      )}

                      <div className="w-full sm:w-auto sm:ml-auto flex justify-end">
                        <div className="relative w-full max-w-xs">
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
            <Outlet context={{ worksheetSearch, setWorksheetSearch }} />
          </div>
        </main>
      </div>
    </div>
  );
};
