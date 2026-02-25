import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

const SHIPPING_POLICY_STORAGE_PREFIX = "abutsfit:shipping-policy:v1:";

type ShippingPolicyResult = {
  shippingMode: "countBased" | "weeklyBased";
  summary: string;
  weeklyBatchDays: string[];
  weeklyBatchLabel: string;
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
    const selectedDays = formatWeekdayLabel(
      weeklyBatchDays.length ? weeklyBatchDays : ["mon", "thu"],
    );

    if (shippingMode === "weeklyBased") {
      return {
        shippingMode,
        summary: "",
        weeklyBatchDays,
        weeklyBatchLabel: selectedDays,
      };
    }

    return {
      shippingMode,
      summary: "",
      weeklyBatchDays,
      weeklyBatchLabel: selectedDays,
    };
  } catch {
    return {
      shippingMode: "countBased",
      summary: "",
      weeklyBatchDays: ["mon", "thu"],
      weeklyBatchLabel: "월/목",
    };
  }
};

export function useBulkShippingPolicy(email?: string | null) {
  const { token, user } = useAuthStore();
  const [policy, setPolicy] = useState<ShippingPolicyResult>(() =>
    getLocalShippingPolicy(email),
  );
  const organizationType = useMemo(() => {
    const role = String(user?.role || "requestor").trim();
    return role || "requestor";
  }, [user?.role]);

  useEffect(() => {
    setPolicy(getLocalShippingPolicy(email));
  }, [email]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await apiFetch<any>({
          path: `/api/organizations/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
          method: "GET",
          token,
          headers: token
            ? {
                "x-mock-role": user?.role,
              }
            : undefined,
        });

        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        const weeklyDays = normalizeWeeklyBatchDays(
          data?.shippingPolicy?.weeklyBatchDays || [],
        );
        if (!weeklyDays.length || cancelled) return;
        setPolicy((prev) => ({
          ...prev,
          weeklyBatchDays: weeklyDays,
          weeklyBatchLabel: formatWeekdayLabel(weeklyDays),
        }));
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [organizationType, token, user?.role]);

  return policy;
}
