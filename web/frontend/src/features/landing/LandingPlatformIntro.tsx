// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
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
import { landingStats, landingTheme, workflowSteps } from "./landingTheme";

export const LandingPlatformIntro = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);

  const scrollToStore = () => {
    document.getElementById("store")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="platform" className="relative">
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div className="space-y-6 text-center lg:text-left">
          <p
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium tracking-[0.2em] ${landingTheme.glass} animate-slide-up`}
            style={{ animationDelay: "0.05s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
            <span className={landingTheme.accentText}>치과 ↔ 기공소 ↔ 어벗츠</span>
          </p>

          <h1
            className="text-3xl font-semibold leading-tight text-white md:text-4xl animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            치과, 기공소 및 CNC 제조사가 함께 쓰는
            <br />
            <span className={landingTheme.headlineGradient}>
              디지털 제작 워크스페이스
            </span>
          </h1>

          <p
            className="mx-auto max-w-lg text-base leading-relaxed text-white/75 lg:mx-0 animate-slide-up"
            style={{ animationDelay: "0.18s" }}
          >
            커스텀 어벗 제작을 한 흐름으로 — 주문·생산·추적·결제·계산서까지
            치과·기공소·어벗츠가 같은 기록으로 이어집니다.
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
                navigate(isAuthenticated ? entryPath : "/login")
              }
            >
              로그인
            </Button>
          </div>
        </div>

        <div className="space-y-5 animate-hero-rise" style={{ animationDelay: "0.15s" }}>
          <Card className={landingTheme.statCard}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">abuts.fit Snapshot</CardTitle>
              <CardDescription className="text-sm text-slate-500">
                제조 파트너들이 매일 확인하는 핵심 지표
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
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
