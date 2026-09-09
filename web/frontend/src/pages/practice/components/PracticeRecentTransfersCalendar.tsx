/**
 * 치과 최근의뢰·기공소 기공의뢰수신 공통 — 3주 세로 스크롤 캘린더.
 * 기본 토·일 숨김(요일 토글로 복구). 주 행은 항목 수에 따라 최소 1/3 화면에서 늘어남.
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/pages/practice/components/PracticeStatusFilterBadges.tsx
 * - web/frontend/src/shared/date/kst.ts
 * - web/frontend/src/shared/practice/labReceiveCalendarWeekGrid.ts
 * - 2026-08-28: 요일 헤더에 스크롤바 폭 패딩 동기화 + custom-scrollbar(빈 레일 열·railRef 제거).
 * - 2026-09-07: 오늘(KST) 포함 셀 클릭 → 신규 의뢰(도착일).
 * - 2026-08-28: onSelectFutureDay — 오늘 이후 셀 빈 영역 클릭(칩은 stopPropagation).
 * - 2026-08-28: 「도착일 클릭으로 신규의뢰」안내 — 헤더 검색 자리(PracticeRecentTransfersAllModal).
 * - 2026-08-28: 검색 입력 — 주문일·도착일 뱃지 왼쪽(헤더와 위치 교환).
 * - 2026-08-27: 캘린더 날짜키 뱃지 「도착일」(치과도착일) — 작은 글씨에서 치과의사 오인 방지.
 * - 2026-08-28: 누적 연결 칩 — 이전=↗(보냄)·최종=↙(받음) 표시.
 * - 2026-08-27: 누적 도착일 칩 — 이전 날짜 흐리게·연결 표시.
 * - 2026-08-23: 숨길 요일 버튼·캘린더 열 일~토(일요일 시작) 통일.
 * - 2026-08-23: 숨길 요일 토글·열 정렬 불일치 수정 — 일요일 선택 시 토요일만 숨겨지던 현상.
 * - 2026-08-27: 미확인 칩=빨간 이중 외곽선(리메이크 슬레이트보다 우선).
 * - 2026-08-19: 리메이크는 공정 상태색 유지 + 이중 외곽선(흰 채움 아님).
 * - 2026-08-19: 기공의뢰수신 칩은 상단 뱃지 상태색.
 * - 2026-08-19: 치과 캘린더 칩에서 휴지통(의뢰 취소) 바로 이동.
 * - 2026-08-20: 캘린더 날짜 뱃지 기본=치과도착일. 계정 preferences에 저장.
 * - 2026-08-20: 년-월 캡션 클릭 시 오늘 주로 스크롤.
 * - 2026-08-20: 치과 전체보기 칩도 상단 뱃지 상태색(그룹색 대신).
 * - 2026-08-20: 안읽음(수신 미확인·채팅) 빨간 배지를 칩에 표시.
 * - 2026-08-21: 상단 필터 뱃지 ON=진한 상태색 / OFF=흐린 무채색(표시 on/off 대비).
 * - 2026-09-10: 상단 뱃지 표시 on/off 제거 — active 톤만 사용(unread 순회).
 * - 2026-09-10: focusItemId/focusEpoch — 뱃지 순회 시 해당 칩·목록 행으로 스크롤.
 * - 2026-09-05: guideTourItemId — 특정 칩에 data-guide-tour(수신 투어 오늘 의뢰).
 * - 2026-09-05: 완료=amber·어벗=emerald — 수락(sky)과 청록 계열이 겹치지 않게.
 * - 2026-09-02: 완료 뱃지=finished. 어벗=completed(녹색). 칩도 동일 분리.
 * - 2026-09-08: onSelectItem에 보이는 열 인덱스 전달 — 상세 패널 좌/우 도킹.
 * - 2026-09-08: 캘린더/목록(일정) 보기 전환 — Google 일정형 일자 그룹 목록.
 * - 2026-09-08: 목록 — 스크롤로 월 창 이동·날짜 `월 일 (요일)`.
 * - 2026-09-08: 목록 — 좌측 미니 월간·의뢰 행 폭 축소. 날짜→도착일 신규의뢰.
 * - 2026-09-08: 목록 점=기공소 파스텔 다색. 내일 이후만 신규의뢰. 월 캡션 중복 제거.
 * - 2026-09-08: 월 경계 스크롤 플리커 — fetch 후 커서/가시월 되튕김 방지.
 * - 2026-09-08: 목록 하단→다음달 자동 이동 제거. 캘린더 fetch 시 주 앵커로 스크롤 유지.
 * - 2026-09-08: 위로 스크롤 시 위쪽 패치 점프 — 조회창 밖 칩 캐시 + offsetTop 앵커 복원.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import {
  kstAddCivilDays,
  kstEndOfMonth,
  kstStartOfMonth,
  kstStartOfWeek,
  kstYmdWeekday,
  toKstYmd,
  toKstYmdLoose,
} from "@/shared/date/kst";
import { DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS } from "@/shared/practice/labReceiveCalendarHiddenWeekdays";
import {
  LAB_RECEIVE_CALENDAR_WEEK_GRID_COLUMNS,
  LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON,
  weekdayLabel,
} from "@/shared/practice/labReceiveCalendarWeekGrid";
import type { LabReceiveCalendarViewMode } from "@/shared/practice/labReceiveCalendarViewMode";
import {
  buildLabReceiveCalendarWeeks,
  type LabReceiveCalendarYmdRange,
} from "@/shared/practice/labReceiveCalendarYmdRange";
import {
  getPracticeAbutmentUploadOverdueTooltip,
  type PracticeAbutmentUploadOverdueViewer,
} from "@/shared/practice/practiceAbutmentUploadOverdue";

export type PracticeCalendarDateKey = "orderDate" | "arrivalDate";

export type PracticeCalendarStatusTone =
  | "sent"
  | "accepted"
  | "finished"
  | "completed"
  | "canceled"
  | "unread";

export type PracticeCalendarChipItem = {
  id: string;
  orderDate?: string | null;
  arrivalDate?: string | null;
  colorKey: string;
  /** 있으면 그룹색 대신 뱃지 상태색(의뢰~어벗) */
  statusTone?: PracticeCalendarStatusTone;
  /**
   * 누적 도착일/주문일 중 이전 날짜 칩(최종이 아님).
   * 동일 transfer 연결 표시용 — 클릭은 같은 의뢰상세.
   */
  isPriorArrival?: boolean;
  /** 연결 도착일 전체(툴팁) */
  linkedArrivalDates?: string[];
  /** 연결 주문일 전체(툴팁·주문일 캘린더 다중 칩) */
  linkedOrderDates?: string[];
  sortLabel: string;
  line: string;
  /** 사이드바와 동일 합산(수신 미확인 + 채팅). 있으면 칩에 빨간 숫자 */
  unreadCount?: number;
  /** 수락 후 어벗 STL 미업로드 24h/48h 경고 */
  abutmentUploadOverdue?: "yellow" | "red" | "deadline" | null;
  /** 치과 발신: 수락 전·작업취소·기공소 거절(거부) 건 휴지통 이동 */
  canDelete?: boolean;
};

