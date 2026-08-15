// related files:
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-15: 기공기간 5일 미만 시 빨간 표시·거부 가능 툴팁.

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  PRACTICE_WORK_PERIOD_SHORT_TOOLTIP,
  formatPracticeWorkPeriodDaysLabel,
  formatPracticeWorkPeriodLeadLabel,
  getPracticeWorkPeriodDays,
  isPracticeWorkPeriodShort,
} from "@/shared/practice/practiceWorkPeriod";

type PracticeWorkPeriodTextProps = {
  orderDate?: string | null;
  arrivalDate?: string | null;
  /** lead: +N일(폼). days: N일(목록/상세). labeled: 기공기간 N일 */
  variant?: "lead" | "days" | "labeled";
  className?: string;
};

export function PracticeWorkPeriodText({
  orderDate,
  arrivalDate,
  variant = "days",
  className,
}: PracticeWorkPeriodTextProps) {
  const days = getPracticeWorkPeriodDays(orderDate, arrivalDate);
  const short = isPracticeWorkPeriodShort(days);
  const daysLabel =
    variant === "lead"
      ? formatPracticeWorkPeriodLeadLabel(days)
      : formatPracticeWorkPeriodDaysLabel(days);
  if (!daysLabel) return null;

  const label = variant === "labeled" ? `기공기간 ${daysLabel}` : daysLabel;
  const text = (
    <span
      className={cn(
        "tabular-nums",
        short ? "font-medium text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );

  if (!short) return text;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{text}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left text-xs leading-relaxed">
        {PRACTICE_WORK_PERIOD_SHORT_TOOLTIP}
      </TooltipContent>
    </Tooltip>
  );
}
