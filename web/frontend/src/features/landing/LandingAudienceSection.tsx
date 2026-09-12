// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { ArrowRight, Building2, Check, Factory } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import type { PlatformPitchStats } from "@/shared/sales/platformPitchBlocks";
import {
  landingAudienceLab,
  landingAudiencePractice,
  landingTheme,
  whyAbutsPoints,
} from "./landingTheme";

export const LandingAudienceSection = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);
  const { ref, inView } = useInView({ threshold: 0.08, triggerOnce: true });

  const { data, isLoading } = useQuery({
    queryKey: ["public-platform-pitch"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: PlatformPitchStats;
        message?: string;
      }>({
        path: "/api/system/platform-pitch",
        method: "GET",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "플랫폼 소개 통계 조회에 실패했습니다.");
      }
      return res.data.data || {};
    },
    retry: false,
  });

  const goSignup = () => {
    navigate(isAuthenticated ? entryPath : "/signup");
  };

  const practiceCount = Number(data?.practiceBusinessCount || 0);
  const labCount = Number(data?.labBusinessCount || 0);
  const monthRequests = Number(data?.monthRequestCount || 0);
  const allTimeRequests = Number(data?.allTimeRequestCount || 0);

  const stats = [
    { label: "가입 치과", value: isLoading ? "…" : `${practiceCount.toLocaleString()}곳` },
    { label: "가입 기공소", value: isLoading ? "…" : `${labCount.toLocaleString()}곳` },
    { label: "이번 달 이용", value: isLoading ? "…" : `${monthRequests.toLocaleString()}건` },
    { label: "누적 이용", value: isLoading ? "…" : `${allTimeRequests.toLocaleString()}건` },
  ];

  return (
    <section
      id="audience"
      className="relative scroll-mt-20 border-t border-white/[0.06] sm:scroll-mt-24"
    >
      <div
        ref={ref}
        className={cn(
          "mx-auto max-w-6xl space-y-10 px-4 py-14 sm:space-y-12 sm:px-6 sm:py-16 lg:py-20 transition-all duration-700",
          inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className={`inline-flex rounded-full px-3.5 py-1 text-[11px] tracking-[0.18em] text-white/55 ${landingTheme.glass}`}>
            WHY ABUTS
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            같은 화면에서 이어지는 제작
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
            납기·배송·정산이 흩어지지 않습니다.
            <br />
            치과와 기공소가 각자 필요한 이유로 같은 플랫폼을 씁니다.
          </p>
        </div>

        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 ${landingTheme.panel} p-2 sm:p-3`}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl px-3 py-3 text-center sm:px-4 sm:py-3.5"
            >
              <p className="text-[11px] text-white/45">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-white sm:text-xl">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {whyAbutsPoints.map((point) => (
            <li
              key={point}
              className={`flex items-start gap-2.5 px-3.5 py-3 ${landingTheme.panelSoft}`}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-sky-200">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="text-sm leading-relaxed text-white/75">{point}</span>
            </li>
          ))}
        </ul>

        <div className="grid gap-4 lg:grid-cols-2">
          <AudiencePanel
            tone="practice"
            icon={Building2}
            shortLabel={landingAudiencePractice.shortLabel}
            headline={landingAudiencePractice.headline}
            subheadline={landingAudiencePractice.subheadline}
            benefits={landingAudiencePractice.landingBenefits}
            cta={landingAudiencePractice.cta}
            onCta={goSignup}
            delayMs={80}
            inView={inView}
          />
          <AudiencePanel
            tone="lab"
            icon={Factory}
            shortLabel={landingAudienceLab.shortLabel}
            headline={landingAudienceLab.headline}
            subheadline={landingAudienceLab.subheadline}
            benefits={landingAudienceLab.landingBenefits}
            cta={landingAudienceLab.cta}
            onCta={goSignup}
            delayMs={140}
            inView={inView}
          />
        </div>
      </div>
    </section>
  );
};

function AudiencePanel({
  tone,
  icon: Icon,
  shortLabel,
  headline,
  subheadline,
  benefits,
  cta,
  onCta,
  delayMs,
  inView,
}: {
  tone: "practice" | "lab";
  icon: typeof Building2;
  shortLabel: string;
  headline: string;
  subheadline: string;
  benefits: readonly string[];
  cta: string;
  onCta: () => void;
  delayMs: number;
  inView: boolean;
}) {
  const isPractice = tone === "practice";
  return (
    <article
      className={cn(
        "flex h-full flex-col p-5 sm:p-6 transition-all duration-700",
        landingTheme.panelSoft,
        isPractice
          ? "ring-1 ring-sky-400/15"
          : "ring-1 ring-emerald-400/15",
        inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            isPractice ? "bg-sky-400/15 text-sky-200" : "bg-emerald-400/15 text-emerald-200",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-semibold tracking-wide text-white/55">
          {shortLabel}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold leading-snug text-white sm:text-xl">
        {headline}
      </h3>
      <p className="mt-1.5 text-sm text-white/55">{subheadline}</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-white/75">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                isPractice ? "bg-sky-300/80" : "bg-emerald-300/80",
              )}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <Button
        className={cn(
          "mt-6 h-11 w-full font-semibold",
          landingTheme.ctaGhost,
          "border-white/15 text-white hover:bg-white/10",
        )}
        onClick={onCta}
      >
        {cta}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </article>
  );
}
