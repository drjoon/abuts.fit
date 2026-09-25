// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/PrivacyPage.tsx
// - web/frontend/src/pages/public/CookiesPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

const STORAGE_KEY = "abutsfit:cookie-consent:v1";

export function CookieConsentBanner() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const reserveChat = isAuthenticated && role !== "admin";
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 px-3 sm:bottom-6 sm:px-6">
      <div
        role="dialog"
        aria-label="쿠키 사용 안내"
        className={cn(
          "pointer-events-auto flex w-full max-w-5xl flex-col gap-3 rounded-2xl bg-[#2c2c2c] px-5 py-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:gap-6 sm:px-6",
          reserveChat ? "mr-16 sm:mr-[5.25rem]" : "mx-auto",
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
