// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { LANDING_CAD_PREVIEW } from "./landingAssets";
import { landingIdentity, landingTheme } from "./landingTheme";

export const LandingPlatformIntro = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);

  return (
    <section
      id="platform"
      className="relative isolate min-h-[min(100svh,900px)] overflow-hidden"
    >
      {/* Soft light field */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#07101c] to-[#030711]" />
        <div className="absolute -top-24 left-1/4 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-[100px]" />
        <div className="absolute top-10 right-[-5%] h-[32rem] w-[32rem] rounded-full bg-white/15 blur-[110px]" />
        <div className="absolute bottom-0 left-[-8%] h-[22rem] w-[22rem] rounded-full bg-cyan-300/12 blur-[90px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(186,230,253,0.18),transparent_55%)]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[min(100svh,900px)] max-w-6xl items-center gap-10 px-4 pb-16 pt-28 sm:gap-12 sm:px-6 sm:pb-20 sm:pt-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-24">
        <div className="max-w-xl space-y-6 animate-slide-up lg:max-w-none">
          <p
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-[0.18em] ${landingTheme.glassStrong}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.85)]" />
            <span className="text-sky-100/90">{landingIdentity.eyebrow}</span>
          </p>

          <div className="space-y-3">
            <h1 className="notranslate text-4xl font-semibold tracking-tight text-white drop-shadow-[0_0_28px_rgba(255,255,255,0.18)] sm:text-5xl md:text-6xl">
              {landingIdentity.brandLine}
            </h1>
            <p className="text-lg font-medium leading-snug text-white sm:text-xl md:text-[1.65rem] md:leading-snug">
              {landingIdentity.oneLiner}
            </p>
            <p className="max-w-lg text-sm leading-relaxed text-slate-200/85 sm:text-base">
              {landingIdentity.body}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="lg"
              className={`h-11 px-7 font-semibold shadow-[0_0_40px_rgba(255,255,255,0.22)] ${landingTheme.ctaPrimary}`}
              onClick={() => navigate(isAuthenticated ? entryPath : "/signup")}
            >
              지금 가입하기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className={`h-11 px-7 border-white/25 bg-white/[0.06] text-white hover:bg-white/12 ${landingTheme.ctaGhost}`}
              onClick={() => {
                const el = document.getElementById("audience");
                if (!el) return;
                const navOffset = 80; // fixed nav h-14/h-16 + breathing room
                const top =
                  el.getBoundingClientRect().top + window.scrollY - navOffset;
                window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
              }}
            >
              치과 · 기공소 혜택
            </Button>
          </div>
        </div>

        <div
          className="relative mx-auto w-full max-w-xl animate-hero-rise lg:max-w-none"
          style={{ animationDelay: "0.12s" }}
        >
          {/* Key light behind product */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.38)_0%,rgba(125,211,252,0.22)_32%,transparent_68%)] blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 top-8 h-40 w-40 rounded-full bg-sky-200/35 blur-3xl"
          />
          <div
            className={`${landingTheme.imageFrame} relative shadow-[0_0_80px_rgba(186,230,253,0.22)]`}
          >
            <div
              className={`${landingTheme.imageInner} bg-gradient-to-br from-white via-slate-50 to-sky-50/90 p-2 sm:p-3`}
            >
              <img
                src={LANDING_CAD_PREVIEW}
                alt="커스텀 어벗먼트 CAD 스펙"
                className="w-full object-contain animate-landing-float"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
