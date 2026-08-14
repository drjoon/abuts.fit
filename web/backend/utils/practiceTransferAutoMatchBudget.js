// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
//
// 자동매칭 기공비 예산 SSOT.
// 성능: 적격 기공소는 전송 생성 시 1회 스냅샷(eligibleLabAnchorIds).
// 수신 목록은 Mongo multikey로만 필터. 수락 시 항목별 단가 재검증.

import {
  isLabFeeScheduleConfigured,
  isRemovableTempProsthesisType,
  normalizeLabFeeSchedule,
  resolveLabFeeKeyFromProsthesisType,
  resolveLabFeeScheduleSource,
} from "./labFeeSchedule.js";
import {
  isAutoMatchEligibleLabAnchor,
  loadAutoMatchEligibleLabAnchors,
} from "./practiceTransferAutoMatch.js";
export {
  ADMIN_LAB_FEE_BASE,
  AUTO_MATCH_BUDGET_KEYS,
  AUTO_MATCH_BUDGET_KEY_LABELS,
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  buildScheduleFromAutoMatchBudget,
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
} from "./practiceTransferAutoMatchBudgetCore.js";
import {
  AUTO_MATCH_BUDGET_KEYS,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
} from "./practiceTransferAutoMatchBudgetCore.js";

/** 이번 치식에서 예산 검증에 필요한 스케줄 키 */
export function collectRequiredAutoMatchBudgetKeys(toothWorks) {
  const keys = new Set();
  let hasTemp = false;
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isRemovableTempProsthesisType(prosthesisType)) {
      hasTemp = true;
      continue;
    }
    const key = resolveLabFeeKeyFromProsthesisType(prosthesisType);
    if (key && AUTO_MATCH_BUDGET_KEYS.includes(key)) keys.add(key);
  }
  if (hasTemp) {
    keys.add("removableTemp3");
    keys.add("removableTemp6");
  }
  return Array.from(keys);
}

export function labUnitPricesFromSchedule(labFeeSchedule) {
  return normalizeLabFeeSchedule(resolveLabFeeScheduleSource(labFeeSchedule));
}

/**
 * 인증 기공소 중 이 치식·항목 예산에 맞는 앵커 ID 목록.
 * 전송 생성 시에만 호출(수신 목록 핫패스에서 호출 금지).
 */
export async function resolveAutoMatchEligibleLabAnchorIds({
  toothWorks,
  budget,
}) {
  const band = normalizeAutoMatchBudget(budget);
  if (!band) {
    return { eligibleLabAnchorIds: [], labsScanned: 0, budget: null };
  }

  const requiredKeys = collectRequiredAutoMatchBudgetKeys(toothWorks);
  const labs = await loadAutoMatchEligibleLabAnchors({
    select: {
      _id: 1,
      status: 1,
      businessType: 1,
      requestorKind: 1,
      requestorServices: 1,
      requestorCapabilities: 1,
      practiceTransferAutoMatchEnabled: 1,
      labFeeSchedule: 1,
    },
  });

  const eligibleLabAnchorIds = [];
  for (const lab of labs) {
    if (!isAutoMatchEligibleLabAnchor(lab)) continue;
    if (!isLabFeeScheduleConfigured(lab.labFeeSchedule)) continue;

    const unitPrices = labUnitPricesFromSchedule(lab.labFeeSchedule);
    if (
      !isLabUnitPricesWithinAutoMatchBudget(unitPrices, band, requiredKeys)
    ) {
      continue;
    }
    eligibleLabAnchorIds.push(lab._id);
  }

  return {
    eligibleLabAnchorIds,
    labsScanned: labs.length,
    budget: band,
  };
}

/** 수락 시: 현재 기공소 단가가 스냅샷 예산 안인지 */
export function assertLabWithinAutoMatchBudget({
  toothWorks,
  budget,
  labFeeSchedule,
}) {
  const band = normalizeAutoMatchBudget(budget);
  if (!band) return { ok: true };
  const requiredKeys = collectRequiredAutoMatchBudgetKeys(toothWorks);
  const unitPrices = labUnitPricesFromSchedule(labFeeSchedule);
  if (isLabUnitPricesWithinAutoMatchBudget(unitPrices, band, requiredKeys)) {
    return { ok: true, budget: band, requiredKeys, unitPrices };
  }
  return {
    ok: false,
    budget: band,
    requiredKeys,
    unitPrices,
    reason: "auto_match_budget_mismatch",
  };
}

/** 수신 목록용: 내 앵커가 스냅샷 적격 목록에 있는지(레거시=필드 없음 → 통과). */
export function isLabInAutoMatchEligibleSnapshot(transfer, labAnchorId) {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;
  const ids = transfer?.autoMatch?.eligibleLabAnchorIds;
  if (!Array.isArray(ids)) return true;
  if (ids.length === 0) return false;
  return ids.some((id) => String(id || "").trim() === labId);
}
