// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/services/requestCreditHold.service.js
// - web/backend/utils/creditLock.util.js
// - web/backend/utils/practiceObBeta.util.js
// - rules.md (치과 OB 후불 SSOT)
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  isPracticeBetaUnlimitedPostpaid,
  isPracticeObLaunchBetaActive,
} from "./practiceObBeta.util.js";

/**
 * 의뢰 발신자(치과·기공소) OB 후불 활성 — 장기동의 active + paymentHold 없으면 마이너스 허용.
 * PTX·Request hold·`allocateLabFeeAndAbutmentSpend` overdraft SSOT.
 * 90일 재인증 만료는 치과 신규 PTX 잠금(`checkPracticeSettlementLock`)으로만 막는다.
 * 베타(`PRACTICE_OB_LAUNCH_BETA`): 테스트치과만 OB 필수, 그 외 치과는 OB 없이 overdraft.
 * 베타 종료: 치과·기공소 모두 OB active일 때만 후불.
 */
export async function isPracticeObPostpaidActive(practiceAnchorId) {
  const id = String(practiceAnchorId || "").trim();
  if (!id) return false;
  if (await isPracticeBetaUnlimitedPostpaid(id)) return true;
  const anchor = await BusinessAnchor.findById(id)
    .select({ openBankingConsent: 1, requestorKind: 1 })
    .lean();
  if (!anchor) return false;
  const kind = String(anchor.requestorKind || "").trim();
  if (kind === "lab" && isPracticeObLaunchBetaActive()) return false;
  const consent = anchor.openBankingConsent;
  return consent?.status === "active" && !consent?.paymentHold?.isHeld;
}
