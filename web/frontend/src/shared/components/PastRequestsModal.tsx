// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-08-19: 진행중인 의뢰 목록에서 준비 단계 취소.
// - 2026-08-19: description prop — 진행중인 의뢰 목록 안내 문구.
// - 2026-08-18: 모달을 정책 안내와 같은 rounded-2xl·필터 카드 톤으로 정리.
// - 2026-08-18: 지난 의뢰 기본에서 취소 제외(추적관리만).
// - 2026-08-18: 열릴 때 initialPeriod로 페이지 헤더 기간과 동기.
// - 2026-08-03: PastRequestsModal: display normalize manufacturer stage (의뢰 -> 준비) for table '상태' column. (display-only)
import { useEffect, useMemo, useRef, useState } from "react";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { formatImplantDisplay } from "@/utils/implant";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";

type ApiMyRequestsResponse = {
  success: boolean;
  data?: {
    requests?: any[];
    pagination?: { page: number; pages: number };
  };
  message?: string;
};

export type PastRequestsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onSelectRequest: (request: any) => void;
  /** 기본: 완료(추적관리)만. 취소 제외 */
  manufacturerStageIn?: string[];
  /** 열릴 때 기간 필터를 이 값으로 맞춘다(페이지 헤더 기간과 동기). */
  initialPeriod?: PeriodFilterValue;
  /** 준비 단계 행에 취소 버튼을 표시 */
  allowCancel?: boolean;
  /** 취소 API. mongoId를 받아 성공 여부 반환 */
  onCancelRequest?: (requestMongoId: string) => Promise<boolean>;
  /** 취소 성공 후 건수 갱신 등 */
  onCanceled?: () => void;
};

const DEFAULT_MANUFACTURER_STAGE_IN = ["추적관리"];

const PAGE_SIZE = 50;

const formatDate = (iso?: string) => {
  const raw = String(iso || "");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const pickRangeByPeriod = (period: PeriodFilterValue) => {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "90d") start.setDate(start.getDate() - 90);
  else if (period === "thisMonth") {
    start.setDate(1);
  } else if (period === "lastMonth") {
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    end.setDate(0);
  } else {
    return { start: "", end: "" };
  }

  const toYmd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return { start: toYmd(start), end: toYmd(end) };
};

