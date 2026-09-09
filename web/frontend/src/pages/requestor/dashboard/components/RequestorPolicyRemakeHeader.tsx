// change-log:
// - 2026-09-09: 월 무료 재제작 잔여 훅 제거(리메이크 건당 1만원 정책).
// - 2026-09-03: 기공소 [정책 안내]는 사이드바. 이 헤더는 치과 어벗디자인 등만.
// - 2026-08-18: 치과 헤더 [구독] 제거. 정책 안내는 서비스 3종 단일가 모달만.
// - 2026-08-15: [구독] 라벨. 미구독 시 빨간 하이라이트 → 설정 `?tab=subscription`.
// - 2026-08-13: 치과 [멤버십] → 가입 모달. [가입 이유] 제거.
// - 2026-08-12: 기공소·치과 — [정책 안내] 오른쪽 [가입 이유] 버튼(PlatformBenefitsDialog).
// - 2026-08-12: 무료 재제작 잔여를 어벗 요약카드로 이전. 헤더는 [정책 안내]만 유지.
// - 2026-08-11: [정책 안내] 색을 primary(기간 필터와 동일)로 조정.
// - 2026-08-11: [정책 안내] primary 색 적용, px-10.
// - 2026-08-11: [정책] → [정책 안내], 버튼 좌우 여백 확대.
// - 2026-08-11: [정책]과 무료 재제작 잔여 사이 여백 확보.
// - 2026-08-11: 오늘의 가격 카드에서 [정책]·무료 재제작 잔여를 대시보드 헤더로 이전.
// related files:
// - web/frontend/src/features/lab/LabDashboardTopBanners.tsx
// - web/frontend/src/features/lab/LabPricingPolicyBanner.tsx
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
import { Button } from "@/components/ui/button";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { useState } from "react";

export const RequestorPolicyRemakeHeader = () => {
  const [policyOpen, setPolicyOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 bg-primary px-10 text-xs text-primary-foreground hover:bg-primary/90"
        onClick={() => setPolicyOpen(true)}
      >
        정책 안내
      </Button>

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </>
  );
};
