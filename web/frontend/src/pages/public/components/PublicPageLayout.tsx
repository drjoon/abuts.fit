// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { ReactNode } from "react";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { cn } from "@/shared/ui/cn";

export const PUBLIC_CARD_CLASS =
  "border-white/10 bg-white/[0.08] text-white shadow-[0_25px_65px_rgba(7,7,19,0.28)] backdrop-blur-2xl";

interface PublicPageLayoutProps {
  children: ReactNode;
  contentClassName?: string;
  /** 공개 랜딩(`/`)은 light. 약관·도움말 등 기타 공개 페이지는 dark 유지 */
  tone?: "dark" | "light";
}

const DEFAULT_CONTENT_CLASS =
  "relative z-10 mx-auto w-full max-w-5xl space-y-8 px-4 pt-20 pb-12 sm:space-y-10 sm:px-6 sm:pt-24 sm:pb-16 lg:px-8 lg:py-24";

export const PublicPageLayout = ({
  children,
  contentClassName,
  tone = "dark",
}: PublicPageLayoutProps) => {
  const resolvedContentClass = contentClassName ?? DEFAULT_CONTENT_CLASS;
  const isLight = tone === "light";

  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden",
        isLight ? "bg-[#f7f9fc] text-slate-900" : "bg-[#07111f] text-white",
      )}
    >
      {isLight ? (
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

      <Navigation tone={tone} />

      <main className={resolvedContentClass}>{children}</main>

      <Footer tone={tone} />
    </div>
  );
};
