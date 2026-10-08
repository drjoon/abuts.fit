// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
/**
 * 딜러(salesman)·영업팀(salesTeam) 대시보드에서 사용하는
 * /api/salesman/dashboard 데이터 훅 + 타입 + 포매터.
 *
 * 딜러 수수료: 거래처 판매가 − 1만원(어벗 1개당, 부가세 포함).
 * 거래처 카드의 unitPrice는 그 거래처 판매가(원).
 * 개발운영 대시보드는 앵커 요율.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  /** 심플웨이 상품 매출(배송비 제외) */
  monthSimplewayRevenueAmount?: number;
  monthSimplewayCommissionAmount?: number;
  /** 커스텀어벗 매출에 대한 수수료. 없으면 monthCommissionAmount. */
  monthCustomAbutmentCommissionAmount?: number;
  /** 그 거래처 건당 판매가(원). 미설정이면 1.5만. */
  unitPrice?: number;
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
    simplewayCommissionAmount?: number;
    customAbutmentCommissionAmount?: number;
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

export type RequestorKindStat = {
  count: number;
  orderCount: number;
  commissionAmount: number;
  simplewayCommissionAmount: number;
  customAbutmentCommissionAmount: number;
};

function emptyKindStat(): RequestorKindStat {
  return {
    count: 0,
    orderCount: 0,
    commissionAmount: 0,
    simplewayCommissionAmount: 0,
    customAbutmentCommissionAmount: 0,
  };
}

function addKindStat(stat: RequestorKindStat, org: CommissionOrgRow) {
  const simpleway = Number(org.monthSimplewayCommissionAmount || 0);
  const custom = Number(
    org.monthCustomAbutmentCommissionAmount ?? org.monthCommissionAmount ?? 0,
  );
  stat.count += 1;
  stat.orderCount += Number(org.monthOrderCount || 0);
  stat.simplewayCommissionAmount += simpleway;
  stat.customAbutmentCommissionAmount += custom;
  stat.commissionAmount += simpleway + custom;
}

/** 소개 의뢰자를 치과·기공소·전체로 집계. */
export function summarizeRequestorKindStats(
  organizations: CommissionOrgRow[] | undefined | null,
): {
  practice: RequestorKindStat;
  lab: RequestorKindStat;
  total: RequestorKindStat;
} {
  const practice = emptyKindStat();
  const lab = emptyKindStat();
  const other = emptyKindStat();
  for (const org of organizations || []) {
    if (org.requestorKind === "lab") addKindStat(lab, org);
    else if (org.requestorKind === "practice") addKindStat(practice, org);
    else addKindStat(other, org);
  }
  return {
    practice,
    lab,
    total: {
      count: practice.count + lab.count + other.count,
      orderCount: practice.orderCount + lab.orderCount + other.orderCount,
      commissionAmount:
        practice.commissionAmount + lab.commissionAmount + other.commissionAmount,
      simplewayCommissionAmount:
        practice.simplewayCommissionAmount +
        lab.simplewayCommissionAmount +
        other.simplewayCommissionAmount,
      customAbutmentCommissionAmount:
        practice.customAbutmentCommissionAmount +
        lab.customAbutmentCommissionAmount +
        other.customAbutmentCommissionAmount,
    },
  };
}

export function requestorKindLabel(
  kind?: "practice" | "lab" | null,
): string {
  if (kind === "practice") return "치과";
  if (kind === "lab") return "기공소";
  return "의뢰자";
}

export function useCommissionDashboard(period: PeriodFilterValue) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id || "");
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["salesman-dashboard", userId, period],
    enabled: Boolean(token && userId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<CommissionDashboardData> => {
      const res = await request<{
        success?: boolean;
        message?: string;
        data?: CommissionDashboardData;
      }>({
        path: `/api/salesman/dashboard?period=${encodeURIComponent(period)}`,
        method: "GET",
        token,
      });
      const body = (res.data || {}) as {
        success?: boolean;
        message?: string;
        data?: CommissionDashboardData;
      };
      if (!res.ok || !body?.success || !body.data) {
        throw new Error(body?.message || "대시보드 조회에 실패했습니다.");
      }
      return body.data;
    },
  });

  useEffect(() => {
    if (!query.isError) return;
    const err = query.error;
    toast({
      title: "오류",
      description: err instanceof Error ? err.message : "다시 시도해주세요.",
      variant: "destructive",
    });
  }, [query.error, query.isError, toast]);

  return { data: query.data ?? null, loading: query.isLoading };
}
