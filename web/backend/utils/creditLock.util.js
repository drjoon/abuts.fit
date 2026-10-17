// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/services/practiceObBilling.service.js
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
 * 기공의뢰(PTX) 신규 생성 전용 월 정산 잠금. 커스텀어벗(Request, 선불 크레딧)에는 적용하지 않는다.
 * - 정산 예정일이 지났는데 COMPLETED가 아닌 월 정산이 있으면 잠금(다음 의뢰 불가)
 * - 자동이체 실패 Hold, OB 90일 재인증 만료도 잠금
 */
export async function checkPracticeSettlementLock(
  practiceAnchorId,
  now = new Date(),
) {
  const anchor = await BusinessAnchor.findById(practiceAnchorId)
    .select("openBankingConsent")
    .lean();
  if (!anchor) return { isLocked: false };

  const hold = anchor.openBankingConsent?.paymentHold;
  if (hold?.isHeld) {
    return {
      isLocked: true,
      reason:
        hold.reason ||
        "월 정산 자동이체가 실패해 신규 기공의뢰가 제한되었습니다. Face ID로 재이체 후 의뢰할 수 있습니다.",
      lockedAt: hold.heldAt || null,
    };
  }

  const overdue = await PracticeMonthlySettlement.findOne({
    practiceAnchorId,
    status: { $ne: "COMPLETED" },
    totalAmount: { $gt: 0 },
    scheduledTransferAt: { $lte: now },
  })
    .select({ yearMonth: 1, scheduledTransferAt: 1 })
    .lean();
  if (overdue) {
    return {
      isLocked: true,
      reason: `${overdue.yearMonth} 정산금이 입금되지 않아 신규 기공의뢰가 제한되었습니다. 입금 후 의뢰할 수 있습니다.`,
      lockedAt: overdue.scheduledTransferAt || null,
    };
  }

  const consent = anchor.openBankingConsent;
  if (consent?.status && consent.status !== "none" && consent.status !== "revoked") {
    const expiresAt = consent.expiresAt ? new Date(consent.expiresAt) : null;
    if (
      consent.status === "reauth_required" ||
      (expiresAt && expiresAt.getTime() <= now.getTime())
    ) {
      return {
        isLocked: true,
        reason:
          "오픈뱅킹 자동이체 정기 재인증(90일) 기한이 지났습니다. 생체인증(Face ID/지문) 후 의뢰할 수 있습니다.",
        lockedAt: expiresAt || now,
      };
    }
  }

  return { isLocked: false };
}
