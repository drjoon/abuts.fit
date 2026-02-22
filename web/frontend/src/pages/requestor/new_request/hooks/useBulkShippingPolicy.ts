import { useMemo } from "react";

const SHIPPING_POLICY_STORAGE_PREFIX = "abutsfit:shipping-policy:v1:";

type ShippingPolicyResult = {
  shippingMode: "countBased" | "weeklyBased";
  summary: string;
};

const getShippingPolicy = (email?: string | null): ShippingPolicyResult => {
  const key = `${SHIPPING_POLICY_STORAGE_PREFIX}${email || "guest"}`;
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    const shippingMode = parsed.shippingMode || "countBased";
    const autoBatchThreshold = parsed.autoBatchThreshold || 20;
    const maxWaitDays = parsed.maxWaitDays || 5;
    const weeklyBatchDays = parsed.weeklyBatchDays || ["mon", "thu"];

    if (shippingMode === "weeklyBased") {
      const dayLabels: Record<string, string> = {
        mon: "월",
        tue: "화",
        wed: "수",
        thu: "목",
        fri: "금",
      };
      const selectedDays = weeklyBatchDays
        .map((d: string) => dayLabels[d])
        .join("/");
      return {
        shippingMode,
        summary: `${selectedDays} 도착`,
      };
    }

    return {
      shippingMode,
      summary: "의뢰일 +1영업일 출고(필요 시 +2영업일)",
    };
  } catch {
    return {
      shippingMode: "countBased",
      summary: "의뢰일 +1영업일 출고(필요 시 +2영업일)",
    };
  }
};

export function useBulkShippingPolicy(email?: string | null) {
  return useMemo(() => getShippingPolicy(email), [email]);
}
