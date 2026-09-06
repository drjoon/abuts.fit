// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Copy,
  FileText,
  Link2,
  Share2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SalesSegmentTabs,
  SalesStatCard,
  SalesToolbar,
} from "./salesUi";

type PerfTab = "activity" | "referral";

function parseTab(raw: string | null): PerfTab {
  return raw === "referral" ? "referral" : "activity";
}

export default function SalesPerformancePage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState("30d");
  const [drill, setDrill] = useState<"visits" | "reports" | "referrals">(
    "visits",
  );
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: PerfTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "activity") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-stats", period],
    enabled: Boolean(token && tab === "activity"),
    queryFn: () => salesTeamApi.stats(token, period),
  });

  const {
    data: referral,
    isLoading: referralLoading,
    error: referralError,
  } = useQuery({
    queryKey: ["sales-team-referral"],
    enabled: Boolean(token && tab === "referral"),
    queryFn: () => salesTeamApi.referral(token),
  });

  const rate = data?.reportSubmitRate ?? 0;
  const visitDone = data?.visitDoneCount ?? 0;
  const referralTotal = data?.referralSignupCount ?? 0;

  const code = String(referral?.referralCode || "")
    .trim()
    .toUpperCase();
  const link =
    typeof window !== "undefined" && /^[A-Z]{3}$/.test(code)
      ? `${window.location.origin}/signup/referral?ref=${encodeURIComponent(code)}`
      : "";
  const orgs = referral?.organizations || [];
  const practiceCount = orgs.filter(
    (o) => String(o.requestorKind || "") === "practice",
  ).length;
  const labCount = orgs.filter(
    (o) => String(o.requestorKind || "") === "lab",
  ).length;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} 복사됨` });
    } catch {
      toast({ title: "복사에 실패했습니다.", variant: "destructive" });
    }
  };

  return (
    <SalesPageShell
      title="성과"
      actions={
        tab === "activity" ? (
          <Select value={period} onValueChange={setPeriod}>
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
        ) : null
      }
    >
      <SalesToolbar>
        <SalesSegmentTabs
          fit
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "activity",
              label: "활동 실적",
              hint: "방문 · 보고 · 소개",
            },
            {
              value: "referral",
              label: "소개 코드",
              hint: "공유 · 가입 목록",
            },
          ]}
        />
      </SalesToolbar>

      {tab === "activity" ? (
        isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
        ) : error ? (
          <p className="text-sm text-destructive">
            {(error as Error).message}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] xl:gap-5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1 lg:sticky lg:top-4 lg:self-start">
              <SalesStatCard
                compact
                label="방문 완료"
                value={visitDone}
                hint="현장에서 완료 처리한 방문"
                icon={CheckCircle2}
                selected={drill === "visits"}
                onClick={() => setDrill("visits")}
              />
              <SalesStatCard
                compact
                label="일일보고 제출률"
                value={`${rate}%`}
                hint={`${data?.reportSubmittedCount ?? 0}/${data?.workDayCount ?? 0} 근무일`}
                icon={FileText}
                selected={drill === "reports"}
                onClick={() => setDrill("reports")}
                tone={rate >= 80 ? "ok" : rate > 0 ? "default" : "alert"}
              />
              <SalesStatCard
                compact
                label="소개 가입"
                value={referralTotal}
                hint={`치과 ${data?.practiceSignupCount ?? 0} · 기공소 ${data?.labSignupCount ?? 0}`}
                icon={Share2}
                selected={drill === "referrals"}
                onClick={() => setDrill("referrals")}
              />
            </div>

            <div className="min-w-0">
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
                  bodyClassName="lg:max-h-[min(70vh,42rem)] lg:overflow-y-auto"
                >
                  {(data?.visits || []).length === 0 ? (
                    <SalesEmptyState
                      icon={CheckCircle2}
                      title="완료된 방문이 없습니다"
                      description="오늘 메뉴에서 방문을 완료 처리하면 여기에 쌓입니다."
                      actionLabel="오늘로 이동"
                      actionTo="/dashboard/sales"
                    />
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {(data?.visits || []).map((v) => (
                        <SalesListRow
                          key={v._id}
                          title={visitAccountName(v)}
                          meta={
                            v.completedAt
                              ? new Date(v.completedAt).toLocaleDateString(
                                  "ko-KR",
                                  { timeZone: "Asia/Seoul" },
                                )
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
                  <div className="mx-auto max-w-xl space-y-4">
                    <SalesProgressBar value={rate} label="제출률" />
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      제출{" "}
                      <strong className="tabular-nums">
                        {data?.reportSubmittedCount ?? 0}
                      </strong>
                      일 / 근무일{" "}
                      <strong className="tabular-nums">
                        {data?.workDayCount ?? 0}
                      </strong>
                      일
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/dashboard/sales?tab=report">
                        일일보고 작성
                      </Link>
                    </Button>
                  </div>
                </SalesPanel>
              ) : null}

              {drill === "referrals" ? (
                <SalesPanel
                  title="소개 가입 목록"
                  description="내 소개코드로 가입한 치과·기공소입니다."
                  actions={
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        <Building2 className="mr-1 h-3 w-3" />
                        {referralTotal}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTab("referral")}
                      >
                        코드 보기
                      </Button>
                    </div>
                  }
                  bodyClassName="lg:max-h-[min(70vh,42rem)] lg:overflow-y-auto"
                >
                  {(data?.referralOrgs || []).length === 0 ? (
                    <SalesEmptyState
                      icon={Share2}
                      title="소개 가입이 없습니다"
                      description="소개 코드를 공유하면 가입 실적이 쌓입니다."
                      actionLabel="소개 코드 보기"
                      onAction={() => setTab("referral")}
                    />
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
            </div>
          </div>
        )
      ) : referralLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : referralError ? (
        <p className="text-sm text-destructive">
          {(referralError as Error).message}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-5">
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="grid grid-cols-3 gap-2.5">
              <SalesStatCard
                compact
                label="소개 가입"
                value={orgs.length}
                icon={Share2}
                hint="누적"
              />
              <SalesStatCard compact label="치과" value={practiceCount} />
              <SalesStatCard compact label="기공소" value={labCount} />
            </div>
            <SalesPanel
              title="내 소개코드"
              description="현장에서 코드나 가입 링크를 공유하세요."
            >
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary-muted/50 bg-gradient-to-br from-primary-soft/80 to-white px-4 py-8 text-center">
                <div className="font-mono text-4xl font-semibold tracking-[0.35em] text-slate-900 sm:text-5xl">
                  {code || "—"}
                </div>
                {code ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(code, "소개코드")}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      코드 복사
                    </Button>
                    {link ? (
                      <Button
                        size="sm"
                        onClick={() => copy(link, "가입 링크")}
                      >
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                        가입 링크 복사
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    소개코드가 아직 없습니다. 설정에서 확인하세요.
                  </p>
                )}
                {link ? (
                  <code className="max-w-full truncate rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200/80">
                    {link}
                  </code>
                ) : null}
                {referral?.policyNote ? (
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    {referral.policyNote}
                  </p>
                ) : null}
              </div>
            </SalesPanel>
          </div>

          <SalesPanel
            title="소개로 가입한 거래처"
            description="코드로 가입한 치과·기공소 목록입니다."
            bodyClassName="lg:max-h-[min(74vh,46rem)] lg:overflow-y-auto"
          >
            {orgs.length === 0 ? (
              <SalesEmptyState
                icon={Share2}
                title="아직 소개 가입이 없습니다"
                description="코드를 공유하면 가입한 사업자가 여기에 표시됩니다."
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {orgs.map((o) => (
                  <SalesListRow
                    key={String(o._id)}
                    title={o.name || "사업자"}
                    meta={
                      o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : undefined
                    }
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
        </div>
      )}
    </SalesPageShell>
  );
}
