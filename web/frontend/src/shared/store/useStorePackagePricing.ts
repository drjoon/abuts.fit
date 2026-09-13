// change-log:
// - 2026-09-13: 스토어 패키지 구매자(충전≥550만) 조회 훅.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/frontend/src/shared/store/storeCatalog.ts
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { STORE_PACKAGE_PREPAID_THRESHOLD } from "@/shared/store/storeCatalog";

export type StorePackagePricingState = {
  loading: boolean;
  isPackageBuyer: boolean;
  paidChargeTotal: number;
  packageThreshold: number;
};

const DEFAULT: StorePackagePricingState = {
  loading: true,
  isPackageBuyer: false,
  paidChargeTotal: 0,
  packageThreshold: STORE_PACKAGE_PREPAID_THRESHOLD,
};

/**
 * GET /api/store/catalog 의 packagePricing.
 * 유료 크레딧(CHARGE_PAID) 누적 ≥ threshold → isPackageBuyer.
 */
export function useStorePackagePricing(): StorePackagePricingState {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<StorePackagePricingState>(DEFAULT);

  useEffect(() => {
    if (!token) {
      setState({ ...DEFAULT, loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    void apiFetch<{
      success?: boolean;
      data?: {
        packagePricing?: {
          threshold?: number;
          isPackageBuyer?: boolean;
          paidChargeTotal?: number;
        };
      };
    }>({ path: "/api/store/catalog" })
      .then((res) => {
        if (cancelled) return;
        const pkg = res?.data?.packagePricing;
        setState({
          loading: false,
          isPackageBuyer: Boolean(pkg?.isPackageBuyer),
          paidChargeTotal: Math.max(0, Math.round(Number(pkg?.paidChargeTotal || 0))),
          packageThreshold: Math.max(
            1,
            Math.round(
              Number(pkg?.threshold || STORE_PACKAGE_PREPAID_THRESHOLD),
            ),
          ),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ ...DEFAULT, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
