// related files:
// - web/frontend/src/shared/demo/creditUsageScope.ts
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/requestor/credits/components/CreditStatisticsTab.tsx
// - web/frontend/src/index.css
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import type { CreditUsageScopeSelection } from "@/shared/demo/creditUsageScope";
import { markCreditUsageScopeGuideSeen } from "@/shared/demo/creditUsageScope";

type CreditUsageScopeFilterProps = {
  value: CreditUsageScopeSelection;
  onChange: (next: CreditUsageScopeSelection) => void;
  /** 데모 내역이 있을 때만 깜빡임 안내 */
  pulse?: boolean;
  className?: string;
};

const HINT =
  "데모와 실사용(유료·일반 무료)을 구분해 보세요. 실사용만 보면 잔액 수식과 맞습니다. 기공소의 데모 적립 보류는 잔액에 아직 반영되지 않습니다.";

export function CreditUsageScopeFilter({
  value,
  onChange,
  pulse = false,
  className,
}: CreditUsageScopeFilterProps) {
  const dismissGuide = () => {
    if (pulse) markCreditUsageScopeGuideSeen();
  };

  const setIncludeReal = (checked: boolean) => {
    dismissGuide();
    onChange({ ...value, includeReal: checked });
  };
  const setIncludeDemo = (checked: boolean) => {
    dismissGuide();
    onChange({ ...value, includeDemo: checked });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex h-9 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3",
            pulse && "credit-usage-scope-guide-pulse",
            className,
          )}
          role="group"
          aria-label="데모·실사용 구분"
        >
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 sm:text-sm">
            <Checkbox
              checked={value.includeReal}
              onCheckedChange={(v) => setIncludeReal(v === true)}
              aria-label="실사용"
            />
            실사용
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 sm:text-sm">
            <Checkbox
              checked={value.includeDemo}
              onCheckedChange={(v) => setIncludeDemo(v === true)}
              aria-label="데모"
            />
            데모
          </label>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[min(100vw-2rem,22rem)]">
        {HINT}
      </TooltipContent>
    </Tooltip>
  );
}
