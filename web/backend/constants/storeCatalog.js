// change-log:
// - 2026-09-14: 판매가표 재동기 — 풀패키지 Surgical+Prosthetic×1 + Abutment 4종×72(판매합 663.52만)·패키지 판매가 500만.
// - 2026-09-14: 제조단가표 동기 — Surgical pkg 88만. Prosthetic 케이스 12.1·Gingival 4.4·Hex 3.3·Torque 8.8×2. 명칭 Hex/NonHex. Prosthetic 구성 GS×3·Driver S/M/L.
// - 2026-09-13: pkg 자격=500만 패키지(full-package) 구매(크레딧 충전 트리거 제거).
// - 2026-09-13: Surgical Kit 통합. 레거시 Initial/Check SKU는 판매·재고 목록에서 제외(이름만 유지).
// - 2026-09-13: Surgical Kit 통합(Initial+Check). 판매 132/88만·pkg 99/66. 단품 제조×2(Pen 6.6·Gingival 3.96·Torque 9.9). 풀패키지 구성합 682만·SA2/SH2×150.
// - 2026-09-13: Kit Case 3종(Initial 13.2·Check/Prosthetic 11만)×2.
// - 2026-09-13: 판매가표 동기 — 키트 88/96/88만·pkg 66/88/66, 단품 제조×2(Pen 5.5·Cup 0.55·Pin 2.75·Shaper 3.85·Hex 1.65).
// - 2026-09-13: 500만 패키지·임계. 케이스 제조 11만×2. SA/SH 패키지 각 100EA.
// - 2026-09-13: pkg=판매가×0.8 초과·5500원 배수(부가세 포함 500원·공급가 정수).
// - 2026-09-13: 제조단가표 갱신. BA pkg 플래그.
// - 2026-08-23: 스토어 카탈로그·포함가 SSOT (프론트 storeCatalog와 동기).
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/backend/utils/storePackagePricing.js
// - web/backend/models/storeProductPrice.model.js
// - rules.md §2.3

/** 500만 패키지 상품 ID. 결제 확정 시 BA.storePackageBuyer ON. */
export const STORE_FULL_PACKAGE_PRODUCT_ID = "full-package";

/** 500만 패키지 판매가(부가세 포함). 카탈로그·안내 카피용. */
export const STORE_PACKAGE_PREPAID_THRESHOLD = 5_000_000;

/**
 * pkg 포함가 스텝 (3만원 이상): LCM(500, 11) = 5,500.
 * 3만원 미만: 100원 단위(판매가×0.8 이상·판매가 미만).
 */
export const STORE_PACKAGE_PRICE_STEP = 5_500;
export const STORE_PACKAGE_PRICE_STEP_UNDER_30K = 100;

/**
 * 판매가×0.8 기준 pkg 포함가.
 * - 3만원 미만: 100원 단위(×0.8을 100원으로 맞춤, 할인 유지)
 * - 3만원 이상: 5500원 배수(부가세 포함 500원·공급가 정수)
 */
export function packageInclusiveFromList(listInclusive) {
  const list = Number(listInclusive);
  if (!Number.isFinite(list) || list <= 0) return 0;
  const floor = list * 0.8;

  if (list < 30_000) {
    // 100원 단위. ×0.8을 올림하되 판매가와 같아지면(할인 없음) 내림.
    let pkg = Math.ceil(floor / STORE_PACKAGE_PRICE_STEP_UNDER_30K) *
      STORE_PACKAGE_PRICE_STEP_UNDER_30K;
    if (pkg >= list) {
      pkg =
        Math.floor(floor / STORE_PACKAGE_PRICE_STEP_UNDER_30K) *
        STORE_PACKAGE_PRICE_STEP_UNDER_30K;
    }
    if (pkg <= 0) return list;
    return pkg < list ? pkg : list;
  }

  const stepped =
    (Math.floor(floor / STORE_PACKAGE_PRICE_STEP) + 1) * STORE_PACKAGE_PRICE_STEP;
  if (stepped <= list) return stepped;
  const by500 = (Math.floor(floor / 500) + 1) * 500;
  return by500 <= list ? by500 : list;
}

/**
 * 판매가(부가세 포함) 기본값.
 * 키트·어벗: 판매가 고시. 단품: 제조단가(만원)×2.
 * 신규 판매·재고 SSOT. 레거시 SKU는 NAMES만 유지(과거 주문 표시).
 */
