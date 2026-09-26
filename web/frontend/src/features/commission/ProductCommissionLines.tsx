import { formatMoney } from "@/features/commission/useCommissionDashboard";
import { cn } from "@/shared/ui/cn";

/** 딜러 수수료를 심플웨이·커스텀어벗으로 나눠 보여 준다. */
export function ProductCommissionLines({
  simpleway,
  customAbutment,
  className,
}: {
  simpleway: number;
  customAbutment: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5 text-xs tabular-nums", className)}>
      <div>심플웨이 {formatMoney(simpleway)}원</div>
      <div>커스텀어벗 {formatMoney(customAbutment)}원</div>
    </div>
  );
}
