// change-log:
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
};

export type StoreCategory = {
  id: string;
  label: string;
  products: StoreProduct[];
};

/** 패키지 단가 적용: 유료 크레딧(CHARGE_PAID) 누적 충전 ≥ 이 금액. */
export const STORE_PACKAGE_PREPAID_THRESHOLD = 5_500_000;

/**
 * 치과 스토어 카탈로그.
 * 명칭·구성·단가: Initial / Check / Prosthetic Kit + Abutment (첨 가격표).
 */
export const STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "abutment",
    label: "Abutment",
    products: [
      {
        id: "simple-abutment-2",
        name: "SimpleAbutment2",
        image: "/store/transparent/simple-abutment-206.png",
        blurb: "DT-Hex Simple Abut. · 특수코팅 · Concave",
        description:
          "Submerged type용 Simple Abutment (DT-Hex). 특수코팅으로 스프레이 없이 스캔. Concave profile. 높이 S(2.0)·M(3.5)·L(5.0)·XL(6.5), 직경 6·7·9 — 12종.",
        galleryImages: ["/store/transparent/simple-abutment-206.png"],
        contentImages: ["/store/detail/simple-abutment-2-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "모델명", value: "SS06-NC20 외 265건" },
          { label: "의료기기 허가, 신고 번호", value: "제인13-1673호" },
          {
            label: "사용목적",
            value:
              "환자의 저작 기능 회복을 위해 사용하는 인공 치아와 같은 보철물을 지지하기 위하여 삽입",
          },
          { label: "사용방법", value: "상품상세설명 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-healing-2",
        name: "SimpleHealing2",
        image: "/store/transparent/simple-healing.png",
        blurb: "Healing Abut. · Hex 2-piece · D-cut",
        description:
          "Fixture 식립 후 치은 치유·형성용 Healing Abutment. Hex, 2-piece, D-cut(B,L) fillet. 높이 S·M·L·XL × 직경 6·7·9 — 12종.",
        galleryImages: ["/store/transparent/simple-healing.png"],
        contentImages: ["/store/detail/simple-healing-2-1.jpg"],
        specs: [
          { label: "품명", value: "치과용임플란트상부구조물" },
          { label: "모델명", value: "SH06-H0C20 외 44건" },
          { label: "의료기기 허가, 신고 번호", value: "제인19-4012호" },
          {
            label: "사용목적",
            value:
              "환자의 저작 기능 회복을 위해 사용하는 인공 치아와 같은 보철물을 지지하기 위하여 삽입",
          },
          { label: "사용방법", value: "상품상세설명 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
  {
    id: "initial-kit",
    label: "Initial Kit",
    products: [
      {
        id: "initial-kit",
        name: "Initial Kit",
        image: "/store/guide-kit-case.jpg",
        blurb: "InitialPen · InitialPin",
        description:
          "Lindemann type pen 2종, Cup 5종 구성. InitialPen(골 절삭·채집)과 InitialPin(가상 크라운 공간 확인) 키트.",
        galleryImages: [
          "/store/guide-kit-case.jpg",
          "/store/transparent/bone-pen.png",
          "/store/transparent/bone-pin.png",
        ],
        contentImages: [
          "/store/detail/bone-pen-1.jpg",
          "/store/detail/bone-pin-1.jpg",
        ],
        specs: [
          { label: "구성", value: "InitialPen, InitialPin, Cup" },
          { label: "포장단위", value: "1키트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
  {
    id: "check-kit",
    label: "Check Kit",
    products: [
      {
        id: "check-kit",
        name: "Check Kit",
        image: "/store/transparent/check-pin.png",
        blurb: "CheckPin · BoneShaper",
        description:
          "CheckPin 5종, BoneShaper(S·M × Ø6·7·9) 6종. Fixture 식립 후 교합 높이 확인·피질골 성형.",
        galleryImages: [
          "/store/transparent/check-pin.png",
          "/store/transparent/bone-shaper.png",
        ],
        contentImages: [
          "/store/detail/check-pin-1.jpg",
          "/store/detail/bone-shaper-1.jpg",
        ],
        specs: [
          { label: "구성", value: "CheckPin, BoneShaper" },
          { label: "포장단위", value: "1키트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
    ],
  },
  {
    id: "prosthetic-kit",
    label: "Prosthetic Kit",
    products: [
      {
        id: "prosthetic-kit",
        name: "Prosthetic Kit",
        image: "/store/transparent/gingival-shaper.png",
        blurb: "GingivalShaper · Hex Driver",
        imageScale: 1.55,
        description:
          "GingivalShaper 5종, Hex Driver(S·M) 2종. Simple Abut. 마진 치은 삭제·체결용.",
        galleryImages: [
          "/store/transparent/gingival-shaper.png",
          "/store/gingival-shaper-296.jpg",
        ],
        contentImages: ["/store/detail/gingival-shaper-1.jpg"],
        specs: [
          { label: "구성", value: "GingivalShaper, Hex Driver" },
          { label: "포장단위", value: "1키트" },
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
  "initial-kit": 1_100_000,
  "check-kit": 1_100_000,
  "prosthetic-kit": 1_100_000,
  "simple-abutment-2": 15_400,
  "simple-healing-2": 15_400,
};

/** pkg가(부가세 포함). 충전≥550만 시 적용. */
const STORE_PACKAGE_INCLUSIVE_PRICES: Record<string, number> = {
  "initial-kit": 880_000,
  "check-kit": 880_000,
  "prosthetic-kit": 880_000,
  "simple-abutment-2": 12_100,
  "simple-healing-2": 12_100,
};

function withStoreTaxDefaults(product: StoreProduct): StoreProduct {
  return {
    ...product,
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

// 카드 렌더용 카테고리 products에도 동일 기본값 적용
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

/** 패키지 구매자면 pkg가(있을 때), 아니면 판매가. */
export function resolveStoreUnitPriceInclusive(
  product: Pick<StoreProduct, "listPriceInclusive" | "packagePriceInclusive">,
  isPackageBuyer: boolean,
): number | null {
  const list = product.listPriceInclusive;
  if (list == null) return null;
  if (!isPackageBuyer) return list;
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
