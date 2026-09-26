import { formatMoney } from "@/features/commission/useCommissionDashboard";
import {
  DEALERSHIP_CUSTOM_ABUTMENT_COMMISSION_PCT,
  DEALERSHIP_SIMPLEWAY_COMMISSION_PCT,
} from "@/shared/sales/dealershipPolicyCopy";
import { cn } from "@/shared/ui/cn";

/** 딜러 수수료를 심플웨이 10% · 커스텀어벗 20%로 나눠 보여 준다. */
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
      <div>
        심플웨이 {DEALERSHIP_SIMPLEWAY_COMMISSION_PCT}% · {formatMoney(simpleway)}원
      </div>
      <div>
        커스텀어벗 {DEALERSHIP_CUSTOM_ABUTMENT_COMMISSION_PCT}% · {formatMoney(customAbutment)}원
      </div>
    </div>
  );
}
