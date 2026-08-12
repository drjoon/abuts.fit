/**
 * 치과 기공의뢰 — 최근 전송 「전체 보기」 모달.
 * 3열 그리드 + 무한 스크롤, 기간·검색·상태 뱃지 필터.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";

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
  canDeletePracticeTransferByStatus,
  computeGroupedStatusCounts,
  filterGroupedTransfersByStatus,
  filterRequestsByPeriodAndSearch,
  groupPracticeRecentRequests,
  mapMyPracticeTransferApiRows,
  toStatusBadgeLabel,
} from "@/shared/practice/practiceRecentTransferList";

const PAGE_SIZE = 30;

type PracticeRecentTransfersAllModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  chatRooms: ChatRoom[];
  initialPeriod: PeriodFilterValue;
  initialSearch?: string;
  initialStatusFilter?: PracticeRecentStatusFilter;
  onSelectTransfer: (transfer: PracticeRecentTransferItem) => void;
  onDeleteTransfer: (transfer: PracticeRecentTransferItem) => void;
};

export function PracticeRecentTransfersAllModal({
  open,
  onOpenChange,
  token,
  chatRooms,
  initialPeriod,
  initialSearch = "",
  initialStatusFilter = "all",
  onSelectTransfer,
  onDeleteTransfer,
}: PracticeRecentTransfersAllModalProps) {
  const [period, setPeriod] = useState(initialPeriod);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<PracticeRecentStatusFilter>(initialStatusFilter);
  const [recentRequests, setRecentRequests] = useState<PracticeRecentRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeriod(initialPeriod);
    setSearch(initialSearch);
    setStatusFilter(initialStatusFilter);
  }, [open, initialPeriod, initialSearch, initialStatusFilter]);

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!token) {
        setRecentRequests([]);
        setError("로그인이 필요합니다.");
        setHasMore(false);
        return;
      }

      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }

      try {
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/my?page=${nextPage}&limit=${PAGE_SIZE}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as { message?: string })
              : {};
          if (!append) {
            setRecentRequests([]);
            setError(String(body.message || "전송 내역을 불러올 권한이 없습니다."));
            setHasMore(false);
            setPage(1);
          }
          return;
        }

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

        setRecentRequests((prev) => {
          if (!append) return mapped;
          const merged = [...prev];
          const seen = new Set(prev.map((row) => `${row.id}:${row.fileS3Key}`));
          for (const row of mapped) {
            const key = `${row.id}:${row.fileS3Key}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(row);
          }
          return merged.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
        });

        setPage(nextPage);
        const paginationHasMore = pagination.hasMore;
        if (typeof paginationHasMore === "boolean") {
          setHasMore(paginationHasMore);
        } else {
          setHasMore(mapped.length >= PAGE_SIZE);
        }
      } catch {
        if (!append) {
          setRecentRequests([]);
          setError("전송 내역 조회 중 오류가 발생했습니다.");
          setHasMore(false);
          setPage(1);
        }
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setHasMore(false);
    void fetchPage(1, false);
  }, [fetchPage, open]);

  useAppEventDebouncedReload({
    enabled: open && Boolean(token),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    onMatch: () => {
      setPage(1);
      setHasMore(false);
      void fetchPage(1, false);
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
        void fetchPage(page + 1, true);
      },
      { rootMargin: "240px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, loading, loadingMore, open, page]);

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

  const canceledRequests = useMemo(
    () =>
      periodFilteredRequests.filter(
        (request) => String(request.status || "").trim() === "취소",
      ),
    [periodFilteredRequests],
  );

  const groupedTransfers = useMemo(
    () => groupPracticeRecentRequests(activeRequests, chatRooms),
    [activeRequests, chatRooms],
  );

  const canceledGroupedTransfers = useMemo(
    () => groupPracticeRecentRequests(canceledRequests, chatRooms),
    [canceledRequests, chatRooms],
  );

  const statusCounts = useMemo(
    () =>
      computeGroupedStatusCounts(groupedTransfers, {
        canceledGroupedTransfers,
      }),
    [canceledGroupedTransfers, groupedTransfers],
  );

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "취소") return canceledGroupedTransfers;
    return filterGroupedTransfersByStatus(groupedTransfers, statusFilter);
  }, [canceledGroupedTransfers, groupedTransfers, statusFilter]);

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
                  : statusFilter
        } 없음`;

  const renderStatusBadgeToggle = (
    filterKey: PracticeRecentStatusFilter,
    label: string,
    count: number,
  ) => (
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
          statusFilter === filterKey
            ? "border-primary/70 bg-primary-soft text-primary-strong"
            : "hover:bg-muted/40",
        )}
      >
        {label} {count}건
      </Badge>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,920px)] w-[min(96vw,1280px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg font-semibold">전송 내역 전체 보기</DialogTitle>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 justify-start">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                presets={["thisMonth", "lastMonth"]}
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {renderStatusBadgeToggle("발송완료", "의뢰", statusCounts.sent)}
              {renderStatusBadgeToggle("의뢰수락", "수락", statusCounts.accepted)}
              {renderStatusBadgeToggle("작업완료", "완료", statusCounts.completed)}
              {renderStatusBadgeToggle("취소", "취소", statusCounts.canceled)}
              {renderStatusBadgeToggle("포장.발송", "발송", statusCounts.shipping)}
              {renderStatusBadgeToggle("추적관리", "추적관리", statusCounts.tracking)}
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
          ) : error ? (
            <div className="rounded-lg border border-dashed px-3 py-16 text-center text-sm text-destructive">
              {error}
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
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
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
                      {transfer.orderDate ? ` · 주문 ${transfer.orderDate}` : ""}
                      {transfer.arrivalDate ? ` · 도착 ${transfer.arrivalDate}` : ""}
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

          {!error && hasMore ? (
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