/** 누적 주문일·도착일 → 캘린더 칩 다중 배치(같은 건·크레딧 중복 없음). */
export function expandPracticeCalendarChipsByArrivalDates(
  items: PracticeCalendarChipItem[],
  dateKey: PracticeCalendarDateKey,
): PracticeCalendarChipItem[] {
  if (dateKey !== "arrivalDate" && dateKey !== "orderDate") return items;
  const out: PracticeCalendarChipItem[] = [];
  for (const item of items) {
    const linkedRaw =
      dateKey === "orderDate"
        ? item.linkedOrderDates
        : item.linkedArrivalDates;
    const linked = Array.isArray(linkedRaw)
      ? linkedRaw
          .map((d) => String(d || "").trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
    const fallback =
      dateKey === "orderDate"
        ? String(item.orderDate || "").trim()
        : String(item.arrivalDate || "").trim();
    const dates =
      linked.length > 0
        ? linked
        : [fallback].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (dates.length <= 1) {
      out.push({
        ...item,
        ...(dateKey === "orderDate"
          ? {
              linkedOrderDates: dates.length ? dates : item.linkedOrderDates,
            }
          : {
              linkedArrivalDates: dates.length
                ? dates
                : item.linkedArrivalDates,
            }),
        isPriorArrival: false,
      });
      continue;
    }
    dates.forEach((ymd, idx) => {
      const isPrior = idx < dates.length - 1;
      out.push({
        ...item,
        id: `${item.id}:${dateKey === "orderDate" ? "ord" : "arr"}:${ymd}`,
        ...(dateKey === "orderDate"
          ? { orderDate: ymd, linkedOrderDates: dates }
          : { arrivalDate: ymd, linkedArrivalDates: dates }),
        isPriorArrival: isPrior,
        // 이전 일자 칩은 삭제 버튼 숨김(최종만). unread는 모든 연결 칩에 표시.
        canDelete: isPrior ? false : item.canDelete,
        unreadCount: item.unreadCount,
      });
    });
  }
  return out;
}

export const DEFAULT_HIDDEN_WEEKDAYS =
  DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS;

type DayCell = {
  ymd: string;
  dow: number;
};

const buildWeeksFromOrigin = buildLabReceiveCalendarWeeks;

const hashString = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** 그룹(기공소·치과)별 고정 색. 의미 축이 아니라 식별용 낮은 채도. */
export const calendarGroupChipStyle = (
  groupKey: string,
): { backgroundColor: string; color: string } => {
  const hues = [208, 165, 145, 250, 280, 320, 12, 85, 195, 230];
  const hue = hues[hashString(groupKey || "-") % hues.length];
  return {
    backgroundColor: `hsl(${hue} 32% 90%)`,
    color: `hsl(${hue} 38% 28%)`,
  };
};

/**
 * 목록 기공소·치과 구분 점 — 파스텔·서로 다른 색상(상태색과 무관).
 * 칩 텍스트색(진한 톤) 대신 점 전용 팔레트.
 */
export const calendarGroupDotColor = (groupKey: string): string => {
  const hues = [
    12, 32, 48, 72, 95, 125, 152, 175, 195, 208, 225, 245, 265, 285, 310, 335,
  ];
  const hue = hues[hashString(groupKey || "-") % hues.length];
  return `hsl(${hue} 58% 72%)`;
};

/**
 * 상단 뱃지(의뢰·취소·작업시작·완료·어벗)와 같은 칩 색.
 * 작업시작=sky · 완료=amber · 어벗=emerald — 한눈에 구분.
 */
export const PRACTICE_CALENDAR_STATUS_CHIP_STYLE: Record<
  PracticeCalendarStatusTone,
  { backgroundColor: string; color: string }
> = {
  sent: { backgroundColor: "hsl(210 10% 90%)", color: "hsl(210 12% 32%)" },
  accepted: { backgroundColor: "hsl(208 55% 88%)", color: "hsl(208 52% 28%)" },
  finished: { backgroundColor: "hsl(40 90% 88%)", color: "hsl(32 65% 28%)" },
  completed: { backgroundColor: "hsl(152 48% 86%)", color: "hsl(152 55% 22%)" },
  canceled: { backgroundColor: "hsl(0 55% 90%)", color: "hsl(0 48% 34%)" },
  unread: { backgroundColor: "#ffffff", color: "hsl(0 48% 34%)" },
};

/** ON=캘린더 칩과 같은 진한 상태색 / OFF=흐린 무채색 — 표시 on/off가 즉시 읽히게. */
export const PRACTICE_STATUS_FILTER_BADGE_CLASS: Record<
  PracticeCalendarStatusTone,
  { idle: string; active: string }
> = {
  sent: {
    idle: "border-slate-200 bg-slate-50/60 text-slate-400 opacity-40 hover:opacity-60 hover:bg-slate-50",
    active: "border-slate-400 bg-slate-200 text-slate-800 shadow-sm",
  },
  accepted: {
    idle: "border-slate-200 bg-slate-50/60 text-slate-400 opacity-40 hover:opacity-60 hover:bg-slate-50",
    active: "border-sky-500/90 bg-sky-200 text-sky-950 shadow-sm",
  },
  finished: {
    idle: "border-slate-200 bg-slate-50/60 text-slate-400 opacity-40 hover:opacity-60 hover:bg-slate-50",
    active: "border-amber-500/90 bg-amber-200 text-amber-950 shadow-sm",
  },
  completed: {
    idle: "border-slate-200 bg-slate-50/60 text-slate-400 opacity-40 hover:opacity-60 hover:bg-slate-50",
    active: "border-emerald-500/90 bg-emerald-200 text-emerald-950 shadow-sm",
  },
  canceled: {
    idle: "border-slate-200 bg-slate-50/60 text-slate-400 opacity-40 hover:opacity-60 hover:bg-slate-50",
    active: "border-rose-500/90 bg-rose-200 text-rose-950 shadow-sm",
  },
  unread: {
    idle: "border-[3px] border-double border-red-200 bg-white text-red-300 opacity-40 hover:opacity-60",
    active:
      "border-[3px] border-double border-red-600 bg-white text-red-700 shadow-sm",
  },
};

export const resolvePracticeCalendarStatusTone = (
  status: unknown,
  opts?: {
    designFileCount?: unknown;
    designFiles?: unknown;
    designReadyAt?: unknown;
  },
): Exclude<PracticeCalendarStatusTone, "unread"> => {
  const s = String(status || "").trim();
  if (s === "거부" || s === "취소" || s === "작업취소") return "canceled";
  if (s === "기한만료") return "accepted";
  if (s === "생산진행" || s === "포장.발송") return "completed";
  if (s === "작업완료") {
    const designN = Math.max(
      Number(opts?.designFileCount || 0) || 0,
      Array.isArray(opts?.designFiles) ? opts.designFiles.length : 0,
    );
    if (designN > 0 || Boolean(opts?.designReadyAt)) return "completed";
    return "finished";
  }
  if (s === "의뢰수락" || s === "다운로드완료") return "accepted";
  return "sent";
};

/**
 * 상단 상태 필터 뱃지 색 — 필터 키 의미 고정.
 * 「도착완료」=finished(amber·완료), 「작업완료」=completed(emerald·어벗).
 */
export const resolvePracticeStatusFilterBadgeTone = (
  filter: unknown,
): Exclude<PracticeCalendarStatusTone, "unread"> => {
  const s = String(filter || "").trim();
  if (s === "도착완료") return "finished";
  if (s === "작업완료") return "completed";
  return resolvePracticeCalendarStatusTone(s);
};

export const calendarChipStyleForItem = (item: PracticeCalendarChipItem) => {
  const tone =
    item.statusTone && item.statusTone !== "unread" ? item.statusTone : null;
  return tone
    ? PRACTICE_CALENDAR_STATUS_CHIP_STYLE[tone]
    : calendarGroupChipStyle(item.colorKey);
};

const monthCaption = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  return y && m ? `${y}년 ${m}월` : "";
};

