// change-log:
// - 2026-08-23: 스토어 주문 목록·상세 공통 UI(상태·진행·레이아웃).
// related files:
// - web/frontend/src/pages/requestor/store/RequestorStoreOrdersPage.tsx
import { Check, Circle, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import {
  STORE_FULFILLMENT_STATUS_LABEL,
  type StoreFulfillmentStatus,
} from "@/shared/tax/ledgerTaxLanes";

export type DepositAccount = {
  bankName: string;
  accountNumber: string;
  holderName: string;
};

export type StoreOrder = {
  _id: string;
  status: string;
  fulfillmentStatus?: string;
  depositCode: string;
  paymentMethod?: string;
  supplyAmount: number;
  vatAmount: number;
  amountTotal: number;
  itemsAmountTotal?: number;
  shippingFeeInclusive?: number;
  shippingSupplyAmount?: number;
  shippingVatAmount?: number;
  expiresAt?: string;
  items?: Array<{ name: string; qty: number; lineTotalInclusive: number }>;
  shipping?: {
    recipientName?: string;
    phone?: string;
    zipCode?: string;
    address?: string;
    addressDetail?: string;
    memo?: string;
  };
  courier?: string;
  trackingNumber?: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  paidAt?: string | null;
  canceledAt?: string | null;
  canceledByRole?: string;
  cancelReason?: string;
  createdAt?: string;
};

export const STORE_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "입금 대기",
  MATCHED: "입금 확인 중",
  PAID: "결제 완료",
  CANCELED: "취소",
  EXPIRED: "만료",
};

export const STORE_PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK: "계좌이체",
  CREDIT: "선수금",
};

export const STORE_SHELL_CLASS =
  "mx-auto w-full max-w-6xl space-y-6 px-4 pb-8 pt-4 sm:px-6 sm:pt-6";

export type OrderFilterTab = "all" | "pending" | "paid" | "closed";

export function formatOrderShortId(orderId: string) {
  const tail = String(orderId || "").slice(-8).toUpperCase();
  return tail ? `#${tail}` : "-";
}

export function fulfillmentLabel(status?: string) {
  if (!status) return "";
  return (
    STORE_FULFILLMENT_STATUS_LABEL[status as StoreFulfillmentStatus] || status
  );
}

export function orderMatchesFilter(order: StoreOrder, tab: OrderFilterTab) {
  if (tab === "all") return true;
  if (tab === "pending") {
    return order.status === "PENDING" || order.status === "MATCHED";
  }
  if (tab === "paid") return order.status === "PAID";
  return order.status === "CANCELED" || order.status === "EXPIRED";
}

/** 출고 전까지 고객이 취소할 수 있는 주문. */
export function isOrderCustomerCancelable(order: StoreOrder) {
  const status = String(order.status || "");
  const fulfillment = String(order.fulfillmentStatus || "");
  if (status === "PENDING" || status === "MATCHED") return true;
  if (status === "PAID" && fulfillment === "READY") return true;
  return false;
}

