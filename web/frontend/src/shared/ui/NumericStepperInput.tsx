// related files:
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// - web/frontend/src/shared/sales/CustomerPriceDialog.tsx
// change-log:
// - 2026-10-09: 어벗 규격 스피너를 공통으로 옮기고, 최소·최대를 둔다.
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";

function formatSteppedNumber(n: number, step: number) {
  const decimals = String(step).includes(".")
    ? String(step).split(".")[1]?.length || 0
    : 0;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

function stepNumericValue(
  raw: string,
  step: number,
  direction: 1 | -1,
  min: number,
  max?: number,
) {
  const current = Number.parseFloat(String(raw || "").replace(/,/g, "").trim());
  const base = Number.isFinite(current) ? current : min;
  let next = Math.round((base + direction * step) * 1000) / 1000;
  next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return formatSteppedNumber(next, step);
}

/** 오른쪽 ▲▼ 스피너. 클릭은 step 단위, 직접 입력은 step 제한 없음. */
export function NumericStepperInput({
  value,
  onValueChange,
  step,
  min = 0,
  max,
  placeholder,
  className,
  disabled,
  ariaLabel,
  ariaInvalid,
}: {
  value: string;
  onValueChange: (next: string) => void;
  /** 스피너 클릭 단위. */
  step: number;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaInvalid?: boolean;
}) {
  const current = Number.parseFloat(String(value || "").replace(/,/g, "").trim());
  const atMin = Number.isFinite(current) && current <= min;
  const atMax = max != null && Number.isFinite(current) && current >= max;

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={cn(
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <div className="absolute inset-y-1 right-1 flex w-6 flex-col overflow-hidden rounded border border-slate-200 bg-white">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || atMax}
          className="flex h-1/2 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40"
          aria-label="값 증가"
          onClick={() => onValueChange(stepNumericValue(value, step, 1, min, max))}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || atMin}
          className="flex h-1/2 items-center justify-center border-t border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40"
          aria-label="값 감소"
          onClick={() => onValueChange(stepNumericValue(value, step, -1, min, max))}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
