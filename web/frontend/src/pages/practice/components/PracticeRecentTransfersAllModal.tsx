/**
 * 치과 기공의뢰 — 최근 전송 「전체 보기」 모달.
 * 3열 그리드 + 무한 스크롤, 기간·검색·상태 뱃지 필터.
 * 취소 뱃지=기공소 작업취소(치과 휴지통 제외). 6뱃지 빠른툴팁.
 * 2026-08-14: 사이드바 1페이지를 시드로 재사용. 열 때 /my 재요청하지 않음.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Repeat, Search, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { cn } from "@/shared/ui/cn";
import { apiFetch } from "@/shared/api/apiClient";
import { type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  type PracticeRecentTransferItem,
  type PracticeRecentRequestItem,
  type PracticeRecentStatusFilter,
  PRACTICE_MY_TRANSFERS_PAGE_SIZE,
  PRACTICE_RECENT_STATUS_BADGES,
  PRACTICE_REMAKE_BADGE_CLASS,
  canDeletePracticeTransferByStatus,
  canRemakePracticeTransferByStatus,
  computeGroupedStatusCounts,
  filterGroupedTransfersByStatus,
  filterRequestsByPeriodAndSearch,
  groupPracticeRecentRequests,
  mapMyPracticeTransferApiRows,
  toStatusBadgeLabel,
} from "@/shared/practice/practiceRecentTransferList";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";

const PAGE_SIZE = PRACTICE_MY_TRANSFERS_PAGE_SIZE;

type PracticeRecentTransfersAllModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  chatRooms: ChatRoom[];
  initialPeriod: PeriodFilterValue;
  initialSearch?: string;
  initialStatusFilter?: PracticeRecentStatusFilter;
  /** 사이드바가 이미 불러온 1페이지. 있으면 page=1 GET을 생략한다. */
  initialRequests?: PracticeRecentRequestItem[];
  initialHasMore?: boolean;
  initialLoading?: boolean;
  initialError?: string;
  onSelectTransfer: (transfer: PracticeRecentTransferItem) => void;
  onDeleteTransfer: (transfer: PracticeRecentTransferItem) => void;
  remakeSelectedIds?: string[];
  onToggleRemakeSelect?: (transfer: PracticeRecentTransferItem) => void;
  onAskRemake?: () => void;
};