const shiftMonth = (cursorYmd: string, direction: -1 | 1): string => {
  const monthStart = kstStartOfMonth(cursorYmd) || cursorYmd;
  if (direction < 0) {
    return kstStartOfMonth(kstAddCivilDays(monthStart, -1)) || cursorYmd;
  }
  return kstStartOfMonth(kstAddCivilDays(monthStart, 32)) || cursorYmd;
};

export type PracticeCalendarSelectContext = {
  ymd: string;
  dow: number;
  /** 현재 보이는 열 중 0-based 인덱스 */
  visibleColumnIndex: number;
  visibleColumnCount: number;
};

type PracticeRecentTransfersCalendarProps = {
  items: PracticeCalendarChipItem[];
  dateKey: PracticeCalendarDateKey;
  cursorYmd: string;
  onCursorChange: (ymd: string) => void;
  onDateKeyChange: (key: PracticeCalendarDateKey) => void;
  /** 캘린더(주 그리드) / 목록(일정). 부모가 월 범위 fetch와 함께 소유 */
  viewMode: LabReceiveCalendarViewMode;
  onViewModeChange: (mode: LabReceiveCalendarViewMode) => void;
  /**
   * 캘린더 silent refetch 창. 창 안만 교체하고 창 밖 칩은 캐시 유지 —
   * 위로 스크롤해 위쪽이 패치될 때 아래(이미 본) 주 높이 붕괴를 막음.
   */
  dataYmdRange?: LabReceiveCalendarYmdRange | null;
  onSelectItem: (
    item: PracticeCalendarChipItem,
    ctx: PracticeCalendarSelectContext,
  ) => void;
  onDeleteItem?: (item: PracticeCalendarChipItem) => void;
  /** 오늘(KST) 포함·이후 날짜 셀 빈 영역 클릭. 과거는 호출하지 않음. */
  onSelectFutureDay?: (ymd: string) => void;
  /** 「주문일」뱃지 왼쪽 — 전송 검색(헤더와 위치 교환) */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  hiddenWeekdays: number[];
  onHiddenWeekdaysChange: (next: number[]) => void;
  alignEpoch?: number;
  /** 어벗 업로드 지연 칩 툴팁 — 치과=대기/문의 · 기공소(기본)=업로드 독촉 */
  abutmentUploadOverdueViewer?: PracticeAbutmentUploadOverdueViewer;
  /** 가이드투어 Spotlight 홀 (data-guide-tour) — 캘린더 전체 */
  guideTourTarget?: string | null;
  /** 가이드투어 — 특정 칩에 Spotlight 홀 (전체 홀과 병행 가능) */
  guideTourItemTarget?: string | null;
  /** guideTourItemTarget을 붙일 칩 id(확장 id `…:ord:ymd` 포함 접두 매칭) */
  guideTourItemId?: string | null;
  /** 뱃지 순회 등 — 해당 칩/행으로 스크롤(기본 id `${reqId}:${transferId}`) */
  focusItemId?: string | null;
  /** focusItemId와 함께 쓸 날짜(KST YMD). 있으면 먼저 해당일로 맞춤 */
  focusItemYmd?: string | null;
  /** focusItemId 변경 시마다 증가해 같은 id 재스크롤 */
  focusEpoch?: number;
};

const agendaDateLabel = (ymd: string) => {
  const monthNum = Number(ymd.slice(5, 7));
  const dayNum = Number(ymd.slice(-2));
  const dow = kstYmdWeekday(ymd);
  const wd = dow == null ? "?" : weekdayLabel(dow);
  return {
    monthNum,
    dayNum,
    text: `${monthNum}월 ${dayNum}일 (${wd})`,
  };
};

/** 목록 좌측 미니 월간(일~토). KST civil YMD. */
function buildListSideMonthCells(monthStartYmd: string) {
  const monthStart = kstStartOfMonth(monthStartYmd) || monthStartYmd;
  const monthEnd = kstEndOfMonth(monthStart) || monthStart;
  const gridStart =
    kstStartOfWeek(monthStart, LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON) ||
    monthStart;
  const cells: { ymd: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const ymd = kstAddCivilDays(gridStart, i);
    if (!ymd) break;
    cells.push({
      ymd,
      inMonth: ymd >= monthStart && ymd <= monthEnd,
    });
    if (ymd >= monthEnd && (kstYmdWeekday(ymd) ?? 0) === 6) break;
  }
  return cells;
}

type ListSideMonthCalendarProps = {
  monthYmd: string;
  todayYmd: string;
  markedYmds: Set<string>;
  canComposeArrival: boolean;
  onSelectDay: (ymd: string) => void;
};

