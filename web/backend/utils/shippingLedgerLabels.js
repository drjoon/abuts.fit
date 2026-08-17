// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// change-log:
// - 2026-08-17: 치과/기공소→어벗츠 배송비는 면세 수취. 제조사는 어벗츠→제조사(+VAT)만 기록.
export const SHIPPING_LEDGER_LABELS = {
  practiceToLab: "배송비(치과→기공소)",
  practiceToAbuts: "배송비(치과→어벗츠)",
  labToAbuts: "배송비(기공소→어벗츠)",
  abutsToManufacturer: "배송비(어벗츠→제조사)",
};

export function resolveCustomerShippingLabel({
  isPracticeTransferAbuts = false,
  requestorKind = "",
} = {}) {
  if (isPracticeTransferAbuts) return SHIPPING_LEDGER_LABELS.practiceToAbuts;
  if (String(requestorKind || "").trim() === "lab") {
    return SHIPPING_LEDGER_LABELS.labToAbuts;
  }
  return SHIPPING_LEDGER_LABELS.practiceToAbuts;
}
