/**
 * 치과 기공의뢰 리메이크 — 최근 90일·환자명 모두 서버에서 조회.
 * (캘린더와 별개인 /my 페이지 목록에 의존하지 않음)
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/shared/practice/practiceRecentTransferList.ts
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * change-log:
 * - 2026-09-12: 기본 검색 창 14일 → 90일(리메이크 정책과 동일).
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Repeat, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/ui/cn";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import { useAuthStore } from "@/store/useAuthStore";
import {
  canRemakePracticeTransferByStatus,
  groupPracticeRecentRequests,
  mapMyPracticeTransferApiRows,
  toStatusBadgeLabel,
  type PracticeRecentTransferItem,
} from "@/shared/practice/practiceRecentTransferList";
import {
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import { formatManWon } from "@/shared/practice/practiceTransferFeeQuote";
import { PRE_PLATFORM_REMAKE_LABEL } from "@/shared/practice/practiceTransferLabReceive";

const REMAKE_RECENT_DAYS = 90;
const SEARCH_DEBOUNCE_MS = 300;

export type PracticeRemakeSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** @deprecated 서버 조회로 대체. 호환용으로 남겨 둠. */
  transfers?: PracticeRecentTransferItem[];
  busy?: boolean;
  onSelectRemake: (payload: {
    transfer: PracticeRecentTransferItem;
    arrivalYmd: string;
  }) => void;
  onPrePlatformRemake: () => void;
};

const remakeFeeTotal = (transfer: PracticeRecentTransferItem) => {
  const q = transfer.remakeFeeQuote || null;
  if (!q) return 0;
  return Math.max(0, Math.round(Number(q.total || q.labFeeTotal || 0)));
};

const transferKey = (transfer: PracticeRecentTransferItem) =>
  String(transfer.transferMongoIds?.[0] || transfer.id || "").trim();

