// related files:
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
// - web/backend/models/businessAnchor.model.js
// change-log:
// - 2026-08-13: 로그인 치과 멤버십 여부로 커스텀어벗 안내 단가 결정.
import { useEffect, useMemo, useState } from "react";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { useAuthStore } from "@/store/useAuthStore";
import {
  resolveAbutsAbutmentPricingTier,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";

export const useAbutsAbutmentPricingTier = (): AbutsAbutmentPricingTier => {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [requestorKind, setRequestorKind] = useState<string | null>(
    () => user?.requestorKind || null,
  );
  const [practiceMembershipActive, setPracticeMembershipActive] = useState(false);

  const businessType = useMemo(
    () => resolveBusinessType(user?.role, "requestor"),
    [user?.role],
  );

  useEffect(() => {
    setRequestorKind(user?.requestorKind || null);
  }, [user?.requestorKind]);

  useEffect(() => {
    if (!token) {
      setPracticeMembershipActive(false);
      return;
    }
    let cancelled = false;
    void loadBusinessMeCached({
      token,
      businessType: businessType || "requestor",
    }).then((data) => {
      if (cancelled) return;
      const kind = String(data?.requestorKind || user?.requestorKind || "").trim();
      if (kind === "practice" || kind === "lab") {
        setRequestorKind(kind);
      }
      setPracticeMembershipActive(Boolean(data?.practiceMembershipActive));
    });
    return () => {
      cancelled = true;
    };
  }, [businessType, token, user?.requestorKind]);

  return resolveAbutsAbutmentPricingTier({
    requestorKind,
    practiceMembershipActive,
  });
};
