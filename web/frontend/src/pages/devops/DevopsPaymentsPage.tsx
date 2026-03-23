/**
 * 개발운영사(devops) 전용 정산 페이지.
 *
 * 영업자(salesman) 정산 페이지는 pages/payments/SalesmanPaymentsPage.tsx 참고.
 * 공통 데이터 훅/타입은 features/commission/useCommissionDashboard.ts 참고.
 *
 * 수수료 정책 (rules.md 2.4):
 *   - 기본: 직접 소개 의뢰자 매출의 baseCommissionRate%
 *   - 소개: 영업자 미설정 의뢰자 매출의 salesmanDirectRate% (영업자 수수료와 동일 효과)
 */

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommissionLedgerInline } from "@/shared/components/CommissionLedgerInline";
import {
  useCommissionDashboard,
  formatMoney,
  type CommissionDashboardData,
} from "@/features/commission/useCommissionDashboard";

export default function DevopsPaymentsPage() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

  const { data, loading } = useCommissionDashboard(period);

  const overview: CommissionDashboardData["overview"] = data?.overview ?? {
    referredOrganizationCount: 0,
    monthRevenueAmount: 0,
    monthCommissionAmount: 0,
  };

  const baseRatePct = Math.round(Number(data?.commissionRate || 0) * 100);
  const unaffiliatedRatePct = Math.round(
    Number(data?.unaffiliatedCommissionRate || 0) * 100,
  );

  if (!user) return null;

  return (
    <DashboardShell
      title="개발운영사 정산"
      subtitle="개발운영사 분배 현황과 지급 상태를 확인하세요."
      headerRight={<PeriodFilter value={period} onChange={setPeriod} />}
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      stats={
        <>
          {/* 기본 X%: 직접 소개 의뢰자 수수료 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                기본 {loading ? "..." : `${baseRatePct}%`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold">
                {loading
                  ? "..."
                  : `${formatMoney(overview.directCommissionAmount)}원`}
              </div>
              <div className="text-xs text-muted-foreground">
                직접 소개 의뢰자 수수료
              </div>
            </CardContent>
          </Card>

          {/* 영업자 직접 소개 수수료: 영업자 미설정 의뢰자에 salesmanDirectRate 적용 */}
          <Card>
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
              <div className="text-2xl font-bold">
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                기간 정산 예정액
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold">
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                기간 정산 완료액
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold">
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
  );
}
