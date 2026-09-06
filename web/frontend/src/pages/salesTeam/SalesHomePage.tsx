// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  MapPinned,
  Share2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMMITMENT_LABEL,
  salesTeamApi,
  visitAccountName,
} from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesPageShell,
  SalesPanel,
  SalesQuickLink,
  SalesStatCard,
} from "./salesUi";

function visitStatusLabel(status: string) {
  if (status === "done") return "완료";
  if (status === "canceled") return "취소";
  if (status === "noShow") return "부재";
  return "예정";
}

export default function SalesHomePage() {
  const token = useAuthStore((s) => s.token);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-home"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.home(token),
  });

  if (isLoading) {
    return (
      <SalesPageShell title="영업 홈" subtitle="불러오는 중…">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </SalesPageShell>
    );
  }
  if (error) {
    return (
      <SalesPageShell title="영업 홈">
        <p className="text-sm text-destructive">
          {(error as Error).message || "홈을 불러오지 못했습니다."}
        </p>
      </SalesPageShell>
    );
  }

  const visits = data?.todayVisits || [];
  const doneCount = visits.filter((v) => v.status === "done").length;
  const pendingCount = visits.filter((v) => v.status === "planned").length;
  const reportOk = Boolean(data?.dailyReportSubmitted);

  return (
    <SalesPageShell
      title="영업 홈"
      subtitle={`${data?.todayYmd} · 오늘 방문·보고·소개 현황`}
      actions={
        <Button asChild size="sm">
          <Link to="/dashboard/sales/schedule">일정 관리</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <SalesStatCard
          label="오늘 방문"
          value={visits.length}
          hint={
            visits.length
              ? `완료 ${doneCount} · 예정 ${pendingCount}`
              : "등록된 방문 없음"
          }
          icon={MapPinned}
          to="/dashboard/sales/schedule"
        />
        <SalesStatCard
          label="일일보고"
          value={reportOk ? "제출" : "미제출"}
          hint={reportOk ? "오늘 보고 완료" : "퇴근 전 제출하세요"}
          icon={FileText}
          tone={reportOk ? "ok" : "alert"}
          to="/dashboard/sales/reports"
        />
        <SalesStatCard
          label="이번 주 소개 가입"
          value={data?.weekReferralSignups ?? 0}
          hint="소개코드로 가입한 사업자"
          icon={Share2}
          to="/dashboard/sales/referral"
        />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <SalesQuickLink
          to="/dashboard/sales/schedule"
          icon={CalendarDays}
          label="일정 · 동선"
          description="방문 일정과 최적 경로"
        />
        <SalesQuickLink
          to="/dashboard/sales/accounts"
          icon={Building2}
          label="거래처"
          description="연락처 · 주소 · 특이사항"
        />
        <SalesQuickLink
          to="/dashboard/sales/reports"
          icon={FileText}
          label="일일보고"
          description="방문 요약 · 이슈 · 내일 계획"
        />
      </div>

      <SalesPanel
        title="오늘 방문 타임라인"
        description="확정·그쯤 일정을 시간순으로 확인합니다."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/sales/schedule">전체 보기</Link>
          </Button>
        }
      >
        {visits.length === 0 ? (
          <SalesEmptyState
            icon={CalendarDays}
            title="오늘 방문이 없습니다"
            description="거래처를 선택해 일정을 추가하면 홈과 일일보고에 반영됩니다."
            actionLabel="일정 추가"
            actionTo="/dashboard/sales/schedule"
          />
        ) : (
          <ol className="relative space-y-0 border-l border-slate-200 pl-5">
            {visits.map((v) => {
              const done = v.status === "done";
              return (
                <li key={v._id} className="relative pb-5 last:pb-0">
                  <span
                    className={`absolute -left-[1.4rem] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                      done
                        ? "bg-emerald-500"
                        : v.status === "canceled" || v.status === "noShow"
                          ? "bg-slate-300"
                          : "bg-primary"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    ) : null}
                  </span>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">
                        {visitAccountName(v)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(v.plannedAt).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Seoul",
                        })}
                        {" · "}
                        {COMMITMENT_LABEL[v.commitment] || v.commitment}
                      </div>
                      {v.memo ? (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {v.memo}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        done
                          ? "default"
                          : v.status === "canceled"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {visitStatusLabel(v.status)}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SalesPanel>
    </SalesPageShell>
  );
}
