// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Badge } from "@/components/ui/badge";
import type {
  AdminCreditLedgerType,
  BusinessCredit,
} from "./adminCredit.types";

export const formatLedgerDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatShortCode = (value: string) => {
  const raw = String(value || "");
  if (!raw) return "-";
  const tail = raw.replace(/[^a-zA-Z0-9]/g, "");
  const s = tail.slice(-4).toUpperCase();
  return s || "-";
};

export const normalizeDigits = (value: string) =>
  String(value || "").replace(/\D/g, "");

export const formatBusinessSelectLabel = (business: BusinessCredit) => {
  const businessNumber =
    String(business.businessNumber || "").trim() || "사업자번호 없음";
  const businessAnchorId = String(business.businessAnchorId || "").trim();
  if (!businessAnchorId) return `${business.name} (${businessNumber})`;
  return `${business.name} (${businessNumber} / anchor ${businessAnchorId})`;
};

export const creditTypeLabel = (t: AdminCreditLedgerType) => {
  if (t === "CHARGE_PAID") return "유료충전";
  if (t === "CHARGE_FREE_REQUEST") return "무료충전(의뢰)";
  if (t === "CHARGE_FREE_SHIPPING") return "무료충전(배송)";
  if (t === "SPEND_PAID") return "사용(유료)";
  if (t === "SPEND_FREE_REQUEST") return "사용(무료)";
  if (t === "SPEND_FREE_SHIPPING") return "사용(무료)";
  return "조정";
};

export const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  if (t === "SHIPPING_FEE") return "배송비 (발송 1회)";
  if (t === "REQUEST") return "의뢰";
  if (t === "FREE_REQUEST_CREDIT" || t === "REQUEST_FREE_CREDIT" || t === "WELCOME_BONUS") {
    return "환영 무료 의뢰크레딧";
  }
  if (t === "FREE_SHIPPING_CREDIT" || t === "SHIPPING_FREE_CREDIT") {
    return "환영 무료 배송크레딧";
  }
  return t;
};

export const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("ko-KR");
};

export const getStatusBadge = (status: string) => {
  const variants: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    PENDING: "outline",
    MATCHED: "default",
    EXPIRED: "destructive",
    CANCELED: "secondary",
    NEW: "outline",
    IGNORED: "secondary",
  };
  return <Badge variant={variants[status] || "default"}>{status}</Badge>;
};
