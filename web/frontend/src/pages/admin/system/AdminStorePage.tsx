// change-log:
// - 2026-09-13: 주문 목록 기준 사이드바 스토어 액션 배지 로컬 동기화.
// - 2026-09-13: 상품 드래그·클러스터 CRUD · 서버 레이아웃 저장.
// - 2026-09-13: 상품 테이블을 키트 클러스터(구성 단품 하위)로 표시.
// - 2026-09-13: 관리자 가격 입력·표시를 만원(소수 2자리·100원) 단위로.
// - 2026-09-13: 상품 새로고침 시 가격·재고 draft를 서버 값으로 동기.
// - 2026-09-13: 탭(주문·상품·패키지) · 가격 편집 · 거절 · 필터·스탯 UI.
// - 2026-08-23: 풀필먼트(출고·배송완료) UI.
// - 2026-08-23: 관리자 스토어 재고·주문 승인.
// related files:
// - web/backend/controllers/admin/adminStore.controller.js
// - web/backend/constants/storeProductClusters.js
// - web/frontend/src/pages/requestor/store/storeOrderUi.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import {
  Boxes,
  GripVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
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

/** 1만원 = 10,000원. 소수 2자리 = 100원 단위. */
const WON_PER_MANWON = 10_000;

/** 원 → 입력 draft (`88.00`). */
function wonToManwonDraft(won: number | null | undefined): string {
  if (won == null || !Number.isFinite(Number(won))) return "";
  return (Number(won) / WON_PER_MANWON).toFixed(2);
}

/** 원 → UI 표시 (`88.00만원`). */
function formatManwonUi(won: number | null | undefined): string {
  if (won == null || !Number.isFinite(Number(won))) return "—";
  return `${(Number(won) / WON_PER_MANWON).toFixed(2)}만원`;
}

/**
 * 만원 입력 → 원.
 * `88` / `88.00` / `1.54만원` 허용. 소수 2자리로 반올림(100원).
 */
function parseManwonInput(raw: string): number | null {
  const s = String(raw)
    .replace(/,/g, "")
    .replace(/\s*만원\s*/g, "")
    .trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  const manwon = Math.round(n * 100) / 100;
  return Math.round(manwon * WON_PER_MANWON);
}

/** 입력 중 문자열을 저장용 만원 draft로 정규화(blur/저장 후). */
function normalizeManwonDraft(raw: string): string {
  const won = parseManwonInput(raw);
  return won == null ? "" : wonToManwonDraft(won);
}

/**
 * 관리자 상품 클러스터 (서버 StoreProductClusterLayout 과 동기).
 * 부모 키트 아래에 구성 단품을 묶는다.
 */
type StoreProductCluster = {
  id: string;
  label: string;
  parentProductId: string | null;
  childProductIds: string[];
  compositionHint?: string;
};

/** FE fallback — BE `storeProductClusters.js` 시드와 동일. */
const DEFAULT_STORE_PRODUCT_CLUSTERS: StoreProductCluster[] = [
  {
    id: "full-package",
    label: "500만 패키지",
    parentProductId: "full-package",
    childProductIds: [],
    compositionHint: "키트 3종 + SA2·SH2 ×100",
  },
  {
    id: "initial-kit",
    label: "Initial Kit",
    parentProductId: "initial-kit",
    childProductIds: ["kit-case", "initial-pen", "pen", "cup", "initial-pin"],
    compositionHint: "케이스 + 이니셜펜 · 펜 · 컵 · 이니셜핀",
  },
  {
    id: "check-kit",
    label: "Check Kit",
    parentProductId: "check-kit",
    childProductIds: ["check-pin", "bone-shaper"],
    compositionHint: "체크핀 · 본셰이퍼 (+케이스)",
  },
  {
    id: "prosthetic-kit",
    label: "Prosthetic Kit",
    parentProductId: "prosthetic-kit",
    childProductIds: ["gingival-shaper", "hex-driver", "torque-wrench"],
    compositionHint: "진지발셰이퍼 · 헥스드라이버 · 토크렌치 (+케이스)",
  },
  {
    id: "abutment",
    label: "Abutment",
    parentProductId: null,
    childProductIds: [
      "simple-abutment-2",
      "simple-healing-2",
      "simple-abutment",
      "simple-healing",
    ],
    compositionHint: "SimpleAbutment · Healing",
  },
];

