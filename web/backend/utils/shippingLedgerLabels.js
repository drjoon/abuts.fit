// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/scripts/db/rebalance-manufacturer-unit-price.js
// change-log:
// - 2026-08-22: 기공소→치과·치과→기공소 배송 무료 — practiceToLab/labToPractice 라벨 삭제.
// - 2026-08-23: 치과/기공소→어벗츠 배송비는 면세. 제조사(어벗츠→제조사)는 과세 하청.
// - 2026-08-18: 치과/기공소 배송비는 면세. 제조사 장부는 어벗츠→제조사만 기록.
export const SHIPPING_LEDGER_LABELS = {
  // 레거시: practiceToLab / labToPractice 라벨 삭제(해당 방향 배송 무료).
  practiceToAbuts: "배송비(치과→어벗츠)",
  labToAbuts: "배송비(기공소→어벗츠)",
  abutsToManufacturer: "배송비(어벗츠→제조사)",
};

export function resolveCustomerShippingLabel({
  isPracticeTransferAbuts = false,
  requestorKind = "",
} = {}) {
  // PTX CA 배송비도 기공소→어벗츠.
  if (isPracticeTransferAbuts) return SHIPPING_LEDGER_LABELS.labToAbuts;
  if (String(requestorKind || "").trim() === "lab") {
    return SHIPPING_LEDGER_LABELS.labToAbuts;
  }
  return SHIPPING_LEDGER_LABELS.practiceToAbuts;
}
