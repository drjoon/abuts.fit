import { useEffect, useMemo, useState } from "react";
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
  totalRevenue?: number;
  totalBaseAmount?: number;
  totalDiscountAmount?: number;
  totalShippingFeeSupply?: number;
  avgShippingFeeSupply?: number;
  avgUnitPrice?: number;
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

type PeriodKey = "7d" | "30d" | "lastMonth" | "thisMonth" | "90d" | "all";

const periodToRange = (period: PeriodKey) => {
  const end = new Date();
  const start = new Date(end);

  if (period === "all") return null;

  if (period === "7d") {
    start.setDate(start.getDate() - 7);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (period === "30d") {
    start.setDate(start.getDate() - 30);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (period === "90d") {
    start.setDate(start.getDate() - 90);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  if (period === "thisMonth") {
    return {
      startDate: thisMonthStart.toISOString(),
      endDate: thisMonthEnd.toISOString(),
    };
  }

  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: lastMonthStart.toISOString(),
    endDate: lastMonthEnd.toISOString(),
  };
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
  const [pricingSummary, setPricingSummary] = useState<PricingSummary | null>(
    null,
  );
  const [pricingLoading, setPricingLoading] = useState(false);

  if (!user || user.role !== "admin") return null;

  const [period, setPeriod] = useState<PeriodKey>("30d");

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
    queryKey: ["admin-dashboard-page"],
    enabled: Boolean(token),
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<any>({
          path: "/api/admin/dashboard",
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
      { label: "전체 사용자", value: "0", change: "+0%", icon: Users },
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
          label: "전체 사용자",
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
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      }
      statsGridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      topSection={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
          {diameterTopSection}
          <RequestorRiskSummaryCard riskSummary={riskSummary} />
        </div>
      }
      stats={
        <>
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 사용자</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(Number(data.stats?.[0]?.value || 0) || 0).toLocaleString()}명
              </div>
              <p className="text-xs text-muted-foreground">전체 사용자 수</p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                전체 주문(취소 제외)
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(pricingSummary?.totalOrders ?? 0).toLocaleString()}건
              </div>
              <p className="text-xs text-muted-foreground">
                {pricingLoading ? "조회 중..." : "기간 내 완료 주문"}
              </p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                진행/완료/취소
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Number(data.stats?.[1]?.value || 0).toLocaleString()} /{" "}
                {Number(data.stats?.[2]?.value || 0).toLocaleString()} /{" "}
                {Number(data.stats?.[3]?.value || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                진행 · 완료 · 취소
              </p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                전체 거래금액
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{(pricingSummary?.totalRevenue ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">VAT·배송비 별도</p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 배송비</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩
                {(pricingSummary?.totalShippingFeeSupply ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                배송비 공급가 합계
              </p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                평균 거래금액
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{(pricingSummary?.avgUnitPrice ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                완료 주문 기준 평균
              </p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 배송비</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{(pricingSummary?.avgShippingFeeSupply ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">패키지 기준 평균</p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">시스템상태</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">정상</div>
              <p className="text-xs text-muted-foreground">99.9% 지난달 대비</p>
            </CardContent>
          </Card>
        </>
      }
      mainLeft={undefined}
    />
  );
};
