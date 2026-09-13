// related files:
// - web/frontend/src/shared/noOrderAlerts/types.ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import type { NoOrderAlertsData } from "./types";

export type NoOrderAlertsApiPath =
  | "/api/admin/no-order-alerts"
  | "/api/salesman/no-order-alerts"
  | "/api/sales-team/no-order-alerts";

export function useNoOrderAlerts(
  apiPath: NoOrderAlertsApiPath,
  queryKey: string,
) {
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: [queryKey],
    enabled: Boolean(token),
    queryFn: async (): Promise<NoOrderAlertsData> => {
      const res = await apiFetch<{
        success?: boolean;
        data?: NoOrderAlertsData;
        message?: string;
      }>({
        path: apiPath,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error(res.data?.message || "무주문 알람 조회에 실패했습니다.");
      }
      const data = res.data?.data;
      return {
        summary: {
          count3m: Number(data?.summary?.count3m || 0),
          count6m: Number(data?.summary?.count6m || 0),
          total: Number(data?.summary?.total || 0),
        },
        items: Array.isArray(data?.items) ? data.items : [],
      };
    },
    retry: false,
  });
}
