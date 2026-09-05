// change-log:
// - 2026-08-23: 문구 축소, 모바일 1열 컴팩트 카드, 반응형 열 수 조정.
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
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/70 pb-1.5">
        {labels.map((label, index) => (
          <span key={label} className="flex items-baseline gap-2">
            {index > 0 ? (
              <span className="text-[11px] text-muted-foreground">·</span>
            ) : null}
            <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
          </span>
        ))}
        <span className="text-[11px] text-muted-foreground">
          {products.length}개
        </span>
      </div>
      {/* portrait phone: 1열 · landscape/sm+: 2 · md: 3 · lg: 4 */}
      <div className="grid grid-cols-1 gap-2 max-sm:landscape:grid-cols-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
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
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto" data-guide-tour="store_workspace">
      <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">스토어</h1>
            <Badge variant="outline" className="text-[11px] font-normal">
              {STORE_PRICE_TAX_NOTE}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              선수금 · 커스텀어벗과 별도
            </span>
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

        <div className="space-y-6 sm:space-y-8">
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
