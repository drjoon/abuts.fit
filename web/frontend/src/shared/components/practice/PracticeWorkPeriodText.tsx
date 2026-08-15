// related files:
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-15: 기공기간 5일 미만 시 빨간 표시·거부 가능 툴팁.
// - 2026-08-15: 치과·기공소 툴팁 문구 분리.
// - 2026-08-15: 작업기간 영업일 표기(+N영업일 / N영업일).
// - 2026-08-15: 작업+배송기간 표기(3+2영업일).
// - 2026-08-15: 주문-치과도착 + 1+2영업일(카드/필드). lead 앞 + 제거.

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL,
  formatPracticeWorkPeriodDaysLabel,
  formatPracticeWorkPeriodLeadLabel,
  getPracticeWorkPeriodDays,
  getPracticeWorkPeriodShortTooltip,
  isPracticeWorkPeriodShort,
  type PracticeWorkPeriodViewer,
} from "@/shared/practice/practiceWorkPeriod";

type PracticeWorkPeriodTextProps = {
  orderDate?: string | null;
  arrivalDate?: string | null;
  /**
   * lead: 1+2영업일(폼 라벨 옆).
   * days: 1+2영업일.
   * labeled: 작업+배송기간 1+2영업일.
   * orderArrival: 주문-치과도착 · 1+2영업일(목록 카드).
   */
  variant?: "lead" | "days" | "labeled" | "orderArrival";
  /** practice=치과 발신, lab=기공소 수신 */
  viewer?: PracticeWorkPeriodViewer;
  className?: string;
};

export function PracticeWorkPeriodText({
  orderDate,
  arrivalDate,
  variant = "days",
  viewer = "practice",
  className,
}: PracticeWorkPeriodTextProps) {
  const days = getPracticeWorkPeriodDays(orderDate, arrivalDate);
  const short = isPracticeWorkPeriodShort(days);
  const daysLabel =
    variant === "lead"
      ? formatPracticeWorkPeriodLeadLabel(days)
      : formatPracticeWorkPeriodDaysLabel(days);
  if (!daysLabel) return null;

  const label =
    variant === "orderArrival"
      ? `${PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL} · ${daysLabel}`
      : variant === "labeled"
        ? `작업+배송기간 ${daysLabel}`
        : daysLabel;
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
        {getPracticeWorkPeriodShortTooltip(viewer)}
      </TooltipContent>
    </Tooltip>
  );
}
