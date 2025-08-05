import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
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
  Building2,
  Users,
  Shield,
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
    { icon: Building2, label: "의뢰 목록", href: "/dashboard/request-list" },
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
    { icon: Shield, label: "보안 설정", href: "/dashboard/security-settings" },
    { icon: Settings, label: "설정", href: "/dashboard/settings" },
  ],
};

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
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
    navigate("/login");
    return null;
  }

  const menuItems = sidebarItems[user.role] || [];

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
        {/* Mobile Sidebar Overlay */}
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          style={{ display: isOpen ? "block" : "none" }}
          onClick={() => setIsOpen(false)}
        ></div>

        {/* Sidebar */}
        <aside
          className={`
          fixed lg:relative inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        >
          {/* Logo */}
          <div className="p-4 lg:p-6 border-b border-border">
            <div className="flex items-center space-x-3">
              <img
                src={logo}
                alt="Abuts.fit"
                className="h-6 w-6 lg:h-8 lg:w-8"
              />
              <span className="text-lg lg:text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
                abuts.fit
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 lg:p-4">
            <ul className="space-y-1 lg:space-y-2">
              {menuItems.map((item) => (
                <li key={item.href}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm lg:text-base h-9 lg:h-10"
                    onClick={() => {
                      navigate(item.href);
                      setIsOpen(false); // Close mobile menu after navigation
                    }}
                  >
                    <item.icon className="mr-2 lg:mr-3 h-4 w-4" />
                    <span className="truncate">{item.label}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          {/* User Profile */}
          <div className="p-3 lg:p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start p-2 h-auto"
                >
                  <Avatar className="h-6 w-6 lg:h-8 lg:w-8 mr-2 lg:mr-3 flex-shrink-0">
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-xs lg:text-sm font-medium truncate">
                      {user.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user.companyName}
                    </div>
                  </div>
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

        {/* Main Content */}
        <main className="flex-1 flex flex-col lg:ml-0 min-w-0">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)}>
              <div className="flex flex-col space-y-1">
                <div className="w-4 h-0.5 bg-current"></div>
                <div className="w-4 h-0.5 bg-current"></div>
                <div className="w-4 h-0.5 bg-current"></div>
              </div>
            </Button>
            <div className="flex items-center space-x-2">
              <img src={logo} alt="Abuts.fit" className="h-6 w-6" />
              <span className="font-bold bg-gradient-hero bg-clip-text text-transparent">
                abuts.fit
              </span>
            </div>
            <div className="w-9" /> {/* Spacer for balance */}
          </div>

          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
