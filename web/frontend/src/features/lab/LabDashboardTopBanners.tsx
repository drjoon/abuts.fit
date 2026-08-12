// related files:
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - 2026-08-12: 소개치과·가입 이유 상단 2열 배너.
import { LabTradingPartnerWindowBanner } from "@/features/lab/LabTradingPartnerWindowBanner";
import { LabPlatformBenefitsBanner } from "@/features/lab/LabPlatformBenefitsBanner";
import { useLabTradingPartnerWindow } from "@/shared/lab/useLabTradingPartnerWindow";
import { cn } from "@/shared/ui/cn";

type Props = {
  className?: string;
};

export const LabDashboardTopBanners = ({ className }: Props) => {
  const { isLab, canInvite, remainingDays, loading } =
    useLabTradingPartnerWindow();

  if (loading || !isLab) return null;

  const showInvite =
    Boolean(canInvite) &&
    remainingDays != null &&
    Number.isFinite(remainingDays) &&
    remainingDays > 0;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        showInvite ? "md:grid-cols-2" : null,
        className,
      )}
    >
      {showInvite ? (
        <LabTradingPartnerWindowBanner remainingDays={remainingDays} />
      ) : null}
      <LabPlatformBenefitsBanner className="h-full" />
    </div>
  );
};
