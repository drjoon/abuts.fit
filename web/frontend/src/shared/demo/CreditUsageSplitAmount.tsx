// related files:
// - web/frontend/src/shared/demo/creditUsageScope.ts
// - web/frontend/src/shared/demo/CreditUsageScopeFilter.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/requestor/credits/components/CreditStatisticsTab.tsx
import { formatWon } from "@/shared/settlement/affiliateVat";
import { cn } from "@/shared/ui/cn";

/** 요약 카드·잔액 — 실사용/데모 2줄 금액 */
export function CreditUsageSplitAmount({
  real,
  demo,
  className,
}: {
  real: number;
  demo: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 text-base leading-tight sm:text-lg",
        className,
      )}
    >
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-500">실사용</span>
        <span>{formatWon(real)}</span>
      </div>
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-500">데모</span>
        <span>{formatWon(demo)}</span>
      </div>
    </div>
  );
}
