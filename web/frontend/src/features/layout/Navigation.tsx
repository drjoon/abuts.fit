// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import { AbutsLogo } from "@/components/branding/AbutsLogo";
import { landingOffers, offerPath } from "@/features/landing/landingOffers";

function scrollToLandingSection(id: string) {
  const element = document.getElementById(id);
  if (!element) return false;
  const top = element.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  return true;
}

type NavigationProps = {
  tone?: "dark" | "light";
  /** 랜딩 히어로 위. 맨 위에서는 배경을 비운다 */
  overlay?: boolean;
};

export const Navigation = ({ tone = "dark", overlay = false }: NavigationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const isLight = tone === "light";
  const isOfferNav =
    location.pathname === "/" || location.pathname.startsWith("/offer/");
  const overlayClear = overlay && !scrolled && !isOpen;

  const menuItems: { label: string; href: string }[] = isOfferNav
    ? landingOffers.map((offer) => ({
        label: offer.navLabel,
        href: offerPath(offer.slug),
      }))
    : [
        { label: "어벗츠 소개", href: "/" },
        { label: "플랫폼과 제품", href: "/platform" },
      ];
  const mobileMenuItems = menuItems;

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  useEffect(() => {
    if (!location.hash) return;
    if (location.pathname !== "/" && location.pathname !== "/platform") return;
    const id = location.hash.replace(/^#/, "");
    if (!id) return;
    const timer = window.setTimeout(() => {
      scrollToLandingSection(id);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.hash]);

  const handleMenuClick = (href: string) => {
    setIsOpen(false);
    if (href === "/signup" && isAuthenticated) {
      navigate(resolveEntryDashboardPath(user));
      return;
    }
    const hashIndex = href.indexOf("#");
    if (hashIndex >= 0) {
      const pathname = href.slice(0, hashIndex) || "/";
      const id = href.slice(hashIndex + 1);
      if (location.pathname !== pathname) {
        navigate({ pathname, hash: `#${id}` });
        return;
      }
      navigate({ pathname, hash: `#${id}` }, { replace: true });
      scrollToLandingSection(id);
      return;
    }
    if (!href.includes("#") && location.pathname === href) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    navigate(href);
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
        className="h-11 w-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
        onClick={handleSignupClick}
      >
        회원가입
      </Button>
    </>
  );

  return (
    <nav className="fixed top-0 z-50 w-full">
      <div
        className={cn(
          "absolute inset-0 z-0 border-b backdrop-blur-3xl transition-colors",
          overlayClear && !isLight
            ? "border-transparent bg-transparent backdrop-blur-none"
            : isLight
              ? "border-slate-200/70 bg-white/50 backdrop-blur-xl"
              : "border-white/10 bg-[#02040c] md:bg-[#02040c]/95",
        )}
      />
      {!isLight ? (
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_22%_-15%,rgba(59,130,246,0.25),transparent_58%),radial-gradient(circle_at_78%_-20%,rgba(147,51,234,0.22),transparent_60%),radial-gradient(circle_at_50%_25%,rgba(6,78,59,0.18),transparent_72%)] opacity-70" />
      ) : null}

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="relative flex h-14 items-center justify-between sm:h-16">
          <button
            type="button"
            className={cn(
              "flex min-w-0 items-center transition hover:opacity-90",
              isLight ? "text-slate-900" : "text-white",
            )}
            onClick={() => navigate("/")}
          >
            <AbutsLogo
              variant={isLight ? "light" : "dark"}
              iconClassName="h-10 w-10 sm:h-12 sm:w-12"
              wordmarkClassName="truncate text-lg sm:text-2xl"
            />
          </button>

          <div className="hidden items-center space-x-5 md:flex">
            {menuItems.map((item) => {
              const current = location.pathname === item.href;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleMenuClick(item.href)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "text-sm transition-colors",
                    isLight
                      ? "text-[15px] font-semibold text-slate-900 hover:text-slate-600"
                      : "text-white/55 hover:text-white",
                    current &&
                      (isLight
                        ? "underline decoration-2 underline-offset-8"
                        : "text-white"),
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="hidden items-center space-x-4 md:flex">
            {isAuthenticated ? (
              <>
                <span
                  className={cn(
                    "text-sm",
                    isLight ? "text-slate-600" : "text-white/70",
                  )}
                >
                  안녕하세요, {user?.name}님
                </span>
                <Button
                  variant="ghost"
                  className={isLight ? "text-slate-700" : "text-white"}
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
                  className={isLight ? "text-slate-700" : "text-white"}
                  onClick={handleLoginClick}
                >
                  로그인
                </Button>
                <Button
                  className={
                    isLight
                      ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                      : "bg-white text-slate-900 hover:bg-white/90"
                  }
                  onClick={handleSignupClick}
                >
                  회원가입
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className={cn(
              "-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition md:hidden",
              isLight
                ? "text-slate-700 hover:bg-slate-100"
                : "text-white hover:bg-white/10",
            )}
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label="메뉴 토글"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 top-14 z-[55] bg-black/45 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-x-0 top-14 z-[60] border-b border-slate-200 bg-white px-4 pb-5 pt-4 shadow-[0_18px_40px_rgba(2,4,12,0.35)] md:hidden">
            {mobileMenuItems.map((item) => (
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
