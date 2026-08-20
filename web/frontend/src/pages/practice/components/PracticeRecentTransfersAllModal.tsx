/**
 * 치과 기공의뢰 — 최근 전송 「전체 보기」 모달.
 * 3주 세로 스크롤 캘린더. 기간 필터 없음(년/월·검색·상태·요일 숨김).
 * 취소 뱃지=기공소 작업취소(치과 휴지통 제외). 6뱃지 빠른툴팁.
 * 2026-08-14: 사이드바 1페이지를 시드로 재사용. 열 때 /my 재요청하지 않음.
 * 2026-08-15: 주문 후 1영업일 미수락 「수락대기」뱃지.
 * 2026-08-16: 기공소 작업취소 카드 깜빡임 하이라이트.
 * 2026-08-16: 선택 시 사이드바와 동일 PracticeRecentTransferItem(작업 파일 포함) 전달.
 * 2026-08-17: 채팅 미확인 배지를 카드 헤더(상태 옆)에 표시 — 사이드바·수신 카드와 정합.
 * 2026-08-17: 리메이크=카드 아이콘(툴팁)·단건 확인. 검색창 옆 선택 일괄 버튼 제거.
 * 2026-08-16: 카드 본문=시각+상태 / 주문일 / 치과도착일 / 기공소 / 환자명(전송ID·파일·메모 덤프 제거).
 * 2026-08-18: 카드 메타 1행 1항목. 수정·리메이크·삭제는 헤더 액션.
 * 2026-08-19: 기간 필터(커스텀 시작~끝) 와이어링. 본문=2주/한 달 캘린더(주문일·치과도착일).
 * 2026-08-19: 기간필터·2주/한달 제거. 3주 스크롤, 토·일 기본 숨김, 기공소색, 검색=닫기 왼쪽.
 * 2026-08-19: 캘린더 칩 휴지통(의뢰 취소) — onDeleteTransfer 연결.
 * 2026-08-20: 상단 상태 뱃지=기공의뢰수신과 동일 색·외곽선(PRACTICE_STATUS_FILTER_BADGE_CLASS).
 * 2026-08-20: 캘린더 칩도 상단 뱃지 상태색(리메이크=이중선).
 * 2026-08-20: 캘린더 칩에 채팅 안읽음 배지.
 * 2026-08-20: 날짜 뱃지 기본=치과도착일. 계정 preferences에 저장.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { cn } from "@/shared/ui/cn";
import { apiFetch } from "@/shared/api/apiClient";
import { type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { toKstYmd } from "@/shared/date/kst";
import { normalizeLabReceiveCalendarDateKey } from "@/shared/practice/labReceiveCalendarDateKey";
import { useAuthStore } from "@/store/useAuthStore";
import {
  type PracticeRecentTransferItem,
  type PracticeRecentRequestItem,
  type PracticeRecentStatusFilter,
  PRACTICE_MY_TRANSFERS_PAGE_SIZE,
  PRACTICE_RECENT_STATUS_BADGES,
  computeGroupedStatusCounts,
  canDeletePracticeTransferByStatus,
  filterGroupedTransfersByStatus,
  filterRequestsByPeriodAndSearch,
  groupPracticeRecentRequests,
  mapMyPracticeTransferApiRows,
} from "@/shared/practice/practiceRecentTransferList";
import {
  DEFAULT_HIDDEN_WEEKDAYS,
  PRACTICE_STATUS_FILTER_BADGE_CLASS,
  PracticeRecentTransfersCalendar,
  resolvePracticeCalendarStatusTone,
  type PracticeCalendarChipItem,
  type PracticeCalendarDateKey,
  type PracticeCalendarStatusTone,
} from "@/pages/practice/components/PracticeRecentTransfersCalendar";
import {
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";

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
  onAskRemake?: (transfer: PracticeRecentTransferItem) => void;
  onEditTransfer?: (transfer: PracticeRecentTransferItem) => void;
};

export function PracticeRecentTransfersAllModal({
  open,
  onOpenChange,
  token,
  chatRooms,
  initialSearch = "",
  initialStatusFilter = "all",
  initialRequests = [],
  initialHasMore = false,
  initialLoading = false,
  initialError = "",
  onSelectTransfer,
  onDeleteTransfer,
}: PracticeRecentTransfersAllModalProps) {
  const storedCalendarDateKey = useAuthStore(
    (s) => s.user?.labReceiveCalendarDateKey,
  );
  const setStoredCalendarDateKey = useAuthStore(
    (s) => s.setLabReceiveCalendarDateKey,
  );
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<PracticeRecentStatusFilter>(initialStatusFilter);
  const [dateKey, setDateKey] = useState<PracticeCalendarDateKey>(() =>
    normalizeLabReceiveCalendarDateKey(storedCalendarDateKey),
  );
  const [cursorYmd, setCursorYmd] = useState(() => toKstYmd(new Date()) || "");
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[]>([...DEFAULT_HIDDEN_WEEKDAYS]);
  const [alignEpoch, setAlignEpoch] = useState(0);
  const [extraRequests, setExtraRequests] = useState<PracticeRecentRequestItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch(initialSearch);
    setStatusFilter(initialStatusFilter);
    setCursorYmd(toKstYmd(new Date()) || "");
    setDateKey(normalizeLabReceiveCalendarDateKey(storedCalendarDateKey));
    setHiddenWeekdays([...DEFAULT_HIDDEN_WEEKDAYS]);
    setAlignEpoch((n) => n + 1);
  }, [open, initialSearch, initialStatusFilter, storedCalendarDateKey]);

  const handleCalendarDateKeyChange = useCallback(
    (key: PracticeCalendarDateKey) => {
      const next = normalizeLabReceiveCalendarDateKey(key);
      setDateKey(next);
      setStoredCalendarDateKey(next);
      if (!token) return;
      void apiFetch({
        path: "/api/users/lab-receive-calendar-date-key",
        method: "PUT",
        token,
        jsonBody: { dateKey: next },
      }).catch(() => {
        // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
      });
    },
    [setStoredCalendarDateKey, token],
  );

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

      if (!res.ok) {
        setHasMore(false);
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
      setHasMore(false);
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
    void fetchMore();
  }, [fetchMore, hasMore, loading, loadingMore, open]);

  const searchedRequests = useMemo(
    () =>
      filterRequestsByPeriodAndSearch(recentRequests, "30d", search, {
        skipPeriod: true,
        dateKey,
      }),
    [dateKey, recentRequests, search],
  );

  const activeRequests = useMemo(
    () =>
      searchedRequests.filter(
        (request) => String(request.status || "").trim() !== "취소",
      ),
    [searchedRequests],
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

  const calendarItems = useMemo((): PracticeCalendarChipItem[] => {
    return filteredTransfers.map((transfer) => {
      const lab =
        String(transfer.targetLab || "-")
          .replace(/\s*→.*$/g, "")
          .trim() || "-";
      const patient = resolvePracticeTransferListPatientName(transfer);
      const teeth = resolvePracticeTransferListToothNumbers(transfer);
      return {
        id: `${transfer.id}:${transfer.transferId}`,
        orderDate: transfer.orderDate,
        arrivalDate: transfer.arrivalDate,
        colorKey: String(transfer.targetLabAnchorId || "").trim() || lab,
        statusTone: resolvePracticeCalendarStatusTone(transfer.status),
        isRemake: Boolean(transfer.isRemake),
        sortLabel: lab,
        line: [lab, patient || "—", teeth || "—"].join(" / "),
        unreadCount: Math.max(0, Number(transfer.unreadCount || 0)),
        canDelete: canDeletePracticeTransferByStatus(transfer.status),
      };
    });
  }, [filteredTransfers]);

  const calendarItemById = useMemo(() => {
    const map = new Map<string, (typeof filteredTransfers)[number]>();
    for (const transfer of filteredTransfers) {
      map.set(`${transfer.id}:${transfer.transferId}`, transfer);
    }
    return map;
  }, [filteredTransfers]);

  const statusFilterTone = (
    filterKey: Exclude<PracticeRecentStatusFilter, "all">,
  ): PracticeCalendarStatusTone =>
    filterKey === "리메이크" ? "remake" : resolvePracticeCalendarStatusTone(filterKey);

  const renderStatusBadgeToggle = (
    filterKey: Exclude<PracticeRecentStatusFilter, "all">,
    label: string,
    count: number,
    tooltip: string,
  ) => {
    const active = statusFilter === filterKey;
    const tone = statusFilterTone(filterKey);
    return (
      <Tooltip key={filterKey}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-full"
            onClick={() => setStatusFilter((prev) => (prev === filterKey ? "all" : filterKey))}
            aria-pressed={active}
          >
            <Badge
              variant="outline"
              className={cn(
                "cursor-pointer",
                PRACTICE_STATUS_FILTER_BADGE_CLASS[tone][active ? "active" : "idle"],
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
  };

  const statusBadges = PRACTICE_RECENT_STATUS_BADGES.map((item) =>
    renderStatusBadgeToggle(
      item.filter,
      item.label,
      statusCounts[item.countKey],
      item.tooltip,
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,920px)] w-[min(96vw,1280px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3 pr-14 sm:px-6 sm:pr-16">
          <div className="flex items-center gap-3">
            <DialogTitle className="shrink-0 text-lg font-semibold">
              전송 내역 전체 보기
            </DialogTitle>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2">
              {statusBadges}
            </div>
            <div className="relative w-full max-w-xs shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full pl-9"
                placeholder="기공소, 환자명, 전송ID 검색"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: 15 }).map((_, idx) => (
                <Skeleton key={`all-modal-cal-skel-${idx}`} className="h-24 w-full" />
              ))}
            </div>
          ) : displayError ? (
            <div className="rounded-lg border border-dashed px-3 py-16 text-center text-sm text-destructive">
              {displayError}
            </div>
          ) : (
            <PracticeRecentTransfersCalendar
              items={calendarItems}
              dateKey={dateKey}
              cursorYmd={cursorYmd}
              onCursorChange={setCursorYmd}
              onDateKeyChange={handleCalendarDateKeyChange}
              onSelectItem={(item) => {
                const transfer = calendarItemById.get(item.id);
                if (transfer) onSelectTransfer(transfer);
              }}
              onDeleteItem={(item) => {
                const transfer = calendarItemById.get(item.id);
                if (transfer) onDeleteTransfer(transfer);
              }}
              hiddenWeekdays={hiddenWeekdays}
              onHiddenWeekdaysChange={setHiddenWeekdays}
              alignEpoch={alignEpoch}
            />
          )}

          {loadingMore ? (
            <div className="py-2 text-center text-xs text-muted-foreground">
              더 불러오는 중...
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
