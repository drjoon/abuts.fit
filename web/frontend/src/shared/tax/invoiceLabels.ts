// change-log:
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
