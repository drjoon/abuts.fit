// change-log:
// - 2026-09-13: 탭(주문·상품·패키지) · 가격 편집 · 거절 · 필터·스탯 UI.
// - 2026-08-23: 풀필먼트(출고·배송완료) UI.
// - 2026-08-23: 관리자 스토어 재고·주문 승인.
// related files:
// - web/backend/controllers/admin/adminStore.controller.js
// - web/frontend/src/pages/requestor/store/storeOrderUi.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Package,
  RefreshCw,
  Search,
  Truck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/shared/api/apiClient";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { STORE_PACKAGE_PREPAID_THRESHOLD } from "@/shared/store/storeCatalog";
import {
  STORE_FULFILLMENT_STATUS_LABEL,
  STORE_REVENUE_OWNER_ROLE,
} from "@/shared/tax/ledgerTaxLanes";
import { STORE_PRICE_TAX_NOTE } from "@/shared/tax/invoiceLabels";
import { cn } from "@/shared/ui/cn";
import {
  CreditFilterChip,
  CreditPanel,
  CreditSectionHeader,
  CreditStatTile,
} from "@/pages/admin/credits/creditPageUi";
import {
  STORE_ORDER_STATUS_LABEL,
  buildCourierTrackingUrl,
  formatOrderShortId,
  fulfillmentBadgeVariant,
  fulfillmentLabel,
  orderStatusBadgeVariant,
  summarizeOrderItems,
} from "@/pages/requestor/store/storeOrderUi";

