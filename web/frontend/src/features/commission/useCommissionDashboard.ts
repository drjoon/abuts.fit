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

// /api/salesman/dashboard 응답 스키마
export type CommissionDashboardData = {
  ym: string;
  period?: PeriodFilterValue | null;
  commissionRate: number;
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
  };
  businesses?: Array<{
    businessAnchorId?: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    /** "direct"(소개됨) | "unaffiliated"(영업자 미설정) */
    referralLevel?: "direct" | "unaffiliated";
  }>;
  organizations: Array<{
    businessAnchorId?: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    referralLevel?: "direct" | "unaffiliated";
  }>;
  /** 딜러만 사용. devops는 빈 배열 반환 */
  referralSalesmen?: Array<{
    userId: string;
    name: string;
  }>;
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
