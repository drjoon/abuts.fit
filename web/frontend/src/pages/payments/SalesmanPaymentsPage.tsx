import { useEffect, useMemo, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { Button } from "@/components/ui/button";

type DashboardResponse = {
  commissionRate: number;
  indirectCommissionRate?: number;
  payoutDayOfMonth: number;
  referralCode: string;
  overview: {
    directOrganizationCount?: number;
    level1OrganizationCount?: number;
    totalOrganizationCount?: number;
    directCommissionAmount?: number;
    level1CommissionAmount?: number;
    totalCommissionAmount?: number;
    payableGrossCommissionAmount?: number;
    paidNetCommissionAmount?: number;
  };
  organizations?: Array<{
    businessAnchorId?: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    referralLevel?: "direct" | "level1";
  }>;
};

const formatMoney = (value?: number) =>
  Number(value || 0).toLocaleString("ko-KR");

export default function SalesmanPaymentsPage() {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const isDevops = user?.role === "devops";
  const roleLabel = isDevops ? "개발운영사" : "영업자";
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    request<any>({
      path: `/api/salesman/dashboard?period=${encodeURIComponent(period)}`,
      method: "GET",
      token,
    })
      .then((res) => {
        const body = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(
            body?.message || "정산 데이터를 불러오지 못했습니다.",
          );
        }
        setData(body.data || null);
      })
      .catch((error: any) => {
        toast({
          title: "정산 조회 실패",
          description: error?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [period, token, toast]);

  const overview = data?.overview || {};
  const organizations = useMemo(
    () => (Array.isArray(data?.organizations) ? data.organizations : []),
    [data?.organizations],
  );

  if (!user || (user.role !== "salesman" && user.role !== "devops"))
    return null;

  return (
    <>
      <DashboardShell
        title={`${roleLabel} 정산`}
        subtitle={`${roleLabel} 수수료와 정산 가능 금액을 확인하세요.`}
        headerRight={
          <div className="flex items-center gap-2">
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
        stats={
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                  총 정산 가능액
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {loading
                  ? "..."
                  : `${formatMoney(overview.payableGrossCommissionAmount)}원`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  총 정산 완료액
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {loading
                  ? "..."
                  : `${formatMoney(overview.paidNetCommissionAmount)}원`}
              </CardContent>
            </Card>
          </div>
        }
        mainLeft={
          <Tabs defaultValue="businesses" className="space-y-4">
            <TabsList>
              <TabsTrigger value="businesses">사업자별 정산</TabsTrigger>
              <TabsTrigger value="policy">정산 정책</TabsTrigger>
            </TabsList>
            <TabsContent value="businesses">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                    <CardTitle className="text-base">정산 비율</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">직접 소개</span>
                      <span>
                        {Math.round(Number(data?.commissionRate || 0) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">간접 소개</span>
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
