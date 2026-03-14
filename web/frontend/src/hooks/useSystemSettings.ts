import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export interface CreditSettings {
  minCreditForRequest: number;
  shippingFee: number;
  defaultFreeShippingCredit: number;
}

export interface SystemSettingsData {
  creditSettings: CreditSettings;
}

export const useSystemSettings = () => {
  const { token } = useAuthStore();

  return useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/admin/settings",
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("시스템 설정 조회 실패");
      }
      const body = res.data;
      const data = body?.data || body;
      return (data?.settings || {}) as SystemSettingsData;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: !!token,
  });
};