function cloneClusters(clusters: StoreProductCluster[]): StoreProductCluster[] {
  return clusters.map((c) => ({
    ...c,
    childProductIds: [...c.childProductIds],
  }));
}

/** 모든 클러스터에서 productId 제거(부모면 parent 해제). */
function removeProductFromClusters(
  clusters: StoreProductCluster[],
  productId: string,
): StoreProductCluster[] {
  return clusters.map((c) => ({
    ...c,
    parentProductId:
      c.parentProductId === productId ? null : c.parentProductId,
    childProductIds: c.childProductIds.filter((id) => id !== productId),
  }));
}

/**
 * product를 targetCluster의 children에 index로 삽입.
 * targetClusterId === "__leftover__" 이면 미분류.
 */
function moveProductInClusters(
  clusters: StoreProductCluster[],
  productId: string,
  targetClusterId: string,
  insertIndex: number | null,
): StoreProductCluster[] {
  if (targetClusterId === "__leftover__") {
    return removeProductFromClusters(clusters, productId);
  }

  const source = clusters.find(
    (c) =>
      c.parentProductId === productId ||
      c.childProductIds.includes(productId),
  );
  const sameCluster = source?.id === targetClusterId;

  if (sameCluster && source) {
    // 같은 클러스터 내 자식 순서만 변경 (부모 SKU는 children으로 내리지 않음)
    if (source.parentProductId === productId) return clusters;
    const from = source.childProductIds.indexOf(productId);
    if (from < 0) return clusters;
    const children = [...source.childProductIds];
    children.splice(from, 1);
    let to =
      insertIndex == null || insertIndex < 0
        ? children.length
        : Math.min(insertIndex, children.length);
    // from < to 이면 제거 후 인덱스가 한 칸 앞당겨짐 → 보정하지 않고
    // "목표 행 앞에 삽입"이므로 from < insertIndex 일 때 to = insertIndex - 1
    if (insertIndex != null && from < insertIndex) {
      to = Math.min(insertIndex - 1, children.length);
      to = Math.max(0, to);
    }
    children.splice(to, 0, productId);
    return clusters.map((c) =>
      c.id === targetClusterId ? { ...c, childProductIds: children } : c,
    );
  }

  let next = removeProductFromClusters(clusters, productId);
  next = next.map((c) => {
    if (c.id !== targetClusterId) return c;
    const children = [...c.childProductIds];
    const idx =
      insertIndex == null || insertIndex < 0
        ? children.length
        : Math.min(insertIndex, children.length);
    children.splice(idx, 0, productId);
    return { ...c, childProductIds: children };
  });
  return next;
}

function orderNeedsAction(order: StoreOrder) {
  if (order.status === "PENDING" || order.status === "MATCHED") return true;
  if (order.status === "PAID" && order.fulfillmentStatus === "READY") return true;
  if (order.status === "PAID" && order.fulfillmentStatus === "SHIPPED")
    return true;
  return false;
}

