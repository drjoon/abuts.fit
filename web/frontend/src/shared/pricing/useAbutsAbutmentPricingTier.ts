// related files:
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
// - web/backend/models/businessAnchor.model.js
// change-log:
// - 2026-08-13: 해지 예약·다음 결제일 상태 노출.
// - 2026-08-13: 멤버십 가입 후 단가 즉시 반영(access updated).
// - 2026-08-13: 로그인 치과 멤버십 여부로 커스텀어벗 안내 단가 결정.
import { useEffect, useMemo, useState } from "react";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { useAuthStore } from "@/store/useAuthStore";
import { REQUESTOR_ACCESS_UPDATED_EVENT } from "@/shared/business/requestorCapabilities";
import {
  resolveAbutsAbutmentPricingTier,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";

export type PracticeMembershipStatus = {
  tier: AbutsAbutmentPricingTier;
  active: boolean;
  cancelAtPeriodEnd: boolean;
  nextBillingAt: string | null;
};

export const usePracticeMembershipStatus = (): PracticeMembershipStatus => {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [requestorKind, setRequestorKind] = useState<string | null>(
    () => user?.requestorKind || null,
  );
  const [practiceMembershipActive, setPracticeMembershipActive] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [nextBillingAt, setNextBillingAt] = useState<string | null>(null);

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
      setCancelAtPeriodEnd(false);
      setNextBillingAt(null);
      return;
    }
    let cancelled = false;
    const load = (force = false) => {
      void loadBusinessMeCached({
        token,
        businessType: businessType || "requestor",
        force,
      }).then((data) => {
        if (cancelled) return;
        const kind = String(
          data?.requestorKind || user?.requestorKind || "",
        ).trim();
        if (kind === "practice" || kind === "lab") {
          setRequestorKind(kind);
        }
        setPracticeMembershipActive(Boolean(data?.practiceMembershipActive));
        setCancelAtPeriodEnd(Boolean(data?.practiceMembershipCancelAtPeriodEnd));
        setNextBillingAt(
          data?.practiceMembershipNextBillingAt
            ? String(data.practiceMembershipNextBillingAt)
            : null,
        );
      });
    };
    load();
    const onUpdated = () => load(true);
    window.addEventListener(REQUESTOR_ACCESS_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(REQUESTOR_ACCESS_UPDATED_EVENT, onUpdated);
    };
  }, [businessType, token, user?.requestorKind]);

  return {
    tier: resolveAbutsAbutmentPricingTier({
      requestorKind,
      practiceMembershipActive,
    }),
    active: practiceMembershipActive,
    cancelAtPeriodEnd,
    nextBillingAt,
  };
};

export const useAbutsAbutmentPricingTier = (): AbutsAbutmentPricingTier =>
  usePracticeMembershipStatus().tier;