export function PracticeRecentTransfersAllModal({
  open,
  onOpenChange,
  token,
  chatRooms,
  initialPeriod,
  initialSearch = "",
  initialStatusFilter = "all",
  initialRequests = [],
  initialHasMore = false,
  initialLoading = false,
  initialError = "",
  onSelectTransfer,
  onDeleteTransfer,
  remakeSelectedIds = [],
  onToggleRemakeSelect,
  onAskRemake,
}: PracticeRecentTransfersAllModalProps) {
  const [period, setPeriod] = useState(initialPeriod);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<PracticeRecentStatusFilter>(initialStatusFilter);
  const [extraRequests, setExtraRequests] = useState<PracticeRecentRequestItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeriod(initialPeriod);
    setSearch(initialSearch);
    setStatusFilter(initialStatusFilter);
  }, [open, initialPeriod, initialSearch, initialStatusFilter]);

  useEffect(() => {
    if (!open) {
      setExtraRequests([]);
      setPage(1);
      setHasMore(false);
      return;
    }
    if (extraRequests.length === 0) {
      setHasMore(Boolean(initialHasMore));
    }
  }, [open, extraRequests.length, initialHasMore]);

  const recentRequests = useMemo(() => {
    if (extraRequests.length === 0) return initialRequests;
    const merged = [...initialRequests];
    const seen = new Set(initialRequests.map((row) => `${row.id}:${row.fileS3Key}`));
    for (const row of extraRequests) {
      const key = `${row.id}:${row.fileS3Key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
    return merged.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
  }, [extraRequests, initialRequests]);

  const loading = Boolean(initialLoading) && recentRequests.length === 0;
  const displayError = recentRequests.length === 0 ? initialError : "";

  const fetchMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await apiFetch<unknown>({
        path: `/api/practice/transfers/my?page=${nextPage}&limit=${PAGE_SIZE}`,
        method: "GET",
        token,
      });

      if (!res.ok) return;

      const body = res.data;
      const data =
        body && typeof body === "object" && "data" in (body as Record<string, unknown>)
          ? (body as { data?: unknown }).data
          : body;
      const list =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: unknown[] }).requests ?? [])
          : [];
      const pagination =
        data &&
        typeof data === "object" &&
        (data as { pagination?: unknown }).pagination &&
        typeof (data as { pagination?: unknown }).pagination === "object"
          ? ((data as { pagination: Record<string, unknown> }).pagination ?? {})
          : {};

      const mapped = mapMyPracticeTransferApiRows(list);
      setExtraRequests((prev) => {
        const merged = [...prev];
        const seen = new Set(prev.map((row) => `${row.id}:${row.fileS3Key}`));
        for (const row of mapped) {
          const key = `${row.id}:${row.fileS3Key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(row);
        }
        return merged;
      });
      setPage(nextPage);
      const paginationHasMore = pagination.hasMore;
      if (typeof paginationHasMore === "boolean") {
        setHasMore(paginationHasMore);
      } else {
        setHasMore(mapped.length >= PAGE_SIZE);
      }
    } catch {
      // 추가 페이지 실패는 기존 목록을 유지
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, token]);

  useAppEventDebouncedReload({
    enabled: open && Boolean(token),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    onMatch: () => {
      setExtraRequests([]);
      setPage(1);
      setHasMore(Boolean(initialHasMore));
    },
    delayMs: 140,
  });

  useEffect(() => {
    if (!open || !hasMore || loading || loadingMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        void fetchMore();
      },
      { rootMargin: "240px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loading, loadingMore, open]);

  const periodFilteredRequests = useMemo(
    () => filterRequestsByPeriodAndSearch(recentRequests, period, search),
    [period, recentRequests, search],
  );

  const activeRequests = useMemo(
    () =>
      periodFilteredRequests.filter(
        (request) => String(request.status || "").trim() !== "취소",
      ),
    [periodFilteredRequests],
  );

  const groupedTransfers = useMemo(
    () => groupPracticeRecentRequests(activeRequests, chatRooms),
    [activeRequests, chatRooms],
  );

  const statusCounts = useMemo(
    () => computeGroupedStatusCounts(groupedTransfers),
    [groupedTransfers],
  );

  const filteredTransfers = useMemo(
    () => filterGroupedTransfersByStatus(groupedTransfers, statusFilter),
    [groupedTransfers, statusFilter],
  );

  const emptyLabel =
    statusFilter === "all"
      ? "전송 내역 없음"
      : `${
          statusFilter === "발송완료"
            ? "의뢰"
            : statusFilter === "포장.발송"
              ? "발송"
              : statusFilter === "의뢰수락"
                ? "수락"
                : statusFilter === "작업완료"
                  ? "완료"
                  : statusFilter === "취소"
                    ? "취소"
                  : statusFilter === "리메이크"
                    ? "리메이크"
                  : statusFilter
        } 없음`;

  const renderStatusBadgeToggle = (
    filterKey: Exclude<PracticeRecentStatusFilter, "all">,
    label: string,
    count: number,
    tooltip: string,
  ) => (
    <Tooltip key={filterKey}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === filterKey ? "all" : filterKey))}
          aria-pressed={statusFilter === filterKey}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              filterKey === "리메이크"
                ? statusFilter === filterKey
                  ? PRACTICE_REMAKE_BADGE_CLASS
                  : "border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-50"
                : statusFilter === filterKey
                  ? "border-primary/70 bg-primary-soft text-primary-strong"
                  : "hover:bg-muted/40",
            )}
          >
            {label} {count}건
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,920px)] w-[min(96vw,1280px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center justify-between gap-3 text-lg font-semibold">
            <span>전송 내역 전체 보기</span>
            {remakeSelectedIds.length > 0 && onAskRemake ? (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1 bg-amber-600 px-2 text-white hover:bg-amber-700"
                onClick={onAskRemake}
              >
                <Repeat className="h-3.5 w-3.5" />
                리메이크 {remakeSelectedIds.length}
              </Button>
            ) : null}
          </DialogTitle>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 justify-start">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                presets={["thisMonth", "lastMonth"]}
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {PRACTICE_RECENT_STATUS_BADGES.map((item) =>
                renderStatusBadgeToggle(
                  item.filter,
                  item.label,
                  statusCounts[item.countKey],
                  item.tooltip,
                ),
              )}
            </div>
            <div className="flex min-w-0 justify-end">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9"
                  placeholder="전송ID, 환자명 검색"
                />
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={`all-modal-skel-${idx}`}
                  className="rounded-lg border px-3 py-3 space-y-2"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          ) : displayError ? (
            <div className="rounded-lg border border-dashed px-3 py-16 text-center text-sm text-destructive">
              {displayError}
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-16 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredTransfers.map((transfer) => {
                const targetLabText =
                  String(transfer.targetLab || "-")
                    .replace(/\s*→.*$/g, "")
                    .trim() || "-";
                const deleteLocked = !canDeletePracticeTransferByStatus(transfer.status);
                const remakeKey = String(
                  transfer.transferMongoIds?.[0] || transfer.id || "",
                ).trim();
                const canRemake = canRemakePracticeTransferByStatus(transfer.status);
                const remakeChecked = remakeSelectedIds.includes(remakeKey);

                return (
                  <div
                    key={`${transfer.id}:${transfer.createdAt}:${transfer.transferId}`}
                    role="button"
                    tabIndex={0}
                    className="flex min-h-[8.5rem] cursor-pointer flex-col rounded-lg border px-3 py-3 text-left text-sm transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectTransfer(transfer)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectTransfer(transfer);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {transfer.transferId !== "-"
                            ? transfer.transferId
                            : transfer.id}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">{transfer.createdAt}</p>
                          <Badge variant="outline" className="whitespace-nowrap">
                            {toStatusBadgeLabel(transfer.status)}
                          </Badge>
                          {transfer.isRemake ? (
                            <Badge
                              variant="outline"
                              className={cn("whitespace-nowrap", PRACTICE_REMAKE_BADGE_CLASS)}
                            >
                              리메이크
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canRemake && onToggleRemakeSelect ? (
                          <span
                            className="inline-flex"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={remakeChecked}
                              onCheckedChange={() => onToggleRemakeSelect(transfer)}
                              aria-label="리메이크 대상 선택"
                            />
                          </span>
                        ) : null}
                        {transfer.unreadCount > 0 ? (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-none text-white"
                            aria-label={`읽지 않은 채팅 ${transfer.unreadCount}건`}
                          >
                            {transfer.unreadCount > 99 ? "99+" : transfer.unreadCount}
                          </span>
                        ) : null}
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:pointer-events-none"
                                  disabled={deleteLocked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteTransfer(transfer);
                                  }}
                                  aria-label={
                                    deleteLocked
                                      ? "의뢰수락 이후 삭제 불가"
                                      : "의뢰서 전송 내역 삭제"
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-xs">
                              {deleteLocked
                                ? "기공소가 의뢰를 수락한 이후에는 삭제할 수 없습니다."
                                : "휴지통으로 이동"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">{targetLabText}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      파일 {transfer.fileCount}개
                      {transfer.orderDate && transfer.arrivalDate ? (
                        <>
                          {" · "}
                          <PracticeWorkPeriodText
                            orderDate={transfer.orderDate}
                            arrivalDate={transfer.arrivalDate}
                            variant="orderArrival"
                            className="text-xs"
                          />
                        </>
                      ) : null}
                      {String(transfer.transferMemo || "").trim()
                        ? ` · 메모: ${String(transfer.transferMemo || "")
                            .replace(/\s+/g, " ")
                            .trim()}`
                        : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {!displayError && hasMore ? (
            <div
              ref={loadMoreRef}
              className="py-6 text-center text-xs text-muted-foreground"
            >
              {loadingMore ? "더 불러오는 중..." : "아래로 스크롤하면 더 불러옵니다."}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
