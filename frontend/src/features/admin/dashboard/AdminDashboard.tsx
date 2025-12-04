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
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCardForDashboard } from "@/pages/requestor/WorkSheet";
import type { DiameterStats } from "@/shared/components/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/components/dashboard/DashboardShell";
import {
  Users,
  FileText,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

const mockAdminData = {
  stats: [
    { label: "총 사용자", value: "234", change: "+8%", icon: Users },
    { label: "활성 의뢰", value: "56", change: "+12%", icon: FileText },
    { label: "월 거래량", value: "1,234", change: "+25%", icon: TrendingUp },
    {
      label: "시스템 상태",
      value: "정상",
      change: "99.9%",
      icon: CheckCircle,
    },
  ],
  systemAlerts: [
    {
      id: "ALT-001",
      message: "새로운 제조사 승인 대기 중",
      type: "info",
      date: "2025-07-15",
    },
    {
      id: "ALT-002",
      message: "월간 보고서 생성 완료",
      type: "success",
      date: "2025-07-14",
    },
    {
      id: "ALT-003",
      message: "서버 점검 예정",
      type: "warning",
      date: "2025-07-13",
    },
  ],
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

export const AdminDashboard = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  if (!user || user.role !== "admin") return null;

  const { data: adminDashboardResponse } = useQuery({
    queryKey: ["admin-dashboard-page"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) {
        throw new Error("관리자 대시보드 조회에 실패했습니다.");
      }
      return res.json();
    },
  });

  const baseData = mockAdminData;
  let data: any = baseData;
  let diameterStatsFromApi: DiameterStats | undefined;

  if (adminDashboardResponse?.success) {
    const userStats = adminDashboardResponse.data.userStats;
    const requestStats = adminDashboardResponse.data.requestStats;

    const totalUsers = userStats?.total ?? baseData.stats[0]?.value ?? 0;
    const totalRequests = requestStats?.total ?? baseData.stats[1]?.value ?? 0;

    data = {
      ...baseData,
      stats: [
        {
          label: "총 사용자",
          value: String(totalUsers),
          change: baseData.stats[0]?.change ?? "+0%",
          icon: Users,
        },
        {
          label: "활성 의뢰",
          value: String(totalRequests),
          change: baseData.stats[1]?.change ?? "+0%",
          icon: FileText,
        },
        baseData.stats[2],
        baseData.stats[3],
      ],
      systemAlerts: baseData.systemAlerts,
    };

    if (adminDashboardResponse.data.diameterStats) {
      diameterStatsFromApi = adminDashboardResponse.data
        .diameterStats as DiameterStats;
    }
  }

  return (
    <DashboardShell
      title={`안녕하세요, ${user.name}님!`}
      subtitle="시스템 관리 대시보드입니다."
      topSection={
        <WorksheetDiameterCardForDashboard stats={diameterStatsFromApi} />
      }
      stats={
        <>
          {data.stats.map((stat: any, index: number) => (
            <Card
              key={index}
              className="hover:shadow-elegant transition-shadow"
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
        <Card>
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
      }
      mainRight={
        <Card>
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
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => navigate("/dashboard/system-analytics")}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                시스템 통계
              </Button>
            </div>
          </CardContent>
        </Card>
      }
    />
  );
};
