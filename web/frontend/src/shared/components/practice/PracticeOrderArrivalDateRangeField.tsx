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
  PRACTICE_CA_DIRECT_SHIP_NOTE,
  PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL,
  PRACTICE_ORDER_DAY_CUTOFF_NOTE,
  PRACTICE_WORK_PERIOD_RECOMMEND_NOTE,
  getPracticeWorkPeriodDays,
} from "@/shared/practice/practiceWorkPeriod";
// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeWorkPeriodText.tsx
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// - web/frontend/src/shared/ui/PeriodFilter.tsx
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/guideTour/GuideTourSpotlight.tsx
// - 2026-11-28: label·minBusinessDays — 모델스캔 「기공소도착」최소 2영업일.
// - 2026-09-05: 가이드투어 — 캘린더 팝오버를 satellite로 마킹(홀 확장·블러 위 z-430).
// - 2026-08-20: CA 안내 — 지정 도착일 2영업일 전 발송.
// - 2026-08-20: 낮 12시 전은 오늘 포함, 이후는 오늘 제외.
// - 2026-08-19: 도움말 — 출고=도착−2영업일, 지정 도착일 1영업일 전 배송 목표.
// - 2026-08-17: 도움말 툴팁 가로폭 확대(문장 한 줄 유지).
// - 2026-08-17: 도움말 — 3영업일 이하 지연 가능·4영업일 이상 안내로 단순화.
// - 2026-08-17: 주문-치과도착 도움말 줄바꿈·간결화.
// - 2026-08-17: 출고=도착−1·3+2 권고. 할증 문구 제거.
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

const formatArrivalLabel = (arrivalYmd: string, emptyLabel: string) => {
  const arrival = ymdToKstDate(arrivalYmd);
  if (!arrival) return emptyLabel;
  return `오늘 – ${format(arrival, "M월 d일", { locale: ko })}`;
};

/** 주문일 기준 최소 영업일을 만족하는 가장 이른 도착 YMD. */
const earliestArrivalYmdForMinBusinessDays = (
  orderYmd: string,
  minBusinessDays: number,
): string => {
  const min = Math.max(0, Math.floor(minBusinessDays));
  if (!orderYmd || min <= 0) return orderYmd;
  let cursor = orderYmd;
  for (let i = 0; i < 60; i += 1) {
    const days = getPracticeWorkPeriodDays(orderYmd, cursor);
    if (days != null && days >= min) return cursor;
    cursor = addDaysToYmd(cursor, 1);
    if (!cursor) break;
  }
  return cursor || orderYmd;
};