export const STORE_PRODUCT_INCLUSIVE_PRICES = Object.freeze({
  "full-package": 6_635_200, // Surgical 132 + Prosthetic 88 + Abutment 4종×72×1.54
  "surgical-kit": 1_320_000,
  "prosthetic-kit": 880_000,
  "kit-case-surgical": 264_000, // mfg 13.2만 ×2
  "kit-case-prosthetic": 242_000, // mfg 12.1만 ×2
  "initial-pen": 132_000, // SurgicalPen · mfg Pen 6.6만 ×2
  pen: 132_000, // mfg 6.6만 ×2
  cup: 11_000, // mfg 0.55만 ×2
  "check-pin": 55_000, // SurgicalPin · mfg 2.75만 ×2
  "bone-shaper": 77_000, // mfg 3.85만 ×2
  "gingival-shaper": 88_000, // mfg 4.4만 ×2
  "hex-driver": 66_000, // mfg 3.3만 ×2
  "torque-wrench": 176_000, // mfg 8.8만 ×2
  "simple-abutment-2": 15_400,
  "simple-healing-2": 15_400,
  "simple-abutment": 15_400,
  "simple-healing": 15_400,
});

/** pkg가 기본값. full-package·키트·어벗은 고시가, 단품은 packageInclusiveFromList. */
export const STORE_PRODUCT_PACKAGE_INCLUSIVE_PRICES = Object.freeze({
  "full-package": 5_000_000,
  "surgical-kit": 880_000,
  "prosthetic-kit": 660_000,
  "kit-case-surgical": packageInclusiveFromList(264_000),
  "kit-case-prosthetic": packageInclusiveFromList(242_000),
  "initial-pen": packageInclusiveFromList(132_000),
  pen: packageInclusiveFromList(132_000),
  cup: packageInclusiveFromList(11_000),
  "check-pin": packageInclusiveFromList(55_000),
  "bone-shaper": packageInclusiveFromList(77_000),
  "gingival-shaper": packageInclusiveFromList(88_000),
  "hex-driver": packageInclusiveFromList(66_000),
  "torque-wrench": packageInclusiveFromList(176_000),
  "simple-abutment-2": 12_100,
  "simple-healing-2": 12_100,
  "simple-abutment": 12_100,
  "simple-healing": 12_100,
});

/** 풀패키지는 누구나 패키지 판매가(500만)로 결제. */
export const STORE_ALWAYS_PACKAGE_PRICE_IDS = Object.freeze(
  new Set([STORE_FULL_PACKAGE_PRODUCT_ID]),
);

export const STORE_PRODUCT_NAMES = Object.freeze({
  "full-package": "500만 패키지",
  "surgical-kit": "Surgical Kit",
  "prosthetic-kit": "Prosthetic Kit",
  "initial-kit": "Initial Kit",
  "check-kit": "Check Kit",
  "kit-case-surgical": "Kit Case · Surgical",
  "kit-case-initial": "Kit Case · Initial",
  "kit-case-check": "Kit Case · Check",
  "kit-case-prosthetic": "Kit Case · Prosthetic",
  /** 레거시 주문 표시용(신규 주문 불가). */
  "kit-case": "Kit Case",
  "initial-pen": "SurgicalPen",
  pen: "Pen",
  cup: "Cup",
  "initial-pin": "InitialPin",
  "check-pin": "SurgicalPin",
  "bone-shaper": "BoneShaper",
  "gingival-shaper": "GingivalShaper",
  "hex-driver": "Hex Driver",
  "torque-wrench": "Torque wrench",
  "simple-abutment-2": "SimpleAbutment-Hex",
  "simple-healing-2": "SimpleHealing-Hex",
  "simple-abutment": "SimpleAbutment-NonHex",
  "simple-healing": "SimpleHealing-NonHex",
});

/** 신규 재고 문서 기본 수량. */
export const STORE_INVENTORY_DEFAULT_QTY = 100;

/** @type {Record<string, { listPriceInclusive?: number|null, packagePriceInclusive?: number|null }>} */
let storePriceOverrides = Object.create(null);

export function setStorePriceOverrides(map) {
  storePriceOverrides = map && typeof map === "object" ? map : Object.create(null);
}

export function getStorePriceOverrides() {
  return storePriceOverrides;
}

export function listStoreProductIds() {
  return Object.keys(STORE_PRODUCT_INCLUSIVE_PRICES);
}

export function getStoreProductPriceInclusive(productId) {
  const key = String(productId || "").trim();
  const override = storePriceOverrides[key]?.listPriceInclusive;
  if (override != null && Number.isFinite(Number(override))) {
    return Math.round(Number(override));
  }
  const price = STORE_PRODUCT_INCLUSIVE_PRICES[key];
  return Number.isFinite(price) ? price : null;
}

export function getStoreProductPackagePriceInclusive(productId) {
  const key = String(productId || "").trim();
  const override = storePriceOverrides[key]?.packagePriceInclusive;
  if (override != null && Number.isFinite(Number(override))) {
    return Math.round(Number(override));
  }
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
