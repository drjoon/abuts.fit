// related files:
// - web/frontend/src/shared/sales/platformPitchBlocks.tsx
// - web/frontend/src/pages/salesTeam/SalesPlatformPitchPage.tsx
// - web/frontend/src/pages/salesman/SalesmanPitchPage.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  PlatformPitchAudienceCards,
  PlatformPitchHero,
  PlatformPitchStatGrid,
  PlatformPitchWhyGrid,
  type PlatformPitchStats,
} from "./platformPitchBlocks";

export type { PlatformPitchStats };

export type PlatformPitchApiPath =
  | "/api/sales-team/platform-pitch"
  | "/api/salesman/platform-pitch"
  | "/api/system/platform-pitch";

type PlatformPitchPanelProps = {
  /** API path — sales-team / salesman / public landing */
  apiPath: PlatformPitchApiPath;
  className?: string;
  queryKey?: string;
  /** Override hero title (landing may keep the same default). */
  heroTitle?: string;
  practiceFooter?: ReactNode;
  labFooter?: ReactNode;
};

export function PlatformPitchPanel({
  apiPath,
  className,
  queryKey = "platform-pitch",
  heroTitle,
  practiceFooter,
  labFooter,
}: PlatformPitchPanelProps) {
  const token = useAuthStore((s) => s.token);
  const isPublic = apiPath === "/api/system/platform-pitch";

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, apiPath],
    enabled: isPublic || Boolean(token),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: PlatformPitchStats;
        message?: string;
      }>({
        path: apiPath,
        method: "GET",
        token: isPublic ? undefined : token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "플랫폼 소개 통계 조회에 실패했습니다.");
      }
      return res.data.data || {};
    },
    retry: false,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <PlatformPitchHero title={heroTitle} />
      <PlatformPitchStatGrid stats={data} isLoading={isLoading} />
      <PlatformPitchWhyGrid />
      <PlatformPitchAudienceCards
        practiceFooter={practiceFooter}
        labFooter={labFooter}
      />
    </div>
  );
}
