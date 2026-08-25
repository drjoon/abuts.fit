// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/backend/modules/businesses/business.routes.js
// - web/backend/controllers/businesses/business.demoMode.util.js
import { useCallback, useEffect, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

type DemoModeState = {
  demoMode: boolean;
  loading: boolean;
  exiting: boolean;
  refresh: () => Promise<void>;
  exitDemoMode: () => Promise<boolean>;
};

let cachedDemoMode: boolean | null = null;
let cachedAnchorId: string | null = null;

export function useDemoMode(): DemoModeState {
  const businessAnchorId = useAuthStore((s) => s.user?.businessAnchorId);
  const role = useAuthStore((s) => s.user?.role);
  const [demoMode, setDemoMode] = useState(() => {
    if (
      businessAnchorId &&
      cachedAnchorId === String(businessAnchorId) &&
      cachedDemoMode != null
    ) {
      return cachedDemoMode;
    }
    return false;
  });
  const [loading, setLoading] = useState(true);
  const [exiting, setExiting] = useState(false);

  const refresh = useCallback(async () => {
    if (!businessAnchorId) {
      setDemoMode(false);
      setLoading(false);
      cachedDemoMode = false;
      cachedAnchorId = null;
      return;
    }
    if (role !== "requestor" && role !== "practice") {
      setDemoMode(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await request<{
        success?: boolean;
        data?: { demoMode?: boolean };
      }>({
        path: "/api/businesses/me?businessType=requestor",
        method: "GET",
      });
      const next = Boolean(res?.data?.demoMode);
      setDemoMode(next);
      cachedDemoMode = next;
      cachedAnchorId = String(businessAnchorId);
    } catch {
      // balance API 폴백
      try {
        const bal = await request<{
          success?: boolean;
          data?: { demoMode?: boolean };
        }>({
          path: "/api/credits/balance",
          method: "GET",
        });
        const next = Boolean(bal?.data?.demoMode);
        setDemoMode(next);
        cachedDemoMode = next;
        cachedAnchorId = String(businessAnchorId);
      } catch {
        setDemoMode(false);
      }
    } finally {
      setLoading(false);
    }
  }, [businessAnchorId, role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exitDemoMode = useCallback(async () => {
    setExiting(true);
    try {
      const res = await request<{
        success?: boolean;
        data?: { demoMode?: boolean };
      }>({
        path: "/api/businesses/me/exit-demo",
        method: "POST",
      });
      if (!res?.success) return false;
      setDemoMode(false);
      cachedDemoMode = false;
      cachedAnchorId = businessAnchorId ? String(businessAnchorId) : null;
      return true;
    } catch {
      return false;
    } finally {
      setExiting(false);
    }
  }, [businessAnchorId]);

  return { demoMode, loading, exiting, refresh, exitDemoMode };
}
