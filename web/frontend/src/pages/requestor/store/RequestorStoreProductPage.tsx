// change-log:
// - 2026-09-13: 상단은 이름·블러브·가격·옵션·담기만. 설명·스펙은 하단 컨텐츠.
// - 2026-09-13: Kit Case 등 옵션 필수 선택 후 담기.
// - 2026-09-13: acrodent 상세 OCR 텍스트·순수 이미지 블록 렌더.
// - 2026-09-13: 패키지 구매자 판매가 취소선·pkg가. 적용 단가 VAT 분해.
// - 2026-08-23: 상세 문구·타이포 축소, 중복 배지 정리.
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/shared/store/storeProductContent.ts
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  getStoreCategoryForProduct,
  getStoreOptionParentId,
  getStoreProductById,
  resolveStoreUnitPriceInclusive,
  type StoreProduct,
} from "@/shared/store/storeCatalog";
import { getStoreProductContent } from "@/shared/store/storeProductContent";
import {
  STORE_PRICE_TAX_NOTE,
  splitInclusiveVat,
} from "@/shared/tax/invoiceLabels";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { useStoreCartStore } from "@/store/useStoreCartStore";
import { useStorePackagePricing, applyStoreCatalogPrices } from "@/shared/store/useStorePackagePricing";
import { StorePriceDisplay } from "@/pages/requestor/store/StorePriceDisplay";
import { cn } from "@/shared/ui/cn";

