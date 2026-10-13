// change-log:
// - 2026-10-13: 거래처 배송 방식(택배/딜리버리) 선택. 딜러·영업팀 거래처 카드와 관리자 대시보드 공통.
// related files:
// - web/frontend/src/shared/sales/CustomerShippingFields.tsx
// - web/frontend/src/pages/admin/dashboard/RequestorShippingModeCard.tsx
// - web/frontend/src/shared/shipping/shippingPolicyCopy.ts
import { cn } from "@/shared/ui/cn";
import {
  BULK_SHIPPING_LABEL_SHORT,
  EXPRESS_SHIPPING_LABEL_SHORT,
} from "@/shared/shipping/shippingPolicyCopy";

export type RequestorShippingMode = "normal" | "express";

const OPTIONS: { value: RequestorShippingMode; label: string }[] = [
  { value: "normal", label: BULK_SHIPPING_LABEL_SHORT },
  { value: "express", label: EXPRESS_SHIPPING_LABEL_SHORT },
];

export function ShippingModeToggle({
  value,
  onChange,
  disabled,
  size = "md",
  ariaLabel = "배송 방식",
}: {
  value: RequestorShippingMode;
  onChange: (next: RequestorShippingMode) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(opt.value);
            }}
            className={cn(
              "rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-1.5 text-sm",
              active
                ? "bg-white text-primary shadow-sm ring-1 ring-primary/30"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
