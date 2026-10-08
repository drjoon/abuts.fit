// change-log:
// - 2026-10-09: 진행 도안을 오늘 의뢰 → 바로 생산 → 내일 도착으로, 제목을 익일 도착 딜리버리로.
// - 2026-10-08: 택배 묶음 출고 폐지. 딜리버리 익일 도착만 남기고(배송비는 딜러/어벗츠 부담) 상단에 진행 도안 추가.
// - 2026-10-06: 택배 묶음 출고(박스당 배송비)·딜리버리 익일 도착(월 정액 VAT 포함).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/shipping/shippingPolicyCopy.ts
import { Button } from "@/components/ui/button";
import { ClipboardList, Cog, Truck, Zap } from "lucide-react";
import {
  DELIVERY_FREE_LINE,
  EXPRESS_SHIPPING_ARRIVAL_LINE,
} from "@/shared/shipping/shippingPolicyCopy";

type Props = {
  disabled?: boolean;
  onSubmit: () => void;
};

const CARD_TITLE = "익일 도착 딜리버리";

const STEPS = [
  { key: "order", label: "오늘 의뢰", Icon: ClipboardList },
  { key: "make", label: "바로 생산", Icon: Cog },
  { key: "arrive", label: "내일 도착", Icon: Truck },
] as const;

export function NewRequestShippingSection({ disabled, onSubmit }: Props) {
  const isDisabled = !!disabled;

  return (
    <div className="app-glass-card app-glass-card--lg relative flex flex-1 min-h-0 h-full flex-col gap-4 border-2 p-5 md:p-7 transition-all border-gray-300">
      <div className="app-glass-card-content flex min-h-0 flex-1 flex-col items-center justify-start gap-4 overflow-y-auto p-2">
        <div
          className="flex w-full items-start justify-center gap-1 rounded-lg bg-slate-50 px-2 py-4"
          aria-label="오늘 의뢰, 바로 생산, 내일 도착"
        >
          {STEPS.map(({ key, label, Icon }, i) => (
            <div key={key} className="flex items-start">
              <div className="flex w-[5.75rem] flex-col items-center gap-1.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-center text-xs font-medium leading-snug text-slate-600">
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className="mt-[1.375rem] h-px w-4 -translate-y-1/2 border-t border-dashed border-slate-300"
                />
              ) : null}
            </div>
          ))}
        </div>

        <div className="w-full space-y-3 rounded-lg border border-primary bg-primary/5 px-4 py-4 text-center ring-2 ring-primary/25">
          <div className="flex items-center justify-center gap-2 text-base font-medium text-foreground">
            <Zap className="h-5 w-5 text-accent" />
            {CARD_TITLE}
          </div>
          <div className="text-base leading-relaxed text-foreground">
            {EXPRESS_SHIPPING_ARRIVAL_LINE}
          </div>
          <div className="text-sm leading-relaxed text-slate-600">
            {DELIVERY_FREE_LINE}
          </div>
        </div>
      </div>

      <div className="app-glass-card-content mt-auto shrink-0 px-2">
        <div className="flex justify-center">
          <Button
            type="button"
            onClick={onSubmit}
            size="lg"
            className="mx-auto w-full text-lg sm:w-1/2"
            disabled={isDisabled}
          >
            {isDisabled ? "접수 중..." : "의뢰하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
