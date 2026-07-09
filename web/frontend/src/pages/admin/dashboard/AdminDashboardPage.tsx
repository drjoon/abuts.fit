import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { RequestorRiskSummaryCard } from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import {
  Users,
  FileText,
  CheckCircle,
  AlertCircle,
  DollarSign,
  MessageSquare,
  Mail,
  MessageCircle,
  HelpCircle,
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

type PricingSsotHealth = {
  success?: boolean;
  mismatchCount?: number;
  checkedSnapshotCount?: number;
  checkedAt?: string | null;
  range?: {
    startYmd?: string;
    endYmd?: string;
  } | null;
  topMismatches?: Array<{
    businessAnchorId?: string;
    name?: string;
    gap?: number;
    latestRequestMongoId?: string;
    latestRequestId?: string;
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
  const { period, setPeriod } = usePeriodStore();
  const { counts: commBadgeCounts } = useAdminCommBadges();
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

  const pricingSsotHealth: PricingSsotHealth | null =
    adminDashboardResponse?.success
      ? (adminDashboardResponse.data?.pricingSsotHealth ?? null)
      : null;

  const pricingSsotCheckedAtLabel = pricingSsotHealth?.checkedAt
    ? new Date(pricingSsotHealth.checkedAt).toLocaleString("ko-KR")
    : "-";

  const pricingSsotMismatchCount = Number(
    pricingSsotHealth?.mismatchCount || 0,
  );
  const pricingSsotOk =
    Boolean(pricingSsotHealth?.success) && pricingSsotMismatchCount === 0;

  const riskSummary = riskSummaryResponse?.success
    ? (riskSummaryResponse.data?.riskSummary ?? null)
    : null;

  if (adminDashboardResponse?.success) {
    const userStats = adminDashboardResponse.data.userStats || {};
    const requestStats = adminDashboardResponse.data.requestStats || {};
    const systemAlerts = adminDashboardResponse.data.systemAlerts || [];

    const totalUsers = userStats.total ?? 0;

    const byStatus = requestStats.byStatus || {};
    const totalRequests = requestStats.total ?? 0;

    const receive = byStatus["의뢰"] ?? 0;
    const cam = byStatus["CAM"] ?? 0;
    const machining = byStatus["가공"] ?? 0;
    const packing = byStatus["세척.패킹"] ?? 0;
    const shipping = byStatus["포장.발송"] ?? 0;
    const shippingBoxes = byStatus["포장.발송박스"] ?? 0;
    const tracking = byStatus["추적관리"] ?? 0;
    const trackingBoxes = byStatus["추적관리박스"] ?? 0;
    const canceled = byStatus["취소"] ?? 0;

    const systemUptime = "99.9%";

    data = {
      stats: [
        {
          label: "의뢰/CAM",
          value: `${receive}/${cam}`,
          change: "+0%",
          icon: Users,
        },
        {
          label: "가공",
          value: String(machining),
          change: "+0%",
          icon: FileText,
        },
        {
          label: "세척.패킹",
          value: String(packing),
          change: "+0%",
          icon: CheckCircle,
        },
        {
          label: "포장.발송",
          value: `${shipping}건/${shippingBoxes}박스`,
          change: "+0%",
          icon: AlertCircle,
        },
        {
          label: "추적관리",
          value: `${tracking}건/${trackingBoxes}박스`,
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
    <>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="시스템 관리 대시보드입니다."
        headerRight={undefined}
        statsGridClassName="flex flex-col gap-3"
        topSection={
          <div className="grid grid-cols-1 gap-3 items-stretch">
            <RequestorRiskSummaryCard riskSummary={riskSummary} />
          </div>
        }
        stats={
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                    <div className="text-xs text-muted-foreground">
                      전체 의뢰자
                    </div>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold">
                      {(
                        adminDashboardResponse?.data?.userStats?.total ?? 0
                      ).toLocaleString()}
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
                        {(
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["의뢰"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["CAM"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["가공"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["세척.패킹"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["포장.발송"] || 0,
                          )
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2 ml-6">
                      <div className="text-xs text-muted-foreground">취소</div>
                      <div className="text-2xl font-bold text-muted-foreground">
                        {Number(
                          adminDashboardResponse?.data?.requestStats
                            ?.byStatus?.["취소"] || 0,
                        ).toLocaleString()}
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
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* 카드4: 거래금액 / 평균 단가 / 배송비 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    거래금액 / 평균 단가 / 배송비
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        유료 주문액
                      </div>
                      <div className="text-xl font-bold">
                        ₩{(pricingSummary?.totalRevenue ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        평균 단가
                      </div>
                      <div className="text-xl font-bold">
                        ₩{(pricingSummary?.avgUnitPrice ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        전체 배송비
                      </div>
                      <div className="text-xl font-bold">
                        ₩
                        {(
                          pricingSummary?.totalShippingFeeSupply ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        무료 주문액
                      </div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        ₩
                        {(
                          pricingSummary?.totalBonusRevenue ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        평균 무료 단가
                      </div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        ₩
                        {(
                          pricingSummary?.avgBonusUnitPrice ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        평균 배송비
                      </div>
                      <div className="text-sm font-semibold">
                        ₩
                        {(
                          pricingSummary?.avgShippingFeeSupply ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 카드5: 미처리 통신 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    미처리 통신
                  </CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        채팅
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.chat.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        메시지
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.request.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        메일
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.mail.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <HelpCircle className="h-3 w-3" />
                        문의
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.inquiry.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 카드6: 가격/리퍼럴 SSOT 점검 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    가격 SSOT 점검
                  </CardTitle>
                  <CheckCircle
                    className={`h-4 w-4 ${
                      pricingSsotOk ? "text-green-500" : "text-yellow-500"
                    }`}
                  />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      점검 상태
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        pricingSsotOk ? "text-green-600" : "text-yellow-600"
                      }`}
                    >
                      {pricingSsotOk ? "정상" : "불일치"}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      불일치 건수
                    </div>
                    <div className="text-lg font-semibold">
                      {pricingSsotMismatchCount.toLocaleString()}건
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      점검 기준 스냅샷 수
                    </div>
                    <div className="text-sm font-semibold">
                      {Number(
                        pricingSsotHealth?.checkedSnapshotCount || 0,
                      ).toLocaleString()}
                      건
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    마지막 점검: {pricingSsotCheckedAtLabel}
                  </div>
                  {pricingSsotMismatchCount > 0 &&
                    (pricingSsotHealth?.topMismatches || []).length > 0 && (
                      <div className="border-t pt-2">
                        <div className="text-xs text-muted-foreground mb-1">
                          상위 불일치
                        </div>
                        <div className="space-y-1">
                          {(pricingSsotHealth?.topMismatches || [])
                            .slice(0, 3)
                            .map((m) => {
                              const key = String(
                                m.businessAnchorId ||
                                  m.latestRequestMongoId ||
                                  m.name ||
                                  "",
                              );
                              const latestRequestMongoId = String(
                                m.latestRequestMongoId || "",
                              ).trim();
                              const latestRequestId = String(
                                m.latestRequestId || "",
                              ).trim();
                              const businessAnchorId = String(
                                m.businessAnchorId || "",
                              ).trim();

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="w-full flex items-center justify-between text-xs hover:bg-yellow-50 rounded px-1 py-0.5"
                                  onClick={() => {
                                    // 우선순위:
                                    // 1) 대표 요청이 있으면 요청 모니터링으로 이동(해당 요청 focus)
                                    // 2) 요청이 없으면 사업자 페이지로 이동(해당 anchor focus)
                                    if (latestRequestMongoId) {
                                      const qs = new URLSearchParams();
                                      if (latestRequestMongoId) {
                                        qs.set(
                                          "focusRequestMongoId",
                                          latestRequestMongoId,
                                        );
                                      }
                                      if (latestRequestId) {
                                        qs.set("q", latestRequestId);
                                      }
                                      navigate(
                                        `/dashboard/monitoring?${qs.toString()}`,
                                      );
                                      return;
                                    }

                                    if (businessAnchorId) {
                                      const qs = new URLSearchParams();
                                      qs.set("focusAnchorId", businessAnchorId);
                                      qs.set("q", businessAnchorId);
                                      navigate(
                                        `/dashboard/businesses?${qs.toString()}`,
                                      );
                                    }
                                  }}
                                >
                                  <span className="truncate mr-2 text-left">
                                    {m.name || m.businessAnchorId || "-"}
                                  </span>
                                  <span className="font-semibold text-yellow-700 shrink-0">
                                    gap {Number(m.gap || 0).toLocaleString()}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
          </>
        }
        mainLeft={undefined}
      />
    </>
  );
};
