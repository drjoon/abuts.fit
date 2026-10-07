// change-log:
// - 2026-10-07: 공지는 DashboardLayout 전폭 바. 이 헤더에서 inline 제거.
// - 2026-08-19: 기간 필터는 치과 어벗디자인·기공소 어벗생산의뢰 헤더.
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
  customStartDate?: string;
  customEndDate?: string;
  onCustomRangeChange?: (range: { startDate: string; endDate: string }) => void;
  onClearCustomRange?: () => void;
  /** 필터 뒤에 붙는 추가 액션 (예: 정책 안내, 불완전가공 알림) */
  children?: ReactNode;
  className?: string;
};

export const RequestorWorkspaceHeader = ({
  period,
  onPeriodChange,
  customStartDate,
  customEndDate,
  onCustomRangeChange,
  onClearCustomRange,
  children,
  className,
}: RequestorWorkspaceHeaderProps) => {
  const showPeriodFilter =
    typeof period !== "undefined" && typeof onPeriodChange === "function";

  return (
    <div className={className ?? "flex w-full min-w-0 flex-nowrap items-center gap-2"}>
      {showPeriodFilter && (
        <PeriodFilter
          value={period}
          onChange={onPeriodChange}
          useStoreCustomRange={false}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onCustomRangeChange={onCustomRangeChange}
          onClearCustomRange={onClearCustomRange}
          className="shrink-0"
        />
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
};
