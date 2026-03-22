/**
 * 개발운영사(devops) 전용 정산 페이지.
 *
 * 영업자(salesman) 정산 페이지는 pages/payments/SalesmanPaymentsPage.tsx 참고.
 * 공통 데이터 훅/타입은 features/commission/useCommissionDashboard.ts 참고.
 *
 * 수수료 정책 차이:
 *   - 영업자: 직접 소개 5% + 간접 소개 2.5% (4-컬럼 레이아웃)
 *   - 개발운영사: 직접 연결 5%만 (2-컬럼 레이아웃, 간접 수수료 카드 없음)
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

export default function DevopsPaymentsPage() {
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
        title="개발운영사 정산"
        subtitle="개발운영사 분배 현황과 지급 상태를 확인하세요."
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <Button
              type="button"
              variant="outline"
              onClick={() => setLedgerOpen(true)}
            >
              정산 원장
            </Button>
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
        stats={
          <>
            {/* 직접 연결 수수료 (5%) — 개발운영사는 간접 수수료 카드 없음 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  직접 분배 (5%)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {loading
                  ? "..."
                  : `${formatMoney(overview.directCommissionAmount)}원`}
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
          </>
        }
        mainLeft={
          <Tabs defaultValue="businesses" className="space-y-4">
            <TabsList className="flex h-auto flex-wrap items-center gap-1 bg-transparent p-0">
              <TabsTrigger value="businesses">사업자 요약</TabsTrigger>
              <TabsTrigger value="policy">기준</TabsTrigger>
            </TabsList>
            <TabsContent value="businesses">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {organizations.length === 0 ? (
                  <Card className="md:col-span-2 xl:col-span-3">
                    <CardContent className="py-10 text-sm text-muted-foreground">
                      선택한 기간에 표시할 대상 사업자가 없습니다.
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
                        <span className="text-muted-foreground">연결 유형</span>
                        <span>
                          {org.referralLevel === "level1"
                            ? "간접 연결"
                            : "직접 연결"}
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
                    <CardTitle className="text-base">분배 기준</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {/* 개발운영사: 직접 비율만 표시, 간접 비율 항목 없음 */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">직접 비율</span>
                      <span>
                        {Math.round(Number(data?.commissionRate || 0) * 100)}%
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
                    <CardTitle className="text-base">확인 안내</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-muted-foreground">
                      정산은 사업자 기준으로 집계되며, 예정액은 미지급 누적만
                      표시합니다.
                    </div>
                    <div className="text-muted-foreground">
                      계좌 정보는 설정 &gt; 수익 분배에서 관리합니다.
                    </div>
                    <div className="text-muted-foreground">
                      소개자 미지정 가입 건은 운영 정책에 따라 네트워크에 반영될
                      수 있습니다.
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
        title="정산 원장"
        titleSuffix="개발운영사 정산 원장"
      />
    </>
  );
}
