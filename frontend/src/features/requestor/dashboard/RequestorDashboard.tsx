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
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCardForDashboard } from "@/pages/requestor/WorkSheet";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import {
  Clock,
  CheckCircle,
  TrendingUp,
  FileText,
  MessageSquare,
} from "lucide-react";

const mockRequestorData = {
  stats: [
    { label: "제출한 의뢰", value: "24", change: "+12%", icon: FileText },
    { label: "제작 중", value: "6", change: "+18%", icon: Clock },
    { label: "배송 중", value: "2", change: "+5%", icon: TrendingUp },
    { label: "완료된 의뢰", value: "14", change: "+22%", icon: CheckCircle },
  ],
  manufacturingSummary: {
    totalActive: 8,
    stages: [
      { key: "design", label: "디자인 검토", count: 3, percent: 38 },
      { key: "cnc", label: "CNC 가공", count: 2, percent: 25 },
      { key: "post", label: "후처리/폴리싱", count: 2, percent: 25 },
      { key: "shipping", label: "출고/배송 준비", count: 1, percent: 12 },
    ],
  },
  riskSummary: {
    delayedCount: 1,
    warningCount: 2,
    onTimeRate: 92,
    items: [
      {
        id: "REQ-002",
        title: "하악 좌측 제2소구치 임플란트",
        manufacturer: "정밀 어벗먼트",
        riskLevel: "warning",
        message: "예상 출고일보다 1일 지연 가능성이 있습니다.",
      },
      {
        id: "REQ-004",
        title: "상악 좌측 제1소구치 임플란트",
        manufacturer: "프리미엄 어벗먼트",
        riskLevel: "danger",
        message: "제조 공정 지연으로 출고일 재조정 필요.",
      },
    ],
  },
  recentRequests: [
    {
      id: "REQ-001",
      title: "상악 우측 제1대구치 임플란트",
      status: "제작중",
      manufacturer: "프리미엄 어벗먼트",
      date: "2025-07-15",
    },
    {
      id: "REQ-002",
      title: "하악 좌측 제2소구치 임플란트",
      status: "배송중",
      manufacturer: "정밀 어벗먼트",
      date: "2025-07-14",
    },
    {
      id: "REQ-003",
      title: "상악 전치부 임플란트",
      status: "완료",
      manufacturer: "스마트 어벗먼트",
      date: "2025-07-13",
    },
  ],
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

export const RequestorDashboard = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  if (!user || user.role !== "requestor") return null;

  const { data: summaryResponse } = useQuery({
    queryKey: ["requestor-dashboard-summary-page"],
    queryFn: async () => {
      const res = await fetch("/api/requests/my/dashboard-summary");
      if (!res.ok) {
        throw new Error("대시보드 요약 조회에 실패했습니다.");
      }
      return res.json();
    },
  });

  const baseData = mockRequestorData;
  let data: any = baseData;
  let diameterStatsFromApi: DiameterStats | undefined;

  if (summaryResponse?.success) {
    data = {
      ...baseData,
      stats: [
        {
          label: "제출한 의뢰",
          value: String(summaryResponse.data.stats.totalRequests ?? 0),
          change: baseData.stats[0]?.change ?? "+0%",
          icon: FileText,
        },
        {
          label: "제작 중",
          value: String(summaryResponse.data.stats.inProduction ?? 0),
          change: baseData.stats[1]?.change ?? "+0%",
          icon: Clock,
        },
        {
          label: "배송 중",
          value: String(summaryResponse.data.stats.inShipping ?? 0),
          change: baseData.stats[2]?.change ?? "+0%",
          icon: TrendingUp,
        },
        {
          label: "완료된 의뢰",
          value: String(summaryResponse.data.stats.completed ?? 0),
          change: baseData.stats[3]?.change ?? "+0%",
          icon: CheckCircle,
        },
      ],
      manufacturingSummary:
        summaryResponse.data.manufacturingSummary ??
        baseData.manufacturingSummary,
      riskSummary: summaryResponse.data.riskSummary ?? baseData.riskSummary,
    };

    if (summaryResponse.data.diameterStats) {
      diameterStatsFromApi = summaryResponse.data
        .diameterStats as DiameterStats;
    }
  }

  return (
    <DashboardShell
      title={`안녕하세요, ${user.name}님!`}
      subtitle="의뢰 현황을 확인하세요."
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
      topSection={
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <WorksheetDiameterCardForDashboard stats={diameterStatsFromApi} />
            </div>

            <Card className="border-dashed border-muted-foreground/30 bg-muted/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  제조 단계 타임라인
                </CardTitle>
                <CardDescription>
                  현재 제조 중인 의뢰들의 단계별 진행 상황입니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  총 진행 중 의뢰: {data.manufacturingSummary?.totalActive ?? 0}
                  건
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {data.manufacturingSummary?.stages?.map((stage: any) => (
                    <div
                      key={stage.key}
                      className="flex flex-col rounded-lg border border-border bg-background/60 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {stage.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {stage.count}건
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-blue-500 transition-all"
                          style={{ width: `${stage.percent}%` }}
                        ></div>
                      </div>
                      <div className="text-[10px] text-muted-foreground text-right">
                        {stage.percent}%
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  지연 위험 요약
                </CardTitle>
                <CardDescription>
                  예상 출고일 기준으로 지연 가능성이 있는 의뢰를 요약해서
                  보여드립니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    지연 가능성 의뢰: {data.riskSummary?.warningCount ?? 0}건
                  </span>
                  <span>
                    지연 확정 의뢰: {data.riskSummary?.delayedCount ?? 0}건
                  </span>
                  <span>
                    제때 출고 비율: {data.riskSummary?.onTimeRate ?? 0}%
                  </span>
                </div>
                <div className="space-y-2">
                  {data.riskSummary?.items?.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-lg border border-border bg-muted/40 p-3 gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {item.manufacturer}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                          {item.message}
                        </div>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        {item.riskLevel === "danger" ? (
                          <Badge variant="destructive" className="text-[10px]">
                            지연 위험
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            주의
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>최근 의뢰</CardTitle>
              <CardDescription>최근 요청한 의뢰 목록입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.recentRequests?.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.manufacturer} • {item.date}
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
        </div>
      }
    />
  );
};
