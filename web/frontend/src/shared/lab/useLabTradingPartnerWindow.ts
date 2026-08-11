// related files:
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
import { useCallback, useEffect, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

export type LabTradingPartnerWindow = {
  canInvite?: boolean;
  remainingDays?: number | null;
  elapsedDays?: number | null;
  windowDays?: number;
  pricingBaseDate?: string | null;
};

export const useLabTradingPartnerWindow = () => {
  const { token } = useAuthStore();
  const { loading: accessLoading, kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab";
  const [loading, setLoading] = useState(false);
  const [windowInfo, setWindowInfo] = useState<LabTradingPartnerWindow | null>(
    null,
  );

  const refresh = useCallback(async () => {
    if (!token || !isLab) {
      setWindowInfo(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await request<{
        data?: LabTradingPartnerWindow;
      }>({
        path: "/api/lab-trading-partners/window",
        method: "GET",
        token,
      });
      if (!res.ok) {
        setWindowInfo(null);
        return;
      }
      setWindowInfo(res.data?.data || null);
    } catch {
      setWindowInfo(null);
    } finally {
      setLoading(false);
    }
  }, [isLab, token]);

  useEffect(() => {
    if (accessLoading) return;
    void refresh();
  }, [accessLoading, refresh]);

  const remainingDays =
    windowInfo?.remainingDays == null
      ? null
      : Number(windowInfo.remainingDays);
  const canInvite = Boolean(windowInfo?.canInvite) && (remainingDays ?? 0) > 0;

  return {
    loading: accessLoading || loading,
    isLab,
    windowInfo,
    canInvite,
    remainingDays,
    refresh,
  };
};
