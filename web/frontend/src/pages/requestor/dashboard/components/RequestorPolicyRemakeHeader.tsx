// change-log:
// - 2026-08-11: [정책]과 무료 재제작 잔여 사이 여백 확보.
// - 2026-08-11: 오늘의 가격 카드에서 [정책]·무료 재제작 잔여를 대시보드 헤더로 이전.
// related files:
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";

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

export const RequestorPolicyRemakeHeader = () => {
  const [policyOpen, setPolicyOpen] = useState(false);
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

  const showRemakeSkeleton = !data && (isLoading || isFetching);

  return (
    <>
      <div className="inline-flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border border-slate-300 bg-white px-3 text-xs text-foreground hover:bg-slate-100 hover:text-slate-700"
          onClick={() => setPolicyOpen(true)}
        >
          정책
        </Button>

        {showRemakeSkeleton ? (
          <Skeleton className="h-8 w-36" />
        ) : (
          <span className="inline-flex h-8 items-center whitespace-nowrap text-sm text-foreground tabular-nums">
            무료 재제작 잔여{" "}
            <span className="ml-1 font-semibold">
              {monthlyRemakeFreeRemaining.toLocaleString()}건
            </span>
          </span>
        )}
      </div>

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </>
  );
};
