// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/services/practiceObBilling.service.js
// - web/backend/utils/practiceObBeta.util.js
import ChargeOrder from "../models/chargeOrder.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeMonthlySettlement from "../models/practiceMonthlySettlement.model.js";

export async function checkCreditLock(businessAnchorId, now = new Date()) {
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

  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select("+dealerPriceApproval")
    .lean();

  if (!anchor) {
    return { isLocked: false };
  }

  // 영업팀이 입력한 거래처 가격 승인 대기
  if (anchor?.dealerPriceApproval?.status === "pending") {
    return {
      isLocked: true,
      reason: "거래처 가격 승인 대기 중입니다. 본사 승인 후 의뢰할 수 있습니다.",
      lockedAt: anchor.dealerPriceApproval.requestedAt || null,
    };
  }

  return { isLocked: false };
}

/**
 * 신규 기공의뢰를 잠시 멈출 때 치과에 보여주는 문구.
 * 문장마다 줄을 나눠 화면에서 그대로 쓴다.
 */
export function practiceSettlementPauseReason(yearMonth) {
  const month = String(yearMonth || "").trim();
  const head = month
    ? `${month} 기공료가 아직 확인되지 않았습니다.`
    : "지난 기공료가 아직 확인되지 않았습니다.";
  return [
    head,
    "확인되는 대로 새 기공의뢰를 바로 보내실 수 있습니다.",
    "이미 입금해 주셨다면 확인 후 바로 열어 드립니다.",
    "진행 중인 의뢰는 그대로 이어집니다.",
  ].join("\n");
}

/**
 * 기공의뢰(PTX) 신규 생성 전용. 커스텀어벗(Request)에는 적용하지 않는다.
 * 2차 입금일 다음 날 09:00(KST)가 지났는데 입금 확인이 없으면 신규만 멈춘다.
 */
export async function checkPracticeSettlementLock(
  practiceAnchorId,
  now = new Date(),
) {
  if (!practiceAnchorId) return { isLocked: false };
  const anchor = await BusinessAnchor.findById(practiceAnchorId)
    .select({ _id: 1 })
    .lean();
  if (!anchor) return { isLocked: false };

  const overdue = await PracticeMonthlySettlement.findOne({
    practiceAnchorId,
    status: { $ne: "COMPLETED" },
    totalAmount: { $gt: 0 },
    paymentReceivedAt: null,
    scheduledTransferAt: { $lte: now },
  })
    .sort({ yearMonth: 1 })
    .select({ yearMonth: 1, scheduledTransferAt: 1 })
    .lean();
  if (!overdue) return { isLocked: false };

  return {
    isLocked: true,
    reason: practiceSettlementPauseReason(overdue.yearMonth),
    lockedAt: overdue.scheduledTransferAt || null,
  };
}
