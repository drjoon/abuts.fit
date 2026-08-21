// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// change-log:
// - 2026-08-22: skipJig 옵션 삭제(레거시). 기공소→치과 배송 무료·lab_shipping hold 미생성.
// - 2026-08-22: 기공소→치과 배송 무료(lab_shipping).
// - 2026-08-21: 치과→기공소 배송 무료(기공수가「배송비」폐지).
// - 2026-08-16: skipJig는 커스텀어벗(디자인+생산)만 있을 때만 적용. 보철 혼재 시 강제 false.(레거시)
// - 2026-08-16: 기공소 출발 배송비 차감 여부(skipJig 면제) SSOT(레거시·폐지).

import {
  isCustomAbutmentProsthesisType,
  isMissingToothProsthesisType,
} from "./labFeeSchedule.js";

/** 기공소 보철 배송이 필요한 치식. 커스텀어벗 단독·작업X 제외. */
export function toothWorkHasLabProsthesis(row) {
  const type = String(row?.prosthesisType || "").trim();
  if (!type) return false;
  if (isMissingToothProsthesisType(type)) return false;
  if (isCustomAbutmentProsthesisType(type)) return false;
  return true;
}

/**
 * @deprecated 2026-08-22 skipJig UI/옵션 삭제. 항상 false.
 * 레거시: 「지그 제작 불필요」체크(디자인+생산 CA만·보철 없음).
 */
export function canOfferPracticeTransferSkipJig() {
  return false;
}

/**
 * @deprecated 2026-08-22 skipJig 옵션 삭제. 항상 false(신규는 옵션 미적용).
 * DB `production.skipJig` 필드는 레거시 스냅샷용으로만 남을 수 있음.
 */
export function resolvePracticeTransferSkipJig() {
  return false;
}

/**
 * @deprecated 기공소→치과 배송 무료. 항상 false.
 * 레거시 lab_shipping hold는 chargePracticeTransferLabShipping에서 해제(매출 전환 없음).
 */
export function shouldChargePracticeTransferLabShipping() {
  return false;
}
