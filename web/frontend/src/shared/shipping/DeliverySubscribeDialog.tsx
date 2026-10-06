// change-log:
// - 2026-10-06: 딜리버리 익일 도착 월 가입 신청 모달. 미계약이라 추후 서비스 안내만.
// related files:
// - web/frontend/src/shared/shipping/shippingPolicyCopy.ts
// - web/frontend/src/pages/requestor/new_request/components/NewRequestShippingSection.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAbutsManwon } from "@/shared/pricing/abutsAbutmentService";
import {
  GUIDE_DIALOG_BODY_CLASS,
  GUIDE_DIALOG_HEADER_CLASS,
} from "@/shared/settlement/settlementUi";
import {
  DELIVERY_SUBSCRIBE_COMING_SOON_LINE,
  DELIVERY_SUBSCRIBE_CREDIT_LINE,
  DELIVERY_SUBSCRIBE_PERIOD_LINE,
  EXPRESS_SHIPPING_ARRIVAL_LINE,
  EXPRESS_SHIPPING_LABEL,
  resolveDeliveryNextDayMonthlyFee,
} from "@/shared/shipping/shippingPolicyCopy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthlyFee?: number | null;
};

export function DeliverySubscribeDialog({
  open,
  onOpenChange,
  monthlyFee,
}: Props) {
  const fee = resolveDeliveryNextDayMonthlyFee(monthlyFee);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden border-slate-200/80 p-0 shadow-xl sm:max-w-md sm:rounded-2xl">
        <DialogHeader className={GUIDE_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
            {EXPRESS_SHIPPING_LABEL} 가입
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {EXPRESS_SHIPPING_ARRIVAL_LINE}
          </DialogDescription>
        </DialogHeader>
        <div className={GUIDE_DIALOG_BODY_CLASS}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-slate-600">월 정액</div>
            <div className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatAbutsManwon(fee)}
            </div>
          </div>
          <p className="text-xs text-slate-500">VAT 포함</p>
          <p className="text-sm leading-relaxed text-slate-600">
            {DELIVERY_SUBSCRIBE_PERIOD_LINE}
            <br />
            {DELIVERY_SUBSCRIBE_CREDIT_LINE}
            <br />
            {DELIVERY_SUBSCRIBE_COMING_SOON_LINE}
          </p>
        </div>
        <DialogFooter className="shrink-0 border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" onClick={() => onOpenChange(false)}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
