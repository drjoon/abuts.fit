// related files:
// - web/frontend/src/features/dashboard/DashboardHome.tsx
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  LayoutDashboard,
  Share2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { salesTeamApi, visitAccountName } from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

/** 영업본부 대시보드 — 오늘 방문·소개코드 요약(딜러 대시보드와 대칭 메뉴). */
export default function SalesTeamDashboardPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-home-dashboard"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.home(token),
  });

  const { data: referral, isLoading: referralLoading } = useQuery({
    queryKey: ["sales-team-referral-dashboard"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.referral(token),
  });

  const referralCode = String(referral?.referralCode || data?.referralCode || "")
    .trim()
    .toUpperCase();
  const todayVisits = Array.isArray(data?.todayVisits) ? data.todayVisits : [];
  const doneToday = todayVisits.filter((v) => v.status === "done").length;
  const orgCount = Array.isArray(referral?.organizations)
    ? referral.organizations.length
    : 0;

  const copyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      toast({ title: "소개코드를 복사했습니다." });
    } catch {
      toast({
        title: "복사에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  return (
    <SalesPageShell
      title="대시보드"
      subtitle="오늘 일정과 소개 실적을 한눈에 확인합니다."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/sales">오늘 일정</Link>
        </Button>
      }
    >
      {error ? (
        <SalesEmptyState
          icon={LayoutDashboard}
          title="대시보드를 불러오지 못했습니다"
          description={
            error instanceof Error ? error.message : "다시 시도해 주세요."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SalesStatCard
              label="오늘 방문"
              value={isLoading ? "…" : String(todayVisits.length)}
              hint={`완료 ${doneToday}건`}
              icon={CheckCircle2}
            />
            <SalesStatCard
              label="소개 가입(주간)"
              value={isLoading ? "…" : String(data?.weekReferralSignups ?? 0)}
              hint="최근 7일"
              icon={Share2}
            />
            <SalesStatCard
              label="소개 거래처"
              value={referralLoading ? "…" : String(orgCount)}
              hint="누적"
              icon={Building2}
            />
          </div>

          <SalesPanel
            title="소개코드"
            description="현장에서 가입 링크로 공유하세요."
            actions={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!referralCode}
                onClick={() => void copyCode()}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                복사
              </Button>
            }
          >
            <p className="font-mono text-3xl font-semibold tracking-[0.2em] text-slate-900">
              {referralCode || "—"}
            </p>
            {referral?.policyNote ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {referral.policyNote}
              </p>
            ) : null}
          </SalesPanel>

          <SalesPanel
            title="오늘 방문"
            description={data?.todayYmd ? `${data.todayYmd}` : undefined}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard/sales">전체 보기</Link>
              </Button>
            }
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : todayVisits.length === 0 ? (
              <SalesEmptyState
                icon={CalendarDays}
                title="오늘 일정이 없습니다"
                description="거래처에서 방문을 추가하세요."
                actionLabel="거래처"
                actionTo="/dashboard/sales/accounts"
              />
            ) : (
              <ul className="space-y-2">
                {todayVisits.slice(0, 8).map((visit) => (
                  <li key={visit._id}>
                    <SalesListRow
                      title={visitAccountName(visit)}
                      meta={String(visit.status || "")}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SalesPanel>
        </div>
      )}
    </SalesPageShell>
  );
}
