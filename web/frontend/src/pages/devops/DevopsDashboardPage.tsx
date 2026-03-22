/**
 * 개발운영사(devops) 전용 대시보드 페이지.
 *
 * 영업자(salesman) 대시보드는 pages/salesman/SalesmanDashboardPage.tsx 참고.
 * 공통 데이터 훅/타입은 features/commission/useCommissionDashboard.ts 참고.
 *
 * 수수료 정책 차이:
 *   - 영업자: 직접 소개 5% + 간접 소개 2.5%
 *   - 개발운영사: 직접 연결 5%만 (간접 수수료 없음) → 백엔드가 level1CommissionAmount = 0 반환
 */

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Users, Wallet, Coins } from "lucide-react";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useCommissionDashboard,
  formatMoney,
} from "@/features/commission/useCommissionDashboard";

export const DevopsDashboardPage = () => {
  const { user } = useAuthStore();

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

  const { data, loading } = useCommissionDashboard(period);

  if (!user) return null;

  const overview = data?.overview || ({} as any);

  const directBusinessCount = Number(
    overview.directBusinessCount || overview.directOrganizationCount || 0,
  );
  const totalBusinessCount = Number(
    overview.totalBusinessCount ||
      overview.referredBusinessCount ||
      overview.totalOrganizationCount ||
      overview.referredOrganizationCount ||
      0,
  );

  // 개발운영사는 직접 연결 5%만 받음. level1CommissionAmount는 백엔드가 0으로 반환
  const directCommission = Number(overview.directCommissionAmount || 0);
  const totalCommission = Number(
    overview.totalCommissionAmount || overview.monthCommissionAmount || 0,
  );
  const payableGross = Number(
    overview.payableGrossCommissionAmount || totalCommission || 0,
  );
  const paidNet = Number(overview.paidNetCommissionAmount || 0);

  return (
    <TooltipProvider>
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setCreditModalOpen(true)}
            >
              미지급: {formatMoney(payableGross)}원
            </Button>
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-3"
        stats={
          <>
            {/* 연결 의뢰자 — 직접 연결만 표시 (개발운영사는 간접 네트워크 없음) */}
            <Card className="app-glass-card app-glass-card--lg overflow-visible">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      연결 의뢰자
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    개발운영사에 직접 연결된 의뢰자 수
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="font-semibold">전체</div>
                  <div className="text-base font-bold">
                    {totalBusinessCount} 개소
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">직접</div>
                  <div className="font-semibold">
                    {directBusinessCount} 개소
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 정산 예정액 — 직접 연결 5%만 (간접 없음) */}
            <Card className="app-glass-card app-glass-card--lg overflow-visible">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <Coins className="h-4 w-4" />
                      정산 예정액
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    필터 기간 누적 미지급 정산 금액 (직접 연결 5%)
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="text-3xl font-bold">
                  {loading ? "..." : `${formatMoney(payableGross)}원`}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-muted-foreground">직접 연결 (5%)</div>
                    <div className="font-semibold">
                      {formatMoney(directCommission)}원
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  최근 기준 누적 미지급 금액
                </div>
              </CardContent>
            </Card>

            {/* 지급 완료액 */}
            <Card className="app-glass-card app-glass-card--lg overflow-visible">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <Wallet className="h-4 w-4" />
                      지급 완료액
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    필터 기간 동안 이미 지급된 누적 금액
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="text-3xl font-bold">
                  {loading ? "..." : `${formatMoney(paidNet)}원`}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-muted-foreground">상태</div>
                    <div className="font-semibold">
                      {paidNet > 0 ? "지급 반영" : "지급 내역 없음"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-muted-foreground">확인</div>
                    <div className="font-semibold">원장 기준</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  지급 완료 처리된 누적 금액
                </div>
              </CardContent>
            </Card>
          </>
        }
        mainLeft={null}
        mainRight={null}
      />

      <SalesmanLedgerModal
        open={creditModalOpen}
        onOpenChange={setCreditModalOpen}
        mode="self"
        title="정산 원장"
        titleSuffix="개발운영사 정산 원장"
      />
      {/* devops variant: 직접 연결 5% 정책만 표시 */}
      <PricingPolicyDialog
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        variant="devops"
      />
    </TooltipProvider>
  );
};
