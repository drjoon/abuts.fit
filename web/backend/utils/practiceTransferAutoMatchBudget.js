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
// 적격·수락 예산 게이트: 공개 수가(할증 제외). 치과별 할증은 청구에만 반영.
// 의뢰 이후 올린 할증은 as-of로 해당 건 미적용(상세 채팅 소급 금지).
// 항목 목록은 어벗츠 수가(시스템 카탈로그=인증 기공소 평균)에서 동적으로 온다.
// 치과 설정은 min%/max%(기본 80~120). 항목 원 구간은 카탈로그×%로 전개.
// - 2026-08-15: 자동매칭 예산 필터에서 practice 할증 제외(공개 수가 기준).
// - 2026-08-16: 별점 게이트는 전체 치과 평가 합산·평균.
// - 2026-08-16: 자동매칭 최소 별 기본값 2.
// - 2026-08-16: 주문 치과 1점 기공소는 해당 치과 자동매칭에서 제외.
// - 2026-08-16: 예산 UI/저장을 minPct·maxPct로 단순화(기본 80%~120%).

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
} from "./labFeeSchedule.js";
import {
  loadAbutsLabFeeSchedule,
  listEnabledAbutsLabFeeCatalogItems,
} from "./abutsLabFeeSchedule.js";
import cache, { CacheKeys, CacheTTL } from "./cache.utils.js";
import {
  isAutoMatchEligibleLabAnchor,
  loadAutoMatchEligibleLabAnchors,
} from "./practiceTransferAutoMatch.js";
import {
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  isLabBlockedByPracticeRating,
  loadGlobalLabRatingAggregates,
} from "./practiceLabRating.js";
import {
  ADMIN_LAB_FEE_BASE,
  AUTO_MATCH_BUDGET_KEYS,
  AUTO_MATCH_BUDGET_KEY_LABELS,
  DEFAULT_MAX_PCT,
  DEFAULT_MIN_PCT,
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  buildItemsScheduleFromAutoMatchBudget,
  buildScheduleFromAutoMatchBudget,
  fallbackAbutsLabFeeCatalog,
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  normalizeAutoMatchBudgetPct,
  normalizeCatalogItems,
  resolveAutoMatchBudgetOrDefaults,
  scaleLabUnitPricesByMultiplier,
} from "./practiceTransferAutoMatchBudgetCore.js";

export {
  ADMIN_LAB_FEE_BASE,
  AUTO_MATCH_BUDGET_KEYS,
  AUTO_MATCH_BUDGET_KEY_LABELS,
  DEFAULT_MAX_PCT,
  DEFAULT_MIN_PCT,
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  buildItemsScheduleFromAutoMatchBudget,
  buildScheduleFromAutoMatchBudget,
  fallbackAbutsLabFeeCatalog,
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  normalizeAutoMatchBudgetPct,
  normalizeCatalogItems,
  resolveAutoMatchBudgetOrDefaults,
  scaleLabUnitPricesByMultiplier,
};

/** 어벗츠 수가 enabled 항목(자동매칭 모달·예산 기본값 SSOT). 전송 핫패스용 캐시. */
export async function loadAutoMatchBudgetCatalog() {
  return cache.getOrSet(
    CacheKeys.abutsLabFeeCatalog(),
    async () => {
      const schedule = await loadAbutsLabFeeSchedule();
      return listEnabledAbutsLabFeeCatalogItems(schedule);
    },
    CacheTTL.LONG,
  );
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
 * 예산 비교는 공개 수가만(치과별 할증 제외).
 * 별점 게이트는 주문 치과만이 아니라 전체 치과 평가 합산·평균.
 */
export async function resolveAutoMatchEligibleLabAnchorIds({
  toothWorks,
  budget,
  catalog,
  autoMatchMinLabRating = DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  practiceLabRatings = null,
} = {}) {
  const catalogItems =
    catalog != null
      ? normalizeCatalogItems(catalog)
      : await loadAutoMatchBudgetCatalog();
  const band = normalizeAutoMatchBudget(budget, catalogItems);
  if (!band) {
    return {
      eligibleLabAnchorIds: [],
      priorityLabAnchorIds: [],
      labsScanned: 0,
      budget: null,
      skipped: { noBudget: true, feeUnconfigured: 0, rating: 0, budget: 0 },
    };
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
    },
  });

  const globalRatings = await loadGlobalLabRatingAggregates({
    labAnchorIds: labs.map((lab) => lab._id),
  });

  const eligibleLabAnchorIds = [];
  const priorityLabAnchorIds = [];
  const skipped = { feeUnconfigured: 0, rating: 0, budget: 0 };
  for (const lab of labs) {
    if (!isAutoMatchEligibleLabAnchor(lab)) continue;
    if (!isLabFeeScheduleConfigured(lab.labFeeSchedule)) {
      skipped.feeUnconfigured += 1;
      continue;
    }

    if (
      isLabBlockedByPracticeRating({
        ratings: practiceLabRatings,
        aggregated: globalRatings,
        labAnchorId: lab._id,
        minStars: autoMatchMinLabRating,
      })
    ) {
      skipped.rating += 1;
      continue;
    }

    const unitPrices = labUnitPricesByCatalogId(
      lab.labFeeSchedule,
      catalogItems,
    );
    if (
      !isLabUnitPricesWithinAutoMatchBudget(
        unitPrices,
        band,
        requiredIds,
        catalogItems,
      )
    ) {
      skipped.budget += 1;
      continue;
    }
    eligibleLabAnchorIds.push(lab._id);
    if (String(lab.businessType || "").trim() === "internalLab") {
      priorityLabAnchorIds.push(lab._id);
    }
  }

  return {
    eligibleLabAnchorIds,
    priorityLabAnchorIds,
    labsScanned: labs.length,
    budget: band,
    skipped,
  };
}

/** 수락 시: 공개 수가가 스냅샷 예산 안인지(할증 제외 — 청구는 별도) */
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
