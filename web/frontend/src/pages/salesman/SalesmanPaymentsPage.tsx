/**
 * 영업자(salesman) 전용 정산 페이지.
 *
 * 개발운영사(devops) 정산 페이지는 pages/devops/DevopsPaymentsPage.tsx 참고.
 * 공통 데이터 훅/타입은 features/commission/useCommissionDashboard.ts 참고.
 */

import { useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { Button } from "@/components/ui/button";
import {
  useCommissionDashboard,
  formatMoney,
  type CommissionDashboardData,
} from "@/features/commission/useCommissionDashboard";

export default function SalesmanPaymentsPage() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const { data, loading } = useCommissionDashboard(period);

  const overview: CommissionDashboardData["overview"] = data?.overview ?? {
    referredOrganizationCount: 0,
    monthRevenueAmount: 0,
    monthCommissionAmount: 0,
  };
  const organizations = useMemo(
    () => (Array.isArray(data?.organizations) ? data.organizations : []),
    [data?.organizations],
  );

  if (!user) return null;

  return (
    <>
      <DashboardShell
        title="영업자 정산"
        subtitle="영업자 수수료와 정산 가능 금액을 확인하세요."
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Button
              type="button"
              variant="outline"
              onClick={() => setLedgerOpen(true)}
            >
              정산 원장 보기
            </Button>
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
        stats={
          <>
            {/* 직접 소개 수수료 (5%) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  직접 소개 수수료
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {loading
                  ? "..."
                  : `${formatMoney(overview.directCommissionAmount)}원`}
              </CardContent>
            </Card>
            {/* 간접 소개 수수료 (2.5%) — 영업자 전용 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  간접 소개 수수료
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {loading
                  ? "..."
                  : `${formatMoney(overview.level1CommissionAmount)}원`}
              </CardContent>
            </Card>
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  기간 지급 완료액
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
        mainLeft={
          <Tabs defaultValue="businesses" className="space-y-4">
            <TabsList className="flex h-auto flex-wrap items-center gap-1 bg-transparent p-0">
              <TabsTrigger value="businesses">사업자별 정산</TabsTrigger>
              <TabsTrigger value="policy">정산 기준</TabsTrigger>
            </TabsList>
            <TabsContent value="businesses">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {organizations.length === 0 ? (
                  <Card className="md:col-span-2 xl:col-span-3">
                    <CardContent className="py-10 text-sm text-muted-foreground">
                      선택한 기간에 표시할 정산 대상 사업자가 없습니다.
                    </CardContent>
                  </Card>
                ) : null}
                {organizations.map((org) => (
                  <Card key={String(org.businessAnchorId || org.name)}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {org.name || "-"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">소개 단계</span>
                        <span>
                          {org.referralLevel === "level1"
                            ? "간접 소개"
                            : "직접 소개"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">기간 매출</span>
                        <span>{formatMoney(org.monthRevenueAmount)}원</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          기간 주문수
                        </span>
                        <span>
                          {Number(org.monthOrderCount || 0).toLocaleString()}건
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          기간 정산액
                        </span>
                        <span className="font-semibold">
                          {formatMoney(org.monthCommissionAmount)}원
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="policy">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      영업자 정산 기준
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">직접 비율</span>
                      <span>
                        {Math.round(Number(data?.commissionRate || 0) * 100)}%
                      </span>
                    </div>
                    {/* 영업자는 간접 비율도 표시 */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">간접 비율</span>
                      <span>
                        {Math.round(
                          Number(data?.indirectCommissionRate || 0) * 1000,
                        ) / 10}
                        %
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">정산일</span>
                      <span>매월 {Number(data?.payoutDayOfMonth || 1)}일</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">집계 기준</span>
                      <span>`businessAnchorId`</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">소개 코드</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">내 코드</span>
                      <span className="font-mono font-semibold">
                        {String(data?.referralCode || user.referralCode || "-")}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      정산은 사업자 단위로 계산되며, 수수료 장부의 기준 키는
                      `businessAnchorId`입니다.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        }
        mainRight={null}
      />

      <SalesmanLedgerModal
        open={ledgerOpen}
        onOpenChange={setLedgerOpen}
        mode="self"
      />
    </>
  );
}
