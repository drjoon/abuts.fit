// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/features/platform/PracticeMembershipJoinDialog.tsx
// - web/backend/services/practiceMembership.service.js
// change-log:
// - 2026-08-15: 치과 설정 「구독」탭. 혜택 안내 + 가입/해지.
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BadgeCheck, CalendarDays, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CREDIT_SETTINGS_DEFAULTS,
  useSystemSettings,
} from "@/hooks/useSystemSettings";
import { usePracticeMembershipStatus } from "@/shared/pricing/useAbutsAbutmentPricingTier";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { invalidateBusinessMeCache } from "@/shared/components/business/settings/business/businessMeCache";
import { notifyRequestorAccessUpdated } from "@/shared/business/requestorCapabilities";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";
import { cn } from "@/shared/ui/cn";
import {
  ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  formatAbutsAbutmentServiceWon,
  formatAbutsManwon,
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";

type MembershipPayload = {
  success?: boolean;
  message?: string;
  data?: {
    practiceMembershipActive?: boolean;
    practiceMembershipCancelAtPeriodEnd?: boolean;
    practiceMembershipNextBillingAt?: string | null;
  };
};

export const PracticeSubscriptionTab = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { data: systemSettings } = useSystemSettings();
  const membership = usePracticeMembershipStatus();
  const [submitting, setSubmitting] = useState(false);

  const isMember = membership.active;
  const cancelScheduled = isMember && membership.cancelAtPeriodEnd;

  const monthlyFee = Math.max(
    0,
    Number(
      systemSettings?.creditSettings?.practiceMembershipMonthlyFee ??
        CREDIT_SETTINGS_DEFAULTS.practiceMembershipMonthlyFee ??
        ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
    ) || ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  );
  const prices = normalizeAbutsAbutmentCreditPrices(
    systemSettings?.creditSettings,
  );
  const nextBillingLabel = membership.nextBillingAt
    ? formatKstYmdToKo(toKstYmd(membership.nextBillingAt) || "")
    : null;

  const statusLabel = isMember
    ? cancelScheduled
      ? "구독 중 · 해지 예약"
      : "구독 중"
    : "미구독";

  const refreshMembership = () => {
    invalidateBusinessMeCache({
      token,
      businessType: resolveBusinessType(user?.role, "requestor") || "requestor",
    });
    notifyRequestorAccessUpdated();
  };

  const submit = async (active: boolean) => {
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
            (active ? "구독에 실패했습니다." : "해지에 실패했습니다."),
        );
      }
      refreshMembership();
      toast({
        title: active
          ? cancelScheduled
            ? "해지 취소"
            : "구독 시작"
          : res.data.data?.practiceMembershipActive
            ? "해지 예약"
            : "구독 해지",
        description:
          res.data.message ||
          (active
            ? "커스텀어벗 멤버십 단가가 적용됩니다."
            : "다음 결제일까지 멤버십 단가가 유지됩니다."),
        duration: 2500,
      });
    } catch (error) {
      toast({
        title: active ? "구독 실패" : "해지 실패",
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
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
            <Sparkles className="h-5 w-5 text-primary-strong" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">
              치과 구독
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              월 구독료로 커스텀어벗 멤버십 단가를 적용합니다. 유료 크레딧에서
              자동 결제되며 부가세는 없습니다.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
                <CalendarDays className="h-4 w-4 text-primary-strong" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">월 구독료</p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  면세 · 유료 크레딧 차감
                </p>
              </div>
            </div>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatAbutsAbutmentServiceWon(monthlyFee)}
            </span>
          </div>

          <div className="rounded-2xl border border-primary-muted/60 bg-primary-soft/30 px-4 py-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-primary-muted/50">
                <BadgeCheck className="h-4 w-4 text-primary-strong" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  구독 혜택 · 1개당
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  일반가 → 멤버십가
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pl-0.5">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-slate-600">생산만</span>
                <span className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-slate-400 line-through">
                    {formatAbutsManwon(prices.regularProductionPrice)}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatAbutsManwon(prices.membershipProductionPrice)}
                  </span>
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-slate-600">디자인+생산</span>
                <span className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-slate-400 line-through">
                    {formatAbutsManwon(prices.regularDesignAndProductionPrice)}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatAbutsManwon(
                      prices.membershipDesignAndProductionPrice,
                    )}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {!isMember ? (
          <ul className="space-y-1.5 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-4 py-3.5 text-[13px] leading-relaxed text-slate-600">
            <li className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-strong/70" />
              가입 즉시 멤버십 단가 적용 · 첫 구독료는 다음 결제일에 청구
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-strong/70" />
              해지해도 다음 결제일까지 혜택 유지
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-strong/70" />
              잔액 부족 시 갱신되지 않으며 일반 단가로 전환
            </li>
          </ul>
        ) : null}

        <div className="flex justify-center pt-2">
          <div
            className={cn(
              "w-full overflow-hidden rounded-2xl border bg-white/80 shadow-sm sm:w-1/2",
              isMember ? "border-primary-muted/70" : "border-red-200",
            )}
          >
            <div
              className={cn(
                "h-1 w-full",
                isMember
                  ? cancelScheduled
                    ? "bg-amber-400"
                    : "bg-primary-strong"
                  : "bg-red-500",
              )}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {statusLabel}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isMember
                        ? cancelScheduled
                          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                          : "bg-primary-soft text-primary-strong ring-1 ring-primary-muted"
                        : "bg-red-50 text-red-700 ring-1 ring-red-200",
                    )}
                  >
                    {isMember
                      ? cancelScheduled
                        ? "해지 예약"
                        : "ON"
                      : "OFF"}
                  </span>
                </div>
                {isMember ? (
                  <p className="text-[12px] text-muted-foreground">
                    {cancelScheduled
                      ? nextBillingLabel
                        ? `${nextBillingLabel}까지 유지 · 이후 자동 결제 없음`
                        : "해지 예약됨 · 기간 말 이후 종료"
                      : nextBillingLabel
                        ? `다음 결제일 ${nextBillingLabel} · 매월 자동 결제`
                        : "매월 구독료 자동 결제"}
                  </p>
                ) : (
                  <p className="text-[12px] text-red-600/90">
                    구독하면 멤버십 단가가 바로 적용됩니다.
                  </p>
                )}
              </div>

              {!isMember ? (
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submit(true)}
                  className="h-10 shrink-0 rounded-xl px-4"
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  구독하기
                </Button>
              ) : cancelScheduled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => void submit(true)}
                      className="h-10 shrink-0 rounded-xl px-4"
                    >
                      {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      해지 취소
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    해지 예약을 취소하고 구독을 유지합니다.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => void submit(false)}
                      className="h-10 shrink-0 rounded-xl px-4"
                    >
                      {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      해지 예약
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    다음 결제일까지 유지되고, 이후 자동으로 종료됩니다.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
