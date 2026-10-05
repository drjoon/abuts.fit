// change-log:
// - 2026-10-05: 커스텀어벗 10~20% 누적 구간만. 심플웨이 지급 없음.
import { formatMoney } from "@/features/commission/useCommissionDashboard";
import { DEALERSHIP_BAND_RANGE_LABEL } from "@/shared/sales/dealershipPolicyCopy";
import { cn } from "@/shared/ui/cn";

/** 딜러 수수료 — 커스텀어벗만. */
export function ProductCommissionLines({
  customAbutment,
  className,
}: {
  customAbutment: number;
  className?: string;
}) {
  return (
    <div className={cn("text-xs tabular-nums", className)}>
      커스텀어벗 {DEALERSHIP_BAND_RANGE_LABEL} · {formatMoney(customAbutment)}원
    </div>
  );
}
