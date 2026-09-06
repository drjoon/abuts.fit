// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListChecks,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { salesTeamApi, visitAccountName } from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

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

  const visits = data?.visits || [];
  const submitted = Boolean(data?.report);
  const historyItems = history?.items || [];

  return (
    <SalesPageShell
      title="일일보고"
      subtitle="KST 일자 기준 · 방문 요약은 일정에서 자동으로 채울 수 있습니다."
      actions={
        submitted ? (
          <Badge className="h-8 px-3">제출됨</Badge>
        ) : (
          <Badge variant="destructive" className="h-8 px-3">
            미제출
          </Badge>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setYmd(addDaysYmd(ymd, -1))}
          aria-label="이전 날"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={ymd}
          onChange={(e) => setYmd(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setYmd(addDaysYmd(ymd, 1))}
          aria-label="다음 날"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={ymd === today ? "default" : "secondary"}
          onClick={() => setYmd(today)}
        >
          오늘
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <SalesStatCard
          label="이날 방문"
          value={visits.length}
          icon={CalendarDays}
          hint="일정에서 가져온 건수"
        />
        <SalesStatCard
          label="보고 상태"
          value={submitted ? "제출" : "작성 중"}
          icon={FileText}
          tone={submitted ? "ok" : "alert"}
        />
        <SalesStatCard
          label="최근 보고"
          value={historyItems.length}
          icon={ListChecks}
          hint="저장된 일일보고 수"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <SalesPanel
          className="lg:col-span-3"
          title={`${ymd} 보고`}
          description="방문 요약 · 이슈 · 내일 계획을 기록합니다."
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="space-y-4">
              {visits.length > 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-xs text-muted-foreground">
                  이날 일정 {visits.length}건이 방문 요약에 반영될 수 있습니다.
                </div>
              ) : null}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  방문 요약
                </label>
                <Textarea
                  rows={5}
                  placeholder="· 거래처명 (완료/부재/예정)…"
                  value={visitSummary}
                  onChange={(e) => setVisitSummary(e.target.value)}
                  className="resize-y"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  이슈 · 특이사항
                </label>
                <Textarea
                  rows={3}
                  placeholder="클레임, 경쟁사, 내부 전달 사항…"
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  내일 계획
                </label>
                <Textarea
                  rows={3}
                  placeholder="내일 방문·팔로업·내부 협조 요청…"
                  value={tomorrowPlan}
                  onChange={(e) => setTomorrowPlan(e.target.value)}
                />
              </div>
              <Button
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? "저장 중…" : "제출 · 저장"}
              </Button>
            </div>
          )}
        </SalesPanel>

        <SalesPanel
          className="lg:col-span-2"
          title="최근 보고"
          description="날짜를 누르면 해당 보고를 불러옵니다."
        >
          {historyItems.length === 0 ? (
            <SalesEmptyState
              icon={FileText}
              title="아직 제출한 보고가 없습니다"
              description="오늘 방문을 정리해 첫 일일보고를 남겨 보세요."
            />
          ) : (
            <div className="space-y-2">
              {historyItems.map((r) => (
                <SalesListRow
                  key={r.reportYmd}
                  selected={r.reportYmd === ymd}
                  onClick={() => setYmd(r.reportYmd)}
                  title={r.reportYmd}
                  meta={
                    r.submittedAt
                      ? new Date(r.submittedAt).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })
                      : undefined
                  }
                  trailing={
                    r.reportYmd === ymd ? (
                      <Badge>선택</Badge>
                    ) : (
                      <Badge variant="outline">열기</Badge>
                    )
                  }
                />
              ))}
            </div>
          )}
        </SalesPanel>
      </div>
    </SalesPageShell>
  );
}
