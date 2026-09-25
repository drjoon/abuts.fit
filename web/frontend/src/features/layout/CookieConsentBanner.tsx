// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/PrivacyPage.tsx
// - web/frontend/src/pages/public/CookiesPage.tsx
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  DEFAULT_SIDEBAR_OPEN,
  normalizeSidebarOpen,
} from "@/shared/layout/sidebarOpen";
import { cn } from "@/shared/ui/cn";

const STORAGE_KEY = "abutsfit:cookie-consent:v1";

/** Docked dashboard sidebar (xl+). Off-canvas drawers below xl do not consume layout width. */
function hasDockedSidebar(pathname: string): boolean {
  if (pathname.startsWith("/dashboard/wizard")) return false;
  if (pathname.startsWith("/dashboard")) return true;
  return (
    pathname.startsWith("/practice/dashboard") ||
    pathname.startsWith("/practice/inquiries") ||
    pathname.startsWith("/practice/settings")
  );
}

export function CookieConsentBanner() {
  const { pathname } = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const reserveChat = isAuthenticated && role !== "admin";
  const dockedSidebar = isAuthenticated && hasDockedSidebar(pathname);
  const sidebarOpen = normalizeSidebarOpen(
    user?.sidebarOpen ?? DEFAULT_SIDEBAR_OPEN,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "accepted") {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      /* private mode: hide for this visit only */
    }
    setVisible(false);
  };

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-0 z-40 pl-3 sm:bottom-6 sm:pl-6",
        reserveChat ? "pr-20 sm:pr-28" : "pr-3 sm:pr-6",
        dockedSidebar
          ? sidebarOpen
            ? "left-0 xl:left-60"
            : "left-0 xl:left-24"
          : "left-0",
      )}
    >
      <div
        role="dialog"
        aria-label="쿠키 사용 안내"
        className={cn(
          "pointer-events-auto flex w-full flex-col gap-3 rounded-2xl bg-[#2c2c2c] px-5 py-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:gap-6 sm:px-6",
          dockedSidebar ? "max-w-none" : "mx-auto max-w-5xl",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug">
            우리는 귀하의 개인정보를 소중히 여깁니다.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">
            고객님의 경험을 개선하기 위해, 저희는{" "}
            <Link
              to="/privacy"
              className="text-[#4da3ff] underline underline-offset-2 hover:text-[#8cc4ff]"
            >
              개인정보처리방침
            </Link>에 명시된 대로 쿠키를 사용합니다.
            <br />
            동의하시려면 &apos;동의&apos;를 클릭하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 self-end rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-100 sm:self-center"
        >
          동의
        </button>
      </div>
    </div>
  );
}
