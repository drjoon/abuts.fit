// related files:
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/pages/salesTeam/SalesPlatformPitchPage.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Factory,
  Layers,
  Package,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  landingAudienceLab,
  landingAudiencePractice,
  landingIdentity,
  whyAbutsPoints,
} from "@/features/landing/landingTheme";

export type PlatformPitchStats = {
  practiceBusinessCount?: number;
  labBusinessCount?: number;
  monthRequestCount?: number;
  allTimeRequestCount?: number;
};

type PlatformPitchPanelProps = {
  /** API path — sales-team or salesman */
  apiPath: "/api/sales-team/platform-pitch" | "/api/salesman/platform-pitch";
  className?: string;
  queryKey?: string;
};

type AudienceCopy =
  | typeof landingAudiencePractice
  | typeof landingAudienceLab;

export function PlatformPitchPanel({
  apiPath,
  className,
  queryKey = "platform-pitch",
}: PlatformPitchPanelProps) {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, apiPath],
    enabled: Boolean(token),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: PlatformPitchStats;
        message?: string;
      }>({
        path: apiPath,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "플랫폼 소개 통계 조회에 실패했습니다.");
      }
      return res.data.data || {};
    },
    retry: false,
  });

  const practiceCount = Number(data?.practiceBusinessCount || 0);
  const labCount = Number(data?.labBusinessCount || 0);
  const monthRequests = Number(data?.monthRequestCount || 0);
  const allTimeRequests = Number(data?.allTimeRequestCount || 0);

  return (
    <div className={cn("space-y-4", className)}>
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-5 text-white shadow-sm sm:px-5 sm:py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl"
        />
        <div className="relative space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
            {landingIdentity.eyebrow}
          </p>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            어벗츠 소개 · 고객 피치
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-white/75">
            {landingIdentity.pitch30s}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <ProofStat
          icon={Building2}
          label="가입 치과"
          value={isLoading ? "…" : `${practiceCount.toLocaleString()}곳`}
          tone="sky"
        />
        <ProofStat
          icon={Factory}
          label="가입 기공소"
          value={isLoading ? "…" : `${labCount.toLocaleString()}곳`}
          tone="emerald"
        />
        <ProofStat
          icon={Package}
          label="이번 달 이용"
          value={isLoading ? "…" : `${monthRequests.toLocaleString()}건`}
          tone="slate"
        />
        <ProofStat
          icon={Layers}
          label="누적 이용"
          value={isLoading ? "…" : `${allTimeRequests.toLocaleString()}건`}
          tone="slate"
        />
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        {whyAbutsPoints.map((point) => (
          <div
            key={point}
            className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <p className="text-xs leading-relaxed text-slate-700 sm:text-[13px]">
              {point}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <AudienceCard
          copy={landingAudiencePractice}
          icon={Building2}
          tone="practice"
        />
        <AudienceCard
          copy={landingAudienceLab}
          icon={Factory}
          tone="lab"
        />
      </section>
    </div>
  );
}

function AudienceCard({
  copy,
  icon: Icon,
  tone,
}: {
  copy: AudienceCopy;
  icon: LucideIcon;
  tone: "practice" | "lab";
}) {
  const isPractice = tone === "practice";
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow duration-300 hover:shadow-md",
        isPractice
          ? "border-sky-200/80"
          : "border-emerald-200/80",
      )}
    >
      <div
        className={cn(
          "relative border-b px-4 pb-4 pt-4 sm:px-5 sm:pt-5",
          isPractice
            ? "border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white"
            : "border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset",
              isPractice
                ? "bg-sky-600 text-white ring-sky-500/30"
                : "bg-emerald-600 text-white ring-emerald-500/30",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
                isPractice
                  ? "bg-sky-100 text-sky-800"
                  : "bg-emerald-100 text-emerald-800",
              )}
            >
              {copy.shortLabel}
            </span>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              {copy.headline}
            </h3>
            <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
              {copy.subheadline}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
        <p className="text-xs leading-relaxed text-slate-600 sm:text-[13px]">
          {copy.pitch}
        </p>
        <ul className="space-y-2">
          {copy.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                  isPractice
                    ? "bg-sky-100 text-sky-700"
                    : "bg-emerald-100 text-emerald-700",
                )}
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span className="text-xs leading-relaxed text-slate-700 sm:text-[13px]">
                {benefit}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function ProofStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "sky" | "emerald" | "slate";
}) {
  const toneCls =
    tone === "sky"
      ? "from-sky-50 to-white border-sky-200/70 text-sky-700"
      : tone === "emerald"
        ? "from-emerald-50 to-white border-emerald-200/70 text-emerald-700"
        : "from-slate-50 to-white border-slate-200/80 text-slate-500";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-gradient-to-b px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]",
        toneCls,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="h-3.5 w-3.5 opacity-80" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-bold tracking-tight tabular-nums text-slate-900 sm:text-xl">
        {value}
      </div>
    </div>
  );
}
