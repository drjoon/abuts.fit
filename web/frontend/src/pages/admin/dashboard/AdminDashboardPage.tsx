import { useEffect, useMemo, useState } from "react";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCard } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { RequestorRiskSummaryCard } from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  Users,
  FileText,
  CheckCircle,
  AlertCircle,
  DollarSign,
} from "lucide-react";

type PricingSummary = {
  totalOrders?: number;
  paidOrders?: number;
  bonusOrders?: number;
  totalRevenue?: number;
  totalBonusRevenue?: number;
  totalBaseAmount?: number;
  totalDiscountAmount?: number;
  totalShippingFeeSupply?: number;
  avgShippingFeeSupply?: number;
  avgUnitPrice?: number;
  avgBonusUnitPrice?: number;
  avgDiscountPerOrder?: number;
};

type DashboardStat = {
  label: string;
  value: string;
  change?: string;
  icon: any;
};

type DashboardData = {
  stats: DashboardStat[];
  systemAlerts: Array<{
    id: string;
    message: string;
    type: string;
    date: string;
  }>;
};

const getAlertIcon = (type: string) => {
  switch (type) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case "info":
    default:
      return <AlertCircle className="h-4 w-4 text-blue-500" />;
  }
};

export const AdminDashboardPage = () => {
  const { user, token } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const [pricingSummary, setPricingSummary] = useState<PricingSummary | null>(
    null,
  );
  const [pricingLoading, setPricingLoading] = useState(false);

  if (!user || user.role !== "admin") return null;

  const { data: riskSummaryResponse } = useQuery({
    queryKey: ["admin-dashboard-risk-summary", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<any>({
          path: `/api/requests/dashboard-risk-summary?period=${period}`,
          method: "GET",
          token,
          signal: controller.signal,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("지연 위험 요약 조회에 실패했습니다.");
        }
        return res.data;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw new Error("요청 시간이 초과되었습니다.");
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    retry: false,
  });

  const { data: adminDashboardResponse } = useQuery({
    queryKey: ["admin-dashboard-page", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<any>({
          path: `/api/admin/dashboard${rangeQuery}`,
          method: "GET",
          token,
          signal: controller.signal,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("관리자 대시보드 조회에 실패했습니다.");
        }
        return res.data;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw new Error("요청 시간이 초과되었습니다.");
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    retry: false,
  });

  useEffect(() => {
    setPricingLoading(false);
  }, []);

  const rangeQuery = useMemo(() => {
    const r = periodToRange(period);
    if (!r) return "";
    const qs = new URLSearchParams({
      startDate: r.startDate,
      endDate: r.endDate,
    });
    return `?${qs.toString()}`;
  }, [period]);

  const { data: pricingSummaryResponse, isFetching: isPricingSummaryFetching } =
    useQuery({
      queryKey: ["admin-pricing-summary", period],
      enabled: Boolean(token),
      queryFn: async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        try {
          const res = await request<any>({
            path: `/api/admin/pricing-stats${rangeQuery}`,
            method: "GET",
            signal: controller.signal,
            token,
          });
          if (!res.ok || !res.data?.success) {
            throw new Error("가격 통계 조회에 실패했습니다.");
          }
          return res.data;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            throw new Error("요청 시간이 초과되었습니다.");
          }
          throw e;
        } finally {
          clearTimeout(timer);
        }
      },
      retry: false,
    });

  useEffect(() => {
    const s = pricingSummaryResponse?.success
      ? pricingSummaryResponse.data
      : null;
    setPricingSummary(s);
    setPricingLoading(isPricingSummaryFetching);
  }, [pricingSummaryResponse, isPricingSummaryFetching]);

  const baseData: DashboardData = {
    stats: [
      { label: "전체 의뢰자", value: "0", change: "+0%", icon: Users },
      { label: "진행", value: "0", change: "+0%", icon: FileText },
      { label: "완료", value: "0", change: "+0%", icon: CheckCircle },
      { label: "취소", value: "0", change: "+0%", icon: AlertCircle },
      {
        label: "시스템 상태",
        value: "정상",
        change: "99.9%",
        icon: CheckCircle,
      },
    ],
    systemAlerts: [],
  };

  let data: DashboardData = baseData;
  const diameterStatsFromApi: DiameterStats | undefined =
    adminDashboardResponse?.success
      ? (adminDashboardResponse.data?.diameterStats as
          | DiameterStats
          | undefined)
      : undefined;

  const riskSummary = riskSummaryResponse?.success
    ? (riskSummaryResponse.data?.riskSummary ?? null)
    : null;

  const diameterTopSection = !token ? (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium mb-2">
          커스텀 어벗먼트 최대 직경별 진행 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center text-muted-foreground text-sm py-10">
          로그인이 필요합니다.
        </div>
      </CardContent>
    </Card>
  ) : !diameterStatsFromApi ? (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium mb-2">
          커스텀 어벗먼트 최대 직경별 진행 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center text-muted-foreground text-sm py-10">
          통계 데이터를 불러올 수 없습니다.
        </div>
      </CardContent>
    </Card>
  ) : (
    <WorksheetDiameterCard
      stats={diameterStatsFromApi}
      key={"admin-dashboard"}
    />
  );

  if (adminDashboardResponse?.success) {
    const userStats = adminDashboardResponse.data.userStats || {};
    const requestStats = adminDashboardResponse.data.requestStats || {};
    const systemAlerts = adminDashboardResponse.data.systemAlerts || [];

    const totalUsers = userStats.total ?? 0;

    const byStatus = requestStats.byStatus || {};
    const totalRequests = requestStats.total ?? 0;
    const completed = byStatus["완료"] ?? 0;
    const canceled = byStatus["취소"] ?? 0;
    const inProgress = Math.max(totalRequests - completed - canceled, 0);

    const systemUptime = "99.9%";

    data = {
      stats: [
        {
          label: "전체 의뢰자",
          value: String(totalUsers),
          change: "+0%",
          icon: Users,
        },
        {
          label: "진행",
          value: String(inProgress),
          change: "+0%",
          icon: FileText,
        },
        {
          label: "완료",
          value: String(completed),
          change: "+0%",
          icon: CheckCircle,
        },
        {
          label: "취소",
          value: String(canceled),
          change: "+0%",
          icon: AlertCircle,
        },
        {
          label: "시스템 상태",
          value: "정상",
          change: String(systemUptime),
          icon: CheckCircle,
        },
      ],
      systemAlerts,
    };
  }

  return (
    <DashboardShell
      title={`안녕하세요, ${user.name}님!`}
      subtitle="시스템 관리 대시보드입니다."
      headerRight={undefined}
      statsGridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      topSection={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
          {diameterTopSection}
          <RequestorRiskSummaryCard riskSummary={riskSummary} />
        </div>
      }
      stats={
        <>
          {/* 카드1: 전체 사용자 / 전체 완료 주문 */}
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                사용자 / 주문
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">전체 의뢰자</div>
                <div className="text-2xl font-bold">
                  {(Number(data.stats?.[0]?.value || 0) || 0).toLocaleString()}
                  명
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  전체 완료 주문
                </div>
                <div className="text-lg font-semibold">
                  {(pricingSummary?.totalOrders ?? 0).toLocaleString()}건
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 카드2: 진행/완료/취소 - 유료/무료 분리 */}
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                진행 / 완료 / 취소
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-end justify-between gap-2 mr-6">
                  <div className="text-xs text-muted-foreground">진행</div>
                  <div className="text-2xl font-bold">
                    {Number(data.stats?.[1]?.value || 0).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2 ml-6">
                  <div className="text-xs text-muted-foreground">취소</div>
                  <div className="text-2xl font-bold text-muted-foreground">
                    {Number(data.stats?.[3]?.value || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-end justify-between gap-2 mr-6">
                  <div className="text-xs text-muted-foreground">
                    완료(유료)
                  </div>
                  <div className="text-lg font-semibold">
                    {(pricingSummary?.paidOrders ?? 0).toLocaleString()}건
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2 ml-6">
                  <div className="text-xs text-muted-foreground">
                    완료(무료)
                  </div>
                  <div className="text-lg font-semibold text-muted-foreground">
                    {(pricingSummary?.bonusOrders ?? 0).toLocaleString()}건
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 카드3: 거래금액 */}
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">거래금액</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">유료 주문액</div>
                <div className="text-2xl font-bold">
                  ₩{(pricingSummary?.totalRevenue ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">무료 주문액</div>
                <div className="text-lg font-semibold text-muted-foreground">
                  ₩{(pricingSummary?.totalBonusRevenue ?? 0).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 카드4: 평균 단가 */}
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 단가</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  평균 유료 단가
                </div>
                <div className="text-2xl font-bold">
                  ₩{(pricingSummary?.avgUnitPrice ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  평균 무료 단가
                </div>
                <div className="text-lg font-semibold text-muted-foreground">
                  ₩{(pricingSummary?.avgBonusUnitPrice ?? 0).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 카드5: 배송비 */}
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">배송비</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">전체 배송비</div>
                <div className="text-2xl font-bold">
                  ₩
                  {(
                    pricingSummary?.totalShippingFeeSupply ?? 0
                  ).toLocaleString()}
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xs text-muted-foreground">평균 배송비</div>
                <div className="text-lg font-semibold">
                  ₩
                  {(pricingSummary?.avgShippingFeeSupply ?? 0).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      }
      mainLeft={undefined}
    />
  );
};
