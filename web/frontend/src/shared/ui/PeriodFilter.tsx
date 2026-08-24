// change-log:
// - 2026-08-20: 기본 프리셋은 30일·이번달만. 90일·지난달은 표시하지 않음.
// - 2026-08-20: useStoreCustomRange=false여도 로컬 커스텀 기간으로 달력·chevron을 켠다.
// - 2026-08-20: 기간 달력 좌·우 chevron — 현재 선택 기간을 한 달 앞/뒤로 옮긴다.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/store/usePeriodStore.ts
// - web/frontend/src/shared/date/kst.ts
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";
import type { PeriodFilterValue } from "@/shared/ui/periodFilterValues";
import { periodToRange, usePeriodStore } from "@/store/usePeriodStore";
import { toKstYmd, ymdToKstDate, kstAddCivilMonths } from "@/shared/date/kst";

export type { PeriodFilterValue } from "@/shared/ui/periodFilterValues";

type Props = {
  value: PeriodFilterValue;
  onChange: (value: PeriodFilterValue) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomRangeChange?: (range: { startDate: string; endDate: string }) => void;
  onClearCustomRange?: () => void;
  /** false면 전역 스토어 커스텀 날짜를 쓰지 않음 (로컬 period 전용) */
  useStoreCustomRange?: boolean;
  /** 표시할 프리셋. 미지정 시 30일·이번달 */
  presets?: PeriodFilterValue[];
  label?: string;
  className?: string;
};

const DEFAULT_PRESET_PERIODS: PeriodFilterValue[] = ["30d", "thisMonth"];

const labelMap: Record<PeriodFilterValue, string> = {
  "7d": "7일",
  "30d": "30일",
  "90d": "90일",
  "180d": "180일",
  thisMonth: "이번달",
  lastMonth: "지난달",
};

const formatRangeLabel = (startYmd: string, endYmd: string) => {
  const start = ymdToKstDate(startYmd);
  const end = ymdToKstDate(endYmd);
  if (!start || !end) return "기간 선택";
  const startLabel = format(start, "M월 d일", { locale: ko });
  const endLabel = format(end, "M월 d일", { locale: ko });
  if (startYmd === endYmd) return startLabel;
  return `${startLabel} – ${endLabel}`;
};

const ymdFromDate = (date: Date) => toKstYmd(date) || "";

