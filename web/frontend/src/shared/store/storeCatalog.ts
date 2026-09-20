// change-log:
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
  packagePriceInclusive?: number | null;
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
  /** 부가세 포함 pkg가(원). 패키지 구매자(500만 패키지 구매)에게 적용. */
  packagePriceInclusive?: number | null;
  /** true면 패키지 구매자 여부와 무관하게 pkg가(또는 패키지 판매가) 적용. */
  alwaysUsePackagePrice?: boolean;
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

/** 500만 패키지 판매가(부가세 포함). BA.storePackageBuyer는 full-package 결제 시 ON. */
export const STORE_PACKAGE_PREPAID_THRESHOLD = 5_000_000;
export const STORE_FULL_PACKAGE_PRODUCT_ID = "full-package";

const KIT_CASE_SPECS: StoreProductSpec[] = [
  { label: "포장단위", value: "1EA" },
  { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
];

/** Kit Case 단품 — Surgical·Prosthetic 모두 제조 12.1만 ×2. */
export const KIT_CASE_OPTIONS: StoreProductOption[] = [
  {
    id: "kit-case-surgical",
    label: "Surgical Kit Case",
    listPriceInclusive: 242_000,
    packagePriceInclusive: 198_000,
  },
  {
    id: "kit-case-prosthetic",
    label: "Prosthetic Kit Case",
    listPriceInclusive: 242_000,
    packagePriceInclusive: 198_000,
  },
];

/**
 * 치과 스토어 카탈로그.
 * 1행 Abutment 4 · 2행 키트/패키지 · 3행 단품.
 * 이미지·명칭: acrodent.com 상품 페이지 기준 + 제조단가표 동기.
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
    id: "kits",
    label: "Kit",
    products: [
      {
        id: "full-package",
        name: "500만 패키지",
        image: "/store/acrodent/full-package.jpg",
        blurb: "키트 2종 + Abutment 240EA",
        alwaysUsePackagePrice: true,
        description:
          "Surgical·Prosthetic Kit 각 1키트, SimpleAbutment·Healing Hex/NonHex 각 60EA. 구성 판매합 660만 → 패키지 판매가 500만.",
        galleryImages: [
          "/store/acrodent/full-package.jpg",
          "/store/acrodent/initial-kit.jpg",
          "/store/acrodent/prosthetic-kit.jpg",
          "/store/acrodent/simple-abutment-2.jpg",
          "/store/acrodent/simple-healing-2.jpg",
          "/store/acrodent/simple-abutment.jpg",
          "/store/acrodent/simple-healing.jpg",
        ],
        contentImages: [
          "/store/detail/initial-kit-1.jpg",
          "/store/detail/prosthetic-kit-1.jpg",
          "/store/detail/simple-abutment-2-1.jpg",
          "/store/detail/simple-healing-2-1.jpg",
          "/store/detail/simple-abutment-1.jpg",
          "/store/detail/simple-healing-1.jpg",
        ],
        specs: [
          {
            label: "구성",
            value:
              "Surgical Kit ×1, Prosthetic Kit ×1, SimpleAbutment-Hex ×60, SimpleHealing-Hex ×60, SimpleAbutment-NonHex ×60, SimpleHealing-NonHex ×60",
          },
          { label: "구성 판매합", value: "6,600,000원" },
          { label: "패키지 판매가", value: "5,000,000원" },
          { label: "포장단위", value: "1세트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "surgical-kit",
        name: "Surgical Kit",
        image: "/store/acrodent/initial-kit.jpg",
        blurb: "SurgicalPen · SurgicalPin · BoneShaper",
        description:
          "린데만 타입 SurgicalPen(Pen-Drill×2, Pen-Cup×5, 직경 2.3), SurgicalPin(CheckPin·BonePin), BoneShaper S/M 6종. 판매가 154만 · pkg 121만.",
        galleryImages: [
          "/store/acrodent/initial-kit.jpg",
          "/store/acrodent/check-kit.jpg",
          "/store/acrodent/pen.jpg",
          "/store/acrodent/cup.jpg",
          "/store/acrodent/check-pin.jpg",
          "/store/acrodent/bone-shaper.jpg",
        ],
        contentImages: [
          "/store/detail/initial-kit-1.jpg",
          "/store/detail/check-kit-1.jpg",
        ],
        specs: [
          {
            label: "구성",
            value:
              "Pen-Drill×2, Pen-Cup×5, SurgicalPin×5, BoneShaper×6, Kit Case×1",
          },
          { label: "BoneShaper", value: "S6·7·9 & M6·7·9 (6종) · 팁 조금 길게" },
          { label: "포장단위", value: "1키트" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "prosthetic-kit",
        name: "Prosthetic Kit",
        image: "/store/acrodent/prosthetic-kit.jpg",
        blurb: "GingivalShaper · Grip Driver · Scan bar",
        description:
          "GingivalShaper 6·7·9(3종), Grip Driver Hand S/M/L·Handpiece M/L(5), Scan bar 8·16mm 각 2, Torque wrench. 판매가 110만 · pkg 88만.",
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
            value:
              "GingivalShaper ×3, Grip Driver ×5, Scan bar ×4, Torque wrench ×1, Kit Case ×1",
          },
          {
            label: "Grip Driver",
            value: "Hand S·M·L, Handpiece M·L (5종)",
          },
          { label: "Scan bar", value: "8mm ×2, 16mm ×2" },
          { label: "GingivalShaper", value: "6 · 7 · 9 (3종)" },
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
        blurb: "Surgical / Prosthetic · 2종",
        description:
          "시술 키트 수납용 케이스. Surgical·Prosthetic 모두 제조 12.1만 ×2 = 24.2만.",
        galleryImages: ["/store/acrodent/kit-case.jpg"],
        specs: KIT_CASE_SPECS,
        options: KIT_CASE_OPTIONS,
        priceFrom: true,
      },
      {
        id: "initial-pen",
        name: "SurgicalPen",
        image: "/store/acrodent/initial-pen.jpg",
        blurb: "린데만 타입 · 직경 2.3",
        description:
          "린데만 타입 Pen-Drill, 직경 2.3. 제조 7.7만 ×2 = 15.4만.",
        galleryImages: ["/store/acrodent/initial-pen.jpg"],
        contentImages: ["/store/detail/initial-pen-1.jpg"],
        specs: [
          { label: "타입", value: "린데만 타입, 직경 2.3" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "pen",
        name: "Pen",
        image: "/store/acrodent/pen.jpg",
        blurb: "Lindemann Pen",
        description: "acrodent Lindemann Pen-Drill. 제조 7.7만 ×2 = 15.4만.",
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
        blurb: "Cup · 5종",
        description: "Pen-Cup. 제조 1.32만 ×2 = 2.64만.",
        galleryImages: ["/store/acrodent/cup.jpg"],
        contentImages: ["/store/detail/cup-1.jpg"],
        specs: [
          { label: "acrodent", value: "Cup" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "check-pin",
        name: "SurgicalPin",
        image: "/store/acrodent/check-pin.jpg",
        blurb: "CheckPin · BonePin · 5종",
        description:
          "CheckPin 타입에 BonePin 기능을 더한 SurgicalPin. 제조 3.3만 ×2 = 6.6만.",
        galleryImages: ["/store/acrodent/check-pin.jpg"],
        contentImages: ["/store/detail/check-pin-1.jpg"],
        specs: [
          { label: "역할", value: "CheckPin · BonePin" },
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
          "S6·7·9 및 M6·7·9 = 총 6종. 팁 조금 길게. 제조 4.4만 ×2 = 8.8만.",
        galleryImages: ["/store/acrodent/bone-shaper.jpg"],
        contentImages: ["/store/detail/bone-shaper-1.jpg"],
        specs: [
          { label: "구성", value: "S6·7·9, M6·7·9 (주문 시 사이즈 지정)" },
          { label: "비고", value: "팁 조금 길게" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
      {
        id: "gingival-shaper",
        name: "GingivalShaper",
        image: "/store/acrodent/gingival-shaper.jpg",
        blurb: "GingivalShaper · 6·7·9",
        description: "GingivalShaper 6·7·9 = 3종. 제조 4.4만 ×2 = 8.8만.",
        galleryImages: ["/store/acrodent/gingival-shaper.jpg"],
        contentImages: ["/store/detail/gingival-shaper-1.jpg"],
        specs: [
          { label: "구성", value: "6 · 7 · 9 (3종)" },
          { label: "포장단위", value: "1EA" },
          { label: "제조자/제조국", value: "(주)애크로덴트/대한민국" },
        ],
      },
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
      {
        id: "torque-wrench",
        name: "Torque wrench",
        image: "/store/acrodent/torque-wrench.jpg",
        blurb: "Torque wrench",
        description: "Torque wrench. 제조 9.9만 ×2 = 19.8만.",
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
  "full-package": 6_600_000, // Surgical 154 + Prosthetic 110 + Abutment 4종×60×1.65
  "surgical-kit": 1_540_000,
  "prosthetic-kit": 1_100_000,
  "kit-case": 242_000,
  "kit-case-surgical": 242_000, // mfg 12.1만 ×2
  "kit-case-prosthetic": 242_000,
  "initial-pen": 154_000, // Pen-Drill mfg 7.7만 ×2
  pen: 154_000,
  cup: 26_400, // Pen-Cup mfg 1.32만 ×2
  "check-pin": 66_000, // SurgicalPin mfg 3.3만 ×2
  "bone-shaper": 88_000, // mfg 4.4만 ×2
  "gingival-shaper": 88_000, // mfg 4.4만 ×2
  "hex-driver": 44_000, // Grip Driver mfg 2.2만 ×2
  "torque-wrench": 198_000, // mfg 9.9만 ×2
  "simple-abutment-2": 16_500,
  "simple-healing-2": 16_500,
  "simple-abutment": 16_500,
  "simple-healing": 16_500,
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
  "surgical-kit": 1_210_000,
  "prosthetic-kit": 880_000,
  "kit-case": packageInclusiveFromList(242_000),
  "kit-case-surgical": packageInclusiveFromList(242_000),
  "kit-case-prosthetic": packageInclusiveFromList(242_000),
  "initial-pen": packageInclusiveFromList(154_000),
  pen: packageInclusiveFromList(154_000),
  cup: packageInclusiveFromList(26_400),
  "check-pin": packageInclusiveFromList(66_000),
  "bone-shaper": packageInclusiveFromList(88_000),
  "gingival-shaper": packageInclusiveFromList(88_000),
  "hex-driver": packageInclusiveFromList(44_000),
  "torque-wrench": packageInclusiveFromList(198_000),
  "simple-abutment-2": 13_200,
  "simple-healing-2": 13_200,
  "simple-abutment": 13_200,
  "simple-healing": 13_200,
};

/** 타일 여백 보정 — 흰 배경 큰 상품일수록 확대. 어벗 4종은 원본(1). */
const STORE_IMAGE_SCALES: Record<string, number> = {
  "full-package": 1.22,
  "surgical-kit": 1.22,
  "initial-kit": 1.22,
  "check-kit": 1.18,
  "prosthetic-kit": 1.18,
  "kit-case": 1.22,
  "kit-case-surgical": 1.22,
  "kit-case-initial": 1.22,
  "kit-case-check": 1.22,
  "kit-case-prosthetic": 1.22,
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
  const options = product.options?.map((opt) => ({
    ...opt,
    listPriceInclusive:
      opt.listPriceInclusive !== undefined
        ? opt.listPriceInclusive
        : (STORE_LIST_INCLUSIVE_PRICES[opt.id] ?? null),
    packagePriceInclusive:
      opt.packagePriceInclusive !== undefined
        ? opt.packagePriceInclusive
        : (STORE_PACKAGE_INCLUSIVE_PRICES[opt.id] ?? null),
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
    packagePriceInclusive:
      product.packagePriceInclusive !== undefined
        ? product.packagePriceInclusive
        : (STORE_PACKAGE_INCLUSIVE_PRICES[product.id] ?? null),
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
          packagePriceInclusive: opt.packagePriceInclusive,
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
  "surgical-kit": {
    glow: "bg-accent/15",
    accent: "text-accent-glow",
    ring: "ring-accent/20",
    progress: "bg-accent",
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
