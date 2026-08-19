// related files:
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// change-log:
// - 2026-08-19: 기공소 가입 배너는 기공의뢰수신 상단만(어벗생산의뢰는 생산 현황 헤더).
// - 2026-08-19: 어벗츠 인증 안내 배너 제거. 가입 이유만 표시.
// - 2026-08-16: 인증 안내·가입 이유 2열. 한쪽만 있으면 전폭.
// - 2026-08-15: 어벗츠기공소(internalLab)에서는 상단 배너 미표시.
// - 2026-08-14: 거래 치과 소개 배너 제거 → 자동 매칭 참여 + 가입 이유 상시 표시.
// - 2026-08-12: 소개치과·가입 이유 상단 2열 배너.
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

  return <LabPlatformBenefitsBanner className={cn("h-full", className)} />;
};
