import ChargeOrder from "../models/chargeOrder.model.js";

export async function checkCreditLock(businessAnchorId) {
  const lockedOrder = await ChargeOrder.findOne({
    businessAnchorId,
    isLocked: true,
  })
    .select({ _id: 1, lockedReason: 1, lockedAt: 1 })
    .lean();

  if (lockedOrder) {
    return {
      isLocked: true,
      reason: lockedOrder.lockedReason || "관리자 검토 중",
      lockedAt: lockedOrder.lockedAt,
    };
  }

  return { isLocked: false };
}
