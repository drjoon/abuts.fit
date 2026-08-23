// related files:
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/pages/requestor/store/RequestorStoreProductPage.tsx
// - web/frontend/src/features/landing/LandingStoreShowcase.tsx

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
  /** 부가세 포함 표시가(원). null이면 라벨만. */
  listPriceInclusive?: number | null;
};

export type StoreCategory = {
  id: string;
  label: string;
  products: StoreProduct[];
};

/**
 * 치과 스토어 카탈로그.
 * 명칭·구성: Initial / Check / Gingival Kit + Abutment (첨1).
 * 설명·상품정보고시·상세 이미지: acrodent.com 제품 상세 페이지 기준.
 */
export const STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "abutment",
    label: "Abutment",
    products: [
      {
        id: "simple-abutment-2",
        name: "SimpleAbutment2",
        image: "/store/simple-abutment-206.jpg",
        blurb: "Simple Abut. [DT-Hex]",
        description: [
          "For Submerged type",
          "",
          "Submerged type 임플란트용 Simple Abutment(DT-Hex)입니다.",
          "환자의 저작 기능 회복을 위해 사용하는 인공 치아와 같은 보철물을 지지하기 위하여 삽입합니다.",
        ].join("\n"),
        galleryImages: ["/store/simple-abutment-206.jpg"],
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
          { label: "포장단위", value: "1set" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "simple-healing-2",
        name: "SimpleHealing2",
        image: "/store/simple-healing.jpg",
        blurb: "Healing Abut.",
        description: [
          "For Submerged type",
          "",
          "Submerged type 임플란트용 Healing Abutment입니다.",
          "Fixture 식립 후 치은 치유·형성 기간에 사용하며, BoneShaper 등으로 피질골을 정리한 뒤 체결합니다.",
        ].join("\n"),
        galleryImages: ["/store/simple-healing.jpg"],
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
        id: "bone-pen",
        name: "BonePen",
        image: "/store/bone-pen.jpg",
        blurb: "이니셜 드릴 Pen",
        description: [
          "임플란트 시술시 임플란트용 핸드피스에 부착하여 골을 절삭 및 채집하는 것을 목적으로 한다.",
          "",
          "Initial Kit의 핵심 기구로, 치조골 삭제·채집 후 동일 컵 사이즈의 BonePin을 사용해 수평·수직 공간을 확인합니다.",
        ].join("\n"),
        galleryImages: ["/store/bone-pen.jpg"],
        contentImages: ["/store/detail/bone-pen-1.jpg"],
        specs: [
          { label: "품목명", value: "치과임플란트시술용드릴" },
          { label: "모델명", value: "BP6MV2외 14건" },
          { label: "의료기기 허가, 신고 번호", value: "부산 제신 12-16 호" },
          {
            label: "사용목적",
            value:
              "임플란트 시술시 임플란트용 핸드피스에 부착하여 골을 절삭 및 채집하는 것을 목적으로 한다.",
          },
          { label: "사용방법", value: "상품상세설명 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
          { label: "포장단위", value: "EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/ 대한민국" },
          {
            label: "품질책임자/전화번호",
            value: "이상훈 / Tel : 055-314-4607",
          },
        ],
      },
      {
        id: "bone-pin",
        name: "BonePin",
        image: "/store/bone-pin.jpg",
        blurb: "가상 크라운 역할 Pin",
        description: [
          "BonePen으로 삭제한 치조골에 사용한 컵 사이즈와 동일한 직경(색상)의 Pin을 꽂아 가상의 크라운 역할",
          "1차수술에서 수평·수직공간 확보로 2차수술 및 교합조정이 편해 집니다.",
        ].join("\n"),
        galleryImages: ["/store/bone-pin.jpg"],
        contentImages: ["/store/detail/bone-pin-1.jpg"],
        specs: [
          { label: "품목명", value: "치과용임플란트시술기구" },
          { label: "모델명", value: "BPP6V2외 29건" },
          { label: "의료기기 허가, 신고 번호", value: "부산 제신 12-23 호" },
          {
            label: "사용목적",
            value: "치과용 임플란트를 시술하는 데에 사용되는 기구이다.",
          },
          { label: "사용방법", value: "상품상세설명 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
          { label: "포장단위", value: "EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트 / 대한민국" },
          {
            label: "품질책임자/전화번호",
            value: "이상훈 / Tel : 055-314-4607",
          },
        ],
      },
    ],
  },
  {
    id: "check-kit",
    label: "Check Kit",
    products: [
      {
        id: "check-pin",
        name: "CheckPin",
        image: "/store/check-pin.jpg",
        blurb: "Fixture 식립 후 교합 높이 확인",
        description: [
          "Sub. Fixture 식립 후 식립된 fixture에 꽂아 수평공간 및 수직공간 확인",
          "1차수술에서 수직공간 확보로 2차수술 및 교합조정이 편해 집니다.",
        ].join("\n"),
        galleryImages: ["/store/check-pin.jpg"],
        contentImages: ["/store/detail/check-pin-1.jpg"],
        specs: [
          { label: "품목명", value: "치과용임플란트시술기구" },
          { label: "모델명", value: "EX14외 11건" },
          { label: "의료기기 허가, 신고 번호", value: "제신 19-1088 호" },
          {
            label: "사용목적",
            value: "치과용 임플란트를 시술하는 데에 사용되는 기구이다.",
          },
          { label: "사용방법", value: "사용자 매뉴얼 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "사용자 매뉴얼 참조" },
          { label: "포장단위", value: "EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
          {
            label: "품질관리자/전화번호",
            value: "이상훈 / Tel : 055-314-4607",
          },
        ],
      },
      {
        id: "bone-shaper",
        name: "BoneShaper",
        image: "/store/bone-shaper.jpg",
        blurb: "피질골 삭제·성형",
        description: [
          "Fixture 식립 후 Healing(Abut.) 체결을 위한 cortical bone 삭제성형",
          "",
          "식립된 fixture 주위 피질골을 정리해 Healing Abutment 체결이 원활하도록 돕습니다.",
        ].join("\n"),
        galleryImages: ["/store/bone-shaper.jpg"],
        contentImages: ["/store/detail/bone-shaper-1.jpg"],
        specs: [
          { label: "품목명", value: "치과임플란트시술용드릴" },
          { label: "모델명", value: "BS6V2외 9건" },
          { label: "의료기기 허가, 신고 번호", value: "부산 제신 12-8 호" },
          {
            label: "사용목적",
            value:
              "임플란트 시술에서 임플란트용 핸드피스에 부착하여 골을 삭제하는 기구이다.",
          },
          { label: "사용방법", value: "상품상세설명 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "사용자 매뉴얼 참조" },
          { label: "포장단위", value: "EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/ 대한민국" },
          {
            label: "품질책임자/전화번호",
            value: "이상훈 / Tel : 055-314-4607",
          },
        ],
      },
    ],
  },
  {
    id: "gingival-kit",
    label: "Gingival Kit",
    products: [
      {
        id: "gingival-shaper",
        name: "GingivalShaper",
        image: "/store/gingival-shaper.jpg",
        blurb: "어벗 마진 치은 삭제",
        imageScale: 1.55,
        description: [
          "임플란트 상부구조물(Simple abut.) margin 부위의 치은 삭제용",
          "",
          "Simple Abutment 마진 주변 치은을 정리해 보철·어벗먼트 체결 시 적합성을 높입니다.",
        ].join("\n"),
        galleryImages: [
          "/store/gingival-shaper.jpg",
          "/store/gingival-shaper-296.jpg",
        ],
        contentImages: ["/store/detail/gingival-shaper-1.jpg"],
        specs: [
          { label: "품명", value: "의료용절삭기구" },
          { label: "모델명", value: "GS06V1외 41건" },
          { label: "의료기기 허가, 신고 번호", value: "부산 제신 11-98 호" },
          {
            label: "사용목적",
            value:
              "천자기, 천공기 및 핸드피스 등에 사용하는 절삭용 버(burr), 절삭용 디스크, 광택용 휠, 스트립 등의 기구. 레이저, 수술기용 디스크를 포함한다.",
          },
          { label: "사용방법", value: "상품상세설명 참조" },
          { label: "사용시 주의사항 및 보관방법", value: "상품상세설명 참조" },
          { label: "포장단위", value: "EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
          {
            label: "품질책임자/전화번호",
            value: "이상훈 / Tel : 055-314-4607",
          },
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

/** 스토어 전 상품 기본: 과세 · 부가세 포함가(데모 단가, 추후 관리 설정으로 교체). */
const STORE_DEMO_INCLUSIVE_PRICES: Record<string, number> = {
  "simple-abutment-2": 110_000,
  "simple-healing-2": 55_000,
  "bone-pen": 220_000,
  "bone-pin": 88_000,
  "check-pin": 165_000,
  "bone-shaper": 132_000,
  "gingival-shaper": 99_000,
};

function withStoreTaxDefaults(product: StoreProduct): StoreProduct {
  return {
    ...product,
    taxType: product.taxType ?? "과세",
    listPriceInclusive:
      product.listPriceInclusive !== undefined
        ? product.listPriceInclusive
        : (STORE_DEMO_INCLUSIVE_PRICES[product.id] ?? null),
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
  "gingival-kit": {
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
