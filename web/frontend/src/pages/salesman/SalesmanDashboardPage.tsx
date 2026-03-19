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
    referredBusinessCount?: number;
    referredOrganizationCount: number;
    monthRevenueAmount: number;
    monthCommissionAmount: number;
    directBusinessCount?: number;
    level1BusinessCount?: number;
    totalBusinessCount?: number;
    directOrganizationCount?: number;
    level1OrganizationCount?: number;
    totalOrganizationCount?: number;
    directCommissionAmount?: number;
    level1CommissionAmount?: number;
    totalCommissionAmount?: number;
    payableGrossCommissionAmount?: number;
    paidNetCommissionAmount?: number;
  };
  businesses?: Array<{
    businessAnchorId?: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    referralLevel?: "direct" | "level1";
  }>;
  organizations: Array<{
    businessAnchorId?: string;
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
  const isDevops = user?.role === "devops";
  const roleLabel = isDevops ? "개발운영사" : "영업자";
  const dashboardTitle = `${roleLabel} 대시보드`;
  const policyButtonLabel = isDevops ? "수익 분배 정책" : "의뢰자 정책";
  const referralCodeHelpText = isDevops
    ? "가입시 기입하는 내 소개 코드"
    : "의뢰자 가입시 기입하는 내 코드";
  const referralSalesmanCountText = isDevops
    ? "내 소개 코드로 연결된 영업자 수"
    : "내 소개 코드로 가입한 영업자 수";
  const referralSalesmanLabel = isDevops
    ? "직접 연결한 영업자"
    : "직접 소개한 영업자";
  const noReferralSalesmanText = isDevops
    ? "직접 연결한 영업자가 없습니다."
    : "직접 소개한 영업자가 없습니다.";
  const referralSalesmanDescription = isDevops
    ? "내 소개 코드로 연결된 영업자입니다."
    : "내가 직접 소개한 영업자입니다.";
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

  const referralCode = String(data?.referralCode || user.referralCode || "")
    .trim()
    .toUpperCase();
  const normalizedReferralCode = /^[A-Z]{3}$/.test(referralCode)
    ? referralCode
    : "";
  const referralLink =
    typeof window !== "undefined" && normalizedReferralCode
      ? `${window.location.origin}/signup/referral?ref=${encodeURIComponent(normalizedReferralCode)}`
      : "";

  const overview = data?.overview || ({} as any);

  const directBusinessCount = Number(
    overview.directBusinessCount || overview.directOrganizationCount || 0,
  );
  const level1BusinessCount = Number(
    overview.level1BusinessCount || overview.level1OrganizationCount || 0,
  );
  const totalBusinessCount = Number(
    overview.totalBusinessCount ||
      overview.referredBusinessCount ||
      overview.totalOrganizationCount ||
      overview.referredOrganizationCount ||
      0,
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

  const referredBusinesses = (
    data?.businesses ||
    data?.organizations ||
    []
  ).filter((business) => Boolean(business));
  const directBusinesses = referredBusinesses.filter(
    (business) => business.referralLevel !== "level1",
  );
  const level1Businesses = referredBusinesses.filter(
    (business) => business.referralLevel === "level1",
  );
  const referralSalesmen = data?.referralSalesmen || [];

  const creditRows = referredBusinesses.map((business) => {
    return {
      key: String(business.businessAnchorId || business.name || Math.random()),
      name: String(business.name || "의뢰자"),
      referralLevel:
        business.referralLevel === "level1" ? "간접 소개" : "직접 소개",
      revenue: Number(business.monthRevenueAmount || 0),
      commission: Number(business.monthCommissionAmount || 0),
    };
  });

  return (
    <TooltipProvider>
      <DashboardShell
        title={dashboardTitle}
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
              {policyButtonLabel}
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
                      <BadgeCheck className="h-4 w-4" />내 소개 코드
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>{referralCodeHelpText}</TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-4xl font-mono font-bold tracking-widest">
                    {normalizedReferralCode || (loading ? "..." : "-")}
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
                  {referralSalesmanCountText}: {referralSalesmanCount}명
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
                    {totalBusinessCount} 개소
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">내 소개 의뢰자</div>
                  <div className="font-semibold">
                    {directBusinessCount} 개소
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">간접 소개 의뢰자</div>
                  <div className="font-semibold">
                    {level1BusinessCount} 개소
                  </div>
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
                    간접 소개 수수료 (2.5%)
                  </div>
                  <div className="font-semibold">
                    {formatMoney(level1Commission)}원
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  직접 소개한 의뢰자 매출의 5%를 기본 수수료로 받고, 내가 직접
                  소개한 영업자가 다시 소개한 의뢰자 매출에 대해서는 2.5%의 간접
                  소개 수수료를 추가로 받습니다.
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
                    간접 소개 수수료 (2.5%)
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
                      내 소개 의뢰자 ({directBusinesses.length}개소)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {directBusinesses.length === 0 ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        내 소개 의뢰자가 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {directBusinesses.map((business) => (
                          <li
                            key={business.businessAnchorId || business.name}
                            className="flex items-start gap-2"
                          >
                            <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
                            <div className="flex-1">
                              <div className="font-semibold text-sm">
                                {business.name || "의뢰자"}
                              </div>
                              <div className="mt-0.5 pl-3 border-l text-xs text-muted-foreground space-y-0.5">
                                <div>
                                  매출:{" "}
                                  {formatMoney(business.monthRevenueAmount)}원
                                </div>
                                <div>
                                  수수료:{" "}
                                  {formatMoney(business.monthCommissionAmount)}
                                  원
                                </div>
                                <div>
                                  완료 건수: {business.monthOrderCount}건
                                </div>
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
                      {referralSalesmanLabel} ({referralSalesmen.length}명)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {referralSalesmen.length === 0 ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        {noReferralSalesmanText}
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
                                {referralSalesmanDescription}
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
