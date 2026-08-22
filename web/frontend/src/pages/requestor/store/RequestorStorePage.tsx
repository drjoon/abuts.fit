// change-log:
// - 2026-08-22: 치과 스토어 최소 화면 — 카테고리별 상품 그리드(acrodent 이미지 임시).
// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { cn } from "@/shared/ui/cn";

type StoreProduct = {
  id: string;
  name: string;
  image: string;
  blurb: string;
};

type StoreCategory = {
  id: string;
  label: string;
  products: StoreProduct[];
};

/** 치과 스토어 카탈로그(임시). 이미지는 acrodent.com 상품 썸네일. */
const STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "guide-kit",
    label: "Guide Kit",
    products: [
      {
        id: "guide-pen",
        name: "GuidePen",
        image: "/store/guide-pen.jpg",
        blurb: "가이드 드릴용 Pen",
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
        id: "gum-shaper",
        name: "GumShaper",
        image: "/store/gum-shaper.jpg",
        blurb: "연조직 성형",
      },
    ],
  },
  {
    id: "abutment",
    label: "Abutment",
    products: [
      {
        id: "gum-cap",
        name: "GumCap",
        image: "/store/gum-cap.jpg",
        blurb: "연조직 형태 유지",
      },
      {
        id: "simple-abutment-2",
        name: "SimpleAbutment2",
        image: "/store/simple-abutment.jpg",
        blurb: "심플 어벗먼트",
      },
      {
        id: "simple-healing-2",
        name: "SimpleHealing2",
        image: "/store/simple-healing.jpg",
        blurb: "심플 힐링 어벗먼트",
      },
      {
        id: "custom-abutment",
        name: "CustomAbutment",
        image: "/store/custom-abutment.jpg",
        blurb: "커스텀 밀링 어벗먼트",
      },
    ],
  },
];

function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background",
        "transition-shadow hover:shadow-sm",
      )}
    >
      <div className="relative aspect-square bg-muted/40">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-border/60 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {product.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{product.blurb}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-auto w-full"
          disabled
        >
          곧 구매 가능
        </Button>
      </div>
    </article>
  );
}

export default function RequestorStorePage() {
  const { kind, loading } = useRequestorBusinessAccess();

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6">
        <header className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">스토어</h1>
            <Badge variant="secondary" className="font-normal">
              미리보기
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Guide·Bone·Gum Kit과 Abutment 상품을 준비 중입니다.
          </p>
        </header>

        <div className="space-y-10">
          {STORE_CATEGORIES.map((category) => (
            <section key={category.id} className="space-y-3">
              <div className="flex items-baseline gap-2 border-b border-border/70 pb-2">
                <h2 className="text-base font-semibold tracking-tight">
                  {category.label}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {category.products.length}개
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {category.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
