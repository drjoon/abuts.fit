// change-log:
// - 2026-08-18: 치과 어벗디자인 헤더에도 기간 필터+정책/출고/지난의뢰/불완전가공.
// - 2026-08-12: children 슬롯은 [정책 안내] 등. 무료 재제작 잔여는 어벗 요약카드로 이동.
// - 2026-08-11: 필터 뒤에 [정책]·무료 재제작 잔여(대시보드 children) 슬롯 유지.
// - 2026-08-11: 지난 의뢰 제거 — 대시보드 최근 의뢰 카드로만 제공. 기간 필터(+children)만 유지.
// - 2026-08-11: 보유 크레딧 버튼/원장 모달 제거 → 사이드바 크레딧 페이지로 이전.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/ui/PeriodFilter.tsx
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
import { type ReactNode } from "react";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";

export type RequestorWorkspaceHeaderProps = {
  /** 제공 시에만 기간 필터 표시 */
  period?: PeriodFilterValue;
  onPeriodChange?: (period: PeriodFilterValue) => void;
  /** 필터 뒤에 붙는 추가 액션 (예: 정책 안내, 불완전가공 알림) */
  children?: ReactNode;
  className?: string;
};

export const RequestorWorkspaceHeader = ({
  period,
  onPeriodChange,
  children,
  className,
}: RequestorWorkspaceHeaderProps) => {
  const showPeriodFilter =
    typeof period !== "undefined" && typeof onPeriodChange === "function";

  return (
    <div className={className ?? "flex flex-wrap items-center gap-2 w-full"}>
      {showPeriodFilter && (
        <PeriodFilter
          value={period}
          onChange={onPeriodChange}
          useStoreCustomRange={false}
        />
      )}

      {children}
    </div>
  );
};
