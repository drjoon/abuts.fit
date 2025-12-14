import { useEffect, useMemo, useState } from "react";
import type { CaseInfos } from "./newRequestTypes";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

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
  const today = new Date();

  if (maxDiameter === undefined || maxDiameter <= 8) {
    const shipDate = addWeekdays(today, 1);
    return shipDate.toISOString().split("T")[0];
  }

  const currentDay = today.getDay();
  const targetDow = 3;

  let daysToAdd = targetDow - currentDay;
  if (currentDay > 1) {
    daysToAdd += 7;
  }
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }

  const shipDate = new Date(today);
  shipDate.setDate(today.getDate() + daysToAdd);
  return shipDate.toISOString().split("T")[0];
};

export function useExpressShipping(caseInfos?: CaseInfos) {
  const { token, user } = useAuthStore();
  const [expressArrivalDate, setExpressArrivalDate] = useState<
    string | undefined
  >(undefined);
  const [resolvedExpressShipDate, setResolvedExpressShipDate] = useState<
    string | undefined
  >(undefined);

  const expressShipDate = useMemo(() => {
    // UI용 기본값(백엔드 응답이 오면 resolvedExpressShipDate로 대체)
    if (caseInfos?.shippingMode === "express" && caseInfos?.requestedShipDate) {
      return caseInfos.requestedShipDate;
    }
    return calculateExpressDate(caseInfos?.maxDiameter);
  }, [
    caseInfos?.maxDiameter,
    caseInfos?.requestedShipDate,
    caseInfos?.shippingMode,
  ]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!expressShipDate) {
        if (!cancelled) setExpressArrivalDate(undefined);
        return;
      }

      try {
        const res = await apiFetch<{
          success: boolean;
          data?: any;
          message?: string;
        }>({
          path: `/api/requests/shipping-estimate?mode=express&shipYmd=${encodeURIComponent(
            expressShipDate
          )}`,
          method: "GET",
          token,
          headers: token
            ? {
                "x-mock-role": user?.role,
              }
            : undefined,
        });

        const nextArrival =
          res.ok && (res.data as any)?.success
            ? (res.data as any)?.data?.arrivalDateYmd
            : undefined;
        const nextShip =
          res.ok && (res.data as any)?.success
            ? (res.data as any)?.data?.shipDateYmd
            : undefined;

        if (!cancelled) {
          setExpressArrivalDate(nextArrival);
          setResolvedExpressShipDate(nextShip);
        }
      } catch {
        if (!cancelled) {
          setExpressArrivalDate(undefined);
          setResolvedExpressShipDate(undefined);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [expressShipDate]);

  return useMemo(
    () => ({
      calculateExpressDate,
      expressShipDate: resolvedExpressShipDate || expressShipDate,
      expressArrivalDate,
    }),
    [expressArrivalDate, expressShipDate, resolvedExpressShipDate]
  );
}
