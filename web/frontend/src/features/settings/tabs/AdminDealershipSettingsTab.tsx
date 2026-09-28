// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/backend/controllers/admin/admin.settings.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-09-28: 딜러십 영업 수수료 카드 제거(스토어·커스텀어벗 분배 딜러%와 중복).
// - 2026-09-27: 심플웨이 딜러 10% · 커스텀어벗 딜러 20%. 기공 제외.
// - 2026-09-25: 신규 유치 요율 20% 고정. 15%/10% 선택·인하 예약 제거.
// - 2026-09-24: (철회) 월 매출 누진 구간.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

/** 커스텀어벗 영업 수수료. 대시보드 스탬프와 잔여 분배 딜러%. */
const ABUTMENT_SHARE_PCT = 20;
const ABUTMENT_RATE = ABUTMENT_SHARE_PCT / 100;
/** 심플웨이(스토어) 영업 수수료. 판매가 대비 딜러 분배%. */
const STORE_SHARE_PCT = 10;

type CreditSettingsPayload = {
  dealershipActiveCommissionRate?: number | null;
  dealershipEventCommissionRate?: number | null;
  dealershipEventCommissionEnabled?: boolean;
  dealershipRateChangeScheduledAt?: string | Date | null;
  dealershipRateChangeScheduledRate?: number | null;
  salesmanSharePercent?: number | null;
  storeSalesmanSharePercent?: number | null;
  manufacturerSharePercent?: number | null;
  devopsSharePercent?: number | null;
  storeManufacturerSharePercent?: number | null;
  storeDevopsSharePercent?: number | null;
  storeDealerRateChangeScheduledAt?: string | Date | null;
  storeDealerRateChangeScheduledRate?: number | null;
};

type CreditsApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    creditSettings?: CreditSettingsPayload;
  };
};

function needsLock(settings: CreditSettingsPayload): boolean {
  const active = Number(
    settings.dealershipActiveCommissionRate ??
      settings.dealershipEventCommissionRate,
  );
  if (settings.dealershipRateChangeScheduledAt) return true;
  if (settings.dealershipRateChangeScheduledRate != null) return true;
  if (settings.storeDealerRateChangeScheduledAt) return true;
  if (settings.storeDealerRateChangeScheduledRate != null) return true;
  if (Number.isFinite(active) && Math.abs(active - ABUTMENT_RATE) > 0.0001) {
    return true;
  }
  const dealerShares: Array<[number | null | undefined, number]> = [
    [settings.salesmanSharePercent, ABUTMENT_SHARE_PCT],
    [settings.storeSalesmanSharePercent, STORE_SHARE_PCT],
  ];
  return dealerShares.some(([value, expected]) => {
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n - expected) > 0.001;
  });
}

function abutsAfterDealer(
  manufacturer: number | null | undefined,
  devops: number | null | undefined,
  manufacturerFallback: number,
  devopsFallback: number,
  dealerPct: number,
): number {
  const mfr = Number.isFinite(Number(manufacturer))
    ? Number(manufacturer)
    : manufacturerFallback;
  const ops = Number.isFinite(Number(devops)) ? Number(devops) : devopsFallback;
  return Math.max(0, Math.round((100 - mfr - dealerPct - ops) * 100) / 100);
}

/** 딜러 요율 고정(심플웨이 10% · 커스텀어벗 20%). 화면 없이 설정만 맞춘다. */
export function AdminDealershipSettingsTab() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!token || lockedRef.current) return;
    let mounted = true;
    const run = async () => {
      const res = await apiFetch<CreditsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "GET",
        token,
        skipCache: true,
      });
      if (!mounted || !res.ok) return;
      const settings = res.data?.data?.creditSettings || {};
      if (!needsLock(settings)) return;
      lockedRef.current = true;
      const saved = await apiFetch<CreditsApiResponse>({
        path: "/api/admin/settings/credits",
        method: "PATCH",
        token,
        jsonBody: {
          dealershipActiveCommissionRate: ABUTMENT_RATE,
          dealershipEventCommissionRate: ABUTMENT_RATE,
          dealershipEventCommissionEnabled: true,
          dealershipRateChangeScheduledAt: null,
          dealershipRateChangeScheduledRate: null,
          storeDealerRateChangeScheduledAt: null,
          storeDealerRateChangeScheduledRate: null,
          salesmanSharePercent: ABUTMENT_SHARE_PCT,
          storeSalesmanSharePercent: STORE_SHARE_PCT,
          abutsSharePercent: abutsAfterDealer(
            settings.manufacturerSharePercent,
            settings.devopsSharePercent,
            50,
            5,
            ABUTMENT_SHARE_PCT,
          ),
          storeAbutsSharePercent: abutsAfterDealer(
            settings.storeManufacturerSharePercent,
            settings.storeDevopsSharePercent,
            50,
            5,
            STORE_SHARE_PCT,
          ),
        },
      });
      if (!saved.ok || !mounted) return;
      void queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["credit-settings"] });
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [token, queryClient]);

  return null;
}
