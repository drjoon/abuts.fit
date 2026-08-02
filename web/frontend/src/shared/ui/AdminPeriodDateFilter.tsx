import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { CalendarX2 } from "lucide-react";

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
  const startDate = customStartDate || "";
  const endDate = customEndDate || "";

  const applyRange = (next: { startDate?: string; endDate?: string }) => {
    const s = next.startDate ?? startDate;
    const e = next.endDate ?? endDate;
    if (s && e) {
      onCustomRangeChange({ startDate: s, endDate: e });
      return;
    }
    onClearCustomRange();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodFilter
        value={period}
        onChange={(nextPeriod) => {
          onPeriodChange(nextPeriod);
          onClearCustomRange();
        }}
      />
      <Input
        type="date"
        value={startDate}
        onChange={(e) => applyRange({ startDate: e.target.value })}
        className="h-9 w-[150px]"
      />
      <span className="text-xs text-muted-foreground">~</span>
      <Input
        type="date"
        value={endDate}
        onChange={(e) => applyRange({ endDate: e.target.value })}
        className="h-9 w-[150px]"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9"
        onClick={onClearCustomRange}
        title="임의 날짜 필터 해제"
      >
        <CalendarX2 className="mr-1 h-4 w-4" />
        날짜 초기화
      </Button>
    </div>
  );
}
