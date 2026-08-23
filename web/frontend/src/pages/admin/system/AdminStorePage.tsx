// change-log:
// - 2026-08-23: 풀필먼트(출고·배송완료) UI.
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
import {
  LEDGER_TAX_LANE_NOTICE,
  STORE_FULFILLMENT_STATUS_LABEL,
  STORE_REVENUE_OWNER_ROLE,
} from "@/shared/tax/ledgerTaxLanes";
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
  fulfillmentStatus?: string;
  depositCode: string;
  amountTotal: number;
  supplyAmount: number;
  vatAmount: number;
  items?: Array<{ name: string; qty: number }>;
  shipping?: {
    recipientName?: string;
    phone?: string;
    address?: string;
    addressDetail?: string;
    zipCode?: string;
  };
  courier?: string;
  trackingNumber?: string;
  createdAt?: string;
};

export default function AdminStorePage() {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [shipDrafts, setShipDrafts] = useState<
    Record<string, { courier: string; trackingNumber: string }>
  >({});
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

  async function ship(orderId: string) {
    const draft = shipDrafts[orderId] || { courier: "", trackingNumber: "" };
    if (!draft.trackingNumber.trim()) {
      toast.error("운송장 번호를 입력해 주세요.");
      return;
    }
    const res = await apiFetch<{ success: boolean; message?: string }>({
      path: `/api/admin/store/orders/${orderId}/ship`,
      method: "POST",
      jsonBody: {
        courier: draft.courier.trim(),
        trackingNumber: draft.trackingNumber.trim(),
      },
    });
    if (!res.ok || !res.data?.success) {
      toast.error(res.data?.message || "출고 실패");
      return;
    }
    toast.success(res.data.message || "출고 완료");
    await load();
  }

  async function deliver(orderId: string) {
    const res = await apiFetch<{ success: boolean; message?: string }>({
      path: `/api/admin/store/orders/${orderId}/deliver`,
      method: "POST",
      jsonBody: {},
    });
    if (!res.ok || !res.data?.success) {
      toast.error(res.data?.message || "배송완료 실패");
      return;
    }
    toast.success(res.data.message || "배송 완료");
    await load();
  }

  function patchShip(
    orderId: string,
    key: "courier" | "trackingNumber",
    value: string,
  ) {
    setShipDrafts((prev) => ({
      ...prev,
      [orderId]: {
        courier: prev[orderId]?.courier || "",
        trackingNumber: prev[orderId]?.trackingNumber || "",
        [key]: value,
      },
    }));
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-5xl space-y-8 p-1">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">스토어 관리</h1>
          <p className="text-sm text-muted-foreground">{LEDGER_TAX_LANE_NOTICE}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{STORE_PRICE_TAX_NOTE}</Badge>
            <Badge variant="secondary">
              매출 귀속: {STORE_REVENUE_OWNER_ROLE} (딜러/제조 분배 없음)
            </Badge>
          </div>
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
              <h2 className="text-base font-semibold">주문 · 출고</h2>
              <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
                {orders.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">
                    주문이 없습니다.
                  </li>
                ) : (
                  orders.map((order) => {
                    const fulfillLabel =
                      STORE_FULFILLMENT_STATUS_LABEL[
                        order.fulfillmentStatus as keyof typeof STORE_FULFILLMENT_STATUS_LABEL
                      ] ||
                      order.fulfillmentStatus ||
                      "—";
                    const shipDraft = shipDrafts[order._id] || {
                      courier: order.courier || "",
                      trackingNumber: order.trackingNumber || "",
                    };
                    return (
                      <li key={order._id} className="space-y-3 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">
                              {order.status} · {fulfillLabel} ·{" "}
                              {formatWonWithUnit(order.amountTotal)} (공급{" "}
                              {formatWonWithUnit(order.supplyAmount)} · 세액{" "}
                              {formatWonWithUnit(order.vatAmount)})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              입금코드 {order.depositCode} ·{" "}
                              {(order.items || [])
                                .map((i) => `${i.name}×${i.qty}`)
                                .join(", ")}
                            </p>
                            {order.shipping?.address ? (
                              <p className="text-xs text-muted-foreground">
                                배송지 {order.shipping.recipientName} ·{" "}
                                {order.shipping.phone} ·{" "}
                                {[
                                  order.shipping.zipCode,
                                  order.shipping.address,
                                  order.shipping.addressDetail,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              </p>
                            ) : null}
                            {order.trackingNumber ? (
                              <p className="text-xs text-muted-foreground">
                                운송장 {order.courier || "택배"}{" "}
                                {order.trackingNumber}
                              </p>
                            ) : null}
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
                        </div>

                        {order.status === "PAID" &&
                        order.fulfillmentStatus === "READY" ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <Input
                              className="h-8 w-28"
                              placeholder="택배사"
                              value={shipDraft.courier}
                              onChange={(e) =>
                                patchShip(order._id, "courier", e.target.value)
                              }
                            />
                            <Input
                              className="h-8 w-40"
                              placeholder="운송장 번호"
                              value={shipDraft.trackingNumber}
                              onChange={(e) =>
                                patchShip(
                                  order._id,
                                  "trackingNumber",
                                  e.target.value,
                                )
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void ship(order._id)}
                            >
                              출고
                            </Button>
                          </div>
                        ) : null}

                        {order.status === "PAID" &&
                        order.fulfillmentStatus === "SHIPPED" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void deliver(order._id)}
                          >
                            배송 완료
                          </Button>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
