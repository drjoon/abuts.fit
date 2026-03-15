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
  if (t === "CHARGE") return "충전";
  if (t === "BONUS") return "보너스";
  if (t === "SPEND") return "사용";
  if (t === "REFUND") return "환불";
  return "조정";
};

export const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  if (t === "SHIPPING_FEE") return "배송비 (발송 1회)";
  if (t === "REQUEST") return "의뢰";
  if (t === "FREE_SHIPPING_CREDIT") return "가입 축하 배송비 보너스";
  if (t === "WELCOME_BONUS") return "가입 축하 보너스";
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
