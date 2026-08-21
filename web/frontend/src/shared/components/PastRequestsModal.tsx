// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// - web/frontend/src/shared/ui/PeriodFilter.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-08-21: 추적관리 목록에 한진 배송현황(예: 여수 SUB 도착) 표시. deliveryInfo 포함.
// - 2026-08-19: 진행중 목록 — 체크박스 선택 후 PATCH /status/batch 일괄 취소.
// - 2026-08-19: 모달 가로폭을 뷰포트 여백 기준(min 92vw, 최대 1440)으로 맞춤.
// - 2026-08-19: 모달 가로 확장·기간 캘린더 입력 제거·검색을 기간필터 오른쪽·신속/묶음·디자인SW·아노 뱃지.
// - 2026-08-19: 기본 제목 완료 내역(구 지난 의뢰).
// - 2026-08-19: 취소 확인은 즉시 닫고 목록 행을 낙관적으로 제거.
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { periodToRange } from "@/store/usePeriodStore";
import { toKstYmd } from "@/shared/date/kst";
import { formatImplantDisplay } from "@/utils/implant";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { getHanjinDeliveryStatusLabel } from "@/shared/shipping/hanjinTrackingLabel";
import { RequestCaseMetaBadges } from "@/features/requestSettings/RequestCaseMetaBadges";

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
  /** 취소 API. mongoId를 받아 성공 여부 반환. silent면 호출측 토스트를 생략 */
  onCancelRequest?: (
    requestMongoId: string,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  /** 일괄 취소 API. 한 번에 처리하고 성공/실패 id를 반환 */
  onCancelRequests?: (
    requestMongoIds: string[],
  ) => Promise<{ okIds: string[]; failedIds: string[] }>;
  /** 취소 성공 후 건수 갱신 등 */
  onCanceled?: () => void;
  /** 상세 모달이 위에 열린 동안 목록을 유지(숨김)하고 바깥 클릭·ESC로 닫지 않음 */
  suspend?: boolean;
  /** 상세에서 취소한 mongoId — 목록에서 해당 행만 제거 */
  removeMongoId?: string | null;
};

const DEFAULT_MANUFACTURER_STAGE_IN = ["추적관리"];

const PAGE_SIZE = 50;

const requestMongoId = (row: any) => String(row?._id || row?.id || "").trim();

const isPrepCancelable = (row: any) =>
  getNormalizedStageLabelSafe(row) === "준비";

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

