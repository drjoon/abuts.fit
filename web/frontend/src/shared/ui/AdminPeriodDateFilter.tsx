import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";

type AdminPeriodDateFilterProps = {
  period: PeriodFilterValue;
  onPeriodChange: (period: PeriodFilterValue) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomRangeChange: (range: { startDate: string; endDate: string }) => void;
  onClearCustomRange: () => void;
};

export function AdminPeriodDateFilter({
  period,
  onPeriodChange,
  customStartDate,
  customEndDate,
  onCustomRangeChange,
  onClearCustomRange,
}: AdminPeriodDateFilterProps) {
  return (
    <PeriodFilter
      value={period}
      onChange={onPeriodChange}
      customStartDate={customStartDate}
      customEndDate={customEndDate}
      onCustomRangeChange={onCustomRangeChange}
      onClearCustomRange={onClearCustomRange}
    />
  );
}
