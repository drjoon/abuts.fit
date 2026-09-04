// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - 2026-08-19: 기공소 공급 기본값을 고시(1.5만/2.5만)로.
// - 2026-08-22: 환봉 생산 기본값을 CNC와 동일(1.5만/2.5만)로.
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
  manufacturerRequestUnitPrice: number;
  devopsRequestUnitPrice: number;
  salesmanRequestUnitPrice: number;
  manufacturerShippingUnitPrice: number;
  affiliateVatRate: number;
  expressFee: number;
  /** 기공의뢰 신속처리 할증(1 초과~2) */
  practiceRushFeeMultiplier: number;
  designFee: number;
  abutmentDesignLabFee: number;
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
  labProductionPrice: number;
  labDesignAndProductionPrice: number;
  labRoundBarProductionPrice: number;
  labRoundBarDesignAndProductionPrice: number;
}

export const CREDIT_SETTINGS_DEFAULTS: CreditSettings = {
  minCreditForRequest: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  shippingFee: 3500,
  manufacturerRequestUnitPrice: 8800,
  devopsRequestUnitPrice: 775,
  salesmanRequestUnitPrice: 2325,
  manufacturerShippingUnitPrice: 3500,
  affiliateVatRate: 0.1,
  expressFee: 2000,
  practiceRushFeeMultiplier: 1,
  designFee:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE -
    ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  abutmentDesignLabFee: 10000,
  abutmentRetailPrice: 40000,
  practiceMembershipMonthlyFee: ABUTS_PRACTICE_MEMBERSHIP_MONTHLY_FEE_DEFAULT,
  defaultRequestFreeCredit: 0,
  defaultShippingFreeCredit: 0,
  membershipProductionPrice: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  regularProductionPrice: ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  membershipDesignAndProductionPrice:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  regularDesignAndProductionPrice:
    ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  membershipRoundBarProductionPrice: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  regularRoundBarProductionPrice: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  membershipRoundBarDesignAndProductionPrice:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  regularRoundBarDesignAndProductionPrice:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  labProductionPrice: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  labDesignAndProductionPrice:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  labRoundBarProductionPrice: ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  labRoundBarDesignAndProductionPrice:
    ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
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
        manufacturerRequestUnitPrice: Number(
          raw.manufacturerRequestUnitPrice ??
            CREDIT_SETTINGS_DEFAULTS.manufacturerRequestUnitPrice,
        ),
        devopsRequestUnitPrice: Number(
          raw.devopsRequestUnitPrice ??
            CREDIT_SETTINGS_DEFAULTS.devopsRequestUnitPrice,
        ),
        salesmanRequestUnitPrice: Number(
          raw.salesmanRequestUnitPrice ??
            CREDIT_SETTINGS_DEFAULTS.salesmanRequestUnitPrice,
        ),
        manufacturerShippingUnitPrice: Number(
          raw.manufacturerShippingUnitPrice ??
            CREDIT_SETTINGS_DEFAULTS.manufacturerShippingUnitPrice,
        ),
        affiliateVatRate: (() => {
          const rawRate = Number(
            raw.affiliateVatRate ?? CREDIT_SETTINGS_DEFAULTS.affiliateVatRate,
          );
          if (!Number.isFinite(rawRate) || rawRate < 0) {
            return CREDIT_SETTINGS_DEFAULTS.affiliateVatRate;
          }
          return Math.min(1, rawRate);
        })(),
        expressFee: Number(
          raw.expressFee ?? CREDIT_SETTINGS_DEFAULTS.expressFee,
        ),
        practiceRushFeeMultiplier: (() => {
          const n = Number(
            raw.practiceRushFeeMultiplier ??
              CREDIT_SETTINGS_DEFAULTS.practiceRushFeeMultiplier,
          );
          if (!Number.isFinite(n) || n <= 1) {
            return CREDIT_SETTINGS_DEFAULTS.practiceRushFeeMultiplier;
          }
          return Math.min(2, Math.round(n * 100) / 100);
        })(),
        designFee: Math.max(
          0,
          abutmentPrices.membershipDesignAndProductionPrice -
            abutmentPrices.membershipProductionPrice,
        ),
        abutmentDesignLabFee: Math.max(
          0,
          Number(
            raw.abutmentDesignLabFee ??
              CREDIT_SETTINGS_DEFAULTS.abutmentDesignLabFee,
          ) || 0,
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
        defaultShippingFreeCredit: 0,
        ...abutmentPrices,
        labProductionPrice: Number(
          raw.labProductionPrice ??
            abutmentPrices.membershipProductionPrice ??
            CREDIT_SETTINGS_DEFAULTS.labProductionPrice,
        ),
        labDesignAndProductionPrice: Number(
          raw.labDesignAndProductionPrice ??
            abutmentPrices.membershipDesignAndProductionPrice ??
            CREDIT_SETTINGS_DEFAULTS.labDesignAndProductionPrice,
        ),
        labRoundBarProductionPrice: (() => {
          const rawVal = Number(raw.labRoundBarProductionPrice);
          if (Number.isFinite(rawVal) && rawVal > 0) return Math.round(rawVal);
          return abutmentPrices.membershipRoundBarProductionPrice;
        })(),
        labRoundBarDesignAndProductionPrice: (() => {
          const rawVal = Number(raw.labRoundBarDesignAndProductionPrice);
          if (Number.isFinite(rawVal) && rawVal > 0) return Math.round(rawVal);
          return abutmentPrices.membershipRoundBarDesignAndProductionPrice;
        })(),
      };
      return { creditSettings } as SystemSettingsData;
    },
    retry: false,
    staleTime: 60 * 1000,
  });
};
