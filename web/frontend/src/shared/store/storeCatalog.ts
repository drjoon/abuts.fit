// change-log:
// - 2026-10-04: 패키지 할인(pkg가) 폐지 — 단일 판매가만.
// - 2026-10-04: 판매 노출 — Abutment 4종 + Grip Driver만. 키트·패키지·기타 단품 제거.
// - 2026-09-19: 판매·구성 재동기 — Surgical 154/pkg 121, Prosthetic 110/pkg 88(Grip Driver×5·Scan bar×4), Abutment 1.65/pkg 1.32×60. 풀패키지 구성합 660만·판매가 500만. 단품=제조×2.
// - 2026-09-14: 판매가표 재동기 — 풀패키지 Surgical+Prosthetic×1 + Abutment 4종×72(판매합 663.52만)·패키지 판매가 500만.
// - 2026-09-14: 제조단가표 동기 — Surgical pkg 88만. Prosthetic 케이스 12.1·Gingival 4.4·Hex 3.3·Torque 8.8×2. Hex/NonHex 명칭. Prosthetic GS×3·Driver S/M/L.
// - 2026-09-13: Surgical Kit 통합(Initial+Check). 판매 132/88만·pkg 99/66. 단품 제조×2(Pen 6.6·Gingival 3.96·Torque 9.9). 풀패키지 구성합 682만·SA2/SH2×150.
// - 2026-09-13: Kit Case Surgical/Prosthetic 2종(제조 13.2·11만)×2.
// - 2026-09-13: 상세 본문은 storeProductContent.ts (acrodent OCR 텍스트+순수 이미지).
// - 2026-09-13: pkg=판매가×0.8 초과·5500원 배수(부가세 포함 500원·공급가 정수).
// - 2026-09-13: 이미지·표기 acrodent.com 동기.
// - 2026-08-23: 상품 blurb·description 문구 축약.
// related files:
// - web/frontend/src/shared/store/storeProductContent.ts
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/pages/requestor/store/RequestorStoreProductPage.tsx
// - web/backend/constants/storeCatalog.js

export type StoreProductSpec = {
  label: string;
  value: string;
};

/** 필수 선택 옵션. 장바구니·주문에는 option.id(구매 SKU)가 담긴다. */
export type StoreProductOption = {
  id: string;
  label: string;
  listPriceInclusive?: number | null;
};

export type StoreProduct = {
  id: string;
  name: string;
  image: string;
  blurb: string;
  /** 원본 여백이 클 때 썸네일 확대 (예: 1.45) */
  imageScale?: number;
  /** 상세 페이지 상단 제품 설명 */
  description?: string;
  /** 갤러리 썸네일 */
  galleryImages?: string[];
  /** acrodent 상세 HTML에서 가져온 사용법·스펙 상세 이미지 */
  contentImages?: string[];
  specs?: StoreProductSpec[];
  /**
   * 스토어 기성품은 겸영 과세 매출(루트 rules.md §2.3).
   * 고객 표시는 부가세 포함가.
   */
  taxType?: "과세" | "면세";
  /** 부가세 포함 판매가(원). null이면 라벨만. */
  listPriceInclusive?: number | null;
  /** 구매 전 필수 옵션(Kit Case 등). */
  options?: StoreProductOption[];
  /** 카드 가격을 최저가~ 로 표시. */
  priceFrom?: boolean;
};

export type StoreCategory = {
  id: string;
  label: string;
  products: StoreProduct[];
};

/**
 * 치과·기공소 스토어 카탈로그.
 * Abutment 4종 + Grip Driver. 이미지·명칭: acrodent.com 기준.
 */
