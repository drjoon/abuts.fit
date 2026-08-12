// change-log:
// - 2026-08-12: 기공소 — [정책 안내] 오른쪽에 [가입 이유] 버튼(LabPlatformBenefitsDialog).
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
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { LabPlatformBenefitsDialog } from "@/features/lab/LabPlatformBenefitsBanner";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

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
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const { kind, loading } = useRequestorBusinessAccess();
  const isLab = !loading && kind === "lab";

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

      {isLab ? (
        <Button
          type="button"
          size="sm"
          className="h-8 border border-input bg-white px-10 text-xs text-foreground hover:bg-slate-50 hover:text-foreground"
          onClick={() => setBenefitsOpen(true)}
        >
          가입 이유
        </Button>
      ) : null}

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
      {isLab ? (
        <LabPlatformBenefitsDialog
          open={benefitsOpen}
          onOpenChange={setBenefitsOpen}
        />
      ) : null}
    </>
  );
};
