import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  MessageSquare,
  Building2,
  Users,
} from "lucide-react";
import { NewRequestPage } from "./NewRequestPage";
import { RequestListPage } from "./RequestListPage";
import { useAuthStore } from "@/store/useAuthStore";

// Mock data
const mockData = {
  requestor: {
    stats: [
      { label: "총 의뢰", value: "24", change: "+12%", icon: FileText },
      { label: "진행 중", value: "8", change: "+25%", icon: Clock },
      { label: "완료", value: "14", change: "+18%", icon: CheckCircle },
      { label: "메시지", value: "156", change: "+8%", icon: MessageSquare },
    ],
    recentRequests: [
      {
        id: "REQ-001",
        title: "상악 우측 제1대구치 임플란트",
        status: "진행중",
        manufacturer: "프리미엄 어벗먼트",
        date: "2025-07-15",
      },
      {
        id: "REQ-002",
        title: "하악 좌측 제2소구치 임플란트",
        status: "완료",
        manufacturer: "정밀 어벗먼트",
        date: "2025-07-14",
      },
      {
        id: "REQ-003",
        title: "상악 전치부 임플란트",
        status: "검토중",
        manufacturer: "스마트 어벗먼트",
        date: "2025-07-13",
      },
    ],
  },
  manufacturer: {
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
        status: "검토중",
        client: "대구치과기공소",
        date: "2025-07-13",
      },
    ],
  },
  admin: {
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
  },
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "진행중":
    case "제작중":
      return <Badge variant="default">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
    case "검토중":
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
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

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  // Show dashboard overview for all roles
  const data = mockData[user.role] || mockData.admin;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">안녕하세요, {user.name}님!</h1>
        <p className="text-muted-foreground">
          {user.role === "admin"
            ? "시스템 관리 대시보드입니다."
            : user.role === "manufacturer"
            ? "제작 현황을 확인하세요."
            : "의뢰 현황을 확인하세요."}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {data.stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-elegant transition-shadow">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        {user.role !== "admin" && (
          <Card>
            <CardHeader>
              <CardTitle>
                {user.role === "requestor" ? "최근 의뢰" : "최근 주문"}
              </CardTitle>
              <CardDescription>
                {user.role === "requestor"
                  ? "최근 요청한 의뢰 목록입니다."
                  : "최근 받은 주문 목록입니다."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(user.role === "requestor"
                  ? (data as any).recentRequests
                  : (data as any).recentOrders
                )?.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {user.role === "requestor"
                          ? item.manufacturer
                          : item.client}{" "}
                        • {item.date}
                      </div>
                    </div>
                    {getStatusBadge(item.status)}
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                전체 보기
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Admin Alerts or Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>
              {user.role === "admin" ? "시스템 알림" : "빠른 작업"}
            </CardTitle>
            <CardDescription>
              {user.role === "admin"
                ? "시스템 상태 및 알림입니다."
                : "자주 사용하는 기능들입니다."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.role === "admin" ? (
              <div className="space-y-4">
                {(data as any).systemAlerts?.map((alert: any) => (
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
            ) : (
              <div className="space-y-3">
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  {user.role === "requestor" ? "새 의뢰 작성" : "새 견적 작성"}
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  채팅 시작하기
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  통계 보기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
