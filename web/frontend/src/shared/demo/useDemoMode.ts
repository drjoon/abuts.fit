// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/DemoConversionPromptModal.tsx
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/backend/modules/businesses/business.routes.js
// - web/backend/controllers/businesses/business.demoMode.util.js
// change-log:
// - 2026-10-04: 치과 전용 90일 데모. expired/conversionPending 노출, 전환은 기공소 직접지급 확인 후 완료.
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
  conversionPending?: boolean;
  requestorKind?: string | null;
};

type DemoSnapshot = {
  demoMode: boolean;
  daysRemaining: number | null;
  expired: boolean;
  conversionPending: boolean;
};

export type DemoConversionLab = {
  labAnchorId: string;
  labName: string;
  amount: number;
  isAbutsLab: boolean;
  status: "PENDING" | "CONFIRMED";
};

export type RequestDemoConversionResult = {
  ok: boolean;
  completed: boolean;
  labs: DemoConversionLab[];
};

type DemoModeState = DemoSnapshot & {
  loading: boolean;
  exiting: boolean;
  refresh: () => Promise<void>;
  requestConversion: () => Promise<RequestDemoConversionResult>;
};

const EMPTY: DemoSnapshot = {
  demoMode: false,
  daysRemaining: null,
  expired: false,
  conversionPending: false,
};

let cachedSnapshot: DemoSnapshot | null = null;
let cachedAnchorId: string | null = null;

function readDemoPayload(body: {
  data?: DemoModePayload;
} & DemoModePayload): DemoSnapshot {
  const payload = body.data || body;
  // 데모는 치과 전용. 기공소는 항상 비활성.
  if (!payload?.demoMode || payload?.requestorKind === "lab") return EMPTY;
  const daysRemaining = resolveDemoModeDaysRemaining({
    startedAt: payload?.demoModeStartedAt,
    expiresAt: payload?.demoModeExpiresAt,
    durationDays: DEMO_MODE_DURATION_DAYS,
  });
  return {
    demoMode: true,
    daysRemaining,
    expired: daysRemaining != null && daysRemaining <= 0,
    conversionPending: Boolean(payload?.conversionPending),
  };
}

export function useDemoMode(): DemoModeState {
  const businessAnchorId = useAuthStore((s) => s.user?.businessAnchorId);
  const role = useAuthStore((s) => s.user?.role);

  const [snapshot, setSnapshot] = useState<DemoSnapshot>(() =>
    businessAnchorId &&
    cachedAnchorId === String(businessAnchorId) &&
    cachedSnapshot
      ? cachedSnapshot
      : EMPTY,
  );
  const [loading, setLoading] = useState(true);
  const [exiting, setExiting] = useState(false);

  const applySnapshot = useCallback(
    (next: DemoSnapshot) => {
      setSnapshot(next);
      cachedSnapshot = next;
      cachedAnchorId = businessAnchorId ? String(businessAnchorId) : null;
    },
    [businessAnchorId],
  );

  const refresh = useCallback(async () => {
    if (!businessAnchorId || (role !== "requestor" && role !== "practice")) {
      applySnapshot(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await request<{ success?: boolean; data?: DemoModePayload }>({
        path: "/api/businesses/me?businessType=requestor",
        method: "GET",
      });
      applySnapshot(readDemoPayload(res.data || {}));
    } catch {
      try {
        const bal = await request<{
          success?: boolean;
          data?: DemoModePayload;
        }>({ path: "/api/credits/balance", method: "GET" });
        applySnapshot(readDemoPayload(bal.data || {}));
      } catch {
        applySnapshot(EMPTY);
      }
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, businessAnchorId, role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 기공소 확인으로 전환이 끝나면 잔액 이벤트로 뱃지·모달 상태를 즉시 갱신
  useAppEventListener({
    eventTypes: ["credit:balance-updated"],
    enabled: Boolean(businessAnchorId) && snapshot.demoMode,
    onMatch: (evt) => {
      if (!isCreditEventForBusiness(evt, businessAnchorId)) return;
      void refresh();
    },
  });

  const requestConversion =
    useCallback(async (): Promise<RequestDemoConversionResult> => {
      setExiting(true);
      try {
        const res = await request<{
          success?: boolean;
          data?: { completed?: boolean; labs?: DemoConversionLab[] };
        }>({
          path: "/api/businesses/me/exit-demo",
          method: "POST",
        });
        if (!res.ok || !res.data?.success) {
          return { ok: false, completed: false, labs: [] };
        }
        const payload = res.data.data || {};
        await refresh();
        return {
          ok: true,
          completed: Boolean(payload.completed),
          labs: payload.labs || [],
        };
      } catch {
        return { ok: false, completed: false, labs: [] };
      } finally {
        setExiting(false);
      }
    }, [refresh]);

  return { ...snapshot, loading, exiting, refresh, requestConversion };
}
