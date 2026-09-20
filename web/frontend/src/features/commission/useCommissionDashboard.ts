// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
/**
 * 딜러(salesman) 대시보드에서 사용하는
 * /api/salesman/dashboard 데이터 훅 + 타입 + 포매터.
 *
 * 역할별 UI 분기는 이 훅에 두지 않는다.
 * 역할 전용 렌더링은 SalesmanDashboardPage에서 담당한다.
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
  /** "direct"(소개됨) | "unaffiliated"(영업자 미설정) */
  referralLevel?: "direct" | "unaffiliated";
  requestorKind?: "practice" | "lab" | null;
  acquiredAt?: string | null;
  commissionTier?: "event" | "base";
  commissionRate?: number;
};

// /api/salesman/dashboard 응답 스키마
export type CommissionDashboardData = {
  ym: string;
  period?: PeriodFilterValue | null;
  commissionRate: number;
  /** 딜러십 표준 요율(추후 공지 후). */
  dealershipBaseCommissionRate?: number;
  /** 딜러십 이벤트 요율. */
  dealershipEventCommissionRate?: number;
  /** 이벤트 요율 적용 여부. */
  dealershipEventCommissionEnabled?: boolean;
  dealershipEventStartedAt?: string | Date | null;
  dealershipEventEndedAt?: string | Date | null;
  /** devops 전용: 영업자 미설정 의뢰자 분배율 */
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
    /** devops 전용: 영업자 미설정 의뢰자 수수료 합계 */
    unaffiliatedCommissionAmount?: number;
    totalCommissionAmount?: number;
    payableGrossCommissionAmount?: number;
    paidNetCommissionAmount?: number;
    freeNetRequestAmount?: number;
    freeNetShippingAmount?: number;
    freeNetAmount?: number;
    eventOrganizationCount?: number;
    baseOrganizationCount?: number;
    eventCommissionAmount?: number;
    baseCommissionAmount?: number;
    eventRevenueAmount?: number;
    baseRevenueAmount?: number;
    eventOrderCount?: number;
    baseOrderCount?: number;
    practiceOrganizationCount?: number;
    labOrganizationCount?: number;
  };
  businesses?: CommissionOrgRow[];
  organizations: CommissionOrgRow[];
};

/** 원화 금액 포매터 */
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

/** 딜러십 요율 사다리(관리자 선택지 10·15·20과 동일, 높은 순). */
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

export function dealershipRateBucketLabel(
  pct: number,
  opts: { eventPct: number; basePct: number; eventEnabled: boolean },
): string {
  const { eventPct, basePct, eventEnabled } = opts;
  if (eventEnabled) {
    if (pct === eventPct) return `현재 ${pct}%`;
    if (pct === basePct) return `추후 ${pct}%`;
    return `${pct}%`;
  }
  if (pct === basePct) return `현재 ${pct}%`;
  if (pct === eventPct) return `요율 ${pct}%`;
  return `${pct}%`;
}

export function dealershipRateBucketTip(
  pct: number,
  opts: { eventPct: number; basePct: number; eventEnabled: boolean },
): string {
  const { eventPct, basePct, eventEnabled } = opts;
  if (pct === eventPct) {
    return eventEnabled
      ? "이벤트 기간인 지금 유치(가입)한 치과·기공소"
      : "이벤트 기간에 유치한 치과·기공소";
  }
  if (pct === basePct) {
    return eventEnabled
      ? "이벤트 종료 후 적용될 표준 요율 · 기간 외 유치 고객"
      : "현재 표준 요율로 유치한 치과·기공소";
  }
  return "이벤트 요율 단계 조정(20%→15%→10%) 시 적용되는 중간 요율";
}

export function requestorKindLabel(
  kind?: "practice" | "lab" | null,
): string {
  if (kind === "practice") return "치과";
  if (kind === "lab") return "기공소";
  return "의뢰자";
}

/**
 * 딜러 대시보드·정산 데이터 훅.
 * /api/salesman/dashboard 엔드포인트가 반환한 값을 그대로 표시한다.
 */
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
