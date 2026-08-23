// change-log:
// - 2026-08-23: 미리보기 제거. 장바구니·주문 진입.
// - 2026-08-23: 작업영역 중첩 스크롤바를 카드 오른쪽 끝에 맞춤(workspace-nested-scroll).
// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/requestor/store/StoreProductCard.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
import { Link, Navigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  STORE_CATEGORIES,
  type StoreProduct,
} from "@/shared/store/storeCatalog";
import { StoreProductCard } from "@/pages/requestor/store/StoreProductCard";
import { useStoreCartStore } from "@/store/useStoreCartStore";
import { STORE_PRICE_TAX_NOTE } from "@/shared/tax/invoiceLabels";

const abutment = STORE_CATEGORIES.find((c) => c.id === "abutment")!;
const initialKit = STORE_CATEGORIES.find((c) => c.id === "initial-kit")!;
const checkKit = STORE_CATEGORIES.find((c) => c.id === "check-kit")!;
const gingivalKit = STORE_CATEGORIES.find((c) => c.id === "gingival-kit")!;

function ProductRow({
  labels,
  products,
}: {
  labels: string[];
  products: StoreProduct[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/70 pb-2">
        {labels.map((label, index) => (
          <span key={label} className="flex items-baseline gap-3">
            {index > 0 ? (
              <span className="text-xs text-muted-foreground">·</span>
            ) : null}
            <h2 className="text-base font-semibold tracking-tight">{label}</h2>
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          {products.length}개
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {products.map((product) => (
          <StoreProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

export default function RequestorStorePage() {
  const { kind, loading } = useRequestorBusinessAccess();
  const cartQty = useStoreCartStore((s) =>
    s.lines.reduce((n, l) => n + l.qty, 0),
  );

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">스토어</h1>
              <Badge variant="outline" className="font-normal">
                {STORE_PRICE_TAX_NOTE}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              기성품은 과세(부가세 포함가)이며, 입금 확인 후 세금계산서가
              발행됩니다. 커스텀어벗·크레딧(면세)과 장바구니를 합치지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/store/orders">주문 내역</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/dashboard/store/cart">
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                장바구니{cartQty > 0 ? ` (${cartQty})` : ""}
              </Link>
            </Button>
          </div>
        </header>

        <div className="space-y-10">
          <ProductRow
            labels={[abutment.label, gingivalKit.label]}
            products={[...abutment.products, ...gingivalKit.products]}
          />
          <ProductRow
            labels={[initialKit.label, checkKit.label]}
            products={[...initialKit.products, ...checkKit.products]}
          />
        </div>
      </div>
    </div>
  );
}
