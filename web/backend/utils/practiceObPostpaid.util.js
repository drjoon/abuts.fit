// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/services/requestCreditHold.service.js
// - web/backend/utils/creditLock.util.js
// - rules.md (치과 OB 후불 SSOT)
import BusinessAnchor from "../models/businessAnchor.model.js";

/**
 * 치과 기공의뢰·PTX 어벗·어벗츠로 커스텀어벗 — OB 장기동의 활성 + paymentHold 없으면
 * 월 후불(마이너스 허용). 90일 재인증 만료는 신규 PTX 잠금(checkPracticeSettlementLock)으로만 막는다.
 */
export async function isPracticeObPostpaidActive(practiceAnchorId) {
  const id = String(practiceAnchorId || "").trim();
  if (!id) return false;
  const anchor = await BusinessAnchor.findById(id)
    .select({ openBankingConsent: 1, requestorKind: 1 })
    .lean();
  if (!anchor) return false;
  if (String(anchor.requestorKind || "").trim() === "lab") return false;
  const consent = anchor.openBankingConsent;
  return consent?.status === "active" && !consent?.paymentHold?.isHeld;
}
