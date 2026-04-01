/**
 * 개발운영사(devops) 전용 대시보드 페이지.
 * 정산 페이지 내용(수수료 카드 + 원장)을 흡수 통합.
 *
 * 수수료 정책 (rules.md 2.4):
 *   - 기본: 직접 소개 의뢰자 매출의 baseCommissionRate%
 *   - 소개: 영업자 미설정 의뢰자 매출의 salesmanDirectRate%
 */

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { user } = useAuthStore();

  const [policyOpen, setPolicyOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

  const { data, loading } = useCommissionDashboard(period);

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
        stats={
          <>
            {/* 기본 X%: 직접 소개 의뢰자 수수료 */}
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
                  직접 소개 의뢰자 수수료
                </div>
              </CardContent>
            </Card>

            {/* 소개 X%: 영업자 미설정 의뢰자에 salesmanDirectRate 적용 */}
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  영업자 직접 소개 수수료
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
