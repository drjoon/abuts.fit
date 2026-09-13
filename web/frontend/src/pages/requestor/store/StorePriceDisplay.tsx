// change-log:
// - 2026-09-13: 패키지 구매자 — 판매가 취소선 + pkg가 표시.
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
import { cn } from "@/shared/ui/cn";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import {
  resolveStoreUnitPriceInclusive,
  type StoreProduct,
} from "@/shared/store/storeCatalog";

type StorePriceDisplayProps = {
  product: Pick<
    StoreProduct,
    "listPriceInclusive" | "packagePriceInclusive" | "alwaysUsePackagePrice"
  >;
  isPackageBuyer: boolean;
  className?: string;
  /** 카드=sm, 상세=lg */
  size?: "sm" | "lg";
};

/** 패키지 구매자면 pkg가. alwaysUsePackagePrice 상품은 상시 pkg. */
export function StorePriceDisplay({
  product,
  isPackageBuyer,
  className,
  size = "sm",
}: StorePriceDisplayProps) {
  const list = product.listPriceInclusive;
  if (list == null) return null;

  const unit = resolveStoreUnitPriceInclusive(product, isPackageBuyer);
  if (unit == null) return null;

  const showPkg =
    (isPackageBuyer || Boolean(product.alwaysUsePackagePrice)) &&
    product.packagePriceInclusive != null &&
    product.packagePriceInclusive !== list;

  const priceClass =
    size === "lg"
      ? "text-base font-semibold tabular-nums sm:text-lg"
      : "text-sm font-semibold tabular-nums";
  const strikeClass =
    size === "lg"
      ? "text-sm tabular-nums text-muted-foreground line-through sm:text-base"
      : "text-xs tabular-nums text-muted-foreground line-through";

  if (!showPkg) {
    return (
      <span className={cn(priceClass, className)}>
        {formatWonWithUnit(list)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5",
        className,
      )}
    >
      <span className={strikeClass}>{formatWonWithUnit(list)}</span>
      <span className={priceClass}>{formatWonWithUnit(unit)}</span>
    </span>
  );
}
