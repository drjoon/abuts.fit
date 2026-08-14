// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
//
// 자동매칭 기공비 예산(min/max) SSOT.
// 성능: 적격 기공소는 전송 생성 시 1회 스냅샷(eligibleLabAnchorIds).
// 수신 목록은 Mongo multikey로만 필터하고, 수가 재계산은 하지 않는다.
// 수락 시에만 현재 기공소 수가로 예산 재검증.

import {
  computePracticeTransferRetailFees,
  isLabFeeScheduleConfigured,
  resolveLabFeeScheduleSource,
  resolveLabPracticeFeeMultiplier,
} from "./labFeeSchedule.js";
import {
  isAutoMatchEligibleLabAnchor,
  loadAutoMatchEligibleLabAnchors,
} from "./practiceTransferAutoMatch.js";
export {
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
} from "./practiceTransferAutoMatchBudgetCore.js";
import {
  isLabFeeWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
} from "./practiceTransferAutoMatchBudgetCore.js";

/**
 * 인증 기공소 중 이 치식·예산에 맞는 앵커 ID 목록.
 * 전송 생성 시에만 호출(수신 목록 핫패스에서 호출 금지).
 */
export async function resolveAutoMatchEligibleLabAnchorIds({
  toothWorks,
  budget,
  implantFavorites = [],
  practiceAnchorId = null,
}) {
  const band = normalizeAutoMatchBudget(budget);
  if (!band) {
    return { eligibleLabAnchorIds: [], labsScanned: 0, budget: null };
  }

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
      labPracticeFeeMultipliers: 1,
    },
  });

  const eligibleLabAnchorIds = [];
  for (const lab of labs) {
    if (!isAutoMatchEligibleLabAnchor(lab)) continue;
    if (!isLabFeeScheduleConfigured(lab.labFeeSchedule)) continue;

    // labFeeTotal만 예산에 사용(어벗츠 어벗 단가 abutmentRetailTotal은 제외).
    const fees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites,
      labFeeSchedule: resolveLabFeeScheduleSource(lab.labFeeSchedule),
      abutmentPricingTier: "regular",
      remake: false,
      labFeeMultiplier: resolveLabPracticeFeeMultiplier(lab, practiceAnchorId),
    });

    if (isLabFeeWithinAutoMatchBudget(fees.labFeeTotal, band)) {
      eligibleLabAnchorIds.push(lab._id);
    }
  }

  return {
    eligibleLabAnchorIds,
    labsScanned: labs.length,
    budget: band,
  };
}

/** 수신 목록용: 내 앵커가 스냅샷 적격 목록에 있는지(레거시=필드 없음 → 통과). */
export function isLabInAutoMatchEligibleSnapshot(transfer, labAnchorId) {
  const labId = String(labAnchorId || "").trim();
  if (!labId) return false;
  const ids = transfer?.autoMatch?.eligibleLabAnchorIds;
  if (!Array.isArray(ids)) return true; // 레거시 공개 풀
  if (ids.length === 0) return false;
  return ids.some((id) => String(id || "").trim() === labId);
}
