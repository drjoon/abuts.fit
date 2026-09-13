// change-log:
// - 2026-09-13: catalog 동봉 가능·다음 치과 도착일.
// - 2026-09-13: catalog products 단가 오버레이(관리자 가격 반영).
// - 2026-09-13: BA.storePackageBuyer 플래그 조회(장부 누적 대신).
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/frontend/src/shared/store/storeCatalog.ts
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  STORE_PACKAGE_PREPAID_THRESHOLD,
  type StoreProduct,
} from "@/shared/store/storeCatalog";
import { STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS } from "@/shared/store/storeShipping";

export type StoreCatalogPriceRow = {
  listPriceInclusive: number | null;
  packagePriceInclusive: number | null;
};

export type StorePackagePricingState = {
  loading: boolean;
  isPackageBuyer: boolean;
  packageThreshold: number;
  /** productId → 유효 단가(서버 카탈로그) */
  priceByProductId: Record<string, StoreCatalogPriceRow>;
  labBundleEligible: boolean;
  labBundleWithinDays: number;
  /** 오늘(KST) 포함 다음 치과 도착일 YYYY-MM-DD */
  nextClinicArrivalYmd: string | null;
};

const DEFAULT: StorePackagePricingState = {
  loading: true,
  isPackageBuyer: false,
  packageThreshold: STORE_PACKAGE_PREPAID_THRESHOLD,
  priceByProductId: {},
  labBundleEligible: false,
  labBundleWithinDays: STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS,
  nextClinicArrivalYmd: null,
};

/**
 * GET /api/store/catalog.
 * SSOT: BusinessAnchor.storePackageBuyer + 서버 판매가/pkg가.
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
        products?: Array<{
          productId?: string;
          listPriceInclusive?: number | null;
          packagePriceInclusive?: number | null;
        }>;
        packagePricing?: {
          threshold?: number;
          isPackageBuyer?: boolean;
        };
        shippingPolicy?: {
          labBundleEligible?: boolean;
          labBundleWithinDays?: number;
          nextClinicArrivalYmd?: string | null;
        };
      };
    }>({ path: "/api/store/catalog" })
      .then((res) => {
        if (cancelled) return;
        const pkg = res.data?.data?.packagePricing;
        const ship = res.data?.data?.shippingPolicy;
        const priceByProductId: Record<string, StoreCatalogPriceRow> = {};
        for (const row of res.data?.data?.products || []) {
          const id = String(row.productId || "").trim();
          if (!id) continue;
          priceByProductId[id] = {
            listPriceInclusive:
              row.listPriceInclusive == null
                ? null
                : Math.round(Number(row.listPriceInclusive)),
            packagePriceInclusive:
              row.packagePriceInclusive == null
                ? null
                : Math.round(Number(row.packagePriceInclusive)),
          };
        }
        const nextYmd = String(ship?.nextClinicArrivalYmd || "").trim();
        setState({
          loading: false,
          isPackageBuyer: Boolean(pkg?.isPackageBuyer),
          packageThreshold: Math.max(
            1,
            Math.round(
              Number(pkg?.threshold || STORE_PACKAGE_PREPAID_THRESHOLD),
            ),
          ),
          priceByProductId,
          labBundleEligible: Boolean(ship?.labBundleEligible),
          labBundleWithinDays: Math.max(
            1,
            Math.round(
              Number(
                ship?.labBundleWithinDays || STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS,
              ),
            ),
          ),
          nextClinicArrivalYmd: /^\d{4}-\d{2}-\d{2}$/.test(nextYmd)
            ? nextYmd
            : null,
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

/** 로컬 카탈로그 상품에 서버 단가를 입힌다. */
export function applyStoreCatalogPrices(
  product: StoreProduct,
  priceByProductId: Record<string, StoreCatalogPriceRow>,
): StoreProduct {
  const row = priceByProductId[product.id];
  const options = product.options?.map((opt) => {
    const optRow = priceByProductId[opt.id];
    if (!optRow) return opt;
    return {
      ...opt,
      listPriceInclusive:
        optRow.listPriceInclusive !== undefined
          ? optRow.listPriceInclusive
          : opt.listPriceInclusive,
      packagePriceInclusive:
        optRow.packagePriceInclusive !== undefined
          ? optRow.packagePriceInclusive
          : opt.packagePriceInclusive,
    };
  });
  const next: StoreProduct = {
    ...product,
    ...(options ? { options } : {}),
  };
  if (!row) return next;
  return {
    ...next,
    listPriceInclusive:
      row.listPriceInclusive !== undefined
        ? row.listPriceInclusive
        : next.listPriceInclusive,
    packagePriceInclusive:
      row.packagePriceInclusive !== undefined
        ? row.packagePriceInclusive
        : next.packagePriceInclusive,
  };
}

export function useStoreProductsWithServerPrices(
  products: StoreProduct[],
): StoreProduct[] {
  const { priceByProductId } = useStorePackagePricing();
  return useMemo(
    () =>
      products.map((p) => applyStoreCatalogPrices(p, priceByProductId)),
    [products, priceByProductId],
  );
}
