// change-log:
// - 2026-08-23: 주문 목록 취소·배송료 표시.
// - 2026-08-23: 주문 필터·테이블/카드 반응형, 상세 2열·선수금 결제·취소 확인.
// - 2026-08-23: 배송지·출고/배송 상태 표시.
// related files:
// - web/frontend/src/pages/requestor/store/storeOrderUi.tsx
// - web/backend/controllers/store/storeOrder.controller.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Package } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { STORE_PRICE_TAX_NOTE } from "@/shared/tax/invoiceLabels";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import {
  DepositInfoBlock,
  OrderProgressTimeline,
  OrderStatusBadges,
  STORE_ORDER_STATUS_LABEL,
  STORE_SHELL_CLASS,
  TrackingInfoBlock,
  type DepositAccount,
  type OrderFilterTab,
  type StoreOrder,
  formatOrderShortId,
  fulfillmentLabel,
  isOrderCustomerCancelable,
  orderMatchesFilter,
  orderStatusBadgeVariant,
  resolveStoreOrderItemsAmountTotal,
  summarizeOrderItems,
} from "@/pages/requestor/store/storeOrderUi";
import { resolveStoreOrderShippingFee } from "@/shared/store/storeShipping";

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} 복사됨`),
    () => toast.error("복사 실패"),
  );
}

function StorePageBack({
  to,
  label,
}: {
  to: string;
  label: string;
}) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 shrink-0">
      <Link to={to}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}

function OrderListRow({
  order,
  onCancel,
  canceling,
}: {
  order: StoreOrder;
  onCancel: (order: StoreOrder) => void;
  canceling: boolean;
}) {
  const canCancel = isOrderCustomerCancelable(order);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium tabular-nums">
            {formatOrderShortId(order._id)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatKstDateTimeToKo(order.createdAt)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {formatWonWithUnit(order.amountTotal)}
        </p>
      </div>
      <OrderStatusBadges order={order} />
      <p className="text-sm text-muted-foreground line-clamp-2">
        {summarizeOrderItems(order.items)}
      </p>
      <div className="flex flex-wrap gap-2">
        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={canceling}
            onClick={() => onCancel(order)}
          >
            취소
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link to={`/dashboard/store/orders/${order._id}`}>
            상세
            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function OrderListTable({
  orders,
  onCancel,
  canceling,
}: {
  orders: StoreOrder[];
  onCancel: (order: StoreOrder) => void;
  canceling: boolean;
}) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border/70 md:block">
      <table className="w-full text-sm">
        <thead className="border-b border-border/70 bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">주문일</th>
            <th className="px-4 py-3 font-medium">주문번호</th>
            <th className="px-4 py-3 font-medium">상품</th>
            <th className="px-4 py-3 font-medium">결제</th>
            <th className="px-4 py-3 font-medium">배송</th>
            <th className="px-4 py-3 font-medium text-right">금액</th>
            <th className="px-4 py-3 font-medium text-right">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {orders.map((order) => {
            const canCancel = isOrderCustomerCancelable(order);
            return (
            <tr key={order._id} className="bg-card hover:bg-muted/20">
              <td className="px-4 py-3 align-top tabular-nums text-muted-foreground">
                {formatKstDateTimeToKo(order.createdAt)}
              </td>
              <td className="px-4 py-3 align-top font-medium tabular-nums">
                {formatOrderShortId(order._id)}
              </td>
              <td className="px-4 py-3 align-top max-w-[220px]">
                <p className="line-clamp-2">{summarizeOrderItems(order.items)}</p>
              </td>
              <td className="px-4 py-3 align-top">
                <Badge variant={orderStatusBadgeVariant(order.status)}>
                  {STORE_ORDER_STATUS_LABEL[order.status] || order.status}
                </Badge>
              </td>
              <td className="px-4 py-3 align-top">
                {order.fulfillmentStatus &&
                order.fulfillmentStatus !== "UNPAID" ? (
                  <span className="text-muted-foreground">
                    {fulfillmentLabel(order.fulfillmentStatus)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-right font-medium tabular-nums">
                {formatWonWithUnit(order.amountTotal)}
              </td>
              <td className="px-4 py-3 align-top text-right">
                <div className="flex items-center justify-end gap-1">
                  {canCancel ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={canceling}
                      onClick={() => onCancel(order)}
                    >
                      취소
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/dashboard/store/orders/${order._id}`}>
                      상세
                      <ChevronRight className="ml-0.5 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function RequestorStoreOrdersPage() {
  const { kind, loading } = useRequestorBusinessAccess();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [busy, setBusy] = useState(true);
  const [filter, setFilter] = useState<OrderFilterTab>("all");
  const [cancelTarget, setCancelTarget] = useState<StoreOrder | null>(null);
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: { orders: StoreOrder[] };
      }>({ path: "/api/store/orders" });
      setOrders(res.data?.data?.orders || []);
    } catch {
      toast.error("주문 목록을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelPaidReady =
    cancelTarget?.status === "PAID" &&
    cancelTarget?.fulfillmentStatus === "READY";

  async function cancelListOrder() {
    if (!cancelTarget?._id) return;
    setCanceling(true);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>({
        path: `/api/store/orders/${cancelTarget._id}/cancel`,
        method: "POST",
        skipCache: true,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "취소 실패");
      }
      invalidateApiGetCache("/api/store/orders");
      toast.success(
        cancelPaidReady
          ? "주문이 취소되었습니다. 선수금이 잔액으로 복원됩니다."
          : "주문이 취소되었습니다.",
      );
      setCancelTarget(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setCanceling(false);
    }
  }

  const filtered = useMemo(
    () => orders.filter((o) => orderMatchesFilter(o, filter)),
    [orders, filter],
  );

  const counts = useMemo(() => {
    return {
      all: orders.length,
      pending: orders.filter((o) => orderMatchesFilter(o, "pending")).length,
      paid: orders.filter((o) => orderMatchesFilter(o, "paid")).length,
      closed: orders.filter((o) => orderMatchesFilter(o, "closed")).length,
    };
  }, [orders]);

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className={STORE_SHELL_CLASS}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <StorePageBack to="/dashboard/store" label="스토어" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                주문 내역
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                결제·배송 상태를 확인하고 주문을 관리할 수 있습니다.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="font-normal shrink-0">
            {STORE_PRICE_TAX_NOTE}
          </Badge>
        </header>

        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as OrderFilterTab)}
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1 sm:w-auto">
            <TabsTrigger value="all" className="text-xs sm:text-sm">
              전체 ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-xs sm:text-sm">
              결제 대기 ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="paid" className="text-xs sm:text-sm">
              결제 완료 ({counts.paid})
            </TabsTrigger>
            <TabsTrigger value="closed" className="text-xs sm:text-sm">
              취소·만료 ({counts.closed})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {busy ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {orders.length === 0
                  ? "아직 주문이 없습니다."
                  : "해당 상태의 주문이 없습니다."}
              </p>
              <Button size="sm" asChild>
                <Link to="/dashboard/store">스토어 둘러보기</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <OrderListTable
              orders={filtered}
              onCancel={(order) => setCancelTarget(order)}
              canceling={canceling}
            />
            <div className="space-y-3 md:hidden">
              {filtered.map((order) => (
                <OrderListRow
                  key={order._id}
                  order={order}
                  onCancel={(order) => setCancelTarget(order)}
                  canceling={canceling}
                />
              ))}
            </div>
          </div>
        )}

        <AlertDialog
          open={Boolean(cancelTarget)}
          onOpenChange={(open) => {
            if (!open && !canceling) setCancelTarget(null);
          }}
        >
          <AlertDialogContent className="z-[200]">
            <AlertDialogHeader>
              <AlertDialogTitle>주문을 취소할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {cancelPaidReady
                  ? "출고 전 결제 완료 주문을 취소합니다. 선수금이 잔액으로 복원됩니다."
                  : "입금 대기 주문을 취소하면 재고 예약이 해제됩니다."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={canceling}>돌아가기</AlertDialogCancel>
              <Button
                type="button"
                disabled={canceling}
                onClick={() => void cancelListOrder()}
              >
                {canceling ? "취소 중…" : "주문 취소"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function RequestorStoreOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { kind, loading } = useRequestorBusinessAccess();
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [depositAccount, setDepositAccount] = useState<DepositAccount | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: { order: StoreOrder; depositAccount: DepositAccount };
      }>({ path: `/api/store/orders/${orderId}` });
      setOrder(res.data?.data?.order || null);
      setDepositAccount(res.data?.data?.depositAccount || null);
    } catch {
      toast.error("주문을 불러오지 못했습니다.");
      setOrder(null);
    } finally {
      setBusy(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
  }

  const canCancel = order ? isOrderCustomerCancelable(order) : false;
  /** 레거시 계좌이체 대기 주문만 선수금 전환 결제 허용 */
  const canPayWithCredit =
    order?.status === "PENDING" && order?.paymentMethod === "BANK";
  const cancelPaidReady =
    order?.status === "PAID" && order?.fulfillmentStatus === "READY";

  async function cancelOrder() {
    if (!orderId) return;
    setCanceling(true);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>({
        path: `/api/store/orders/${orderId}/cancel`,
        method: "POST",
        skipCache: true,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "취소 실패");
      }
      invalidateApiGetCache("/api/store/orders");
      toast.success(
        cancelPaidReady
          ? "주문이 취소되었습니다. 선수금이 잔액으로 복원됩니다."
          : "주문이 취소되었습니다.",
      );
      setCancelOpen(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setCanceling(false);
    }
  }

  async function payWithCredit() {
    if (!orderId) return;
    setPaying(true);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>({
        path: `/api/store/orders/${orderId}/pay-with-credit`,
        method: "POST",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "결제 실패");
      }
      toast.success("선수금으로 결제되었습니다.");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "결제 실패");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className={STORE_SHELL_CLASS}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <StorePageBack to="/dashboard/store/orders" label="주문 목록" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                주문 상세
              </h1>
              {order ? (
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {formatOrderShortId(order._id)} ·{" "}
                  {formatKstDateTimeToKo(order.createdAt)}
                </p>
              ) : null}
            </div>
          </div>
          {order ? <OrderStatusBadges order={order} /> : null}
        </header>

        {busy ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : !order ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              주문을 찾을 수 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">주문 진행</CardTitle>
                  <CardDescription>
                    입금·결제부터 배송 완료까지 진행 상황입니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <OrderProgressTimeline order={order} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">주문 상품</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border/70">
                    {(order.items || []).map((item, idx) => (
                      <li
                        key={`${item.name}-${idx}`}
                        className="flex items-center justify-between gap-4 px-6 py-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            수량 {item.qty}
                          </p>
                        </div>
                        <p className="shrink-0 font-medium tabular-nums">
                          {formatWonWithUnit(item.lineTotalInclusive)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {order.shipping?.address ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">배송지</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p className="font-medium">
                      {order.shipping.recipientName} · {order.shipping.phone}
                    </p>
                    <p className="text-muted-foreground">
                      {[
                        order.shipping.zipCode,
                        order.shipping.address,
                        order.shipping.addressDetail,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                    {order.shipping.memo ? (
                      <p className="text-xs text-muted-foreground">
                        배송 메모 {order.shipping.memo}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {order.trackingNumber ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">배송 추적</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrackingInfoBlock order={order} />
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="space-y-4 lg:sticky lg:top-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">결제 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">상품 합계</span>
                    <span className="tabular-nums">
                      {formatWonWithUnit(resolveStoreOrderItemsAmountTotal(order))}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">배송료</span>
                    <span className="tabular-nums">
                      {resolveStoreOrderShippingFee(order) > 0
                        ? formatWonWithUnit(resolveStoreOrderShippingFee(order))
                        : "무료"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">공급가</span>
                    <span className="tabular-nums">
                      {formatWonWithUnit(order.supplyAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">부가세</span>
                    <span className="tabular-nums">
                      {formatWonWithUnit(order.vatAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border/70 pt-3 text-base font-semibold">
                    <span>합계</span>
                    <span className="tabular-nums">
                      {formatWonWithUnit(order.amountTotal)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {STORE_PRICE_TAX_NOTE} · (세금)계산서는 사용분 기준 월말
                    합산 발행
                  </p>
                  {order.status === "PAID" ? (
                    <p className="text-xs text-muted-foreground">
                      결제 완료 {formatKstDateTimeToKo(order.paidAt)}
                    </p>
                  ) : null}
                  {order.status === "CANCELED" && order.canceledAt ? (
                    <p className="text-xs text-muted-foreground">
                      취소 {formatKstDateTimeToKo(order.canceledAt)}
                      {order.canceledByRole === "ADMIN"
                        ? " · 관리자"
                        : order.canceledByRole === "SYSTEM"
                          ? " · 시스템"
                          : ""}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              {canPayWithCredit ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">입금 대기 주문</CardTitle>
                    <CardDescription>
                      계좌이체 대기는 더 이상 신규 접수되지 않습니다. 선수금으로
                      결제하거나 취소할 수 있습니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {depositAccount ? (
                      <DepositInfoBlock
                        order={order}
                        depositAccount={depositAccount}
                        onCopy={copyText}
                      />
                    ) : null}
                    <Button
                      type="button"
                      className="w-full"
                      disabled={paying || canceling}
                      onClick={() => void payWithCredit()}
                    >
                      {paying ? "결제 중…" : "선수금으로 결제"}
                    </Button>
                    {canCancel ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={canceling || paying}
                        onClick={() => setCancelOpen(true)}
                      >
                        주문 취소
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ) : canCancel ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">주문 관리</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      asChild
                    >
                      <Link to="/dashboard/store/orders">주문 목록</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={canceling}
                      onClick={() => setCancelOpen(true)}
                    >
                      주문 취소
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        )}

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent className="z-[200]">
            <AlertDialogHeader>
              <AlertDialogTitle>주문을 취소할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {cancelPaidReady
                  ? "출고 전 결제 완료 주문을 취소합니다. 선수금이 잔액으로 복원됩니다."
                  : "입금 대기 주문을 취소하면 재고 예약이 해제됩니다."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={canceling}>
                돌아가기
              </AlertDialogCancel>
              <Button
                type="button"
                disabled={canceling}
                onClick={() => void cancelOrder()}
              >
                {canceling ? "취소 중…" : "주문 취소"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
