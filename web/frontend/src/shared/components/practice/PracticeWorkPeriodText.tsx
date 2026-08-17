// related files:
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-17: N+2 의미 툴팁 가로폭 확대(문장 한 줄 유지).
// - 2026-08-17: N+2 의미 툴팁 줄바꿈(whitespace-pre-line).
// - 2026-08-17: 신속 구간 lead도 경고색·배송일정 툴팁(확인 모달 SSOT).
// - 2026-08-15: 기공기간 5일 미만 시 빨간 표시·거부 가능 툴팁.
// - 2026-08-15: 치과·기공소 툴팁 문구 분리.
// - 2026-08-15: 작업기간 영업일 표기(+N영업일 / N영업일).
// - 2026-08-15: 작업+배송기간 표기(3+2영업일).
// - 2026-08-15: 주문-치과도착 + 1+2영업일(카드/필드). lead 앞 + 제거.
// - 2026-08-15: N+2영업일 의미 툴팁 상시(짧은 기간 경고 병기).

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
  getPracticeWorkPeriodTooltip,
  isPracticeRushPeriod,
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
  const rush = isPracticeRushPeriod(days);
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
        short || rush
          ? "font-medium text-destructive"
          : "text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{text}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[min(100vw-2rem,36rem)] whitespace-pre-line text-left text-xs leading-relaxed"
      >
        {getPracticeWorkPeriodTooltip(viewer, days)}
      </TooltipContent>
    </Tooltip>
  );
}