export function PracticeRemakeSearchDialog({
  open,
  onOpenChange,
  busy = false,
  onSelectRemake,
  onPrePlatformRemake,
}: PracticeRemakeSearchDialogProps) {
  const authToken = useAuthStore((s) => s.token);
  const [patientQuery, setPatientQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [arrivalYmd, setArrivalYmd] = useState("");
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [hits, setHits] = useState<PracticeRecentTransferItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const todayYmd = toKstYmd(new Date()) || "";

  useEffect(() => {
    if (!open) return;
    setPatientQuery("");
    setDebouncedQuery("");
    setSelectedId("");
    setArrivalYmd("");
    setArrivalOpen(false);
    setHits([]);
    setSearching(false);
    setSearchError("");
  }, [open]);

  useEffect(() => {
    const q = patientQuery.trim().normalize("NFC");
    const t = window.setTimeout(() => setDebouncedQuery(q), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [patientQuery]);

  useEffect(() => {
    if (!open) return;
    if (!authToken) {
      setHits([]);
      setSearching(false);
      setSearchError("로그인이 필요합니다.");
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError("");

    void (async () => {
      try {
        const qs = new URLSearchParams({
          limit: "30",
          days: String(REMAKE_RECENT_DAYS),
        });
        if (debouncedQuery) qs.set("q", debouncedQuery);
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/remake-candidates?${qs}`,
          method: "GET",
          token: authToken,
        });
        if (cancelled) return;
        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as { message?: string })
              : {};
          setHits([]);
          setSearchError(String(body.message || "검색에 실패했습니다."));
          return;
        }
        const body = res.data;
        const data =
          body &&
          typeof body === "object" &&
          "data" in (body as Record<string, unknown>)
            ? (body as { data?: unknown }).data
            : body;
        const list =
          data &&
          typeof data === "object" &&
          Array.isArray((data as { requests?: unknown }).requests)
            ? ((data as { requests: unknown[] }).requests ?? [])
            : [];
        const mapped = mapMyPracticeTransferApiRows(list);
        const grouped = groupPracticeRecentRequests(mapped, []);
        setHits(
          grouped.filter((t) => canRemakePracticeTransferByStatus(t.status)),
        );
      } catch {
        if (!cancelled) {
          setHits([]);
          setSearchError("검색에 실패했습니다.");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, debouncedQuery, open]);

  useEffect(() => {
    if (!selectedId) return;
    if (!hits.some((t) => transferKey(t) === selectedId)) {
      setSelectedId("");
      setArrivalYmd("");
    }
  }, [hits, selectedId]);

  const selected = useMemo(
    () => hits.find((t) => transferKey(t) === selectedId) || null,
    [hits, selectedId],
  );

  const canSubmit =
    Boolean(selected) &&
    /^\d{4}-\d{2}-\d{2}$/.test(arrivalYmd) &&
    (!todayYmd || arrivalYmd >= todayYmd) &&
    !busy;

  const activeQuery = patientQuery.trim();
  const emptyMessage = (() => {
    if (searching) return "검색 중…";
    if (searchError) return searchError;
    if (activeQuery) return "결과 없음";
    return "최근 90일 의뢰 없음";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Repeat className="h-5 w-5 text-amber-600" />
            리메이크 의뢰
          </DialogTitle>
          <DialogDescription className="sr-only">
            최근 의뢰를 고르거나 환자명으로 검색해 리메이크합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="remake-patient-search"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              placeholder="환자명"
              className="pl-8 pr-9"
              autoFocus
              aria-label="환자명"
            />
            {searching ? (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : patientQuery.trim() ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setPatientQuery("")}
                aria-label="검색어 지우기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1.5">
            {hits.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              hits.map((transfer) => {
                const key = transferKey(transfer);
                const patient =
                  resolvePracticeTransferListPatientName(transfer) || "—";
                const teeth =
                  resolvePracticeTransferListToothNumbers(transfer) || "—";
                const fee = remakeFeeTotal(transfer);
                const active = key === selectedId;
                return (
                  <button
                    key={key || transfer.transferId}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedId(key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border-amber-400 bg-amber-50/90"
                        : "border-transparent hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                      {patient}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {teeth}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fee > 0 ? formatManWon(fee) : "무료"}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {toStatusBadgeLabel(transfer.status)}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>

          <div
            className={cn(
              "rounded-xl border-2 p-3.5 transition-colors",
              selected
                ? "border-amber-400 bg-amber-50 shadow-sm"
                : "border-dashed border-slate-200 bg-slate-50/80",
            )}
          >
            <div
              className={cn(
                "mb-2 flex items-center gap-2 text-sm font-semibold",
                selected ? "text-amber-900" : "text-slate-500",
              )}
            >
              <CalendarDays
                className={cn(
                  "h-4 w-4",
                  selected ? "text-amber-600" : "text-slate-400",
                )}
              />
              치과도착일
            </div>
            <Popover
              open={arrivalOpen}
              onOpenChange={(next) => {
                if (!selected || busy) return;
                setArrivalOpen(next);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-11 w-full justify-start text-base font-medium",
                    selected
                      ? "border-amber-300 bg-white hover:bg-amber-50/60"
                      : "border-slate-200 bg-white/70 text-muted-foreground",
                    arrivalYmd && selected ? "text-slate-900" : "",
                  )}
                  disabled={!selected || busy}
                >
                  {arrivalYmd || (selected ? "날짜 선택" : "의뢰 선택 후")}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Calendar
                  mode="single"
                  required
                  numberOfMonths={1}
                  selected={
                    arrivalYmd
                      ? new Date(`${arrivalYmd}T12:00:00+09:00`)
                      : undefined
                  }
                  onSelect={(date) => {
                    const ymd = toKstYmd(date) || "";
                    if (!ymd) return;
                    setArrivalYmd(ymd);
                    setArrivalOpen(false);
                  }}
                  disabled={(date) => {
                    const ymd = toKstYmd(date) || "";
                    if (!ymd) return true;
                    return Boolean(todayYmd && ymd < todayYmd);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-9 w-full border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
              onPrePlatformRemake();
            }}
          >
            {PRE_PLATFORM_REMAKE_LABEL}
          </Button>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => {
              if (!selected || !canSubmit) return;
              onSelectRemake({ transfer: selected, arrivalYmd });
            }}
          >
            {busy ? "처리 중…" : "리메이크 의뢰"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
