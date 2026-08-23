// change-log:
// - 2026-08-23: 스토어 포함가 ↔ 공급/세액 분해 (프론트 invoiceLabels와 동일).
// related files:
// - web/frontend/src/shared/tax/invoiceLabels.ts
// - rules.md §2.3

export const STORE_VAT_RATE = 0.1;

export function roundWon(value) {
  return Math.round(Number(value || 0));
}

/** 부가세 포함가 → 공급가/세액. */
export function splitInclusiveVat(inclusiveAmount, rate = STORE_VAT_RATE) {
  const total = roundWon(inclusiveAmount);
  const supply = roundWon(total / (1 + Number(rate || 0)));
  const vat = total - supply;
  return { supply, vat, total };
}

/** 공급가 → 포함가. */
export function toInclusiveVat(supplyAmount, rate = STORE_VAT_RATE) {
  const supply = roundWon(supplyAmount);
  const vat = roundWon(supply * Number(rate || 0));
  return { supply, vat, total: supply + vat };
}
