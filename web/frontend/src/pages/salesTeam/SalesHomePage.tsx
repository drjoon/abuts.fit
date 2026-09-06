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
  type SalesPlaceSuggest,
} from "./salesTeamApi";
import SalesPlaceSuggestInput from "./SalesPlaceSuggestInput";
import SalesPlacePickerDrawer from "./SalesPlacePickerDrawer";
import SalesRouteMap from "./SalesRouteMap";
import {
  SalesDayPicker,
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesSegmentTabs,
  SalesSplit,
  SalesToolbar,
} from "./salesUi";

type TodayTab = "schedule" | "report";

function parseTab(raw: string | null): TodayTab {
  return raw === "report" ? "report" : "schedule";
}

function formatVisitTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
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
  const [placeQuery, setPlaceQuery] = useState("");
  const [pickedPlace, setPickedPlace] = useState<SalesPlaceSuggest | null>(
    null,
  );
  const [time, setTime] = useState("10:00");
  const [commitment, setCommitment] = useState("confirmed");
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [placePickerSeed, setPlacePickerSeed] =
    useState<Partial<SalesPlaceSuggest> | null>(null);
  const [placePickerAccountId, setPlacePickerAccountId] = useState<
    string | null
  >(null);

  const [visitSummary, setVisitSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");

  const { data: visitsData, isLoading: visitsLoading } = useQuery({
    queryKey: ["sales-team-visits", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () =>
      salesTeamApi.listVisits(token, { fromYmd: ymd, toYmd: ymd }),
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
  const doneCount = visits.filter((v) => v.status === "done").length;
  const plannedCount = visits.filter((v) => v.status === "planned").length;
  const reportSubmitted = Boolean(reportData?.report);
  const historyItems = history?.items || [];
  const dayLabel = useMemo(() => formatDayLabel(ymd), [ymd]);

  const routeVisitKey = visits
    .filter((v) => v.status === "planned")
    .map((v) => v._id)
    .join(",");

  const { data: route, isFetching: routeLoading } = useQuery({
    queryKey: ["sales-team-route", ymd, routeVisitKey],
    enabled: Boolean(token && ymd && tab === "schedule" && routeVisitKey),
    queryFn: () =>
      salesTeamApi.optimizeRoute(token, {
        ymd,
        includeAround: true,
      }),
    staleTime: 30_000,
  });

  const routeOrderByVisitId = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const stop of route?.ordered || []) {
      if (stop.isStart || !stop.visitId) continue;
      n += 1;
      map.set(stop.visitId, n);
    }
    return map;
  }, [route]);

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
    mutationFn: async () => {
      const name = (pickedPlace?.name || placeQuery).trim();
      if (!name) throw new Error("방문할 상호를 입력하거나 선택하세요.");
      let accountId = pickedPlace?.accountId || "";
      if (!accountId) {
        const created = await salesTeamApi.createAccount(token, {
          kind: pickedPlace?.kind || "practice",
          name,
          phone: pickedPlace?.phone || "",
          address: pickedPlace?.address || "",
          lat: pickedPlace?.lat ?? null,
          lng: pickedPlace?.lng ?? null,
          representativeName: pickedPlace?.representativeName || "",
          businessAnchorId: pickedPlace?.businessAnchorId || null,
          teamVisible: true,
        });
        accountId = created._id;
      }
      const plannedAt = new Date(`${ymd}T${time}:00+09:00`).toISOString();
      return salesTeamApi.createVisit(token, {
        accountId,
        plannedAt,
        commitment,
        memo: "",
      });
    },
    onSuccess: () => {
      toast({ title: "일정이 추가되었습니다." });
      setShowForm(false);
      setPlaceQuery("");
      setPickedPlace(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
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
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const placeFixMut = useMutation({
    mutationFn: async (place: SalesPlaceSuggest) => {
      const accountId = placePickerAccountId || place.accountId;
      if (!accountId) throw new Error("거래처를 찾을 수 없습니다.");
      return salesTeamApi.updateAccount(token, accountId, {
        name: place.name,
        address: place.address || "",
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        phone: place.phone || undefined,
        businessAnchorId: place.businessAnchorId || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "위치가 저장되었습니다." });
      setPlacePickerOpen(false);
      setPlacePickerSeed(null);
      setPlacePickerAccountId(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const openPlaceFix = (seed: {
    accountId: string | null;
    name: string;
    address?: string;
    businessAnchorId?: string | null;
    kind?: "practice" | "lab";
  }) => {
    if (!seed.accountId) return;
    setPlacePickerAccountId(seed.accountId);
    setPlacePickerSeed({
      name: seed.name,
      address: seed.address || "",
      businessAnchorId: seed.businessAnchorId || null,
      accountId: seed.accountId,
      kind: seed.kind || "practice",
      source: seed.businessAnchorId ? "platform" : "kakao",
    });
    setPlacePickerOpen(true);
  };

  const missingCoordStops = (route?.ordered || []).filter(
    (s) =>
      !s.isStart &&
      s.accountId &&
      (s.lat == null ||
        s.lng == null ||
        !Number.isFinite(s.lat) ||
        !Number.isFinite(s.lng)),
  );

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
        <div className="space-y-4">
          {showForm ? (
            <SalesPanel
              title="방문 추가"
              description="상호 검색 후 시간만 정하면 됩니다."
            >
              <div className="flex max-w-2xl flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                <SalesPlaceSuggestInput
                  className="min-w-0 flex-1 sm:min-w-[14rem]"
                  value={placeQuery}
                  onChange={(v) => {
                    setPlaceQuery(v);
                    setPickedPlace(null);
                  }}
                  onPick={(item) => {
                    setPickedPlace(item);
                    setPlaceQuery(item.name);
                    if (
                      item.businessAnchorId ||
                      item.source === "platform" ||
                      item.lat == null ||
                      item.lng == null
                    ) {
                      setPlacePickerAccountId(item.accountId || null);
                      setPlacePickerSeed(item);
                      setPlacePickerOpen(true);
                    }
                  }}
                  placeholder="치과·기공소 상호 검색"
                  autoFocus
                />
                <Input
                  type="time"
                  className="w-full sm:w-[7.5rem]"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
                <Select value={commitment} onValueChange={setCommitment}>
                  <SelectTrigger className="w-full sm:w-[8rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">확정</SelectItem>
                    <SelectItem value="around">그쯤</SelectItem>
                    <SelectItem value="askBefore">미확정</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={
                    !(pickedPlace?.name || placeQuery.trim()) ||
                    createMut.isPending
                  }
                  onClick={() => createMut.mutate()}
                >
                  넣기
                </Button>
              </div>
              {pickedPlace?.address ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {pickedPlace.address}
                  {pickedPlace.phone ? ` · ${pickedPlace.phone}` : ""}
                </p>
              ) : null}
            </SalesPanel>
          ) : null}

          <SalesSplit
            primaryClassName="order-2 lg:order-1"
            secondaryClassName="order-1 lg:order-2"
            primary={
              <SalesPanel
                title="시간대별 일정"
                description="현장에서 완료·부재·취소를 바로 기록합니다."
              >
                {visitsLoading ? (
                  <p className="text-sm text-muted-foreground">불러오는 중…</p>
                ) : visits.length === 0 ? (
                  <SalesEmptyState
                    icon={CalendarDays}
                    title="이 날 일정이 없습니다"
                    description="상호를 검색해 일정을 넣으면 당일 지도와 타임라인이 자동으로 보입니다."
                    actionLabel="일정 추가"
                    onAction={() => setShowForm(true)}
                  />
                ) : (
                  <ol className="relative space-y-0 border-l border-slate-200 pl-5">
                    {visits.map((v) => {
                      const orderNo = routeOrderByVisitId.get(v._id);
                      return (
                        <li key={v._id} className="relative pb-4 last:pb-0">
                          <span
                            className={`absolute -left-[1.35rem] top-2 h-3 w-3 rounded-full ring-4 ring-white ${
                              v.status === "done"
                                ? "bg-emerald-500"
                                : v.status === "canceled" ||
                                    v.status === "noShow"
                                  ? "bg-slate-300"
                                  : "bg-primary"
                            }`}
                          />
                          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 px-3.5 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {orderNo ? (
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                                      {orderNo}
                                    </span>
                                  ) : null}
                                  <span className="truncate font-medium">
                                    {visitAccountName(v)}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {formatVisitTime(v.plannedAt)} ·{" "}
                                  {COMMITMENT_LABEL[v.commitment] ||
                                    v.commitment}
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
                                {(() => {
                                  const acc =
                                    v.accountId &&
                                    typeof v.accountId === "object"
                                      ? v.accountId
                                      : null;
                                  const missing =
                                    acc &&
                                    (acc.lat == null ||
                                      acc.lng == null ||
                                      !Number.isFinite(Number(acc.lat)) ||
                                      !Number.isFinite(Number(acc.lng)));
                                  if (!missing || !acc?._id) return null;
                                  return (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-amber-300 text-amber-800"
                                      onClick={() =>
                                        openPlaceFix({
                                          accountId: acc._id,
                                          name: acc.name,
                                          address: acc.address || "",
                                          businessAnchorId:
                                            acc.businessAnchorId || null,
                                          kind: acc.kind,
                                        })
                                      }
                                    >
                                      위치 지정
                                    </Button>
                                  );
                                })()}
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
                      );
                    })}
                  </ol>
                )}
              </SalesPanel>
            }
            secondary={
              visits.length > 0 ? (
                <SalesPanel
                  title="이날 동선"
                  description={
                    routeLoading
                      ? "지도 계산 중…"
                      : route
                        ? `예상 ${route.totalKm} km${
                            route.missingCoordsCount
                              ? ` · 좌표 없음 ${route.missingCoordsCount}`
                              : ""
                          }`
                        : "일정 기준으로 자동 표시"
                  }
                  actions={
                    route?.mapUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={route.mapUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          카카오맵
                        </a>
                      </Button>
                    ) : null
                  }
                >
                  {route ? (
                    <div className="space-y-2">
                      {!route.geocodeConfigured ? (
                        <p className="text-xs text-amber-700">
                          주소 좌표 변환 키가 없으면 지도가 비어 있을 수
                          있습니다.
                        </p>
                      ) : null}
                      <SalesRouteMap stops={route.ordered} />
                      {missingCoordStops.length > 0 ? (
                        <div className="space-y-1.5 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
                          <p className="text-xs font-medium text-amber-900">
                            좌표 없음 {missingCoordStops.length}곳 · 위치를
                            지정하면 지도에 표시됩니다
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {missingCoordStops.map((s) => (
                              <button
                                key={s.accountId || s.name}
                                type="button"
                                className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5 text-left text-sm active:bg-slate-50"
                                onClick={() =>
                                  openPlaceFix({
                                    accountId: s.accountId,
                                    name: s.name,
                                    address: s.address,
                                    businessAnchorId: s.businessAnchorId,
                                  })
                                }
                              >
                                <span className="min-w-0 truncate font-medium text-slate-900">
                                  {s.name}
                                </span>
                                <span className="shrink-0 text-xs font-medium text-primary">
                                  위치 지정
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {routeLoading
                        ? "동선을 계산하는 중…"
                        : "예정 방문이 있으면 지도가 자동으로 나타납니다."}
                    </p>
                  )}
                </SalesPanel>
              ) : undefined
            }
          />
        </div>
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
      <SalesPlacePickerDrawer
        open={placePickerOpen}
        onOpenChange={(open) => {
          setPlacePickerOpen(open);
          if (!open) {
            setPlacePickerSeed(null);
            setPlacePickerAccountId(null);
          }
        }}
        initialQuery={placePickerSeed?.name || ""}
        seed={placePickerSeed}
        onConfirm={(place) => {
          if (showForm) {
            setPickedPlace(place);
            setPlaceQuery(place.name);
          }
          if (placePickerAccountId || place.accountId) {
            placeFixMut.mutate(place);
            return;
          }
          setPlacePickerOpen(false);
          setPlacePickerSeed(null);
        }}
      />
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
