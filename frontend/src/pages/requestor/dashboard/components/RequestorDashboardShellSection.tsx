import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { RequestorDashboardStatsCards } from "@/features/requestor/components/dashboard/RequestorDashboardStatsCards";
import type { RequestorDashboardStat } from "@/features/requestor/components/dashboard/RequestorDashboardStatsCards";
import { RequestorBulkShippingBannerCard } from "@/features/requestor/components/dashboard/RequestorBulkShippingBannerCard";
import { RequestorPricingReferralPolicyCard } from "@/features/requestor/components/dashboard/RequestorPricingReferralPolicyCard";
import { RequestorRecentRequestsCard } from "@/features/requestor/components/dashboard/RequestorRecentRequestsCard";
import { RequestorRiskSummaryCard } from "@/features/requestor/components/dashboard/RequestorRiskSummaryCard";
import { WorksheetDiameterCard } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";

type Props = {
  userName: string;
  period: "7d" | "30d" | "90d" | "all";
  onChangePeriod: (value: "7d" | "30d" | "90d" | "all") => void;
  stats: RequestorDashboardStat[];
  riskSummary: any;
  recentRequests: any[];
  diameterStats?: DiameterStats;
  onOpenBulkModal: () => void;
  onEdit: (request: any) => void;
  onCancel: (requestId: string) => void;
  onRefreshRecentRequests: () => void;
};

export const RequestorDashboardShellSection = ({
  userName,
  period,
  onChangePeriod,
  stats,
  riskSummary,
  recentRequests,
  diameterStats,
  onOpenBulkModal,
  onEdit,
  onCancel,
  onRefreshRecentRequests,
}: Props) => {
  return (
    <DashboardShell
      title={`안녕하세요, ${userName}님!`}
      subtitle="의뢰 현황을 확인하세요."
      headerRight={
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1 text-xs">
          <span className="px-2 text-muted-foreground">기간</span>
          {(["7d", "30d", "90d", "all"] as const).map((value) => {
            const labelMap: Record<string, string> = {
              "7d": "최근 7일",
              "30d": "최근 30일",
              "90d": "최근 90일",
              all: "전체",
            };
            return (
              <button
                key={value}
                type="button"
                onClick={() => onChangePeriod(value)}
                className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                  period === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {labelMap[value]}
              </button>
            );
          })}
        </div>
      }
      stats={<RequestorDashboardStatsCards stats={stats} />}
      topSection={
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <div className="flex flex-col gap-6 h-full">
              <RequestorPricingReferralPolicyCard />
              <RequestorRiskSummaryCard riskSummary={riskSummary} />
            </div>

            <div className="flex flex-col gap-6 h-full">
              <RequestorBulkShippingBannerCard
                onOpenBulkModal={onOpenBulkModal}
              />

              <RequestorRecentRequestsCard
                items={recentRequests}
                onRefresh={onRefreshRecentRequests}
                onEdit={onEdit}
                onCancel={onCancel}
              />
            </div>

            <div>
              <WorksheetDiameterCard stats={diameterStats} />
            </div>
          </div>
        </div>
      }
    />
  );
};
