// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABEL, salesTeamApi, visitAccountName } from "./salesTeamApi";

export default function SalesStatsPage() {
  const token = useAuthStore((s) => s.token);
  const [period, setPeriod] = useState("30d");
  const [drill, setDrill] = useState<"visits" | "reports" | "referrals" | null>(
    null,
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-stats", period],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.stats(token, period),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">실적</h1>
          <p className="text-sm text-muted-foreground">
            방문 · 일일보고 제출률 · 소개 가입 (매출 연동은 다음 단계)
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7일</SelectItem>
            <SelectItem value="30d">30일</SelectItem>
            <SelectItem value="90d">90일</SelectItem>
            <SelectItem value="thisMonth">이번 달</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setDrill("visits")}>
              <Card className="text-left hover:bg-muted/30">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    방문 완료
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 text-2xl font-semibold">
                  {data?.visitDoneCount ?? 0}
                </CardContent>
              </Card>
            </button>
            <button type="button" onClick={() => setDrill("reports")}>
              <Card className="text-left hover:bg-muted/30">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    일일보고 제출률
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 text-2xl font-semibold">
                  {data?.reportSubmitRate ?? 0}%
                  <div className="text-xs font-normal text-muted-foreground">
                    {data?.reportSubmittedCount ?? 0}/{data?.workDayCount ?? 0}일
                  </div>
                </CardContent>
              </Card>
            </button>
            <button
              type="button"
              className="col-span-2 sm:col-span-1"
              onClick={() => setDrill("referrals")}
            >
              <Card className="text-left hover:bg-muted/30">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    소개 가입
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 text-2xl font-semibold">
                  {data?.referralSignupCount ?? 0}
                  <div className="text-xs font-normal text-muted-foreground">
                    치과 {data?.practiceSignupCount ?? 0} · 기공소{" "}
                    {data?.labSignupCount ?? 0}
                  </div>
                </CardContent>
              </Card>
            </button>
          </div>

          {drill === "visits" ? (
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-base">방문 완료 목록</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-0">
                {(data?.visits || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">없습니다.</p>
                ) : (
                  (data?.visits || []).map((v) => (
                    <div
                      key={v._id}
                      className="flex justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span>{visitAccountName(v)}</span>
                      <span className="text-xs text-muted-foreground">
                        {v.completedAt
                          ? new Date(v.completedAt).toLocaleDateString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })
                          : ""}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {drill === "reports" ? (
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-base">제출 현황</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-sm text-muted-foreground">
                근무일(일정이 있는 날) 대비 일일보고 제출 비율입니다. 상세
                목록은 일일보고 메뉴에서 확인하세요.
              </CardContent>
            </Card>
          ) : null}

          {drill === "referrals" ? (
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-base">소개 가입 목록</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-0">
                {(data?.referralOrgs || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">없습니다.</p>
                ) : (
                  (data?.referralOrgs || []).map((o) => (
                    <div
                      key={String(o._id)}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="truncate">{o.name || "사업자"}</span>
                      <Badge variant="secondary">
                        {KIND_LABEL[String(o.requestorKind || "")] ||
                          o.requestorKind ||
                          "의뢰자"}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
