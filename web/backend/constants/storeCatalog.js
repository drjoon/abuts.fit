// change-log:
// - 2026-09-13: pkg=판매가×0.8 초과·5500원 배수(부가세 포함 500원·공급가 정수).
// - 2026-09-13: 제조단가표 갱신(케이스 7.7·Pen 6.6·셰이퍼 6.6·Hex 2.2·Torque 8.8).
// - 2026-09-13: 제조단가×2 단품가(100원 올림). torque/pen 추가. BA pkg 플래그.
// - 2026-09-13: 키트 단품 분해가 + 550만 풀패키지 SKU. 첨 가격표 동기.
// - 2026-09-13: 첨 가격표 판매가·pkg가. 키트 SKU + 어벗 EA. 충전≥550만 pkg.
// - 2026-08-23: 스토어 카탈로그·포함가 SSOT (프론트 storeCatalog와 동기).
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/backend/utils/storePackagePricing.js
// - rules.md §2.3

/** 패키지(pkg) 단가: BA.storePackageBuyer 또는 단건 충전≥이 금액 시 플래그 ON. */
export const STORE_PACKAGE_PREPAID_THRESHOLD = 5_500_000;

/**
 * pkg 포함가 스텝: LCM(500, 11).
 * - 500원 단위
 * - ÷1.1 공급가가 원 단위 정수 (부가세 10%)
 */
export const STORE_PACKAGE_PRICE_STEP = 5_500;

/**
 * 판매가×0.8보다 큰 최소 5500원 배수.
 * 예: 154,000 → ×0.8=123,200 → 126,500 (공급 115,000 + 세 11,500).
 * 5500 배수가 판매가를 넘으면 500원 단위로 맞추고 판매가 이하로 캡.
 */
export function packageInclusiveFromList(listInclusive) {
  const list = Number(listInclusive);
  if (!Number.isFinite(list) || list <= 0) return 0;
  const floor = list * 0.8;
  const stepped =
    (Math.floor(floor / STORE_PACKAGE_PRICE_STEP) + 1) * STORE_PACKAGE_PRICE_STEP;
  if (stepped <= list) return stepped;
  const by500 = (Math.floor(floor / 500) + 1) * 500;
  return by500 <= list ? by500 : list;
}

/**
 * 판매가(부가세 포함).
 * 키트·어벗: 판매가 고시(110/1.54). 단품: 제조단가(만원)×2.
 */
export const STORE_PRODUCT_INCLUSIVE_PRICES = Object.freeze({
  "full-package": 6_996_000,
  "initial-kit": 1_100_000,
  "check-kit": 1_100_000,
  "prosthetic-kit": 1_100_000,
  "kit-case": 154_000, // mfg 7.7만 ×2
  "initial-pen": 154_000, // mfg 7.7만 ×2 (펜+컵)
  pen: 132_000, // mfg 6.6만 ×2
  cup: 22_000, // mfg 1.1만 ×2
  "initial-pin": 66_000, // mfg 3.3만 ×2
  "check-pin": 66_000,
  "bone-shaper": 132_000, // mfg 6.6만 ×2
  "gingival-shaper": 132_000,
  "hex-driver": 44_000, // mfg 2.2만 ×2
  "torque-wrench": 176_000, // mfg 8.8만 ×2
  "simple-abutment-2": 15_400, // mfg 0.77만 ×2
  "simple-healing-2": 15_400,
  "simple-abutment": 15_400,
  "simple-healing": 15_400,
});

/** pkg가. full-package·키트·어벗은 고시가, 단품은 packageInclusiveFromList. */
export const STORE_PRODUCT_PACKAGE_INCLUSIVE_PRICES = Object.freeze({
  "full-package": 5_500_000,
  "initial-kit": 880_000,
  "check-kit": 880_000,
  "prosthetic-kit": 880_000,
  "kit-case": packageInclusiveFromList(154_000),
  "initial-pen": packageInclusiveFromList(154_000),
  pen: packageInclusiveFromList(132_000),
  cup: packageInclusiveFromList(22_000),
  "initial-pin": packageInclusiveFromList(66_000),
  "check-pin": packageInclusiveFromList(66_000),
  "bone-shaper": packageInclusiveFromList(132_000),
  "gingival-shaper": packageInclusiveFromList(132_000),
  "hex-driver": packageInclusiveFromList(44_000),
  "torque-wrench": packageInclusiveFromList(176_000),
  "simple-abutment-2": 12_100, // 15,400×0.8
  "simple-healing-2": 12_100,
  "simple-abutment": 12_100,
  "simple-healing": 12_100,
});

/** 풀패키지는 누구나 패키지 판매가(550만)로 결제. */
export const STORE_ALWAYS_PACKAGE_PRICE_IDS = Object.freeze(
  new Set(["full-package"]),
);

export const STORE_PRODUCT_NAMES = Object.freeze({
  "full-package": "550만 패키지",
  "initial-kit": "Initial Kit",
  "check-kit": "Check Kit",
  "prosthetic-kit": "Prosthetic Kit",
  "kit-case": "Kit Case",
  "initial-pen": "InitialPen",
  pen: "Pen",
  cup: "Cup",
  "initial-pin": "InitialPin",
  "check-pin": "CheckPin",
  "bone-shaper": "BoneShaper",
  "gingival-shaper": "GingivalShaper",
  "hex-driver": "Hex Driver",
  "torque-wrench": "Torque wrench",
  "simple-abutment-2": "SimpleAbutment2",
  "simple-healing-2": "SimpleHealing2",
  "simple-abutment": "SimpleAbutment",
  "simple-healing": "SimpleHealing",
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
 * full-package는 항상 패키지 판매가.
 */
export function resolveStoreUnitPriceInclusive(productId, isPackageBuyer) {
  const key = String(productId || "").trim();
  const list = getStoreProductPriceInclusive(key);
  if (list == null) return null;
  const forcePkg = STORE_ALWAYS_PACKAGE_PRICE_IDS.has(key);
  if (!isPackageBuyer && !forcePkg) return list;
  const pkg = getStoreProductPackagePriceInclusive(key);
  return pkg != null ? pkg : list;
}

export function getStoreProductName(productId) {
  const key = String(productId || "").trim();
  return STORE_PRODUCT_NAMES[key] || key;
}