type InventoryRow = {
  productId: string;
  name: string;
  listPriceInclusive: number | null;
  packagePriceInclusive?: number | null;
  defaultListPriceInclusive?: number | null;
  defaultPackagePriceInclusive?: number | null;
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
  paymentMethod?: string;
  items?: Array<{ name: string; qty: number; lineTotalInclusive?: number }>;
  shipping?: {
    recipientName?: string;
    phone?: string;
    address?: string;
    addressDetail?: string;
    zipCode?: string;
    memo?: string;
  };
  shippingMode?: string;
  courier?: string;
  trackingNumber?: string;
  createdAt?: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

type ProductDraft = {
  list: string;
  pkg: string;
  qty: string;
};

type OrderFilter = "all" | "pending" | "ready" | "shipped" | "closed";

function parseWonInput(raw: string): number | null {
  const n = Math.round(Number(String(raw).replace(/,/g, "").trim()));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function orderNeedsAction(order: StoreOrder) {
  if (order.status === "PENDING" || order.status === "MATCHED") return true;
  if (order.status === "PAID" && order.fulfillmentStatus === "READY") return true;
  if (order.status === "PAID" && order.fulfillmentStatus === "SHIPPED")
    return true;
  return false;
}

function orderMatchesFilter(order: StoreOrder, filter: OrderFilter) {
  if (filter === "all") return true;
  if (filter === "pending") {
    return order.status === "PENDING" || order.status === "MATCHED";
  }
  if (filter === "ready") {
    return order.status === "PAID" && order.fulfillmentStatus === "READY";
  }
  if (filter === "shipped") {
    return order.status === "PAID" && order.fulfillmentStatus === "SHIPPED";
  }
  return (
    order.status === "CANCELED" ||
    order.status === "EXPIRED" ||
    order.fulfillmentStatus === "DELIVERED"
  );
}

export default function AdminStorePage() {
  const [tab, setTab] = useState("orders");
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [productDrafts, setProductDrafts] = useState<
    Record<string, ProductDraft>
  >({});
  const [shipDrafts, setShipDrafts] = useState<
    Record<string, { courier: string; trackingNumber: string }>
  >({});
  const [busy, setBusy] = useState(true);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [pkgBuyerId, setPkgBuyerId] = useState("");
  const [pkgBuyer, setPkgBuyer] = useState<{
    businessAnchorId: string;
    name: string;
    storePackageBuyer: boolean;
  } | null>(null);
  const [pkgBuyerBusy, setPkgBuyerBusy] = useState(false);

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
      const inv = invRes.data?.data || [];
      const ord = ordRes.data?.data || [];
      setInventory(inv);
      setOrders(ord);
      setProductDrafts((prev) => {
        const next: Record<string, ProductDraft> = {};
        for (const row of inv) {
          next[row.productId] = prev[row.productId] ?? {
            list:
              row.listPriceInclusive != null
                ? String(row.listPriceInclusive)
                : "",
            pkg:
              row.packagePriceInclusive != null
                ? String(row.packagePriceInclusive)
                : "",
            qty: String(row.qtyOnHand),
          };
        }
        return next;
      });
    } catch {
      toast.error("스토어 데이터를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const pending = orders.filter(
      (o) => o.status === "PENDING" || o.status === "MATCHED",
    ).length;
    const ready = orders.filter(
      (o) => o.status === "PAID" && o.fulfillmentStatus === "READY",
    ).length;
    const shipped = orders.filter(
      (o) => o.status === "PAID" && o.fulfillmentStatus === "SHIPPED",
    ).length;
    const lowStock = inventory.filter((r) => r.qtyAvailable <= 5).length;
    return { pending, ready, shipped, lowStock };
  }, [orders, inventory]);

  const filteredOrders = useMemo(
    () => orders.filter((o) => orderMatchesFilter(o, orderFilter)),
    [orders, orderFilter],
  );

  function patchProductDraft(
    productId: string,
    key: keyof ProductDraft,
    value: string,
  ) {
    setProductDrafts((prev) => ({
      ...prev,
      [productId]: {
        list: prev[productId]?.list ?? "",
        pkg: prev[productId]?.pkg ?? "",
        qty: prev[productId]?.qty ?? "",
        [key]: value,
      },
    }));
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

  async function saveProduct(row: InventoryRow) {
    const draft = productDrafts[row.productId] || {
      list: "",
      pkg: "",
      qty: String(row.qtyOnHand),
    };
    const list = parseWonInput(draft.list);
    const pkg =
      draft.pkg.trim() === "" ? null : parseWonInput(draft.pkg);
    const qtyOnHand = Math.round(Number(draft.qty));

    if (list == null) {
      toast.error("판매가가 올바르지 않습니다.");
      return;
    }
    if (draft.pkg.trim() !== "" && pkg == null) {
      toast.error("pkg가가 올바르지 않습니다.");
      return;
    }
    if (!Number.isFinite(qtyOnHand) || qtyOnHand < 0) {
      toast.error("재고 수량이 올바르지 않습니다.");
      return;
    }

    setSavingProductId(row.productId);
    try {
      const [priceRes, qtyRes] = await Promise.all([
        apiFetch<{
          success: boolean;
          message?: string;
          data?: {
            listPriceInclusive: number | null;
            packagePriceInclusive: number | null;
            defaultListPriceInclusive?: number | null;
            defaultPackagePriceInclusive?: number | null;
          };
        }>({
          path: `/api/admin/store/products/${row.productId}/prices`,
          method: "PATCH",
          jsonBody: {
            listPriceInclusive: list,
            ...(pkg == null
              ? { clearPackage: true }
              : { packagePriceInclusive: pkg }),
          },
        }),
        apiFetch<{ success: boolean; message?: string }>({
          path: `/api/admin/store/inventory/${row.productId}`,
          method: "PATCH",
          jsonBody: { qtyOnHand },
        }),
      ]);

      if (!priceRes.ok || !priceRes.data?.success) {
        toast.error(priceRes.data?.message || "가격 저장 실패");
        return;
      }
      if (!qtyRes.ok || !qtyRes.data?.success) {
        toast.error(qtyRes.data?.message || "재고 저장 실패");
        return;
      }

      const priceData = priceRes.data.data;
      setInventory((prev) =>
        prev.map((r) =>
          r.productId === row.productId
            ? {
                ...r,
                listPriceInclusive:
                  priceData?.listPriceInclusive ?? list,
                packagePriceInclusive:
                  priceData?.packagePriceInclusive ?? pkg,
                defaultListPriceInclusive:
                  priceData?.defaultListPriceInclusive ??
                  r.defaultListPriceInclusive,
                defaultPackagePriceInclusive:
                  priceData?.defaultPackagePriceInclusive ??
                  r.defaultPackagePriceInclusive,
                qtyOnHand,
                qtyAvailable: Math.max(0, qtyOnHand - r.qtyReserved),
              }
            : r,
        ),
      );
      setProductDrafts((prev) => ({
        ...prev,
        [row.productId]: {
          list: String(priceData?.listPriceInclusive ?? list),
          pkg:
            priceData?.packagePriceInclusive != null
              ? String(priceData.packagePriceInclusive)
              : "",
          qty: String(qtyOnHand),
        },
      }));
      toast.success("상품을 저장했습니다.");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSavingProductId(null);
    }
  }

  async function resetProductPrices(row: InventoryRow) {
    setSavingProductId(row.productId);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: {
          listPriceInclusive: number | null;
          packagePriceInclusive: number | null;
        };
      }>({
        path: `/api/admin/store/products/${row.productId}/prices`,
        method: "PATCH",
        jsonBody: { clearList: true, clearPackage: true },
      });
      if (!res.ok || !res.data?.success) {
        toast.error(res.data?.message || "기본가 복원 실패");
        return;
      }
      const list = res.data.data?.listPriceInclusive;
      const pkg = res.data.data?.packagePriceInclusive;
      setInventory((prev) =>
        prev.map((r) =>
          r.productId === row.productId
            ? {
                ...r,
                listPriceInclusive: list ?? null,
                packagePriceInclusive: pkg ?? null,
              }
            : r,
        ),
      );
      setProductDrafts((prev) => ({
        ...prev,
        [row.productId]: {
          list: list != null ? String(list) : "",
          pkg: pkg != null ? String(pkg) : "",
          qty: prev[row.productId]?.qty ?? String(row.qtyOnHand),
        },
      }));
      toast.success("카탈로그 기본가로 복원했습니다.");
    } catch {
      toast.error("기본가 복원 실패");
    } finally {
      setSavingProductId(null);
    }
  }

  async function approve(orderId: string) {
    setOrderBusyId(orderId);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: StoreOrder;
      }>({
        path: `/api/admin/store/orders/${orderId}/approve`,
        method: "POST",
        jsonBody: { note: "admin approve" },
      });
      if (!res.ok || !res.data?.success) {
        toast.error(res.data?.message || "승인 실패");
        return;
      }
      if (res.data.data) {
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? { ...o, ...res.data!.data } : o)),
        );
      }
      toast.success(res.data.message || "입금 확정");
    } catch {
      toast.error("승인 실패");
    } finally {
      setOrderBusyId(null);
    }
  }

  async function reject(orderId: string) {
    setOrderBusyId(orderId);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: StoreOrder;
      }>({
        path: `/api/admin/store/orders/${orderId}/reject`,
        method: "POST",
        jsonBody: { note: "admin reject" },
      });
      if (!res.ok || !res.data?.success) {
        toast.error(res.data?.message || "거절 실패");
        return;
      }
      if (res.data.data) {
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? { ...o, ...res.data!.data } : o)),
        );
      } else {
        setOrders((prev) =>
          prev.map((o) =>
            o._id === orderId
              ? { ...o, status: "CANCELED", fulfillmentStatus: "CANCELED" }
              : o,
          ),
        );
      }
      toast.success("주문을 거절했습니다.");
    } catch {
      toast.error("거절 실패");
    } finally {
      setOrderBusyId(null);
    }
  }

  async function ship(orderId: string) {
    const draft = shipDrafts[orderId] || { courier: "", trackingNumber: "" };
    if (!draft.trackingNumber.trim()) {
      toast.error("운송장 번호를 입력해 주세요.");
      return;
    }
    setOrderBusyId(orderId);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: StoreOrder;
      }>({
        path: `/api/admin/store/orders/${orderId}/ship`,
        method: "POST",
        jsonBody: {
          courier: draft.courier.trim() || "택배",
          trackingNumber: draft.trackingNumber.trim(),
        },
      });
      if (!res.ok || !res.data?.success) {
        toast.error(res.data?.message || "출고 실패");
        return;
      }
      if (res.data.data) {
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? { ...o, ...res.data!.data } : o)),
        );
      }
      toast.success(res.data.message || "출고 완료");
    } catch {
      toast.error("출고 실패");
    } finally {
      setOrderBusyId(null);
    }
  }

  async function deliver(orderId: string) {
    setOrderBusyId(orderId);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: StoreOrder;
      }>({
        path: `/api/admin/store/orders/${orderId}/deliver`,
        method: "POST",
        jsonBody: {},
      });
      if (!res.ok || !res.data?.success) {
        toast.error(res.data?.message || "배송완료 실패");
        return;
      }
      if (res.data.data) {
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? { ...o, ...res.data!.data } : o)),
        );
      }
      toast.success(res.data.message || "배송 완료");
    } catch {
      toast.error("배송완료 실패");
    } finally {
      setOrderBusyId(null);
    }
  }

  async function loadPackageBuyer() {
    const id = pkgBuyerId.trim();
    if (!id) {
      toast.error("사업자 BA ID를 입력해 주세요.");
      return;
    }
    setPkgBuyerBusy(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: {
          businessAnchorId: string;
          name: string;
          storePackageBuyer: boolean;
        };
        message?: string;
      }>({ path: `/api/admin/store/package-buyer/${encodeURIComponent(id)}` });
      if (!res.ok || !res.data?.success || !res.data.data) {
        toast.error(res.data?.message || "조회 실패");
        setPkgBuyer(null);
        return;
      }
      setPkgBuyer(res.data.data);
    } catch {
      toast.error("패키지 구매자 조회 실패");
      setPkgBuyer(null);
    } finally {
      setPkgBuyerBusy(false);
    }
  }

  async function togglePackageBuyer(enabled: boolean) {
    if (!pkgBuyer) return;
    setPkgBuyerBusy(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: {
          businessAnchorId: string;
          name: string;
          storePackageBuyer: boolean;
        };
        message?: string;
      }>({
        path: `/api/admin/store/package-buyer/${encodeURIComponent(pkgBuyer.businessAnchorId)}`,
        method: "PATCH",
        jsonBody: { enabled },
      });
      if (!res.ok || !res.data?.success || !res.data.data) {
        toast.error(res.data?.message || "저장 실패");
        return;
      }
      setPkgBuyer(res.data.data);
      toast.success(enabled ? "패키지 단가 ON" : "패키지 단가 OFF");
    } catch {
      toast.error("저장 실패");
    } finally {
      setPkgBuyerBusy(false);
    }
  }

  return (
    <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-6xl space-y-5 p-1 pb-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">스토어</h1>
              <Badge variant="outline" className="font-normal">
                {STORE_PRICE_TAX_NOTE}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                매출 귀속 {STORE_REVENUE_OWNER_ROLE}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              주문 풀필먼트 · 판매가/pkg가 · 재고 · 패키지 구매자
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-spin")}
            />
            새로고침
          </Button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CreditStatTile
            label="입금 대기"
            value={stats.pending}
            tone={stats.pending > 0 ? "accent" : "default"}
            hint="PENDING · MATCHED"
          />
          <CreditStatTile
            label="출고 대기"
            value={stats.ready}
            tone={stats.ready > 0 ? "accent" : "default"}
            hint="결제 완료 · READY"
          />
          <CreditStatTile
            label="배송 중"
            value={stats.shipped}
            hint="SHIPPED"
          />
          <CreditStatTile
            label="저재고"
            value={stats.lowStock}
            tone={stats.lowStock > 0 ? "accent" : "default"}
            hint="가용 ≤ 5"
          />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto min-w-0 flex-wrap rounded-xl bg-slate-100/80 p-1">
            <TabsTrigger value="orders" className="rounded-lg px-4 text-sm">
              주문
              {stats.pending + stats.ready > 0 ? (
                <span className="ml-1.5 rounded-md bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {stats.pending + stats.ready}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="products" className="rounded-lg px-4 text-sm">
              상품 · 재고
            </TabsTrigger>
            <TabsTrigger value="package" className="rounded-lg px-4 text-sm">
              패키지 구매자
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-0 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "전체"],
                  ["pending", "입금 대기"],
                  ["ready", "출고 대기"],
                  ["shipped", "배송 중"],
                  ["closed", "종료"],
                ] as const
              ).map(([key, label]) => (
                <CreditFilterChip
                  key={key}
                  active={orderFilter === key}
                  onClick={() => setOrderFilter(key)}
                >
                  {label}
                </CreditFilterChip>
              ))}
            </div>

            {busy && orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : filteredOrders.length === 0 ? (
              <CreditPanel className="p-8 text-center text-sm text-muted-foreground">
                {orderFilter === "all"
                  ? "주문이 없습니다."
                  : "이 필터에 해당하는 주문이 없습니다."}
              </CreditPanel>
            ) : (
              <ul className="space-y-3">
                {filteredOrders.map((order) => {
                  const statusLabel =
                    STORE_ORDER_STATUS_LABEL[order.status] || order.status;
                  const fulfillLabel =
                    fulfillmentLabel(order.fulfillmentStatus) ||
                    STORE_FULFILLMENT_STATUS_LABEL[
                      order.fulfillmentStatus as keyof typeof STORE_FULFILLMENT_STATUS_LABEL
                    ] ||
                    "—";
                  const shipDraft = shipDrafts[order._id] || {
                    courier: order.courier || "",
                    trackingNumber: order.trackingNumber || "",
                  };
                  const trackUrl = buildCourierTrackingUrl(
                    order.courier,
                    order.trackingNumber,
                  );
                  const rowBusy = orderBusyId === order._id;
                  const highlight = orderNeedsAction(order);

                  return (
                    <li key={order._id}>
                      <CreditPanel
                        className={cn(
                          "p-4 transition-shadow",
                          highlight && "ring-1 ring-primary/25",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {formatOrderShortId(order._id)}
                              </span>
                              <Badge
                                variant={orderStatusBadgeVariant(order.status)}
                              >
                                {statusLabel}
                              </Badge>
                              <Badge
                                variant={fulfillmentBadgeVariant(
                                  order.fulfillmentStatus,
                                )}
                              >
                                {fulfillLabel}
                              </Badge>
                              <span className="text-sm font-semibold tabular-nums">
                                {formatWonWithUnit(order.amountTotal)}
                              </span>
                            </div>
                            <p className="text-sm text-foreground">
                              {summarizeOrderItems(order.items, 3)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {order.createdAt
                                ? formatKstDateTimeToKo(order.createdAt)
                                : "—"}
                              {" · "}입금코드 {order.depositCode}
                              {" · "}공급{" "}
                              {formatWonWithUnit(order.supplyAmount)} · 세액{" "}
                              {formatWonWithUnit(order.vatAmount)}
                            </p>
                            {order.shipping?.address ? (
                              <p className="text-xs text-muted-foreground">
                                {order.shipping.recipientName}
                                {order.shipping.phone
                                  ? ` · ${order.shipping.phone}`
                                  : ""}
                                {" · "}
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
                                {trackUrl ? (
                                  <a
                                    href={trackUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-2"
                                  >
                                    {order.trackingNumber}
                                  </a>
                                ) : (
                                  order.trackingNumber
                                )}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {order.status === "PENDING" ||
                            order.status === "MATCHED" ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={rowBusy}
                                  onClick={() => void approve(order._id)}
                                >
                                  입금 확정
                                </Button>
                                {order.status === "PENDING" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={rowBusy}
                                    onClick={() => void reject(order._id)}
                                  >
                                    거절
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                            {order.status === "PAID" &&
                            order.fulfillmentStatus === "SHIPPED" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={rowBusy}
                                onClick={() => void deliver(order._id)}
                              >
                                배송 완료
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {order.status === "PAID" &&
                        order.fulfillmentStatus === "READY" ? (
                          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
                            <div className="space-y-1">
                              <label className="text-[11px] text-muted-foreground">
                                택배사
                              </label>
                              <Input
                                className="h-8 w-28"
                                placeholder="CJ대한통운"
                                value={shipDraft.courier}
                                onChange={(e) =>
                                  patchShip(
                                    order._id,
                                    "courier",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] text-muted-foreground">
                                운송장 번호
                              </label>
                              <Input
                                className="h-8 w-44"
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
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={rowBusy}
                              onClick={() => void ship(order._id)}
                            >
                              <Truck className="mr-1.5 h-3.5 w-3.5" />
                              출고
                            </Button>
                          </div>
                        ) : null}
                      </CreditPanel>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="products" className="mt-0 space-y-4">
            <CreditSectionHeader
              icon={Boxes}
              title="상품 · 가격 · 재고"
              description="판매가·pkg가(부가세 포함)와 보유 재고를 함께 저장합니다. 기본가 복원은 카탈로그 상수로 되돌립니다."
            />
            {busy && inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : (
              <CreditPanel>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-border/70 bg-muted/30 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">상품</th>
                        <th className="px-3 py-2.5 font-medium">판매가</th>
                        <th className="px-3 py-2.5 font-medium">pkg가</th>
                        <th className="px-3 py-2.5 font-medium">가용</th>
                        <th className="px-3 py-2.5 font-medium">예약</th>
                        <th className="px-3 py-2.5 font-medium">보유</th>
                        <th className="px-3 py-2.5 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((row) => {
                        const draft = productDrafts[row.productId] || {
                          list:
                            row.listPriceInclusive != null
                              ? String(row.listPriceInclusive)
                              : "",
                          pkg:
                            row.packagePriceInclusive != null
                              ? String(row.packagePriceInclusive)
                              : "",
                          qty: String(row.qtyOnHand),
                        };
                        const low = row.qtyAvailable <= 5;
                        const rowSaving = savingProductId === row.productId;
                        return (
                          <tr
                            key={row.productId}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="px-3 py-2.5 align-top">
                              <div className="font-medium">{row.name}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {row.productId}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                className="h-8 w-[7.5rem] tabular-nums"
                                value={draft.list}
                                onChange={(e) =>
                                  patchProductDraft(
                                    row.productId,
                                    "list",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                className="h-8 w-[7.5rem] tabular-nums"
                                value={draft.pkg}
                                placeholder="없음"
                                onChange={(e) =>
                                  patchProductDraft(
                                    row.productId,
                                    "pkg",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2.5 align-middle tabular-nums",
                                low && "font-semibold text-amber-700",
                              )}
                            >
                              {row.qtyAvailable}
                            </td>
                            <td className="px-3 py-2.5 align-middle tabular-nums text-muted-foreground">
                              {row.qtyReserved}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Input
                                className="h-8 w-20 tabular-nums"
                                value={draft.qty}
                                onChange={(e) =>
                                  patchProductDraft(
                                    row.productId,
                                    "qty",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={rowSaving}
                                  onClick={() => void saveProduct(row)}
                                >
                                  저장
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={rowSaving}
                                  onClick={() => void resetProductPrices(row)}
                                >
                                  기본가
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CreditPanel>
            )}
          </TabsContent>

          <TabsContent value="package" className="mt-0 space-y-4">
            <CreditSectionHeader
              icon={Wallet}
              title="패키지 구매자"
              description={`BusinessAnchor.storePackageBuyer. 단건 충전 ${formatWonWithUnit(STORE_PACKAGE_PREPAID_THRESHOLD)} 이상이면 자동 ON. 여기서 수동 토글할 수 있습니다.`}
            />
            <CreditPanel className="space-y-4 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    사업자 BA ID
                  </label>
                  <Input
                    className="h-9 w-80 font-mono text-xs"
                    value={pkgBuyerId}
                    onChange={(e) => setPkgBuyerId(e.target.value)}
                    placeholder="ObjectId"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void loadPackageBuyer();
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pkgBuyerBusy}
                  onClick={() => void loadPackageBuyer()}
                >
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  조회
                </Button>
              </div>

              {pkgBuyer ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {pkgBuyer.name || "(이름 없음)"}
                      </span>
                      <Badge
                        variant={
                          pkgBuyer.storePackageBuyer ? "default" : "outline"
                        }
                      >
                        {pkgBuyer.storePackageBuyer
                          ? "패키지 단가 ON"
                          : "OFF"}
                      </Badge>
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {pkgBuyer.businessAnchorId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">적용</span>
                    <Switch
                      checked={pkgBuyer.storePackageBuyer}
                      disabled={pkgBuyerBusy}
                      onCheckedChange={(checked) =>
                        void togglePackageBuyer(checked)
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  BA ID를 조회하면 패키지 단가 적용 여부를 확인하고 바꿀 수
                  있습니다.
                </p>
              )}
            </CreditPanel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