function ListSideMonthCalendar({
  monthYmd,
  todayYmd,
  markedYmds,
  canComposeArrival,
  onSelectDay,
}: ListSideMonthCalendarProps) {
  const monthStart = kstStartOfMonth(monthYmd) || monthYmd;
  const cells = useMemo(
    () => buildListSideMonthCells(monthStart),
    [monthStart],
  );

  return (
    <div className="rounded-md border border-slate-200/80 bg-white p-2 shadow-sm">
      <div className="grid grid-cols-7 gap-y-0.5">
        {LAB_RECEIVE_CALENDAR_WEEK_GRID_COLUMNS.map(({ dow, label }) => (
          <div
            key={`side-wd-${dow}`}
            className="py-0.5 text-center text-[10px] font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {cells.map(({ ymd, inMonth }) => {
          const dayNum = Number(ymd.slice(-2));
          const isToday = ymd === todayYmd;
          const isComposeDay = Boolean(todayYmd && ymd > todayYmd);
          const marked = markedYmds.has(ymd);
          const clickable = inMonth;
          const composeHint =
            canComposeArrival && inMonth && isComposeDay;
          return (
            <button
              key={`side-day-${ymd}`}
              type="button"
              disabled={!clickable}
              title={
                composeHint
                  ? `${ymd} 도착일로 신규 의뢰`
                  : inMonth
                    ? ymd
                    : undefined
              }
              aria-label={
                composeHint
                  ? `${ymd} 도착일로 신규 의뢰`
                  : inMonth
                    ? ymd
                    : undefined
              }
              className={cn(
                "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] tabular-nums",
                !inMonth && "invisible",
                inMonth && !isToday && "text-slate-700 hover:bg-slate-100",
                isToday &&
                  "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                composeHint && !isToday && "hover:bg-primary-soft/80",
                clickable && "cursor-pointer",
              )}
              onClick={() => {
                if (!clickable) return;
                onSelectDay(ymd);
              }}
            >
              {dayNum}
              {marked && !isToday ? (
                <span
                  className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-slate-400"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {canComposeArrival ? (
        <p className="mt-2 px-0.5 text-[10px] leading-snug text-muted-foreground">
          내일 이후 날짜 → 도착일로 신규 의뢰
        </p>
      ) : null}
    </div>
  );
}

export function PracticeRecentTransfersCalendar({
  items,
  dateKey,
  cursorYmd,
  onCursorChange,
  onDateKeyChange,
  viewMode,
  onViewModeChange,
  dataYmdRange = null,
  onSelectItem,
  onDeleteItem,
  onSelectFutureDay,
  search,
  onSearchChange,
  searchPlaceholder = "기공소, 환자명, 전송ID 검색",
  hiddenWeekdays,
  onHiddenWeekdaysChange,
  alignEpoch = 0,
  abutmentUploadOverdueViewer = "lab",
  guideTourTarget = null,
  guideTourItemTarget = null,
  guideTourItemId = null,
  focusItemId = null,
  focusItemYmd = null,
  focusEpoch = 0,
}: PracticeRecentTransfersCalendarProps) {
  const isGuideTourChip = (itemId: string) => {
    const want = String(guideTourItemId || "").trim();
    if (!want || !guideTourItemTarget) return false;
    const id = String(itemId || "").trim();
    return id === want || id.startsWith(`${want}:`);
  };
  const todayYmd = toKstYmd(new Date()) || "";
  const originYmd = todayYmd || cursorYmd;
  const weeks = useMemo(() => buildWeeksFromOrigin(originYmd), [originYmd]);
  const hidden = useMemo(() => new Set(hiddenWeekdays), [hiddenWeekdays]);
  const visibleColumns = LAB_RECEIVE_CALENDAR_WEEK_GRID_COLUMNS.filter(
    (col) => !hidden.has(col.dow),
  );
  const visibleDows = visibleColumns.map((col) => col.dow);
  const colCount = Math.max(1, visibleDows.length);

  const calendarChipCacheRef = useRef(
    new Map<string, PracticeCalendarChipItem[]>(),
  );
  const calendarChipCacheDateKeyRef = useRef(dateKey);

  const byDay = useMemo(() => {
    const incoming = new Map<string, PracticeCalendarChipItem[]>();
    for (const item of items) {
      const ymd = toKstYmdLoose(
        dateKey === "arrivalDate" ? item.arrivalDate : item.orderDate,
      );
      if (!ymd) continue;
      const list = incoming.get(ymd) || [];
      list.push(item);
      incoming.set(ymd, list);
    }
    for (const [ymd, list] of incoming) {
      list.sort((a, b) => {
        const groupCmp = String(a.sortLabel || "").localeCompare(
          String(b.sortLabel || ""),
          "ko",
        );
        if (groupCmp !== 0) return groupCmp;
        return String(a.line || "").localeCompare(String(b.line || ""), "ko");
      });
      incoming.set(ymd, list);
    }

    // 목록은 fetch 창=표시 구간. 캘린더만 창 밖 캐시로 주 높이 유지.
    if (viewMode !== "calendar" || !dataYmdRange?.fromYmd || !dataYmdRange?.toYmd) {
      calendarChipCacheRef.current = new Map();
      calendarChipCacheDateKeyRef.current = dateKey;
      return incoming;
    }

    if (calendarChipCacheDateKeyRef.current !== dateKey) {
      calendarChipCacheRef.current = new Map();
      calendarChipCacheDateKeyRef.current = dateKey;
    }

    const cache = calendarChipCacheRef.current;
    const fromYmd = dataYmdRange.fromYmd;
    const toYmd = dataYmdRange.toYmd;
    for (const ymd of [...cache.keys()]) {
      if (ymd >= fromYmd && ymd <= toYmd) cache.delete(ymd);
    }
    for (const [ymd, list] of incoming) {
      cache.set(ymd, list);
    }

    // 커서에서 너무 먼 날 정리(메모리). 스크롤 그리드(~78+26주)보다 짧게.
    const prunePad = kstAddCivilDays(cursorYmd || fromYmd, -120) || fromYmd;
    const pruneEnd = kstAddCivilDays(cursorYmd || toYmd, 120) || toYmd;
    for (const ymd of [...cache.keys()]) {
      if (ymd < prunePad || ymd > pruneEnd) cache.delete(ymd);
    }

    return new Map(cache);
  }, [cursorYmd, dataYmdRange, dateKey, items, viewMode]);

  const agendaDays = useMemo(() => {
    // 로드된 구간 전체(빈 날 생략). 월 필터 없음 — 스크롤로 월 경계 연속.
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ymd, dayItems]) => ({ ymd, items: dayItems }));
  }, [byDay]);

  const markedAgendaYmds = useMemo(
    () => new Set(agendaDays.map((day) => day.ymd)),
    [agendaDays],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const weekElsRef = useRef(new Map<string, HTMLDivElement>());
  const dayElsRef = useRef(new Map<string, HTMLDivElement>());
  const skipScrollSyncRef = useRef(false);
  /** 의도적 월 이동 중 — 가시 일자로 커서를 되돌리지 않음 */
  const listPinCursorRef = useRef(false);
  const listRestoreYmdRef = useRef<string | null>(null);
  const listForceAlignRef = useRef(false);
  const listVisibleMonthRef = useRef("");
  /** 캘린더: 화면에 보이던 주(weekStart) + scroller 대비 offset — fetch 후에도 같은 주가 같은 자리에 */
  const calendarAnchorWeekRef = useRef("");
  const calendarAnchorOffsetRef = useRef(0);
  const calendarScrollTopRef = useRef(0);
  /** 캘린더: fetch·복원 직후 mid-주 sync로 커서 튀는 것 억제 */
  const calendarScrollQuietUntilRef = useRef(0);
  const [minRowH, setMinRowH] = useState(140);
  /** 본문 스크롤바 폭 — 요일 헤더 padding과 맞춰 열 정렬 */
  const [scrollbarW, setScrollbarW] = useState(0);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    const el = scrollRef.current;
    if (!el) return;
    const apply = () => {
      setMinRowH((prev) => {
        const next = Math.max(112, Math.floor(el.clientHeight / 3));
        return next === prev ? prev : next;
      });
      setScrollbarW((prev) => {
        const next = Math.max(0, el.offsetWidth - el.clientWidth);
        return next === prev ? prev : next;
      });
    };
    apply();
    // 자식(칩) 높이 변화는 observe하지 않음 — fetch마다 RO→setState→스크롤 점프 유발.
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  const weekIndexForYmd = (ymd: string) =>
    weeks.findIndex((week) => week[0] && ymd >= week[0] && ymd <= (week[6] || week[0]));

  const captionMonth = kstStartOfMonth(cursorYmd) || cursorYmd;
  const captionMonthEnd = kstEndOfMonth(captionMonth) || captionMonth;
  const isListMode = viewMode === "list";

  const captureCalendarAnchor = () => {
    const el = scrollRef.current;
    if (!el) return;
    calendarScrollTopRef.current = el.scrollTop;
    for (const week of weeks) {
      const weekStart = week[0];
      if (!weekStart) continue;
      const row = weekElsRef.current.get(weekStart);
      if (!row) continue;
      // 완전히 뷰포트 위인 주는 건너뛰고, 첫 교차 주의 콘텐츠 오프셋 저장
      if (row.offsetTop + row.offsetHeight <= el.scrollTop + 2) continue;
      calendarAnchorWeekRef.current = weekStart;
      calendarAnchorOffsetRef.current = row.offsetTop - el.scrollTop;
      return;
    }
  };

  const restoreCalendarAnchor = () => {
    const el = scrollRef.current;
    if (!el) return;
    skipScrollSyncRef.current = true;
    const weekStart = calendarAnchorWeekRef.current;
    const row = weekStart ? weekElsRef.current.get(weekStart) : null;
    if (row) {
      el.scrollTop = Math.max(0, row.offsetTop - calendarAnchorOffsetRef.current);
    } else {
      el.scrollTop = calendarScrollTopRef.current;
    }
    calendarScrollTopRef.current = el.scrollTop;
    calendarScrollQuietUntilRef.current = Date.now() + 500;
    window.setTimeout(() => {
      skipScrollSyncRef.current = false;
    }, 500);
  };

  const scrollListToYmd = (ymd: string, behavior: ScrollBehavior = "auto") => {
    const el = listScrollRef.current;
    if (!el || !ymd) return;
    const targetMonth = kstStartOfMonth(ymd) || ymd;
    let target = dayElsRef.current.get(ymd) || null;
    if (!target) {
      // 같은 월 안에서만 다음 일자로 스냅 — 빈 미래 월에서 이전 월로 튕기지 않음
      for (const day of agendaDays) {
        const dayMonth = kstStartOfMonth(day.ymd) || day.ymd;
        if (dayMonth !== targetMonth) continue;
        if (day.ymd >= ymd) {
          target = dayElsRef.current.get(day.ymd) || null;
          break;
        }
      }
    }
    if (!target) {
      // 해당 월 데이터 없음: 스크롤 유지(하단/상단 고정은 호출측)
      return;
    }
    skipScrollSyncRef.current = true;
    const nextTop =
      el.scrollTop +
      (target.getBoundingClientRect().top - el.getBoundingClientRect().top);
    el.scrollTo({ top: Math.max(0, nextTop), behavior });
    window.setTimeout(() => {
      skipScrollSyncRef.current = false;
    }, 120);
  };

  const scrollToYmd = (ymd: string, behavior: ScrollBehavior = "auto") => {
    if (viewMode === "list") {
      scrollListToYmd(ymd, behavior);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const idx = weekIndexForYmd(ymd);
    if (idx < 0) return;
    const topIdx = Math.max(0, idx - 1);
    const weekStart = weeks[topIdx]?.[0];
    const target = weekStart ? weekElsRef.current.get(weekStart) : null;
    if (!target) return;
    skipScrollSyncRef.current = true;
    // scrollIntoView would also scroll dashboard/window ancestors and hide the
    // mobile header (임시저장·검색). Keep alignment inside this scroller only.
    const nextTop =
      el.scrollTop + (target.getBoundingClientRect().top - el.getBoundingClientRect().top);
    el.scrollTo({ top: Math.max(0, nextTop), behavior });
    window.setTimeout(() => {
      skipScrollSyncRef.current = false;
      setScrollbarW(Math.max(0, el.offsetWidth - el.clientWidth));
      captureCalendarAnchor();
    }, 480);
  };

  const scrollItemIntoScroller = (
    itemId: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const el =
      viewMode === "list" ? listScrollRef.current : scrollRef.current;
    if (!el) return;
    const want = String(itemId || "").trim();
    if (!want) return;
    const matches = Array.from(
      el.querySelectorAll("[data-practice-cal-item]"),
    ).filter((node) => {
      const id = String(node.getAttribute("data-practice-cal-item") || "").trim();
      return id === want || id.startsWith(`${want}:`);
    });
    if (matches.length === 0) return;
    const target = matches[matches.length - 1];
    if (!(target instanceof HTMLElement)) return;
    skipScrollSyncRef.current = true;
    const nextTop =
      el.scrollTop +
      (target.getBoundingClientRect().top - el.getBoundingClientRect().top) -
      20;
    el.scrollTo({ top: Math.max(0, nextTop), behavior });
    window.setTimeout(() => {
      skipScrollSyncRef.current = false;
    }, 200);
  };

  useEffect(() => {
    if (!focusEpoch) return;
    const want = String(focusItemId || "").trim();
    if (!want) return;
    const ymd = String(focusItemYmd || "").trim();
    const run = () => {
      if (ymd) scrollToYmd(ymd, "smooth");
      window.requestAnimationFrame(() => {
        scrollItemIntoScroller(want, "smooth");
      });
    };
    const raf = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 140);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- epoch drives intentional scroll
  }, [focusEpoch, focusItemId, focusItemYmd, viewMode]);

  useEffect(() => {
    if (viewMode === "list") {
      listForceAlignRef.current = true;
      return;
    }
    // 캘린더: 최초/명시 align 만 스크롤. fetch 때마다 이동하지 않음.
    const target = cursorYmd || todayYmd;
    if (!target) return;
    const id = window.requestAnimationFrame(() => {
      scrollToYmd(target, "auto");
      captureCalendarAnchor();
      calendarScrollQuietUntilRef.current = Date.now() + 400;
    });
    return () => window.cancelAnimationFrame(id);
  }, [alignEpoch, viewMode]);

  // 캘린더: 칩/데이터 갱신 후에도 같은 주가 같은 화면에 남도록 앵커 복원.
  // rAF 한 번 더 — 브라우저 overflow-anchor / 후속 레이아웃이 되돌리는 경우 보정.
  useLayoutEffect(() => {
    if (viewMode !== "calendar") return;
    restoreCalendarAnchor();
    const id = window.requestAnimationFrame(() => {
      restoreCalendarAnchor();
    });
    return () => window.cancelAnimationFrame(id);
  }, [items, viewMode, minRowH]);

  useEffect(() => {
    if (viewMode !== "list") return;
    if (listForceAlignRef.current) {
      listForceAlignRef.current = false;
      const target =
        listRestoreYmdRef.current || cursorYmd || captionMonth || todayYmd;
      listRestoreYmdRef.current = null;
      const id = window.requestAnimationFrame(() => {
        scrollListToYmd(target, "auto");
        window.setTimeout(() => {
          listPinCursorRef.current = false;
        }, 480);
      });
      return () => window.cancelAnimationFrame(id);
    }
    if (listRestoreYmdRef.current) {
      const anchor = listRestoreYmdRef.current;
      listRestoreYmdRef.current = null;
      const id = window.requestAnimationFrame(() => {
        scrollListToYmd(anchor, "auto");
        window.setTimeout(() => {
          listPinCursorRef.current = false;
        }, 480);
      });
      return () => window.cancelAnimationFrame(id);
    }
    window.setTimeout(() => {
      listPinCursorRef.current = false;
    }, 480);
  }, [alignEpoch, viewMode, captionMonth, items]);

  const resolveListVisibleYmd = () => {
    const el = listScrollRef.current;
    if (!el) return "";
    const top = el.getBoundingClientRect().top + 12;
    for (const day of agendaDays) {
      const node = dayElsRef.current.get(day.ymd);
      if (!node) continue;
      if (node.getBoundingClientRect().bottom > top) return day.ymd;
    }
    return agendaDays[0]?.ymd || "";
  };

  const handleListScroll = () => {
    if (viewMode !== "list" || skipScrollSyncRef.current) return;
    if (listPinCursorRef.current) return;

    const visibleYmd = resolveListVisibleYmd();
    if (!visibleYmd) return;

    // 화면에 보이는 일자의 월만 반영. 하단 도달로 다음 달을 미리 당기지 않음.
    const monthStart = kstStartOfMonth(visibleYmd) || visibleYmd;
    const cursorMonth = kstStartOfMonth(cursorYmd) || cursorYmd;
    if (monthStart && monthStart !== cursorMonth) {
      listVisibleMonthRef.current = monthStart;
      onCursorChange(monthStart);
    } else if (monthStart) {
      listVisibleMonthRef.current = monthStart;
    }
  };

  const handleScroll = () => {
    if (viewMode !== "calendar") return;
    const el = scrollRef.current;
    if (!el || skipScrollSyncRef.current) return;
    captureCalendarAnchor();
    if (Date.now() < calendarScrollQuietUntilRef.current) return;
    const midY = el.getBoundingClientRect().top + el.clientHeight / 2;
    for (const week of weeks) {
      const weekStart = week[0];
      if (!weekStart) continue;
      const row = weekElsRef.current.get(weekStart);
      if (!row) continue;
      const box = row.getBoundingClientRect();
      if (box.top > midY || box.bottom < midY) continue;
      // 조회 구간만 갱신. fetch 후 스크롤은 앵커로 복원(여기선 이동 없음).
      if (weekStart !== cursorYmd) {
        calendarScrollQuietUntilRef.current = Date.now() + 350;
        onCursorChange(weekStart);
      }
      return;
    }
  };

  const jumpMonth = (direction: -1 | 1) => {
    const next = shiftMonth(cursorYmd, direction);
    if (viewMode === "list") {
      listForceAlignRef.current = true;
      listPinCursorRef.current = true;
      listRestoreYmdRef.current = next;
      listVisibleMonthRef.current = next;
    } else {
      calendarScrollQuietUntilRef.current = Date.now() + 550;
    }
    onCursorChange(next);
    if (viewMode === "calendar") {
      scrollToYmd(next, "smooth");
    }
  };

  const jumpToToday = () => {
    const target = todayYmd || cursorYmd;
    if (!target) return;
    if (viewMode === "list") {
      const monthStart = kstStartOfMonth(target) || target;
      listForceAlignRef.current = true;
      listPinCursorRef.current = true;
      listRestoreYmdRef.current = target;
      listVisibleMonthRef.current = monthStart;
      if (monthStart !== (kstStartOfMonth(cursorYmd) || cursorYmd)) {
        onCursorChange(monthStart);
      } else {
        window.requestAnimationFrame(() => scrollListToYmd(target, "smooth"));
        listPinCursorRef.current = false;
      }
      return;
    }
    const weekStart =
      kstStartOfWeek(target, LAB_RECEIVE_CALENDAR_WEEK_STARTS_ON) || target;
    calendarScrollQuietUntilRef.current = Date.now() + 550;
    if (weekStart !== cursorYmd) onCursorChange(weekStart);
    scrollToYmd(target, "smooth");
  };

  const toggleHiddenDow = (dow: number) => {
    const next = hidden.has(dow)
      ? hiddenWeekdays.filter((d) => d !== dow)
      : [...hiddenWeekdays, dow];
    if (next.length >= 7) return;
    onHiddenWeekdaysChange(next);
  };

  const selectListItem = (item: PracticeCalendarChipItem, ymd: string) => {
    onSelectItem(item, {
      ymd,
      dow: kstYmdWeekday(ymd) ?? 0,
      visibleColumnIndex: 0,
      visibleColumnCount: 1,
    });
  };

  const handleSideDaySelect = (ymd: string) => {
    const monthStart = kstStartOfMonth(ymd) || ymd;
    // 내일 이후만 도착일 신규 의뢰(오늘은 목록 이동)
    if (onSelectFutureDay && todayYmd && ymd > todayYmd) {
      onSelectFutureDay(ymd);
      return;
    }
    listForceAlignRef.current = true;
    listPinCursorRef.current = true;
    listRestoreYmdRef.current = ymd;
    listVisibleMonthRef.current = monthStart;
    if (monthStart !== (kstStartOfMonth(cursorYmd) || cursorYmd)) {
      onCursorChange(monthStart);
    } else {
      window.requestAnimationFrame(() => scrollListToYmd(ymd, "smooth"));
      listPinCursorRef.current = false;
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      {...(guideTourTarget
        ? { "data-guide-tour": guideTourTarget }
        : {})}
    >
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => jumpMonth(-1)}
            aria-label="이전 달"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="min-w-[7.5rem] rounded-md px-1 py-0.5 text-center text-sm font-semibold tabular-nums hover:bg-muted/40"
            title="오늘로 이동"
            aria-label={`${monthCaption(captionMonth)}, 오늘로 이동`}
            onClick={jumpToToday}
          >
            {monthCaption(captionMonth)}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => jumpMonth(1)}
            aria-label="다음 달"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isListMode ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[11px] text-muted-foreground">숨길 요일</span>
            {LAB_RECEIVE_CALENDAR_WEEK_GRID_COLUMNS.map(({ dow, label }) => (
              <button
                key={`hide-${dow}`}
                type="button"
                className={cn(
                  "h-7 min-w-7 rounded-md px-1.5 text-[11px] tabular-nums",
                  hidden.has(dow)
                    ? "bg-muted text-muted-foreground line-through"
                    : "bg-background text-slate-700 ring-1 ring-inset ring-border hover:bg-muted/40",
                )}
                aria-pressed={hidden.has(dow)}
                title={
                  hidden.has(dow) ? `${label}요일 표시` : `${label}요일 숨김`
                }
                onClick={() => toggleHiddenDow(dow)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {onSearchChange ? (
            <div className="relative w-44 shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-9 w-full pl-9 pr-8"
                placeholder={searchPlaceholder}
              />
              {(search ?? "").trim() ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => onSearchChange("")}
                  aria-label="검색어 지우기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="rounded-full"
            title="주문일"
            aria-label="주문일"
            onClick={() => onDateKeyChange("orderDate")}
          >
            <Badge
              variant="outline"
              className={cn(
                "cursor-pointer leading-snug tracking-normal",
                dateKey === "orderDate"
                  ? "border-primary/70 bg-primary-soft text-primary-strong"
                  : "hover:bg-muted/40",
              )}
            >
              주문일
            </Badge>
          </button>
          <button
            type="button"
            className="rounded-full"
            title="치과도착일"
            aria-label="치과도착일"
            onClick={() => onDateKeyChange("arrivalDate")}
          >
            <Badge
              variant="outline"
              className={cn(
                // leading-none+작은 글씨에서 「치과도착일」이 「치과의사착일」로 오인되는 경우 방지
                "cursor-pointer leading-snug tracking-normal",
                dateKey === "arrivalDate"
                  ? "border-primary/70 bg-primary-soft text-primary-strong"
                  : "hover:bg-muted/40",
              )}
            >
              도착일
            </Badge>
          </button>
          <div
            className="flex items-center rounded-md border border-slate-200 bg-white p-0.5"
            role="group"
            aria-label="보기 전환"
          >
            <button
              type="button"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium",
                viewMode === "calendar"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
              aria-pressed={viewMode === "calendar"}
              title="캘린더"
              onClick={() => onViewModeChange("calendar")}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              캘린더
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium",
                viewMode === "list"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
              aria-pressed={viewMode === "list"}
              title="목록"
              onClick={() => onViewModeChange("list")}
            >
              <List className="h-3.5 w-3.5" />
              목록
            </button>
          </div>
        </div>
      </div>

      {isListMode ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          <aside className="hidden w-[13.75rem] shrink-0 flex-col gap-2 md:flex">
            <ListSideMonthCalendar
              monthYmd={captionMonth}
              todayYmd={todayYmd}
              markedYmds={markedAgendaYmds}
              canComposeArrival={Boolean(onSelectFutureDay)}
              onSelectDay={handleSideDaySelect}
            />
          </aside>
          <div
            ref={listScrollRef}
            className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-slate-200/80 bg-white"
            onScroll={handleListScroll}
          >
            {agendaDays.length === 0 ? (
              <div className="flex h-full min-h-[12rem] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
                <p className="text-sm font-medium text-slate-600">
                  표시할 의뢰가 없습니다
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  스크롤·월 이동 또는 검색·상태 필터를 확인해 보세요.
                </p>
              </div>
            ) : (
              <div className="max-w-xl divide-y divide-slate-100">
                {agendaDays.map(({ ymd, items: dayItems }) => {
                  const isToday = ymd === todayYmd;
                  const { monthNum, dayNum, text: dateText } =
                    agendaDateLabel(ymd);
                  return (
                    <div
                      key={`agenda-${ymd}`}
                      ref={(node) => {
                        if (node) dayElsRef.current.set(ymd, node);
                        else dayElsRef.current.delete(ymd);
                      }}
                      className="relative"
                    >
                      {dayItems.map((item, itemIdx) => {
                        const showDelete = Boolean(
                          item.canDelete && onDeleteItem,
                        );
                        const unreadCount = Math.max(
                          0,
                          Number(item.unreadCount || 0),
                        );
                        const uploadOverdue =
                          abutmentUploadOverdueViewer === "practice"
                            ? null
                            : item.abutmentUploadOverdue;
                        const unreadLabel =
                          unreadCount > 99 ? "99+" : String(unreadCount);
                        const hasLinkedChain =
                          (Array.isArray(item.linkedOrderDates) &&
                            item.linkedOrderDates.length > 1) ||
                          (Array.isArray(item.linkedArrivalDates) &&
                            item.linkedArrivalDates.length > 1);
                        const linkPrefix = item.isPriorArrival
                          ? "↗ "
                          : hasLinkedChain
                            ? "↙ "
                            : "";
                        const overdueTooltip = uploadOverdue
                          ? getPracticeAbutmentUploadOverdueTooltip(
                              uploadOverdue,
                              abutmentUploadOverdueViewer,
                            )
                          : "";
                        const guideTourChip = isGuideTourChip(item.id);
                        const dotColor = calendarGroupDotColor(item.colorKey);
                        return (
                          <div
                            key={`${item.id}:${ymd}`}
                            data-practice-cal-item={item.id}
                            className={cn(
                              "grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-2 px-3 py-2.5 hover:bg-slate-50/80",
                              item.isPriorArrival && "opacity-60",
                            )}
                            {...(guideTourChip && guideTourItemTarget
                              ? { "data-guide-tour": guideTourItemTarget }
                              : {})}
                          >
                            <div className="flex min-h-7 items-center pt-0.5">
                              {itemIdx === 0 ? (
                                <span
                                  className={cn(
                                    "text-[12px] leading-snug tabular-nums",
                                    isToday
                                      ? "font-semibold text-primary-strong"
                                      : "text-slate-600",
                                  )}
                                  title={dateText}
                                >
                                  {isToday ? (
                                    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                      <span>{monthNum}월</span>
                                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
                                        {dayNum}
                                      </span>
                                      <span>
                                        일 (
                                        {weekdayLabel(kstYmdWeekday(ymd) ?? 0)})
                                      </span>
                                    </span>
                                  ) : (
                                    dateText
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={cn(
                                "flex min-w-0 items-start gap-2 rounded-md px-1.5 py-0.5",
                                uploadOverdue === "deadline" &&
                                  "ring-2 ring-red-400/70",
                                (uploadOverdue === "red" ||
                                  (!uploadOverdue && unreadCount > 0)) &&
                                  "ring-1 ring-red-500/80",
                                uploadOverdue === "yellow" &&
                                  "ring-1 ring-amber-500/80",
                              )}
                            >
                              <span
                                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                                style={{ backgroundColor: dotColor }}
                                aria-hidden
                              />
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left text-[13px] leading-snug text-slate-900"
                                title={
                                  overdueTooltip ||
                                  (item.linkedOrderDates &&
                                  item.linkedOrderDates.length > 1
                                    ? `${item.line} · 연결 주문일 ${item.linkedOrderDates.join(" → ")}${
                                        item.isPriorArrival
                                          ? " (이전·보냄)"
                                          : " (최종·받음)"
                                      }`
                                    : item.linkedArrivalDates &&
                                        item.linkedArrivalDates.length > 1
                                      ? `${item.line} · 연결 도착일 ${item.linkedArrivalDates.join(" → ")}${
                                          item.isPriorArrival
                                            ? " (이전·보냄)"
                                            : " (최종·받음)"
                                        }`
                                      : unreadCount > 0
                                        ? `${item.line} · 안읽음 ${unreadLabel}`
                                        : item.line)
                                }
                                onClick={() => selectListItem(item, ymd)}
                              >
                                <span className="line-clamp-2 break-all">
                                  {linkPrefix}
                                  {item.line}
                                </span>
                              </button>
                              {unreadCount > 0 ? (
                                <span
                                  className="mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
                                  aria-label={`안읽음 ${unreadLabel}`}
                                >
                                  {unreadLabel}
                                </span>
                              ) : null}
                              {showDelete ? (
                                <button
                                  type="button"
                                  className="mt-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-black/5 hover:text-destructive"
                                  aria-label="의뢰 취소"
                                  title="의뢰 취소(휴지통)"
                                  onClick={() => onDeleteItem?.(item)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {isToday ? (
                        <div
                          className="pointer-events-none absolute inset-x-3 bottom-0 flex items-center"
                          aria-hidden
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                          <span className="h-px flex-1 bg-red-500" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="grid shrink-0 border-l border-t"
          style={{
            gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
            paddingInlineEnd: scrollbarW,
          }}
        >
          {visibleColumns.map(({ dow, label }) => (
            <div
              key={`hdr-${dow}`}
              className="border-b border-r bg-muted/40 px-1.5 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
          onScroll={handleScroll}
        >
          {weeks.map((week) => {
            const cells: DayCell[] = week.map((ymd) => ({
              ymd,
              dow: kstYmdWeekday(ymd) ?? 0,
            }));
            const visibleCells = visibleDows
              .map((dow) => cells.find((cell) => cell.dow === dow))
              .filter((cell): cell is DayCell => cell != null);
            return (
              <div
                key={week[0]}
                ref={(node) => {
                  const weekStart = week[0];
                  if (!weekStart) return;
                  if (node) weekElsRef.current.set(weekStart, node);
                  else weekElsRef.current.delete(weekStart);
                }}
                className="grid items-stretch border-l [overflow-anchor:none]"
                style={{
                  gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                  minHeight: minRowH,
                }}
              >
                {visibleCells.map((day, visibleColumnIndex) => {
                  const dayItems = byDay.get(day.ymd) || [];
                  const isToday = day.ymd === todayYmd;
                  const isFutureDay = Boolean(
                    onSelectFutureDay && todayYmd && day.ymd >= todayYmd,
                  );
                  const inCaptionMonth =
                    day.ymd >= captionMonth && day.ymd <= captionMonthEnd;
                  const monthNum = Number(day.ymd.slice(5, 7));
                  const dayNum = Number(day.ymd.slice(-2));
                  return (
                    <div
                      key={day.ymd}
                      role={isFutureDay ? "button" : undefined}
                      tabIndex={isFutureDay ? 0 : undefined}
                      aria-label={
                        isFutureDay
                          ? `${monthNum}/${dayNum} 신규 의뢰 (도착일)`
                          : undefined
                      }
                      title={
                        isFutureDay
                          ? "클릭하면 이 날을 치과도착일로 신규 의뢰를 작성합니다"
                          : undefined
                      }
                      className={cn(
                        "flex h-full min-h-0 flex-col border-b border-r p-1",
                        !inCaptionMonth && "bg-muted/20",
                        isToday && "bg-primary-soft/40",
                        isFutureDay &&
                          "cursor-pointer hover:bg-primary-soft/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      )}
                      onClick={
                        isFutureDay
                          ? () => onSelectFutureDay?.(day.ymd)
                          : undefined
                      }
                      onKeyDown={
                        isFutureDay
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectFutureDay?.(day.ymd);
                              }
                            }
                          : undefined
                      }
                    >
                      <p
                        className={cn(
                          "mb-1 shrink-0 text-right text-[11px] tabular-nums",
                          isToday
                            ? "font-semibold text-primary-strong"
                            : inCaptionMonth
                              ? "text-slate-700"
                              : "text-muted-foreground",
                        )}
                      >
                        {monthNum}/{dayNum}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {dayItems.map((item) => {
                          const showDelete = Boolean(item.canDelete && onDeleteItem);
                          const chipStyle = calendarChipStyleForItem(item);
                          const unreadCount = Math.max(0, Number(item.unreadCount || 0));
                          const uploadOverdue =
                          abutmentUploadOverdueViewer === "practice"
                            ? null
                            : item.abutmentUploadOverdue;
                          const unreadLabel =
                            unreadCount > 99 ? "99+" : String(unreadCount);
                          const hasLinkedChain =
                            (Array.isArray(item.linkedOrderDates) &&
                              item.linkedOrderDates.length > 1) ||
                            (Array.isArray(item.linkedArrivalDates) &&
                              item.linkedArrivalDates.length > 1);
                          /** 이전 일자=보냄(↗) · 최종 일자=받음(↙) */
                          const linkPrefix = item.isPriorArrival
                            ? "↗ "
                            : hasLinkedChain
                              ? "↙ "
                              : "";
                          const overdueTooltip = uploadOverdue
                            ? getPracticeAbutmentUploadOverdueTooltip(
                                uploadOverdue,
                                abutmentUploadOverdueViewer,
                              )
                            : "";
                          const guideTourChip = isGuideTourChip(item.id);
                          return (
                            <div
                              key={`${item.id}:${day.ymd}`}
                              data-practice-cal-item={item.id}
                              className={cn(
                                "flex items-start gap-0.5 rounded pr-0.5 hover:brightness-95",
                                item.isPriorArrival && "opacity-55",
                                uploadOverdue === "deadline" &&
                                  "border-[3px] border-double border-red-700 ring-2 ring-red-400/70",
                                uploadOverdue === "red" &&
                                  "border-[3px] border-double border-red-600",
                                uploadOverdue === "yellow" &&
                                  "border-[3px] border-double border-amber-500",
                                !uploadOverdue &&
                                  Number(item.unreadCount || 0) > 0 &&
                                  "border-[3px] border-double border-red-600",
                              )}
                              style={chipStyle}
                              {...(guideTourChip && guideTourItemTarget
                                ? { "data-guide-tour": guideTourItemTarget }
                                : {})}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-start gap-0.5 px-1 py-0.5 text-left text-[10px] leading-snug"
                                title={
                                  overdueTooltip ||
                                  (item.linkedOrderDates &&
                                  item.linkedOrderDates.length > 1
                                    ? `${item.line} · 연결 주문일 ${item.linkedOrderDates.join(" → ")}${
                                        item.isPriorArrival ? " (이전·보냄)" : " (최종·받음)"
                                      }`
                                    : item.linkedArrivalDates &&
                                        item.linkedArrivalDates.length > 1
                                      ? `${item.line} · 연결 도착일 ${item.linkedArrivalDates.join(" → ")}${
                                          item.isPriorArrival
                                            ? " (이전·보냄)"
                                            : " (최종·받음)"
                                        }`
                                      : unreadCount > 0
                                        ? `${item.line} · 안읽음 ${unreadLabel}`
                                        : item.line)
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectItem(item, {
                                    ymd: day.ymd,
                                    dow: day.dow,
                                    visibleColumnIndex,
                                    visibleColumnCount: colCount,
                                  });
                                }}
                              >
                                <span className="min-w-0 flex-1 line-clamp-2 break-all">
                                  {linkPrefix}
                                  {item.line}
                                </span>
                                {unreadCount > 0 ? (
                                  <span
                                    className="mt-px inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-semibold leading-none text-white"
                                    aria-label={`안읽음 ${unreadLabel}`}
                                  >
                                    {unreadLabel}
                                  </span>
                                ) : null}
                              </button>
                              {showDelete ? (
                                <button
                                  type="button"
                                  className="mt-0.5 shrink-0 rounded p-0.5 text-current/70 hover:bg-black/10 hover:text-destructive"
                                  aria-label="의뢰 취소"
                                  title="의뢰 취소(휴지통)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteItem?.(item);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
