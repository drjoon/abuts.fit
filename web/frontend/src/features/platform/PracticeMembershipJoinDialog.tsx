// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/backend/controllers/businesses/business.update.controller.js
// change-log:
// - 2026-08-13: 치과 멤버십 가입 모달. 월 구독료·단가 안내 후 바로 가입.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings,
} from "@/hooks/useSystemSettings";
import { useAbutsAbutmentPricingTier } from "@/shared/pricing/useAbutsAbutmentPricingTier";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { invalidateBusinessMeCache } from "@/shared/components/business/settings/business/businessMeCache";
import { notifyRequestorAccessUpdated } from "@/shared/business/requestorCapabilities";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  formatAbutsAbutmentServiceWon,
  formatAbutsManwon,
} from "@/shared/pricing/abutsAbutmentService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const PracticeMembershipJoinDialog = ({
  open,
  onOpenChange,
}: Props) => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { data: systemSettings } = useSystemSettings();
  const abutmentPricingTier = useAbutsAbutmentPricingTier();
  const isMember = abutmentPricingTier === "membership";
  const [submitting, setSubmitting] = useState(false);

  const monthlyFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.practiceMembershipMonthlyFee ??
        CREDIT_SETTINGS_DEFAULTS.practiceMembershipMonthlyFee ??
        ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
    ) || ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  );

  const handleJoin = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const res = await request<{
        success?: boolean;
        message?: string;
      }>({
        path: "/api/businesses/me/practice-membership",
        method: "POST",
        token,
        jsonBody: { active: true },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "멤버십 가입에 실패했습니다.");
      }
      invalidateBusinessMeCache({
        token,
        businessType: resolveBusinessType(user?.role, "requestor") || "requestor",
      });
      notifyRequestorAccessUpdated();
      toast({
        title: "멤버십 가입 완료",
        description: "커스텀어벗 멤버십 단가가 적용됩니다.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "멤버십 가입 실패",
        description:
          error instanceof Error
            ? error.message
            : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="z-[110] max-w-sm gap-5 sm:rounded-2xl"
          overlayClassName="z-[110]"
        >
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-xl tracking-tight">
            치과 멤버십
          </DialogTitle>
          <DialogDescription>
            월 구독료로 커스텀어벗 멤버십 단가를 적용합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3.5">
            <p className="text-xs text-slate-500">월 구독료</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatAbutsAbutmentServiceWon(monthlyFee)}
            </p>
            <p className="mt-1 text-xs text-slate-500">매월 구독료 자동 결제</p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">멤버십 단가 · 1개당</p>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-600">생산만</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatAbutsManwon(ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-600">디자인+생산</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatAbutsManwon(
                  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
                )}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          {isMember ? (
            <Button type="button" className="w-full" disabled>
              이용 중
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={submitting}
              onClick={() => void handleJoin()}
            >
              {submitting ? "가입 중…" : "멤버십 가입"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
