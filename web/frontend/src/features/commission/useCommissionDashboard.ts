// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
/**
 * 딜러(salesman)·영업팀(salesTeam) 대시보드에서 사용하는
 * /api/salesman/dashboard 데이터 훅 + 타입 + 포매터.
 *
 * 딜러십 영업 수수료: 유치(가입·재귀속) 시점 요율 고정.
 * 관리자가 신규 유치 요율을 20%→15%→10%로 인하해도 기존 유치 건은 유지.
 */

import { useEffect, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

export type CommissionOrgRow = {
  businessAnchorId?: string;
  name: string;
  monthRevenueAmount: number;
  monthOrderCount: number;
  monthCommissionAmount: number;
  referralLevel?: "direct" | "unaffiliated";
  requestorKind?: "practice" | "lab" | null;
  acquiredAt?: string | null;
  commissionTier?: string;
  commissionRate?: number | null;
};

export type CommissionDashboardData = {
  ym: string;
  period?: PeriodFilterValue | null;
  commissionRate: number;
  /** 지금 신규 유치에 적용되는 요율 */
  dealershipActiveCommissionRate?: number;
  dealershipBaseCommissionRate?: number;
  dealershipEventCommissionRate?: number;
  dealershipEventCommissionEnabled?: boolean;
  dealershipRateChangeScheduledAt?: string | Date | null;
  dealershipRateChangeScheduledRate?: number | null;
  unaffiliatedCommissionRate?: number;
  payoutDayOfMonth: number;
  referralCode: string;
  overview: {
    referredBusinessCount?: number;
    referredOrganizationCount: number;
    monthRevenueAmount: number;
    monthCommissionAmount: number;
    directBusinessCount?: number;
    totalBusinessCount?: number;
    directOrganizationCount?: number;
    totalOrganizationCount?: number;
    directCommissionAmount?: number;
    unaffiliatedCommissionAmount?: number;
    totalCommissionAmount?: number;
    payableGrossCommissionAmount?: number;
    paidNetCommissionAmount?: number;
    freeNetRequestAmount?: number;
    freeNetShippingAmount?: number;
    freeNetAmount?: number;
    practiceOrganizationCount?: number;
    labOrganizationCount?: number;
  };
  businesses?: CommissionOrgRow[];
  organizations: CommissionOrgRow[];
};

export const formatMoney = (n?: number): string => {
  const v = Number(n || 0);
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
};

export function formatCommissionRatePct(rate?: number | null): string {
  const pct = Math.round(Number(rate || 0) * 100);
  return `${pct}%`;
}

export const DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS = [20, 15, 10] as const;

export type DealershipRateBucket = {
  pct: number;
  orgCount: number;
  commissionAmount: number;
};

export function summarizeDealershipRateBuckets(
  organizations: CommissionOrgRow[] | undefined | null,
): DealershipRateBucket[] {
  const byPct = new Map<number, DealershipRateBucket>();
  for (const pct of DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS) {
    byPct.set(pct, { pct, orgCount: 0, commissionAmount: 0 });
  }
  for (const org of organizations || []) {
    const pct = Math.round(Number(org.commissionRate || 0) * 100);
    const bucket = byPct.get(pct);
    if (!bucket) continue;
    bucket.orgCount += 1;
    bucket.commissionAmount += Number(org.monthCommissionAmount || 0);
  }
  return DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS.map(
    (pct) => byPct.get(pct) as DealershipRateBucket,
  );
}

export function dealershipRateBucketTip(
  pct: number,
  opts: { activePct: number },
): string {
  if (pct === opts.activePct) {
    return "지금 신규 유치(가입·재귀속)에 적용되는 요율로 유치한 치과·기공소";
  }
  if (pct > opts.activePct) {
    return "이전에 더 높은 요율로 유치해 계속 유지되는 치과·기공소";
  }
  return "이후 인하된 요율로 유치한 치과·기공소";
}

export function requestorKindLabel(
  kind?: "practice" | "lab" | null,
): string {
  if (kind === "practice") return "치과";
  if (kind === "lab") return "기공소";
  return "의뢰자";
}

export function useCommissionDashboard(period: PeriodFilterValue) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [data, setData] = useState<CommissionDashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    request<{
      success?: boolean;
      message?: string;
      data?: CommissionDashboardData;
    }>({
      path: `/api/salesman/dashboard?period=${encodeURIComponent(period)}`,
      method: "GET",
      token,
    })
      .then((res) => {
        const body = (res.data || {}) as {
          success?: boolean;
          message?: string;
          data?: CommissionDashboardData;
        };
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "대시보드 조회에 실패했습니다.");
        }
        setData((body.data || null) as CommissionDashboardData | null);
      })
      .catch((err: unknown) => {
        toast({
          title: "오류",
          description:
            err instanceof Error ? err.message : "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast, token, period]);

  return { data, loading };
}
