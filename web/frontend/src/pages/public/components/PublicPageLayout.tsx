// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { ReactNode } from "react";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";

export const PUBLIC_CARD_CLASS =
  "border-white/15 bg-white/90 text-slate-900 shadow-[0_25px_65px_rgba(7,7,19,0.35)] backdrop-blur-2xl";

interface PublicPageLayoutProps {
  children: ReactNode;
  contentClassName?: string;
}

const DEFAULT_CONTENT_CLASS =
  "relative z-10 mx-auto w-full max-w-5xl space-y-8 px-4 pt-20 pb-12 sm:space-y-10 sm:px-6 sm:pt-24 sm:pb-16 lg:px-8 lg:py-24";

export const PublicPageLayout = ({
  children,
  contentClassName,
}: PublicPageLayoutProps) => {
  const resolvedContentClass = contentClassName ?? DEFAULT_CONTENT_CLASS;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030711] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#030711] via-[#040916] to-[#060d23] opacity-95" />
        <div className="absolute -top-48 -left-40 h-[32rem] w-[34rem] rounded-full bg-gradient-to-br from-primary-strong/45 via-primary-strong/30 to-primary/16 blur-[220px]" />
        <div className="absolute -top-56 -right-36 h-[34rem] w-[32rem] rounded-full bg-gradient-to-br from-primary-strong/45 via-primary-strong/28 to-primary/16 blur-[230px]" />
        <div className="absolute bottom-[-60px] left-[-160px] h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-accent/40 via-accent/26 to-destructive/18 blur-[230px]" />
        <div className="absolute bottom-[-80px] right-[-120px] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-primary-strong/30 via-primary/24 to-primary/16 blur-[240px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(148,163,184,0.08),transparent_55%),radial-gradient(circle_at_78%_65%,rgba(16,185,129,0.06),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)",
            backgroundSize: "90px 90px",
          }}
        />
      </div>

      <Navigation />

      <main className={resolvedContentClass}>{children}</main>

      <Footer />
    </div>
  );
};
