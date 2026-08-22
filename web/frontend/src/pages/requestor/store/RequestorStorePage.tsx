// change-log:
// - 2026-08-22: Abutment 옆에 Bone Kit·Gum Kit 배치. Guide Kit은 아래.
// - 2026-08-22: Abutment를 맨 위. GingivalShaper 썸네일 확대로 BoneShaper와 시각 크기 맞춤.
// - 2026-08-22: Bone Kit·Gum Kit을 한 행에 나란히 배치.
// - 2026-08-22: Guide Kit=Initial 카탈로그−GBR/Trimmer·케이스 273. GumShaper→GingivalShaper. GumCap 삭제. 심플어벗 206.
// - 2026-08-22: 치과 스토어 최소 화면 — 카테고리별 상품 그리드(acrodent 이미지 임시).
// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { cn } from "@/shared/ui/cn";
import {
  STORE_CATEGORIES,
  type StoreCategory,
  type StoreProduct,
} from "@/shared/store/storeCatalog";

/**
 * 치과 스토어 카탈로그 — SSOT: shared/store/storeCatalog.ts
 */

function ProductCard({ product }: { product: StoreProduct }) {
  const scale = product.imageScale ?? 1;
  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background",
        "transition-shadow hover:shadow-sm",
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted/40">
        <img
          src={product.image}
          alt={product.name}
          className={cn(
            "h-full w-full object-contain p-4 transition-transform duration-300",
            scale === 1 && "group-hover:scale-[1.03]",
          )}
          style={
            scale !== 1
              ? { transform: `scale(${scale})`, transformOrigin: "center" }
              : undefined
          }
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

function CategorySection({
  category,
  productGridClassName,
}: {
  category: StoreCategory;
  productGridClassName?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 border-b border-border/70 pb-2">
        <h2 className="text-base font-semibold tracking-tight">
          {category.label}
        </h2>
        <span className="text-xs text-muted-foreground">
          {category.products.length}개
        </span>
      </div>
      <div
        className={
          productGridClassName ??
          "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
        }
      >
        {category.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

const abutment = STORE_CATEGORIES.find((c) => c.id === "abutment")!;
const guideKit = STORE_CATEGORIES.find((c) => c.id === "guide-kit")!;
const boneKit = STORE_CATEGORIES.find((c) => c.id === "bone-kit")!;
const gumKit = STORE_CATEGORIES.find((c) => c.id === "gum-kit")!;

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
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            <div className="sm:col-span-2">
              <CategorySection
                category={abutment}
                productGridClassName="grid grid-cols-2 gap-3"
              />
            </div>
            <CategorySection
              category={boneKit}
              productGridClassName="grid grid-cols-1 gap-3 max-w-[50%] sm:max-w-none"
            />
            <CategorySection
              category={gumKit}
              productGridClassName="grid grid-cols-1 gap-3 max-w-[50%] sm:max-w-none"
            />
          </div>

          <CategorySection category={guideKit} />
        </div>
      </div>
    </div>
  );
}
