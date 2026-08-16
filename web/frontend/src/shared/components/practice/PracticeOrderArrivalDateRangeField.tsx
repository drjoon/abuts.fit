import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown, CircleHelp } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";
import {
  PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL,
  formatPracticeWorkPeriodLeadLabel,
  getPracticeWorkPeriodDays,
} from "@/shared/practice/practiceWorkPeriod";
// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeWorkPeriodText.tsx
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// - web/frontend/src/shared/ui/PeriodFilter.tsx
// - web/frontend/src/shared/date/kst.ts
// - 2026-08-16: 도움말 간격을 UI와 같이 N+2영업일로 표기. 치과 직납 안내.
// - 2026-08-15: 라벨 주문-치과도착 · 기간 1+2영업일.
// - 2026-08-15: 기공기간 5일 미만 빨간 표시·거부 가능 툴팁.
// - 2026-08-15: 작업기간 표시를 영업일(월~금) 기준으로 통일.
// - 2026-08-13: 라벨 오른쪽에 주문→도착 소요일 표시.
// - 2026-08-11: 캘린더 상단 안내문 제거 → 라벨 즉시툴팁.

const addDaysToYmd = (ymd: string, days: number) => {
  const base = String(ymd || "").trim();
  if (!base) return "";
  const d = new Date(`${base}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return toKstYmd(d) || "";
};

const formatArrivalLabel = (arrivalYmd: string) => {
  const arrival = ymdToKstDate(arrivalYmd);
  if (!arrival) return "치과도착일 선택";
  return `오늘 – ${format(arrival, "M월 d일", { locale: ko })}`;
};

const pinRangeToToday = (
  range: DateRange | undefined,
  todayYmd: string,
  todayDate: Date,
): DateRange | undefined => {
  if (!todayYmd) return range;
  const clicked = range?.to ?? range?.from;
  if (!clicked) {
    return { from: todayDate, to: undefined };
  }
  const clickedYmd = toKstYmd(clicked) || "";
  if (!clickedYmd || clickedYmd < todayYmd) {
    return { from: todayDate, to: todayDate };
  }
  return { from: todayDate, to: clicked };
};

export type PracticeOrderArrivalDateRangeFieldProps = {
  /** 표시용. 적용 시 주문일은 항상 오늘(KST)로 전달됩니다. */
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  onChange: (next: { orderDate: string; arrivalDate: string }) => void;
  className?: string;
  triggerClassName?: string;
};

export function PracticeOrderArrivalDateRangeField({
  orderDate,
  arrivalDate,
  arrivalDefaultDays,
  onChange,
  className,
  triggerClassName,
}: PracticeOrderArrivalDateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const todayYmd = useMemo(() => toKstYmd(new Date()) || "", []);
  const todayDate = useMemo(() => ymdToKstDate(todayYmd) || undefined, [todayYmd]);

  const appliedArrivalYmd = String(arrivalDate || "").trim();
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();

  useEffect(() => {
    if (!open || !todayDate || !todayYmd) return;
    const arrivalYmd =
      appliedArrivalYmd && appliedArrivalYmd >= todayYmd
        ? appliedArrivalYmd
        : addDaysToYmd(todayYmd, arrivalDefaultDays);
    setDraftRange({
      from: todayDate,
      to: ymdToKstDate(arrivalYmd) || todayDate,
    });
  }, [appliedArrivalYmd, arrivalDefaultDays, open, todayDate, todayYmd]);

  const draftArrivalYmd = draftRange?.to
    ? toKstYmd(draftRange.to) || ""
    : draftRange?.from
      ? toKstYmd(draftRange.from) || ""
      : "";
  const canApply = Boolean(todayYmd && draftArrivalYmd && draftArrivalYmd >= todayYmd);
  const appliedOrderYmd = String(orderDate || "").trim() || todayYmd;
  const leadFromYmd = open ? todayYmd : appliedOrderYmd;
  const leadToYmd = open ? draftArrivalYmd : appliedArrivalYmd;
  const leadDays = getPracticeWorkPeriodDays(leadFromYmd, leadToYmd);
  const leadLabel = formatPracticeWorkPeriodLeadLabel(leadDays);

  const handleApply = () => {
    if (!canApply || !todayYmd || !draftArrivalYmd) return;
    onChange({ orderDate: todayYmd, arrivalDate: draftArrivalYmd });
    setOpen(false);
  };

  const handleCancel = () => {
    if (!todayDate || !todayYmd) {
      setOpen(false);
      return;
    }
    const arrivalYmd =
      appliedArrivalYmd && appliedArrivalYmd >= todayYmd
        ? appliedArrivalYmd
        : addDaysToYmd(todayYmd, arrivalDefaultDays);
    setDraftRange({
      from: todayDate,
      to: ymdToKstDate(arrivalYmd) || todayDate,
    });
    setOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Label className="text-sm leading-none">{PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-muted-foreground/80 transition-colors hover:text-foreground"
                aria-label={`${PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL} 도움말`}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left text-xs leading-relaxed">
              주문일은 오늘 고정. 치과도착일만 선택하면 됩니다.
              {leadLabel
                ? ` 변경한 간격(${leadLabel})이 다음 기본값으로 저장됩니다.`
                : " 변경한 간격이 다음 기본값으로 저장됩니다."}{" "}
              커스텀어벗은 기공소가 아니라 치과로 직납되며, 출고 목표는
              치과도착일 2영업일 전입니다.
            </TooltipContent>
          </Tooltip>
        </div>
        {leadDays != null && leadDays >= 0 ? (
          <PracticeWorkPeriodText
            orderDate={leadFromYmd}
            arrivalDate={leadToYmd}
            variant="lead"
            className="shrink-0 text-xs"
          />
        ) : null}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-11 w-full justify-between gap-2 px-3 text-left text-base font-normal",
              triggerClassName,
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">{formatArrivalLabel(appliedArrivalYmd)}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={6}
          avoidCollisions={false}
          className="w-auto p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="inline-flex flex-col">
            <Calendar
              mode="range"
              locale={ko}
              numberOfMonths={1}
              selected={draftRange}
              onSelect={(range) => {
                if (!todayDate || !todayYmd) return;
                setDraftRange(pinRangeToToday(range, todayYmd, todayDate));
              }}
              disabled={todayDate ? { before: todayDate } : undefined}
              defaultMonth={draftRange?.to || draftRange?.from || todayDate}
              initialFocus
              classNames={{
                day_today: "bg-transparent text-foreground font-semibold",
              }}
            />
            <div className="flex w-0 min-w-full items-center justify-between gap-2 border-t px-3 py-2">
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                {draftArrivalYmd ? formatArrivalLabel(draftArrivalYmd) : "치과도착일 선택"}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={handleCancel}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  적용
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
