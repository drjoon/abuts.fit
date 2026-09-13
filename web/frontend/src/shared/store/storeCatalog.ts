// change-log:
// - 2026-09-13: 판매가표 동기 — 키트 88/96/88만·pkg 66/88/66, 단품 제조×2, 풀패키지 구성합 580만.
// - 2026-09-13: pkg=판매가×0.8 초과·5500원 배수(부가세 포함 500원·공급가 정수).
// - 2026-09-13: 제조단가표 갱신(케이스 7.7·Pen 6.6·셰이퍼 6.6·Hex 2.2·Torque 8.8).
// - 2026-09-13: 이미지·표기 acrodent.com 동기 (SA2=Non-Hex Anti-rotation, SA=Non-Hex).
// - 2026-09-13: 키트 단품 분해가 + 550만 풀패키지. 첨 가격표 동기.
// - 2026-09-13: 첨 가격표 판매가·pkg가. 키트 SKU + 어벗 EA. 충전≥550만 pkg.
// - 2026-08-23: 상품 blurb·description 문구 축약.
// related files:
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/pages/requestor/store/RequestorStoreProductPage.tsx
// - web/frontend/src/features/landing/LandingStoreShowcase.tsx
// - web/backend/constants/storeCatalog.js

export type StoreProductSpec = {
  label: string;
  value: string;
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
  /** 부가세 포함 pkg가(원). 패키지 구매자(충전≥550만)에게 적용. */
  packagePriceInclusive?: number | null;
  /** true면 충전 이력과 무관하게 pkg가(또는 패키지 판매가) 적용. */
  alwaysUsePackagePrice?: boolean;
};

export type StoreCategory = {
  id: string;
  label: string;
  products: StoreProduct[];
};

/** 패키지 단가 적용: 유료 크레딧(CHARGE_PAID) 누적 충전 ≥ 이 금액. */
export const STORE_PACKAGE_PREPAID_THRESHOLD = 5_000_000;


