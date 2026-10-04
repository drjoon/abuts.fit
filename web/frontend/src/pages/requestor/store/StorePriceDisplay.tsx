// change-log:
// - 2026-10-04: 패키지 할인 제거 — 판매가(단일가)만 표시.
// - 2026-09-13: 패키지 구매자 — 판매가 취소선 + pkg가 표시.
// related files:
// - web/frontend/src/shared/store/storeCatalog.ts
import { cn } from "@/shared/ui/cn";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import type { StoreProduct } from "@/shared/store/storeCatalog";

type StorePriceDisplayProps = {
  product: Pick<StoreProduct, "listPriceInclusive" | "priceFrom">;
  className?: string;
  /** 카드=sm, 상세=lg */
  size?: "sm" | "lg";
};

/** 스토어 단일 판매가(부가세 포함). */
export function StorePriceDisplay({
  product,
  className,
  size = "sm",
}: StorePriceDisplayProps) {
  const list = product.listPriceInclusive;
  if (list == null) return null;

  const fromSuffix = product.priceFrom ? "~" : "";
  const priceClass =
    size === "lg"
      ? "text-base font-semibold tabular-nums sm:text-lg"
      : "text-sm font-semibold tabular-nums";

  return (
    <span className={cn(priceClass, className)}>
      {formatWonWithUnit(list)}
      {fromSuffix}
    </span>
  );
}