const ymdRangeForPeriod = (
  period: PeriodFilterValue,
  customStart = "",
  customEnd = "",
) => {
  const range = periodToRange(period, {
    customStartDate: customStart,
    customEndDate: customEnd,
  });
  return {
    start: toKstYmd(range.startDate) || "",
    end: toKstYmd(range.endDate) || "",
  };
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
  onCancelRequests,
  onCanceled,
  suspend = false,
  removeMongoId = null,
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
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [cancelTargets, setCancelTargets] = useState<any[]>([]);
  const [canceling, setCanceling] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const effectiveManufacturerStageIn = initialManufacturerStageIn;

  const { start: from, end: to } = useMemo(
    () => ymdRangeForPeriod(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate],
  );

  const resetFilters = () => {
    setPeriod("30d");
    setQ("");
    setCustomStartDate("");
    setCustomEndDate("");
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
    if (initialPeriod) setPeriod(initialPeriod);
    setCustomStartDate("");
    setCustomEndDate("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setHasMore(true);
    setSelectedIds(new Set());
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

  const colSpan = allowCancel ? 9 : 7;
  const dismissLocked = Boolean(suspend || cancelTargets.length);

  const cancelableRows = useMemo(
    () => (allowCancel ? filteredRows.filter(isPrepCancelable) : []),
    [allowCancel, filteredRows],
  );
  const selectedCount = selectedIds.size;
  const selectedVisibleCount = cancelableRows.filter((row) =>
    selectedIds.has(requestMongoId(row)),
  ).length;
  const allCancelableSelected =
    cancelableRows.length > 0 &&
    selectedVisibleCount === cancelableRows.length;
  const someCancelableSelected =
    selectedVisibleCount > 0 && !allCancelableSelected;

  const toggleSelection = (id: string, checked: boolean) => {
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAllCancelable = (checked: boolean) => {
    const visibleIds = cancelableRows
      .map((row) => requestMongoId(row))
      .filter(Boolean);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  useEffect(() => {
    const mongoId = String(removeMongoId || "").trim();
    if (!mongoId) return;
    setItems((prev) =>
      prev.filter((row) => requestMongoId(row) !== mongoId),
    );
    setSelectedIds((prev) => {
      if (!prev.has(mongoId)) return prev;
      const next = new Set(prev);
      next.delete(mongoId);
      return next;
    });
  }, [removeMongoId]);

  const handleConfirmCancel = async () => {
    const snapshots = cancelTargets.filter((row) => requestMongoId(row));
    if (!snapshots.length || (!onCancelRequest && !onCancelRequests)) {
      setCancelTargets([]);
      return;
    }
    const ids = new Set(snapshots.map((row) => requestMongoId(row)));
    const batch = snapshots.length > 1;
    setItems((prev) => prev.filter((row) => !ids.has(requestMongoId(row))));
    setSelectedIds(new Set());
    setCancelTargets([]);
    setCanceling(true);
    try {
      if (batch && onCancelRequests) {
        try {
          const { okIds, failedIds } = await onCancelRequests(
            snapshots.map((row) => requestMongoId(row)),
          );
          const failedSet = new Set(
            (failedIds || []).map((id) => String(id || "").trim()).filter(Boolean),
          );
          const failedRows = snapshots.filter((row) =>
            failedSet.has(requestMongoId(row)),
          );
          if (failedRows.length) {
            setItems((prev) => [...failedRows, ...prev]);
          }
          const okCount = Array.isArray(okIds) ? okIds.length : 0;
          if (okCount > 0) onCanceled?.();
          if (okCount > 0 && failedRows.length === 0) {
            toast({
              title: `${okCount}건이 취소되었습니다`,
              duration: 2000,
            });
          } else if (okCount > 0) {
            toast({
              title: `${okCount}건이 취소되었습니다`,
              description: `${failedRows.length}건은 취소하지 못했습니다.`,
              variant: "destructive",
              duration: 3000,
            });
          } else {
            toast({
              title: "의뢰 취소 실패",
              description:
                "준비 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
              variant: "destructive",
              duration: 3000,
            });
          }
        } catch {
          setItems((prev) => [...snapshots, ...prev]);
          toast({
            title: "의뢰 일괄 취소 실패",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
            duration: 3000,
          });
        }
        return;
      }

      const failed: any[] = [];
      let okCount = 0;
      for (const row of snapshots) {
        const mongoId = requestMongoId(row);
        const ok = await onCancelRequest?.(
          mongoId,
          batch ? { silent: true } : undefined,
        );
        if (ok) okCount += 1;
        else failed.push(row);
      }
      if (failed.length) {
        setItems((prev) => [...failed, ...prev]);
      }
      if (okCount > 0) onCanceled?.();
      if (!batch) return;
      if (okCount > 0 && failed.length === 0) {
        toast({
          title: `${okCount}건이 취소되었습니다`,
          duration: 2000,
        });
      } else if (okCount > 0) {
        toast({
          title: `${okCount}건이 취소되었습니다`,
          description: `${failed.length}건은 취소하지 못했습니다.`,
          variant: "destructive",
          duration: 3000,
        });
      } else {
        toast({
          title: "의뢰 취소 실패",
          description:
            "준비 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    } finally {
      setCanceling(false);
    }
  };

  return (
    <>
    <Dialog
      open={open}
      modal={!suspend}
      onOpenChange={(next) => {
        if (!next && dismissLocked) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={`flex h-[min(85vh,800px)] w-[min(92vw,calc(100vw-4rem))] max-w-[min(92vw,1440px)] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl${
          suspend ? " hidden" : ""
        }`}
        onPointerDownOutside={(e) => {
          if (dismissLocked) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (dismissLocked) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (dismissLocked) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (dismissLocked) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-1.5 border-b border-slate-100 px-6 pb-4 pt-6 pr-12 text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            {title || "완료 내역"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {description ||
              "추적관리 단계의 완료 내역을 기간별로 확인하고 상세를 엽니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
          <div className="rounded-xl bg-slate-50 px-3.5 py-3">
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <PeriodFilter
                  value={period}
                  onChange={setPeriod}
                  useStoreCustomRange={false}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  onCustomRangeChange={({ startDate, endDate }) => {
                    setCustomStartDate(startDate);
                    setCustomEndDate(endDate);
                  }}
                  onClearCustomRange={() => {
                    setCustomStartDate("");
                    setCustomEndDate("");
                  }}
                />

                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={resetFilters}
                  disabled={loading}
                >
                  초기화
                </Button>

                {allowCancel ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-9 rounded-lg"
                    disabled={selectedCount === 0 || canceling}
                    onClick={() => {
                      const rows = items.filter(
                        (row) =>
                          selectedIds.has(requestMongoId(row)) &&
                          isPrepCancelable(row),
                      );
                      if (!rows.length) return;
                      setCancelTargets(rows);
                    }}
                  >
                    {selectedCount > 0
                      ? `선택 취소 ${selectedCount}건`
                      : "선택 취소"}
                  </Button>
                ) : null}
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색 (의뢰번호/치과/환자/임플란트)"
                className="h-9 min-w-[220px] flex-1 rounded-lg bg-white sm:ml-auto sm:max-w-[360px] sm:flex-none sm:w-[320px]"
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
                  {allowCancel ? (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          allCancelableSelected
                            ? true
                            : someCancelableSelected
                              ? "indeterminate"
                              : false
                        }
                        disabled={cancelableRows.length === 0 || canceling}
                        onCheckedChange={(value) =>
                          handleSelectAllCancelable(value === true)
                        }
                        aria-label="준비 단계 의뢰 모두 선택"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="w-[170px]">일시</TableHead>
                  <TableHead className="w-[90px]">상태</TableHead>
                  <TableHead className="w-[140px]">배송현황</TableHead>
                  <TableHead className="w-[88px]">출고</TableHead>
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
                  const id = requestMongoId(r);
                  const stage = getNormalizedStageLabelSafe(r) || String(r?.manufacturerStage || "-");
                  const caseText =
                    [ci?.clinicName, ci?.patientName, ci?.tooth]
                      .filter(Boolean)
                      .join(" ") || "-";
                  const implantText = formatImplantDisplay(ci);
                  const requestId = String(r?.requestId || "-");
                  const canCancelRow = allowCancel && isPrepCancelable(r);
                  return (
                    <TableRow
                      key={id || requestId}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => onSelectRequest(r)}
                    >
                      {allowCancel ? (
                        <TableCell
                          className="w-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={Boolean(id) && selectedIds.has(id)}
                            disabled={!canCancelRow || canceling}
                            onCheckedChange={(value) =>
                              toggleSelection(id, value === true)
                            }
                            aria-label={`${requestId} 선택`}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="text-xs text-slate-600">
                        {formatDate(r?.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-900">
                        {stage}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {(() => {
                          const di =
                            r?.deliveryInfoRef &&
                            typeof r.deliveryInfoRef === "object"
                              ? r.deliveryInfoRef
                              : null;
                          const label = getHanjinDeliveryStatusLabel(di);
                          if (!label) {
                            return (
                              <span className="text-slate-400">-</span>
                            );
                          }
                          const isDone = label === "배송완료";
                          return (
                            <span
                              className={
                                isDone
                                  ? "inline-block max-w-[9.5rem] truncate rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                                  : "inline-block max-w-[9.5rem] truncate rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                              }
                              title={label}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <ShippingModeBadge source={r} size="sm" />
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{caseText}</span>
                          <RequestCaseMetaBadges
                            designSoftware={ci?.designSoftware}
                            anodizingEnabled={
                              typeof ci?.anodizingEnabled === "boolean"
                                ? ci.anodizingEnabled
                                : null
                            }
                            hexVerificationSample={Boolean(
                              (ci as { hexVerificationSample?: boolean })
                                ?.hexVerificationSample,
                            )}
                          />
                        </div>
                      </TableCell>
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
                              setCancelTargets([r]);
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
      open={cancelTargets.length > 0}
      title={
        cancelTargets.length > 1
          ? `선택한 ${cancelTargets.length}건을 취소하시겠습니까?`
          : "이 의뢰를 취소하시겠습니까?"
      }
      description="준비 단계 의뢰만 취소할 수 있습니다. 취소 후 크레딧은 정책에 따라 복구됩니다."
      confirmLabel={
        cancelTargets.length > 1 ? "선택 건 취소" : "의뢰 취소"
      }
      cancelLabel="닫기"
      busy={canceling}
      onConfirm={() => {
        void handleConfirmCancel();
      }}
      onCancel={() => {
        if (canceling) return;
        setCancelTargets([]);
      }}
    />
    </>
  );
};
