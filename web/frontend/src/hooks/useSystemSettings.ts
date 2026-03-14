import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";

export interface CreditSettings {
  minCreditForRequest: number;
  shippingFee: number;
  defaultFreeShippingCredit: number;
}

export interface SystemSettingsData {
  creditSettings: CreditSettings;
}

export const useSystemSettings = () => {
  return useQuery({
    queryKey: ["credit-settings"],
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/credits/settings",
        method: "GET",
      });
      if (!res.ok) {
        throw new Error("크레딧 설정 조회 실패");
      }
      // 응답 형식: { success: true, data: { creditSettings: {...} } }
      const creditSettings = res.data?.data?.creditSettings || {
        minCreditForRequest: 10000,
        shippingFee: 3500,
        defaultFreeShippingCredit: 3500,
      };
      return { creditSettings } as SystemSettingsData;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};
