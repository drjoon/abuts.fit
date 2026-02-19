import { useEffect, useMemo, useState } from "react";
import type { CaseInfos } from "./newRequestTypes";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";

const addWeekdays = (startDate: Date, days: number) => {
  let count = 0;
  const current = new Date(startDate);
  while (count < days) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      count += 1;
    }
  }
  return current;
};

const calculateExpressDate = (maxDiameter?: number) => {
  const base = new Date();
  const d =
    typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
      ? maxDiameter
      : null;

  const days = d != null && d >= 10 ? 4 : 1;
  const shipDate = addWeekdays(base, days);
  return toKstYmd(shipDate) || "";
};

export function useExpressShipping(caseInfos?: CaseInfos) {
  const { token, user } = useAuthStore();
  const [expressEstimatedShipYmd, setExpressEstimatedShipYmd] = useState<
    string | undefined
  >(undefined);

  const maxDiameter = caseInfos?.maxDiameter;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (maxDiameter == null) {
        if (!cancelled) setExpressEstimatedShipYmd(undefined);
        return;
      }

      try {
        const res = await apiFetch<{
          success: boolean;
          data?: any;
          message?: string;
        }>({
          path: `/api/requests/shipping-estimate?mode=express&maxDiameter=${encodeURIComponent(
            String(maxDiameter),
          )}`,
          method: "GET",
          token,
          headers: token
            ? {
                "x-mock-role": user?.role,
              }
            : undefined,
        });

        const nextShip =
          res.ok && (res.data as any)?.success
            ? (res.data as any)?.data?.estimatedShipYmd
            : undefined;

        if (!cancelled) setExpressEstimatedShipYmd(nextShip);
      } catch {
        if (!cancelled) setExpressEstimatedShipYmd(undefined);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [maxDiameter, token, user?.role]);

  return useMemo(
    () => ({
      calculateExpressDate,
      expressEstimatedShipYmd,
    }),
    [expressEstimatedShipYmd],
  );
}
