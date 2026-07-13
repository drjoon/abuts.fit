/**
 * 개발운영사(devops) 전용 대시보드 페이지.
 * 정산 페이지 내용(수수료 카드 + 원장)을 흡수 통합.
 *
 * 수수료 정책 (rules.md 2.4):
 *   - 개발·운영사 분배율은 유료의뢰비 기준 10%
 *   - 영업자 소개 유무와 무관하게 개발·운영사 분배율은 동일
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { CommissionLedgerInline } from "@/shared/components/CommissionLedgerInline";
import {
  useCommissionDashboard,
  formatMoney,
  type CommissionDashboardData,
} from "@/features/commission/useCommissionDashboard";

export const DevopsDashboardPage = () => {
  const { user, token } = useAuthStore();

  const [policyOpen, setPolicyOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

  const { data, loading } = useCommissionDashboard(period);

  const { data: unmachinableOverviewResponse } = useQuery({
    queryKey: ["devops-unmachinable-overview", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: {
          counts?: Record<string, number>;
          items?: Array<Record<string, unknown>>;
        };
      }>({
        path: `/api/requests/unmachinable-overview?period=${period}&limit=6`,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("가공불가 현황 조회에 실패했습니다.");
      return res.data;
    },
    retry: false,
  });

  if (!user) return null;

  const overview: CommissionDashboardData["overview"] = data?.overview ?? {
    referredOrganizationCount: 0,
    monthRevenueAmount: 0,
    monthCommissionAmount: 0,
  };

  const baseRatePct = Math.round(Number(data?.commissionRate || 0) * 100);
  const unaffiliatedRatePct = Math.round(
    Number(data?.unaffiliatedCommissionRate || 0) * 100,
  );

  const unmachinableCounts = unmachinableOverviewResponse?.success
    ? unmachinableOverviewResponse.data?.counts || {}
    : {};
  const unmachinableItems =
    unmachinableOverviewResponse?.success &&
    Array.isArray(unmachinableOverviewResponse.data?.items)
      ? unmachinableOverviewResponse.data.items
      : [];

  return (
    <>
      <DashboardShell
        title="개발운영사 대시보드"
        subtitle=""
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setPolicyOpen(true)}
            >
              분배 기준
            </Button>
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        topSection={
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">가공불가 단계 현황</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>가능성 {Number(unmachinableCounts.potentialCount || 0).toLocaleString()}건</div>
                <div>판정 {Number(unmachinableCounts.judgedCount || 0).toLocaleString()}건</div>
                <div>확인 {Number(unmachinableCounts.confirmedCount || 0).toLocaleString()}건</div>
              </div>
              <div className="space-y-1 max-h-24 overflow-auto pr-1">
                {unmachinableItems.map((item, idx) => {
                  const rid = String((item as Record<string, unknown>)?.requestId || "").trim();
                  const key = String((item as Record<string, unknown>)?._id || rid || `unmach-${idx}`);
                  const code = String(
                    (item as Record<string, unknown>)?.unmachinableDetailCode || "",
                  );
                  return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                  >
                    <span className="text-xs truncate">{rid || "-"}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {code === "confirmed"
                        ? "확인"
                        : code === "judged"
                          ? "판정"
                          : code === "potential"
                            ? "가능성"
                            : "-"}
                    </Badge>
                  </div>
                  );
                })}
                {unmachinableItems.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    표시할 가공불가 의뢰가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        }
        stats={
          <>
            {/* 기본 X%: 소개 의뢰자 수수료 */}
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  기본 {loading ? "..." : `${baseRatePct}%`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg sm:text-xl md:text-2xl font-bold">
                  {loading
                    ? "..."
                    : `${formatMoney(overview.directCommissionAmount)}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  소개 의뢰자 수수료
                </div>
              </CardContent>
            </Card>

            {/* 영업자 미설정 의뢰자 분배 */}
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  영업자 미설정 의뢰자 분배
                  {!loading && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({unaffiliatedRatePct}%)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg sm:text-xl md:text-2xl font-bold">
                  {loading
                    ? "..."
                    : `${formatMoney(overview.unaffiliatedCommissionAmount)}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  영업자 미설정 의뢰자 수수료
                </div>
              </CardContent>
            </Card>

            {/* 기간 정산 예정액 */}
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  기간 정산 예정액
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg sm:text-xl md:text-2xl font-bold">
                  {loading
                    ? "..."
                    : `${formatMoney(overview.payableGrossCommissionAmount)}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  아직 지급되지 않은 누적 정산 금액
                </div>
              </CardContent>
            </Card>

            {/* 기간 정산 완료액 */}
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  기간 정산 완료액
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg sm:text-xl md:text-2xl font-bold">
                  {loading
                    ? "..."
                    : `${formatMoney(overview.paidNetCommissionAmount)}원`}
                </div>
                <div className="text-xs text-muted-foreground">
                  지급 완료 처리된 정산 누적 금액
                </div>
              </CardContent>
            </Card>
          </>
        }
        mainLeft={<CommissionLedgerInline mode="self" period={period} />}
        mainRight={null}
      />

      <PricingPolicyDialog
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        variant="devops"
      />
    </>
  );
};
