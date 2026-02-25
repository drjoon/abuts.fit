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
    <div className="relative min-h-screen overflow-hidden bg-[#030711] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#030711] via-[#040916] to-[#060d23] opacity-95" />
        <div className="absolute -top-40 -left-24 h-[26rem] w-[26rem] rounded-full bg-gradient-to-br from-indigo-500/40 via-sky-400/28 to-emerald-300/20 blur-[200px]" />
        <div className="absolute -top-48 right-[-160px] h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-blue-500/35 via-cyan-400/22 to-emerald-300/22 blur-[220px]" />
        <div className="absolute bottom-[-140px] left-[-140px] h-[26rem] w-[26rem] rounded-full bg-gradient-to-br from-purple-500/32 via-pink-500/18 to-orange-400/14 blur-[220px]" />
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

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-16 lg:px-0 lg:py-24 space-y-10">
        {children}
      </main>

      <Footer />
    </div>
  );
};
