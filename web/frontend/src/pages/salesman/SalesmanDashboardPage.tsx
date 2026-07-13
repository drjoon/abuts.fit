/**
 * 영업자(salesman) 전용 대시보드 페이지.
 *
 * 개발운영사(devops) 대시보드는 pages/devops/DevopsDashboardPage.tsx 참고.
 * 공통 데이터 훅/타입은 features/commission/useCommissionDashboard.ts 참고.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Copy, Wallet, Coins, BadgeCheck } from "lucide-react";
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

export const SalesmanDashboardPage = () => {
  const { user, token } = useAuthStore();
  const { toast } = useToast();

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [salesmanPolicyOpen, setSalesmanPolicyOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

  const { data, loading } = useCommissionDashboard(period);

  const { data: unmachinableOverviewResponse } = useQuery({
    queryKey: ["salesman-unmachinable-overview", period],
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

  const referralCode = String(data?.referralCode || user.referralCode || "")
    .trim()
    .toUpperCase();
  const normalizedReferralCode = /^[A-Z0-9]{3}$/.test(referralCode)
    ? referralCode
    : "";
  const referralLink =
    typeof window !== "undefined" && normalizedReferralCode
      ? `${window.location.origin}/signup/referral?ref=${encodeURIComponent(normalizedReferralCode)}`
      : "";

  const overview = (data?.overview || {}) as NonNullable<
    ReturnType<typeof useCommissionDashboard>["data"]
  >["overview"];

  const directBusinessCount = Number(
    overview.directBusinessCount || overview.directOrganizationCount || 0,
  );

  const directCommission = Number(overview.directCommissionAmount || 0);

  const payableGross = Number(
    overview.payableGrossCommissionAmount ||
      overview.totalCommissionAmount ||
      overview.monthCommissionAmount ||
      0,
  );
  const paidNet = Number(overview.paidNetCommissionAmount || 0);
  const referralSalesmanCount = (data?.referralSalesmen || []).length;

  const directOrders = (data?.organizations || []).reduce(
    (sum, b) => sum + Number(b?.monthOrderCount || 0),
    0,
  );

  const referralSalesmen = data?.referralSalesmen || [];

  const unmachinableCounts = unmachinableOverviewResponse?.success
    ? unmachinableOverviewResponse.data?.counts || {}
    : {};
  const unmachinableItems =
    unmachinableOverviewResponse?.success &&
    Array.isArray(unmachinableOverviewResponse.data?.items)
      ? unmachinableOverviewResponse.data.items
      : [];

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
              onClick={() => setSalesmanPolicyOpen(true)}
            >
              영업자 정책
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
        topSection={
          <Card className="app-glass-card app-glass-card--lg mx-3 mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">가공불가 단계 현황</CardTitle>
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
        statsGridClassName="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3"
        stats={
          <>
            {/* 내 소개 코드 — 영업자 전용 */}
            <Card className="app-glass-card app-glass-card--lg border-2 border-indigo-500/70 overflow-visible">
              <CardHeader className="pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardTitle className="text-sm font-semibold cursor-help flex items-center gap-1">
                      <BadgeCheck className="h-4 w-4" />내 소개 코드
                    </CardTitle>
                  </TooltipTrigger>
                  <TooltipContent>
                    의뢰자 가입시 기입하는 내 코드
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-mono font-bold tracking-widest">
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
                  내 소개 코드로 가입한 영업자: {referralSalesmanCount}개소
                </div>
              </CardContent>
            </Card>

            {/* 수수료 크레딧 — 1단계 소개 10% 단일 수수료 */}
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
                    필터 적용된 기간 동안 누적된 미지급 정산 금액
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs sm:text-sm">
                  <div className="font-semibold">합계 수수료</div>
                  <div className="text-sm sm:text-base font-bold">
                    {formatMoney(payableGross)}원
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">소개 수수료 (10%)</div>
                  <div className="font-semibold">
                    {formatMoney(directCommission)}원
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 지급된 수수료 */}
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
                  <div className="font-semibold">합계 수수료</div>
                  <div className="text-base font-bold">
                    {formatMoney(paidNet)}원
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">소개 수수료 (10%)</div>
                  <div className="font-semibold">0원</div>
                </div>
              </CardContent>
            </Card>
          </>
        }
        mainLeft={
          <div className="space-y-3 p-3">
            {/* 소개 통계 요약 3-card */}
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  영업자 소개 통계
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4 h-24 animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4 cursor-help">
                          <div className="text-xs font-medium text-muted-foreground mb-3">
                            소개 의뢰자
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                의뢰자 수
                              </span>
                              <span className="text-xl font-bold tabular-nums">
                                {directBusinessCount.toLocaleString()}개소
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                의뢰건수
                              </span>
                              <span className="text-base font-semibold tabular-nums">
                                {directOrders.toLocaleString()}건
                              </span>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        내가 소개한 의뢰자 사업자 (1단계, 10% 수수료 적용)
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4 cursor-help">
                          <div className="text-xs font-medium text-muted-foreground mb-3">
                            소개 영업자
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                영업자
                              </span>
                              <span className="text-xl font-bold tabular-nums">
                                {referralSalesmanCount.toLocaleString()}개소
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                소개 의뢰건수
                              </span>
                              <span className="text-base font-semibold tabular-nums">
                                {directOrders.toLocaleString()}건
                              </span>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        내가 소개한 영업자 수와 1단계 소개 의뢰건수
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* {loading ? (
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
                      소개한 영업자 ({referralSalesmen.length}명)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {referralSalesmen.length === 0 ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        소개한 영업자가 없습니다.
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
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            )} */}
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
      <PricingPolicyDialog
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        variant="default"
      />
      <PricingPolicyDialog
        open={salesmanPolicyOpen}
        onOpenChange={setSalesmanPolicyOpen}
        variant="salesman"
      />
    </TooltipProvider>
  );
};
