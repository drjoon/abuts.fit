// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/backend/utils/abutsLabFeeSchedule.js
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/practiceLabRating.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
//
// 자동매칭 기공비 예산 SSOT.
// 성능: 적격 기공소는 전송 생성 시 1회 스냅샷(eligibleLabAnchorIds).
// 수신 목록은 Mongo multikey로만 필터. 수락 시 항목별 단가 재검증.
// 적격 스냅샷: 생성 시점 live 할증 반영 단가. 수락: 의뢰 createdAt 기준 할증
// (할증 updatedAt이 의뢰 이후면 해당 건 미적용 — 상세 채팅에서 올린 할증 소급 금지).
// 항목 목록은 어벗츠 수가(시스템 카탈로그)에서 동적으로 온다.

import {
  isLabFeeScheduleConfigured,
  isMissingToothProsthesisType,
  isCustomAbutmentProsthesisType,
  isRemovableTempProsthesisType,
  isRemovableTempFeeName,
  canonicalizeFeeItemName,
  legacyLabFeeScheduleFromItems,
  normalizeLabFeeItems,
  normalizeLabFeeMultiplier,
  normalizeLabFeeSchedule,
  resolveLabFeeKeyFromProsthesisType,
  resolveLabFeeScheduleSource,
  resolveLabPracticeFeeMultiplier,
} from "./labFeeSchedule.js";
import {
  loadAbutsLabFeeSchedule,
  listEnabledAbutsLabFeeCatalogItems,
} from "./abutsLabFeeSchedule.js";
import {
  isAutoMatchEligibleLabAnchor,
  loadAutoMatchEligibleLabAnchors,
} from "./practiceTransferAutoMatch.js";
import { isLabBlockedByPracticeRating } from "./practiceLabRating.js";
import {
  ADMIN_LAB_FEE_BASE,
  AUTO_MATCH_BUDGET_KEYS,
  AUTO_MATCH_BUDGET_KEY_LABELS,
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  buildItemsScheduleFromAutoMatchBudget,
  buildScheduleFromAutoMatchBudget,
  fallbackAbutsLabFeeCatalog,
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  normalizeCatalogItems,
  resolveAutoMatchBudgetOrDefaults,
  scaleLabUnitPricesByMultiplier,
} from "./practiceTransferAutoMatchBudgetCore.js";

export {
  ADMIN_LAB_FEE_BASE,
  AUTO_MATCH_BUDGET_KEYS,
  AUTO_MATCH_BUDGET_KEY_LABELS,
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  buildItemsScheduleFromAutoMatchBudget,
  buildScheduleFromAutoMatchBudget,
  fallbackAbutsLabFeeCatalog,
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  normalizeCatalogItems,
  resolveAutoMatchBudgetOrDefaults,
  scaleLabUnitPricesByMultiplier,
};

/** 어벗츠 수가 enabled 항목(자동매칭 모달·예산 기본값 SSOT) */
export async function loadAutoMatchBudgetCatalog() {
  const schedule = await loadAbutsLabFeeSchedule();
  return listEnabledAbutsLabFeeCatalogItems(schedule);
}

/** @deprecated 레거시 키 수집 — 카탈로그 id 경로 우선 */
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

/** 치식에 필요한 카탈로그 항목 id */
export function collectRequiredAutoMatchBudgetIds(toothWorks, catalog) {
  const rows = normalizeCatalogItems(catalog);
  if (!rows.length) return collectRequiredAutoMatchBudgetKeys(toothWorks);

  const ids = new Set();
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;
    if (isCustomAbutmentProsthesisType(prosthesisType)) continue;

    if (isRemovableTempProsthesisType(prosthesisType)) {
      for (const item of rows) {
        if (isRemovableTempFeeName(item.name)) ids.add(item.id);
      }
      continue;
    }

    const canon = canonicalizeFeeItemName(prosthesisType);
    for (const item of rows) {
      if (canonicalizeFeeItemName(item.name) === canon) ids.add(item.id);
    }
  }
  return Array.from(ids);
}

function catalogItemTierN(item) {
  const n = Number(item?.tiers?.[0]?.n);
  if (Number.isFinite(n) && n > 0) return n;
  const id = String(item?.id || "");
  if (id.includes("6")) return 6;
  if (id.includes("3")) return 3;
  return null;
}

/** 기공소 수가 → 카탈로그 id별 단가 */
export function labUnitPricesByCatalogId(labFeeSchedule, catalog) {
  const labItems = normalizeLabFeeItems(
    resolveLabFeeScheduleSource(labFeeSchedule),
  );
  const prices = {};
  for (const cat of normalizeCatalogItems(catalog)) {
    prices[cat.id] = resolveLabUnitPriceForCatalogItem(labItems, cat);
  }
  return prices;
}