const pinRangeToToday = (
  range: DateRange | undefined,
  todayYmd: string,
  todayDate: Date,
  minArrivalYmd?: string,
): DateRange | undefined => {
  if (!todayYmd) return range;
  const floorYmd = minArrivalYmd && minArrivalYmd > todayYmd ? minArrivalYmd : todayYmd;
  const floorDate = ymdToKstDate(floorYmd) || todayDate;
  const clicked = range?.to ?? range?.from;
  if (!clicked) {
    return { from: todayDate, to: floorDate };
  }
  const clickedYmd = toKstYmd(clicked) || "";
  if (!clickedYmd || clickedYmd < floorYmd) {
    return { from: todayDate, to: floorDate };
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
  /** 플랫폼 가이드투어 spotlight 타깃 */
  triggerDataGuideTour?: string;
  /** 신속처리: 날짜 선택 잠금 */
  locked?: boolean;
  lockedHint?: string;
  /** 팝오버 열림/닫힘 (가이드투어 등) */
  onOpenChange?: (open: boolean) => void;
  /** 후속 제작 등 — CA 직납 안내 숨김 */
  hideCaDirectShipNote?: boolean;
  /** 도움말(?) 툴팁 숨김 */
  hideHelpTooltip?: boolean;
  /** 필드 라벨. 기본 주문-치과도착 */
  label?: string;
  /** 선택 가능 최소 영업일(주문→도착). 미지정 시 오늘부터 */
  minBusinessDays?: number;
};

export function PracticeOrderArrivalDateRangeField({
  orderDate,
  arrivalDate,
  arrivalDefaultDays,
  onChange,
  className,
  triggerClassName,
  triggerDataGuideTour,
  locked = false,
  lockedHint,
  onOpenChange,
  hideCaDirectShipNote = false,
  hideHelpTooltip = false,
  label = PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL,
  minBusinessDays,
}: PracticeOrderArrivalDateRangeFieldProps) {
  const [open, setOpen] = useState(false);

  const setOpenAndNotify = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const todayYmd = useMemo(() => toKstYmd(new Date()) || "", []);
  const todayDate = useMemo(() => ymdToKstDate(todayYmd) || undefined, [todayYmd]);
  const minDays =
    typeof minBusinessDays === "number" && Number.isFinite(minBusinessDays)
      ? Math.max(0, Math.floor(minBusinessDays))
      : 0;
  const minArrivalYmd = useMemo(() => {
    if (!todayYmd || minDays <= 0) return todayYmd;
    return earliestArrivalYmdForMinBusinessDays(todayYmd, minDays);
  }, [minDays, todayYmd]);
  const minArrivalDate = useMemo(
    () => ymdToKstDate(minArrivalYmd) || todayDate,
    [minArrivalYmd, todayDate],
  );
  const isDefaultOrderArrivalLabel = label === PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL;
  const emptyPickLabel = isDefaultOrderArrivalLabel
    ? "치과도착일 선택"
    : `${label}일 선택`;
  const pickHelpNote = isDefaultOrderArrivalLabel
    ? "주문일은 오늘 고정. 치과도착일만 선택하면 됩니다."
    : `주문일은 오늘 고정. ${label}일만 선택하면 됩니다.`;

  const appliedArrivalYmd = String(arrivalDate || "").trim();
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();

  useEffect(() => {
    if (!open || !todayDate || !todayYmd) return;
    let arrivalYmd =
      appliedArrivalYmd && appliedArrivalYmd >= todayYmd
        ? appliedArrivalYmd
        : addDaysToYmd(todayYmd, arrivalDefaultDays);
    if (minArrivalYmd && arrivalYmd < minArrivalYmd) {
      arrivalYmd = minArrivalYmd;
    }
    setDraftRange({
      from: todayDate,
      to: ymdToKstDate(arrivalYmd) || minArrivalDate || todayDate,
    });
  }, [
    appliedArrivalYmd,
    arrivalDefaultDays,
    minArrivalDate,
    minArrivalYmd,
    open,
    todayDate,
    todayYmd,
  ]);

  const draftArrivalYmd = draftRange?.to
    ? toKstYmd(draftRange.to) || ""
    : draftRange?.from
      ? toKstYmd(draftRange.from) || ""
      : "";
  const draftLeadDays = getPracticeWorkPeriodDays(todayYmd, draftArrivalYmd);
  const meetsMinBusinessDays =
    minDays <= 0 ||
    (draftLeadDays != null && draftLeadDays >= minDays);
  const canApply = Boolean(
    todayYmd &&
      draftArrivalYmd &&
      draftArrivalYmd >= (minArrivalYmd || todayYmd) &&
      meetsMinBusinessDays,
  );
  const appliedOrderYmd = String(orderDate || "").trim() || todayYmd;
  const leadFromYmd = open ? todayYmd : appliedOrderYmd;
  const leadToYmd = open ? draftArrivalYmd : appliedArrivalYmd;
  const leadDays = getPracticeWorkPeriodDays(leadFromYmd, leadToYmd);

  const handleApply = () => {
    if (!canApply || !todayYmd || !draftArrivalYmd) return;
    onChange({ orderDate: todayYmd, arrivalDate: draftArrivalYmd });
    setOpenAndNotify(false);
  };

  const handleCancel = () => {
    if (!todayDate || !todayYmd) {
      setOpenAndNotify(false);
      return;
    }
    let arrivalYmd =
      appliedArrivalYmd && appliedArrivalYmd >= todayYmd
        ? appliedArrivalYmd
        : addDaysToYmd(todayYmd, arrivalDefaultDays);
    if (minArrivalYmd && arrivalYmd < minArrivalYmd) {
      arrivalYmd = minArrivalYmd;
    }
    setDraftRange({
      from: todayDate,
      to: ymdToKstDate(arrivalYmd) || minArrivalDate || todayDate,
    });
    setOpenAndNotify(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Label className="text-sm leading-none">{label}</Label>
          {hideHelpTooltip ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-muted-foreground/80 transition-colors hover:text-foreground"
                aria-label={`${label} 도움말`}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[min(100vw-2rem,36rem)] space-y-1.5 text-left text-xs leading-relaxed"
            >
              <p>{PRACTICE_ORDER_DAY_CUTOFF_NOTE}</p>
              <p>{pickHelpNote}</p>
              {minDays > 0 ? (
                <p>최소 {minDays}영업일입니다.</p>
              ) : null}
              {hideCaDirectShipNote ? null : <p>{PRACTICE_CA_DIRECT_SHIP_NOTE}</p>}
              <p>3영업일 이하는 도착이 늦을 수 있습니다.</p>
              <p>{PRACTICE_WORK_PERIOD_RECOMMEND_NOTE}</p>
            </TooltipContent>
          </Tooltip>
          )}
        </div>
        {leadDays != null && leadDays >= 0 ? (
          <PracticeWorkPeriodText
            orderDate={leadFromYmd}
            arrivalDate={leadToYmd}
            at={new Date()}
            variant="lead"
            className="shrink-0 text-xs"
          />
        ) : null}
      </div>
      <Popover
        open={locked ? false : open}
        onOpenChange={locked ? undefined : setOpenAndNotify}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={locked}
            className={cn(
              "h-11 w-full justify-between gap-2 px-3 text-left text-base font-normal",
              triggerClassName,
            )}
            data-guide-tour={triggerDataGuideTour}
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="truncate">
                {formatArrivalLabel(appliedArrivalYmd, emptyPickLabel)}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {!locked ? (
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={6}
          avoidCollisions={false}
          className="w-auto p-0"
          {...(triggerDataGuideTour
            ? { "data-guide-tour-satellite": triggerDataGuideTour }
            : {})}
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
                setDraftRange(
                  pinRangeToToday(range, todayYmd, todayDate, minArrivalYmd),
                );
              }}
              disabled={
                minArrivalDate
                  ? { before: minArrivalDate }
                  : todayDate
                    ? { before: todayDate }
                    : undefined
              }
              defaultMonth={draftRange?.to || draftRange?.from || todayDate}
              initialFocus
              classNames={{
                day_today: "bg-transparent text-foreground font-semibold",
              }}
            />
            <div className="flex w-0 min-w-full items-center justify-between gap-2 border-t px-3 py-2">
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                {draftArrivalYmd
                  ? formatArrivalLabel(draftArrivalYmd, emptyPickLabel)
                  : emptyPickLabel}
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
        ) : null}
      </Popover>
      {locked && lockedHint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{lockedHint}</p>
      ) : null}
    </div>
  );
}
