/**
 * 치과 최근의뢰·기공소 기공의뢰수신 공통 — 3주 세로 스크롤 캘린더.
 * 기본 토·일 숨김(요일 토글로 복구). 주 행은 항목 수에 따라 최소 1/3 화면에서 늘어남.
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/date/kst.ts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

export type PracticeCalendarDateKey = "orderDate" | "arrivalDate";

export type PracticeCalendarChipItem = {
  id: string;
  orderDate?: string | null;
  arrivalDate?: string | null;
  colorKey: string;
  sortLabel: string;
  line: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEK_STARTS_ON = 1;
const WEEKS_BEFORE = 78;
const WEEKS_AFTER = 26;
export const DEFAULT_HIDDEN_WEEKDAYS = [0, 6] as const;

type DayCell = {
  ymd: string;
  dow: number;
};

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

const monthCaption = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  return y && m ? `${y}년 ${m}월` : "";
};

const buildWeeksFromOrigin = (originYmd: string): string[][] => {
  const originMonday = kstStartOfWeek(originYmd, WEEK_STARTS_ON) || originYmd;
  const firstMonday =
    kstAddCivilDays(originMonday, -WEEKS_BEFORE * 7) || originMonday;
  const weekCount = WEEKS_BEFORE + WEEKS_AFTER + 1;
  const weeks: string[][] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const monday = kstAddCivilDays(firstMonday, w * 7);
    if (!monday) continue;
    const days: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      const ymd = kstAddCivilDays(monday, d);
      if (ymd) days.push(ymd);
    }
    if (days.length === 7) weeks.push(days);
  }
  return weeks;
};

const shiftMonth = (cursorYmd: string, direction: -1 | 1): string => {
  const monthStart = kstStartOfMonth(cursorYmd) || cursorYmd;
  if (direction < 0) {
    return kstStartOfMonth(kstAddCivilDays(monthStart, -1)) || cursorYmd;
  }
  return kstStartOfMonth(kstAddCivilDays(monthStart, 32)) || cursorYmd;
};

type PracticeRecentTransfersCalendarProps = {
  items: PracticeCalendarChipItem[];
  dateKey: PracticeCalendarDateKey;
  cursorYmd: string;
  onCursorChange: (ymd: string) => void;
  onDateKeyChange: (key: PracticeCalendarDateKey) => void;
  onSelectItem: (item: PracticeCalendarChipItem) => void;
  hiddenWeekdays: number[];
  onHiddenWeekdaysChange: (next: number[]) => void;
  alignEpoch?: number;
};

export function PracticeRecentTransfersCalendar({
  items,
  dateKey,
  cursorYmd,
  onCursorChange,
  onDateKeyChange,
  onSelectItem,
  hiddenWeekdays,
  onHiddenWeekdaysChange,
  alignEpoch = 0,
}: PracticeRecentTransfersCalendarProps) {
  const todayYmd = toKstYmd(new Date()) || "";
  const originYmd = todayYmd || cursorYmd;
  const weeks = useMemo(() => buildWeeksFromOrigin(originYmd), [originYmd]);
  const hidden = useMemo(() => new Set(hiddenWeekdays), [hiddenWeekdays]);
  const visibleDows = WEEKDAYS.map((_, dow) => dow).filter((dow) => !hidden.has(dow));

  const byDay = useMemo(() => {
    const map = new Map<string, PracticeCalendarChipItem[]>();
    for (const item of items) {
      const ymd = toKstYmdLoose(
        dateKey === "arrivalDate" ? item.arrivalDate : item.orderDate,
      );
      if (!ymd) continue;
      const list = map.get(ymd) || [];
      list.push(item);
      map.set(ymd, list);
    }
    for (const [ymd, list] of map) {
      list.sort((a, b) => {
        const groupCmp = String(a.sortLabel || "").localeCompare(
          String(b.sortLabel || ""),
          "ko",
        );
        if (groupCmp !== 0) return groupCmp;
        return String(a.line || "").localeCompare(String(b.line || ""), "ko");
      });
      map.set(ymd, list);
    }
    return map;
  }, [dateKey, items]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const weekElsRef = useRef(new Map<string, HTMLDivElement>());
  const skipScrollSyncRef = useRef(false);
  const [minRowH, setMinRowH] = useState(140);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const apply = () => setMinRowH(Math.max(112, Math.floor(el.clientHeight / 3)));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const weekIndexForYmd = (ymd: string) =>
    weeks.findIndex((week) => week[0] && ymd >= week[0] && ymd <= (week[6] || week[0]));

  const scrollToYmd = (ymd: string, behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = weekIndexForYmd(ymd);
    if (idx < 0) return;
    const topIdx = Math.max(0, idx - 1);
    const monday = weeks[topIdx]?.[0];
    const target = monday ? weekElsRef.current.get(monday) : null;
    if (!target) return;
    skipScrollSyncRef.current = true;
    target.scrollIntoView({ block: "start", behavior });
    window.setTimeout(() => {
      skipScrollSyncRef.current = false;
    }, 120);
  };

  useEffect(() => {
    if (!minRowH) return;
    scrollToYmd(cursorYmd || todayYmd, "auto");
  }, [alignEpoch, minRowH]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || skipScrollSyncRef.current) return;
    const midY = el.getBoundingClientRect().top + el.clientHeight / 2;
    for (const week of weeks) {
      const monday = week[0];
      if (!monday) continue;
      const row = weekElsRef.current.get(monday);
      if (!row) continue;
      const box = row.getBoundingClientRect();
      if (box.top > midY || box.bottom < midY) continue;
      const monthStart = kstStartOfMonth(monday) || monday;
      const currentMonth = kstStartOfMonth(cursorYmd) || cursorYmd;
      if (monthStart !== currentMonth) onCursorChange(monthStart);
      return;
    }
  };

  const jumpMonth = (direction: -1 | 1) => {
    const next = shiftMonth(cursorYmd, direction);
    onCursorChange(next);
    scrollToYmd(next, "smooth");
  };

  const toggleHiddenDow = (dow: number) => {
    const next = hidden.has(dow)
      ? hiddenWeekdays.filter((d) => d !== dow)
      : [...hiddenWeekdays, dow];
    if (next.length >= 7) return;
    onHiddenWeekdaysChange(next);
  };

  const captionMonth = kstStartOfMonth(cursorYmd) || cursorYmd;
  const captionMonthEnd = kstEndOfMonth(captionMonth) || captionMonth;
  const colCount = Math.max(1, visibleDows.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
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
          <p className="min-w-[7.5rem] text-center text-sm font-semibold tabular-nums">
            {monthCaption(captionMonth)}
          </p>
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
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[11px] text-muted-foreground">숨길 요일</span>
          {WEEKDAYS.map((label, dow) => (
            <button
              key={label}
              type="button"
              className={cn(
                "h-7 min-w-7 rounded-md px-1.5 text-[11px] tabular-nums",
                hidden.has(dow)
                  ? "bg-muted text-muted-foreground line-through"
                  : "bg-background text-slate-700 ring-1 ring-inset ring-border hover:bg-muted/40",
              )}
              aria-pressed={hidden.has(dow)}
              title={hidden.has(dow) ? `${label}요일 표시` : `${label}요일 숨김`}
              onClick={() => toggleHiddenDow(dow)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            className="rounded-full"
            onClick={() => onDateKeyChange("orderDate")}
          >
            <Badge
              variant="outline"
              className={cn(
                "cursor-pointer",
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
            onClick={() => onDateKeyChange("arrivalDate")}
          >
            <Badge
              variant="outline"
              className={cn(
                "cursor-pointer",
                dateKey === "arrivalDate"
                  ? "border-primary/70 bg-primary-soft text-primary-strong"
                  : "hover:bg-muted/40",
              )}
            >
              치과도착일
            </Badge>
          </button>
        </div>
      </div>

      <div
        className="grid border-l border-t"
        style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
      >
        {visibleDows.map((dow) => (
          <div
            key={WEEKDAYS[dow]}
            className="border-b border-r bg-muted/40 px-1.5 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
          >
            {WEEKDAYS[dow]}
          </div>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={handleScroll}
      >
        {weeks.map((week) => {
          const cells: DayCell[] = week.map((ymd) => ({
            ymd,
            dow: kstYmdWeekday(ymd) ?? 0,
          }));
          const visibleCells = cells.filter((cell) => !hidden.has(cell.dow));
          return (
            <div
              key={week[0]}
              ref={(node) => {
                const monday = week[0];
                if (!monday) return;
                if (node) weekElsRef.current.set(monday, node);
                else weekElsRef.current.delete(monday);
              }}
              className="grid items-stretch border-l"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                minHeight: minRowH,
              }}
            >
              {visibleCells.map((day) => {
                const items = byDay.get(day.ymd) || [];
                const isToday = day.ymd === todayYmd;
                const inCaptionMonth =
                  day.ymd >= captionMonth && day.ymd <= captionMonthEnd;
                const monthNum = Number(day.ymd.slice(5, 7));
                const dayNum = Number(day.ymd.slice(-2));
                return (
                  <div
                    key={day.ymd}
                    className={cn(
                      "flex h-full min-h-0 flex-col border-b border-r p-1",
                      !inCaptionMonth && "bg-muted/20",
                      isToday && "bg-primary-soft/40",
                    )}
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
                      {items.map((item) => (
                          <button
                            key={`${item.id}:${day.ymd}`}
                            type="button"
                            className="w-full rounded px-1 py-0.5 text-left text-[10px] leading-snug hover:brightness-95"
                            style={calendarGroupChipStyle(item.colorKey)}
                            title={item.line}
                            onClick={() => onSelectItem(item)}
                          >
                            <span className="line-clamp-2 break-all">{item.line}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