function resolveLabUnitPriceForCatalogItem(labItems, cat) {
  const list = Array.isArray(labItems) ? labItems : [];
  if (cat.unit === "perNTeeth" || isRemovableTempFeeName(cat.name)) {
    const wantN = catalogItemTierN(cat);
    const matches = list.filter(
      (item) =>
        item.enabled !== false && isRemovableTempFeeName(item.name),
    );
    for (const item of matches) {
      if (item.unit === "perNTeeth" && item.tiers?.length) {
        const tier =
          (wantN
            ? item.tiers.find((t) => Number(t.n) === wantN)
            : null) || item.tiers[0];
        if (tier) return Math.max(0, Math.round(Number(tier.price) || 0));
      }
      if (wantN == null || Number(item.tiers?.[0]?.n) === wantN) {
        return Math.max(0, Math.round(Number(item.price) || 0));
      }
    }
    return 0;
  }

  const canon = canonicalizeFeeItemName(cat.name);
  const match = list.find(
    (item) =>
      item.enabled !== false &&
      canonicalizeFeeItemName(item.name) === canon,
  );
  if (!match) return 0;
  if (match.unit === "perNTeeth" && match.tiers?.[0]) {
    return Math.max(0, Math.round(Number(match.tiers[0].price) || 0));
  }
  return Math.max(0, Math.round(Number(match.price) || 0));
}

/** @deprecated 레거시 키 단가 맵 */
export function labUnitPricesFromSchedule(labFeeSchedule) {
  const src = resolveLabFeeScheduleSource(labFeeSchedule);
  const items = normalizeLabFeeItems(src);
  const { schedule } = legacyLabFeeScheduleFromItems(items, src);
  const flat = normalizeLabFeeSchedule(schedule);
  const legacy = {};
  for (const key of AUTO_MATCH_BUDGET_KEYS) {
    legacy[key] = Math.max(0, Math.round(Number(flat[key]) || 0));
  }
  return legacy;
}

/**
 * 인증 기공소 중 이 치식·항목 예산에 맞는 앵커 ID 목록.
 * 전송 생성 시에만 호출(수신 목록 핫패스에서 호출 금지).
 */
export async function resolveAutoMatchEligibleLabAnchorIds({
  toothWorks,
  budget,
  catalog,
  practiceAnchorId = null,
  practiceLabRatings = null,
  autoMatchMinLabRating = 1,
} = {}) {
  const catalogItems =
    catalog != null
      ? normalizeCatalogItems(catalog)
      : await loadAutoMatchBudgetCatalog();
  const band = normalizeAutoMatchBudget(budget, catalogItems);
  if (!band) {
    return { eligibleLabAnchorIds: [], labsScanned: 0, budget: null };
  }

  const requiredIds = collectRequiredAutoMatchBudgetIds(
    toothWorks,
    catalogItems,
  );
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

    if (
      isLabBlockedByPracticeRating({
        ratings: practiceLabRatings,
        labAnchorId: lab._id,
        minStars: autoMatchMinLabRating,
      })
    ) {
      continue;
    }

    // 생성 시점 live 할증 반영(이미 적용 중인 할증만 적격에 반영).
    const multiplier = resolveLabPracticeFeeMultiplier(lab, practiceAnchorId);
    const unitPrices = scaleLabUnitPricesByMultiplier(
      labUnitPricesByCatalogId(lab.labFeeSchedule, catalogItems),
      multiplier,
    );
    if (
      !isLabUnitPricesWithinAutoMatchBudget(
        unitPrices,
        band,
        requiredIds,
        catalogItems,
      )
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

/** 수락 시: 의뢰시점 할증 반영 기공소 단가가 스냅샷 예산 안인지 */
export function assertLabWithinAutoMatchBudget({
  toothWorks,
  budget,
  labFeeSchedule,
  labFeeMultiplier = 1,
  catalog,
}) {
  const catalogItems = normalizeCatalogItems(catalog);
  const band = normalizeAutoMatchBudget(budget, catalogItems);
  if (!band) return { ok: true };
  const requiredIds = collectRequiredAutoMatchBudgetIds(
    toothWorks,
    catalogItems,
  );
  const unitPrices = scaleLabUnitPricesByMultiplier(
    labUnitPricesByCatalogId(labFeeSchedule, catalogItems),
    labFeeMultiplier,
  );
  if (
    isLabUnitPricesWithinAutoMatchBudget(
      unitPrices,
      band,
      requiredIds,
      catalogItems,
    )
  ) {
    return {
      ok: true,
      budget: band,
      requiredKeys: requiredIds,
      unitPrices,
      labFeeMultiplier: normalizeLabFeeMultiplier(labFeeMultiplier),
    };
  }
  return {
    ok: false,
    budget: band,
    requiredKeys: requiredIds,
    unitPrices,
    labFeeMultiplier: normalizeLabFeeMultiplier(labFeeMultiplier),
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
