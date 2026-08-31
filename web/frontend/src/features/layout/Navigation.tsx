// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import logo from "@/assets/logo.png";

export const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();

  const menuItems: { label: string; href: string }[] = [];

  const handleMenuClick = (href: string) => {
    if (href.startsWith("#")) {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
    setIsOpen(false);
  };

  const handleLoginClick = () => {
    setIsOpen(false);
    if (isAuthenticated) {
      navigate(resolveEntryDashboardPath(user));
    } else {
      navigate("/login");
    }
  };

  const handleSignupClick = () => {
    setIsOpen(false);
    navigate("/signup");
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  const mobileAuthButtons = isAuthenticated ? (
    <>
      <div className="mb-2 text-center text-sm text-slate-700">
        안녕하세요, {user?.name}님
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
        onClick={handleLoginClick}
      >
        대시보드
      </Button>
      <Button
        type="button"
        className="h-11 w-full bg-gradient-to-r from-[#FF9D62] via-[#FF814A] to-[#FF6B4A] text-white shadow-[0_10px_30px_rgba(255,132,74,0.35)] hover:opacity-90"
        onClick={handleLogout}
      >
        로그아웃
      </Button>
    </>
  ) : (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
        onClick={handleLoginClick}
      >
        로그인
      </Button>
      <Button
        type="button"
        className="h-11 w-full bg-slate-900 text-white hover:bg-slate-800"
        onClick={handleSignupClick}
      >
        회원가입
      </Button>
    </>
  );

  return (
    <nav className="fixed top-0 z-50 w-full">
      {/* Header chrome only — keep absolute layers below content (z-0). */}
      <div className="absolute inset-0 z-0 border-b border-white/10 bg-[#02040c] md:bg-[#02040c]/95 md:backdrop-blur-3xl" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_22%_-15%,rgba(59,130,246,0.25),transparent_58%),radial-gradient(circle_at_78%_-20%,rgba(147,51,234,0.22),transparent_60%),radial-gradient(circle_at_50%_25%,rgba(6,78,59,0.18),transparent_72%)] opacity-70" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="relative flex h-14 items-center justify-between sm:h-16">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-white transition hover:opacity-90 sm:gap-3"
            onClick={() => navigate("/")}
          >
            <img
              src={logo}
              alt="Abuts.fit"
              className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12"
              style={{ backgroundColor: "transparent" }}
            />
            <span className="notranslate truncate bg-gradient-to-r from-[#6E8BFF] via-[#A278FF] to-[#FF9D62] bg-clip-text text-lg font-semibold text-transparent sm:text-2xl">
              abuts.fit
            </span>
          </button>

          <div className="hidden items-center space-x-8 md:flex">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleMenuClick(item.href)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center space-x-4 md:flex">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-white/70">
                  안녕하세요, {user?.name}님
                </span>
                <Button
                  variant="ghost"
                  className="text-white"
                  onClick={handleLoginClick}
                >
                  대시보드
                </Button>
                <Button
                  className="bg-gradient-to-r from-[#FF9D62] via-[#FF814A] to-[#FF6B4A] text-white shadow-[0_10px_30px_rgba(255,132,74,0.35)] hover:opacity-90"
                  onClick={handleLogout}
                >
                  로그아웃
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="text-white"
                  onClick={handleLoginClick}
                >
                  로그인
                </Button>
                <Button
                  className="bg-white text-slate-900 hover:bg-white/90"
                  onClick={handleSignupClick}
                >
                  회원가입
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white transition hover:bg-white/10 md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label="메뉴 토글"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Fixed panel escapes header absolute overlays that otherwise paint over buttons. */}
      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 top-14 z-[55] bg-black/45 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-x-0 top-14 z-[60] border-b border-slate-200 bg-white px-4 pb-5 pt-4 shadow-[0_18px_40px_rgba(2,4,12,0.35)] md:hidden">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleMenuClick(item.href)}
                className="block min-h-11 w-full rounded-lg px-2 py-2.5 text-left text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                {item.label}
              </button>
            ))}
            <div className="space-y-2">{mobileAuthButtons}</div>
          </div>
        </>
      ) : null}
    </nav>
  );
};
