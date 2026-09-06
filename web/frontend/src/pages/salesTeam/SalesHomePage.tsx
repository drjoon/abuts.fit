// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMMITMENT_LABEL,
  salesTeamApi,
  visitAccountName,
} from "./salesTeamApi";

export default function SalesHomePage() {
  const token = useAuthStore((s) => s.token);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-home"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.home(token),
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        {(error as Error).message || "홈을 불러오지 못했습니다."}
      </div>
    );
  }

  const visits = data?.todayVisits || [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">영업본부</h1>
        <p className="text-sm text-muted-foreground">
          {data?.todayYmd} · 오늘 일정과 보고
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              오늘 방문
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-2xl font-semibold">
            {visits.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              일일보고
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {data?.dailyReportSubmitted ? (
              <Badge>제출됨</Badge>
            ) : (
              <Badge variant="destructive">미제출</Badge>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              이번 주 소개 가입
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-2xl font-semibold">
            {data?.weekReferralSignups ?? 0}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/dashboard/sales/schedule">일정·동선</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard/sales/reports">일일보고</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard/sales/accounts">거래처</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-base">오늘 방문 일정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0">
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">오늘 일정이 없습니다.</p>
          ) : (
            visits.map((v) => (
              <div
                key={v._id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {visitAccountName(v)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.plannedAt).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Seoul",
                    })}
                  </div>
                </div>
                <Badge variant="secondary">
                  {COMMITMENT_LABEL[v.commitment] || v.commitment}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
