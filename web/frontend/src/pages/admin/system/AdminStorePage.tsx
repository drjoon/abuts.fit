// change-log:
// - 2026-08-23: 관리자 스토어 재고·주문 승인.
// related files:
// - web/backend/controllers/admin/adminStore.controller.js
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/shared/api/apiClient";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { LEDGER_TAX_LANE_NOTICE } from "@/shared/tax/ledgerTaxLanes";
import { STORE_PRICE_TAX_NOTE } from "@/shared/tax/invoiceLabels";

type InventoryRow = {
  productId: string;
  name: string;
  listPriceInclusive: number | null;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
};

type StoreOrder = {
  _id: string;
  status: string;
  depositCode: string;
  amountTotal: number;
  supplyAmount: number;
  vatAmount: number;
  items?: Array<{ name: string; qty: number }>;
  createdAt?: string;
};

export default function AdminStorePage() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [invRes, ordRes] = await Promise.all([
        apiFetch<{ success: boolean; data?: InventoryRow[] }>({
          path: "/api/admin/store/inventory",
        }),
        apiFetch<{ success: boolean; data?: StoreOrder[] }>({
          path: "/api/admin/store/orders",
        }),
      ]);
      setInventory(invRes.data?.data || []);
      setOrders(ordRes.data?.data || []);
    } catch {
      toast.error("스토어 데이터를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveQty(productId: string) {
    const qtyOnHand = Math.round(Number(edits[productId]));
    if (!Number.isFinite(qtyOnHand) || qtyOnHand < 0) {
      toast.error("재고 수량이 올바르지 않습니다.");
      return;
    }
    const res = await apiFetch<{ success: boolean; message?: string }>({
      path: `/api/admin/store/inventory/${productId}`,
      method: "PATCH",
      jsonBody: { qtyOnHand },
    });
    if (!res.ok || !res.data?.success) {
      toast.error(res.data?.message || "저장 실패");
      return;
    }
    toast.success("재고를 저장했습니다.");
    await load();
  }

  async function approve(orderId: string) {
    const res = await apiFetch<{ success: boolean; message?: string }>({
      path: `/api/admin/store/orders/${orderId}/approve`,
      method: "POST",
      jsonBody: { note: "admin approve" },
    });
    if (!res.ok || !res.data?.success) {
      toast.error(res.data?.message || "승인 실패");
      return;
    }
    toast.success(res.data.message || "승인 완료");
    await load();
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-5xl space-y-8 p-1">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">스토어 관리</h1>
          <p className="text-sm text-muted-foreground">{LEDGER_TAX_LANE_NOTICE}</p>
          <Badge variant="outline">{STORE_PRICE_TAX_NOTE}</Badge>
        </header>

        {busy ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-semibold">재고</h2>
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="border-b border-border/70 bg-muted/30 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">상품</th>
                      <th className="px-3 py-2 font-medium">포함가</th>
                      <th className="px-3 py-2 font-medium">가용</th>
                      <th className="px-3 py-2 font-medium">예약</th>
                      <th className="px-3 py-2 font-medium">보유</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((row) => (
                      <tr
                        key={row.productId}
                        className="border-b border-border/50"
                      >
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.listPriceInclusive != null
                            ? formatWonWithUnit(row.listPriceInclusive)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.qtyAvailable}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.qtyReserved}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            className="h-8 w-24"
                            value={
                              edits[row.productId] ?? String(row.qtyOnHand)
                            }
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [row.productId]: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void saveQty(row.productId)}
                          >
                            저장
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold">주문</h2>
              <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
                {orders.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">
                    주문이 없습니다.
                  </li>
                ) : (
                  orders.map((order) => (
                    <li
                      key={order._id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="space-y-1 text-sm">
                        <p className="font-medium">
                          {order.status} · {formatWonWithUnit(order.amountTotal)}{" "}
                          (공급 {formatWonWithUnit(order.supplyAmount)} · 세액{" "}
                          {formatWonWithUnit(order.vatAmount)})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          입금코드 {order.depositCode} ·{" "}
                          {(order.items || [])
                            .map((i) => `${i.name}×${i.qty}`)
                            .join(", ")}
                        </p>
                      </div>
                      {order.status === "PENDING" ||
                      order.status === "MATCHED" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void approve(order._id)}
                        >
                          입금 확정
                        </Button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
