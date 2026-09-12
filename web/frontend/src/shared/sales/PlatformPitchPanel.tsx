// related files:
// - web/frontend/src/shared/sales/platformPitchBlocks.tsx
// - web/frontend/src/pages/salesTeam/SalesPlatformPitchPage.tsx
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
import { useQuery } from "@tanstack/react-query";
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

  return (
    <div className={cn("space-y-4", className)}>
      <PlatformPitchHero />
      <PlatformPitchStatGrid stats={data} isLoading={isLoading} />
      <PlatformPitchWhyGrid />
      <PlatformPitchAudienceCards />
    </div>
  );
}
