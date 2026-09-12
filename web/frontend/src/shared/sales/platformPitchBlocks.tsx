// related files:
// - web/frontend/src/shared/sales/PlatformPitchPanel.tsx
// - web/frontend/src/features/landing/LandingAudienceSection.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import {
  Building2,
  Check,
  Factory,
  Layers,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
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

type AudienceCopy =
  | typeof landingAudiencePractice
  | typeof landingAudienceLab;

export function PlatformPitchHero({
  className,
  title = "어벗츠 소개 · 고객 피치",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-5 text-white shadow-sm sm:px-5 sm:py-6",
        className,
      )}
    >
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
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-white/75 md:text-[15px]">
          {landingIdentity.pitch30s}
        </p>
      </div>
    </section>
  );
}

export function PlatformPitchStatGrid({
  stats,
  isLoading,
  className,
}: {
  stats?: PlatformPitchStats | null;
  isLoading?: boolean;
  className?: string;
}) {
  const practiceCount = Number(stats?.practiceBusinessCount || 0);
  const labCount = Number(stats?.labBusinessCount || 0);
  const monthRequests = Number(stats?.monthRequestCount || 0);
  const allTimeRequests = Number(stats?.allTimeRequestCount || 0);

  return (
    <section className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>
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
  );
}

export function PlatformPitchWhyGrid({ className }: { className?: string }) {
  return (
    <section className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {whyAbutsPoints.map((point) => (
        <div
          key={point}
          className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
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
  );
}

export function PlatformPitchAudienceCards({
  className,
  practiceFooter,
  labFooter,
}: {
  className?: string;
  practiceFooter?: ReactNode;
  labFooter?: ReactNode;
}) {
  return (
    <section className={cn("grid gap-3 lg:grid-cols-2", className)}>
      <AudienceCard
        copy={landingAudiencePractice}
        icon={Building2}
        tone="practice"
        footer={practiceFooter}
      />
      <AudienceCard
        copy={landingAudienceLab}
        icon={Factory}
        tone="lab"
        footer={labFooter}
      />
    </section>
  );
}

function AudienceCard({
  copy,
  icon: Icon,
  tone,
  footer,
}: {
  copy: AudienceCopy;
  icon: LucideIcon;
  tone: "practice" | "lab";
  footer?: ReactNode;
}) {
  const isPractice = tone === "practice";
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow duration-300 hover:shadow-md",
        isPractice ? "border-sky-200/80" : "border-emerald-200/80",
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
        {footer ? <div className="mt-auto pt-2">{footer}</div> : null}
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