export function orderStatusBadgeVariant(status: string) {
  switch (status) {
    case "PAID":
      return "default" as const;
    case "PENDING":
    case "MATCHED":
      return "secondary" as const;
    case "CANCELED":
    case "EXPIRED":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

export function fulfillmentBadgeVariant(status?: string) {
  switch (status) {
    case "DELIVERED":
      return "default" as const;
    case "SHIPPED":
      return "secondary" as const;
    case "READY":
      return "secondary" as const;
    case "CANCELED":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

export function resolveStoreOrderItemsAmountTotal(order: StoreOrder) {
  const explicit = Number(order.itemsAmountTotal);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return (order.items || []).reduce(
    (sum, item) => sum + Number(item.lineTotalInclusive || 0),
    0,
  );
}

export function summarizeOrderItems(
  items: StoreOrder["items"],
  maxNames = 2,
) {
  const list = items || [];
  if (list.length === 0) return "상품 없음";
  const head = list
    .slice(0, maxNames)
    .map((i) => `${i.name}×${i.qty}`)
    .join(", ");
  const rest = list.length - maxNames;
  return rest > 0 ? `${head} 외 ${rest}건` : head;
}

export function buildCourierTrackingUrl(
  courier?: string,
  trackingNumber?: string,
) {
  const no = String(trackingNumber || "").trim();
  if (!no) return null;
  const name = String(courier || "").trim().toLowerCase();
  if (name.includes("cj") || name.includes("대한통운")) {
    return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${encodeURIComponent(no)}`;
  }
  if (name.includes("한진") || name.includes("hanjin")) {
    return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?wblnum=${encodeURIComponent(no)}`;
  }
  if (name.includes("로젠") || name.includes("logen")) {
    return `https://www.ilogen.com/web/personal/trace/${encodeURIComponent(no)}`;
  }
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(
    `${courier || "택배"} ${no}`,
  )}`;
}

type ProgressStep = {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  at?: string | null;
};

export function buildOrderProgressSteps(order: StoreOrder): ProgressStep[] {
  const canceled =
    order.status === "CANCELED" ||
    order.status === "EXPIRED" ||
    order.fulfillmentStatus === "CANCELED";
  const paid =
    order.status === "PAID" ||
    order.status === "MATCHED" ||
    Boolean(order.paidAt);
  const fulfillment = order.fulfillmentStatus || "UNPAID";

  if (canceled) {
    return [
      {
        key: "created",
        label: "주문 접수",
        done: true,
        active: false,
        at: order.createdAt,
      },
      {
        key: "closed",
        label: STORE_ORDER_STATUS_LABEL[order.status] || "종료",
        done: true,
        active: true,
        at: order.paidAt,
      },
    ];
  }

  const steps: ProgressStep[] = [
    {
      key: "created",
      label: "주문 접수",
      done: true,
      active: !paid && order.status === "PENDING",
      at: order.createdAt,
    },
    {
      key: "payment",
      label: paid ? "결제 완료" : "입금·결제",
      done: paid,
      active: !paid,
      at: order.paidAt,
    },
    {
      key: "ready",
      label: "출고 준비",
      done:
        fulfillment === "READY" ||
        fulfillment === "SHIPPED" ||
        fulfillment === "DELIVERED",
      active: paid && fulfillment === "READY",
      at: order.paidAt,
    },
    {
      key: "shipped",
      label: "배송 중",
      done: fulfillment === "SHIPPED" || fulfillment === "DELIVERED",
      active: fulfillment === "SHIPPED",
      at: order.shippedAt,
    },
    {
      key: "delivered",
      label: "배송 완료",
      done: fulfillment === "DELIVERED",
      active: fulfillment === "DELIVERED",
      at: order.deliveredAt,
    },
  ];
  return steps;
}

export function OrderStatusBadges({ order }: { order: StoreOrder }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={orderStatusBadgeVariant(order.status)}>
        {STORE_ORDER_STATUS_LABEL[order.status] || order.status}
      </Badge>
      {order.fulfillmentStatus && order.fulfillmentStatus !== "UNPAID" ? (
        <Badge variant={fulfillmentBadgeVariant(order.fulfillmentStatus)}>
          {fulfillmentLabel(order.fulfillmentStatus)}
        </Badge>
      ) : null}
      {order.paymentMethod ? (
        <Badge variant="outline" className="font-normal">
          {STORE_PAYMENT_METHOD_LABEL[order.paymentMethod] ||
            order.paymentMethod}
        </Badge>
      ) : null}
    </div>
  );
}

export function OrderProgressTimeline({ order }: { order: StoreOrder }) {
  const steps = buildOrderProgressSteps(order);
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="flex gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
        >
          <div className="mt-0.5 shrink-0">
            {step.done ? (
              <Check className="h-4 w-4 text-primary" aria-hidden />
            ) : (
              <Circle
                className="h-4 w-4 text-muted-foreground/50"
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p
              className={
                step.active
                  ? "text-sm font-semibold text-foreground"
                  : "text-sm font-medium text-foreground"
              }
            >
              {step.label}
            </p>
            {step.at ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatKstDateTimeToKo(step.at)}
              </p>
            ) : index === 0 ? (
              <p className="text-xs text-muted-foreground">완료</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DepositInfoBlock({
  order,
  depositAccount,
  onCopy,
}: {
  order: StoreOrder;
  depositAccount: DepositAccount;
  onCopy: (text: string, label: string) => void;
}) {
  const accountLine = `${depositAccount.bankName} ${depositAccount.accountNumber}`;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">입금 계좌</span>
        <div className="flex items-center gap-1">
          <span className="font-medium">{accountLine}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onCopy(accountLine, "계좌")}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground">
        예금주 {depositAccount.holderName}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
        <div>
          <p className="text-xs text-muted-foreground">입금자명 코드</p>
          <code className="text-base font-semibold tabular-nums">
            {order.depositCode}
          </code>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onCopy(order.depositCode, "입금코드")}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          복사
        </Button>
      </div>
      {order.expiresAt ? (
        <p className="text-xs text-muted-foreground">
          입금 마감 {formatKstDateTimeToKo(order.expiresAt)} (미입금 시 자동
          만료)
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        입금자명에 위 코드를 넣으면 자동 매칭됩니다. (세금)계산서는 사용분
        기준 월말 발행입니다.
      </p>
    </div>
  );
}

export function TrackingInfoBlock({ order }: { order: StoreOrder }) {
  if (!order.trackingNumber) return null;
  const url = buildCourierTrackingUrl(order.courier, order.trackingNumber);
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-muted-foreground">택배사</span>{" "}
        {order.courier || "택배"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 tabular-nums">
          {order.trackingNumber}
        </code>
        {url ? (
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              배송 조회
            </a>
          </Button>
        ) : null}
      </div>
      {order.shippedAt ? (
        <p className="text-xs text-muted-foreground">
          출고 {formatKstDateTimeToKo(order.shippedAt)}
        </p>
      ) : null}
      {order.deliveredAt ? (
        <p className="text-xs text-muted-foreground">
          배송 완료 {formatKstDateTimeToKo(order.deliveredAt)}
        </p>
      ) : null}
    </div>
  );
}
