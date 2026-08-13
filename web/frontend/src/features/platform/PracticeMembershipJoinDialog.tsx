// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/backend/controllers/businesses/business.update.controller.js
// change-log:
// - 2026-08-13: 생산·디자인+생산 단가를 creditSettings에서 읽음.
// - 2026-08-13: 해지·해지 취소 안내를 상단 대신 버튼 툴팁으로.
// - 2026-08-13: 단가 글자 확대. 생산 2.0→1.5만, 디자인+생산 4.0→2.5만.
// - 2026-08-13: 이용 중 해지 예약. 다음 결제일까지 유지, 이후 결제 없음.
// - 2026-08-13: 멤버십 단가에 일반가 취소선 병기.
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings,
} from "@/hooks/useSystemSettings";
import { usePracticeMembershipStatus } from "@/shared/pricing/useAbutsAbutmentPricingTier";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { invalidateBusinessMeCache } from "@/shared/components/business/settings/business/businessMeCache";
import { notifyRequestorAccessUpdated } from "@/shared/business/requestorCapabilities";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";
import {
  ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  formatAbutsAbutmentServiceWon,
  formatAbutsManwon,
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type MembershipPayload = {
  success?: boolean;
  message?: string;
  data?: {
    practiceMembershipActive?: boolean;
    practiceMembershipCancelAtPeriodEnd?: boolean;
    practiceMembershipNextBillingAt?: string | null;
  };
};

export const PracticeMembershipJoinDialog = ({
  open,
  onOpenChange,
}: Props) => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { data: systemSettings } = useSystemSettings();
  const membership = usePracticeMembershipStatus();
  const isMember = membership.active;
  const cancelScheduled = isMember && membership.cancelAtPeriodEnd;
  const [submitting, setSubmitting] = useState(false);

  const monthlyFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.practiceMembershipMonthlyFee ??
        CREDIT_SETTINGS_DEFAULTS.practiceMembershipMonthlyFee ??
        ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
    ) || ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  );
  const abutmentPrices = normalizeAbutsAbutmentCreditPrices(
    systemSettings?.creditSettings,
  );
  const nextBillingLabel = membership.nextBillingAt
    ? formatKstYmdToKo(toKstYmd(membership.nextBillingAt))
    : null;

  const refreshMembership = () => {
    invalidateBusinessMeCache({
      token,
      businessType: resolveBusinessType(user?.role, "requestor") || "requestor",
    });
    notifyRequestorAccessUpdated();
  };

  const submitMembership = async (active: boolean) => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const res = await request<MembershipPayload>({
        path: "/api/businesses/me/practice-membership",
        method: "POST",
        token,
        jsonBody: { active },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message ||
            (active
              ? "멤버십 가입에 실패했습니다."
              : "멤버십 해지에 실패했습니다."),
        );
      }
      refreshMembership();
      toast({
        title: active
          ? cancelScheduled
            ? "해지 취소"
            : "멤버십 가입 완료"
          : res.data.data?.practiceMembershipActive
            ? "해지 예약"
            : "멤버십 해지",
        description:
          res.data.message ||
          (active
            ? "커스텀어벗 멤버십 단가가 적용됩니다."
            : "다음 결제일까지 멤버십 단가가 유지됩니다."),
      });
      if (active && !cancelScheduled) {
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: active ? "멤버십 변경 실패" : "멤버십 해지 실패",
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
          {isMember ? (
            <DialogDescription className="sr-only">
              치과 멤버십
            </DialogDescription>
          ) : (
            <DialogDescription>
              월 구독료로 커스텀어벗 멤버십 단가를 적용합니다.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3.5">
            <p className="text-xs text-slate-500">월 구독료</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatAbutsAbutmentServiceWon(monthlyFee)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {cancelScheduled && nextBillingLabel
                ? `${nextBillingLabel}까지 유지 · 이후 자동 결제 없음`
                : isMember && nextBillingLabel
                  ? `다음 결제일 ${nextBillingLabel} · 매월 자동 결제`
                  : "매월 구독료 자동 결제"}
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 px-4 py-3.5">
            <p className="text-xs font-medium text-slate-500">멤버십 단가 · 1개당</p>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-slate-600">생산만</span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="text-base text-slate-400 line-through">
                  {formatAbutsManwon(abutmentPrices.regularProductionPrice)}
                </span>
                <span className="text-xl font-semibold tracking-tight text-slate-900">
                  {formatAbutsManwon(abutmentPrices.membershipProductionPrice)}
                </span>
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-slate-600">디자인+생산</span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="text-base text-slate-400 line-through">
                  {formatAbutsManwon(
                    abutmentPrices.regularDesignAndProductionPrice,
                  )}
                </span>
                <span className="text-xl font-semibold tracking-tight text-slate-900">
                  {formatAbutsManwon(
                    abutmentPrices.membershipDesignAndProductionPrice,
                  )}
                </span>
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          {isMember ? (
            cancelScheduled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={submitting}
                    onClick={() => void submitMembership(true)}
                  >
                    {submitting ? "처리 중…" : "해지 취소"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center">
                  해지가 예약되었습니다. 다음 결제일까지 멤버십 단가가 유지됩니다.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={submitting}
                    onClick={() => void submitMembership(false)}
                  >
                    {submitting ? "처리 중…" : "해지"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-center">
                  이용 중입니다. 해지하면 다음 결제일까지 유지되고 이후 결제되지 않습니다.
                </TooltipContent>
              </Tooltip>
            )
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={submitting}
              onClick={() => void submitMembership(true)}
            >
              {submitting ? "가입 중…" : "멤버십 가입"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
