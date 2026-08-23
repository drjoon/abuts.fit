// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { LANDING_CAD_PREVIEW } from "./landingAssets";
import {
  landingIdentity,
  landingStats,
  landingTheme,
  workflowSteps,
} from "./landingTheme";

export const LandingPlatformIntro = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);

  return (
    <section id="platform" className="relative">
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-20 sm:gap-10 sm:px-6 sm:pb-16 sm:pt-24 md:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div className="space-y-6 text-center lg:text-left">
          <p
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium tracking-[0.2em] ${landingTheme.glass} animate-slide-up`}
            style={{ animationDelay: "0.05s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
            <span className={landingTheme.accentText}>
              {landingIdentity.eyebrow}
            </span>
          </p>

          <h1
            className="text-3xl font-semibold leading-tight text-white md:text-4xl animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <span className="block text-white/90">abuts.fit</span>
            <span className={`mt-2 block ${landingTheme.headlineGradient}`}>
              {landingIdentity.oneLiner}
            </span>
          </h1>

          <p
            className="mx-auto max-w-lg text-base leading-relaxed text-white/75 lg:mx-0 animate-slide-up"
            style={{ animationDelay: "0.18s" }}
          >
            {landingIdentity.body}
          </p>

          <div
            className="flex flex-wrap items-center justify-center gap-1 lg:justify-start animate-slide-up"
            style={{ animationDelay: "0.24s" }}
          >
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-1">
                <span
                  className={`rounded-full px-3 py-1 text-xs text-white/80 ${landingTheme.glassStrong}`}
                >
                  {step}
                </span>
                {index < workflowSteps.length - 1 && (
                  <ChevronRight className="hidden h-3 w-3 text-white/30 sm:block" />
                )}
              </div>
            ))}
          </div>

          <div
            className="flex flex-wrap items-center justify-center gap-3 lg:justify-start animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            <Button
              size="lg"
              className={`h-11 px-7 font-semibold ${landingTheme.ctaPrimary}`}
              onClick={() =>
                navigate(isAuthenticated ? entryPath : "/signup")
              }
            >
              지금 가입하기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className={`h-11 px-7 border-white/30 bg-transparent text-white hover:bg-white/10 ${landingTheme.ctaGhost}`}
              onClick={() =>
                document
                  .getElementById("audience")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              치과 · 기공소 혜택 보기
            </Button>
          </div>
        </div>

        <div className="space-y-5 animate-hero-rise" style={{ animationDelay: "0.15s" }}>
          <Card className={landingTheme.statCard}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">왜 abuts.fit인가</CardTitle>
              <CardDescription className="text-sm text-slate-500">
                {landingIdentity.vision}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
                {landingStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-slate-200/60 bg-white/80 p-3 text-center"
                  >
                    <p className="text-xl font-semibold text-slate-900 md:text-2xl">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                {landingIdentity.manufacturerNote}
              </p>
            </CardContent>
          </Card>

          <div className={landingTheme.imageFrame}>
            <div className={`${landingTheme.imageInner} animate-landing-float`}>
              <img
                src={LANDING_CAD_PREVIEW}
                alt="커스텀 어벗먼트 CAD 스펙"
                className="w-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
