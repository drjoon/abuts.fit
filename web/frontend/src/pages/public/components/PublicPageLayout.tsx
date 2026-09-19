// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/public/HelpPage.tsx
import { ReactNode } from "react";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { cn } from "@/shared/ui/cn";

/** 공개 안내 페이지 카드 (라이트) */
export const PUBLIC_CARD_CLASS =
  "border-slate-200/90 bg-white text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.06)]";

/** 페이지 상단 eyebrow / title / subtitle */
export const PUBLIC_PAGE_EYEBROW =
  "text-xs uppercase tracking-[0.35em] text-sky-600/80";
export const PUBLIC_PAGE_TITLE = "text-4xl font-semibold text-[#0b2a5c]";
export const PUBLIC_PAGE_SUBTITLE = "text-slate-600";

interface PublicPageLayoutProps {
  children: ReactNode;
  contentClassName?: string;
  /** 기본 light. Index 랜딩도 light */
  tone?: "dark" | "light";
  /** `/` 히어로 위로 네비를 겹친다 */
  navOverlay?: boolean;
  /** 장식 배경 없이 흰 캔버스. 서브 오퍼(스크린샷 히어로) */
  plain?: boolean;
}

const DEFAULT_CONTENT_CLASS =
  "relative z-10 mx-auto w-full max-w-5xl space-y-8 px-4 pt-20 pb-12 sm:space-y-10 sm:px-6 sm:pt-24 sm:pb-16 lg:px-8 lg:py-24";

export const PublicPageLayout = ({
  children,
  contentClassName,
  tone = "light",
  navOverlay = false,
  plain = false,
}: PublicPageLayoutProps) => {
  const resolvedContentClass = contentClassName ?? DEFAULT_CONTENT_CLASS;
  const isLight = tone === "light";
  const bare = navOverlay || plain;

  return (
    <div
      className={cn(
        "relative min-h-screen",
        bare ? "overflow-x-hidden bg-white text-slate-900" : "overflow-hidden",
        !bare && (isLight ? "bg-[#f7f9fc] text-slate-900" : "bg-[#07111f] text-white"),
      )}
    >
      {bare ? null : isLight ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f7f9fc] to-[#eef3f9]" />
          <div className="absolute -top-32 left-[-6%] h-[28rem] w-[32rem] rounded-full bg-sky-200/35 blur-[120px]" />
          <div className="absolute top-[20%] right-[-10%] h-[30rem] w-[30rem] rounded-full bg-blue-100/40 blur-[130px]" />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d1a2e] via-[#081324] to-[#050d18]" />
          <div className="absolute -top-32 left-[-6%] h-[30rem] w-[34rem] rounded-full bg-sky-300/18 blur-[120px]" />
          <div className="absolute top-[18%] right-[-10%] h-[34rem] w-[34rem] rounded-full bg-white/12 blur-[130px]" />
          <div className="absolute top-[48%] left-[25%] h-[24rem] w-[28rem] rounded-full bg-cyan-200/10 blur-[110px]" />
          <div className="absolute bottom-[-8%] right-[10%] h-[22rem] w-[22rem] rounded-full bg-emerald-300/10 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
              backgroundSize: "88px 88px",
            }}
          />
        </div>
      )}

      <Navigation tone={tone} overlay={navOverlay} />

      <main className={resolvedContentClass}>{children}</main>

      <Footer tone={tone} />
    </div>
  );
};
