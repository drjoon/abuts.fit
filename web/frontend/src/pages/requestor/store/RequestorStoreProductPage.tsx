// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/App.tsx
import { Navigate, Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  getStoreCategoryForProduct,
  getStoreProductById,
} from "@/shared/store/storeCatalog";

export default function RequestorStoreProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { kind, loading } = useRequestorBusinessAccess();
  const product = getStoreProductById(productId);
  const category = getStoreCategoryForProduct(productId);
  const galleryImages = product?.galleryImages?.length
    ? product.galleryImages
    : product
      ? [product.image]
      : [];
  const contentImages = product?.contentImages ?? [];
  const scale = product?.imageScale ?? 1;

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  if (!product || !category) {
    return <Navigate to="/dashboard/store" replace />;
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/dashboard/store">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              스토어
            </Link>
          </Button>
          <Badge variant="secondary" className="font-normal">
            {category.label}
          </Badge>
          <Badge variant="outline" className="font-normal">
            미리보기
          </Badge>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/30">
              <div className="relative aspect-square">
                <img
                  src={galleryImages[0]}
                  alt={product.name}
                  className="h-full w-full object-contain p-6"
                  style={
                    scale !== 1
                      ? {
                          transform: `scale(${scale})`,
                          transformOrigin: "center",
                        }
                      : undefined
                  }
                />
              </div>
            </div>
            {galleryImages.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {galleryImages.map((image) => (
                  <div
                    key={image}
                    className="overflow-hidden rounded-lg border border-border/60 bg-muted/20"
                  >
                    <img
                      src={image}
                      alt=""
                      className="aspect-square w-full object-contain p-2"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <header className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {category.label}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {product.name}
              </h1>
              <p className="text-sm text-muted-foreground">{product.blurb}</p>
            </header>

            {product.description ? (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">상품 설명</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </section>
            ) : null}

            {product.specs?.length ? (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">상품 정보 제공 고시</h2>
                <dl className="divide-y divide-border/70 rounded-lg border border-border/70 text-sm">
                  {product.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2.5"
                    >
                      <dt className="text-muted-foreground">{spec.label}</dt>
                      <dd className="leading-relaxed">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <div className="pt-1">
              <Button type="button" disabled>
                곧 구매 가능
              </Button>
            </div>
          </div>
        </div>

        {contentImages.length > 0 ? (
          <section className="space-y-3 border-t border-border/70 pt-8">
            <h2 className="text-base font-semibold tracking-tight">
              상세 정보 · 사용법
            </h2>
            <p className="text-sm text-muted-foreground">
              애크로덴트 제품 상세 페이지의 사용법·스펙 안내입니다.
            </p>
            <div className="space-y-4">
              {contentImages.map((image) => (
                <div
                  key={image}
                  className="overflow-hidden rounded-xl border border-border/70 bg-background"
                >
                  <img
                    src={image}
                    alt={`${product.name} 상세`}
                    className="mx-auto h-auto w-full max-w-3xl object-contain"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
