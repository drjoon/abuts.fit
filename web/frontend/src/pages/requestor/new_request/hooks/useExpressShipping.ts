import { useEffect, useMemo, useState } from "react";
import type { CaseInfos } from "./newRequestTypes";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
const calculateExpressDate = () => {
  return "";
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
          headers: {
            "x-mock-role": user?.role || "requestor",
          },
        });

        const nextShip =
          res.ok && (res.data as any)?.success
            ? (res.data as any)?.data?.estimatedShipYmd
            : undefined;

        if (!cancelled) setExpressEstimatedShipYmd(nextShip);
      } catch (err) {
        console.error("[useExpressShipping] API error:", err);
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