export const PeriodFilter = ({
  value,
  onChange,
  customStartDate,
  customEndDate,
  onCustomRangeChange,
  onClearCustomRange,
  useStoreCustomRange = true,
  presets = DEFAULT_PRESET_PERIODS,
  label = "",
  className,
}: Props) => {
  const {
    customStartDate: storeStart,
    customEndDate: storeEnd,
    setCustomDateRange,
    clearCustomDateRange,
  } = usePeriodStore();

  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();
  const [localStart, setLocalStart] = useState("");
  const [localEnd, setLocalEnd] = useState("");

  const effectiveStart =
    customStartDate !== undefined
      ? customStartDate
      : useStoreCustomRange
        ? storeStart
        : localStart;
  const effectiveEnd =
    customEndDate !== undefined
      ? customEndDate
      : useStoreCustomRange
        ? storeEnd
        : localEnd;

  const setLocalCustom = (range: { startDate: string; endDate: string }) => {
    setLocalStart(range.startDate);
    setLocalEnd(range.endDate);
  };

  const setCustom =
    onCustomRangeChange ??
    (useStoreCustomRange ? setCustomDateRange : setLocalCustom);
  const clearCustom =
    onClearCustomRange ??
    (useStoreCustomRange
      ? clearCustomDateRange
      : () => {
          setLocalStart("");
          setLocalEnd("");
        });

  const hasCustomRange = Boolean(
    String(effectiveStart || "").trim() && String(effectiveEnd || "").trim(),
  );

  const appliedRange = useMemo(() => {
    if (hasCustomRange) {
      return {
        startYmd: String(effectiveStart).trim(),
        endYmd: String(effectiveEnd).trim(),
      };
    }
    const range = periodToRange(value, {
      customStartDate: "",
      customEndDate: "",
    });
    return {
      startYmd: toKstYmd(range.startDate) || "",
      endYmd: toKstYmd(range.endDate) || "",
    };
  }, [effectiveEnd, effectiveStart, hasCustomRange, value]);

  useEffect(() => {
    if (!open) return;
    setDraftRange({
      from: ymdToKstDate(appliedRange.startYmd) || undefined,
      to: ymdToKstDate(appliedRange.endYmd) || undefined,
    });
  }, [appliedRange.endYmd, appliedRange.startYmd, open]);

  const hasLabel = typeof label === "string" && label.trim().length > 0;
  const draftStartYmd = draftRange?.from ? ymdFromDate(draftRange.from) : "";
  const draftEndYmd = draftRange?.to
    ? ymdFromDate(draftRange.to)
    : draftStartYmd;
  const customEnabled = typeof setCustom === "function";
  const canApply = Boolean(customEnabled && draftStartYmd && draftEndYmd);

  const handlePresetClick = (next: PeriodFilterValue) => {
    clearCustom?.();
    onChange(next);
  };

  const handleShiftMonths = (delta: number) => {
    if (!setCustom) return;
    const start = kstAddCivilMonths(appliedRange.startYmd, delta);
    const end = kstAddCivilMonths(appliedRange.endYmd, delta);
    if (!start || !end) return;
    setCustom({
      startDate: start <= end ? start : end,
      endDate: start <= end ? end : start,
    });
  };

  const handleApply = () => {
    if (!canApply || !setCustom) return;
    setCustom({
      startDate: draftStartYmd,
      endDate: draftEndYmd,
    });
    setOpen(false);
  };

  const handleCancel = () => {
    setDraftRange({
      from: ymdToKstDate(appliedRange.startYmd) || undefined,
      to: ymdToKstDate(appliedRange.endYmd) || undefined,
    });
    setOpen(false);
  };

  const rangeLabel = formatRangeLabel(
    appliedRange.startYmd,
    appliedRange.endYmd,
  );

  const rangeTriggerClassName = cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] leading-none transition-colors",
    hasCustomRange || open
      ? "bg-primary text-primary-foreground"
      : "bg-background text-muted-foreground hover:bg-muted",
  );

  const chevronButtonClassName = cn(
    "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted",
    hasCustomRange ? "bg-background/80 hover:bg-background" : "bg-background",
  );

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted p-1 text-xs",
        className,
      )}
    >
      {hasLabel && <span className="px-2 text-muted-foreground">{label}</span>}

      <div className="inline-flex items-center gap-0.5">
        {customEnabled ? (
          <button
            type="button"
            aria-label="전달"
            onClick={() => handleShiftMonths(-1)}
            className={chevronButtonClassName}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : null}

        {customEnabled ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={rangeTriggerClassName}>
                <CalendarIcon className="h-3.5 w-3.5 opacity-80" />
                <span>{rangeLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto p-0"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="border-b px-3 py-2 text-[11px] text-muted-foreground">
                시작일 0시 ~ 종료일 24시(KST) 기준으로 적용됩니다.
              </div>
              <Calendar
                mode="range"
                numberOfMonths={1}
                selected={draftRange}
                onSelect={setDraftRange}
                defaultMonth={draftRange?.from || draftRange?.to}
                initialFocus
              />
              <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={handleCancel}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  적용
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <div className={rangeTriggerClassName}>
            <CalendarIcon className="h-3.5 w-3.5 opacity-80" />
            <span>{rangeLabel}</span>
          </div>
        )}

        {customEnabled ? (
          <button
            type="button"
            aria-label="다음달"
            onClick={() => handleShiftMonths(1)}
            className={chevronButtonClassName}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {presets.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => handlePresetClick(k)}
          className={cn(
            "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] leading-none transition-colors",
            !hasCustomRange && value === k
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          {labelMap[k]}
        </button>
      ))}
    </div>
  );
};
