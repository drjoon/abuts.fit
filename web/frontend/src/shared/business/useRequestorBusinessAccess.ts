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
  hasAnyRequestorCapability,
  normalizeRequestorCapabilities,
  requiresBusinessLicense,
  resolveRequestorCapabilities,
  type RequestorCapabilities,
} from "@/shared/business/requestorCapabilities";

export const useRequestorBusinessAccess = () => {
  const { token, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [businessVerified, setBusinessVerified] = useState(false);
  const [capabilities, setCapabilities] = useState<RequestorCapabilities>({
    practice: false,
    lab: false,
  });
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
      setCapabilities(
        resolveRequestorCapabilities({
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
      setCapabilities(
        resolveRequestorCapabilities({
          anchorCaps: data?.requestorCapabilities,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: verified,
        }),
      );
    } catch {
      setBusinessVerified(false);
      setDesignAccessEnabled(false);
      setCapabilities(
        resolveRequestorCapabilities({
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

  const caps = normalizeRequestorCapabilities(capabilities);

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
    capabilities: caps,
    hasCapability: hasAnyRequestorCapability(caps),
    requiresLicense: requiresBusinessLicense(caps),
    canUsePaid: canUsePaidServices({ businessVerified, caps }),
    canUseFree: canUseFreeServices(caps),
    canSendTransfer: canSendPracticeTransfer(caps) || user?.role === "practice",
    canReceiveTransfer: canReceivePracticeTransfer(caps),
  };
};
