// change-log:
// - 2026-10-20: 의뢰할 파일이 있으면 의뢰하기 버튼 하이라이트를 깜빡인다(scroll-halo-blue).
// - 2026-10-13: 택배 배송(기본)·딜리버리 배송(월 100건 이상) 두 카드 복구. 요일 선택 제거. 방식은 딜러·영업팀·관리자가 지정하므로 카드는 읽기 전용.
// - 2026-10-09: 진행 도안을 오늘 의뢰 → 바로 생산 → 내일 도착으로, 제목을 익일 도착 딜리버리로.
// - 2026-10-08: 택배 묶음 출고 폐지. 딜리버리 익일 도착만 남기고(배송비는 딜러/어벗츠 부담) 상단에 진행 도안 추가.
// - 2026-10-06: 택배 묶음 출고(박스당 배송비)·딜리버리 익일 도착(월 정액 VAT 포함).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/shipping/shippingPolicyCopy.ts
// - web/backend/controllers/requests/expressSelectable.utils.js
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Package, Zap } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  BULK_SHIPPING_LABEL,
  DELIVERY_CONDITION_LINE,
  DELIVERY_ARRIVAL_LINE,
  EXPRESS_SHIPPING_LABEL,
  PARCEL_SHIPPING_DEFAULT_LINE,
  PARCEL_SHIPPING_LINE,
} from "@/shared/shipping/shippingPolicyCopy";

type ShippingMode = "normal" | "express";

type Props = {
  disabled?: boolean;
  /** 거래처에 지정된 배송 방식(딜러·영업팀·관리자가 정함). */
  defaultShippingMode: ShippingMode;
  /** 의뢰할 파일이 있으면 버튼 하이라이트를 깜빡인다. */
  highlight?: boolean;
  onSubmit: () => void;
};

function ModeCard({
  active,
  icon,
  title,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={active}
      aria-readonly
      className={cn(
        "w-full space-y-2 rounded-lg border bg-white/70 px-4 py-4 text-center",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/25"
          : "border-slate-200 text-slate-500",
      )}
    >
      <div className="flex items-center justify-center gap-2 text-base font-medium text-foreground">
        {icon}
        {title}
      </div>
      <div className="text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export function NewRequestShippingSection({
  disabled,
  defaultShippingMode,
  highlight,
  onSubmit,
}: Props) {
  const isDisabled = !!disabled;
  const isExpress = defaultShippingMode === "express";

  return (
    <div className="app-glass-card app-glass-card--lg relative flex flex-1 min-h-0 h-full flex-col gap-4 border-2 p-5 md:p-7 transition-all border-gray-300">
      <div className="app-glass-card-content flex min-h-0 flex-1 flex-col items-center justify-start gap-3 overflow-y-auto px-3 py-3">
        <div
          className="flex w-full flex-col gap-4"
          role="radiogroup"
          aria-label="배송 방식"
        >
          <ModeCard
            active={!isExpress}
            icon={<Package className="h-5 w-5 text-primary" />}
            title={BULK_SHIPPING_LABEL}
          >
            {PARCEL_SHIPPING_LINE}
            <br />
            {PARCEL_SHIPPING_DEFAULT_LINE}
          </ModeCard>

          <ModeCard
            active={isExpress}
            icon={<Zap className="h-5 w-5 text-accent" />}
            title={EXPRESS_SHIPPING_LABEL}
          >
            {DELIVERY_ARRIVAL_LINE}
            <br />
            {DELIVERY_CONDITION_LINE}
          </ModeCard>
        </div>
      </div>

      <div className="app-glass-card-content mt-auto shrink-0 px-2">
        <div className="flex justify-center">
          <Button
            type="button"
            onClick={onSubmit}
            size="lg"
            className={cn(
              "mx-auto w-full text-lg sm:w-1/2",
              highlight &&
                !isDisabled &&
                "animate-scroll-halo-blue motion-reduce:animate-none",
            )}
            disabled={isDisabled}
          >
            {isDisabled ? "접수 중..." : "의뢰하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
