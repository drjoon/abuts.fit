// related files:
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - 2026-08-12: 소개치과·가입 이유 상단 2열 배너.
// - 2026-08-12: 등록 기간 종료 시 두 배너 모두 숨김.
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

  // 소개치과 등록 기간이 끝나면 두 alert 모두 제거
  if (!showInvite) return null;

  return (
    <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
      <LabTradingPartnerWindowBanner remainingDays={remainingDays} />
      <LabPlatformBenefitsBanner className="h-full" />
    </div>
  );
};
