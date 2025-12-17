import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCard } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { RequestorRiskSummaryCard } from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import {
  Clock,
  CheckCircle,
  TrendingUp,
  FileText,
  MessageSquare,
  Building2,
  Users,
} from "lucide-react";

const mockManufacturerData = {
  stats: [
    { label: "총 주문", value: "47", change: "+15%", icon: Building2 },
    { label: "제작 중", value: "12", change: "+20%", icon: Clock },
    { label: "완료", value: "32", change: "+22%", icon: CheckCircle },
    { label: "고객사", value: "18", change: "+5%", icon: Users },
  ],
  recentOrders: [
    {
      id: "ORD-001",
      title: "서울치과기공소 - 상악 어벗먼트",
      status: "제작중",
      client: "서울치과기공소",
      date: "2025-07-15",
    },
    {
      id: "ORD-002",
      title: "부산치과기공소 - 하악 어벗먼트",
      status: "완료",
      client: "부산치과기공소",
      date: "2025-07-14",
    },
    {
      id: "ORD-003",
      title: "대구치과기공소 - 전치부 어벗먼트",
      status: "의뢰접수",
      client: "대구치과기공소",
      date: "2025-07-13",
    },
  ],
};

export const ManufacturerDashboardPage = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();

  if (!user || user.role !== "manufacturer") return null;

  const { data: diameterStatsResponse } = useQuery({
    queryKey: ["manufacturer-diameter-stats"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/requests/diameter-stats",
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "manufacturer",
            }
          : undefined,
      });
      if (!res.ok) {
        throw new Error("직경별 통계 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
  });

  const { data: riskSummaryResponse } = useQuery({
    queryKey: ["manufacturer-dashboard-risk-summary"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/requests/dashboard-risk-summary?period=30d",
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "manufacturer",
            }
          : undefined,
      });
      if (!res.ok) {
        throw new Error("지연 위험 요약 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
  });

  const baseData = mockManufacturerData;
  let data: any = baseData;
  const diameterStatsFromApi: DiameterStats | undefined =
    diameterStatsResponse?.success
      ? diameterStatsResponse.data?.diameterStats
      : undefined;

  const riskSummary = riskSummaryResponse?.success
    ? riskSummaryResponse.data?.riskSummary ?? null
    : null;
  let manufacturingSummaryFromApi:
    | {
        totalActive: number;
        stages: {
          key: string;
          label: string;
          count: number;
          percent: number;
        }[];
      }
    | undefined;

  void manufacturingSummaryFromApi;

  return (
    <DashboardShell
      title={`안녕하세요, ${user.name}님!`}
      subtitle="제작 현황을 확인하세요."
      topSection={
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
            <WorksheetDiameterCard stats={diameterStatsFromApi} />
            <RequestorRiskSummaryCard riskSummary={riskSummary} />
          </div>
          {manufacturingSummaryFromApi && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground px-1">
              {manufacturingSummaryFromApi.stages.map((s) => (
                <div key={s.key} className="flex items-center gap-1">
                  <span className="font-medium text-slate-700">{s.label}</span>
                  <span>{s.count.toLocaleString()}건</span>
                </div>
              ))}
            </div>
          )}
        </div>
      }
      stats={
        <>
          {data.stats.map((stat: any, index: number) => (
            <Card
              key={index}
              className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg"
            >
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
        </>
      }
      mainLeft={
        <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
          <CardHeader>
            <CardTitle>최근 주문</CardTitle>
            <CardDescription>최근 받은 주문 목록입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentOrders?.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.client} • {item.date}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4">
              전체 보기
            </Button>
          </CardContent>
        </Card>
      }
      mainRight={
        <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
          <CardHeader>
            <CardTitle>빠른 작업</CardTitle>
            <CardDescription>자주 사용하는 기능들입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate("/dashboard/worksheet")}
              >
                <FileText className="mr-2 h-4 w-4" />
                작업 보드 열기
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate("/dashboard/cnc")}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                CNC 대시보드 열기
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate("/dashboard/printer")}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                프린터 현황
              </Button>
            </div>
          </CardContent>
        </Card>
      }
    />
  );
};
