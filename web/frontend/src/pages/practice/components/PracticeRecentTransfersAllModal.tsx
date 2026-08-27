/**
 * 치과 기공의뢰 — 최근 전송 「전체 보기」 모달.
 * 3주 세로 스크롤 캘린더. 기간 필터 없음(년/월·검색·상태·요일 숨김).
 * 취소 뱃지=작업취소(휴지통 취소·거부는 제외 — 휴지통 서랍). 상단 상태 뱃지에 채팅 unread 합산.
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
 * 2026-08-20: 모바일은 달력 대신 기공소·환자명·상태 카드 목록.
 * 2026-08-21: 커스텀어벗 한진 배송현황을 캘린더 칩·모바일 카드에 표시.
 * 2026-08-21: 휴지통 취소·거부를 목록·취소 뱃지에 포함. 상단 뱃지별 unread.
 * 2026-08-21: 상단 상태 뱃지 다중 표시 on/off(표시 라벨·기본 리셋·ON/OFF 대비).
 * 2026-08-22: 숨길 요일을 계정 preferences에 저장.
 * 2026-08-20: 모바일 — 가로 스크롤 상태칩·터치 카드·풀높이 시트.
 * 2026-08-25: 데스크톱도 풀스크린. 닫기 아이콘·히트영역 확대.
 * 2026-08-25: 캘린더 칩에서 휴지통(취소·거부) 제외 — 삭제 즉시 달력에서 사라짐.
 * 2026-08-25: 휴지통 건은 상단 뱃지 카운트·목록에서도 제외(취소=작업취소만, 휴지통 서랍과 정합).
 * 2026-08-25: 캘린더 칩에서 「생산 전」등 생산단계 문구 제거(운송·배송완료만).
 * 2026-08-27: 검색어 localStorage 유지 — 의뢰상세 후 전체보기 복귀 시 직전 검색 복원.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, Trash2, X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPracticeAbutmentDeliveryChipLabel,
  getPracticeAbutmentDeliveryLabel,
} from "@/shared/shipping/hanjinTrackingLabel";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { cn } from "@/shared/ui/cn";
import { apiFetch } from "@/shared/api/apiClient";
import { type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { toKstYmd } from "@/shared/date/kst";
import { normalizeLabReceiveCalendarDateKey } from "@/shared/practice/labReceiveCalendarDateKey";
import { normalizeLabReceiveCalendarHiddenWeekdays } from "@/shared/practice/labReceiveCalendarHiddenWeekdays";
import {
  buildLabReceiveCalendarYmdRange,
  buildPracticeTransferCalendarApiQuery,
} from "@/shared/practice/labReceiveCalendarYmdRange";
import { useAuthStore } from "@/store/useAuthStore";
import {
  type PracticeRecentTransferItem,
  type PracticeRecentRequestItem,
  type PracticeRecentStatusFilter,
  type PracticeRecentStatusFilterKey,
  PRACTICE_RECENT_STATUS_BADGES,
  computeGroupedStatusCounts,
  computeGroupedStatusUnreadCounts,
  canDeletePracticeTransferByStatus,
  createPracticeRecentStatusFilterSet,
  filterGroupedTransfersByStatus,
  filterRequestsByPeriodAndSearch,
  groupPracticeRecentRequests,
  isPracticeRecentStatusFilterDefault,
  isPracticeTransferTrashStatus,
  mapMyPracticeTransferApiRows,
  togglePracticeRecentStatusFilter,
  toStatusBadgeLabel,
} from "@/shared/practice/practiceRecentTransferList";
import {
  PracticeRecentTransfersCalendar,
  expandPracticeCalendarChipsByArrivalDates,
  resolvePracticeCalendarStatusTone,
  type PracticeCalendarChipItem,
  type PracticeCalendarDateKey,
} from "@/pages/practice/components/PracticeRecentTransfersCalendar";
import {
  PracticeStatusFilterBadges,
  PracticeStatusFilterEmptyHint,
  type PracticeStatusFilterBadgeItem,
} from "@/pages/practice/components/PracticeStatusFilterBadges";
import {
  practiceTransferStatusBadgeClass,
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";

const PRACTICE_RECENT_TRANSFERS_ALL_SEARCH_KEY =
  "practice_recent_transfers_all_search_v1";

function readStoredRecentTransfersAllSearch(fallback = ""): string {
  try {
    const raw = localStorage.getItem(PRACTICE_RECENT_TRANSFERS_ALL_SEARCH_KEY);
    if (raw == null) return fallback;
    return String(raw);
  } catch {
    return fallback;
  }
}

function writeStoredRecentTransfersAllSearch(value: string) {
  try {
    localStorage.setItem(PRACTICE_RECENT_TRANSFERS_ALL_SEARCH_KEY, value);
  } catch {
    // quota / private mode — ignore
  }
}

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
  const isMobile = useIsMobile();
  const storedCalendarDateKey = useAuthStore(
    (s) => s.user?.labReceiveCalendarDateKey,
  );
  const setStoredCalendarDateKey = useAuthStore(
    (s) => s.setLabReceiveCalendarDateKey,
  );
  const storedHiddenWeekdays = useAuthStore(
    (s) => s.user?.labReceiveCalendarHiddenWeekdays,
  );
  const setStoredHiddenWeekdays = useAuthStore(
    (s) => s.setLabReceiveCalendarHiddenWeekdays,
  );
  const [search, setSearch] = useState(() =>
    String(initialSearch || "").trim()
      ? String(initialSearch || "")
      : readStoredRecentTransfersAllSearch(""),
  );
  const [statusFilters, setStatusFilters] = useState<Set<PracticeRecentStatusFilterKey>>(() => {
    if (initialStatusFilter && initialStatusFilter !== "all") {
      return createPracticeRecentStatusFilterSet([initialStatusFilter]);
    }
    return createPracticeRecentStatusFilterSet();
  });
  const [dateKey, setDateKey] = useState<PracticeCalendarDateKey>(() =>
    normalizeLabReceiveCalendarDateKey(storedCalendarDateKey),
  );
  const [cursorYmd, setCursorYmd] = useState(() => toKstYmd(new Date()) || "");
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[]>(() =>
    normalizeLabReceiveCalendarHiddenWeekdays(storedHiddenWeekdays),
  );
  const [alignEpoch, setAlignEpoch] = useState(0);
  const [calendarRequests, setCalendarRequests] = useState<PracticeRecentRequestItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");

  const calendarYmdRange = useMemo(
    () => buildLabReceiveCalendarYmdRange(cursorYmd || toKstYmd(new Date()) || ""),
    [cursorYmd],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    writeStoredRecentTransfersAllSearch(value);
  }, []);

  useEffect(() => {
    if (!open) return;
    // 부모가 비어 있는 initialSearch를 넘기면(기본) 직전 검색을 복원.
    // 의뢰상세 → 전체보기 재오픈 시에도 검색창이 비지 않게 한다.
    const seeded = String(initialSearch || "").trim();
    setSearch(seeded ? seeded : readStoredRecentTransfersAllSearch(""));
    if (initialStatusFilter && initialStatusFilter !== "all") {
      setStatusFilters(createPracticeRecentStatusFilterSet([initialStatusFilter]));
    } else {
      setStatusFilters(createPracticeRecentStatusFilterSet());
    }
    setCursorYmd(toKstYmd(new Date()) || "");
    setDateKey(normalizeLabReceiveCalendarDateKey(storedCalendarDateKey));
    setHiddenWeekdays(
      normalizeLabReceiveCalendarHiddenWeekdays(storedHiddenWeekdays),
    );
    setAlignEpoch((n) => n + 1);
  }, [
    open,
    initialSearch,
    initialStatusFilter,
    storedCalendarDateKey,
    storedHiddenWeekdays,
  ]);

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

  const handleHiddenWeekdaysChange = useCallback(
    (nextRaw: number[]) => {
      const next = normalizeLabReceiveCalendarHiddenWeekdays(nextRaw);
      setHiddenWeekdays(next);
      setStoredHiddenWeekdays(next);
      if (!token) return;
      void apiFetch({
        path: "/api/users/lab-receive-calendar-hidden-weekdays",
        method: "PUT",
        token,
        jsonBody: { hiddenWeekdays: next },
      }).catch(() => {
        // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
      });
    },
    [setStoredHiddenWeekdays, token],
  );

  const fetchCalendarTransfers = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent === true;
      if (!silent) {
        setCalendarLoading(true);
        setCalendarError("");
      }
      try {
        const qs = buildPracticeTransferCalendarApiQuery(calendarYmdRange, dateKey);
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/my?${qs}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          if (!silent) {
            setCalendarRequests([]);
            setCalendarError(
              String(body.message || "전송 내역을 불러오지 못했습니다."),
            );
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

        setCalendarRequests(mapMyPracticeTransferApiRows(list));
        if (!silent) setCalendarError("");
      } catch {
        if (!silent) {
          setCalendarRequests([]);
          setCalendarError("전송 내역 조회 중 오류가 발생했습니다.");
        }
      } finally {
        if (!silent) setCalendarLoading(false);
      }
    },
    [calendarYmdRange, dateKey, token],
  );

  const hasLoadedCalendarRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setCalendarRequests([]);
      setCalendarError("");
      hasLoadedCalendarRef.current = false;
      return;
    }
    const silent = hasLoadedCalendarRef.current;
    const delayMs = silent ? 220 : 0;
    const timer = window.setTimeout(() => {
      void fetchCalendarTransfers({ silent }).then(() => {
        hasLoadedCalendarRef.current = true;
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [fetchCalendarTransfers, open]);

  const recentRequests = useMemo(() => {
    // 시드(1페이지)에서 휴지통으로 바뀐 transferId는 캘린더 목록에도 반영
    const trashStatusByTransferId = new Map<string, string>();
    for (const row of initialRequests) {
      const transferId = String(row.transferId || "").trim();
      if (!transferId || transferId === "-") continue;
      if (!isPracticeTransferTrashStatus(row.status)) continue;
      trashStatusByTransferId.set(transferId, String(row.status || "").trim());
    }
    const applyTrashStatus = (row: PracticeRecentRequestItem) => {
      const transferId = String(row.transferId || "").trim();
      const trashStatus = transferId
        ? trashStatusByTransferId.get(transferId)
        : undefined;
      if (!trashStatus || row.status === trashStatus) return row;
      return { ...row, status: trashStatus };
    };

    return calendarRequests
      .map(applyTrashStatus)
      .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
  }, [calendarRequests, initialRequests]);

  const loading = calendarLoading && recentRequests.length === 0;
  const displayError =
    recentRequests.length === 0 ? calendarError || initialError : "";

  useAppEventDebouncedReload({
    enabled: open && Boolean(token),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    onMatch: () => {
      void fetchCalendarTransfers();
    },
    delayMs: 140,
  });

  const searchedRequests = useMemo(
    () =>
      filterRequestsByPeriodAndSearch(recentRequests, "30d", search, {
        skipPeriod: true,
        dateKey,
      }),
    [dateKey, recentRequests, search],
  );

  const groupedTransfers = useMemo(
    () => groupPracticeRecentRequests(searchedRequests, chatRooms),
    [searchedRequests, chatRooms],
  );

  // 휴지통(취소·거부)은 메인 휴지통 서랍으로 — 전체보기 뱃지·달력·목록에서 제외
  const visibleGroupedTransfers = useMemo(
    () =>
      groupedTransfers.filter(
        (transfer) => !isPracticeTransferTrashStatus(transfer.status),
      ),
    [groupedTransfers],
  );

  const statusCounts = useMemo(
    () => computeGroupedStatusCounts(visibleGroupedTransfers),
    [visibleGroupedTransfers],
  );

  const statusUnreadCounts = useMemo(
    () => computeGroupedStatusUnreadCounts(visibleGroupedTransfers),
    [visibleGroupedTransfers],
  );

  const filteredTransfers = useMemo(
    () => filterGroupedTransfersByStatus(visibleGroupedTransfers, statusFilters),
    [visibleGroupedTransfers, statusFilters],
  );

  const calendarItems = useMemo((): PracticeCalendarChipItem[] => {
    const base = filteredTransfers.map((transfer) => {
      const lab =
        String(transfer.targetLab || "-")
          .replace(/\s*→.*$/g, "")
          .trim() || "-";
      const patient = resolvePracticeTransferListPatientName(transfer);
      const teeth = resolvePracticeTransferListToothNumbers(transfer);
      const deliveryLabel = getPracticeAbutmentDeliveryChipLabel({
        hasCustomAbutment: Boolean(transfer.hasCustomAbutment),
        abutmentDeliveryInfo: transfer.abutmentDeliveryInfo || null,
      });
      const linkedArrivalDates =
        Array.isArray(transfer.arrivalDates) && transfer.arrivalDates.length > 0
          ? transfer.arrivalDates
          : transfer.arrivalDate
            ? [transfer.arrivalDate]
            : [];
      return {
        id: `${transfer.id}:${transfer.transferId}`,
        orderDate: transfer.orderDate,
        arrivalDate: transfer.arrivalDate,
        linkedArrivalDates,
        colorKey: String(transfer.targetLabAnchorId || "").trim() || lab,
        statusTone: resolvePracticeCalendarStatusTone(transfer.status),
        isRemake: Boolean(transfer.isRemake),
        sortLabel: lab,
        line: [lab, patient || "—", teeth || "—", deliveryLabel]
          .filter(Boolean)
          .join(" / "),
        unreadCount: Math.max(0, Number(transfer.unreadCount || 0)),
        canDelete: canDeletePracticeTransferByStatus(transfer.status),
      };
    });
    return expandPracticeCalendarChipsByArrivalDates(base, dateKey);
  }, [dateKey, filteredTransfers]);

  const calendarItemById = useMemo(() => {
    const map = new Map<string, (typeof filteredTransfers)[number]>();
    for (const transfer of filteredTransfers) {
      const baseId = `${transfer.id}:${transfer.transferId}`;
      map.set(baseId, transfer);
      const dates =
        Array.isArray(transfer.arrivalDates) && transfer.arrivalDates.length > 0
          ? transfer.arrivalDates
          : transfer.arrivalDate
            ? [transfer.arrivalDate]
            : [];
      for (const ymd of dates) {
        map.set(`${baseId}:arr:${ymd}`, transfer);
      }
    }
    return map;
  }, [filteredTransfers]);

  const statusFilterBadgeItems = useMemo((): PracticeStatusFilterBadgeItem[] => {
    return PRACTICE_RECENT_STATUS_BADGES.map((item) => ({
      key: item.filter,
      label: item.label,
      tone:
        item.filter === "리메이크"
          ? "remake"
          : resolvePracticeCalendarStatusTone(item.filter),
      count: statusCounts[item.countKey],
      unreadCount: statusUnreadCounts[item.countKey],
      tooltip:
        item.filter === "취소"
          ? "기공소 작업취소·지정 거부 건(휴지통으로 옮긴 건은 휴지통에서 확인)"
          : item.tooltip,
    }));
  }, [statusCounts, statusUnreadCounts]);

  const resetStatusFiltersToDefault = useCallback(() => {
    setStatusFilters(createPracticeRecentStatusFilterSet());
  }, []);

  const statusBadges = (
    <PracticeStatusFilterBadges
      items={statusFilterBadgeItems}
      activeKeys={statusFilters}
      onToggle={(key) =>
        setStatusFilters((prev) =>
          togglePracticeRecentStatusFilter(
            prev,
            key as PracticeRecentStatusFilterKey,
          ),
        )
      }
      onResetToDefault={resetStatusFiltersToDefault}
      isDefault={isPracticeRecentStatusFilterDefault(statusFilters)}
      compact={isMobile}
    />
  );

  const statusFilterEmptyHint =
    statusFilters.size === 0 ? (
      <PracticeStatusFilterEmptyHint
        onResetToDefault={resetStatusFiltersToDefault}
        className="mb-2 shrink-0"
      />
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="inset-0 left-0 top-0 flex h-[100dvh] w-screen max-h-[100dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
      >
        <DialogClose
          className={cn(
            "absolute z-10 inline-flex items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
            isMobile ? "right-2.5 top-2.5 h-11 w-11" : "right-3 top-2.5 h-12 w-12",
          )}
          aria-label="닫기"
        >
          <X className={isMobile ? "h-6 w-6" : "h-7 w-7"} strokeWidth={2.25} />
          <span className="sr-only">Close</span>
        </DialogClose>
        <DialogHeader
          className={cn(
            "shrink-0 border-b bg-white/95 text-left backdrop-blur supports-[backdrop-filter]:bg-white/80",
            isMobile ? "space-y-0 px-4 pb-3 pt-4 pr-14" : "px-6 py-3 pr-[4.25rem]",
          )}
        >
          {isMobile ? (
            <div className="flex flex-col gap-3">
              <DialogTitle className="text-base font-semibold tracking-tight">
                최근 의뢰
              </DialogTitle>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-11 w-full rounded-xl border-slate-200 bg-slate-50 pl-9 text-base"
                  placeholder="기공소, 환자명 검색"
                />
              </div>
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {statusBadges}
              </div>
            </div>
          ) : (
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
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-9 w-full pl-9"
                  placeholder="기공소, 환자명, 전송ID 검색"
                />
              </div>
            </div>
          )}
        </DialogHeader>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            isMobile ? "bg-slate-50/80 px-3 py-3" : "px-6 py-3",
          )}
        >
          {loading ? (
            isMobile ? (
              <div className="space-y-2.5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Skeleton
                    key={`all-modal-card-skel-${idx}`}
                    className="h-[4.75rem] w-full rounded-2xl"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: 15 }).map((_, idx) => (
                  <Skeleton key={`all-modal-cal-skel-${idx}`} className="h-24 w-full" />
                ))}
              </div>
            )
          ) : displayError ? (
            <div className="rounded-2xl border border-dashed bg-white px-3 py-16 text-center text-sm text-destructive">
              {displayError}
            </div>
          ) : isMobile ? (
            <>
              {statusFilterEmptyHint}
              {filteredTransfers.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-600">전송 내역 없음</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {statusFilters.size === 0
                      ? "표시할 상태를 선택하세요."
                      : "검색어나 상태 필터를 바꿔 보세요."}
                  </p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pb-2">
                  {filteredTransfers.map((transfer) => {
                  const lab =
                    String(transfer.targetLab || "-")
                      .replace(/\s*→.*$/g, "")
                      .trim() || "-";
                  const patient =
                    resolvePracticeTransferListPatientName(transfer) || "—";
                  const statusLabel = toStatusBadgeLabel(transfer.status);
                  const canDelete = canDeletePracticeTransferByStatus(transfer.status);
                  const unread = Math.max(0, Number(transfer.unreadCount || 0));
                  const arrival = String(transfer.arrivalDate || "").trim();
                  const deliveryLabel = getPracticeAbutmentDeliveryLabel({
                    hasCustomAbutment: Boolean(transfer.hasCustomAbutment),
                    abutmentDeliveryInfo: transfer.abutmentDeliveryInfo || null,
                  });

                  return (
                    <div
                      key={`${transfer.id}:${transfer.transferId}`}
                      role="button"
                      tabIndex={0}
                      className="group w-full cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] active:scale-[0.985] active:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSelectTransfer(transfer)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectTransfer(transfer);
                        }
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-6 shrink-0 px-2 text-[11px] font-semibold leading-none",
                                practiceTransferStatusBadgeClass(statusLabel),
                              )}
                            >
                              {statusLabel}
                            </Badge>
                            {deliveryLabel ? (
                              <span
                                className={
                                  deliveryLabel === "배송완료"
                                    ? "inline-block max-w-[9.5rem] truncate rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                                    : deliveryLabel === "생산 전" ||
                                        deliveryLabel === "생산 준비" ||
                                        deliveryLabel === "생산 중" ||
                                        deliveryLabel === "출고 대기"
                                      ? "inline-block max-w-[9.5rem] truncate rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                                      : "inline-block max-w-[9.5rem] truncate rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                                }
                                title={`커스텀어벗 배송: ${deliveryLabel}`}
                              >
                                {deliveryLabel}
                              </span>
                            ) : null}
                            {transfer.isRemake ? (
                              <Badge
                                variant="outline"
                                className="h-6 border-[2px] border-double border-slate-400 bg-white px-1.5 text-[10px]"
                              >
                                리메이크
                              </Badge>
                            ) : null}
                            {unread > 0 ? (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">
                                {unread > 99 ? "99+" : unread}
                              </span>
                            ) : null}
                            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {transfer.createdAt}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-[15px] font-semibold leading-snug text-slate-900">
                            {lab}
                          </p>
                          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                            <span className="truncate">{patient}</span>
                            {arrival ? (
                              <>
                                <span className="shrink-0 text-slate-300">·</span>
                                <span className="shrink-0 tabular-nums">도착 {arrival}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                              aria-label="의뢰 취소"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTransfer(transfer);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <ChevronRight className="h-4 w-4 text-slate-300 group-active:text-slate-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>
          ) : (
            <>
              {statusFilterEmptyHint}
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
                onHiddenWeekdaysChange={handleHiddenWeekdaysChange}
                alignEpoch={alignEpoch}
              />
            </>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
