// change-log:
// - 2026-10-04: 패키지 구매자/pkg가 제거. 카탈로그 판매가 오버레이만.
// - 2026-09-23: lab_bundle 동봉 자격 필드 제거(배송비=10만원 임계).
// - 2026-09-13: catalog 동봉 가능·다음 치과 도착일.
// - 2026-09-13: catalog products 단가 오버레이(관리자 가격 반영).
// - 2026-09-13: BA.storePackageBuyer 플래그 조회(장부 누적 대신).
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
// - web/frontend/src/shared/store/storeCatalog.ts
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import type { StoreProduct } from "@/shared/store/storeCatalog";
import {
  STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE,
  STORE_SHIPPING_FEE_INCLUSIVE,
} from "@/shared/store/storeShipping";

export type StoreCatalogPriceRow = {
  listPriceInclusive: number | null;
};

export type StorePackagePricingState = {
  loading: boolean;
  /** productId → 유효 단가(서버 카탈로그) */
  priceByProductId: Record<string, StoreCatalogPriceRow>;
  shippingFeeInclusive: number;
  freeShippingThresholdInclusive: number;
};

const DEFAULT: StorePackagePricingState = {
  loading: true,
  priceByProductId: {},
  shippingFeeInclusive: STORE_SHIPPING_FEE_INCLUSIVE,
  freeShippingThresholdInclusive: STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE,
};

/**
 * GET /api/store/catalog.
 * SSOT: 서버 판매가(부가세 포함) + 배송 정책.
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
        }>;
        shippingPolicy?: {
          feeInclusive?: number;
          freeShippingThresholdInclusive?: number;
        };
      };
    }>({ path: "/api/store/catalog" })
      .then((res) => {
        if (cancelled) return;
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
          };
        }
        setState({
          loading: false,
          priceByProductId,
          shippingFeeInclusive: Math.max(
            0,
            Math.round(
              Number(ship?.feeInclusive ?? STORE_SHIPPING_FEE_INCLUSIVE),
            ),
          ),
          freeShippingThresholdInclusive: Math.max(
            0,
            Math.round(
              Number(
                ship?.freeShippingThresholdInclusive ??
                  STORE_FREE_SHIPPING_THRESHOLD_INCLUSIVE,
              ),
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