function publishStoreActionCount(orders: StoreOrder[]) {
  const actionCount = orders.filter(orderNeedsAction).length;
  window.dispatchEvent(
    new CustomEvent("abuts:store-action-count", {
      detail: { actionCount },
    }),
  );
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
  const [clusterLayout, setClusterLayout] = useState<StoreProductCluster[]>(
    () => cloneClusters(DEFAULT_STORE_PRODUCT_CLUSTERS),
  );
  const [productDrafts, setProductDrafts] = useState<
    Record<string, ProductDraft>
  >({});
  const [shipDrafts, setShipDrafts] = useState<
    Record<string, { courier: string; trackingNumber: string }>
  >({});
  const [busy, setBusy] = useState(true);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [clusterBusy, setClusterBusy] = useState(false);
  const [dragProductId, setDragProductId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null);
  const [editingClusterLabel, setEditingClusterLabel] = useState("");
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
        apiFetch<{
          success: boolean;
          data?: InventoryRow[];
          clusters?: StoreProductCluster[];
        }>({
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
      const clusters = invRes.data?.clusters;
      if (Array.isArray(clusters) && clusters.length > 0) {
        setClusterLayout(cloneClusters(clusters));
      }
      // 서버 유효가가 SSOT — 새로고침 시 로컬 draft를 덮어쓴다(만원 표시).
      setProductDrafts(() => {
        const next: Record<string, ProductDraft> = {};
        for (const row of inv) {
          next[row.productId] = {
            list: wonToManwonDraft(row.listPriceInclusive),
            pkg: wonToManwonDraft(row.packagePriceInclusive),
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

  // 초기 []로 사이드바 배지를 0으로 덮지 않음(로드 완료 후만 동기화).
  useEffect(() => {
    if (busy) return;
    publishStoreActionCount(orders);
  }, [orders, busy]);

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

  const inventoryById = useMemo(() => {
    const map = new Map<string, InventoryRow>();
    for (const row of inventory) map.set(row.productId, row);
    return map;
  }, [inventory]);

  const productClusters = useMemo(() => {
    const seen = new Set<string>();
    const clusters = clusterLayout
      .map((cluster) => {
        const parent =
          cluster.parentProductId != null
            ? inventoryById.get(cluster.parentProductId) ?? null
            : null;
        if (parent) seen.add(parent.productId);
        const children = cluster.childProductIds
          .map((id) => inventoryById.get(id))
          .filter((row): row is InventoryRow => Boolean(row));
        for (const child of children) seen.add(child.productId);
        return { ...cluster, parent, children };
      })
      .filter((c) => true);

    const leftovers = inventory.filter((row) => !seen.has(row.productId));
    return { clusters, leftovers };
  }, [inventory, inventoryById, clusterLayout]);

  const filteredOrders = useMemo(
    () => orders.filter((o) => orderMatchesFilter(o, orderFilter)),
    [orders, orderFilter],
  );

  async function persistClusterLayout(
    next: StoreProductCluster[],
    opts?: { reset?: boolean; silent?: boolean },
  ) {
    const prev = clusterLayout;
    setClusterLayout(next);
    setClusterBusy(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        data?: { clusters?: StoreProductCluster[] };
      }>({
        path: "/api/admin/store/product-clusters",
        method: "PUT",
        jsonBody: opts?.reset
          ? { reset: true }
          : { clusters: next },
      });
      if (!res.ok || !res.data?.success) {
        setClusterLayout(prev);
        toast.error(res.data?.message || "클러스터 저장 실패");
        return false;
      }
      if (Array.isArray(res.data.data?.clusters)) {
        setClusterLayout(cloneClusters(res.data.data.clusters));
      }
      if (!opts?.silent) toast.success("클러스터 배치를 저장했습니다.");
      return true;
    } catch {
      setClusterLayout(prev);
      toast.error("클러스터 저장 실패");
      return false;
    } finally {
      setClusterBusy(false);
    }
  }

  function applyProductDrop(
    productId: string,
    targetClusterId: string,
    insertIndex: number | null,
  ) {
    if (!productId) return;
    // 부모 SKU를 자식으로 옮기면 해당 클러스터 parent 해제됨(removeProductFromClusters).
    const next = moveProductInClusters(
      clusterLayout,
      productId,
      targetClusterId,
      insertIndex,
    );
    void persistClusterLayout(next, { silent: true });
  }

  function addCluster() {
    const id = `cluster-${Date.now().toString(36)}`;
    const next = [
      ...clusterLayout,
      {
        id,
        label: "새 클러스터",
        parentProductId: null,
        childProductIds: [] as string[],
      },
    ];
    setEditingClusterId(id);
    setEditingClusterLabel("새 클러스터");
    void persistClusterLayout(next, { silent: true });
  }

  function commitClusterRename(clusterId: string) {
    const label = editingClusterLabel.trim() || "이름 없음";
    setEditingClusterId(null);
    const next = clusterLayout.map((c) =>
      c.id === clusterId ? { ...c, label } : c,
    );
    void persistClusterLayout(next, { silent: true });
  }

  function deleteCluster(clusterId: string) {
    const next = clusterLayout.filter((c) => c.id !== clusterId);
    void persistClusterLayout(next, { silent: true });
  }

  function resetClustersToDefault() {
    void persistClusterLayout(cloneClusters(DEFAULT_STORE_PRODUCT_CLUSTERS), {
      reset: true,
    });
  }

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
    const list = parseManwonInput(draft.list);
    const pkg =
      draft.pkg.trim() === "" ? null : parseManwonInput(draft.pkg);
    const qtyOnHand = Math.round(Number(draft.qty));

    if (list == null) {
      toast.error("판매가가 올바르지 않습니다. (만원, 소수 2자리)");
      return;
    }
    if (draft.pkg.trim() !== "" && pkg == null) {
      toast.error("pkg가가 올바르지 않습니다. (만원, 소수 2자리)");
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
      const savedList = priceData?.listPriceInclusive ?? list;
      const savedPkg = priceData?.packagePriceInclusive ?? pkg;
      setInventory((prev) =>
        prev.map((r) =>
          r.productId === row.productId
            ? {
                ...r,
                listPriceInclusive: savedList,
                packagePriceInclusive: savedPkg,
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
          list: wonToManwonDraft(savedList),
          pkg: wonToManwonDraft(savedPkg),
          qty: String(qtyOnHand),
        },
      }));
      toast.success(
        `저장: 판매 ${formatManwonUi(savedList)}` +
          (savedPkg != null ? ` · pkg ${formatManwonUi(savedPkg)}` : ""),
      );
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
          list: wonToManwonDraft(list),
          pkg: wonToManwonDraft(pkg),
          qty: prev[row.productId]?.qty ?? String(row.qtyOnHand),
        },
      }));
      toast.success(
        `기본가 복원: ${formatManwonUi(list)}` +
          (pkg != null ? ` · pkg ${formatManwonUi(pkg)}` : ""),
      );
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

  function renderInventoryPriceRow(
    row: InventoryRow,
    opts: {
      role: "parent" | "child" | "leftover";
      clusterId: string;
      insertIndex: number | null;
    },
  ) {
    const draft = productDrafts[row.productId] || {
      list: wonToManwonDraft(row.listPriceInclusive),
      pkg: wonToManwonDraft(row.packagePriceInclusive),
      qty: String(row.qtyOnHand),
    };
    const low = row.qtyAvailable <= 5;
    const rowSaving = savingProductId === row.productId;
    const isChild = opts.role === "child";
    const dropKey = `row:${opts.clusterId}:${row.productId}`;
    const isDragOver = dragOverKey === dropKey;
    const isDragging = dragProductId === row.productId;

    return (
      <tr
        key={row.productId}
        className={cn(
          "border-b border-border/40 last:border-0",
          isChild && "bg-background/40",
          isDragging && "opacity-50",
          isDragOver && "ring-1 ring-inset ring-primary/40",
        )}
        onDragOver={(e) => {
          if (!dragProductId || dragProductId === row.productId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverKey !== dropKey) setDragOverKey(dropKey);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const productId =
            e.dataTransfer.getData("text/plain") || dragProductId || "";
          setDragProductId(null);
          setDragOverKey(null);
          if (!productId || productId === row.productId) return;
          applyProductDrop(productId, opts.clusterId, opts.insertIndex);
        }}
      >
        <td className="px-3 py-2.5 align-top">
          <div className={cn("flex items-start gap-1.5", isChild && "pl-3")}>
            <button
              type="button"
              className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
              draggable
              title="드래그하여 이동"
              aria-label={`${row.name} 이동`}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", row.productId);
                e.dataTransfer.effectAllowed = "move";
                setDragProductId(row.productId);
              }}
              onDragEnd={() => {
                setDragProductId(null);
                setDragOverKey(null);
              }}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div
                className={cn(
                  "font-medium",
                  isChild && "flex items-center gap-1.5 text-sm font-normal",
                )}
              >
                {isChild ? (
                  <span className="text-muted-foreground/70" aria-hidden>
                    └
                  </span>
                ) : null}
                {row.name}
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-[6.5rem] tabular-nums"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.list}
              onChange={(e) =>
                patchProductDraft(row.productId, "list", e.target.value)
              }
              onBlur={() =>
                patchProductDraft(
                  row.productId,
                  "list",
                  normalizeManwonDraft(draft.list),
                )
              }
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              만원
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-[6.5rem] tabular-nums"
              inputMode="decimal"
              placeholder="없음"
              value={draft.pkg}
              onChange={(e) =>
                patchProductDraft(row.productId, "pkg", e.target.value)
              }
              onBlur={() => {
                if (draft.pkg.trim() === "") {
                  patchProductDraft(row.productId, "pkg", "");
                  return;
                }
                patchProductDraft(
                  row.productId,
                  "pkg",
                  normalizeManwonDraft(draft.pkg),
                );
              }}
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              만원
            </span>
          </div>
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
              patchProductDraft(row.productId, "qty", e.target.value)
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CreditSectionHeader
                icon={Boxes}
                title="상품 · 가격 · 재고"
                description="핸들로 드래그해 클러스터·순서를 바꿉니다. 가격은 만원(소수 2자리). 배치는 관리자 공통 저장."
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={clusterBusy}
                  onClick={() => addCluster()}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  클러스터 추가
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={clusterBusy}
                  onClick={() => resetClustersToDefault()}
                >
                  기본 배치
                </Button>
              </div>
            </div>
            {busy && inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : (
              <CreditPanel>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="border-b border-border/70 bg-muted/30 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">상품</th>
                        <th className="px-3 py-2.5 font-medium">판매가(만원)</th>
                        <th className="px-3 py-2.5 font-medium">pkg가(만원)</th>
                        <th className="px-3 py-2.5 font-medium">가용</th>
                        <th className="px-3 py-2.5 font-medium">예약</th>
                        <th className="px-3 py-2.5 font-medium">보유</th>
                        <th className="px-3 py-2.5 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {productClusters.clusters.map((cluster) => {
                        const headerDropKey = `cluster:${cluster.id}`;
                        const isHeaderOver = dragOverKey === headerDropKey;
                        return (
                          <Fragment key={cluster.id}>
                            <tr
                              className={cn(
                                "border-b border-border/50 bg-muted/25",
                                isHeaderOver && "bg-primary/10",
                              )}
                              onDragOver={(e) => {
                                if (!dragProductId) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                if (dragOverKey !== headerDropKey) {
                                  setDragOverKey(headerDropKey);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const productId =
                                  e.dataTransfer.getData("text/plain") ||
                                  dragProductId ||
                                  "";
                                setDragProductId(null);
                                setDragOverKey(null);
                                if (!productId) return;
                                applyProductDrop(productId, cluster.id, null);
                              }}
                            >
                              <td colSpan={7} className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  {editingClusterId === cluster.id ? (
                                    <Input
                                      className="h-7 w-48 text-xs font-semibold"
                                      value={editingClusterLabel}
                                      autoFocus
                                      onChange={(e) =>
                                        setEditingClusterLabel(e.target.value)
                                      }
                                      onBlur={() =>
                                        commitClusterRename(cluster.id)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          commitClusterRename(cluster.id);
                                        }
                                        if (e.key === "Escape") {
                                          setEditingClusterId(null);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="text-xs font-semibold tracking-tight text-foreground/90 hover:underline"
                                      onClick={() => {
                                        setEditingClusterId(cluster.id);
                                        setEditingClusterLabel(cluster.label);
                                      }}
                                      title="이름 변경"
                                    >
                                      {cluster.label}
                                    </button>
                                  )}
                                  {cluster.compositionHint ? (
                                    <span className="text-xs font-normal text-muted-foreground">
                                      {cluster.compositionHint}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">
                                      여기로 드롭하여 추가
                                    </span>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto h-7 px-2 text-muted-foreground"
                                    disabled={clusterBusy}
                                    onClick={() => deleteCluster(cluster.id)}
                                    title="클러스터 삭제 (구성품은 기타로)"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {cluster.parent
                              ? renderInventoryPriceRow(cluster.parent, {
                                  role: "parent",
                                  clusterId: cluster.id,
                                  insertIndex: 0,
                                })
                              : null}
                            {cluster.children.map((child, childIdx) =>
                              renderInventoryPriceRow(child, {
                                role: "child",
                                clusterId: cluster.id,
                                insertIndex: childIdx,
                              }),
                            )}
                          </Fragment>
                        );
                      })}
                      <Fragment>
                        <tr
                          className={cn(
                            "border-b border-border/50 bg-muted/25",
                            dragOverKey === "cluster:__leftover__" &&
                              "bg-primary/10",
                          )}
                          onDragOver={(e) => {
                            if (!dragProductId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverKey !== "cluster:__leftover__") {
                              setDragOverKey("cluster:__leftover__");
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const productId =
                              e.dataTransfer.getData("text/plain") ||
                              dragProductId ||
                              "";
                            setDragProductId(null);
                            setDragOverKey(null);
                            if (!productId) return;
                            applyProductDrop(productId, "__leftover__", null);
                          }}
                        >
                          <td
                            colSpan={7}
                            className="px-3 py-2 text-xs font-semibold text-foreground/90"
                          >
                            기타
                            <span className="ml-2 font-normal text-muted-foreground">
                              미분류 · 여기로 드롭하면 클러스터에서 제거
                            </span>
                          </td>
                        </tr>
                        {productClusters.leftovers.map((row) =>
                          renderInventoryPriceRow(row, {
                            role: "leftover",
                            clusterId: "__leftover__",
                            insertIndex: null,
                          }),
                        )}
                      </Fragment>
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
