import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import type { StoreProduct } from "@/shared/store/storeCatalog";
import {
  STORE_PRICE_TAX_NOTE,
  splitInclusiveVat,
} from "@/shared/tax/invoiceLabels";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";

type StoreProductCardProps = {
  product: StoreProduct;
};

export function StoreProductCard({ product }: StoreProductCardProps) {
  const scale = product.imageScale ?? 1;
  const inclusive = product.listPriceInclusive;
  const split =
    inclusive != null && inclusive > 0 ? splitInclusiveVat(inclusive) : null;

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background",
        "transition-shadow hover:shadow-sm",
      )}
    >
      <Link
        to={`/dashboard/store/${product.id}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-square overflow-hidden bg-muted/30">
          <img
            src={product.image}
            alt={product.name}
            className={cn(
              "h-full w-full object-contain p-5 transition-transform duration-300 sm:p-6",
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
        <div className="flex flex-1 flex-col gap-1.5 border-t border-border/60 p-3 sm:p-4">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {product.name}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
              {product.blurb}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Badge variant="outline" className="text-[10px] font-normal">
                {STORE_PRICE_TAX_NOTE}
              </Badge>
              {inclusive != null ? (
                <span className="text-sm font-semibold tabular-nums">
                  {formatWonWithUnit(inclusive)}
                </span>
              ) : null}
            </div>
            {split ? (
              <p className="text-[10px] text-muted-foreground">
                공급 {formatWonWithUnit(split.supply)} · 세액{" "}
                {formatWonWithUnit(split.vat)}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled
        >
          곧 구매 가능
        </Button>
      </div>
    </article>
  );
}
