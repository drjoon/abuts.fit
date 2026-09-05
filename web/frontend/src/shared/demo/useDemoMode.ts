// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/backend/modules/businesses/business.routes.js
// - web/backend/controllers/businesses/business.demoMode.util.js
// change-log:
// - 2026-09-05: 유료 크레딧(CHARGE_PAID) 지급 시 데모→실사용 자동 전환.
// - 2026-09-05: demoModeStartedAt/ExpiresAt → 남은 일수(데모 N일 남음).
// - 2026-08-26: apiFetch 응답 언랩 수정 — res.data.data.demoMode (뱃지 미표시 원인).
import { useCallback, useEffect, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import {
  DEMO_MODE_DURATION_DAYS,
  resolveDemoModeDaysRemaining,
} from "./demoModeCopy";

type DemoModePayload = {
  demoMode?: boolean;
  demoModeStartedAt?: string | null;
  demoModeExpiresAt?: string | null;
};

type DemoModeState = {
  demoMode: boolean;
  daysRemaining: number | null;
  loading: boolean;
  exiting: boolean;
  refresh: () => Promise<void>;
  exitDemoMode: () => Promise<boolean>;
};

let cachedDemoMode: boolean | null = null;
let cachedDaysRemaining: number | null = null;
let cachedAnchorId: string | null = null;

function readDemoPayload(body: {
  data?: DemoModePayload;
  demoMode?: boolean;
  demoModeStartedAt?: string | null;
  demoModeExpiresAt?: string | null;
}): { demoMode: boolean; daysRemaining: number | null } {
  const payload = body.data || body;
  const demoMode = Boolean(payload?.demoMode);
  if (!demoMode) return { demoMode: false, daysRemaining: null };
  const daysRemaining = resolveDemoModeDaysRemaining({
    startedAt: payload?.demoModeStartedAt,
    expiresAt: payload?.demoModeExpiresAt,
    durationDays: DEMO_MODE_DURATION_DAYS,
  });
  return { demoMode, daysRemaining };
}

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
  const [daysRemaining, setDaysRemaining] = useState<number | null>(() => {
    if (
      businessAnchorId &&
      cachedAnchorId === String(businessAnchorId) &&
      cachedDemoMode
    ) {
      return cachedDaysRemaining;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [exiting, setExiting] = useState(false);

  const applyPayload = useCallback(
    (body: {
      data?: DemoModePayload;
      demoMode?: boolean;
      demoModeStartedAt?: string | null;
      demoModeExpiresAt?: string | null;
    }) => {
      const next = readDemoPayload(body);
      setDemoMode(next.demoMode);
      setDaysRemaining(next.daysRemaining);
      cachedDemoMode = next.demoMode;
      cachedDaysRemaining = next.daysRemaining;
      cachedAnchorId = businessAnchorId ? String(businessAnchorId) : null;
    },
    [businessAnchorId],
  );

  const refresh = useCallback(async () => {
    if (!businessAnchorId) {
      setDemoMode(false);
      setDaysRemaining(null);
      setLoading(false);
      cachedDemoMode = false;
      cachedDaysRemaining = null;
      cachedAnchorId = null;
      return;
    }
    if (role !== "requestor" && role !== "practice") {
      setDemoMode(false);
      setDaysRemaining(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await request<{
        success?: boolean;
        data?: DemoModePayload;
      }>({
        path: "/api/businesses/me?businessType=requestor",
        method: "GET",
      });
      applyPayload(res.data || {});
    } catch {
      try {
        const bal = await request<{
          success?: boolean;
          data?: DemoModePayload;
        }>({
          path: "/api/credits/balance",
          method: "GET",
        });
        applyPayload(bal.data || {});
      } catch {
        setDemoMode(false);
        setDaysRemaining(null);
      }
    } finally {
      setLoading(false);
    }
  }, [applyPayload, businessAnchorId, role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 유료 입금 등으로 서버가 데모 종료하면 잔액 이벤트로 뱃지·라벨을 즉시 갱신
  useAppEventListener({
    eventTypes: ["credit:balance-updated"],
    enabled: Boolean(businessAnchorId) && demoMode,
    onMatch: (evt) => {
      if (!isCreditEventForBusiness(evt, businessAnchorId)) return;
      void refresh();
    },
  });

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
      if (!res.ok || !res.data?.success) return false;
      setDemoMode(false);
      setDaysRemaining(null);
      cachedDemoMode = false;
      cachedDaysRemaining = null;
      cachedAnchorId = businessAnchorId ? String(businessAnchorId) : null;
      return true;
    } catch {
      return false;
    } finally {
      setExiting(false);
    }
  }, [businessAnchorId]);

  return { demoMode, daysRemaining, loading, exiting, refresh, exitDemoMode };
}
