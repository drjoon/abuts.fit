// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/scripts/db/rebalance-manufacturer-unit-price.js
// change-log:
// - 2026-08-18: 치과/기공소/제조사 배송비는 모두 면세. 제조사 장부는 어벗츠→제조사만 기록.
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
