// change-log:
// - 2026-08-23: 배송지 = 설정·사업자 주소(읽기 전용). 변경은 설정 CTA.
// - 2026-08-23: 기본 배송지 = practiceProfile(즉시). catalog API 호출 제거.
// - 2026-08-23: 스토어 결제 = 선수금만. 잔액 부족 시 충전 탭으로 이동.
// - 2026-08-23: 2열 반응형·배송료(10만원 이하 3,300원 부가세 포함).
// - 2026-08-23: 2열 반응형(상품·배송지 / 결제 요약 사이드바).
// - 2026-08-23: 배송지 입력. 커스텀어벗·크레딧 합치기 금지 유지.
// related files:
// - web/frontend/src/store/useStoreCartStore.ts
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/shared/store/storeDefaultShipping.ts
import { useEffect, useMemo, useState } from "react";
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
  formatStoreShippingAddressLine,
  isStoreShippingReady,
  resolveStoreShippingFromBusiness,
  STORE_BUSINESS_SETTINGS_PATH,
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
  const [shippingLoading, setShippingLoading] = useState(true);
  const [shipping, setShipping] = useState<StoreShippingForm>(() =>
    resolveStoreShippingFromBusiness(user),
  );
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!token) {
      setShipping(resolveStoreShippingFromBusiness(user));
      setShippingLoading(false);
      return;
    }
    let cancelled = false;
    setShippingLoading(true);
    void loadBusinessMeCached({ token, businessType: "requestor" })
      .then((data) => {
        if (cancelled) return;
        setShipping(resolveStoreShippingFromBusiness(user, data?.metadata));
      })
      .catch(() => {
        if (cancelled) return;
        setShipping(resolveStoreShippingFromBusiness(user));
      })
      .finally(() => {
        if (!cancelled) setShippingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const shippingReady = isStoreShippingReady(shipping);
  const addressLine = formatStoreShippingAddressLine(shipping);

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
    if (!shippingReady) {
      toast.error("설정 · 사업자에 배송 주소를 등록해 주세요.");
      navigate(STORE_BUSINESS_SETTINGS_PATH);
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
          shipping: { ...shipping, memo: memo.trim() },
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">배송지</h2>
                  <Button variant="link" size="sm" className="h-auto px-0" asChild>
                    <Link to={STORE_BUSINESS_SETTINGS_PATH}>
                      배송지 변경
                    </Link>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  사업자 정보에 등록된 주소로 배송합니다.
                </p>
                {shippingLoading ? (
                  <p className="text-sm text-muted-foreground">불러오는 중…</p>
                ) : shippingReady ? (
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">수령인</dt>
                      <dd className="font-medium">{shipping.recipientName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">연락처</dt>
                      <dd className="font-medium">{shipping.phone}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">주소</dt>
                      <dd className="font-medium">{addressLine}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="space-y-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground">
                      배송 주소가 등록되어 있지 않습니다. 설정 · 사업자에서
                      주소와 연락처를 입력해 주세요.
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={STORE_BUSINESS_SETTINGS_PATH}>
                        설정 · 사업자로 이동
                      </Link>
                    </Button>
                  </div>
                )}
                <Input
                  placeholder="배송 메모 (선택)"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
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
                disabled={submitting || shippingLoading || !shippingReady}
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
