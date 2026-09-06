// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { salesTeamApi, visitAccountName } from "./salesTeamApi";

export default function SalesReportsPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = toKstYmd(new Date()) || "";
  const [ymd, setYmd] = useState(today);
  const [visitSummary, setVisitSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-team-daily-report", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () => salesTeamApi.getDailyReport(token, ymd),
  });

  const { data: history } = useQuery({
    queryKey: ["sales-team-daily-reports"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.listDailyReports(token),
  });

  useEffect(() => {
    const r = data?.report;
    if (r) {
      setVisitSummary(r.visitSummary || "");
      setIssues(r.issues || "");
      setTomorrowPlan(r.tomorrowPlan || "");
      return;
    }
    const visits = data?.visits || [];
    if (visits.length && !visitSummary) {
      const auto = visits
        .map((v) => {
          const name = visitAccountName(v);
          const st =
            v.status === "done"
              ? "완료"
              : v.status === "noShow"
                ? "부재"
                : v.status === "canceled"
                  ? "취소"
                  : "예정";
          return `· ${name} (${st})`;
        })
        .join("\n");
      setVisitSummary(auto);
    }
    if (!r) {
      setIssues("");
      setTomorrowPlan("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefills once when data arrives
  }, [data?.reportYmd, data?.report?._id]);

  const saveMut = useMutation({
    mutationFn: () =>
      salesTeamApi.upsertDailyReport(token, {
        reportYmd: ymd,
        visitSummary,
        issues,
        tomorrowPlan,
      }),
    onSuccess: () => {
      toast({ title: "일일보고가 저장되었습니다." });
      void qc.invalidateQueries({ queryKey: ["sales-team-daily-report"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-daily-reports"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-stats"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div>
        <h1 className="text-xl font-semibold">일일 보고서</h1>
        <p className="text-sm text-muted-foreground">
          KST 일자 기준 · 방문 요약은 일정에서 자동 채울 수 있습니다.
        </p>
      </div>

      <Input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} />

      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-base">
            {ymd} 보고 {data?.report ? "(제출됨)" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <>
              {(data?.visits || []).length > 0 ? (
                <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  이날 일정 {(data?.visits || []).length}건
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  방문 요약
                </label>
                <Textarea
                  rows={4}
                  value={visitSummary}
                  onChange={(e) => setVisitSummary(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  이슈 · 특이사항
                </label>
                <Textarea
                  rows={3}
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  내일 계획
                </label>
                <Textarea
                  rows={3}
                  value={tomorrowPlan}
                  onChange={(e) => setTomorrowPlan(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                제출 · 저장
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-base">최근 보고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-3 pt-0">
          {(history?.items || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 없습니다.</p>
          ) : (
            (history?.items || []).map((r) => (
              <button
                key={r.reportYmd}
                type="button"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40"
                onClick={() => setYmd(r.reportYmd)}
              >
                <span>{r.reportYmd}</span>
                <span className="text-xs text-muted-foreground">
                  {r.submittedAt
                    ? new Date(r.submittedAt).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })
                    : ""}
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
