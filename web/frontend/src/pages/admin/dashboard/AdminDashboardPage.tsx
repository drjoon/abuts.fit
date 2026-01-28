import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch, request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCard } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { RequestorRiskSummaryCard } from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  Users,
  FileText,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  DollarSign,
} from "lucide-react";

type PricingSummary = {
  totalOrders?: number;
  totalRevenue?: number;
  totalBaseAmount?: number;
  totalDiscountAmount?: number;
  avgUnitPrice?: number;
  avgDiscountPerOrder?: number;
};

type PricingUserRow = {
  user?: {
    _id?: string;
    name?: string;
    email?: string;
    organization?: string;
  };
  orders?: number;
  referralLast30DaysOrders?: number;
  totalOrders?: number;
  revenue?: number;
  baseAmount?: number;
  discountAmount?: number;
  avgUnitPrice?: number;
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
  const navigate = useNavigate();
  const [pricingSummary, setPricingSummary] = useState<PricingSummary | null>(
    null,
  );
  const [pricingRows, setPricingRows] = useState<PricingUserRow[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (token === "MOCK_DEV_TOKEN") {
      h["x-mock-role"] = "admin";
    }
    if (token) {
      h["Authorization"] = `Bearer ${token}`;
    }
    return h;
  }, [token]);

  if (!user || user.role !== "admin") return null;

  const {
    data: diameterStatsResponse,
    isError: isDiameterStatsError,
    error: diameterStatsError,
    isFetching: isDiameterStatsFetching,
  } = useQuery({
    queryKey: ["admin-diameter-stats"],
    enabled: Boolean(token),
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<any>({
          path: "/api/requests/diameter-stats",
          method: "GET",
          token,
          signal: controller.signal,
          headers: token
            ? {
                "x-mock-role": "admin",
              }
            : undefined,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("직경별 통계 조회에 실패했습니다.");
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

  const [period, setPeriod] = useState<
    "7d" | "30d" | "lastMonth" | "thisMonth" | "90d" | "all"
  >("30d");

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
          headers: token
            ? {
                "x-mock-role": "admin",
              }
            : undefined,
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
          headers: token
            ? {
                "x-mock-role": "admin",
              }
            : undefined,
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
    const run = async () => {
      if (!token || !user || user.role !== "admin") return;
      setPricingLoading(true);
      try {
        const [sRes, uRes] = await Promise.all([
          request<any>({
            path: "/api/admin/pricing-stats",
            method: "GET",
            headers,
            token,
          }),
          request<any>({
            path: "/api/admin/pricing-stats/users",
            method: "GET",
            headers,
            token,
          }),
        ]);

        if (sRes.ok && sRes.data?.success) setPricingSummary(sRes.data.data);
        if (uRes.ok && uRes.data?.success)
          setPricingRows(uRes.data.data?.items || []);
      } finally {
        setPricingLoading(false);
      }
    };

    void run();
  }, [headers, token, user]);

  const baseData: DashboardData = {
    stats: [
      { label: "총 사용자", value: "0", change: "+0%", icon: Users },
      { label: "활성 의뢰", value: "0", change: "+0%", icon: FileText },
      { label: "월 거래량", value: "0", change: "+0%", icon: TrendingUp },
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
    diameterStatsResponse?.success
      ? diameterStatsResponse.data?.diameterStats
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
  ) : isDiameterStatsError ? (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium mb-2">
          커스텀 어벗먼트 최대 직경별 진행 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center text-muted-foreground text-sm py-10">
          직경별 통계 조회에 실패했습니다.
          {diameterStatsError instanceof Error
            ? ` (${diameterStatsError.message})`
            : ""}
        </div>
      </CardContent>
    </Card>
  ) : !isDiameterStatsFetching && !diameterStatsFromApi ? (
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
      key={isDiameterStatsFetching ? "fetching" : "idle"}
    />
  );

  if (adminDashboardResponse?.success) {
    const userStats = adminDashboardResponse.data.userStats || {};
    const requestStats = adminDashboardResponse.data.requestStats || {};
    const systemAlerts = adminDashboardResponse.data.systemAlerts || [];
    const monthlyVolume = adminDashboardResponse.data.monthlyVolume ?? 0;
    const systemUptime = adminDashboardResponse.data.systemUptime ?? "99.9%";

    const totalUsers = userStats.total ?? 0;
    const activeRequests = requestStats.total ?? 0;

    data = {
      stats: [
        {
          label: "총 사용자",
          value: String(totalUsers),
          change: userStats.change ?? "+0%",
          icon: Users,
        },
        {
          label: "활성 의뢰",
          value: String(activeRequests),
          change: requestStats.change ?? "+0%",
          icon: FileText,
        },
        {
          label: "월 거래량",
          value: String(monthlyVolume),
          change: requestStats.monthlyChange ?? "+0%",
          icon: TrendingUp,
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
      topSection={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {diameterTopSection}
          <RequestorRiskSummaryCard riskSummary={riskSummary} />
        </div>
      }
      stats={
        <>
          {data.stats.map((stat: any, index: number) => (
            <Card key={index} className="app-glass-card app-glass-card--lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{stat.change}</span> 지난 달
                  대비
                </p>
              </CardContent>
            </Card>
          ))}
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 주문</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(pricingSummary?.totalOrders ?? 0).toLocaleString()}건
              </div>
              <p className="text-xs text-muted-foreground">
                {pricingLoading ? "조회 중..." : "기간 내 주문(취소 제외)"}
              </p>
            </CardContent>
          </Card>
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">거래 금액</CardTitle>
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
              <CardTitle className="text-sm font-medium">총 할인액</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{(pricingSummary?.totalDiscountAmount ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                정책 적용 할인 합계
              </p>
            </CardContent>
          </Card>
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 단가</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{(pricingSummary?.avgUnitPrice ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                평균 할인: ₩
                {(pricingSummary?.avgDiscountPerOrder ?? 0).toLocaleString()}
                /건
              </p>
            </CardContent>
          </Card>
        </>
      }
      mainLeft={
        <div className="space-y-6">
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader>
              <CardTitle>시스템 알림</CardTitle>
              <CardDescription>시스템 상태 및 알림입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.systemAlerts?.map((alert: any) => (
                  <div
                    key={alert.id}
                    className="flex items-start space-x-3 p-3 border border-border rounded-lg"
                  >
                    {getAlertIcon(alert.type)}
                    <div className="flex-1">
                      <div className="font-medium">{alert.message}</div>
                      <div className="text-sm text-muted-foreground">
                        {alert.date}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader>
              <CardTitle>사용자별 주문/할인</CardTitle>
              <CardDescription>
                주문 수 및 할인 내역을 확인하세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">사용자</th>
                      <th className="py-2 pr-4">소속</th>
                      <th className="py-2 pr-4">주문</th>
                      <th className="py-2 pr-4">리퍼럴 주문</th>
                      <th className="py-2 pr-4">합산</th>
                      <th className="py-2 pr-4">매출</th>
                      <th className="py-2 pr-4">할인</th>
                      <th className="py-2 pr-4">평균 단가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingRows.map((r) => (
                      <tr
                        key={r.user?._id}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-2 pr-4">
                          <div className="font-medium">
                            {r.user?.name || r.user?._id}
                          </div>
                          {r.user?.email ? (
                            <div className="text-xs text-muted-foreground">
                              {r.user.email}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4">
                          {r.user?.organization || "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {(r.orders || 0).toLocaleString()}건
                        </td>
                        <td className="py-2 pr-4">
                          {(r.referralLast30DaysOrders || 0).toLocaleString()}건
                        </td>
                        <td className="py-2 pr-4">
                          {(r.totalOrders || 0).toLocaleString()}건
                        </td>
                        <td className="py-2 pr-4">
                          ₩{(r.revenue || 0).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">
                            ₩{(r.discountAmount || 0).toLocaleString()}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          ₩{(r.avgUnitPrice || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      }
      mainRight={
        <Card className="app-glass-card app-glass-card--lg">
          <CardHeader>
            <CardTitle>빠른 작업</CardTitle>
            <CardDescription>자주 사용하는 기능들입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate("/dashboard/request-monitoring")}
              >
                <FileText className="mr-2 h-4 w-4" />
                의뢰 모니터링
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate("/dashboard/chat-management")}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                채팅 관리
              </Button>
            </div>
          </CardContent>
        </Card>
      }
    />
  );
};
