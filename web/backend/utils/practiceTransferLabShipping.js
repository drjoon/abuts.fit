// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// change-log:
// - 2026-08-16: skipJig는 커스텀어벗(디자인+생산)만 있을 때만 적용. 보철 혼재 시 강제 false.
// - 2026-08-16: 기공소 출발 배송비 차감 여부(skipJig 면제) SSOT.

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
 * 기공소 출발 배송비 차감 여부.
 * - 기공 보철/기공소어벗이 있으면 차감
 * - CA 디자인+지그(!skipJig, abutmentQty>0)면 차감
 * - skipJig 이고 기공 보철이 없으면 면제
 */
export function shouldChargePracticeTransferLabShipping({
  transfer,
  fees = null,
}) {
  const skipJig = Boolean(transfer?.production?.skipJig);
  const labFeeTotal = Math.max(
    0,
    Math.round(
      Number(fees?.labFeeTotal ?? transfer?.billing?.labFeeTotal ?? 0) || 0,
    ),
  );
  const labAbutmentTotal = Math.max(
    0,
    Math.round(Number(fees?.labAbutmentTotal ?? 0) || 0),
  );
  const abutmentQty = Math.max(
    0,
    Math.round(
      Number(fees?.abutmentQty ?? transfer?.billing?.abutmentQty ?? 0) || 0,
    ),
  );
  const hasLabProsthesis = labFeeTotal > 0 || labAbutmentTotal > 0;
  if (hasLabProsthesis) return true;
  if (abutmentQty > 0 && !skipJig) return true;
  return false;
}
