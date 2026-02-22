import { ReactNode } from "react";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";

export const PUBLIC_CARD_CLASS =
  "border-white/15 bg-white/90 text-slate-900 shadow-[0_25px_65px_rgba(7,7,19,0.35)] backdrop-blur-2xl";

interface PublicPageLayoutProps {
  children: ReactNode;
}

export const PublicPageLayout = ({ children }: PublicPageLayoutProps) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02030b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 -left-16 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-cyan-500/35 via-emerald-400/20 to-blue-500/25 blur-[220px]" />
        <div className="absolute top-1/3 right-[-180px] h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-purple-600/35 via-pink-500/20 to-orange-400/25 blur-[240px]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)",
            backgroundSize: "90px 90px",
          }}
        />
      </div>

      <Navigation />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-16 lg:px-0 lg:py-24 space-y-10">
        {children}
      </main>

      <Footer />
    </div>
  );
};
