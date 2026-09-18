// related files:
// - web/frontend/src/pages/public/PlatformPage.tsx
// - web/frontend/src/features/landing/LandingPlatformIntro.tsx
import {
  Home,
  Package,
  ShoppingBag,
  UserRound,
  FilePlus2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";

type LandingMobileTabBarProps = {
  onContact?: () => void;
};

/** 모바일 하단 탭 — 서비스 홈(`/platform`) 전용 */
export function LandingMobileTabBar({ onContact }: LandingMobileTabBarProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);
  const startPath = isAuthenticated ? entryPath : "/signup";
  const accountPath = isAuthenticated ? entryPath : "/login";

  const items: Array<{
    id: string;
    label: string;
    icon: typeof Home;
    onClick: () => void;
    active?: boolean;
  }> = [
    {
      id: "home",
      label: "홈",
      icon: Home,
      active: true,
      onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    },
    {
      id: "request",
      label: "제작 의뢰",
      icon: FilePlus2,
      onClick: () => navigate(startPath),
    },
    {
      id: "store",
      label: "제품 구매",
      icon: ShoppingBag,
      onClick: () => {
        const el = document.getElementById("store");
        if (!el) {
          navigate(startPath);
          return;
        }
        const top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      },
    },
    {
      id: "history",
      label: "내역",
      icon: Package,
      onClick: () => navigate(accountPath),
    },
    {
      id: "my",
      label: "마이",
      icon: UserRound,
      onClick: () => {
        if (isAuthenticated) {
          navigate(accountPath);
          return;
        }
        if (onContact) {
          onContact();
          return;
        }
        navigate(accountPath);
      },
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      aria-label="모바일 하단 메뉴"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex-1">
              <button
                type="button"
                onClick={item.onClick}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium",
                  item.active
                    ? "text-sky-600"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
