// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/services/requestCreditHold.service.js
// - web/backend/utils/creditLock.util.js
// - web/backend/utils/practiceObBeta.util.js
// - rules.md (치과 OB 후불 SSOT)
import BusinessAnchor from "../models/businessAnchor.model.js";
import { isPracticeObLaunchBetaActive } from "./practiceObBeta.util.js";

/**
 * 치과 기공료·스토어는 계좌 자동이체 없이 후불이다.
 * 미입금 정지는 `checkPracticeSettlementLock`(2차 기한 다음 날)만 담당한다.
 * 기공소는 베타 중 후불 없음. 베타가 꺼져 있고 장기동의가 있을 때만 기존 overdraft.
 */
export function isPracticeObPostpaidActiveFromAnchor(anchor) {
  if (!anchor) return false;
  const kind = String(anchor.requestorKind || "").trim();
  if (kind !== "lab") return true;
  if (isPracticeObLaunchBetaActive()) return false;
  const consent = anchor.openBankingConsent;
  return consent?.status === "active" && !consent?.paymentHold?.isHeld;
}

export async function isPracticeObPostpaidActive(practiceAnchorId) {
  const id = String(practiceAnchorId || "").trim();
  if (!id) return false;
  const anchor = await BusinessAnchor.findById(id)
    .select({ openBankingConsent: 1, requestorKind: 1, name: 1, profile: 1 })
    .lean();
  if (!anchor) return false;
  return isPracticeObPostpaidActiveFromAnchor(anchor);
}

/** 치과 PTX·기공비 후불만. 기공소 Request CA는 선충전 검사 유지. */
export async function isPracticeOnlyObPostpaidActive(anchorId) {
  const id = String(anchorId || "").trim();
  if (!id) return false;
  const anchor = await BusinessAnchor.findById(id)
    .select({ requestorKind: 1 })
    .lean();
  if (String(anchor?.requestorKind || "").trim() === "lab") return false;
  return isPracticeObPostpaidActive(id);
}
