// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
// change-log:
// - 2026-08-15: internalLab(어벗츠기공소) — lab 수신 + 사업자 me, 디자인 큐는 대시보드.
// - 2026-08-11: 초기 1회만 loading=true — 이후 refresh는 silent(페이지 스켈레톤 플리커 방지).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import {
  loadBusinessMeCached,
  invalidateBusinessMeCache,
} from "@/shared/components/business/settings/business/businessMeCache";
import {
  REQUESTOR_ACCESS_UPDATED_EVENT,
  canReceivePracticeTransfer,
  canSendPracticeTransfer,
  canUseFreeServices,
  canUsePaidServices,
  hasRequestorProfile,
  requiresBusinessLicense,
  resolveRequestorProfile,
  type RequestorProfile,
} from "@/shared/business/requestorCapabilities";

const emptyProfile = (): RequestorProfile => ({
  kind: null,
  services: { free: false, paid: false },
});

const INTERNAL_LAB_PROFILE: RequestorProfile = {
  kind: "lab",
  services: { free: false, paid: true },
};

export const useRequestorBusinessAccess = () => {
  const { token, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [businessVerified, setBusinessVerified] = useState(false);
  const [profile, setProfile] = useState<RequestorProfile>(emptyProfile);
  const [membership, setMembership] = useState<string>("none");
  const [designAccessEnabled, setDesignAccessEnabled] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const isInternalLab = user?.role === "internalLab";

  const businessType = useMemo(
    () => resolveBusinessType(user?.role, "requestor"),
    [user?.role],
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      hasLoadedOnceRef.current = true;
      setBusinessVerified(false);
      setDesignAccessEnabled(false);
      setProfile(emptyProfile());
      return;
    }

    // 어벗츠기공소: 기공의뢰수신용 lab 수신. 디자인 큐는 대시보드 전용(중복 노출 방지).
    if (isInternalLab) {
      if (!hasLoadedOnceRef.current) {
        setLoading(true);
      }
      try {
        const data = await loadBusinessMeCached({
          token,
          businessType: "internalLab",
          force: true,
        });
        setBusinessVerified(Boolean(data?.businessVerified));
        setMembership(String(data?.membership || "none"));
      } catch {
        setBusinessVerified(Boolean(user?.businessVerified));
        setMembership("none");
      } finally {
        setDesignAccessEnabled(false);
        setProfile(INTERNAL_LAB_PROFILE);
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
      return;
    }

    if (user?.role !== "requestor") {
      setLoading(false);
      hasLoadedOnceRef.current = true;
      setBusinessVerified(Boolean(user?.businessVerified));
      setDesignAccessEnabled(false);
      setProfile(
        resolveRequestorProfile({
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: Boolean(user?.businessVerified),
        }),
      );
      return;
    }

    // 초기 진입 1회만 스켈레톤용 loading. 이후 이벤트/캐시 refresh는 silent.
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    try {
      const data = await loadBusinessMeCached({
        token,
        businessType: businessType || "requestor",
        force: true,
      });
      const verified = Boolean(data?.businessVerified);
      setBusinessVerified(verified);
      setMembership(String(data?.membership || "none"));
      setDesignAccessEnabled(Boolean(data?.designAccessEnabled));
      setProfile(
        resolveRequestorProfile({
          anchorKind: data?.requestorKind,
          anchorServices: data?.requestorServices,
          anchorCaps: data?.requestorCapabilities,
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: verified,
        }),
      );
    } catch {
      setBusinessVerified(false);
      setDesignAccessEnabled(false);
      setProfile(
        resolveRequestorProfile({
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: false,
        }),
      );
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [
    businessType,
    isInternalLab,
    token,
    user?.businessVerified,
    user?.requestorCapabilities,
    user?.requestorKind,
    user?.requestorServices,
    user?.role,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUpdated = () => {
      void refresh();
    };
    window.addEventListener(REQUESTOR_ACCESS_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(REQUESTOR_ACCESS_UPDATED_EVENT, onUpdated);
    };
  }, [refresh]);

  return {
    loading,
    refresh,
    invalidate: () =>
      invalidateBusinessMeCache({
        token: token || undefined,
        businessType: businessType || "requestor",
      }),
    membership,
    businessVerified,
    designAccessEnabled,
    profile,
    kind: profile.kind,
    services: profile.services,
    /** @deprecated profile / kind 사용 */
    capabilities: {
      practice: profile.kind === "practice",
      lab: profile.kind === "lab",
    },
    hasCapability: hasRequestorProfile(profile),
    requiresLicense: requiresBusinessLicense(profile.services),
    canUsePaid: canUsePaidServices({
      businessVerified,
      services: profile.services,
    }),
    canUseFree: canUseFreeServices(profile),
    canSendTransfer:
      canSendPracticeTransfer(profile) || user?.role === "practice",
    canReceiveTransfer:
      canReceivePracticeTransfer(profile) || isInternalLab,
  };
};
