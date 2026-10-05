// change-log:
// - 2026-10-05: 개발운영 5% 라벨도 같이 씀.
// - 2026-10-05: 커스텀어벗 10~20% 누적 구간만. 심플웨이 지급 없음.
import { formatMoney } from "@/features/commission/useCommissionDashboard";
import { DEALERSHIP_BAND_RANGE_LABEL } from "@/shared/sales/dealershipPolicyCopy";
import { cn } from "@/shared/ui/cn";

/** 커스텀어벗 수수료 한 줄. */
export function ProductCommissionLines({
  customAbutment,
  rateLabel = DEALERSHIP_BAND_RANGE_LABEL,
  className,
}: {
  customAbutment: number;
  rateLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-xs tabular-nums", className)}>
      커스텀어벗 {rateLabel} · {formatMoney(customAbutment)}원
    </div>
  );
}
