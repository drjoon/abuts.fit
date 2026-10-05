// change-log:
// - 2026-10-06: DayContent로 토·일·법정공휴일 빨간 글자(range middle 포함). 헤더 일/토도 빨강.
// - 2026-10-06: 한국 법정 공휴일(krHoliday) 일자 빨간 글자 — PeriodFilter·도착일 등 전 Calendar 공통.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/date/krHolidays.ts
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayContentProps } from "react-day-picker";

import { cn } from "@/shared/ui/cn";
import { buttonVariants } from "@/components/ui/button";
import {
  isKrCalendarRedLetterYmd,
  KR_CALENDAR_RED_DAY_TEXT_CLASSNAME,
} from "@/shared/date/krHolidays";
import { toKstYmd } from "@/shared/date/kst";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** 단색 선택(시작/끝/단일)만 primary 글자. range middle·비선택은 빨강 유지. */
export function CalendarRedLetterDayContent({
  date,
  activeModifiers,
}: Pick<DayContentProps, "date" | "activeModifiers">) {
  const ymd = toKstYmd(date) || "";
  const dayNum = Number(ymd.slice(8, 10)) || date.getDate();
  const redLetter = isKrCalendarRedLetterYmd(ymd);
  const solidSelected = Boolean(
    activeModifiers.selected && !activeModifiers.range_middle,
  );
  return (
    <span
      className={cn(
        redLetter &&
          !solidSelected &&
          cn(KR_CALENDAR_RED_DAY_TEXT_CLASSNAME, "!text-red-600"),
      )}
    >
      {dayNum}
    </span>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  const { DayContent: ConsumerDayContent, ...restComponents } =
    components ?? {};

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] [&:first-child]:text-red-600 [&:last-child]:text-red-600",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-muted/60 [&:has([aria-selected])]:bg-muted first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent-soft text-accent-strong",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-muted aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-muted aria-selected:text-foreground",
        day_hidden: "invisible",
        ...classNames,
        // 소비자 classNames가 덮어도 일/토 헤더·선택 마커는 유지
        head_cell: cn(
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] [&:first-child]:text-red-600 [&:last-child]:text-red-600",
          classNames?.head_cell,
        ),
        day_selected: cn(
          "day-selected",
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          classNames?.day_selected,
        ),
        day_range_middle: cn(
          "day-range-middle",
          "aria-selected:bg-muted aria-selected:text-foreground",
          classNames?.day_range_middle,
        ),
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        ...restComponents,
        DayContent: (dayContentProps) =>
          ConsumerDayContent ? (
            <ConsumerDayContent {...dayContentProps} />
          ) : (
            <CalendarRedLetterDayContent {...dayContentProps} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
