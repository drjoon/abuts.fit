// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/ui/PeriodFilter.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { type ReactNode, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { CreditLedgerModal } from "@/shared/components/CreditLedgerModal";
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";
import { useAuthStore } from "@/store/useAuthStore";

type CreditOutletContext = {
  creditBalance?: number | null;
  loadingCreditBalance?: boolean;
};

export type RequestorWorkspaceHeaderProps = {
  /** 제공 시에만 기간 필터 표시 (신규의뢰 등 미적용 페이지는 생략) */
  period?: PeriodFilterValue;
  onPeriodChange?: (period: PeriodFilterValue) => void;
  onSelectPastRequest: (request: any) => void;
  insufficientCredit?: boolean;
  insufficientShippingCredit?: boolean;
  /** 크레딧 원장 모달 open 상태 (대시보드 스켈레톤 전환 방지 등) */
  onCreditLedgerOpenChange?: (open: boolean) => void;
  /** 필터/크레딧/지난의뢰 뒤에 붙는 추가 액션 (예: 불완전가공 알림) */
  children?: ReactNode;
  className?: string;
};

const CREDIT_CHARGE_PATH = "/dashboard/settings?tab=payment";

export const RequestorWorkspaceHeader = ({
  period,
  onPeriodChange,
  onSelectPastRequest,
  insufficientCredit = false,
  insufficientShippingCredit = false,
  onCreditLedgerOpenChange,
  children,
  className,
}: RequestorWorkspaceHeaderProps) => {
  const { user } = useAuthStore();
  const {
    creditBalance = null,
    loadingCreditBalance = false,
  } = useOutletContext<CreditOutletContext>() || {};

  const [creditLedgerOpen, setCreditLedgerOpen] = useState(false);
  const [pastRequestsOpen, setPastRequestsOpen] = useState(false);

  const canOpenCreditLedger = user?.role === "requestor";
  const creditWarn = insufficientCredit || insufficientShippingCredit;
  const showPeriodFilter =
    typeof period !== "undefined" && typeof onPeriodChange === "function";

  const setLedgerOpen = (open: boolean) => {
    setCreditLedgerOpen(open);
    onCreditLedgerOpenChange?.(open);
  };

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

        {canOpenCreditLedger && (
          <TooltipProvider>
            <Tooltip open={creditWarn}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={creditWarn ? "destructive" : "outline"}
                  size="sm"
                  className={`h-8 transition-all ${
                    creditWarn
                      ? "ring-2 ring-destructive ring-offset-2 animate-pulse"
                      : ""
                  }`}
                  onClick={() => setLedgerOpen(true)}
                >
                  {loadingCreditBalance
                    ? "보유 크레딧: ..."
                    : `보유 크레딧: ${Number(
                        creditBalance || 0,
                      ).toLocaleString()}원`}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-destructive text-destructive-foreground"
              >
                <p>
                  {insufficientCredit && insufficientShippingCredit
                    ? "의뢰비와 배송비 크레딧이 모두 부족합니다"
                    : insufficientCredit
                      ? "의뢰비 크레딧이 부족합니다. 충전하시면 생산이 진행됩니다"
                      : "배송비 크레딧이 부족합니다. 충전해주세요"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

      <CreditLedgerModal
        open={creditLedgerOpen}
        onOpenChange={setLedgerOpen}
        chargeNavPath={CREDIT_CHARGE_PATH}
      />

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
