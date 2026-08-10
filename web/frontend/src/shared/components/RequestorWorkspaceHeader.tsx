// change-log:
// - 2026-08-11: 보유 크레딧 버튼/원장 모달 제거 → 사이드바 크레딧 페이지로 이전.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/ui/PeriodFilter.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";

export type RequestorWorkspaceHeaderProps = {
  /** 제공 시에만 기간 필터 표시 (신규의뢰 등 미적용 페이지는 생략) */
  period?: PeriodFilterValue;
  onPeriodChange?: (period: PeriodFilterValue) => void;
  onSelectPastRequest: (request: any) => void;
  /** 필터/지난의뢰 뒤에 붙는 추가 액션 (예: 불완전가공 알림) */
  children?: ReactNode;
  className?: string;
};

export const RequestorWorkspaceHeader = ({
  period,
  onPeriodChange,
  onSelectPastRequest,
  children,
  className,
}: RequestorWorkspaceHeaderProps) => {
  const [pastRequestsOpen, setPastRequestsOpen] = useState(false);

  const showPeriodFilter =
    typeof period !== "undefined" && typeof onPeriodChange === "function";

  return (
    <>
      <div className={className ?? "flex flex-wrap items-center gap-2 w-full"}>
        {showPeriodFilter && (
          <PeriodFilter
            value={period}
            onChange={onPeriodChange}
            useStoreCustomRange={false}
          />
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setPastRequestsOpen(true)}
        >
          지난 의뢰
        </Button>

        {children}
      </div>

      <PastRequestsModal
        open={pastRequestsOpen}
        onOpenChange={setPastRequestsOpen}
        title="지난 의뢰"
        onSelectRequest={(r) => {
          setPastRequestsOpen(false);
          onSelectPastRequest(r);
        }}
      />
    </>
  );
};
