// related files:
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/features/landing/LandingStoreShowcase.tsx

export type StoreProduct = {
  id: string;
  name: string;
  image: string;
  blurb: string;
  /** 원본 여백이 클 때 썸네일 확대 (예: 1.45) */
  imageScale?: number;
};

export type StoreCategory = {
  id: string;
  label: string;
  products: StoreProduct[];
};

/**
 * 치과 스토어 카탈로그(임시).
 * Guide Kit: TheSimple Kit Initial 카탈로그에서 GBR Pen·Bone Trimmer 제외.
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
      },
      {
        id: "simple-healing-2",
        name: "SimpleHealing2",
        image: "/store/simple-healing.jpg",
        blurb: "심플 힐링 어벗먼트",
      },
    ],
  },
  {
    id: "guide-kit",
    label: "Guide Kit",
    products: [
      {
        id: "guide-kit-case",
        name: "Guide Kit",
        image: "/store/guide-kit-case.jpg",
        blurb: "가이드 키트 케이스",
      },
      {
        id: "guide-pen",
        name: "GuidePen",
        image: "/store/guide-pen.jpg",
        blurb: "가이드 드릴용 Pen",
      },
      {
        id: "cup",
        name: "Cup",
        image: "/store/cup.jpg",
        blurb: "Pen용 Cup",
      },
      {
        id: "guide-pin",
        name: "GuidePin",
        image: "/store/guide-pin.jpg",
        blurb: "가이드 공간 확인용 Pin",
      },
    ],
  },
  {
    id: "bone-kit",
    label: "Bone Kit",
    products: [
      {
        id: "bone-shaper",
        name: "BoneShaper",
        image: "/store/bone-shaper.jpg",
        blurb: "피질골 삭제·성형",
      },
    ],
  },
  {
    id: "gum-kit",
    label: "Gum Kit",
    products: [
      {
        id: "gingival-shaper",
        name: "GumShaper",
        image: "/store/gingival-shaper-296.jpg",
        blurb: "어벗 마진 치은 삭제",
        imageScale: 1.55,
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
  "guide-kit": {
    glow: "bg-accent/15",
    accent: "text-accent-glow",
    ring: "ring-accent/20",
    progress: "bg-accent",
  },
  "bone-kit": {
    glow: "bg-amber-400/12",
    accent: "text-amber-200",
    ring: "ring-amber-400/15",
    progress: "bg-amber-400",
  },
  "gum-kit": {
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
