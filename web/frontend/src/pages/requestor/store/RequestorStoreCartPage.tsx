// change-log:
// - 2026-08-23: 기본 배송지 = practiceProfile(즉시). catalog API 호출 제거.
// - 2026-08-23: 스토어 결제 = 선수금만. 잔액 부족 시 충전 탭으로 이동.
// - 2026-08-23: 2열 반응형·배송료(10만원 이하 3,300원 부가세 포함).
// - 2026-08-23: 2열 반응형(상품·배송지 / 결제 요약 사이드바).
// - 2026-08-23: 배송지 입력. 커스텀어벗·크레딧 합치기 금지 유지.
// related files:
// - web/frontend/src/store/useStoreCartStore.ts
// - web/frontend/src/shared/store/storeCatalog.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/useAuthStore";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import { getStoreProductById } from "@/shared/store/storeCatalog";
import {
  STORE_PRICE_TAX_NOTE,
  splitInclusiveVat,
} from "@/shared/tax/invoiceLabels";
import { STORE_CART_MERGE_WITH_CREDIT_OR_CUSTOM_ABUTMENT } from "@/shared/tax/ledgerTaxLanes";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { useStoreCartStore } from "@/store/useStoreCartStore";
import { apiFetch } from "@/shared/api/apiClient";
import { STORE_SHELL_CLASS } from "@/pages/requestor/store/storeOrderUi";
import {
  buildStoreOrderTotalsWithShipping,
  STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE,
} from "@/shared/store/storeShipping";
import {
  resolveDefaultStoreShipping,
  type StoreShippingForm,
} from "@/shared/store/storeDefaultShipping";

export default function RequestorStoreCartPage() {
  const { kind, loading } = useRequestorBusinessAccess();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const lines = useStoreCartStore((s) => s.lines);
  const setQty = useStoreCartStore((s) => s.setQty);
  const removeItem = useStoreCartStore((s) => s.removeItem);
  const clear = useStoreCartStore((s) => s.clear);
  const [submitting, setSubmitting] = useState(false);
  const [shipping, setShipping] = useState<StoreShippingForm>(() =>
    resolveDefaultStoreShipping(user),
  );
  const shippingTouchedRef = useRef(false);
  const shippingEnrichedRef = useRef(false);

  useEffect(() => {
    if (shippingTouchedRef.current) return;
    setShipping(resolveDefaultStoreShipping(user));
  }, [user]);

  useEffect(() => {
    if (shippingEnrichedRef.current || shippingTouchedRef.current || !token) {
      return;
    }
    const fromProfile = resolveDefaultStoreShipping(user);
    if (fromProfile.recipientName && fromProfile.phone && fromProfile.address) {
      shippingEnrichedRef.current = true;
      return;
    }
    shippingEnrichedRef.current = true;
    void loadBusinessMeCached({ token, businessType: "requestor" })
      .then((data) => {
        if (shippingTouchedRef.current || !data?.metadata) return;
        setShipping(resolveDefaultStoreShipping(user, data.metadata));
      })
      .catch(() => {
        /* metadata 없으면 practiceProfile만 사용 */
      });
  }, [token, user]);

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

  const goodsTotal = useMemo(
    () => rows.reduce((s, r) => s + r.lineTotal, 0),
    [rows],
  );

  const orderTotals = useMemo(
    () => buildStoreOrderTotalsWithShipping(goodsTotal),
    [goodsTotal],
  );

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
        code?: string;
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
          paymentMethod: "CREDIT",
        },
      });
      const body = res.data;
      if (
        !res.ok &&
        (body?.code === "INSUFFICIENT_PAID_CREDIT" || res.status === 402)
      ) {
        toast.error(body?.message || "선수금 잔액이 부족합니다. 충전 후 다시 주문해 주세요.");
        navigate("/dashboard/credits?tab=charge");
        return;
      }
      if (!res.ok || !body?.success || !body.data?.order?._id) {
        throw new Error(body?.message || "주문 생성에 실패했습니다.");
      }
      clear();
      toast.success("선수금으로 결제되었습니다.");
      navigate(`/dashboard/store/orders/${body.data.order._id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "주문 생성에 실패했습니다.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function patchShipping<K extends keyof StoreShippingForm>(
    key: K,
    value: StoreShippingForm[K],
  ) {
    shippingTouchedRef.current = true;
    setShipping((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className={STORE_SHELL_CLASS}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link to="/dashboard/store">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                스토어
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                장바구니
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                상품 {rows.length}종 · 수량{" "}
                {rows.reduce((n, r) => n + r.line.qty, 0)}개
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {STORE_PRICE_TAX_NOTE}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/store/orders">주문 내역</Link>
            </Button>
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            장바구니가 비어 있습니다.{" "}
            <Link to="/dashboard/store" className="underline">
              스토어로 이동
            </Link>
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start">
            <div className="space-y-6">
              <ul className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card">
                {rows.map(({ line, product, unit, lineTotal, split }) => (
                  <li
                    key={line.productId}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        단가 {formatWonWithUnit(unit)} · 공급{" "}
                        {formatWonWithUnit(split.supply)} · 세액{" "}
                        {formatWonWithUnit(split.vat)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
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
                      </div>
                      <p className="min-w-[5.5rem] text-right font-medium tabular-nums">
                        {formatWonWithUnit(lineTotal)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4 sm:p-6">
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
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 bg-card p-4 sm:p-6 lg:sticky lg:top-4">
              <h2 className="text-sm font-semibold">주문 요약</h2>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">상품 합계</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(orderTotals.itemsAmountTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">배송료</span>
                <span className="tabular-nums">
                  {orderTotals.shippingFeeInclusive > 0
                    ? formatWonWithUnit(orderTotals.shippingFeeInclusive)
                    : "무료"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                상품 {formatWonWithUnit(STORE_SHIPPING_FREE_THRESHOLD_INCLUSIVE)}{" "}
                초과 시 배송 무료
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">공급가</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(orderTotals.supply)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">부가세</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(orderTotals.vat)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/70 pt-3 text-base font-semibold">
                <span>합계</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(orderTotals.total)}
                </span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                스토어는 선수금으로만 결제합니다. 기공·커스텀어벗과 장바구니를
                합치지 않으며, (세금)계산서는 사용분 기준 월말 과세 발행됩니다.
              </p>
              <Button
                type="button"
                className="mt-2 w-full"
                disabled={submitting}
                onClick={() => void checkout()}
              >
                {submitting ? "결제 중…" : "선수금으로 결제"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
