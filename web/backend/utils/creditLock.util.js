// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import ChargeOrder from "../models/chargeOrder.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";

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

  // 영업팀이 입력한 거래처 가격은 본사 승인 후 거래 가능.
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select("+dealerPriceApproval")
    .lean();
  if (anchor?.dealerPriceApproval?.status === "pending") {
    return {
      isLocked: true,
      reason: "거래처 가격 승인 대기 중입니다. 본사 승인 후 의뢰할 수 있습니다.",
      lockedAt: anchor.dealerPriceApproval.requestedAt || null,
    };
  }

  return { isLocked: false };
}