export default function RequestorStoreProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { kind, loading } = useRequestorBusinessAccess();
  const { isPackageBuyer, priceByProductId } = useStorePackagePricing();
  const addItem = useStoreCartStore((s) => s.addItem);

  const optionParentId = getStoreOptionParentId(productId);
  const displayProductId = optionParentId ?? productId;
  const baseProduct = getStoreProductById(displayProductId);
  const rich = getStoreProductContent(displayProductId);
  const product = baseProduct
    ? applyStoreCatalogPrices(baseProduct, priceByProductId)
    : undefined;
  const category = getStoreCategoryForProduct(displayProductId);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    () => {
      if (optionParentId && productId) return productId;
      return product?.options?.[0]?.id ?? null;
    },
  );

  useEffect(() => {
    if (optionParentId && productId) {
      setSelectedOptionId(productId);
      return;
    }
    const parent = getStoreProductById(displayProductId);
    setSelectedOptionId(parent?.options?.[0]?.id ?? null);
  }, [productId, optionParentId, displayProductId]);

  const selectedOption = useMemo(() => {
    if (!product?.options?.length) return null;
    return (
      product.options.find((o) => o.id === selectedOptionId) ??
      product.options[0] ??
      null
    );
  }, [product, selectedOptionId]);

  const pricedForDisplay: StoreProduct | undefined = useMemo(() => {
    if (!product) return undefined;
    if (!selectedOption) return product;
    return {
      ...product,
      listPriceInclusive: selectedOption.listPriceInclusive ?? null,
      packagePriceInclusive: selectedOption.packagePriceInclusive ?? null,
      priceFrom: false,
    };
  }, [product, selectedOption]);

  const galleryImages = product?.galleryImages?.length
    ? product.galleryImages
    : product
      ? [product.image]
      : [];
  const contentBlocks = rich?.blocks ?? [];
  const contentImages =
    contentBlocks.length > 0 ? [] : (product?.contentImages ?? []);
  const description = rich?.description ?? product?.description;
  const blurb = rich?.blurb ?? product?.blurb;
  const specs =
    rich?.specs?.length ? rich.specs : (product?.specs ?? []);
  const scale = product?.imageScale ?? 1;
  const unitPrice = pricedForDisplay
    ? resolveStoreUnitPriceInclusive(pricedForDisplay, isPackageBuyer)
    : null;

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  if (!product || !category || !pricedForDisplay) {
    return <Navigate to="/dashboard/store" replace />;
  }

  const requiresOption = Boolean(product.options?.length);

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
                  className="h-full w-full object-contain p-2 sm:p-3"
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

          <div className="flex flex-col justify-center space-y-4">
            <header className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {product.name}
              </h1>
              {blurb ? (
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {blurb}
                </p>
              ) : null}
              {pricedForDisplay.listPriceInclusive != null ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
                  <StorePriceDisplay
                    product={pricedForDisplay}
                    isPackageBuyer={isPackageBuyer}
                    size="lg"
                  />
                  {unitPrice != null && unitPrice > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      공급{" "}
                      {formatWonWithUnit(splitInclusiveVat(unitPrice).supply)}{" "}
                      · 세액{" "}
                      {formatWonWithUnit(splitInclusiveVat(unitPrice).vat)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </header>

            {requiresOption && product.options ? (
              <section className="space-y-1.5">
                <h2 className="text-xs font-semibold sm:text-sm">케이스 종류</h2>
                <div className="grid gap-1.5">
                  {product.options.map((opt) => {
                    const optProduct: StoreProduct = {
                      ...product,
                      listPriceInclusive: opt.listPriceInclusive ?? null,
                      packagePriceInclusive: opt.packagePriceInclusive ?? null,
                      priceFrom: false,
                    };
                    const selected = selectedOption?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedOptionId(opt.id)}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-xs transition-colors sm:text-sm",
                          selected
                            ? "border-foreground/40 bg-muted/40"
                            : "border-border/70 hover:border-border hover:bg-muted/20",
                        )}
                      >
                        <span className="font-medium">{opt.label}</span>
                        <StorePriceDisplay
                          product={optProduct}
                          isPackageBuyer={isPackageBuyer}
                          size="sm"
                        />
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const cartId = requiresOption
                    ? selectedOption?.id
                    : product.id;
                  if (!cartId) {
                    toast.error("옵션을 선택해 주세요.");
                    return;
                  }
                  addItem(cartId, 1);
                  toast.success("장바구니에 담았습니다.");
                }}
                disabled={
                  pricedForDisplay.listPriceInclusive == null ||
                  (requiresOption && !selectedOption)
                }
              >
                장바구니 담기
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/dashboard/store/cart">장바구니</Link>
              </Button>
            </div>
          </div>
        </div>

        {description || specs.length > 0 || contentBlocks.length > 0 || contentImages.length > 0 ? (
          <section className="space-y-4 border-t border-border/70 pt-6">
            <h2 className="text-sm font-semibold tracking-tight">상세 · 사용법</h2>
            <div className="mx-auto max-w-3xl space-y-4">
              {description ? (
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {description}
                </p>
              ) : null}

              {specs.length ? (
                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold sm:text-sm">상품 정보</h3>
                  <dl className="divide-y divide-border/70 rounded-md border border-border/70 text-xs sm:text-sm">
                    {specs.map((spec) => (
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

              {contentBlocks.map((block, index) => {
                if (block.type === "heading") {
                  return (
                    <h3
                      key={`h-${index}`}
                      className="pt-1 text-sm font-semibold tracking-tight sm:text-base"
                    >
                      {block.text}
                    </h3>
                  );
                }
                if (block.type === "text") {
                  return (
                    <p
                      key={`t-${index}`}
                      className="text-xs leading-relaxed text-muted-foreground sm:text-sm"
                    >
                      {block.text}
                    </p>
                  );
                }
                if (block.type === "list") {
                  return (
                    <ul
                      key={`l-${index}`}
                      className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground sm:text-sm"
                    >
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <div
                    key={`i-${index}-${block.src}`}
                    className="overflow-hidden rounded-lg border border-border/70 bg-muted/20"
                  >
                    <img
                      src={block.src}
                      alt={block.alt || `${product.name} 상세`}
                      className="mx-auto h-auto w-full object-contain p-2 sm:p-3"
                      loading="lazy"
                    />
                  </div>
                );
              })}

              {contentBlocks.length === 0
                ? contentImages.map((image) => (
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
                  ))
                : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
