// related files:
// - web/frontend/src/features/lab/LabAutoMatchParticipationBanner.tsx
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// change-log:
// - 2026-08-15: 어벗츠기공소(internalLab)에서는 상단 배너 미표시.
// - 2026-08-14: 거래 치과 소개 배너 제거 → 자동 매칭 참여 + 가입 이유 상시 표시.
// - 2026-08-12: 소개치과·가입 이유 상단 2열 배너.
import { LabAutoMatchParticipationBanner } from "@/features/lab/LabAutoMatchParticipationBanner";
import { LabPlatformBenefitsBanner } from "@/features/lab/LabPlatformBenefitsBanner";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

type Props = {
  className?: string;
};

export const LabDashboardTopBanners = ({ className }: Props) => {
  const user = useAuthStore((s) => s.user);
  const { loading, kind } = useRequestorBusinessAccess();

  if (user?.role === "internalLab") return null;
  if (loading || kind !== "lab") return null;

  return (
    <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
      <LabAutoMatchParticipationBanner />
      <LabPlatformBenefitsBanner className="h-full" />
    </div>
  );
};