export const STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "abutment",
    label: "Abutment",
    products: [
      {
        id: "simple-abutment-2",
        name: "SimpleAbutment-Hex",
        image: "/store/acrodent/simple-abutment-2.jpg",
        blurb: "Hex · 2-piece · D-cut(B,L)",
        description:
          "Hex, 2-piece. 직경·커프 사이즈 인식 가능한 D-cut(B,L) with fillet. 높이 S·M·L·XL × 직경 6·7·9 — 12종.",
        galleryImages: ["/store/acrodent/simple-abutment-2.jpg"],
        contentImages: ["/store/detail/simple-abutment-2-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "형태", value: "Hex, 2-piece, D-cut(B,L) with fillet" },
          { label: "규격", value: "높이 S·M·L·XL × 직경 6·7·9 (12종)" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-healing-2",
        name: "SimpleHealing-Hex",
        image: "/store/acrodent/simple-healing-2.jpg",
        blurb: "Healing Abut. · Hex · 12종",
        description:
          "높이 S(2.0)·M(3.5)·L(5.0)·XL(6.5), 직경 6·7·9 — 12종. Fixture 식립 후 치은 치유·형성.",
        galleryImages: ["/store/acrodent/simple-healing-2.jpg"],
        contentImages: ["/store/detail/simple-healing-2-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "높이", value: "S 2.0 / M 3.5 / L 5.0 / XL 6.5 mm" },
          { label: "직경", value: "6 · 7 · 9 (12종)" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-abutment",
        name: "SimpleAbutment-NonHex",
        image: "/store/acrodent/simple-abutment.jpg",
        blurb: "Simple Abut. [Non-Hex]",
        description:
          "acrodent Simple Abut. [Non-Hex]. 높이 XS(0.5)·S(2.0)·M(3.5)·L(5.0)·XL(6.5) × 직경 6·7·9 — 15종.",
        galleryImages: ["/store/acrodent/simple-abutment.jpg"],
        contentImages: ["/store/detail/simple-abutment-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "acrodent", value: "Simple Abut. [Non-Hex]" },
          { label: "높이", value: "XS 0.5 / S 2.0 / M 3.5 / L 5.0 / XL 6.5 mm" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-healing",
        name: "SimpleHealing-NonHex",
        image: "/store/acrodent/simple-healing.jpg",
        blurb: "Healing Abut. · Non-Hex",
        description:
          "acrodent Healing Abut. [Non-Hex]. Fixture 식립 후 치은 치유·형성용. 힐링·어벗 각 15종.",
        galleryImages: ["/store/acrodent/simple-healing.jpg"],
        contentImages: ["/store/detail/simple-healing-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "acrodent", value: "Healing Abut. [Non-Hex]" },
          { label: "규격", value: "힐링·어벗 각 15종" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
  {
    id: "parts",
    label: "Grip Driver",
    products: [
      {
        id: "hex-driver",
        name: "Grip Driver",
        image: "/store/acrodent/hex-driver.jpg",
        blurb: "Hand S·M·L · Handpiece M·L",
        description:
          "Grip Driver. Hand S·M·L, Handpiece M·L — 5종. 제조 2.2만 ×2 = 4.4만.",
        galleryImages: ["/store/acrodent/hex-driver.jpg"],
        contentImages: ["/store/detail/hex-driver-1.jpg"],
        specs: [
          { label: "구성", value: "Hand S·M·L, Handpiece M·L (5종)" },
          { label: "용도", value: "어벗 체결" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
];

export type StoreSlide = StoreProduct & {
  categoryId: string;
  categoryLabel: string;
};

export const STORE_SLIDES: StoreSlide[] = STORE_CATEGORIES.flatMap(
  (category) =>
    category.products.map((product) => ({
      ...product,
      categoryId: category.id,
      categoryLabel: category.label,
    })),
);

/** 판매가(부가세 포함). 백엔드 storeCatalog.js 와 동기. */
const STORE_LIST_INCLUSIVE_PRICES: Record<string, number> = {
  "hex-driver": 44_000, // Grip Driver mfg 2.2만 ×2
  "simple-abutment-2": 16_500,
  "simple-healing-2": 16_500,
  "simple-abutment": 16_500,
  "simple-healing": 16_500,
};

/** 타일 여백 보정 — 흰 배경 큰 상품일수록 확대. 어벗 4종은 원본(1). */
const STORE_IMAGE_SCALES: Record<string, number> = {
  "hex-driver": 1.9,
};

function withStoreTaxDefaults(product: StoreProduct): StoreProduct {
  const options = product.options?.map((opt) => ({
    ...opt,
    listPriceInclusive:
      opt.listPriceInclusive !== undefined
        ? opt.listPriceInclusive
        : (STORE_LIST_INCLUSIVE_PRICES[opt.id] ?? null),
  }));
  return {
    ...product,
    ...(options ? { options } : {}),
    imageScale: product.imageScale ?? STORE_IMAGE_SCALES[product.id] ?? 1,
    taxType: product.taxType ?? "과세",
    listPriceInclusive:
      product.listPriceInclusive !== undefined
        ? product.listPriceInclusive
        : (STORE_LIST_INCLUSIVE_PRICES[product.id] ?? null),
  };
}

/** 옵션 SKU → 카탈로그 부모(상세 페이지 id). */
const STORE_OPTION_PARENT_BY_ID: Record<string, string> = Object.fromEntries(
  STORE_CATEGORIES.flatMap((category) =>
    category.products.flatMap((product) =>
      (product.options ?? []).map((opt) => [opt.id, product.id] as const),
    ),
  ),
);

/** 장바구니·주문용 옵션 SKU (목록 카드에는 부모만 노출). */
const STORE_OPTION_PRODUCTS: StoreProduct[] = STORE_CATEGORIES.flatMap(
  (category) =>
    category.products.flatMap((product) =>
      (product.options ?? []).map((opt) =>
        withStoreTaxDefaults({
          id: opt.id,
          name: `${product.name} · ${opt.label.replace(/ Kit Case$/, "")}`,
          image: product.image,
          blurb: opt.label,
          description: product.description,
          galleryImages: product.galleryImages,
          specs: product.specs,
          listPriceInclusive: opt.listPriceInclusive,
        }),
      ),
    ),
);

export const STORE_PRODUCTS: StoreProduct[] = STORE_CATEGORIES.flatMap(
  (category) => category.products.map(withStoreTaxDefaults),
);

for (const category of STORE_CATEGORIES) {
  category.products = category.products.map(withStoreTaxDefaults);
}

export function getStoreOptionParentId(
  productId: string | undefined,
): string | undefined {
  if (!productId) return undefined;
  return STORE_OPTION_PARENT_BY_ID[productId];
}

export function getStoreProductById(productId: string | undefined) {
  if (!productId) return undefined;
  return (
    STORE_PRODUCTS.find((product) => product.id === productId) ??
    STORE_OPTION_PRODUCTS.find((product) => product.id === productId)
  );
}

export function getStoreCategoryForProduct(productId: string | undefined) {
  if (!productId) return undefined;
  const displayId = getStoreOptionParentId(productId) ?? productId;
  return STORE_CATEGORIES.find((category) =>
    category.products.some((product) => product.id === displayId),
  );
}

/** 판매가(부가세 포함). 단일가. */
export function resolveStoreUnitPriceInclusive(
  product: Pick<StoreProduct, "listPriceInclusive">,
): number | null {
  return product.listPriceInclusive ?? null;
}

const CATEGORY_THEMES: Record<
  string,
  {
    glow: string;
    accent: string;
    ring: string;
    progress: string;
  }
> = {
  abutment: {
    glow: "bg-primary/20",
    accent: "text-primary-glow",
    ring: "ring-primary/20",
    progress: "bg-primary",
  },
  parts: {
    glow: "bg-amber-400/12",
    accent: "text-amber-200",
    ring: "ring-amber-400/15",
    progress: "bg-amber-400",
  },
};

export function getStoreSlideTheme(categoryId: string) {
  return (
    CATEGORY_THEMES[categoryId] ?? {
      glow: "bg-white/10",
      accent: "text-white/80",
      ring: "ring-white/10",
      progress: "bg-white/60",
    }
  );
}
