// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/pages/salesTeam/salesDay.ts
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Map,
  Route,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDayLabel, visitStatusLabel } from "./salesDay";
import {
  COMMITMENT_LABEL,
  salesTeamApi,
  visitAccountName,
} from "./salesTeamApi";
import SalesRouteMap from "./SalesRouteMap";
import {
  SalesDayPicker,
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesSegmentTabs,
  SalesToolbar,
} from "./salesUi";

const START_ADDRESS_KEY = "abuts.sales.route.startAddress";

type TodayTab = "schedule" | "report";

function parseTab(raw: string | null): TodayTab {
  return raw === "report" ? "report" : "schedule";
}

export default function SalesHomePage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = toKstYmd(new Date()) || "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [ymd, setYmd] = useState(
    () => searchParams.get("ymd") || today,
  );
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: TodayTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "schedule") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  };

  const onYmdChange = (next: string) => {
    setYmd(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next === today) nextParams.delete("ymd");
    else nextParams.set("ymd", next);
    setSearchParams(nextParams, { replace: true });
  };

  const [showForm, setShowForm] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [time, setTime] = useState("10:00");
  const [commitment, setCommitment] = useState("confirmed");
  const [memo, setMemo] = useState("");
  const [extraName, setExtraName] = useState("");
  const [extraAddress, setExtraAddress] = useState("");
  const [startAddress, setStartAddress] = useState(() => {
    try {
      return localStorage.getItem(START_ADDRESS_KEY) || "";
    } catch {
      return "";
    }
  });
  const [includeAround, setIncludeAround] = useState(true);
  const [showRoute, setShowRoute] = useState(false);

  const [visitSummary, setVisitSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");

  const { data: visitsData, isLoading: visitsLoading } = useQuery({
    queryKey: ["sales-team-visits", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () =>
      salesTeamApi.listVisits(token, { fromYmd: ymd, toYmd: ymd }),
  });

  const { data: accountsData } = useQuery({
    queryKey: ["sales-team-accounts-for-visit"],
    enabled: Boolean(token && showForm),
    queryFn: () => salesTeamApi.listAccounts(token),
  });

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["sales-team-daily-report", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () => salesTeamApi.getDailyReport(token, ymd),
  });

  const { data: history } = useQuery({
    queryKey: ["sales-team-daily-reports"],
    enabled: Boolean(token && tab === "report"),
    queryFn: () => salesTeamApi.listDailyReports(token),
  });

  const visits = visitsData?.items || [];
  const accounts = accountsData?.items || [];
  const doneCount = visits.filter((v) => v.status === "done").length;
  const plannedCount = visits.filter((v) => v.status === "planned").length;
  const reportSubmitted = Boolean(reportData?.report);
  const historyItems = history?.items || [];
  const dayLabel = useMemo(() => formatDayLabel(ymd), [ymd]);

  useEffect(() => {
    if (tab !== "report") return;
    const r = reportData?.report;
    if (r) {
      setVisitSummary(r.visitSummary || "");
      setIssues(r.issues || "");
      setTomorrowPlan(r.tomorrowPlan || "");
      return;
    }
    const dayVisits = reportData?.visits || visits;
    if (dayVisits.length) {
      setVisitSummary(
        dayVisits
          .map((v) => `· ${visitAccountName(v)} (${visitStatusLabel(v.status)})`)
          .join("\n"),
      );
    } else {
      setVisitSummary("");
    }
    setIssues("");
    setTomorrowPlan("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefills when day/report arrives
  }, [tab, reportData?.reportYmd, reportData?.report?._id, ymd]);

  const createMut = useMutation({
    mutationFn: () => {
      const plannedAt = new Date(`${ymd}T${time}:00+09:00`).toISOString();
      return salesTeamApi.createVisit(token, {
        accountId,
        plannedAt,
        commitment,
        memo,
      });
    },
    onSuccess: () => {
      toast({ title: "일정이 추가되었습니다." });
      setShowForm(false);
      setMemo("");
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      salesTeamApi.updateVisit(token, id, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-stats"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-daily-report"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const routeMut = useMutation({
    mutationFn: () => {
      const trimmedStart = startAddress.trim();
      try {
        if (trimmedStart) localStorage.setItem(START_ADDRESS_KEY, trimmedStart);
        else localStorage.removeItem(START_ADDRESS_KEY);
      } catch {
        /* ignore */
      }
      return salesTeamApi.optimizeRoute(token, {
        ymd,
        includeAround,
        extraName: extraName || undefined,
        extraAddress: extraAddress || undefined,
        startAddress: trimmedStart || undefined,
      });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const saveReportMut = useMutation({
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

  const route = routeMut.data;

  return (
    <SalesPageShell
      title="오늘"
      subtitle={`${dayLabel} · 방문 일정과 일일보고를 한곳에서`}
      actions={
        tab === "schedule" ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "닫기" : "일정 추가"}
          </Button>
        ) : reportSubmitted ? (
          <Badge className="h-8 px-3">제출됨</Badge>
        ) : (
          <Badge variant="destructive" className="h-8 px-3">
            미제출
          </Badge>
        )
      }
    >
      <SalesToolbar>
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <SalesDayPicker ymd={ymd} today={today} onChange={onYmdChange} />
          <div className="flex flex-wrap gap-1.5 text-xs sm:text-sm">
            <StatusChip
              label="방문"
              value={String(visits.length)}
              muted={!visits.length}
            />
            <StatusChip label="예정" value={String(plannedCount)} />
            <StatusChip
              label="완료"
              value={String(doneCount)}
              tone={doneCount > 0 ? "ok" : undefined}
            />
            <StatusChip
              label="보고"
              value={reportSubmitted ? "제출" : "미제출"}
              tone={reportSubmitted ? "ok" : "alert"}
              onClick={() => setTab("report")}
            />
          </div>
        </div>
        <SalesSegmentTabs
          fit
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "schedule",
              label: "일정 · 동선",
              hint: visits.length ? `${visits.length}건` : "방문 관리",
            },
            {
              value: "report",
              label: "일일보고",
              hint: reportSubmitted ? "제출됨" : "방문 요약 · 이슈",
            },
          ]}
        />
      </SalesToolbar>

      {tab === "schedule" ? (
        <>
          {showForm ? (
            <SalesPanel
              title="방문 일정 추가"
              description="거래처 · 시각 · 확정 수준"
            >
              <div className="grid gap-2.5 md:grid-cols-12 md:items-start">
                <div className="md:col-span-4">
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="거래처 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a._id} value={a._id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
                <div className="md:col-span-3">
                  <Select value={commitment} onValueChange={setCommitment}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">확정</SelectItem>
                      <SelectItem value="around">그쯤 잡기</SelectItem>
                      <SelectItem value="askBefore">
                        상대에게 물어보기 전
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-10">
                  <Textarea
                    placeholder="방문 목적 · 준비물 메모"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="md:col-span-2 md:pt-1">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!accountId || createMut.isPending}
                    onClick={() => createMut.mutate()}
                  >
                    저장
                  </Button>
                </div>
              </div>
            </SalesPanel>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] xl:gap-5">
            <SalesPanel
              title="이날 아젠다"
              description="현장에서 완료·부재·취소를 바로 기록합니다."
              bodyClassName="md:max-h-[min(70vh,44rem)] md:overflow-y-auto"
            >
              {visitsLoading ? (
                <p className="text-sm text-muted-foreground">불러오는 중…</p>
              ) : visits.length === 0 ? (
                <SalesEmptyState
                  icon={CalendarDays}
                  title="이 날 일정이 없습니다"
                  description="거래처 방문을 추가하면 타임라인과 동선 계산에 포함됩니다."
                  actionLabel="일정 추가"
                  onAction={() => setShowForm(true)}
                />
              ) : (
                <ol className="relative space-y-0 border-l border-slate-200 pl-5">
                  {visits.map((v) => (
                    <li key={v._id} className="relative pb-4 last:pb-0">
                      <span
                        className={`absolute -left-[1.35rem] top-2 h-3 w-3 rounded-full ring-4 ring-white ${
                          v.status === "done"
                            ? "bg-emerald-500"
                            : v.status === "canceled" || v.status === "noShow"
                              ? "bg-slate-300"
                              : "bg-primary"
                        }`}
                      />
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {visitAccountName(v)}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(v.plannedAt).toLocaleTimeString(
                                "ko-KR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Asia/Seoul",
                                },
                              )}{" "}
                              ·{" "}
                              {COMMITMENT_LABEL[v.commitment] || v.commitment}
                            </div>
                            {v.memo ? (
                              <p className="mt-1 text-xs text-slate-600">
                                {v.memo}
                              </p>
                            ) : null}
                          </div>
                          <Badge
                            variant={
                              v.status === "done"
                                ? "default"
                                : v.status === "canceled"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {visitStatusLabel(v.status)}
                          </Badge>
                        </div>
                        {v.status === "planned" ? (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              onClick={() =>
                                statusMut.mutate({
                                  id: v._id,
                                  status: "done",
                                })
                              }
                            >
                              완료
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                statusMut.mutate({
                                  id: v._id,
                                  status: "noShow",
                                })
                              }
                            >
                              부재
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                statusMut.mutate({
                                  id: v._id,
                                  status: "canceled",
                                })
                              }
                            >
                              취소
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </SalesPanel>

            <SalesPanel
              className="md:sticky md:top-4 md:self-start"
              title="동선"
              description="지도에서 방문 순서를 확인하고 카카오맵으로 열 수 있습니다."
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => setShowRoute((v) => !v)}
                >
                  <Route className="mr-1 h-3.5 w-3.5" />
                  {showRoute || route ? "접기" : "짜기"}
                </Button>
              }
            >
              {showRoute || route ? (
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={includeAround}
                      onChange={(e) => setIncludeAround(e.target.checked)}
                    />
                    「그쯤」일정도 포함
                  </label>
                  <Input
                    placeholder="출발 주소 (선택 · 동선 기준점)"
                    value={startAddress}
                    onChange={(e) => setStartAddress(e.target.value)}
                  />
                  <Input
                    placeholder="추가 방문지명 (선택)"
                    value={extraName}
                    onChange={(e) => setExtraName(e.target.value)}
                  />
                  <Input
                    placeholder="추가 주소 (없으면 이름으로 검색)"
                    value={extraAddress}
                    onChange={(e) => setExtraAddress(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={routeMut.isPending}
                    onClick={() => {
                      setShowRoute(true);
                      routeMut.mutate();
                    }}
                  >
                    {routeMut.isPending ? "계산 중…" : "최적 동선 보기"}
                  </Button>

                  {route ? (
                    <div className="space-y-3 border-t border-slate-100 pt-3">
                      {!route.geocodeConfigured ? (
                        <p className="text-xs text-amber-700">
                          주소→좌표 변환(KAKAO_REST_API_KEY)이 꺼져 있으면 동선
                          정확도가 떨어질 수 있습니다.
                        </p>
                      ) : null}
                      <SalesRouteMap stops={route.ordered} />
                      <div className="flex items-center gap-2 rounded-xl bg-primary-soft/50 px-3 py-2 text-sm">
                        <Map className="h-4 w-4 text-primary-strong" />
                        <span>
                          예상 이동{" "}
                          <strong className="tabular-nums">
                            {route.totalKm} km
                          </strong>
                          {route.missingCoordsCount > 0
                            ? ` · 좌표 없음 ${route.missingCoordsCount}곳`
                            : ""}
                        </span>
                      </div>
                      <ol className="space-y-2">
                        {route.ordered.map((stop, idx) => {
                          const visitNo = route.ordered
                            .slice(0, idx + 1)
                            .filter((s) => !s.isStart).length;
                          return (
                          <li
                            key={`${stop.name}-${idx}`}
                            className="flex gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 text-sm"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                              {stop.isStart ? "출" : visitNo}
                            </span>
                            <span className="min-w-0">
                              <span className="font-medium">{stop.name}</span>
                              {stop.isExtra ? (
                                <Badge className="ml-1" variant="outline">
                                  추가
                                </Badge>
                              ) : null}
                              {stop.isStart ? (
                                <Badge className="ml-1" variant="secondary">
                                  출발
                                </Badge>
                              ) : null}
                              {stop.address ? (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {stop.address}
                                </span>
                              ) : null}
                            </span>
                          </li>
                          );
                        })}
                      </ol>
                      {route.mapUrl ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="w-full"
                        >
                          <a
                            href={route.mapUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            카카오맵에서 열기
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      확정 일정이 있으면 최적 순서를 계산합니다.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    방문 순서를 짜면 예상 거리와 지도 경로를 볼 수 있습니다.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowRoute(true)}
                  >
                    <Route className="mr-1.5 h-3.5 w-3.5" />
                    동선 짜기
                  </Button>
                </div>
              )}
            </SalesPanel>
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)] xl:gap-5">
          <SalesPanel
            title={`${ymd} 보고`}
            description="방문 요약 · 이슈 · 내일 계획"
          >
            {reportLoading ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : (
              <div className="space-y-4">
                {visits.length > 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-xs text-muted-foreground">
                    이날 일정 {visits.length}건 · 완료 {doneCount}건이 요약에
                    반영됩니다.
                  </div>
                ) : null}
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="xl:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      방문 요약
                    </label>
                    <Textarea
                      rows={6}
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
                      rows={4}
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
                      rows={4}
                      placeholder="내일 방문·팔로업·내부 협조 요청…"
                      value={tomorrowPlan}
                      onChange={(e) => setTomorrowPlan(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  disabled={saveReportMut.isPending}
                  onClick={() => saveReportMut.mutate()}
                >
                  {saveReportMut.isPending ? "저장 중…" : "제출 · 저장"}
                </Button>
              </div>
            )}
          </SalesPanel>

          <SalesPanel
            className="md:sticky md:top-4 md:self-start"
            title="최근 보고"
            description="날짜를 누르면 해당 보고를 불러옵니다."
            bodyClassName="md:max-h-[min(70vh,40rem)] md:overflow-y-auto"
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
                    onClick={() => onYmdChange(r.reportYmd)}
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
      )}
    </SalesPageShell>
  );
}

function StatusChip({
  label,
  value,
  tone,
  muted,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "ok" | "alert";
  muted?: boolean;
  onClick?: () => void;
}) {
  const className = [
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium",
    muted
      ? "border-slate-200 bg-slate-50 text-slate-400"
      : tone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : tone === "alert"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-white text-slate-700",
    onClick ? "cursor-pointer hover:border-slate-300" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
      {tone === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <span className={className}>{body}</span>;
}
