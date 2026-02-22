import { useEffect, useMemo, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Copy, Users, Wallet, Coins, BadgeCheck, UserPlus } from "lucide-react";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ApiDashboard = {
  ym: string;
  period?: PeriodFilterValue | null;
  commissionRate: number;
  indirectCommissionRate?: number;
  payoutDayOfMonth: number;
  referralCode: string;
  overview: {
    referredOrganizationCount: number;
    monthRevenueAmount: number;
    monthCommissionAmount: number;
    directOrganizationCount?: number;
    level1OrganizationCount?: number;
    totalOrganizationCount?: number;
    directCommissionAmount?: number;
    level1CommissionAmount?: number;
    totalCommissionAmount?: number;
    payableGrossCommissionAmount?: number;
    paidNetCommissionAmount?: number;
  };
  organizations: Array<{
    organizationId: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    referralLevel?: "direct" | "level1";
  }>;
  referralSalesmen?: Array<{
    userId: string;
    name: string;
  }>;
};

const formatMoney = (n: number) => {
  const v = Number(n || 0);
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
};

export const SalesmanDashboardPage = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const referralLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const code = String(user?.referralCode || "").trim();
    if (!code) return "";
    return `${origin}/signup?ref=${encodeURIComponent(code)}`;
  }, [user?.referralCode]);
  const [data, setData] = useState<ApiDashboard | null>(null);
  const [loading, setLoading] = useState(false);

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    request<any>({
      path: `/api/salesman/dashboard?period=${encodeURIComponent(period)}`,
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "대시보드 조회에 실패했습니다.");
        }
        setData(body.data as ApiDashboard);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast, token, period]);

  if (!user) return null;

  const referralCode = String(
    data?.referralCode || user.referralCode || "",
  ).trim();

  const overview = data?.overview || ({} as any);

  const directOrgCount = Number(overview.directOrganizationCount || 0);
  const level1OrgCount = Number(overview.level1OrganizationCount || 0);
  const totalOrgCount = Number(
    overview.totalOrganizationCount || overview.referredOrganizationCount || 0,
  );

  const directCommission = Number(overview.directCommissionAmount || 0);
  const level1Commission = Number(overview.level1CommissionAmount || 0);
  const totalCommission = Number(
    overview.totalCommissionAmount || overview.monthCommissionAmount || 0,
  );

  const payableGross = Number(
    overview.payableGrossCommissionAmount || totalCommission || 0,
  );
  const paidNet = Number(overview.paidNetCommissionAmount || 0);
  const referralSalesmanCount = Number(overview.referralSalesmanCount || 0);

  const directList = (data?.organizations || []).filter(
    (o) => o.referralLevel !== "level1",
  );
  const level1List = (data?.organizations || []).filter(
    (o) => o.referralLevel === "level1",
  );
  const referralSalesmen = data?.referralSalesmen || [];

  const creditRows = (data?.organizations || []).map((o) => {
    return {
      key: String(o.organizationId || o.name || Math.random()),
      name: String(o.name || "의뢰자"),
      referralLevel: o.referralLevel === "level1" ? "리퍼럴" : "내 소개",
      revenue: Number(o.monthRevenueAmount || 0),
      commission: Number(o.monthCommissionAmount || 0),
    };
  });

  return (
    <TooltipProvider>
      <DashboardShell
        title="영업자 대시보드"
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
              의뢰자 정책
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setCreditModalOpen(true)}
            >
              보유 크레딧: {formatMoney(payableGross)}원
            </Button>
          </div>
        }
        statsGridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3"
        stats={
          <>
            <Card className="app-glass-card app-glass-card--lg border-2 border-indigo-500/70 overflow-visible">
              <CardHeader className="pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <BadgeCheck className="h-4 w-4" />내 리퍼럴 코드
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    의뢰자 가입시 기입하는 내 코드
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-4xl font-mono font-bold tracking-widest">
                    {referralCode || "-"}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 border border-indigo-500 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 hover:border-indigo-600"
                    disabled={!referralLink}
                    onClick={async () => {
                      try {
                        if (!referralLink) return;
                        await navigator.clipboard.writeText(referralLink);
                        toast({
                          title: "URL 복사됨",
                          description: referralLink,
                          duration: 2000,
                        });
                      } catch {
                        toast({
                          title: "복사 실패",
                          description: "브라우저 권한을 확인해주세요.",
                          variant: "destructive",
                          duration: 3000,
                        });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    링크 복사
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  내 리퍼럴 코드로 가입한 영업자 수: {referralSalesmanCount}명
                </div>
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-visible">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      소개 의뢰자
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>소개한 의뢰자 수 표시</TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="font-semibold">합계 소개 의뢰자</div>
                  <div className="text-base font-bold">
                    {totalOrgCount} 개소
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">내 소개 의뢰자</div>
                  <div className="font-semibold">{directOrgCount} 개소</div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">
                    리퍼럴 소개 의뢰자
                  </div>
                  <div className="font-semibold">{level1OrgCount} 개소</div>
                </div>
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-visible">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <Coins className="h-4 w-4" />
                      수수료 크레딧
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    필터 적용된 기간 동안 모은, 지급될 세전 수수료
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="font-semibold">합계 수수료 (7.5%)</div>
                  <div className="text-base font-bold">
                    {formatMoney(payableGross)}원
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">내 수수료 (5%)</div>
                  <div className="font-semibold">
                    {formatMoney(directCommission)}원
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">
                    리퍼럴 수수료 (2.5%)
                  </div>
                  <div className="font-semibold">
                    {formatMoney(level1Commission)}원
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  직계 의뢰자 매출의 5%를 기본 수수료로 받고, 직계 1단계
                  영업자가 벌어들인 본인 수수료(5%)의 50%(=2.5%)를 추가로
                  받습니다.
                </div>
              </CardContent>
            </Card>

            <Card className="app-glass-card app-glass-card--lg overflow-visible">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <Wallet className="h-4 w-4" />
                      지급된 수수료
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    필터 적용된 기간 동안, 이미 지급된 세후 수수료
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="font-semibold">합계 수수료 (7.5%)</div>
                  <div className="text-base font-bold">
                    {formatMoney(paidNet)}원
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">내 수수료 (5%)</div>
                  <div className="font-semibold">0원</div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">
                    리퍼럴 수수료 (2.5%)
                  </div>
                  <div className="font-semibold">0원</div>
                </div>
              </CardContent>
            </Card>
          </>
        }
        mainLeft={
          <div className="space-y-3 p-3">
            {loading ? (
              <Card className="app-glass-card app-glass-card--lg">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  불러오는 중...
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Card className="app-glass-card app-glass-card--lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">
                      내 소개 의뢰자 ({directList.length}개소)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {directList.length === 0 ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        내 소개 의뢰자가 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {directList.map((org) => (
                          <li
                            key={org.organizationId}
                            className="flex items-start gap-2"
                          >
                            <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
                            <div className="flex-1">
                              <div className="font-semibold text-sm">
                                {org.name || "의뢰자"}
                              </div>
                              <div className="mt-0.5 pl-3 border-l text-xs text-muted-foreground space-y-0.5">
                                <div>
                                  매출: {formatMoney(org.monthRevenueAmount)}원
                                </div>
                                <div>
                                  수수료:{" "}
                                  {formatMoney(org.monthCommissionAmount)}원
                                </div>
                                <div>완료 건수: {org.monthOrderCount}건</div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className="app-glass-card app-glass-card--lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">
                      리퍼럴 영업자 ({referralSalesmen.length}명)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {referralSalesmen.length === 0 ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        리퍼럴 영업자가 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {referralSalesmen.map((salesman) => (
                          <li
                            key={salesman.userId}
                            className="flex items-start gap-2"
                          >
                            <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
                            <div className="flex-1">
                              <div className="font-semibold text-sm">
                                {salesman.name || "영업자"}
                              </div>
                              <div className="mt-0.5 pl-3 border-l text-xs text-muted-foreground">
                                연결된 소개 영업자입니다.
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        }
        mainRight={null}
      />

      <SalesmanLedgerModal
        open={creditModalOpen}
        onOpenChange={setCreditModalOpen}
        mode="self"
        titleSuffix="보유 크레딧 (미지급 수수료)"
      />
      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </TooltipProvider>
  );
};
