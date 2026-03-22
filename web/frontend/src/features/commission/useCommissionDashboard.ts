/**
 * 영업자(salesman)와 개발운영사(devops)가 공통으로 사용하는
 * /api/salesman/dashboard 데이터 훅 + 타입 + 포매터.
 *
 * 역할별 UI 분기는 이 훅에 두지 않는다.
 * 역할 전용 렌더링은 각자의 페이지 파일(SalesmanDashboardPage, DevopsDashboardPage)에서 담당한다.
 */

import { useEffect, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

// /api/salesman/dashboard 응답 스키마 (영업자/개발운영사 공용)
export type CommissionDashboardData = {
  ym: string;
  period?: PeriodFilterValue | null;
  commissionRate: number;
  /** devops의 경우 백엔드가 0으로 반환 */
  indirectCommissionRate?: number;
  payoutDayOfMonth: number;
  referralCode: string;
  overview: {
    referredBusinessCount?: number;
    referredOrganizationCount: number;
    monthRevenueAmount: number;
    monthCommissionAmount: number;
    directBusinessCount?: number;
    /** devops의 경우 항상 0 */
    level1BusinessCount?: number;
    totalBusinessCount?: number;
    directOrganizationCount?: number;
    /** devops의 경우 항상 0 */
    level1OrganizationCount?: number;
    totalOrganizationCount?: number;
    directCommissionAmount?: number;
    /** devops의 경우 항상 0 */
    level1CommissionAmount?: number;
    totalCommissionAmount?: number;
    payableGrossCommissionAmount?: number;
    paidNetCommissionAmount?: number;
  };
  businesses?: Array<{
    businessAnchorId?: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    /** devops의 경우 백엔드가 level1 항목을 반환하지 않으므로 항상 "direct" */
    referralLevel?: "direct" | "level1";
  }>;
  organizations: Array<{
    businessAnchorId?: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
    referralLevel?: "direct" | "level1";
  }>;
  /** 영업자만 사용. devops는 빈 배열 반환 */
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
 * 영업자/개발운영사 대시보드·정산 데이터 공통 훅.
 * 역할 구분 없이 동일한 /api/salesman/dashboard 엔드포인트를 호출한다.
 * 역할별 수수료 필드 의미 차이는 백엔드가 처리하여 값을 반환하므로,
 * 프론트는 값을 그대로 표시하면 된다.
 */
export function useCommissionDashboard(period: PeriodFilterValue) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [data, setData] = useState<CommissionDashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    request<any>({
      path: `/api/salesman/dashboard?period=${encodeURIComponent(period)}`,
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "대시보드 조회에 실패했습니다.");
        }
        setData(body.data as CommissionDashboardData);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast, token, period]);

  return { data, loading };
}
