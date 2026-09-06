// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/pages/salesTeam/salesDay.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Route,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/shared/ui/cn";
import {
  clampVisitHmAfterNow,
  defaultVisitHm,
  formatDayLabel,
  visitStatusLabel,
} from "./salesDay";
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
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesSegmentTabs,
  SalesSplit,
  SalesToolbar,
} from "./salesUi";

type TodayTab = "schedule" | "report";
type ListFilter = "all" | "planned" | "done";

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
  const [time, setTime] = useState(() => defaultVisitHm(today, today));
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
  const [previewSuggestYmd, setPreviewSuggestYmd] = useState<string | null>(
    null,
  );
  const appliedSuggestKeyRef = useRef("");

  const { data: visitsData, isLoading: visitsLoading } = useQuery({
    queryKey: ["sales-team-visits", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () =>
      salesTeamApi.listVisits(token, { fromYmd: ymd, toYmd: ymd }),
  });

  const routeSuggestName = (pickedPlace?.name || placeQuery).trim();
  const routeSuggestKey = [
    routeSuggestName,
    pickedPlace?.accountId || "",
    pickedPlace?.address || "",
    pickedPlace?.lat ?? "",
    pickedPlace?.lng ?? "",
  ].join("|");

  const {
    data: routeSuggest,
    isFetching: routeSuggestLoading,
    error: routeSuggestError,
  } = useQuery({
    queryKey: ["sales-team-route-suggest", routeSuggestKey],
    enabled: Boolean(
      token &&
        showForm &&
        tab === "schedule" &&
        pickedPlace &&
        routeSuggestName.length >= 2,
    ),
    queryFn: () =>
      salesTeamApi.suggestRouteDays(token, {
        name: routeSuggestName,
        address: pickedPlace?.address || "",
        accountId: pickedPlace?.accountId || null,
        lat: pickedPlace?.lat ?? null,
        lng: pickedPlace?.lng ?? null,
        fromYmd: today,
        horizonDays: 14,
      }),
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    setPreviewSuggestYmd(null);
    appliedSuggestKeyRef.current = "";
  }, [routeSuggestKey]);

  /** 첫 제안(1순위 우선) 날짜·시간 자동 반영 — 상호당 1회 */
  useEffect(() => {
    if (!pickedPlace || !routeSuggest?.suggestions?.length) return;
    if (appliedSuggestKeyRef.current === routeSuggestKey) return;
    const best =
      routeSuggest.suggestions.find((s) => s.rank === 1) ||
      routeSuggest.suggestions[0];
    if (!best?.ymd) return;
    appliedSuggestKeyRef.current = routeSuggestKey;
    if (best.suggestedTime) {
      setTime(clampVisitHmAfterNow(best.suggestedTime, best.ymd, today));
    } else {
      setTime(defaultVisitHm(best.ymd, today));
    }
    if (best.ymd !== ymd) onYmdChange(best.ymd);
    setPreviewSuggestYmd(best.ymd);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per place suggest
  }, [routeSuggest?.suggestions, routeSuggestKey, pickedPlace]);

  const previewSuggestion = useMemo(() => {
    const items = routeSuggest?.suggestions || [];
    if (!items.length) return null;
    if (previewSuggestYmd) {
      return items.find((s) => s.ymd === previewSuggestYmd) || items[0];
    }
    return items[0];
  }, [routeSuggest, previewSuggestYmd]);

  const applySuggestion = (s: {
    ymd: string;
    suggestedTime?: string;
  }) => {
    setPreviewSuggestYmd(s.ymd);
    onYmdChange(s.ymd);
    if (s.suggestedTime) {
      setTime(clampVisitHmAfterNow(s.suggestedTime, s.ymd, today));
    } else {
      setTime(defaultVisitHm(s.ymd, today));
    }
  };

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
  /** 상단 뱃지: 취소는 카운트·필터 대상에서 제외 */
  const activeVisits = useMemo(
    () => visits.filter((v) => v.status !== "canceled"),
    [visits],
  );
  const visitCount = activeVisits.length;
  const doneCount = activeVisits.filter((v) => v.status === "done").length;
  const plannedCount = activeVisits.filter((v) => v.status === "planned").length;
  const canceledCount = visits.filter((v) => v.status === "canceled").length;
  const reportSubmitted = Boolean(reportData?.report);
  const historyItems = history?.items || [];

  /** 일정 목록 필터: 방문=취소 제외 전체, 예정/완료=해당 상태만 (다시 누르면 전체) */
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [showCanceled, setShowCanceled] = useState(false);

  const goScheduleFilter = (next: ListFilter) => {
    if (tab !== "schedule") setTab("schedule");
    setShowCanceled(false);
    setListFilter((prev) => {
      // 같은 필터를 다시 누르면 전체로
      if (next !== "all" && prev === next) return "all";
      return next;
    });
  };

  const visibleVisits = useMemo(() => {
    return visits.filter((v) => {
      if (v.status === "canceled") return showCanceled && listFilter === "all";
      if (listFilter === "planned") return v.status === "planned";
      if (listFilter === "done") return v.status === "done";
      // all: 예정·완료·부재·연기 (취소는 showCanceled)
      return true;
    });
  }, [visits, listFilter, showCanceled]);

  const filterEmptyHint =
    listFilter === "planned"
      ? "예정 방문이 없습니다. 「방문」을 누르면 전체 일정을 봅니다."
      : listFilter === "done"
        ? "완료된 방문이 없습니다. 「방문」을 누르면 전체 일정을 봅니다."
        : showCanceled
          ? "표시할 일정이 없습니다."
          : "상단 뱃지나 취소 보기로 다시 표시하세요.";

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
    mutationFn: async (placeOverride?: SalesPlaceSuggest | null) => {
      const place = placeOverride ?? pickedPlace;
      const name = (place?.name || placeQuery).trim();
      if (!name) throw new Error("방문할 상호를 입력하거나 선택하세요.");
      let accountId = place?.accountId || "";
      if (!accountId) {
        const created = await salesTeamApi.createAccount(token, {
          kind: place?.kind || "practice",
          name,
          phone: place?.phone || "",
          address: place?.address || "",
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          representativeName: place?.representativeName || "",
          businessAnchorId: place?.businessAnchorId || null,
          teamVisible: true,
        });
        accountId = created._id;
      } else if (
        place &&
        (place.lat != null || place.lng != null || place.address)
      ) {
        // 위치 확인에서 고른 좌표를 거래처에 반영 (응답은 기다리지 않음)
        void salesTeamApi
          .updateAccount(token, accountId, {
            name: place.name || name,
            address: place.address || "",
            lat: place.lat ?? null,
            lng: place.lng ?? null,
            phone: place.phone || undefined,
            businessAnchorId: place.businessAnchorId || undefined,
          })
          .catch(() => {});
      }
      const hm = clampVisitHmAfterNow(time, ymd, today);
      const plannedAt = new Date(`${ymd}T${hm}:00+09:00`).toISOString();
      const payload: {
        accountId: string;
        plannedAt: string;
        commitment: string;
        memo: string;
        windowStartAt?: string;
        windowEndAt?: string;
      } = {
        accountId,
        plannedAt,
        commitment,
        memo: "",
      };
      if (commitment === "around") {
        payload.windowStartAt = new Date(
          `${ymd}T09:00:00+09:00`,
        ).toISOString();
        payload.windowEndAt = new Date(`${ymd}T18:00:00+09:00`).toISOString();
      }
      return salesTeamApi.createVisit(token, payload);
    },
    onSuccess: () => {
      toast({ title: "일정이 추가되었습니다." });
      setShowForm(false);
      setPlaceQuery("");
      setPickedPlace(null);
      setPlacePickerOpen(false);
      setPlacePickerSeed(null);
      setPlacePickerAccountId(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route-suggest"] });
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
      void qc.invalidateQueries({ queryKey: ["sales-team-route-suggest"] });
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
    <SalesPageShell wide>
      <SalesToolbar className="w-full md:flex-col md:flex-nowrap md:items-stretch">
        <div className="flex w-full flex-col gap-2.5">
          {/* 1행: [탭] ↔ [캘린더 · 오늘 · 일정 추가] — lg+에서만 한 줄 justify-between */}
          <div className="flex w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
            <SalesSegmentTabs
              fit
              compact
              value={tab}
              onChange={setTab}
              className="w-full shrink-0 lg:w-auto"
              options={[
                {
                  value: "schedule",
                  label: "일정 · 동선",
                },
                {
                  value: "report",
                  label: "일일보고",
                },
              ]}
            />
            <div className="flex w-full shrink-0 items-center justify-end gap-2 lg:w-auto lg:justify-start">
              {tab === "schedule" ? (
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setTime(defaultVisitHm(ymd, today));
                    setShowForm(true);
                  }}
                >
                  일정 추가
                </Button>
              ) : reportSubmitted ? (
                <Badge className="h-8 shrink-0 px-3">제출됨</Badge>
              ) : (
                <Badge variant="destructive" className="h-8 shrink-0 px-3">
                  미제출
                </Badge>
              )}
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-1.5 text-xs sm:text-sm">
            <StatusChip
              label="방문"
              value={String(visitCount)}
              muted={!visitCount}
              pressed={tab === "schedule" && listFilter === "all" && !showCanceled}
              onClick={() => {
                setTab("schedule");
                setShowCanceled(false);
                setListFilter("all");
              }}
            />
            <StatusChip
              label="예정"
              value={String(plannedCount)}
              muted={!plannedCount}
              pressed={tab === "schedule" && listFilter === "planned"}
              onClick={() => goScheduleFilter("planned")}
            />
            <StatusChip
              label="완료"
              value={String(doneCount)}
              muted={!doneCount}
              tone={doneCount > 0 ? "ok" : undefined}
              pressed={tab === "schedule" && listFilter === "done"}
              onClick={() => goScheduleFilter("done")}
            />
            <StatusChip
              label="보고"
              value={reportSubmitted ? "제출" : "미제출"}
              tone={reportSubmitted ? "ok" : "alert"}
              pressed={tab === "report"}
              onClick={() =>
                setTab(tab === "report" ? "schedule" : "report")
              }
            />
          </div>
        </div>
      </SalesToolbar>

      {tab === "schedule" ? (
        <div className="space-y-4">
          <SalesSplit
            primaryClassName="order-2 lg:order-1"
            secondaryClassName="order-1 lg:order-2"
            primary={
              <SalesPanel
                title="시간대별 일정"
                description="현장에서 완료·부재·취소·연기를 바로 기록합니다."
                actions={
                  <Button
                    size="sm"
                    variant={showCanceled ? "secondary" : "outline"}
                    disabled={canceledCount === 0 && !showCanceled}
                    onClick={() => {
                      if (tab !== "schedule") setTab("schedule");
                      setListFilter("all");
                      setShowCanceled((v) => !v);
                    }}
                  >
                    {canceledCount === 0 && !showCanceled
                      ? "취소 없음"
                      : showCanceled
                        ? "취소 숨김"
                        : `취소 보기 · ${canceledCount}`}
                  </Button>
                }
              >
                {visitsLoading ? (
                  <p className="text-sm text-muted-foreground">불러오는 중…</p>
                ) : visits.length === 0 ? (
                  <SalesEmptyState
                    icon={CalendarDays}
                    title="이 날 일정이 없습니다"
                    description="상호를 검색해 일정을 넣으면 당일 지도와 타임라인이 자동으로 보입니다."
                    actionLabel="일정 추가"
                    onAction={() => {
                      setTime(defaultVisitHm(ymd, today));
                      setShowForm(true);
                    }}
                  />
                ) : visibleVisits.length === 0 ? (
                  <SalesEmptyState
                    icon={CalendarDays}
                    title={
                      listFilter === "planned"
                        ? "예정 방문이 없습니다"
                        : listFilter === "done"
                          ? "완료된 방문이 없습니다"
                          : "표시 중인 일정이 없습니다"
                    }
                    description={filterEmptyHint}
                    actionLabel="전체 보기"
                    onAction={() => {
                      setListFilter("all");
                      setShowCanceled(false);
                      setTab("schedule");
                    }}
                  />
                ) : (
                  <ol className="relative space-y-0 border-l border-slate-200 pl-5">
                    {visibleVisits.map((v) => {
                      const orderNo = routeOrderByVisitId.get(v._id);
                      return (
                        <li key={v._id} className="relative pb-4 last:pb-0">
                          <span
                            className={`absolute -left-[1.35rem] top-2 h-3 w-3 rounded-full ring-4 ring-white ${
                              v.status === "done"
                                ? "bg-emerald-500"
                                : v.status === "canceled" ||
                                    v.status === "noShow" ||
                                    v.status === "postponed"
                                  ? "bg-slate-300"
                                  : "bg-primary"
                            }`}
                          />
                          <div
                            className={`rounded-xl border px-3.5 py-3 ${
                              v.status === "canceled"
                                ? "border-slate-200/60 bg-slate-50/30 opacity-70"
                                : "border-slate-200/80 bg-slate-50/40"
                            }`}
                          >
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
                                    : v.status === "canceled" ||
                                        v.status === "postponed"
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
                                  variant="outline"
                                  onClick={() =>
                                    statusMut.mutate({
                                      id: v._id,
                                      status: "postponed",
                                    })
                                  }
                                >
                                  연기
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
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setTime(defaultVisitHm(ymd, today));
            setShowForm(true);
            return;
          }
          setShowForm(false);
          setPlaceQuery("");
          setPickedPlace(null);
          setPreviewSuggestYmd(null);
          appliedSuggestKeyRef.current = "";
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,38rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl"
          closeClassName="z-50 right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background opacity-100 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
          closeIconClassName="h-5 w-5"
        >
          <DialogHeader className="relative z-0 shrink-0 space-y-1 border-b border-slate-100 bg-background px-4 py-3.5 pr-14 text-left sm:px-5 sm:pr-14">
            <DialogTitle>방문 추가</DialogTitle>
            <DialogDescription>
              상호·위치를 고른 뒤 날짜·시간을 확인하고 「넣기」하세요. 동선
              제안도 함께 보입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="relative z-0 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5 sm:px-5">
            <div
              className={cn(
                "relative",
                placeQuery.trim().length >= 2 &&
                  !pickedPlace &&
                  "pb-[13.5rem]",
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SalesPlaceSuggestInput
                  className="min-w-0 flex-1"
                  inputClassName="h-10 rounded-xl"
                  listClassName="max-h-[13rem] overflow-y-auto"
                  maxItems={4}
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
                <div
                  className="inline-flex h-10 w-full shrink-0 items-stretch rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 sm:w-auto"
                  role="group"
                  aria-label="확정도"
                >
                  {(
                    [
                      { value: "confirmed", label: "확정" },
                      { value: "around", label: "그쯤" },
                    ] as const
                  ).map((opt) => {
                    const active = commitment === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCommitment(opt.value)}
                        className={cn(
                          "min-w-[4.25rem] flex-1 rounded-lg px-3 text-sm font-medium transition-colors sm:flex-none",
                          active
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900",
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {pickedPlace?.address ? (
              <p className="text-xs text-muted-foreground">
                {pickedPlace.address}
                {pickedPlace.phone ? ` · ${pickedPlace.phone}` : ""}
              </p>
            ) : null}

            <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-700">
                방문 날짜 · 시간
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="date"
                  value={ymd}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    onYmdChange(next);
                    setTime((prev) =>
                      clampVisitHmAfterNow(prev, next, today),
                    );
                    setPreviewSuggestYmd(next);
                  }}
                  className="h-10 rounded-xl bg-white sm:min-w-[10.5rem] sm:flex-1"
                />
                <Input
                  type="time"
                  step={1800}
                  value={time}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setTime(clampVisitHmAfterNow(next, ymd, today));
                  }}
                  className="h-10 rounded-xl bg-white sm:w-[8.5rem]"
                />
                <p className="text-xs text-muted-foreground sm:ml-auto">
                  {formatDayLabel(ymd)} · {time} ·{" "}
                  {COMMITMENT_LABEL[commitment] || commitment}
                </p>
              </div>
            </div>

            {routeSuggestName.length >= 2 ? (
              <div className="space-y-2.5 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <Route className="h-3.5 w-3.5 text-primary" aria-hidden />
                  날짜 제안
                  {routeSuggestLoading ? (
                    <span className="font-normal text-muted-foreground">
                      · 계산 중…
                    </span>
                  ) : null}
                </div>
                {!pickedPlace ? (
                  <p className="text-xs text-muted-foreground">
                    상호를 고르면 1순위 동선 · 2순위 인접일 날짜를 제안합니다.
                    없으면 위에서 날짜·시간을 직접 고르세요.
                  </p>
                ) : null}
                {pickedPlace && routeSuggestError ? (
                  <p className="text-xs text-amber-800">
                    {(routeSuggestError as Error).message ||
                      "날짜 제안을 불러오지 못했습니다. 위에서 날짜·시간을 직접 고르세요."}
                  </p>
                ) : null}
                {pickedPlace && routeSuggest?.message ? (
                  <p className="text-xs text-muted-foreground">
                    {routeSuggest.message}
                  </p>
                ) : null}
                {pickedPlace && routeSuggest?.needsManualPick ? (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-950">
                    <p className="font-medium">3순위 · 직접 선택</p>
                    <p className="mt-0.5 text-amber-900/80">
                      효율 동선이 불명확합니다. 제안 카드를 고르거나, 위에서
                      날짜·시간과 확정/그쯤을 맞춘 뒤 「넣기」하세요.
                      {(routeSuggest.suggestions || []).length > 0
                        ? " 아래 인접일 제안도 참고할 수 있습니다."
                        : ""}
                    </p>
                  </div>
                ) : null}
                {pickedPlace &&
                (routeSuggest?.suggestions || []).length > 0 ? (
                  <ul className="space-y-1.5">
                    {routeSuggest!.suggestions.map((s) => {
                      const selected =
                        (previewSuggestYmd ||
                          routeSuggest!.suggestions[0]?.ymd) === s.ymd;
                      return (
                        <li key={`${s.rank}-${s.ymd}`}>
                          <button
                            type="button"
                            className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              selected
                                ? "border-primary/40 bg-primary/5"
                                : "border-slate-200/80 bg-white hover:bg-slate-50"
                            }`}
                            onClick={() => applySuggestion(s)}
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium text-slate-900">
                                  {formatDayLabel(s.ymd)}
                                </span>
                                <Badge
                                  variant={
                                    s.rank === 1 ? "secondary" : "outline"
                                  }
                                  className="h-5 px-1.5 text-[10px]"
                                >
                                  {s.tierLabel ||
                                    (s.rank === 1
                                      ? "1순위 · 동선"
                                      : "2순위 · 인접일")}
                                </Badge>
                                {s.ymd === ymd ? (
                                  <span className="text-[10px] text-primary">
                                    적용됨
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {s.reason}
                                {s.visitCount
                                  ? ` · 그날 확정 ${s.visitCount}곳`
                                  : ""}
                                {s.totalKm != null ? ` · ${s.totalKm}km` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-medium text-primary">
                              적용
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {pickedPlace && previewSuggestion?.ordered?.length ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">
                        {formatDayLabel(previewSuggestion.ymd)} 예상 순서
                      </p>
                      {previewSuggestion.mapUrl ? (
                        <a
                          href={previewSuggestion.mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary"
                        >
                          카카오맵
                        </a>
                      ) : null}
                    </div>
                    <ol className="space-y-1">
                      {previewSuggestion.ordered.map((stop, idx) => (
                        <li
                          key={`${stop.visitId || stop.name}-${idx}`}
                          className={`flex items-center gap-2 text-xs ${
                            stop.isExtra
                              ? "font-medium text-primary"
                              : "text-slate-700"
                          }`}
                        >
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                            {idx + 1}
                          </span>
                          <span className="min-w-0 truncate">
                            {stop.name}
                            {stop.isExtra ? " (추가)" : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-background px-4 py-3 sm:space-x-0 sm:px-5">
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={createMut.isPending}
            >
              취소
            </Button>
            <Button
              disabled={
                !(pickedPlace?.name || placeQuery.trim()) ||
                createMut.isPending
              }
              onClick={() => createMut.mutate(pickedPlace)}
            >
              {createMut.isPending ? "넣는 중…" : "넣기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        confirmLabel="이 위치로"
        confirmDescription={
          showForm
            ? "지도에서 맞는지 확인한 뒤, 방문 추가에서 날짜·시간을 고릅니다."
            : "지도에서 맞는지 확인한 뒤 이 위치로 저장합니다."
        }
        onConfirm={(place) => {
          if (showForm) {
            setPickedPlace(place);
            setPlaceQuery(place.name);
            return;
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
  pressed,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "ok" | "alert";
  muted?: boolean;
  /** 현재 선택(필터/탭) 상태 */
  pressed?: boolean;
  onClick?: () => void;
}) {
  const className = [
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition-colors",
    pressed
      ? tone === "ok"
        ? "border-emerald-400 bg-emerald-100 text-emerald-900 ring-2 ring-emerald-300/80"
        : tone === "alert"
          ? "border-rose-400 bg-rose-100 text-rose-900 ring-2 ring-rose-300/80"
          : "border-primary/50 bg-primary/10 text-slate-900 ring-2 ring-primary/30"
      : muted
        ? "border-slate-200 bg-slate-50 text-slate-400"
        : tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : tone === "alert"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-slate-200 bg-white text-slate-700",
    onClick ? "cursor-pointer hover:brightness-[0.98] active:scale-[0.98]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span className={pressed ? "opacity-80" : muted ? "text-slate-400" : "text-slate-500"}>
        {label}
      </span>
      <span className={`tabular-nums ${muted && !pressed ? "text-slate-400" : ""}`}>
        {value}
      </span>
      {tone === "ok" && (pressed || !muted) ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={pressed}
        title={
          label === "보고"
            ? pressed
              ? "일정으로 돌아가기"
              : "일일보고 보기"
            : pressed
              ? `${label} 필터 해제`
              : `${label}만 보기`
        }
      >
        {body}
      </button>
    );
  }
  return <span className={className}>{body}</span>;
}
