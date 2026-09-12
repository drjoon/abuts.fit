// related files:
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Factory, Layers, Package } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function PlatformPitchPanel({
  apiPath,
  className,
  queryKey = "platform-pitch",
}: PlatformPitchPanelProps) {
  const token = useAuthStore((s) => s.token);
  const [audience, setAudience] = useState<"practice" | "lab">("practice");

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

  const audienceCopy =
    audience === "practice" ? landingAudiencePractice : landingAudienceLab;

  return (
    <Card className={cn("app-glass-card app-glass-card--lg", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">어벗츠 소개 · 고객 피치</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {landingIdentity.pitch30s}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ProofStat
            icon={Building2}
            label="가입 치과"
            value={isLoading ? "…" : `${practiceCount.toLocaleString()}곳`}
          />
          <ProofStat
            icon={Factory}
            label="가입 기공소"
            value={isLoading ? "…" : `${labCount.toLocaleString()}곳`}
          />
          <ProofStat
            icon={Package}
            label="이번 달 이용"
            value={isLoading ? "…" : `${monthRequests.toLocaleString()}건`}
          />
          <ProofStat
            icon={Layers}
            label="누적 이용"
            value={isLoading ? "…" : `${allTimeRequests.toLocaleString()}건`}
          />
        </div>

        <ul className="grid gap-1.5 text-xs text-slate-700 sm:grid-cols-2">
          {whyAbutsPoints.map((point) => (
            <li
              key={point}
              className="rounded-md border border-slate-200/80 bg-white/60 px-2.5 py-1.5"
            >
              {point}
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              className={cn(
                "flex-1 rounded px-2 py-1.5 text-xs font-medium transition",
                audience === "practice"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-muted-foreground hover:text-slate-700",
              )}
              onClick={() => setAudience("practice")}
            >
              {landingAudiencePractice.shortLabel}
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded px-2 py-1.5 text-xs font-medium transition",
                audience === "lab"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-muted-foreground hover:text-slate-700",
              )}
              onClick={() => setAudience("lab")}
            >
              {landingAudienceLab.shortLabel}
            </button>
          </div>
          <div className="rounded-md border border-slate-200/80 bg-white/70 px-3 py-2.5">
            <div className="text-sm font-semibold text-slate-900">
              {audienceCopy.headline}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {audienceCopy.subheadline}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {audienceCopy.benefits.map((b) => (
                <li key={b} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProofStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200/80 bg-white/70 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