const KIT_CASE_SPECS: StoreProductSpec[] = [
  { label: "포장단위", value: "1EA" },
  { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
];

/**
 * 치과 스토어 카탈로그.
 * 1행 Abutment 4 · 2행 키트/패키지 4 · 3행 단품.
 * 이미지·명칭: acrodent.com 상품 페이지 기준.
 */
export const STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "abutment",
    label: "Abutment",
    products: [
      {
        id: "simple-abutment-2",
        name: "SimpleAbutment2",
        image: "/store/acrodent/simple-abutment-2.jpg",
        blurb: "Simple Abut. [Non-Hex] Anti-rotation",
        description:
          "acrodent Simple Abut. [Non-Hex] Anti-rotation. Non-Hex·Anti-rotation. 높이 S·M·L·XL × 직경 6·7·9 — 12종.",
        galleryImages: ["/store/acrodent/simple-abutment-2.jpg"],
        contentImages: ["/store/detail/simple-abutment-2-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "acrodent", value: "Simple Abut.[Non-Hex]Anti-rotation" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-healing-2",
        name: "SimpleHealing2",
        image: "/store/acrodent/simple-healing-2.jpg",
        blurb: "Healing Abut. · 12종",
        description:
          "acrodent Healing Abut. Fixture 식립 후 치은 치유·형성. 높이 S(2.0)·M(3.5)·L(5.0)·XL(6.5), 직경 6·7·9 — 12종.",
        galleryImages: ["/store/acrodent/simple-healing-2.jpg"],
        contentImages: ["/store/detail/simple-healing-2-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "acrodent", value: "Healing Abut." },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-abutment",
        name: "SimpleAbutment",
        image: "/store/acrodent/simple-abutment.jpg",
        blurb: "Simple Abut. [Non-Hex]",
        description:
          "acrodent Simple Abut. [Non-Hex]. Submerged type용 기본형 Simple Abutment.",
        galleryImages: ["/store/acrodent/simple-abutment.jpg"],
        contentImages: ["/store/detail/simple-abutment-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "acrodent", value: "Simple Abut. [Non-Hex]" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-healing",
        name: "SimpleHealing",
        image: "/store/acrodent/simple-healing.jpg",
        blurb: "Healing Abut. · 기본형",
        description:
          "acrodent Healing Abut. 기본형. Fixture 식립 후 치은 치유·형성용.",
        galleryImages: ["/store/acrodent/simple-healing.jpg"],
        contentImages: ["/store/detail/simple-healing-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "acrodent", value: "Healing Abut." },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
  {
    id: "kits",
    label: "Kit",
    products: [
      {
        id: "full-package",
        name: "500만 패키지",
        image: "/store/acrodent/full-package.jpg",
        blurb: "키트 3종 + Abutment 200EA 일괄",
        alwaysUsePackagePrice: true,
        description:
          "Initial·Check·Prosthetic Kit 각 1키트, SimpleAbutment2 100EA, SimpleHealing2 100EA. 구성 판매합 580만 → 패키지 판매가 500만.",
        galleryImages: [
          "/store/acrodent/full-package.jpg",
          "/store/acrodent/initial-kit.jpg",
          "/store/acrodent/check-kit.jpg",
          "/store/acrodent/prosthetic-kit.jpg",
          "/store/acrodent/simple-abutment-2.jpg",
          "/store/acrodent/simple-healing-2.jpg",
        ],
        contentImages: [
          "/store/detail/initial-kit-1.jpg",
          "/store/detail/check-kit-1.jpg",
          "/store/detail/prosthetic-kit-1.jpg",
          "/store/detail/simple-abutment-2-1.jpg",
          "/store/detail/simple-healing-2-1.jpg",
        ],
        specs: [
          {
            label: "구성",
            value:
              "Initial Kit ×1, Check Kit ×1, Prosthetic Kit ×1, SimpleAbutment2 ×100, SimpleHealing2 ×100",
          },
          { label: "구성 판매합", value: "5,800,000원" },
          { label: "패키지 판매가", value: "5,000,000원" },
          { label: "포장단위", value: "1세트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "initial-kit",
        name: "Initial Kit",
        image: "/store/acrodent/initial-kit.jpg",
        blurb: "TheSimple Kit Initial",
        description:
          "acrodent TheSimple Kit Initial. Lindemann pen·Cup·InitialPin·Case. 판매가 88만.",
        galleryImages: [
          "/store/acrodent/initial-kit.jpg",
          "/store/acrodent/initial-pen.jpg",
          "/store/acrodent/cup.jpg",
          "/store/acrodent/initial-pin.jpg",
        ],
        contentImages: ["/store/detail/initial-kit-1.jpg"],
        specs: [
          {
            label: "구성",
            value: "InitialPen ×2, Cup ×5, InitialPin ×5, Kit Case ×1",
          },
          { label: "acrodent", value: "TheSimple Kit Initial" },
          { label: "포장단위", value: "1키트" },
          ...KIT_CASE_SPECS.slice(1),
        ],
      },
      {
        id: "check-kit",
        name: "Check Kit",
        image: "/store/acrodent/check-kit.jpg",
        blurb: "TheSimple Kit Check",
        description:
          "acrodent TheSimple Kit Check. CheckPin·BoneShaper(S/M 6종). 판매가 96만.",
        galleryImages: [
          "/store/acrodent/check-kit.jpg",
          "/store/acrodent/check-pin.jpg",
          "/store/acrodent/bone-shaper.jpg",
        ],
        contentImages: ["/store/detail/check-kit-1.jpg"],
        specs: [
          { label: "구성", value: "CheckPin ×5, BoneShaper ×6, Kit Case ×1" },
          { label: "acrodent", value: "TheSimple Kit Check" },
          { label: "포장단위", value: "1키트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "prosthetic-kit",
        name: "Prosthetic Kit",
        image: "/store/acrodent/prosthetic-kit.jpg",
        blurb: "TheSimple Kit Prosthetics",
        description:
          "acrodent TheSimple Kit Prosthetics. GingivalShaper·Hex Driver·Torque. 판매가 88만.",
        galleryImages: [
          "/store/acrodent/prosthetic-kit.jpg",
          "/store/acrodent/gingival-shaper.jpg",
          "/store/acrodent/hex-driver.jpg",
          "/store/acrodent/torque-wrench.jpg",
        ],
        contentImages: ["/store/detail/prosthetic-kit-1.jpg"],
        specs: [
          {
            label: "구성",
            value: "GingivalShaper ×5, Hex Driver ×2, Torque wrench ×1, Kit Case ×1",
          },
          { label: "acrodent", value: "TheSimple Kit Prosthetics" },
          { label: "포장단위", value: "1키트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
  {
    id: "parts",
    label: "단품",
    products: [
      {
        id: "kit-case",
        name: "Kit Case",
        image: "/store/acrodent/kit-case.jpg",
        blurb: "키트 수납 케이스",
        description:
          "시술 키트 수납용 케이스. 제조단가 11만 ×2 = 판매가 22만.",
        galleryImages: ["/store/acrodent/kit-case.jpg"],
        specs: KIT_CASE_SPECS,
      },
      {
        id: "initial-pen",
        name: "InitialPen",
        image: "/store/acrodent/initial-pen.jpg",
        blurb: "Initial Pen · 펜+컵 세트",
        description:
          "acrodent Initial Pen. Lindemann type pen + Cup 세트. 제조 6.05만 ×2 = 12.1만.",
        galleryImages: [
          "/store/acrodent/initial-pen.jpg",
        ],
        contentImages: ["/store/detail/initial-pen-1.jpg"],
        specs: [
          { label: "acrodent", value: "Initial Pen / BonePen" },
          { label: "포장단위", value: "1세트(펜+컵)" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "pen",
        name: "Pen",
        image: "/store/acrodent/pen.jpg",
        blurb: "Lindemann Pen",
        description: "acrodent Lindemann Pen. 제조 5.5만 ×2 = 11만.",
        galleryImages: ["/store/acrodent/pen.jpg"],
        contentImages: ["/store/detail/pen-1.jpg"],
        specs: [
          { label: "acrodent", value: "Lindemann Pen" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "cup",
        name: "Cup",
        image: "/store/acrodent/cup.jpg",
        blurb: "Cup [Light & Initial]",
        description: "acrodent Cup[Light & Initial]. 제조 0.55만 ×2 = 1.1만.",
        galleryImages: ["/store/acrodent/cup.jpg"],
        contentImages: ["/store/detail/cup-1.jpg"],
        specs: [
          { label: "acrodent", value: "Cup[Light & Initial]" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "initial-pin",
        name: "InitialPin",
        image: "/store/acrodent/initial-pin.jpg",
        blurb: "InitialPin · 5종",
        description: "acrodent InitialPin. 제조 2.75만 ×2 = 5.5만.",
        galleryImages: ["/store/acrodent/initial-pin.jpg"],
        contentImages: ["/store/detail/initial-pin-1.jpg"],
        specs: [
          { label: "acrodent", value: "InitialPin" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "check-pin",
        name: "CheckPin",
        image: "/store/acrodent/check-pin.jpg",
        blurb: "교합 높이 확인 · 5종",
        description:
          "acrodent CheckPin(Fixture 식립 후 교합 높이 확인). 제조 2.75만 ×2 = 5.5만.",
        galleryImages: ["/store/acrodent/check-pin.jpg"],
        contentImages: ["/store/detail/check-pin-1.jpg"],
        specs: [
          { label: "acrodent", value: "CheckPin" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "bone-shaper",
        name: "BoneShaper",
        image: "/store/acrodent/bone-shaper.jpg",
        blurb: "BoneShaper · S/M 6종",
        description:
          "acrodent BoneShaper. Healing 체결용 피질골 삭제·성형. S6·7·9 & M6·7·9. 제조 3.85만 ×2 = 7.7만.",
        galleryImages: ["/store/acrodent/bone-shaper.jpg"],
        contentImages: ["/store/detail/bone-shaper-1.jpg"],
        specs: [
          { label: "acrodent", value: "BoneShaper" },
          { label: "구성", value: "S6·7·9, M6·7·9 (주문 시 사이즈 지정)" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "gingival-shaper",
        name: "GingivalShaper",
        image: "/store/acrodent/gingival-shaper.jpg",
        blurb: "GingivalShaper · 5종",
        description: "acrodent GingivalShaper. 마진 치은 삭제. 제조 3.85만 ×2 = 7.7만.",
        galleryImages: ["/store/acrodent/gingival-shaper.jpg"],
        contentImages: ["/store/detail/gingival-shaper-1.jpg"],
        specs: [
          { label: "acrodent", value: "GingivalShaper" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "hex-driver",
        name: "Hex Driver",
        image: "/store/acrodent/hex-driver.jpg",
        blurb: "1.20 HEX-driver[Wrench] · S/M",
        description:
          "acrodent 1.20 HEX-driver[Wrench]. 제조 1.65만 ×2 = 3.3만.",
        galleryImages: ["/store/acrodent/hex-driver.jpg"],
        contentImages: ["/store/detail/hex-driver-1.jpg"],
        specs: [
          { label: "acrodent", value: "1.20 HEX-driver[Wrench]" },
          { label: "구성", value: "S, M (주문 시 사이즈 지정)" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "torque-wrench",
        name: "Torque wrench",
        image: "/store/acrodent/torque-wrench.jpg",
        blurb: "Torque wrench",
        description: "acrodent Torque wrench. 제조 8.8만 ×2 = 17.6만.",
        galleryImages: ["/store/acrodent/torque-wrench.jpg"],
        contentImages: ["/store/detail/torque-wrench-1.jpg"],
        specs: [
          { label: "acrodent", value: "Torque wrench" },
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

/** 판매가(부가세 포함). 백엔드 storeCatalog.js 와 동기. 단품=제조×2. */
const STORE_LIST_INCLUSIVE_PRICES: Record<string, number> = {
  "full-package": 5_800_000,
  "initial-kit": 880_000,
  "check-kit": 960_000,
  "prosthetic-kit": 880_000,
  "kit-case": 220_000,
  "initial-pen": 121_000,
  pen: 110_000,
  cup: 11_000,
  "initial-pin": 55_000,
  "check-pin": 55_000,
  "bone-shaper": 77_000,
  "gingival-shaper": 77_000,
  "hex-driver": 33_000,
  "torque-wrench": 176_000,
  "simple-abutment-2": 15_400,
  "simple-healing-2": 15_400,
  "simple-abutment": 15_400,
  "simple-healing": 15_400,
};

/**
 * pkg 포함가.
 * - 3만원 미만: 100원 단위(×0.8)
 * - 3만원 이상: 5500원 배수(부가세 포함 500원·공급가 정수)
 */
const STORE_PACKAGE_PRICE_STEP = 5_500;
const STORE_PACKAGE_PRICE_STEP_UNDER_30K = 100;

function packageInclusiveFromList(listInclusive: number): number {
  const floor = listInclusive * 0.8;
  if (listInclusive < 30_000) {
    let pkg =
      Math.ceil(floor / STORE_PACKAGE_PRICE_STEP_UNDER_30K) *
      STORE_PACKAGE_PRICE_STEP_UNDER_30K;
    if (pkg >= listInclusive) {
      pkg =
        Math.floor(floor / STORE_PACKAGE_PRICE_STEP_UNDER_30K) *
        STORE_PACKAGE_PRICE_STEP_UNDER_30K;
    }
    if (pkg <= 0) return listInclusive;
    return pkg < listInclusive ? pkg : listInclusive;
  }
  const stepped =
    (Math.floor(floor / STORE_PACKAGE_PRICE_STEP) + 1) * STORE_PACKAGE_PRICE_STEP;
  if (stepped <= listInclusive) return stepped;
  const by500 = (Math.floor(floor / 500) + 1) * 500;
  return by500 <= listInclusive ? by500 : listInclusive;
}

/** pkg가(부가세 포함). BA.storePackageBuyer 또는 풀패키지 상시. */
const STORE_PACKAGE_INCLUSIVE_PRICES: Record<string, number> = {
  "full-package": 5_000_000,
  "initial-kit": 660_000,
  "check-kit": 880_000,
  "prosthetic-kit": 660_000,
  "kit-case": packageInclusiveFromList(220_000),
  "initial-pen": packageInclusiveFromList(121_000),
  pen: packageInclusiveFromList(110_000),
  cup: packageInclusiveFromList(11_000),
  "initial-pin": packageInclusiveFromList(55_000),
  "check-pin": packageInclusiveFromList(55_000),
  "bone-shaper": packageInclusiveFromList(77_000),
  "gingival-shaper": packageInclusiveFromList(77_000),
  "hex-driver": packageInclusiveFromList(33_000),
  "torque-wrench": packageInclusiveFromList(176_000),
  "simple-abutment-2": 12_100,
  "simple-healing-2": 12_100,
  "simple-abutment": 12_100,
  "simple-healing": 12_100,
};

/** 타일 여백 보정 — 흰 배경 큰 상품일수록 확대. 어벗 4종은 원본(1). */
const STORE_IMAGE_SCALES: Record<string, number> = {
  "full-package": 1.22,
  "initial-kit": 1.22,
  "check-kit": 1.18,
  "prosthetic-kit": 1.18,
  "kit-case": 1.22,
  "initial-pen": 2.05,
  pen: 1.12,
  cup: 1.4,
  "initial-pin": 1.55,
  "check-pin": 1.55,
  "bone-shaper": 1.28,
  "gingival-shaper": 1.55,
  "hex-driver": 1.9,
  "torque-wrench": 1.45,
};

function withStoreTaxDefaults(product: StoreProduct): StoreProduct {
  return {
    ...product,
    imageScale: product.imageScale ?? STORE_IMAGE_SCALES[product.id] ?? 1,
    taxType: product.taxType ?? "과세",
    listPriceInclusive:
      product.listPriceInclusive !== undefined
        ? product.listPriceInclusive
        : (STORE_LIST_INCLUSIVE_PRICES[product.id] ?? null),
    packagePriceInclusive:
      product.packagePriceInclusive !== undefined
        ? product.packagePriceInclusive
        : (STORE_PACKAGE_INCLUSIVE_PRICES[product.id] ?? null),
  };
}

export const STORE_PRODUCTS: StoreProduct[] = STORE_CATEGORIES.flatMap(
  (category) => category.products.map(withStoreTaxDefaults),
);

for (const category of STORE_CATEGORIES) {
  category.products = category.products.map(withStoreTaxDefaults);
}

export function getStoreProductById(productId: string | undefined) {
  if (!productId) return undefined;
  return STORE_PRODUCTS.find((product) => product.id === productId);
}

export function getStoreCategoryForProduct(productId: string | undefined) {
  if (!productId) return undefined;
  return STORE_CATEGORIES.find((category) =>
    category.products.some((product) => product.id === productId),
  );
}

/** 패키지 구매자(또는 alwaysUsePackagePrice)면 pkg가, 아니면 판매가. */
export function resolveStoreUnitPriceInclusive(
  product: Pick<
    StoreProduct,
    "listPriceInclusive" | "packagePriceInclusive" | "alwaysUsePackagePrice"
  >,
  isPackageBuyer: boolean,
): number | null {
  const list = product.listPriceInclusive;
  if (list == null) return null;
  if (!isPackageBuyer && !product.alwaysUsePackagePrice) return list;
  const pkg = product.packagePriceInclusive;
  return pkg != null ? pkg : list;
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
  package: {
    glow: "bg-white/10",
    accent: "text-white/90",
    ring: "ring-white/15",
    progress: "bg-white/70",
  },
  abutment: {
    glow: "bg-primary/20",
    accent: "text-primary-glow",
    ring: "ring-primary/20",
    progress: "bg-primary",
  },
  "initial-kit": {
    glow: "bg-accent/15",
    accent: "text-accent-glow",
    ring: "ring-accent/20",
    progress: "bg-accent",
  },
  "check-kit": {
    glow: "bg-amber-400/12",
    accent: "text-amber-200",
    ring: "ring-amber-400/15",
    progress: "bg-amber-400",
  },
  "prosthetic-kit": {
    glow: "bg-emerald-400/12",
    accent: "text-emerald-300",
    ring: "ring-emerald-400/15",
    progress: "bg-emerald-400",
  },
  kits: {
    glow: "bg-accent/15",
    accent: "text-accent-glow",
    ring: "ring-accent/20",
    progress: "bg-accent",
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
