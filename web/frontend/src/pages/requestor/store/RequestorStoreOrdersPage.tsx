// change-log:
// - 2026-08-23: 스토어 주문 입금 대기·목록.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { STORE_PRICE_TAX_NOTE } from "@/shared/tax/invoiceLabels";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { apiFetch } from "@/shared/api/apiClient";

type DepositAccount = {
  bankName: string;
  accountNumber: string;
  holderName: string;
};

type StoreOrder = {
  _id: string;
  status: string;
  depositCode: string;
  supplyAmount: number;
  vatAmount: number;
  amountTotal: number;
  expiresAt?: string;
  items?: Array<{ name: string; qty: number; lineTotalInclusive: number }>;
  paidAt?: string | null;
  createdAt?: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "입금 대기",
  MATCHED: "입금 매칭",
  PAID: "결제 완료",
  CANCELED: "취소",
  EXPIRED: "만료",
};

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} 복사됨`),
    () => toast.error("복사 실패"),
  );
}

export default function RequestorStoreOrdersPage() {
  const { kind, loading } = useRequestorBusinessAccess();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [busy, setBusy] = useState(true);

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

  if (!loading && kind === "lab") {
    return <Navigate to="/dashboard/credits" replace />;
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
          <h1 className="text-xl font-semibold tracking-tight">스토어 주문</h1>
        </div>
        {busy ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">주문이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
            {orders.map((order) => (
              <li key={order._id}>
                <Link
                  to={`/dashboard/store/orders/${order._id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/30"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {STATUS_LABEL[order.status] || order.status} ·{" "}
                      {formatWonWithUnit(order.amountTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      입금코드 {order.depositCode} ·{" "}
                      {(order.items || [])
                        .map((i) => `${i.name}×${i.qty}`)
                        .join(", ")}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-normal">
                    {STORE_PRICE_TAX_NOTE}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
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

  async function cancelOrder() {
    if (!orderId) return;
    setCanceling(true);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>({
        path: `/api/store/orders/${orderId}/cancel`,
        method: "POST",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "취소 실패");
      }
      toast.success("주문이 취소되었습니다.");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/dashboard/store/orders">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              주문 목록
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">주문 상세</h1>
        </div>

        {busy ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : !order ? (
          <p className="text-sm text-muted-foreground">주문을 찾을 수 없습니다.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{STATUS_LABEL[order.status] || order.status}</Badge>
              <Badge variant="outline">{STORE_PRICE_TAX_NOTE}</Badge>
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">공급가</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(order.supplyAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">부가세</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(order.vatAmount)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>합계 (부가세 포함)</span>
                <span className="tabular-nums">
                  {formatWonWithUnit(order.amountTotal)}
                </span>
              </div>
            </div>

            {order.status === "PENDING" && depositAccount ? (
              <div className="space-y-3 rounded-xl border border-border/70 p-4">
                <h2 className="text-sm font-semibold">입금 정보</h2>
                <p className="text-sm">
                  {depositAccount.bankName} {depositAccount.accountNumber}
                  <br />
                  <span className="text-muted-foreground">
                    예금주 {depositAccount.holderName}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">입금자명 코드</span>
                  <code className="rounded bg-muted px-2 py-1 text-base font-semibold tabular-nums">
                    {order.depositCode}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(order.depositCode, "입금코드")}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    복사
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  입금자명에 위 코드를 넣으면 자동 매칭됩니다. 입금 확인 후
                  세금계산서가 발행됩니다.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={canceling}
                  onClick={() => void cancelOrder()}
                >
                  {canceling ? "취소 중…" : "주문 취소"}
                </Button>
              </div>
            ) : null}

            {order.status === "PAID" ? (
              <p className="text-sm text-muted-foreground">
                결제가 완료되었습니다. 세금계산서는 관리자 (세금)계산서 목록에서
                확인할 수 있습니다.
              </p>
            ) : null}

            <ul className="divide-y divide-border/70 rounded-xl border border-border/70 text-sm">
              {(order.items || []).map((item, idx) => (
                <li
                  key={`${item.name}-${idx}`}
                  className="flex justify-between gap-3 px-4 py-3"
                >
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span className="tabular-nums">
                    {formatWonWithUnit(item.lineTotalInclusive)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
