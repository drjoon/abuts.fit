// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  FileText,
  Share2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABEL, salesTeamApi, visitAccountName } from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesProgressBar,
  SalesStatCard,
} from "./salesUi";

const PERIOD_LABEL: Record<string, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
  thisMonth: "이번 달",
};

export default function SalesStatsPage() {
  const token = useAuthStore((s) => s.token);
  const [period, setPeriod] = useState("30d");
  const [drill, setDrill] = useState<"visits" | "reports" | "referrals">(
    "visits",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-stats", period],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.stats(token, period),
  });

  const rate = data?.reportSubmitRate ?? 0;
  const visitDone = data?.visitDoneCount ?? 0;
  const referralTotal = data?.referralSignupCount ?? 0;

  return (
    <SalesPageShell
      title="실적"
      subtitle={`${PERIOD_LABEL[period] || period} · 방문 완료 · 일일보고 제출률 · 소개 가입 (매출 연동은 다음 단계)`}
      actions={
        <Select
          value={period}
          onValueChange={(v) => {
            setPeriod(v);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7일</SelectItem>
            <SelectItem value="30d">30일</SelectItem>
            <SelectItem value="90d">90일</SelectItem>
            <SelectItem value="thisMonth">이번 달</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <SalesStatCard
              label="방문 완료"
              value={visitDone}
              hint="현장에서 완료 처리한 방문"
              icon={CheckCircle2}
              selected={drill === "visits"}
              onClick={() => setDrill("visits")}
            />
            <SalesStatCard
              label="일일보고 제출률"
              value={`${rate}%`}
              hint={`${data?.reportSubmittedCount ?? 0}/${data?.workDayCount ?? 0} 근무일`}
              icon={FileText}
              selected={drill === "reports"}
              onClick={() => setDrill("reports")}
              tone={rate >= 80 ? "ok" : rate > 0 ? "default" : "alert"}
            />
            <SalesStatCard
              label="소개 가입"
              value={referralTotal}
              hint={`치과 ${data?.practiceSignupCount ?? 0} · 기공소 ${data?.labSignupCount ?? 0}`}
              icon={Share2}
              selected={drill === "referrals"}
              onClick={() => setDrill("referrals")}
            />
          </div>

          <SalesPanel
            title="제출률 한눈에"
            description="일정이 있는 근무일 대비 일일보고 제출 비율입니다."
          >
            <SalesProgressBar value={rate} label="일일보고 제출률" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 px-2 py-3">
                <div className="text-xs text-muted-foreground">방문 완료</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {visitDone}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 px-2 py-3">
                <div className="text-xs text-muted-foreground">보고 제출</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {data?.reportSubmittedCount ?? 0}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 px-2 py-3">
                <div className="text-xs text-muted-foreground">소개 가입</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {referralTotal}
                </div>
              </div>
            </div>
          </SalesPanel>

          {drill === "visits" ? (
            <SalesPanel
              title="방문 완료 목록"
              description="선택한 기간의 완료 방문입니다."
              actions={
                <Badge variant="secondary" className="gap-1">
                  <BarChart3 className="h-3 w-3" />
                  {visitDone}건
                </Badge>
              }
            >
              {(data?.visits || []).length === 0 ? (
                <SalesEmptyState
                  icon={CheckCircle2}
                  title="완료된 방문이 없습니다"
                  description="일정에서 방문을 완료 처리하면 여기에 쌓입니다."
                  actionLabel="일정으로 이동"
                  actionTo="/dashboard/sales/schedule"
                />
              ) : (
                <div className="space-y-2">
                  {(data?.visits || []).map((v) => (
                    <SalesListRow
                      key={v._id}
                      title={visitAccountName(v)}
                      meta={
                        v.completedAt
                          ? new Date(v.completedAt).toLocaleDateString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })
                          : undefined
                      }
                      trailing={<Badge variant="secondary">완료</Badge>}
                    />
                  ))}
                </div>
              )}
            </SalesPanel>
          ) : null}

          {drill === "reports" ? (
            <SalesPanel
              title="일일보고 제출 현황"
              description="근무일(일정이 있는 날) 대비 제출 비율입니다."
            >
              <div className="space-y-3">
                <SalesProgressBar value={rate} />
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                  <p>
                    제출{" "}
                    <strong className="tabular-nums">
                      {data?.reportSubmittedCount ?? 0}
                    </strong>
                    일 / 근무일{" "}
                    <strong className="tabular-nums">
                      {data?.workDayCount ?? 0}
                    </strong>
                    일
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    상세 작성·수정은 일일보고 메뉴에서 합니다.
                  </p>
                </div>
              </div>
            </SalesPanel>
          ) : null}

          {drill === "referrals" ? (
            <SalesPanel
              title="소개 가입 목록"
              description="내 소개코드로 가입한 치과·기공소입니다."
              actions={
                <Badge variant="secondary">
                  <Building2 className="mr-1 h-3 w-3" />
                  {referralTotal}
                </Badge>
              }
            >
              {(data?.referralOrgs || []).length === 0 ? (
                <SalesEmptyState
                  icon={Share2}
                  title="소개 가입이 없습니다"
                  description="소개 메뉴의 코드·링크를 공유하면 가입 실적이 쌓입니다."
                  actionLabel="소개 코드 보기"
                  actionTo="/dashboard/sales/referral"
                />
              ) : (
                <div className="space-y-2">
                  {(data?.referralOrgs || []).map((o) => (
                    <SalesListRow
                      key={String(o._id)}
                      title={o.name || "사업자"}
                      trailing={
                        <Badge variant="secondary">
                          {KIND_LABEL[String(o.requestorKind || "")] ||
                            o.requestorKind ||
                            "의뢰자"}
                        </Badge>
                      }
                    />
                  ))}
                </div>
              )}
            </SalesPanel>
          ) : null}
        </>
      )}
    </SalesPageShell>
  );
}
