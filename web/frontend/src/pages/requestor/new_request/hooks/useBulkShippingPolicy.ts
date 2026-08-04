// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/models/businessAnchor.model.js
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";

const SHIPPING_POLICY_STORAGE_PREFIX = "abutsfit:shipping-policy:v1:";

type DefaultShippingMode = "normal" | "express";

type ShippingPolicyResult = {
  shippingMode: "countBased" | "weeklyBased";
  summary: string;
  weeklyBatchDays: string[];
  weeklyBatchLabel: string;
  defaultShippingMode: DefaultShippingMode;
};

const dayLabels: Record<string, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
};

const dayOrderIndex: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const normalizeWeeklyBatchDays = (raw: string[]) =>
  Array.from(
    new Set(
      raw
        .map((day) => String(day).trim())
        .filter((day) => Object.keys(dayLabels).includes(day)),
    ),
  );

const normalizeDefaultShippingMode = (raw: unknown): DefaultShippingMode =>
  raw === "express" ? "express" : "normal";

const getKstDayIndex = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCDay();
};

const orderDaysFromNext = (days: string[]) => {
  const todayIndex = getKstDayIndex();
  return [...days].sort((a, b) => {
    const aIndex = dayOrderIndex[a] ?? 0;
    const bIndex = dayOrderIndex[b] ?? 0;
    const aDiff = (aIndex - todayIndex + 7) % 7 || 7;
    const bDiff = (bIndex - todayIndex + 7) % 7 || 7;
    return aDiff - bDiff;
  });
};

const formatWeekdayLabel = (days: string[]) => {
  const ordered = orderDaysFromNext(days);
  return ordered
    .map((d) => dayLabels[d] || "")
    .filter(Boolean)
    .join("/");
};

const buildShippingPolicyResult = (
  weeklyBatchDays: string[],
  shippingMode: "countBased" | "weeklyBased" = "countBased",
  defaultShippingMode: DefaultShippingMode = "normal",
): ShippingPolicyResult => ({
  shippingMode,
  summary: "",
  weeklyBatchDays,
  weeklyBatchLabel: formatWeekdayLabel(weeklyBatchDays),
  defaultShippingMode: normalizeDefaultShippingMode(defaultShippingMode),
});

const getLocalShippingPolicy = (
  email?: string | null,
): ShippingPolicyResult => {
  const key = `${SHIPPING_POLICY_STORAGE_PREFIX}${email || "guest"}`;
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    const shippingMode = parsed.shippingMode || "countBased";
    const autoBatchThreshold = parsed.autoBatchThreshold || 20;
    const maxWaitDays = parsed.maxWaitDays || 5;
    const weeklyBatchDays = normalizeWeeklyBatchDays(
      Array.isArray(parsed.weeklyBatchDays) ? parsed.weeklyBatchDays : [],
    );
    const defaultShippingMode = normalizeDefaultShippingMode(
      parsed.defaultShippingMode,
    );
    void autoBatchThreshold;
    void maxWaitDays;
    return buildShippingPolicyResult(
      weeklyBatchDays,
      shippingMode,
      defaultShippingMode,
    );
  } catch {
    return buildShippingPolicyResult([]);
  }
};

const saveLocalShippingPolicy = (
  email: string | null | undefined,
  weeklyBatchDays: string[],
  defaultShippingMode: DefaultShippingMode = "normal",
) => {
  const key = `${SHIPPING_POLICY_STORAGE_PREFIX}${email || "guest"}`;
  try {
    if (typeof window !== "undefined") {
      let prev: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(key);
        prev = raw ? JSON.parse(raw) : {};
      } catch {
        prev = {};
      }
      const data = {
        ...prev,
        shippingMode: "weeklyBased",
        weeklyBatchDays,
        defaultShippingMode: normalizeDefaultShippingMode(defaultShippingMode),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (error) {
    console.error(
      "[useBulkShippingPolicy] Failed to save to localStorage:",
      error,
    );
  }
};

export function useBulkShippingPolicy(email?: string | null) {
  const { token, user } = useAuthStore();
  const [policy, setPolicy] = useState<ShippingPolicyResult>(() =>
    getLocalShippingPolicy(email),
  );
  const businessType = useMemo(() => {
    return resolveBusinessType(user?.role, "requestor");
  }, [user?.role]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await apiFetch<any>({
          path: `/api/businesses/me?businessType=${encodeURIComponent(
            businessType,
          )}`,
          method: "GET",
          token,
        });

        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        const weeklyDays = normalizeWeeklyBatchDays(
          data?.shippingPolicy?.weeklyBatchDays || [],
        );
        const defaultShippingMode = normalizeDefaultShippingMode(
          data?.shippingPolicy?.defaultShippingMode,
        );
        if (cancelled) return;

        setPolicy((prev) => {
          const nextDays =
            weeklyDays.length > 0 ? weeklyDays : prev.weeklyBatchDays;
          saveLocalShippingPolicy(email, nextDays, defaultShippingMode);
          return {
            ...prev,
            weeklyBatchDays: nextDays,
            weeklyBatchLabel: formatWeekdayLabel(nextDays),
            defaultShippingMode,
          };
        });
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [businessType, token, user?.role, email]);

  const setWeeklyBatchDays = (days: string[]) => {
    const weeklyDays = normalizeWeeklyBatchDays(days);
    setPolicy((prev) => {
      saveLocalShippingPolicy(email, weeklyDays, prev.defaultShippingMode);
      return {
        ...prev,
        weeklyBatchDays: weeklyDays,
        weeklyBatchLabel: formatWeekdayLabel(weeklyDays),
      };
    });
  };

  const setDefaultShippingMode = (mode: DefaultShippingMode) => {
    const nextMode = normalizeDefaultShippingMode(mode);
    setPolicy((prev) => {
      saveLocalShippingPolicy(email, prev.weeklyBatchDays, nextMode);
      return {
        ...prev,
        defaultShippingMode: nextMode,
      };
    });
  };

  return {
    ...policy,
    setWeeklyBatchDays,
    setDefaultShippingMode,
  };
}
