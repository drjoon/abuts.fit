import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  Users,
  FileText,
  DollarSign,
  Activity,
  Building2,
  MessageSquare,
  Clock,
  CheckCircle
} from "lucide-react";

// Mock analytics data
const mockStats = {
  overview: [
    { 
      title: "총 사용자", 
      value: "1,234", 
      change: "+8.2%", 
      trend: "up",
      icon: Users,
      description: "지난 달 대비"
    },
    { 
      title: "총 의뢰", 
      value: "5,678", 
      change: "+12.5%", 
      trend: "up",
      icon: FileText,
      description: "지난 달 대비"
    },
    { 
      title: "거래 금액", 
      value: "₩124.5M", 
      change: "+18.3%", 
      trend: "up",
      icon: DollarSign,
      description: "지난 달 대비"
    },
    { 
      title: "완료율", 
      value: "94.2%", 
      change: "-2.1%", 
      trend: "down",
      icon: CheckCircle,
      description: "지난 달 대비"
    }
  ],
  userGrowth: [
    { month: "1월", requestors: 45, manufacturers: 12 },
    { month: "2월", requestors: 52, manufacturers: 15 },
    { month: "3월", requestors: 48, manufacturers: 18 },
    { month: "4월", requestors: 61, manufacturers: 22 },
    { month: "5월", requestors: 55, manufacturers: 19 },
    { month: "6월", requestors: 67, manufacturers: 25 }
  ],
  topManufacturers: [
    { name: "프리미엄 어벗먼트", requests: 156, rating: 4.9, revenue: "₩45.2M" },
    { name: "정밀 어벗먼트", requests: 142, rating: 4.8, revenue: "₩38.7M" },
    { name: "스마트 어벗먼트", requests: 128, rating: 4.7, revenue: "₩32.1M" },
    { name: "퀄리티 어벗먼트", requests: 98, rating: 4.6, revenue: "₩28.4M" },
    { name: "테크 어벗먼트", requests: 87, rating: 4.5, revenue: "₩24.8M" }
  ],
  recentActivity: [
    { type: "신규 가입", user: "김철수 (서울치과기공소)", time: "5분 전" },
    { type: "의뢰 완료", user: "프리미엄 어벗먼트", time: "12분 전" },
    { type: "결제 완료", user: "부산치과기공소", time: "23분 전" },
    { type: "신규 의뢰", user: "대구치과기공소", time: "34분 전" },
    { type: "리뷰 작성", user: "인천치과기공소", time: "45분 전" }
  ]
};

export const AdminAnalytics = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            시스템 통계
          </h1>
          <p className="text-muted-foreground text-lg">
            플랫폼의 핵심 지표와 성과를 확인하세요
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockStats.overview.map((stat, index) => (
            <Card key={index} className="hover:shadow-elegant transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  {stat.trend === "up" ? (
                    <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                  )}
                  <span className={stat.trend === "up" ? "text-green-600" : "text-red-600"}>
                    {stat.change}
                  </span>
                  <span className="ml-1">{stat.description}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Growth Chart */}
          <Card>
            <CardHeader>
              <CardTitle>사용자 증가 추이</CardTitle>
              <CardDescription>
                월별 의뢰자 및 제조사 가입 현황
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockStats.userGrowth.map((data, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">{data.month}</span>
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                        <span>의뢰자: {data.requestors}명</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-secondary rounded-full"></div>
                        <span>제조사: {data.manufacturers}명</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Manufacturers */}
          <Card>
            <CardHeader>
              <CardTitle>우수 제조사 순위</CardTitle>
              <CardDescription>
                의뢰 수와 매출 기준 상위 제조사
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockStats.topManufacturers.map((manufacturer, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                        <span className="text-sm font-bold text-primary">#{index + 1}</span>
                      </div>
                      <div>
                        <h4 className="font-medium">{manufacturer.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>의뢰 {manufacturer.requests}건</span>
                          <span>•</span>
                          <span>평점 {manufacturer.rating}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{manufacturer.revenue}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>실시간 활동</CardTitle>
            <CardDescription>
              최근 플랫폼 내 주요 활동들
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockStats.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center gap-4 p-3 hover:bg-muted/30 rounded-lg transition-colors">
                  <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {activity.type}
                      </Badge>
                      <span className="font-medium">{activity.user}</span>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activity.time}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                제조사 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>총 제조사</span>
                  <span className="font-bold">67개</span>
                </div>
                <div className="flex justify-between">
                  <span>활성 제조사</span>
                  <span className="font-bold text-green-600">58개</span>
                </div>
                <div className="flex justify-between">
                  <span>승인 대기</span>
                  <span className="font-bold text-orange-600">9개</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                채팅 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>활성 채팅방</span>
                  <span className="font-bold">89개</span>
                </div>
                <div className="flex justify-between">
                  <span>일일 메시지</span>
                  <span className="font-bold text-blue-600">1,234개</span>
                </div>
                <div className="flex justify-between">
                  <span>이슈 발생</span>
                  <span className="font-bold text-red-600">12건</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                처리 시간
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>평균 제작 시간</span>
                  <span className="font-bold">7.2일</span>
                </div>
                <div className="flex justify-between">
                  <span>평균 응답 시간</span>
                  <span className="font-bold text-green-600">2.3시간</span>
                </div>
                <div className="flex justify-between">
                  <span>지연 건수</span>
                  <span className="font-bold text-red-600">8건</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};