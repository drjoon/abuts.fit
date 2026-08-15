// change-log:
// - 2026-08-15: [구독] 라벨. 미구독 시 빨간 하이라이트 → 설정 `?tab=subscription`.
// - 2026-08-13: 치과 [멤버십] → 가입 모달. [가입 이유] 제거.
// - 2026-08-12: 기공소·치과 — [정책 안내] 오른쪽 [가입 이유] 버튼(PlatformBenefitsDialog).
// - 2026-08-12: 무료 재제작 잔여를 어벗 요약카드로 이전. 헤더는 [정책 안내]만 유지.
// - 2026-08-11: [정책 안내] 색을 primary(기간 필터와 동일)로 조정.
// - 2026-08-11: [정책 안내] primary 색 적용, px-10.
// - 2026-08-11: [정책] → [정책 안내], 버튼 좌우 여백 확대.
// - 2026-08-11: [정책]과 무료 재제작 잔여 사이 여백 확보.
// - 2026-08-11: 오늘의 가격 카드에서 [정책]·무료 재제작 잔여를 대시보드 헤더로 이전.
// related files:
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/PracticeSubscriptionTab.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { usePracticeMembershipStatus } from "@/shared/pricing/useAbutsAbutmentPricingTier";
import { cn } from "@/shared/ui/cn";
import { useState } from "react";

type PricingReferralStats = {
  monthlyRemakeFreeLimit?: number;
  monthlyRemakeUsed?: number;
  monthlyRemakeFreeRemaining?: number;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

/** 무료 재제작 잔여 — 어벗 라인 요약카드용 */
export const useRequestorMonthlyRemakeFreeRemaining = () => {
  const { user, token } = useAuthStore();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["requestor-pricing-referral-stats", "v8"],
    queryFn: async () => {
      const res = await apiFetch<ApiEnvelope<PricingReferralStats>>({
        path: "/api/requests/my/pricing-referral-stats",
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message ||
            res.data?.error ||
            "가격/소개 통계 조회에 실패했습니다.",
        );
      }
      return res.data.data;
    },
    enabled: Boolean(token && user && user.role === "requestor"),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const monthlyRemakeFreeLimit = Number(data?.monthlyRemakeFreeLimit ?? 3);
  const monthlyRemakeUsed = Number(data?.monthlyRemakeUsed ?? 0);
  const monthlyRemakeFreeRemaining = Math.max(
    0,
    Number(
      data?.monthlyRemakeFreeRemaining ??
        monthlyRemakeFreeLimit - monthlyRemakeUsed,
    ),
  );

  return {
    monthlyRemakeFreeRemaining,
    isLoading: !data && (isLoading || isFetching),
  };
};

export const RequestorPolicyRemakeHeader = () => {
  const [policyOpen, setPolicyOpen] = useState(false);
  const navigate = useNavigate();
  const { kind, loading } = useRequestorBusinessAccess();
  const membership = usePracticeMembershipStatus();
  const showSubscription = !loading && kind === "practice";
  const needsSubscription = showSubscription && !membership.active;

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 bg-primary px-10 text-xs text-primary-foreground hover:bg-primary/90"
        onClick={() => setPolicyOpen(true)}
      >
        정책 안내
      </Button>

      {showSubscription ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-8 px-10 text-xs",
            needsSubscription
              ? "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-500/40 hover:bg-red-100 hover:text-red-800"
              : "border border-input bg-white text-foreground hover:bg-slate-50 hover:text-foreground",
          )}
          onClick={() => navigate("/dashboard/settings?tab=subscription")}
        >
          구독
        </Button>
      ) : null}

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </>
  );
};
