// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// change-log:
// - 2026-08-21: 치과→기공소 배송 무료. skipJig는 물류(지그)만 — 크레딧 배송과 무관.
// - 2026-08-16: skipJig는 커스텀어벗(디자인+생산)만 있을 때만 적용. 보철 혼재 시 강제 false.
// - 2026-08-16: 기공소 출발 배송비 차감 여부(skipJig 면제) SSOT(레거시).

import {
  isCustomAbutmentProsthesisType,
  isMissingToothProsthesisType,
} from "./labFeeSchedule.js";

const DESIGN_AND_PRODUCTION = "design_custom_abutment";

/** 기공소 보철 배송이 필요한 치식. 커스텀어벗 단독·작업X 제외. */
export function toothWorkHasLabProsthesis(row) {
  const type = String(row?.prosthesisType || "").trim();
  if (!type) return false;
  if (isMissingToothProsthesisType(type)) return false;
  if (isCustomAbutmentProsthesisType(type)) return false;
  return true;
}

function resolveToothAbutmentProductMode(row) {
  if (!row?.customAbutment) return "custom_abutment";
  const raw = String(row.abutmentProductMode || "").trim();
  if (raw === DESIGN_AND_PRODUCTION) return DESIGN_AND_PRODUCTION;
  return "custom_abutment";
}

/**
 * 「지그 제작 불필요」적용 가능 — 디자인+생산 CA만, 보철 없음.
 * 크레딧 배송과 무관(치과→기공소 배송 무료). 물류·생산 옵션만.
 */
export function canOfferPracticeTransferSkipJig(toothWorks) {
  const rows = Array.isArray(toothWorks) ? toothWorks.filter(Boolean) : [];
  const hasDesignProdCa = rows.some(
    (row) =>
      Boolean(row?.customAbutment) &&
      resolveToothAbutmentProductMode(row) === DESIGN_AND_PRODUCTION,
  );
  if (!hasDesignProdCa) return false;
  if (rows.some((row) => toothWorkHasLabProsthesis(row))) return false;
  return true;
}

/** 보철 혼재 시 false(지그 포함 배송). */
export function resolvePracticeTransferSkipJig(toothWorks, requestedSkipJig) {
  if (!canOfferPracticeTransferSkipJig(toothWorks)) return false;
  return !(
    requestedSkipJig === false ||
    requestedSkipJig === "false" ||
    requestedSkipJig === 0 ||
    requestedSkipJig === "0" ||
    requestedSkipJig === "N"
  );
}

/**
 * @deprecated 치과→기공소 배송 무료. 항상 false.
 * 레거시 lab_shipping hold convert는 hold journal 존재 여부로만 동작.
 */
export function shouldChargePracticeTransferLabShipping() {
  return false;
}
