// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  normalizeAbutsAbutmentCreditPrices,
} from "@/shared/pricing/abutsAbutmentService";

type CreditSettingsApiResponse = {
  success?: boolean;
  data?: {
    creditSettings?: Partial<CreditSettings>;
  };
};

export interface CreditSettings {
  minCreditForRequest: number;
  shippingFee: number;
  expressFee: number;
  designFee: number;
  abutmentRetailPrice: number;
  practiceMembershipMonthlyFee: number;
  defaultRequestFreeCredit: number;
  defaultShippingFreeCredit: number;
  membershipProductionPrice: number;
  regularProductionPrice: number;
  membershipDesignAndProductionPrice: number;
  regularDesignAndProductionPrice: number;
  membershipRoundBarProductionPrice: number;
  regularRoundBarProductionPrice: number;
  membershipRoundBarDesignAndProductionPrice: number;
  regularRoundBarDesignAndProductionPrice: number;
}

export const CREDIT_SETTINGS_DEFAULTS: CreditSettings = {
  minCreditForRequest: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  shippingFee: 3500,
  expressFee: 2000,
  designFee:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE -
    ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  abutmentRetailPrice: 40000,
  practiceMembershipMonthlyFee: ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  defaultRequestFreeCredit: 30000,
  defaultShippingFreeCredit: 7000,
  membershipProductionPrice: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  regularProductionPrice: ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  membershipDesignAndProductionPrice:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  regularDesignAndProductionPrice:
    ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  membershipRoundBarProductionPrice: 0,
  regularRoundBarProductionPrice: 0,
  membershipRoundBarDesignAndProductionPrice: 0,
  regularRoundBarDesignAndProductionPrice: 0,
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
      const abutmentPrices = normalizeAbutsAbutmentCreditPrices(raw);
      const creditSettings: CreditSettings = {
        minCreditForRequest: abutmentPrices.membershipProductionPrice,
        shippingFee: Number(raw.shippingFee ?? CREDIT_SETTINGS_DEFAULTS.shippingFee),
        expressFee: Number(
          raw.expressFee ?? CREDIT_SETTINGS_DEFAULTS.expressFee,
        ),
        designFee: Math.max(
          0,
          abutmentPrices.membershipDesignAndProductionPrice -
            abutmentPrices.membershipProductionPrice,
        ),
        abutmentRetailPrice: Number(
          raw.abutmentRetailPrice ?? CREDIT_SETTINGS_DEFAULTS.abutmentRetailPrice,
        ),
        practiceMembershipMonthlyFee: Number(
          raw.practiceMembershipMonthlyFee ??
            CREDIT_SETTINGS_DEFAULTS.practiceMembershipMonthlyFee,
        ),
        defaultRequestFreeCredit: Number(
          raw.defaultRequestFreeCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit,
        ),
        defaultShippingFreeCredit: Number(
          raw.defaultShippingFreeCredit ??
            CREDIT_SETTINGS_DEFAULTS.defaultShippingFreeCredit,
        ),
        ...abutmentPrices,
        membershipRoundBarProductionPrice: Number(
          raw.membershipRoundBarProductionPrice ??
            CREDIT_SETTINGS_DEFAULTS.membershipRoundBarProductionPrice,
        ),
        regularRoundBarProductionPrice: Number(
          raw.regularRoundBarProductionPrice ??
            CREDIT_SETTINGS_DEFAULTS.regularRoundBarProductionPrice,
        ),
        membershipRoundBarDesignAndProductionPrice: Number(
          raw.membershipRoundBarDesignAndProductionPrice ??
            CREDIT_SETTINGS_DEFAULTS.membershipRoundBarDesignAndProductionPrice,
        ),
        regularRoundBarDesignAndProductionPrice: Number(
          raw.regularRoundBarDesignAndProductionPrice ??
            CREDIT_SETTINGS_DEFAULTS.regularRoundBarDesignAndProductionPrice,
        ),
      };
      return { creditSettings } as SystemSettingsData;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};
