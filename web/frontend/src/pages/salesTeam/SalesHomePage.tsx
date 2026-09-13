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
  Route,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  kstEndOfMonth,
  kstStartOfMonth,
  toKstYmd,
} from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  addDaysYmd,
} from "./salesDay";
import {
  COMMITMENT_LABEL,
  salesTeamApi,
  visitAccountName,
  type SalesAccount,
  type SalesPlaceSuggest,
  type SalesVisit,
} from "./salesTeamApi";
import SalesPlaceSuggestInput from "./SalesPlaceSuggestInput";
import SalesPlacePickerDrawer from "./SalesPlacePickerDrawer";
import SalesRouteMap from "./SalesRouteMap";
import {
  SalesDayPicker,
  SalesEmptyState,
  SalesPageShell,
  SalesPanel,
  SalesSplit,
  SalesToolbar,
} from "./salesUi";
import {
  NoOrderAlertBanner,
  useNoOrderAlerts,
} from "@/shared/noOrderAlerts";

type ListFilter = "all" | "planned" | "done";

function visitAccount(visit: SalesVisit | null): SalesAccount | null {
  const acc = visit?.accountId;
  if (acc && typeof acc === "object" && "_id" in acc) return acc;
  return null;
}

function formatVisitTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function visitHmFromIso(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value || "10";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

function buildVisitPlannedAtIso(
  visitYmd: string,
  hm: string,
  todayYmd: string,
  commitmentValue: string,
) {
  const clamped = clampVisitHmAfterNow(hm, visitYmd, todayYmd);
  const plannedAt = new Date(`${visitYmd}T${clamped}:00+09:00`).toISOString();
  const payload: {
    plannedAt: string;
    commitment: string;
    status: string;
    windowStartAt?: string | null;
    windowEndAt?: string | null;
  } = {
    plannedAt,
    commitment: commitmentValue,
    status: "planned",
  };
  if (commitmentValue === "around") {
    payload.windowStartAt = new Date(
      `${visitYmd}T09:00:00+09:00`,
    ).toISOString();
    payload.windowEndAt = new Date(`${visitYmd}T18:00:00+09:00`).toISOString();
  } else {
    payload.windowStartAt = null;
    payload.windowEndAt = null;
  }
  return payload;
}

export default function SalesHomePage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const {
    data: noOrderAlertsData,
    isLoading: noOrderAlertsLoading,
  } = useNoOrderAlerts(
    "/api/sales-team/no-order-alerts",
    "sales-team-no-order-alerts",
  );
  const today = toKstYmd(new Date()) || "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [ymd, setYmd] = useState(
    () => searchParams.get("ymd") || today,
  );
  const [reportOpen, setReportOpen] = useState(false);

  const onYmdChange = (next: string) => {
    setYmd(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next === today) nextParams.delete("ymd");
    else nextParams.set("ymd", next);
    nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!searchParams.has("tab")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const [showForm, setShowForm] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [pickedPlace, setPickedPlace] = useState<SalesPlaceSuggest | null>(
    null,
  );
  const [time, setTime] = useState(() => defaultVisitHm(today, today));
  const [commitment, setCommitment] = useState("around");
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [placePickerSeed, setPlacePickerSeed] =
    useState<Partial<SalesPlaceSuggest> | null>(null);
  const [placePickerAccountId, setPlacePickerAccountId] = useState<
    string | null
  >(null);
  const [completeVisit, setCompleteVisit] = useState<SalesVisit | null>(null);
  const [completeMemo, setCompleteMemo] = useState("");
  const [confirmCommitmentVisit, setConfirmCommitmentVisit] =
    useState<SalesVisit | null>(null);
  const [rescheduleVisit, setRescheduleVisit] = useState<SalesVisit | null>(
    null,
  );
  const [rescheduleYmd, setRescheduleYmd] = useState(today);
  const [rescheduleHm, setRescheduleHm] = useState("10:00");
  const [rescheduleCommitment, setRescheduleCommitment] = useState("around");
  const [rescheduleAnchorYmd, setRescheduleAnchorYmd] = useState(today);
  const [reschedulePreviewYmd, setReschedulePreviewYmd] = useState<
    string | null
  >(null);
  const [calendarMonthYmd, setCalendarMonthYmd] = useState(
    () => kstStartOfMonth(ymd) || ymd,
  );

  const [visitSummary, setVisitSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [previewSuggestYmd, setPreviewSuggestYmd] = useState<string | null>(
    null,
  );
  /** 날짜 제안 창 기준일 — 모달 열 때 고정(제안 적용으로 ymd가 바뀌어도 창 유지) */
  const [suggestAnchorYmd, setSuggestAnchorYmd] = useState(ymd);
  const appliedSuggestKeyRef = useRef("");

  const { data: visitsData, isLoading: visitsLoading } = useQuery({
    queryKey: ["sales-team-visits", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () =>
      salesTeamApi.listVisits(token, { fromYmd: ymd, toYmd: ymd }),
  });

  const calendarFromYmd = useMemo(() => {
    const start = kstStartOfMonth(calendarMonthYmd) || calendarMonthYmd;
    return addDaysYmd(start, -7);
  }, [calendarMonthYmd]);
  const calendarToYmd = useMemo(() => {
    const end = kstEndOfMonth(calendarMonthYmd) || calendarMonthYmd;
    return addDaysYmd(end, 7);
  }, [calendarMonthYmd]);

  const { data: calendarVisitsData } = useQuery({
    queryKey: ["sales-team-visits-month", calendarFromYmd, calendarToYmd],
    enabled: Boolean(token && calendarFromYmd && calendarToYmd),
    queryFn: () =>
      salesTeamApi.listVisits(token, {
        fromYmd: calendarFromYmd,
        toYmd: calendarToYmd,
      }),
    staleTime: 30_000,
  });

  const countsByYmd = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of calendarVisitsData?.items || []) {
      if (v.status === "canceled" || v.status === "postponed") continue;
      const day = toKstYmd(new Date(v.plannedAt));
      if (!day) continue;
      map[day] = (map[day] || 0) + 1;
    }
    return map;
  }, [calendarVisitsData]);

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
    queryKey: [
      "sales-team-route-suggest",
      routeSuggestKey,
      suggestAnchorYmd,
    ],
    enabled: Boolean(
      token &&
        showForm &&
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
        anchorYmd: suggestAnchorYmd,
        includeAround: true,
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

  const rescheduleAccount = visitAccount(rescheduleVisit);
  const rescheduleSuggestName = (rescheduleAccount?.name || "").trim();
  const {
    data: rescheduleRouteSuggest,
    isFetching: rescheduleSuggestLoading,
    error: rescheduleSuggestError,
  } = useQuery({
    queryKey: [
      "sales-team-route-suggest-reschedule",
      rescheduleVisit?._id,
      rescheduleSuggestName,
      rescheduleAccount?._id || "",
      rescheduleAnchorYmd,
    ],
    enabled: Boolean(
      token &&
        rescheduleVisit &&
        rescheduleAccount &&
        rescheduleSuggestName.length >= 2,
    ),
    queryFn: () =>
      salesTeamApi.suggestRouteDays(token, {
        name: rescheduleSuggestName,
        address: rescheduleAccount?.address || "",
        accountId: rescheduleAccount?._id || null,
        lat: rescheduleAccount?.lat ?? null,
        lng: rescheduleAccount?.lng ?? null,
        anchorYmd: rescheduleAnchorYmd,
        includeAround: true,
        excludeVisitId: rescheduleVisit?._id || null,
      }),
    staleTime: 30_000,
    retry: false,
  });

  const reschedulePreviewSuggestion = useMemo(() => {
    const items = rescheduleRouteSuggest?.suggestions || [];
    if (!items.length) return null;
    if (reschedulePreviewYmd) {
      return items.find((s) => s.ymd === reschedulePreviewYmd) || items[0];
    }
    return items[0];
  }, [rescheduleRouteSuggest, reschedulePreviewYmd]);

  const applyRescheduleSuggestion = (s: {
    ymd: string;
    suggestedTime?: string;
  }) => {
    setReschedulePreviewYmd(s.ymd);
    setRescheduleYmd(s.ymd);
    if (s.suggestedTime) {
      setRescheduleHm(clampVisitHmAfterNow(s.suggestedTime, s.ymd, today));
    } else {
      setRescheduleHm(defaultVisitHm(s.ymd, today));
    }
  };

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["sales-team-daily-report", ymd],
    enabled: Boolean(token && ymd),
    queryFn: () => salesTeamApi.getDailyReport(token, ymd),
  });

  const visits = visitsData?.items || [];
  /** 상단 뱃지: 취소·연기는 카운트·필터 대상에서 제외 */
  const activeVisits = useMemo(
    () =>
      visits.filter(
        (v) => v.status !== "canceled" && v.status !== "postponed",
      ),
    [visits],
  );
  const doneCount = activeVisits.filter((v) => v.status === "done").length;
  const plannedCount = activeVisits.filter((v) => v.status === "planned").length;
  const canceledOrPostponedCount = visits.filter(
    (v) => v.status === "canceled" || v.status === "postponed",
  ).length;
  const reportSubmitted = Boolean(reportData?.report);

  /** 일정 목록 필터: 기본=취소·연기 제외 전체, 예정/완료=해당 상태만 (다시 누르면 전체) */
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [showCanceled, setShowCanceled] = useState(false);

  const goScheduleFilter = (next: ListFilter) => {
    setShowCanceled(false);
    setListFilter((prev) => {
      // 같은 필터를 다시 누르면 전체로
      if (next !== "all" && prev === next) return "all";
      return next;
    });
  };

  const filterEmptyHint =
    listFilter === "planned"
      ? "예정 방문이 없습니다. 「예정」을 다시 누르거나 「전체 보기」로 전체 일정을 봅니다."
      : listFilter === "done"
        ? "완료된 방문이 없습니다. 「완료」를 다시 누르거나 「전체 보기」로 전체 일정을 봅니다."
        : showCanceled
          ? "표시할 일정이 없습니다."
          : "상단 뱃지나 취소·연기 보기로 다시 표시하세요.";

  const routeVisitKey = visits
    .filter((v) => v.status === "planned")
    .map((v) => v._id)
    .join(",");

  const { data: route, isFetching: routeLoading } = useQuery({
    queryKey: ["sales-team-route", ymd, routeVisitKey],
    enabled: Boolean(token && ymd && routeVisitKey),
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

  const visibleVisits = useMemo(() => {
    const filtered = visits.filter((v) => {
      if (v.status === "canceled" || v.status === "postponed") {
        return showCanceled && listFilter === "all";
      }
      if (listFilter === "planned") return v.status === "planned";
      if (listFilter === "done") return v.status === "done";
      // all: 예정·완료·부재 (취소·연기는 showCanceled)
      return true;
    });
    return filtered.sort((a, b) => {
      const oa = routeOrderByVisitId.get(a._id);
      const ob = routeOrderByVisitId.get(b._id);
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (oa == null && ob != null) return 1;
      return (
        new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime()
      );
    });
  }, [visits, listFilter, showCanceled, routeOrderByVisitId]);

  useEffect(() => {
    if (!reportOpen) return;
    const r = reportData?.report;
    if (r) {
      setVisitSummary(r.visitSummary || "");
      setIssues(
        [r.issues, r.tomorrowPlan].filter(Boolean).join("\n\n"),
      );
      setTomorrowPlan("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefills when report modal opens
  }, [reportOpen, reportData?.reportYmd, reportData?.report?._id, ymd]);

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
      void qc.invalidateQueries({ queryKey: ["sales-team-visits-month"] });
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
      void qc.invalidateQueries({ queryKey: ["sales-team-visits-month"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-stats"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-daily-report"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const confirmCommitmentMut = useMutation({
    mutationFn: (id: string) =>
      salesTeamApi.updateVisit(token, id, {
        commitment: "confirmed",
        windowStartAt: null,
        windowEndAt: null,
        autoScheduleTime: false,
      }),
    onSuccess: () => {
      toast({ title: "확정으로 바꿨습니다." });
      setConfirmCommitmentVisit(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-visits-month"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route-suggest"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: ({ id, memo }: { id: string; memo: string }) =>
      salesTeamApi.updateVisit(token, id, { status: "done", memo }),
    onSuccess: () => {
      toast({ title: "방문 완료 · 보고서를 저장했습니다." });
      setCompleteVisit(null);
      setCompleteMemo("");
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-visits-month"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-stats"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-daily-report"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const rescheduleMut = useMutation({
    mutationFn: ({
      id,
      visitYmd,
      hm,
      commitmentValue,
    }: {
      id: string;
      visitYmd: string;
      hm: string;
      commitmentValue: string;
    }) =>
      salesTeamApi.updateVisit(
        token,
        id,
        buildVisitPlannedAtIso(visitYmd, hm, today, commitmentValue),
      ),
    onSuccess: (_data, vars) => {
      toast({
        title: `${formatDayLabel(vars.visitYmd)} ${vars.hm}으로 옮겼습니다.`,
      });
      setRescheduleVisit(null);
      setReschedulePreviewYmd(null);
      if (vars.visitYmd !== ymd) onYmdChange(vars.visitYmd);
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-visits-month"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-stats"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-daily-report"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-route-suggest"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const openCompleteReport = (v: SalesVisit) => {
    const visitYmd = toKstYmd(new Date(v.plannedAt)) || "";
    if (visitYmd && visitYmd > today) {
      toast({
        title: "미래 일정은 완료할 수 없습니다.",
        description: "방문 당일 또는 지난 날만 완료 처리할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    setCompleteVisit(v);
    setCompleteMemo(v.memo || "");
  };

  const openReschedule = (v: SalesVisit) => {
    const visitYmd = toKstYmd(new Date(v.plannedAt)) || ymd;
    setRescheduleVisit(v);
    setRescheduleYmd(visitYmd);
    setRescheduleHm(
      clampVisitHmAfterNow(visitHmFromIso(v.plannedAt), visitYmd, today),
    );
    setRescheduleCommitment(v.commitment || "around");
    setRescheduleAnchorYmd(visitYmd);
    setReschedulePreviewYmd(visitYmd);
  };

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
      setReportOpen(false);
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
      <SalesToolbar className="w-full">
        {/* 캘린더 | 일정 추가 / 필터 뱃지(한 줄) */}
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-2">
          <SalesDayPicker
            compact
            ymd={ymd}
            today={today}
            onChange={onYmdChange}
            countsByYmd={countsByYmd}
            onVisibleMonthChange={setCalendarMonthYmd}
          />
          <div className="ml-auto shrink-0 sm:order-last sm:ml-0">
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={() => {
                setTime(defaultVisitHm(ymd, today));
                setSuggestAnchorYmd(ymd);
                setShowForm(true);
              }}
            >
              일정 추가
            </Button>
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-1 text-xs sm:w-auto sm:min-w-0 sm:flex-1 sm:flex-nowrap sm:gap-1.5 sm:text-sm">
            <StatusChip
              label="예정"
              value={String(plannedCount)}
              muted={!plannedCount}
              pressed={listFilter === "planned"}
              onClick={() => goScheduleFilter("planned")}
            />
            <StatusChip
              label="완료"
              value={String(doneCount)}
              muted={!doneCount}
              tone={doneCount > 0 ? "ok" : undefined}
              pressed={listFilter === "done"}
              onClick={() => goScheduleFilter("done")}
            />
            <StatusChip
              label="보고"
              value=""
              tone={reportSubmitted ? "ok" : "alert"}
              pressed={reportOpen}
              onClick={() => setReportOpen(true)}
            />
          </div>
        </div>
      </SalesToolbar>

      <div className="space-y-4">
        <NoOrderAlertBanner
          data={noOrderAlertsData}
          loading={noOrderAlertsLoading}
          variant="sales"
        />
        <SalesSplit
          primaryClassName="order-2 lg:order-1"
          secondaryClassName="order-1 lg:order-2"
          primary={
            <SalesPanel
              title="시간대별 일정"
              description="현장에서 완료 보고·연기·취소를 바로 기록합니다."
              actions={
                <Button
                  size="sm"
                  variant={showCanceled ? "secondary" : "outline"}
                  disabled={canceledOrPostponedCount === 0 && !showCanceled}
                  onClick={() => {
                    setListFilter("all");
                    setShowCanceled((v) => !v);
                  }}
                >
                  {canceledOrPostponedCount === 0 && !showCanceled
                    ? "취소·연기 없음"
                    : showCanceled
                      ? "취소·연기 숨김"
                      : `취소·연기 보기 · ${canceledOrPostponedCount}`}
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
                      setSuggestAnchorYmd(ymd);
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
                    }}
                  />
                ) : (
                  <ol className="relative space-y-0 border-l border-slate-200 pl-5">
                    {visibleVisits.map((v) => {
                      const orderNo = routeOrderByVisitId.get(v._id);
                      const visitYmd = toKstYmd(new Date(v.plannedAt)) || "";
                      const canComplete = !visitYmd || visitYmd <= today;
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
                              v.status === "canceled" ||
                              v.status === "postponed"
                                ? "border-slate-200/60 bg-slate-50/30 opacity-70"
                                : "border-slate-200/80 bg-slate-50/40"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  {orderNo ? (
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                                      {orderNo}
                                    </span>
                                  ) : null}
                                  <span className="truncate font-medium">
                                    {visitAccountName(v)}
                                  </span>
                                  {v.status === "planned" ? (
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-md text-xs font-medium text-primary underline-offset-2 hover:underline"
                                      onClick={() => openReschedule(v)}
                                      title="날짜·시간 변경"
                                    >
                                      {formatVisitTime(v.plannedAt)}
                                    </button>
                                  ) : (
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {formatVisitTime(v.plannedAt)}
                                    </span>
                                  )}
                                </div>
                                {v.memo ? (
                                  <p className="mt-1 text-xs text-slate-600">
                                    {v.memo}
                                  </p>
                                ) : null}
                              </div>
                              {v.status === "planned" ? (
                                v.commitment === "around" ||
                                v.commitment === "askBefore" ? (
                                  <button
                                    type="button"
                                    className="shrink-0"
                                    onClick={() =>
                                      setConfirmCommitmentVisit(v)
                                    }
                                    aria-label={`${COMMITMENT_LABEL[v.commitment] || v.commitment} — 확정하기`}
                                  >
                                    <Badge
                                      variant="secondary"
                                      className="cursor-pointer hover:bg-slate-200"
                                    >
                                      {COMMITMENT_LABEL[v.commitment] ||
                                        v.commitment}
                                    </Badge>
                                  </button>
                                ) : (
                                  <Badge variant="default" className="shrink-0">
                                    {COMMITMENT_LABEL[v.commitment] ||
                                      "확정"}
                                  </Badge>
                                )
                              ) : (
                                <Badge
                                  variant={
                                    v.status === "done"
                                      ? "default"
                                      : "outline"
                                  }
                                  className="shrink-0"
                                >
                                  {visitStatusLabel(v.status)}
                                </Badge>
                              )}
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
                                  disabled={!canComplete}
                                  title={
                                    canComplete
                                      ? undefined
                                      : "미래 일정은 완료할 수 없습니다"
                                  }
                                  onClick={() => openCompleteReport(v)}
                                >
                                  완료
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openReschedule(v)}
                                >
                                  일정 변경
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

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>{ymd} 보고</DialogTitle>
            <DialogDescription>
              오늘 방문과 남길 메모만 짧게 적습니다.
            </DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="space-y-3">
              {visits.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  일정 {visits.length}건 · 완료 {doneCount}건
                </p>
              ) : null}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  방문 요약
                </label>
                <Textarea
                  rows={4}
                  placeholder="· 거래처명 (완료/예정)…"
                  value={visitSummary}
                  onChange={(e) => setVisitSummary(e.target.value)}
                  className="resize-y rounded-xl"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  메모 · 내일 계획
                </label>
                <Textarea
                  rows={3}
                  placeholder="이슈, 팔로업, 내일 방문…"
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  className="resize-y rounded-xl"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => setReportOpen(false)}
              disabled={saveReportMut.isPending}
            >
              닫기
            </Button>
            <Button
              disabled={reportLoading || saveReportMut.isPending}
              onClick={() => saveReportMut.mutate()}
            >
              {saveReportMut.isPending
                ? "저장 중…"
                : reportSubmitted
                  ? "다시 저장"
                  : "제출"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setTime(defaultVisitHm(ymd, today));
            setSuggestAnchorYmd(ymd);
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
            <DialogDescription className="sr-only">
              상호·위치와 방문 날짜를 고른 뒤 넣기하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="relative z-0 min-h-0 space-y-3 overflow-y-auto px-4 py-3.5 sm:px-5">
            <SalesPlaceSuggestInput
              className="min-w-0"
              inputClassName="h-10 rounded-xl"
              listMode="inline"
              listClassName="max-h-[16rem] overflow-y-auto"
              maxItems={24}
              value={placeQuery}
              onChange={(v) => {
                setPlaceQuery(v);
                setPickedPlace(null);
              }}
              onPick={(item) => {
                setPickedPlace(item);
                setPlaceQuery(item.name);
              }}
              placeholder="지역명 상호 · 예: 거제 서울미소"
              autoFocus
            />
            {pickedPlace ? (
              <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                <span className="font-medium text-slate-900">
                  {pickedPlace.address?.trim() || "주소 없음 — 목록에서 주소를 확인해 주세요"}
                </span>
                {pickedPlace.phone ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {pickedPlace.phone}
                  </span>
                ) : null}
              </p>
            ) : null}

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5">
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
                <p className="text-xs text-muted-foreground sm:ml-auto">
                  {formatDayLabel(ymd)} ·{" "}
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
                    없으면 위에서 날짜를 직접 고르세요.
                  </p>
                ) : null}
                {pickedPlace && routeSuggestError ? (
                  <p className="text-xs text-amber-800">
                    {(routeSuggestError as Error).message ||
                      "날짜 제안을 불러오지 못했습니다. 위에서 날짜를 직접 고르세요."}
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
                      날짜와 확정/그쯤을 맞춘 뒤 「넣기」하세요.
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
      <AlertDialog
        open={Boolean(confirmCommitmentVisit)}
        onOpenChange={(open) => {
          if (!open && !confirmCommitmentMut.isPending) {
            setConfirmCommitmentVisit(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>확정할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCommitmentVisit
                ? `${visitAccountName(confirmCommitmentVisit)} · ${formatVisitTime(confirmCommitmentVisit.plannedAt)} 방문을 「확정」으로 바꿉니다.`
                : "방문을 확정으로 바꿉니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={confirmCommitmentMut.isPending}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !confirmCommitmentVisit || confirmCommitmentMut.isPending
              }
              onClick={(e) => {
                e.preventDefault();
                if (!confirmCommitmentVisit) return;
                confirmCommitmentMut.mutate(confirmCommitmentVisit._id);
              }}
            >
              {confirmCommitmentMut.isPending ? "저장 중…" : "확정"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(completeVisit)}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteVisit(null);
            setCompleteMemo("");
          }
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>방문 보고서</DialogTitle>
            <DialogDescription>
              {completeVisit
                ? `${visitAccountName(completeVisit)} · ${formatVisitTime(completeVisit.plannedAt)}`
                : "방문 결과를 남기고 완료 처리합니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">방문 내용</p>
            <Textarea
              value={completeMemo}
              onChange={(e) => setCompleteMemo(e.target.value)}
              placeholder={"· 만난 사람 / 관심도\n· 다음 액션 · 메모"}
              rows={6}
              className="rounded-xl"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => {
                setCompleteVisit(null);
                setCompleteMemo("");
              }}
              disabled={completeMut.isPending}
            >
              닫기
            </Button>
            <Button
              disabled={!completeVisit || completeMut.isPending}
              onClick={() => {
                if (!completeVisit) return;
                completeMut.mutate({
                  id: completeVisit._id,
                  memo: completeMemo.trim(),
                });
              }}
            >
              {completeMut.isPending ? "저장 중…" : "완료 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(rescheduleVisit)}
        onOpenChange={(open) => {
          if (!open) {
            setRescheduleVisit(null);
            setReschedulePreviewYmd(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-4 py-3.5 text-left sm:px-5">
            <DialogTitle>날짜·시간 변경</DialogTitle>
            <DialogDescription>
              {rescheduleVisit
                ? `${visitAccountName(rescheduleVisit)} 방문을 다른 날짜·시간으로 옮깁니다. 동선 제안을 고르거나 아래에서 직접 설정하세요.`
                : "날짜와 시간을 고르세요."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3.5 sm:px-5">
            <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-700">
                수동 설정 · 방문 날짜 · 시간
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="date"
                  value={rescheduleYmd}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setRescheduleYmd(next);
                    setReschedulePreviewYmd(next);
                    setRescheduleHm((prev) =>
                      clampVisitHmAfterNow(prev, next, today),
                    );
                  }}
                  className="h-10 rounded-xl bg-white sm:min-w-[10.5rem] sm:flex-1"
                />
                <Input
                  type="time"
                  step={1800}
                  value={rescheduleHm}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setRescheduleHm(
                      clampVisitHmAfterNow(next, rescheduleYmd, today),
                    );
                  }}
                  className="h-10 rounded-xl bg-white sm:w-[8.5rem]"
                />
              </div>
              <div
                className="inline-flex h-10 w-full items-stretch rounded-xl border border-slate-200/80 bg-slate-100/80 p-1"
                role="group"
                aria-label="확정도"
              >
                {(
                  [
                    { value: "confirmed", label: "확정" },
                    { value: "around", label: "그쯤" },
                  ] as const
                ).map((opt) => {
                  const active = rescheduleCommitment === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRescheduleCommitment(opt.value)}
                      className={cn(
                        "min-w-[4.25rem] flex-1 rounded-lg px-3 text-sm font-medium transition-colors",
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
              <p className="text-xs text-muted-foreground">
                {formatDayLabel(rescheduleYmd)} · {rescheduleHm} ·{" "}
                {COMMITMENT_LABEL[rescheduleCommitment] ||
                  rescheduleCommitment}
              </p>
            </div>

            <div className="space-y-2.5 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <Route className="h-3.5 w-3.5 text-primary" aria-hidden />
                자동 제안
                {rescheduleSuggestLoading ? (
                  <span className="font-normal text-muted-foreground">
                    · 계산 중…
                  </span>
                ) : null}
              </div>
              {!rescheduleAccount ? (
                <p className="text-xs text-muted-foreground">
                  거래처 정보가 없어 동선 제안을 만들 수 없습니다. 위에서
                  날짜·시간을 직접 고르세요.
                </p>
              ) : null}
              {rescheduleAccount && rescheduleSuggestError ? (
                <p className="text-xs text-amber-800">
                  {(rescheduleSuggestError as Error).message ||
                    "날짜 제안을 불러오지 못했습니다. 위에서 직접 고르세요."}
                </p>
              ) : null}
              {rescheduleAccount && rescheduleRouteSuggest?.message ? (
                <p className="text-xs text-muted-foreground">
                  {rescheduleRouteSuggest.message}
                </p>
              ) : null}
              {rescheduleAccount &&
              rescheduleRouteSuggest?.needsManualPick ? (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-950">
                  <p className="font-medium">효율 동선이 불명확합니다</p>
                  <p className="mt-0.5 text-amber-900/80">
                    제안 카드를 고르거나, 위에서 날짜·시간을 직접 맞춘 뒤
                    옮기세요.
                  </p>
                </div>
              ) : null}
              {rescheduleAccount &&
              (rescheduleRouteSuggest?.suggestions || []).length > 0 ? (
                <ul className="space-y-1.5">
                  {rescheduleRouteSuggest!.suggestions.map((s) => {
                    const selected =
                      (reschedulePreviewYmd ||
                        rescheduleRouteSuggest!.suggestions[0]?.ymd) ===
                      s.ymd;
                    return (
                      <li key={`${s.rank}-${s.ymd}`}>
                        <button
                          type="button"
                          className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? "border-primary/40 bg-primary/5"
                              : "border-slate-200/80 bg-white hover:bg-slate-50"
                          }`}
                          onClick={() => applyRescheduleSuggestion(s)}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-slate-900">
                                {formatDayLabel(s.ymd)}
                              </span>
                              {s.suggestedTime ? (
                                <span className="text-xs font-medium text-slate-700">
                                  {s.suggestedTime}
                                </span>
                              ) : null}
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
                              {s.ymd === rescheduleYmd ? (
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
              {rescheduleAccount &&
              reschedulePreviewSuggestion?.ordered?.length ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-700">
                      {formatDayLabel(reschedulePreviewSuggestion.ymd)} 예상
                      순서
                    </p>
                    {reschedulePreviewSuggestion.mapUrl ? (
                      <a
                        href={reschedulePreviewSuggestion.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary"
                      >
                        카카오맵
                      </a>
                    ) : null}
                  </div>
                  <ol className="space-y-1">
                    {reschedulePreviewSuggestion.ordered.map((stop, idx) => (
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
                          {stop.isExtra ? " (이동)" : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-4 py-3 sm:space-x-0 sm:px-5">
            <Button
              variant="outline"
              onClick={() => setRescheduleVisit(null)}
              disabled={rescheduleMut.isPending}
            >
              닫기
            </Button>
            <Button
              disabled={!rescheduleVisit || rescheduleMut.isPending}
              onClick={() => {
                if (!rescheduleVisit) return;
                rescheduleMut.mutate({
                  id: rescheduleVisit._id,
                  visitYmd: rescheduleYmd,
                  hm: rescheduleHm,
                  commitmentValue: rescheduleCommitment,
                });
              }}
            >
              {rescheduleMut.isPending ? "저장 중…" : "일정 옮기기"}
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
        confirmDescription="지도에서 맞는지 확인한 뒤 이 위치로 저장합니다."
        onConfirm={(place) => {
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
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium transition-colors sm:gap-1.5 sm:px-3 sm:py-1.5",
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
      <span
        className={
          value
            ? pressed
              ? "opacity-80"
              : muted
                ? "text-slate-400"
                : "text-slate-500"
            : undefined
        }
      >
        {label}
      </span>
      {value ? (
        <span className={`tabular-nums ${muted && !pressed ? "text-slate-400" : ""}`}>
          {value}
        </span>
      ) : null}
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
            ? "일일보고 작성"
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
