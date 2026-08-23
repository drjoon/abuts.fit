// change-log:
// - 2026-08-23: 배송지 입력. 커스텀어벗·크레딧 합치기 금지 유지.
// - 2026-08-23: 스토어 장바구니·체크아웃(입금).
// related files:
// - web/frontend/src/store/useStoreCartStore.ts
// - web/frontend/src/shared/store/storeCatalog.ts
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { getStoreProductById } from "@/shared/store/storeCatalog";
import {
  STORE_PRICE_TAX_NOTE,
  splitInclusiveVat,
} from "@/shared/tax/invoiceLabels";
import { STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT } from "@/shared/tax/ledgerTaxLanes";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { useStoreCartStore } from "@/store/useStoreCartStore";
import { apiFetch } from "@/shared/api/apiClient";

type ShippingForm = {
  recipientName: string;
  phone: string;
  zipCode: string;
  address: string;
  addressDetail: string;
  memo: string;
};

const EMPTY_SHIPPING: ShippingForm = {
  recipientName: "",
  phone: "",
  zipCode: "",
  address: "",
  addressDetail: "",
  memo: "",
};

export default function RequestorStoreCartPage() {
  const { kind, loading } = useRequestorBusinessAccess();
  const navigate = useNavigate();
  const lines = useStoreCartStore((s) => s.lines);
  const setQty = useStoreCartStore((s) => s.setQty);
  const removeItem = useStoreCartStore((s) => s.removeItem);
  const clear = useStoreCartStore((s) => s.clear);
  const [submitting, setSubmitting] = useState(false);
  const [shipping, setShipping] = useState<ShippingForm>(EMPTY_SHIPPING);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{
          success: boolean;
          data?: { defaultShipping?: ShippingForm };
        }>({ path: "/api/store/catalog" });
        const def = res.data?.data?.defaultShipping;
        if (def) {
          setShipping({
            recipientName: def.recipientName || "",
            phone: def.phone || "",
            zipCode: def.zipCode || "",
            address: def.address || "",
            addressDetail: def.addressDetail || "",
            memo: def.memo || "",
          });
        }
      } catch {
        /* 기본 배송지 없으면 빈 폼 */
      }
    })();
  }, []);

  const rows = useMemo(() => {
    return lines
      .map((line) => {
        const product = getStoreProductById(line.productId);
        if (!product || product.listPriceInclusive == null) return null;
        const unit = product.listPriceInclusive;
        const lineTotal = unit * line.qty;
        const split = splitInclusiveVat(lineTotal);
        return { line, product, unit, lineTotal, split };
      })
      .filter(Boolean) as Array<{
      line: { productId: string; qty: number };
      product: NonNullable<ReturnType<typeof getStoreProductById>>;
      unit: number;
      lineTotal: number;
      split: { supply: number; vat: number; total: number };
    }>;
  }, [lines]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.lineTotal, 0);
    return splitInclusiveVat(total);
  }, [rows]);

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  async function checkout() {
    if (rows.length === 0) return;
    if (STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT) {
      toast.error("스토어 장바구니는 크레딧·커스텀어벗과 합칠 수 없습니다.");
      return;
    }
    if (
      !shipping.recipientName.trim() ||
      !shipping.phone.trim() ||
      !shipping.address.trim()
    ) {
      toast.error("배송지(수령인·연락처·주소)를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: { order: { _id: string } };
      }>({
        path: "/api/store/orders",
        method: "POST",
        jsonBody: {
          items: rows.map((r) => ({
            productId: r.line.productId,
            qty: r.line.qty,
          })),
          shipping,
        },
      });
      const body = res.data;
      if (!res.ok || !body?.success || !body.data?.order?._id) {
        throw new Error(body?.message || "주문 생성에 실패했습니다.");
      }
      clear();
      toast.success("주문이 생성되었습니다. 입금 정보를 확인하세요.");
      navigate(`/dashboard/store/orders/${body.data.order._id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "주문 생성에 실패했습니다.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function patchShipping<K extends keyof ShippingForm>(
    key: K,
    value: ShippingForm[K],
  ) {
    setShipping((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/dashboard/store">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              스토어
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">장바구니</h1>
          <Badge variant="outline" className="font-normal">
            {STORE_PRICE_TAX_NOTE}
          </Badge>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            장바구니가 비어 있습니다.{" "}
            <Link to="/dashboard/store" className="underline">
              스토어로 이동
            </Link>
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
              {rows.map(({ line, product, unit, lineTotal, split }) => (
                <li
                  key={line.productId}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWonWithUnit(unit)} · 공급{" "}
                      {formatWonWithUnit(split.supply)} · 세액{" "}
                      {formatWonWithUnit(split.vat)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => setQty(line.productId, line.qty - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-8 text-center tabular-nums text-sm">
                      {line.qty}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => setQty(line.productId, line.qty + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => removeItem(line.productId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <p className="w-24 text-right text-sm font-medium tabular-nums">
                      {formatWonWithUnit(lineTotal)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3 rounded-xl border border-border/70 p-4">
              <h2 className="text-sm font-semibold">배송지</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="수령인"
                  value={shipping.recipientName}
                  onChange={(e) =>
                    patchShipping("recipientName", e.target.value)
                  }
                />
                <Input
                  placeholder="연락처"
                  value={shipping.phone}
                  onChange={(e) => patchShipping("phone", e.target.value)}
                />
                <Input
                  placeholder="우편번호"
                  value={shipping.zipCode}
                  onChange={(e) => patchShipping("zipCode", e.target.value)}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="주소"
                  value={shipping.address}
                  onChange={(e) => patchShipping("address", e.target.value)}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="상세 주소"
                  value={shipping.addressDetail}
                  onChange={(e) =>
                    patchShipping("addressDetail", e.target.value)
                  }
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="배송 메모 (선택)"
                  value={shipping.memo}
                  onChange={(e) => patchShipping("memo", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">공급가</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(totals.supply)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">부가세</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(totals.vat)}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>합계 (부가세 포함)</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(totals.total)}
                </span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                커스텀어벗·크레딧 경로와 장바구니·세금계산서를 합치지 않습니다.
                입금 확인 후 세금계산서가 발행되며, 출고·배송은 별도 진행됩니다.
              </p>
              <Button
                type="button"
                className="mt-2 w-full"
                disabled={submitting}
                onClick={() => void checkout()}
              >
                {submitting ? "주문 생성 중…" : "입금 주문하기"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
