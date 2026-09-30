// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/hooks/use-mobile.tsx
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/rules.md
// - 2026-09-30: 로그인 후 모바일 1회 — PC 최적화 안내 확인 모달.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useAuthStore } from "@/store/useAuthStore";

const STORAGE_KEY = "abutsfit:mobile-pc-optimized-notice:v1";

function hasSeenNotice(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

const AUTH_SCREEN_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/oauth/callback",
];

function isAuthScreen(pathname: string): boolean {
  return AUTH_SCREEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function markNoticeSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    /* private mode: hide for this visit only */
  }
}

/** After login, once per browser, on viewports below 768px. */
export function MobilePcOptimizedNotice() {
  const { pathname } = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !isMobile ||
      isAuthScreen(pathname) ||
      hasSeenNotice()
    ) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [isAuthenticated, isMobile, pathname]);

  const confirm = () => {
    markNoticeSeen();
    setOpen(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) confirm();
      }}
    >
      <AlertDialogContent className="text-center">
        <AlertDialogHeader className="text-center">
          <AlertDialogTitle>PC에서 사용해 주세요</AlertDialogTitle>
          <AlertDialogDescription className="text-center leading-relaxed">
            이 화면은 PC에 최적화되어 있습니다.
            <br />
            모바일은 해상도가 낮아 일부 기능이 숨겨져 있고, 쓰기 불편한 부분도
            있습니다.
            <br />
            더 많은 기능은 PC에서 사용해 주세요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction className="w-full sm:w-auto" onClick={confirm}>
            확인
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
