import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import type { StoreProduct } from "@/shared/store/storeCatalog";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { useStoreCartStore } from "@/store/useStoreCartStore";

type StoreProductCardProps = {
  product: StoreProduct;
};

export function StoreProductCard({ product }: StoreProductCardProps) {
  const scale = product.imageScale ?? 1;
  const inclusive = product.listPriceInclusive;
  const addItem = useStoreCartStore((s) => s.addItem);

  return (
    <article
      className={cn(
        "group flex overflow-hidden rounded-lg border border-border/70 bg-background",
        "flex-row sm:flex-col",
        "transition-shadow hover:shadow-sm",
      )}
    >
      <Link
        to={`/dashboard/store/${product.id}`}
        className="relative w-44 shrink-0 overflow-hidden bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-[5/4] sm:w-full"
      >
        <img
          src={product.image}
          alt={product.name}
          className={cn(
            "h-full w-full object-contain p-3 transition-transform duration-300 sm:p-4",
            scale === 1 && "group-hover:scale-[1.03]",
          )}
          style={
            scale !== 1
              ? { transform: `scale(${scale})`, transformOrigin: "center" }
              : undefined
          }
          loading="lazy"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          to={`/dashboard/store/${product.id}`}
          className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:border-t sm:border-border/60"
        >
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {product.name}
          </h3>
          <p className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1 sm:truncate">
            {product.blurb}
          </p>
          {inclusive != null ? (
            <span className="pt-0.5 text-sm font-semibold tabular-nums">
              {formatWonWithUnit(inclusive)}
            </span>
          ) : null}
        </Link>
        <div className="border-t border-border/60 px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-xs"
            disabled={inclusive == null}
            onClick={(e) => {
              e.preventDefault();
              addItem(product.id, 1);
              toast.success("장바구니에 담았습니다.");
            }}
          >
            <span className="sm:hidden">담기</span>
            <span className="hidden sm:inline">장바구니 담기</span>
          </Button>
        </div>
      </div>
    </article>
  );
}
