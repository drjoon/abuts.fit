// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings> & {
      defaultWelcomeBonusCredit?: number;
      defaultFreeShippingCredit?: number;
    };
  };
};

export interface CreditSettings {
  minCreditForRequest: number;
  shippingFee: number;
  defaultRequestFreeCredit: number;
  defaultShippingFreeCredit: number;
  defaultWelcomeBonusCredit?: number; // legacy 호환 (앱 안정화 후 삭제 예정)
  defaultFreeShippingCredit?: number; // legacy 호환 (앱 안정화 후 삭제 예정)
}

export const CREDIT_SETTINGS_DEFAULTS: CreditSettings = {
  minCreditForRequest: 10000,
  shippingFee: 3500,
  defaultRequestFreeCredit: 30000,
  defaultShippingFreeCredit: 7000,
  defaultWelcomeBonusCredit: 30000, // legacy 호환 (앱 안정화 후 삭제 예정)
  defaultFreeShippingCredit: 7000, // legacy 호환 (앱 안정화 후 삭제 예정)
};

export interface SystemSettingsData {
  creditSettings: CreditSettings;
}

export const useSystemSettings = () => {
  return useQuery({
    queryKey: ["credit-settings"],
    queryFn: async () => {
      const res = await apiFetch<CreditSettingsApiResponse>({
        path: "/api/credits/settings",
        method: "GET",
      });
      if (!res.ok) {
        throw new Error("크레딧 설정 조회 실패");
      }
      // 응답 형식: { success: true, data: { creditSettings: {...} } }
      const raw = res.data?.data?.creditSettings || {};
      const creditSettings: CreditSettings = {
        minCreditForRequest: Number(
          raw.minCreditForRequest ?? CREDIT_SETTINGS_DEFAULTS.minCreditForRequest,
        ),
        shippingFee: Number(raw.shippingFee ?? CREDIT_SETTINGS_DEFAULTS.shippingFee),
        defaultRequestFreeCredit: Number(
          raw.defaultRequestFreeCredit ??
            raw.defaultWelcomeBonusCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit,
        ),
        defaultShippingFreeCredit: Number(
          raw.defaultShippingFreeCredit ??
            raw.defaultFreeShippingCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultShippingFreeCredit,
        ),
        defaultWelcomeBonusCredit: Number(
          raw.defaultRequestFreeCredit ??
            raw.defaultWelcomeBonusCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit,
        ), // legacy 호환 (앱 안정화 후 삭제 예정)
        defaultFreeShippingCredit: Number(
          raw.defaultShippingFreeCredit ??
            raw.defaultFreeShippingCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultShippingFreeCredit,
        ), // legacy 호환 (앱 안정화 후 삭제 예정)
      };
      return { creditSettings } as SystemSettingsData;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};
