// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/rules.md
// change-log:
// - 2026-09-20: 비거래처 선불 해제는 제조사 발송 유지. 가공 진입으로 옮기지 않음.
// - 2026-09-20: 커스텀어벗 치과→기공소 정산은 디자인 STL + 생산비 지급 후에만.

/**
 * 비거래처 선불의 어벗츠 수취 여부.
 * 생성 시 소매가가 PTX 보류에 있으므로 가공 진입 REQUEST_SPEND_COMMIT은 없다.
 * 수취는 제조사 발송 `releasePracticeTransferAbutmentShare`만. 가공 진입으로 옮기지 말 것
 * (의뢰 전체 1키 · 발송 전 취소가 제조사 매출 롤백이 됨 · 배송비와 무관).
 */
export function awaitsAbutmentShareRelease(transfer) {
  const billing =
    transfer?.billing && typeof transfer.billing === "object"
      ? transfer.billing
      : {};
  const held = Math.max(0, Math.round(Number(billing.heldAbutmentTotal || 0)));
  const retail = Math.max(
    0,
    Math.round(Number(billing.abutmentRetailTotal || 0)),
  );
  return (held > 0 || retail > 0) && !Boolean(billing.isTradingPartner);
}

/**
 * 커스텀어벗 건의 치과→기공소 정산 보류 사유.
 * null이면 지금 정산해도 된다. 보철만(CA 없음)은 항상 null.
 * @returns {"awaiting_abutment_design_stl"|"awaiting_abutment_production_payment"|null}
 */
export function resolvePracticeToLabSettlementBlock({
  customAbutmentCount = 0,
  needsMoreDesignStl = false,
  awaitAbutmentShareRelease = false,
  abutmentProductionReleased = false,
  productionPaymentWaived = false,
  activeProductionRequestIds = [],
  paidProductionRequestIds = [],
} = {}) {
  if (Math.max(0, Math.round(Number(customAbutmentCount) || 0)) <= 0) {
    return null;
  }
  if (needsMoreDesignStl) return "awaiting_abutment_design_stl";
  if (productionPaymentWaived) return null;
  if (awaitAbutmentShareRelease) {
    return abutmentProductionReleased
      ? null
      : "awaiting_abutment_production_payment";
  }
  const active = [
    ...new Set(
      (Array.isArray(activeProductionRequestIds)
        ? activeProductionRequestIds
        : []
      )
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!active.length) return "awaiting_abutment_production_payment";
  const paid = new Set(
    (Array.isArray(paidProductionRequestIds) ? paidProductionRequestIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  return active.every((id) => paid.has(id))
    ? null
    : "awaiting_abutment_production_payment";
}

export function requestMachiningSpendGlKey(requestId) {
  return `gl:request:${String(requestId || "").trim()}:machining_spend`;
}