export const PastRequestsModal = ({
  open,
  onOpenChange,
  title,
  description,
  onSelectRequest,
  manufacturerStageIn,
  initialPeriod,
  allowCancel = false,
  onCancelRequest,
  onCanceled,
}: PastRequestsModalProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const initialManufacturerStageIn = useMemo(
    () =>
      (manufacturerStageIn && manufacturerStageIn.length
        ? manufacturerStageIn
        : DEFAULT_MANUFACTURER_STAGE_IN
      )
        .map((s) => String(s))
        .filter(Boolean),
    [manufacturerStageIn],
  );

  const [period, setPeriod] = useState<PeriodFilterValue>(
    initialPeriod || "30d",
  );
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [canceling, setCanceling] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const effectiveManufacturerStageIn = initialManufacturerStageIn;

  const resetFilters = () => {
    setPeriod("30d");
    setQ("");
    setFrom("");
    setTo("");
  };

  const buildPath = (pageNum: number) => {
    const params = new URLSearchParams();
    params.set("page", String(pageNum));
    params.set("limit", String(PAGE_SIZE));
    params.set("sortBy", "createdAt");
    params.set("sortOrder", "desc");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    effectiveManufacturerStageIn.forEach((s) =>
      params.append("manufacturerStageIn", s),
    );
    return `/api/requests/my?${params.toString()}`;
  };

  const load = async (pageNum: number, reset: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<ApiMyRequestsResponse>({
        path: buildPath(pageNum),
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "의뢰 목록 조회에 실패했습니다.");
      }

      const d = res.data?.data || {};
      const fetched = Array.isArray(d?.requests) ? d.requests : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch (e: any) {
      if (reset) setItems([]);
      toast({
        title: "의뢰 목록 조회 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialPeriod) {
      setPeriod(initialPeriod);
      const range = pickRangeByPeriod(initialPeriod);
      setFrom(range.start);
      setTo(range.end);
      return;
    }
    const range = pickRangeByPeriod(period);
    if (!from && !to && (range.start || range.end)) {
      setFrom(range.start);
      setTo(range.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (period && !from && !to) {
      const range = pickRangeByPeriod(period);
      setFrom(range.start);
      setTo(range.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setHasMore(true);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, from, to]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loading || !hasMore) return;
        const nextPage = page + 1;
        setPage(nextPage);
        load(nextPage, false);
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, page, open]);

  const filteredRows = useMemo(() => {
    const keyword = String(q || "")
      .trim()
      .toLowerCase();
    if (!keyword) return items;
    return (items || []).filter((r: any) => {
      const ci = r?.caseInfos || {};
      const hay = [
        r?.requestId,
        getNormalizedStageLabelSafe(r),
        ci?.clinicName,
        ci?.patientName,
        ci?.tooth,
        ci?.implantManufacturer,
        ci?.implantBrand,
        ci?.implantFamily,
        ci?.implantType,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join("|");
      return hay.includes(keyword);
    });
  }, [items, q]);

  const colSpan = allowCancel ? 6 : 5;

  const handleConfirmCancel = async () => {
    const mongoId = String(cancelTarget?._id || cancelTarget?.id || "").trim();
    if (!mongoId || !onCancelRequest) {
      setCancelTarget(null);
      return;
    }
    setCanceling(true);
    try {
      const ok = await onCancelRequest(mongoId);
      if (ok) {
        setItems((prev) =>
          prev.filter(
            (row) => String(row?._id || row?.id || "") !== mongoId,
          ),
        );
        setCancelTarget(null);
        onCanceled?.();
      }
    } finally {
      setCanceling(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,800px)] w-[92vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-1.5 border-b border-slate-100 px-6 pb-4 pt-6 pr-12 text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            {title || "지난 의뢰"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {description ||
              "추적관리 단계의 지난 의뢰를 기간별로 확인하고 상세를 엽니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
          <div className="rounded-xl bg-slate-50 px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <PeriodFilter value={period} onChange={setPeriod} useStoreCustomRange={false} />

                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={resetFilters}
                  disabled={loading}
                >
                  초기화
                </Button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 py-0.5">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-[150px] rounded-lg bg-white"
              />
              <span className="text-xs text-slate-400">~</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-[150px] rounded-lg bg-white"
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색 (의뢰번호/치과/환자/임플란트)"
                className="h-9 w-full rounded-lg bg-white sm:w-[320px]"
              />
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm"
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[170px]">일시</TableHead>
                  <TableHead className="w-[90px]">상태</TableHead>
                  <TableHead className="min-w-[220px]">케이스</TableHead>
                  <TableHead className="min-w-[220px]">임플란트</TableHead>
                  <TableHead className="w-[160px]">의뢰번호</TableHead>
                  {allowCancel ? (
                    <TableHead className="w-[88px] text-right">취소</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any) => {
                  const ci = r?.caseInfos || {};
                  const id = String(r?._id || r?.id || "");
                  const stage = getNormalizedStageLabelSafe(r) || String(r?.manufacturerStage || "-");
                  const caseText =
                    [ci?.clinicName, ci?.patientName, ci?.tooth]
                      .filter(Boolean)
                      .join(" ") || "-";
                  const implantText = formatImplantDisplay(ci);
                  const requestId = String(r?.requestId || "-");
                  const canCancelRow = allowCancel && stage === "준비";
                  return (
                    <TableRow
                      key={id || requestId}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => onSelectRequest(r)}
                    >
                      <TableCell className="text-xs text-slate-600">
                        {formatDate(r?.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-900">
                        {stage}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">{caseText}</TableCell>
                      <TableCell className="text-xs text-slate-700">{implantText}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-800">
                        {requestId}
                      </TableCell>
                      {allowCancel ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={!canCancelRow || canceling}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canCancelRow) return;
                              setCancelTarget(r);
                            }}
                          >
                            취소
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}

                {loading && (
                  <TableRow>
                    <TableCell
                      colSpan={colSpan}
                      className="py-8 text-center text-sm text-slate-500"
                    >
                      불러오는 중...
                    </TableCell>
                  </TableRow>
                )}

                {!loading && filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={colSpan}
                      className="py-12 text-center text-sm text-slate-500"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {hasMore && !loading && (
              <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={Boolean(cancelTarget)}
      title="이 의뢰를 취소하시겠습니까?"
      description="준비 단계 의뢰만 취소할 수 있습니다. 취소 후 크레딧은 정책에 따라 복구됩니다."
      confirmLabel="의뢰 취소"
      cancelLabel="닫기"
      onConfirm={() => {
        void handleConfirmCancel();
      }}
      onCancel={() => setCancelTarget(null)}
    />
    </>
  );
};
