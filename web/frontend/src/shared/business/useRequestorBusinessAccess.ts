// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
import { useCallback, useEffect, useMemo, useState } from "react";
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

export const useRequestorBusinessAccess = () => {
  const { token, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [businessVerified, setBusinessVerified] = useState(false);
  const [profile, setProfile] = useState<RequestorProfile>(emptyProfile);
  const [membership, setMembership] = useState<string>("none");
  const [designAccessEnabled, setDesignAccessEnabled] = useState(false);

  const businessType = useMemo(
    () => resolveBusinessType(user?.role, "requestor"),
    [user?.role],
  );

  const refresh = useCallback(async () => {
    if (!token || user?.role !== "requestor") {
      setLoading(false);
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

    setLoading(true);
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
      setLoading(false);
    }
  }, [
    businessType,
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
    canReceiveTransfer: canReceivePracticeTransfer(profile),
  };
};
