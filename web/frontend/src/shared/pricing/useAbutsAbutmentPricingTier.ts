// related files:
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// change-log:
// - 2026-08-19: 치과 멤버십 폐지. 커스텀어벗 안내는 플랫폼 고시 단가만.
import {
  resolveAbutsAbutmentPricingTier,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";

export const useAbutsAbutmentPricingTier = (): AbutsAbutmentPricingTier =>
  resolveAbutsAbutmentPricingTier();
