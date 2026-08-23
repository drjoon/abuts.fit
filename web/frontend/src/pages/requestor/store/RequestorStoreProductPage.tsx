// change-log:
// - 2026-08-23: 상세 문구·타이포 축소, 중복 배지 정리.
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/App.tsx
import { Navigate, Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  getStoreCategoryForProduct,
  getStoreProductById,
} from "@/shared/store/storeCatalog";
import {
  STORE_PRICE_TAX_NOTE,
  splitInclusiveVat,
} from "@/shared/tax/invoiceLabels";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { useStoreCartStore } from "@/store/useStoreCartStore";

export default function RequestorStoreProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { kind, loading } = useRequestorBusinessAccess();
  const addItem = useStoreCartStore((s) => s.addItem);
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
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
            <Link to="/dashboard/store">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              스토어
            </Link>
          </Button>
          <Badge variant="secondary" className="text-[11px] font-normal">
            {category.label}
          </Badge>
          <Badge variant="outline" className="text-[11px] font-normal">
            {STORE_PRICE_TAX_NOTE}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/30">
              <div className="relative aspect-square max-h-[min(52vh,28rem)] w-full sm:max-h-none">
                <img
                  src={galleryImages[0]}
                  alt={product.name}
                  className="h-full w-full object-contain p-4 sm:p-6"
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
              <div className="grid grid-cols-4 gap-1.5">
                {galleryImages.map((image) => (
                  <div
                    key={image}
                    className="overflow-hidden rounded-md border border-border/60 bg-muted/20"
                  >
                    <img
                      src={image}
                      alt=""
                      className="aspect-square w-full object-contain p-1.5"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <header className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {product.name}
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {product.blurb}
              </p>
              {product.listPriceInclusive != null ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
                  <span className="text-base font-semibold tabular-nums sm:text-lg">
                    {formatWonWithUnit(product.listPriceInclusive)}
                  </span>
                  {product.listPriceInclusive > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      공급{" "}
                      {formatWonWithUnit(
                        splitInclusiveVat(product.listPriceInclusive).supply,
                      )}{" "}
                      · 세액{" "}
                      {formatWonWithUnit(
                        splitInclusiveVat(product.listPriceInclusive).vat,
                      )}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </header>

            {product.description ? (
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {product.description}
              </p>
            ) : null}

            {product.specs?.length ? (
              <section className="space-y-1.5">
                <h2 className="text-xs font-semibold sm:text-sm">상품 정보</h2>
                <dl className="divide-y divide-border/70 rounded-md border border-border/70 text-xs sm:text-sm">
                  {product.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="grid grid-cols-[6.5rem_1fr] gap-2 px-2.5 py-2 sm:grid-cols-[7rem_1fr] sm:gap-3 sm:px-3"
                    >
                      <dt className="text-muted-foreground">{spec.label}</dt>
                      <dd className="leading-snug">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  addItem(product.id, 1);
                  toast.success("장바구니에 담았습니다.");
                }}
                disabled={product.listPriceInclusive == null}
              >
                장바구니 담기
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/dashboard/store/cart">장바구니</Link>
              </Button>
            </div>
          </div>
        </div>

        {contentImages.length > 0 ? (
          <section className="space-y-2.5 border-t border-border/70 pt-6">
            <h2 className="text-sm font-semibold tracking-tight">상세 · 사용법</h2>
            <div className="space-y-3">
              {contentImages.map((image) => (
                <div
                  key={image}
                  className="overflow-hidden rounded-lg border border-border/70 bg-background"
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
