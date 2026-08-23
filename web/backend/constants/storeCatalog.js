// change-log:
// - 2026-08-23: 스토어 카탈로그·포함가 SSOT (프론트 storeCatalog와 동기).
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - rules.md §2.3

/** productId → 부가세 포함 판매가(원). */
export const STORE_PRODUCT_INCLUSIVE_PRICES = Object.freeze({
  "simple-abutment-2": 110_000,
  "simple-healing-2": 55_000,
  "bone-pen": 220_000,
  "bone-pin": 88_000,
  "check-pin": 165_000,
  "bone-shaper": 132_000,
  "gingival-shaper": 99_000,
});

export const STORE_PRODUCT_NAMES = Object.freeze({
  "simple-abutment-2": "SimpleAbutment2",
  "simple-healing-2": "SimpleHealing2",
  "bone-pen": "BonePen",
  "bone-pin": "BonePin",
  "check-pin": "CheckPin",
  "bone-shaper": "BoneShaper",
  "gingival-shaper": "GingivalShaper",
});

/** 신규 재고 문서 기본 수량. */
export const STORE_INVENTORY_DEFAULT_QTY = 100;

export function listStoreProductIds() {
  return Object.keys(STORE_PRODUCT_INCLUSIVE_PRICES);
}

export function getStoreProductPriceInclusive(productId) {
  const key = String(productId || "").trim();
  const price = STORE_PRODUCT_INCLUSIVE_PRICES[key];
  return Number.isFinite(price) ? price : null;
}

export function getStoreProductName(productId) {
  const key = String(productId || "").trim();
  return STORE_PRODUCT_NAMES[key] || key;
}
