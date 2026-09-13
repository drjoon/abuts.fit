// change-log:
// - 2026-09-13: 첨 가격표 판매가·pkg가. 키트 SKU + 어벗 EA. 충전≥550만 pkg.
// - 2026-08-23: 스토어 카탈로그·포함가 SSOT (프론트 storeCatalog와 동기).
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/backend/utils/storePackagePricing.js
// - rules.md §2.3

/** 패키지(pkg) 단가 적용 기준: 유료 크레딧(CHARGE_PAID) 누적 충전액. */
export const STORE_PACKAGE_PREPAID_THRESHOLD = 5_500_000;

/**
 * productId → 부가세 포함 판매가(원).
 * 단위: 키트=키트당, 어벗=1EA. 가격표(만원) × 10,000.
 */
export const STORE_PRODUCT_INCLUSIVE_PRICES = Object.freeze({
  "initial-kit": 1_100_000,
  "check-kit": 1_100_000,
  "prosthetic-kit": 1_100_000,
  "simple-abutment-2": 15_400,
  "simple-healing-2": 15_400,
});

/** productId → 부가세 포함 pkg가(원). 없으면 패키지 할인 없음. */
export const STORE_PRODUCT_PACKAGE_INCLUSIVE_PRICES = Object.freeze({
  "initial-kit": 880_000,
  "check-kit": 880_000,
  "prosthetic-kit": 880_000,
  "simple-abutment-2": 12_100,
  "simple-healing-2": 12_100,
});

export const STORE_PRODUCT_NAMES = Object.freeze({
  "initial-kit": "Initial Kit",
  "check-kit": "Check Kit",
  "prosthetic-kit": "Prosthetic Kit",
  "simple-abutment-2": "SimpleAbutment2",
  "simple-healing-2": "SimpleHealing2",
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

export function getStoreProductPackagePriceInclusive(productId) {
  const key = String(productId || "").trim();
  const price = STORE_PRODUCT_PACKAGE_INCLUSIVE_PRICES[key];
  return Number.isFinite(price) ? price : null;
}

/**
 * 패키지 구매자면 pkg가(있을 때), 아니면 판매가.
 * @param {string} productId
 * @param {boolean} isPackageBuyer
 */
export function resolveStoreUnitPriceInclusive(productId, isPackageBuyer) {
  const list = getStoreProductPriceInclusive(productId);
  if (list == null) return null;
  if (!isPackageBuyer) return list;
  const pkg = getStoreProductPackagePriceInclusive(productId);
  return pkg != null ? pkg : list;
}

export function getStoreProductName(productId) {
  const key = String(productId || "").trim();
  return STORE_PRODUCT_NAMES[key] || key;
}
