// change-log:
// - 2026-09-23: LAB_TO_PRACTICE 라벨·안내 — 이력. 기공비=어벗츠→고객 월합.
// - 2026-09-20: 발행 레인 — 어벗츠→기공소/치과·기공소→치과. 면세=계산서·과세=세금계산서 분리.
// - 2026-08-23: 겸영사업자 — 과세=세금계산서, 면세=계산서. 스토어 포함가 분해 헬퍼.
// related files:
// - rules.md §2.3
// - web/frontend/src/shared/settlement/affiliateVat.ts
// - web/frontend/src/pages/admin/system/AdminTaxInvoices.tsx
import {
  AFFILIATE_VAT_RATE,
  SETTLEMENT_EXEMPT_INVOICE_LABEL,
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  roundWon,
} from "@/shared/settlement/affiliateVat";

export type InvoiceTaxType = "과세" | "면세";

export type TaxInvoiceDirection =
  | "ABUTS_TO_CUSTOMER"
  | "LAB_TO_PRACTICE"
  | "AFFILIATE_TO_ABUTS";

export type TaxInvoiceBuyerKind = "practice" | "lab";

/** 관리자 콘솔 발행 레인(표시·필터). DB direction과 1:1이 아님. */
export type TaxInvoiceLane =
  | "ABUTS_TO_LAB"
  | "ABUTS_TO_PRACTICE"
  | "LAB_TO_PRACTICE"
  | "AFFILIATE_TO_ABUTS";

export const TAX_INVOICE_LANE_LABEL: Record<TaxInvoiceLane, string> = {
  ABUTS_TO_LAB: "어벗츠 → 기공소",
  ABUTS_TO_PRACTICE: "어벗츠 → 치과",
  LAB_TO_PRACTICE: "기공소 → 치과(이력)",
  AFFILIATE_TO_ABUTS: "관계사 → 어벗츠",
};

/** @deprecated 레거시 — TAX_INVOICE_LANE_LABEL / taxInvoiceLaneLabel 사용 */
export const TAX_INVOICE_DIRECTION_LABEL: Record<TaxInvoiceDirection, string> =
  {
    ABUTS_TO_CUSTOMER: "어벗츠 → 고객",
    LAB_TO_PRACTICE: "기공소 → 치과",
    AFFILIATE_TO_ABUTS: "관계사 → 어벗츠",
  };

export function taxInvoiceLaneFromDraft(draft: {
  direction?: string | null;
  buyerKind?: string | null;
}): TaxInvoiceLane | null {
  const direction = String(draft?.direction || "").trim();
  if (direction === "LAB_TO_PRACTICE") return "LAB_TO_PRACTICE";
  if (direction === "AFFILIATE_TO_ABUTS") return "AFFILIATE_TO_ABUTS";
  if (direction === "ABUTS_TO_CUSTOMER") {
    return String(draft?.buyerKind || "").trim() === "lab"
      ? "ABUTS_TO_LAB"
      : "ABUTS_TO_PRACTICE";
  }
  return null;
}

export function taxInvoiceLaneLabel(draft: {
  direction?: string | null;
  buyerKind?: string | null;
}): string {
  const lane = taxInvoiceLaneFromDraft(draft);
  if (!lane) return TAX_INVOICE_DIRECTION_LABEL.ABUTS_TO_CUSTOMER;
  return TAX_INVOICE_LANE_LABEL[lane];
}

/** taxType → 문서 라벨 (세금계산서 | 계산서). */
export function invoiceDocumentLabel(
  taxType?: InvoiceTaxType | string | null,
): string {
  return taxType === "과세"
    ? SETTLEMENT_TAXABLE_INVOICE_LABEL
    : SETTLEMENT_EXEMPT_INVOICE_LABEL;
}

/** 관리자 목록용 짧은 뱃지. */
export function invoiceTaxTypeBadge(
  taxType?: InvoiceTaxType | string | null,
): string {
  return taxType === "과세" ? "과세 · 세금계산서" : "면세 · 계산서";
}

export function isTaxableInvoice(
  taxType?: InvoiceTaxType | string | null,
): boolean {
  return taxType === "과세";
}

/** 부가세 포함가 → 공급가/세액 분해 (과세 10%). */
export function splitInclusiveVat(
  inclusiveAmount: number,
  rate: number = AFFILIATE_VAT_RATE,
): { supply: number; vat: number; total: number } {
  const total = roundWon(inclusiveAmount);
  const supply = roundWon(total / (1 + Number(rate || 0)));
  const vat = total - supply;
  return { supply, vat, total };
}

/** 공급가 → 포함가. */
export function toInclusiveVat(
  supplyAmount: number,
  rate: number = AFFILIATE_VAT_RATE,
): { supply: number; vat: number; total: number } {
  const supply = roundWon(supplyAmount);
  const vat = roundWon(supply * Number(rate || 0));
  return { supply, vat, total: supply + vat };
}

export const STORE_TAX_TYPE: InvoiceTaxType = "과세";
export const STORE_PRICE_TAX_NOTE = "과세 · 부가세 포함";
export const CUSTOM_ABUTMENT_TAX_NOTE = "면세 · 부가세 없음";

/** 고객향 발행 레인 안내(재무 콘솔). */
export const CUSTOMER_TAX_LANE_ISSUE_NOTICE =
  "어벗츠→기공소·치과: 기공·커스텀어벗은 면세 계산서, 스토어는 과세 세금계산서로 각각 발행합니다.";
