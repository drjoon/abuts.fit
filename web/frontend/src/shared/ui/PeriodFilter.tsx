// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
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
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";

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
  /** 표시할 프리셋. 미지정 시 30일/90일/이번달/지난달 전부 */
  presets?: PeriodFilterValue[];
  label?: string;
  className?: string;
};

const DEFAULT_PRESET_PERIODS: PeriodFilterValue[] = [
  "30d",
  "90d",
  "thisMonth",
  "lastMonth",
];

const labelMap: Record<PeriodFilterValue, string> = {
  "30d": "30일",
  "90d": "90일",
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

  const effectiveStart =
    customStartDate !== undefined
      ? customStartDate
      : useStoreCustomRange
        ? storeStart
        : "";
  const effectiveEnd =
    customEndDate !== undefined
      ? customEndDate
      : useStoreCustomRange
        ? storeEnd
        : "";

  const setCustom =
    onCustomRangeChange ??
    (useStoreCustomRange ? setCustomDateRange : undefined);
  const clearCustom =
    onClearCustomRange ??
    (useStoreCustomRange ? clearCustomDateRange : undefined);

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

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted p-1 text-xs",
        className,
      )}
    >
      {hasLabel && <span className="px-2 text-muted-foreground">{label}</span>}

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
