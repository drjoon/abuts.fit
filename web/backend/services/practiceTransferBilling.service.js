// related files:
// - web/backend/rules.md
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/utils/labTradingPartner.util.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - 2026-08-14: 목록 견적 조회(devops/단가/기공소/거래처) parallel + 60s 캐시.
// - 2026-08-14: quote-context에 abutmentPrices 포함. 환봉 단가가 치과 견적에 전달.
// - 2026-08-14: quote-context — 기공소/티어/단가/거래처/수수료율 parallel + 60s 캐시(5회 직렬 RTT 제거).
// - 2026-08-14: 환봉 요청중 판별용 치과 implantFavorites를 견적·청구 계산에 전달.
// - 2026-08-14: 치과별 기공수가 할증(labPracticeFeeMultipliers → labFeeMultiplier).
// - 2026-08-14: 지정 기공소: 생성 시 billing.labFeeMultiplier 스냅샷(할증 소급 금지).
// - 2026-08-14: 자동매칭: 치과별 할증 사용. 할증 updatedAt > 의뢰 createdAt 이면 해당 건 미적용.
// - 2026-08-14: 자동매칭 수락 예산 검증은 공개 수가(할증 제외). 할증은 청구에만.
// - 2026-08-15: 지정·수락된 자동매칭 견적은 billing 스냅샷. 공개풀만 as-of(history).
// - 2026-08-15: 전송 전 잔액검사 — catalog 재사용·어벗 단가 캐시·조회 병렬화.
// - 2026-08-16: mark-complete 경로 — release 저널/수수료 parallel, resolveRevenueOwners parallel.
// - 2026-08-16: chargePracticeTransferLabShipping — 기공소 출발 배송비(지그 면제).
// - 2026-08-15: 청구 완료 목록 견적에 autoMatchBudget 재부착 금지(확정 기공비 유지).
// - 2026-08-16: 자동매칭 수신 견적 — 공개풀·시청 기공소여도 v4 고정수가·autoMatchBudget 유지.
// - 2026-08-16: 자동매칭 수락·기공소 수신 견적 — 유효 별점 배수 확정가(상한 대역 아님).
// - 2026-08-16: billed 확정 견적 — labFeeMin/예산 구간 제거·수락 기공소 별점 단일가.
// - 2026-08-16: 기공소 수신 billed — 스냅샷이 구 상한가여도 라인·labFeeTotal을 별점 확정가로 맞춤.
// - 2026-08-17: rollbackPracticeTransferBilling — 배송·디자인비 ADJUST·refId 스윕 포함. 잔액 emit.
// - 2026-08-17: 보류/해제 기공소몫·어벗츠몫 분리. 기공소 발송=lab share, 제조사 발송=abutment. 기공소 수수료 차감.
import mongoose, { Types } from "mongoose";
import CreditBalanceGuard from "../models/creditBalanceGuard.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import {
  allocateSpendFromCreditBuckets,
  computeBusinessCreditBalanceFromLedger,
  spendShippingCreditAtomic,
  upsertBusinessCreditBalanceFromLedger,
} from "./creditBalance.service.js";
import {
  postGeneralLedgerJournal,
  getJournalByIdempotencyKey,
  deleteGeneralLedgerCommitJournal,
} from "./generalLedger.service.js";
import {
  resolveRevenueOwnerBaseAllocation,
  splitRevenueByCreditKindProRata,
  resolveConfiguredRevenueRates,
  resolvePracticeTransferFeeRate,
} from "./creditRevenuePolicy.service.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  computePracticeTransferRetailFees,
  LAB_FEE_SCHEDULE_ZEROS,
  attachLabFeeMinToLines,
  isLabFeeScheduleConfigured,
  normalizeLabFeeItems,
  normalizeLabFeeMultiplier,
  normalizeLabFeeRemakeSchedule,
  normalizeLabFeeSchedule,
  resolveAbutsAbutmentPricingTier,
  resolveLabFeeScheduleSource,
  resolveLabPracticeFeeMultiplier,
  resolveLabPracticeFeeMultiplierAsOf,
  splitPracticeTransferSettlement,
} from "../utils/labFeeSchedule.js";
import {
  applySpecialRequestorPricesToCreditSettings,
  loadCreditSettingsDefaults,
} from "../utils/creditSettingsDefaults.js";
import { normalizeAbutsAbutmentCreditPrices } from "../utils/abutsAbutmentService.js";
import LabTradingPartner from "../models/labTradingPartner.model.js";
import { findLabPracticeRelationship } from "../utils/labTradingPartner.util.js";
import { isAutoMatchOpenPool } from "../utils/practiceTransferAutoMatch.js";
import {
  assertLabWithinAutoMatchBudget,
  buildScheduleFromAutoMatchBudget,
  buildScheduleFromAutoMatchBudgetAtStars,
  loadAutoMatchBudgetCatalog,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
} from "../utils/practiceTransferAutoMatchBudget.js";
import {
  DEFAULT_EFFECTIVE_LAB_STARS,
  loadGlobalLabRatingAggregates,
  toLabRatingSummaryApi,
} from "../utils/practiceLabRating.js";
import { shouldChargePracticeTransferLabShipping } from "../utils/practiceTransferLabShipping.js";
import {
  getRequestPerfCacheValue,
  invalidateRequestPerfCacheByPrefix,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "./requestDashboardCache.service.js";

export { shouldChargePracticeTransferLabShipping };

const QUOTE_LOOKUP_CACHE_TTL_MS = 60 * 1000;

/** 자동매칭 확정수가용 기공소 유효 별점. */
async function resolveLabEffectiveStarsForFee(labAnchorId) {
  const labId = String(labAnchorId || "").trim();
  if (!labId || !Types.ObjectId.isValid(labId)) {
    return DEFAULT_EFFECTIVE_LAB_STARS;
  }
  const map = await loadGlobalLabRatingAggregates({ labAnchorIds: [labId] });
  return toLabRatingSummaryApi(map.get(labId)).effectiveStars;
}

/** 자동매칭 수락·수신 견적 — 기공소 별점 확정 스케줄(상한 대역 아님). */
function buildAutoMatchFeeScheduleForLab({
  budget,
  catalog,
  labEffectiveStars,
}) {
  const normalized =
    normalizeAutoMatchBudget(budget, catalog) || budget || null;
  if (!normalized) return null;
  return buildScheduleFromAutoMatchBudgetAtStars(
    normalized,
    labEffectiveStars ?? DEFAULT_EFFECTIVE_LAB_STARS,
    catalog,
  );
}

async function loadCachedDevopsPayoutRates() {
  const cacheKey = "practice-transfer:devops-payout";
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached && typeof cached === "object" && "payoutRates" in cached) {
    return cached.payoutRates;
  }
  return withRequestPerfInFlight(cacheKey, async () => {
    const devops = await BusinessAnchor.findOne({ businessType: "devops" })
      .select({ payoutRates: 1 })
      .sort({ createdAt: 1 })
      .lean();
    const payoutRates = devops?.payoutRates || null;
    setRequestPerfCacheValue(
      cacheKey,
      { payoutRates },
      QUOTE_LOOKUP_CACHE_TTL_MS,
    );
    return payoutRates;
  });
}

async function loadCachedAbutmentCreditPrices(practiceAnchorId = null) {
  const practiceId = String(practiceAnchorId || "").trim();
  const cacheKey = practiceId
    ? `practice-transfer:abutment-prices:${practiceId}`
    : "practice-transfer:abutment-prices";
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached) return cached;
  return withRequestPerfInFlight(cacheKey, async () => {
    const prices = await loadAbutmentCreditPrices(practiceId || null);
    setRequestPerfCacheValue(cacheKey, prices, QUOTE_LOOKUP_CACHE_TTL_MS);
    return prices;
  });
}

async function loadAbutmentCreditPrices(practiceAnchorId = null) {
  try {
    const settings = await loadCreditSettingsDefaults();
    const withSpecial = practiceAnchorId
      ? applySpecialRequestorPricesToCreditSettings(settings, practiceAnchorId)
      : settings;
    return normalizeAbutsAbutmentCreditPrices(withSpecial);
  } catch {
    return normalizeAbutsAbutmentCreditPrices();
  }
}

async function lockGuard(businessAnchorId, session) {
  const id = new Types.ObjectId(String(businessAnchorId));
  await CreditBalanceGuard.updateOne(
    { businessAnchorId: id },
    {
      $inc: { version: 1 },
      $setOnInsert: { businessAnchorId: id },
    },
    { upsert: true, session },
  );
}

export function isPracticeTransferRemake(doc) {
  const remake = doc?.remake && typeof doc.remake === "object" ? doc.remake : {};
  return Boolean(
    remake.sourceTransferMongoId ||
      String(remake.sourceTransferId || "").trim() ||
      doc?.billing?.isRemake,
  );
}

export function toRemakeApiFields(doc) {
  const remake = doc?.remake && typeof doc.remake === "object" ? doc.remake : {};
  const sourceTransferId = String(remake.sourceTransferId || "").trim();
  const sourceTransferMongoId = String(remake.sourceTransferMongoId || "").trim();
  const isRemake = Boolean(
    sourceTransferId || sourceTransferMongoId || doc?.billing?.isRemake,
  );
  return {
    isRemake,
    remake: isRemake
      ? {
          sourceTransferId: sourceTransferId || null,
          sourceTransferMongoId: sourceTransferMongoId || null,
          requestedAt: remake.requestedAt || null,
        }
      : null,
  };
}

async function resolvePracticeAbutmentPricingTier(
  practiceAnchorId,
  session = null,
) {
  const id = String(practiceAnchorId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return "regular";

  const load = async () => {
    const practice = await BusinessAnchor.findById(id)
      .select({ practiceMembershipActive: 1 })
      .session(session || null)
      .lean();
    return resolveAbutsAbutmentPricingTier({
      practiceMembershipActive: Boolean(practice?.practiceMembershipActive),
    });
  };

  if (session) return load();

  const cacheKey = `practice-transfer:abutment-tier:${id}`;
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached === "regular" || cached === "membership") return cached;
  return withRequestPerfInFlight(cacheKey, async () => {
    const tier = await load();
    setRequestPerfCacheValue(cacheKey, tier, QUOTE_LOOKUP_CACHE_TTL_MS);
    return tier;
  });
}

async function resolveRevenueOwners({ practiceAnchorId, session }) {
  // Atlas RTT: BA 조회 4건을 한 파도로 묶는다.
  const [practice, devops, manufacturer, admin] = await Promise.all([
    BusinessAnchor.findById(practiceAnchorId)
      .select({ referredByAnchorId: 1 })
      .session(session || null)
      .lean(),
    BusinessAnchor.findOne({ businessType: "devops" })
      .select({ _id: 1, payoutRates: 1 })
      .sort({ createdAt: 1 })
      .session(session || null)
      .lean(),
    BusinessAnchor.findOne({
      businessType: "manufacturer",
    })
      .select({ _id: 1 })
      .sort({ createdAt: 1 })
      .session(session || null)
      .lean(),
    BusinessAnchor.findOne({ businessType: "admin" })
      .select({ _id: 1 })
      .sort({ createdAt: 1 })
      .session(session || null)
      .lean(),
  ]);

  let salesmanAnchorId = null;
  let hasSalesmanReferrer = false;
  const referredId = String(practice?.referredByAnchorId || "").trim();
  if (referredId && Types.ObjectId.isValid(referredId)) {
    const referred = await BusinessAnchor.findById(referredId)
      .select({ businessType: 1 })
      .session(session || null)
      .lean();
    if (String(referred?.businessType || "") === "salesman") {
      salesmanAnchorId = referredId;
      hasSalesmanReferrer = true;
    }
  }

  return {
    requestorAnchorId: String(practiceAnchorId),
    manufacturerAnchorId: manufacturer?._id ? String(manufacturer._id) : null,
    devopsAnchorId: devops?._id ? String(devops._id) : null,
    salesmanAnchorId,
    adminAnchorId: admin?._id ? String(admin._id) : null,
    hasSalesmanReferrer,
    configuredRates: resolveConfiguredRevenueRates(devops?.payoutRates),
  };
}

function pushRevenueLines({
  lines,
  owners,
  spendAmount,
  freeAmount = 0,
  fromFreeRequest = 0,
  fromFreeShipping = 0,
  refType,
  refId,
  meta,
}) {
  if (spendAmount <= 0) return;
  const freeTotal = Math.max(0, Math.round(Number(freeAmount || 0)));
  const freeReq = Math.max(0, Math.round(Number(fromFreeRequest || 0)));
  const freeShip = Math.max(0, Math.round(Number(fromFreeShipping || 0)));
  const freeSourceTotal = freeReq + freeShip;

  const revenueBaseByOwner = resolveRevenueOwnerBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
    owners,
    isShippingSpend: false,
  });
  const revenueKindSplit = splitRevenueByCreditKindProRata({
    ownerBaseByRole: revenueBaseByOwner,
    freeAmount: freeTotal,
  });

  const push = (accountCode, ownerRole, ownerId, paidBase, freeBase) => {
    if (!ownerId) return;
    const paid = Math.max(0, Math.round(Number(paidBase || 0)));
    const free = Math.max(0, Math.round(Number(freeBase || 0)));
    let freeRequestPart = 0;
    let freeShippingPart = 0;
    if (free > 0) {
      if (freeSourceTotal <= 0 || freeReq <= 0) {
        freeShippingPart = freeShip > 0 ? free : 0;
        freeRequestPart = freeShip > 0 ? 0 : free;
      } else if (freeShip <= 0) {
        freeRequestPart = free;
      } else {
        freeRequestPart = Math.round((free * freeReq) / freeSourceTotal);
        freeShippingPart = Math.max(0, free - freeRequestPart);
      }
    }

    if (freeRequestPart > 0) {
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: freeRequestPart,
        amountExcludingVat: freeRequestPart,
        vatAmount: 0,
        amountIncludingVat: freeRequestPart,
        creditKind: "FREE_REQUEST",
        refType,
        refId,
        meta,
      });
    }
    if (freeShippingPart > 0) {
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: freeShippingPart,
        amountExcludingVat: freeShippingPart,
        vatAmount: 0,
        amountIncludingVat: freeShippingPart,
        creditKind: "FREE_SHIPPING",
        refType,
        refId,
        meta,
      });
    }
    if (paid > 0) {
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: paid,
        amountExcludingVat: paid,
        vatAmount: 0,
        amountIncludingVat: paid,
        creditKind: "PAID",
        refType,
        refId,
        meta,
      });
    }
  };

  push(
    "REV_MANUFACTURER",
    "manufacturer",
    owners.manufacturerAnchorId,
    revenueKindSplit.manufacturer?.paid,
    revenueKindSplit.manufacturer?.free,
  );
  push(
    "REV_DEVOPS",
    "devops",
    owners.devopsAnchorId,
    revenueKindSplit.devops?.paid,
    revenueKindSplit.devops?.free,
  );
  push(
    "REV_SALESMAN",
    "salesman",
    owners.salesmanAnchorId,
    revenueKindSplit.salesman?.paid,
    revenueKindSplit.salesman?.free,
  );
  push(
    "REV_ADMIN",
    "admin",
    owners.adminAnchorId,
    revenueKindSplit.admin?.paid,
    revenueKindSplit.admin?.free,
  );
}

/**
 * 기공의뢰 전송 전 치과 유료크레딧 잔액 검사(차감 없음).
 * 자동매칭: 기공비는 별점 고정수가(평균×배수)+어벗츠 어벗으로 검사. 청구도 동일 고정가.
 */
export async function assertPracticeTransferPaidCreditSufficient({
  practiceAnchorId,
  labAnchorId = null,
  toothWorks,
  remake = false,
  autoMatchBudget = null,
  catalog: catalogInput = null,
}) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId || !Types.ObjectId.isValid(practiceId)) {
    const err = new Error("치과 사업자 정보가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  let labFeeSchedule = null;
  const labId = String(labAnchorId || "").trim();
  const needLab = labId && Types.ObjectId.isValid(labId);
  const [catalog, lab, practice, abutmentPricingTier, abutmentPrices] =
    await Promise.all([
      catalogInput != null
        ? Promise.resolve(catalogInput)
        : loadAutoMatchBudgetCatalog(),
      needLab
        ? BusinessAnchor.findById(labId)
            .select({ labFeeSchedule: 1, labPracticeFeeMultipliers: 1 })
            .lean()
        : Promise.resolve(null),
      BusinessAnchor.findById(practiceId)
        .select({ "practiceTransferSettings.implantFavorites": 1 })
        .lean(),
      resolvePracticeAbutmentPricingTier(practiceId),
      loadCachedAbutmentCreditPrices(practiceId),
    ]);
  const budget = normalizeAutoMatchBudget(autoMatchBudget, catalog);
  if (lab) labFeeSchedule = lab.labFeeSchedule || null;

  const noLab = !labId;
  const useRemake = Boolean(remake);
  const autoSchedule =
    noLab && budget
      ? buildScheduleFromAutoMatchBudget(budget, "max", catalog)
      : null;
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    implantFavorites: implantFavoritesFromPractice(practice),
    labFeeSchedule: noLab
      ? autoSchedule || LAB_FEE_SCHEDULE_ZEROS
      : resolveLabFeeScheduleSource(labFeeSchedule),
    abutmentPricingTier,
    abutmentPrices,
    remake: useRemake,
    skipAbutmentFees: useRemake,
    labFeeMultiplier: resolveLabPracticeFeeMultiplier(lab, practiceId),
  });

  const required = fees.total;

  if (required <= 0) {
    return { ok: true, fees, paidCredit: null, freeCredit: null, required: 0 };
  }

  const balance = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: practiceId,
  });
  const split = allocateSpendFromCreditBuckets({
    amount: required,
    paidCredit: Number(balance?.paidCredit || 0),
    freeRequestCredit: Number(balance?.freeRequestCredit || 0),
    freeShippingCredit: Number(balance?.freeShippingCredit || 0),
    freeOrder: ["freeRequest", "freeShipping"],
  });
  if (!split.ok) {
    const err = new Error(
      `크레딧이 부족합니다. (잔액 ${(split.available).toLocaleString("ko-KR")}원 / 필요 ${required.toLocaleString("ko-KR")}원)`,
    );
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_practice_transfer",
      paidCredit: split.paidCredit,
      freeCredit: split.freeCredit,
      freeRequestCredit: split.freeRequestCredit,
      freeShippingCredit: split.freeShippingCredit,
      available: split.available,
      required,
      fees,
      autoMatchBudget: budget,
    };
    throw err;
  }

  return {
    ok: true,
    fees,
    paidCredit: split.paidCredit,
    freeCredit: split.freeCredit,
    required,
    autoMatchBudget: budget,
  };
}

/**
 * 기공의뢰: 치과 유료/무료크레딧 1회 차감 + 기공소 기공정산크레딧(LAB_SETTLEMENT_CREDIT)/REV_* 분배.
 * @deprecated 에스크로 전환 후 신규는 hold→adjust→release. 레거시 문서·롤백용으로 유지.
 * 잔액 검사: 전송 생성(`createPracticeTransfer`). 실제 차감: 기공소 의뢰수락(`mark-accepted`).
 */
export async function commitPracticeTransferBilling({
  transfer,
  toothWorks,
  actorUserId,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId = transfer?.targetLabAnchorId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { billed: false, reason: "missing_anchors" };
  }

  const idempotencyKey = `practice_transfer:${String(transferId)}:spend`;
  const isAutoMatch =
    String(transfer?.matchingMode || "").trim() === "auto";

  const [
    existing,
    lab,
    practice,
    abutmentPricingTier,
    abutmentPrices,
    partner,
    devopsAnchorForFeeRate,
    autoMatchCatalog,
    revenueOwners,
  ] = await Promise.all([
    getJournalByIdempotencyKey({
      idempotencyKey,
      session: outerSession,
    }),
    BusinessAnchor.findById(labAnchorId)
      .select({ labFeeSchedule: 1, labPracticeFeeMultipliers: 1 })
      .session(outerSession || null)
      .lean(),
    BusinessAnchor.findById(practiceAnchorId)
      .select({ "practiceTransferSettings.implantFavorites": 1 })
      .session(outerSession || null)
      .lean(),
    resolvePracticeAbutmentPricingTier(practiceAnchorId, outerSession),
    loadCachedAbutmentCreditPrices(practiceAnchorId),
    findLabPracticeRelationship({
      labAnchorId,
      practiceAnchorId,
    }),
    BusinessAnchor.findOne({
      businessType: "devops",
    })
      .select({ payoutRates: 1 })
      .sort({ createdAt: 1 })
      .lean(),
    isAutoMatch ? loadAutoMatchBudgetCatalog() : Promise.resolve(null),
    resolveRevenueOwners({
      practiceAnchorId,
      session: outerSession,
    }),
  ]);
  if (existing?.journalId) {
    return { billed: false, reason: "already_billed", journalId: existing.journalId };
  }

  const remake = isPracticeTransferRemake(transfer);
  // 지정: 생성 시 스냅샷 유지(할증 소급 금지).
  // 자동매칭 v4: 수락 기공소 유효 별점 확정수가·할증 없음.
  const labFeeMultiplier = isAutoMatch
    ? 1
    : normalizeLabFeeMultiplier(transfer?.billing?.labFeeMultiplier);
  const labEffectiveStars = isAutoMatch
    ? await resolveLabEffectiveStarsForFee(labAnchorId)
    : DEFAULT_EFFECTIVE_LAB_STARS;
  const autoMatchSchedule = isAutoMatch
    ? buildAutoMatchFeeScheduleForLab({
        budget: transfer?.billing?.autoMatchBudget,
        catalog: autoMatchCatalog,
        labEffectiveStars,
      })
    : null;
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    implantFavorites: implantFavoritesFromPractice(practice),
    labFeeSchedule: isAutoMatch
      ? autoMatchSchedule
      : resolveLabFeeScheduleSource(lab?.labFeeSchedule),
    abutmentPricingTier,
    abutmentPrices,
    remake,
    skipAbutmentFees: remake,
    labFeeMultiplier,
  });

  if (fees.total <= 0) {
    return { billed: false, reason: "zero_fee", fees };
  }

  // v4 고정가 — 기공소 수가 밴드 검증 없음
  const budgetCheck = assertLabWithinAutoMatchBudget({
    toothWorks,
    budget: transfer?.billing?.autoMatchBudget,
    labFeeSchedule: lab?.labFeeSchedule,
    labFeeMultiplier: 1,
    catalog: autoMatchCatalog || undefined,
  });
  if (isAutoMatch && !budgetCheck.ok) {
    const err = new Error(
      "자동매칭 고정수가를 확인할 수 없습니다.",
    );
    err.statusCode = 409;
    err.payload = {
      reason: "auto_match_budget_mismatch",
      labFeeTotal: fees.labFeeTotal,
      labFeeMultiplier,
      autoMatchBudget: budgetCheck.budget,
      requiredKeys: budgetCheck.requiredKeys,
      unitPrices: budgetCheck.unitPrices,
    };
    throw err;
  }

  const relationshipKind =
    partner?.status === "active" || partner?.status === "referred"
      ? partner.status
      : "none";
  const isPartner = relationshipKind === "active";

  const feeRateApplied = resolvePracticeTransferFeeRate({
    matchingMode: isAutoMatch ? "auto" : "direct",
    payoutRates: devopsAnchorForFeeRate?.payoutRates,
  });

  const { abutsRevenueAmount, labSettlementAmount } =
    splitPracticeTransferSettlement({
      labFeeTotal: fees.labFeeTotal,
      abutmentRetailTotal: fees.abutmentRetailTotal,
      feeRateApplied,
    });

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const balance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
      session,
    });
    const split = allocateSpendFromCreditBuckets({
      amount: fees.total,
      paidCredit: Number(balance?.paidCredit || 0),
      freeRequestCredit: Number(balance?.freeRequestCredit || 0),
      freeShippingCredit: Number(balance?.freeShippingCredit || 0),
      freeOrder: ["freeRequest", "freeShipping"],
    });
    if (!split.ok) {
      const err = new Error("치과 크레딧이 부족합니다.");
      err.statusCode = 402;
      err.payload = {
        reason: "insufficient_credit_for_practice_transfer",
        paidCredit: split.paidCredit,
        freeCredit: split.freeCredit,
        freeRequestCredit: split.freeRequestCredit,
        freeShippingCredit: split.freeShippingCredit,
        available: split.available,
        required: fees.total,
        fees,
      };
      throw err;
    }

    const owners = revenueOwners;

    const spendMetaBase = {
      labFee: fees.labFeeTotal,
      abutmentRetail: fees.abutmentRetailTotal,
      abutmentQty: fees.abutmentQty,
      isTradingPartner: isPartner,
      relationshipKind,
      feeRateApplied,
      displayKind: "lab_fee",
      displayLabel: "기공비",
      usageKind: "practice_transfer",
      fromPaid: split.fromPaid,
      fromFreeRequest: split.fromFreeRequest,
      fromFreeShipping: split.fromFreeShipping,
    };

    const lines = [];
    if (split.fromFreeRequest > 0) {
      lines.push({
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -split.fromFreeRequest,
        amountExcludingVat: -split.fromFreeRequest,
        vatAmount: 0,
        creditKind: "FREE_REQUEST",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: spendMetaBase,
      });
    }
    if (split.fromFreeShipping > 0) {
      lines.push({
        accountCode: "REQ_FREE_SHIPPING_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -split.fromFreeShipping,
        amountExcludingVat: -split.fromFreeShipping,
        vatAmount: 0,
        creditKind: "FREE_SHIPPING",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: spendMetaBase,
      });
    }
    if (split.fromPaid > 0) {
      lines.push({
        accountCode: "REQ_PAID_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -split.fromPaid,
        amountExcludingVat: -split.fromPaid,
        vatAmount: 0,
        creditKind: "PAID",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: spendMetaBase,
      });
    }

    if (labSettlementAmount > 0) {
      lines.push({
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: String(labAnchorId),
        amount: labSettlementAmount,
        amountExcludingVat: labSettlementAmount,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_settlement",
          isTradingPartner: isPartner,
          relationshipKind,
          feeRateApplied,
          labFee: fees.labFeeTotal,
          abutmentRetailIncluded: 0,
          displayKind: "lab_credit",
          displayLabel: "기공정산크레딧",
          itemLabel: "기공비",
        },
      });
    }

    if (abutsRevenueAmount > 0) {
      // 플랫폼 수수료분도 치과 유료/무료 소진 비중에 맞춰 creditKind를 분해(무료는 지급 제외).
      const freeShareOfPlatformFee =
        fees.total > 0
          ? Math.round((abutsRevenueAmount * split.fromFree) / fees.total)
          : 0;
      const freeReqShareOfPlatformFee =
        split.fromFree > 0
          ? Math.round(
              (freeShareOfPlatformFee * split.fromFreeRequest) / split.fromFree,
            )
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      pushRevenueLines({
        lines,
        owners,
        spendAmount: abutsRevenueAmount,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source:
            relationshipKind === "active" || relationshipKind === "referred"
              ? "partner_platform_fee"
              : "non_partner_platform_fee",
          relationshipKind,
          feeRateApplied,
          feeTotal: fees.total,
        },
      });
    }

    const journal = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "PRACTICE_TRANSFER_SPEND_COMMIT",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        labAnchorId: String(labAnchorId),
        labTradingPartnerId: partner?._id ? String(partner._id) : null,
        isTradingPartner: isPartner,
        relationshipKind,
        feeRateApplied,
        fees,
        labSettlementAmount,
        abutsRevenueAmount,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    // 기공소 기공크레딧(정산 대기) 충전은 단일 저널로 원자성 유지.
    // LAB_SETTLEMENT_CHARGE는 표시용 alias(meta.eventAlias). 치과 유료크레딧 차감과 동일 저널.
    if (ownSession) await session.commitTransaction();

    return {
      billed: true,
      journalId: journal?.journalId || null,
      fees,
      isPartner,
      relationshipKind,
      feeRateApplied,
      labFeeMultiplier,
      labSettlementAmount,
      abutsRevenueAmount,
      labTradingPartnerId: partner?._id ? String(partner._id) : null,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

function buildPracticeDebitLines({
  split,
  practiceAnchorId,
  transferId,
  meta,
}) {
  const lines = [];
  if (split.fromFreeRequest > 0) {
    lines.push({
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: -split.fromFreeRequest,
      amountExcludingVat: -split.fromFreeRequest,
      vatAmount: 0,
      creditKind: "FREE_REQUEST",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (split.fromFreeShipping > 0) {
    lines.push({
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: -split.fromFreeShipping,
      amountExcludingVat: -split.fromFreeShipping,
      vatAmount: 0,
      creditKind: "FREE_SHIPPING",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (split.fromPaid > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: -split.fromPaid,
      amountExcludingVat: -split.fromPaid,
      vatAmount: 0,
      creditKind: "PAID",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  return lines;
}

function buildPracticeCreditLinesFromReturn({
  fromPaid,
  fromFreeRequest,
  fromFreeShipping,
  practiceAnchorId,
  transferId,
  meta,
}) {
  const lines = [];
  if (fromFreeRequest > 0) {
    lines.push({
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: fromFreeRequest,
      amountExcludingVat: fromFreeRequest,
      vatAmount: 0,
      creditKind: "FREE_REQUEST",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (fromFreeShipping > 0) {
    lines.push({
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: fromFreeShipping,
      amountExcludingVat: fromFreeShipping,
      vatAmount: 0,
      creditKind: "FREE_SHIPPING",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (fromPaid > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: fromPaid,
      amountExcludingVat: fromPaid,
      vatAmount: 0,
      creditKind: "PAID",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  return lines;
}

/** 보류 환급 시 유료→배송무료→의뢰무료 순으로 원복 */
function allocateHoldReturn({
  amount,
  fromPaid = 0,
  fromFreeRequest = 0,
  fromFreeShipping = 0,
}) {
  let remaining = Math.max(0, Math.round(Number(amount || 0)));
  const retPaid = Math.min(Math.max(0, Math.round(fromPaid)), remaining);
  remaining -= retPaid;
  const retShip = Math.min(Math.max(0, Math.round(fromFreeShipping)), remaining);
  remaining -= retShip;
  const retReq = Math.min(Math.max(0, Math.round(fromFreeRequest)), remaining);
  remaining -= retReq;
  return {
    fromPaid: retPaid,
    fromFreeShipping: retShip,
    fromFreeRequest: retReq,
    returned: retPaid + retShip + retReq,
    shortfall: Math.max(0, remaining),
  };
}

async function resolveDevopsEscrowOwnerId(session = null) {
  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ _id: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();
  return devops?._id ? String(devops._id) : null;
}

function practiceTransferHoldKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold`;
}
function practiceTransferHoldLabKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_lab`;
}
function practiceTransferHoldAbutmentKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_abutment`;
}
function practiceTransferHoldAdjustKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_adjust`;
}
function practiceTransferEscrowReleaseKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release`;
}
function practiceTransferEscrowReleaseLabKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release_lab`;
}
function practiceTransferEscrowReleaseAbutmentKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release_abutment`;
}
function practiceTransferLabPlatformFeeKey(transferId) {
  return `practice_transfer:${String(transferId)}:lab_platform_fee`;
}
function practiceTransferLegacySpendKey(transferId) {
  return `practice_transfer:${String(transferId)}:spend`;
}
function practiceTransferLabShippingKey(transferId) {
  return `gl:practice_transfer:${String(transferId)}:lab_shipping`;
}

/** 취소·삭제 시 물리 삭제 대상 PTX GL eventType */
const PRACTICE_TRANSFER_ROLLBACK_EVENT_TYPES = [
  "PRACTICE_TRANSFER_ESCROW_RELEASE",
  "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
  "PRACTICE_TRANSFER_HOLD_ADJUST",
  "PRACTICE_TRANSFER_SPEND_HOLD",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "SHIPPING_SPEND_COMMIT",
  "ADJUST",
];

const PRACTICE_TRANSFER_BALANCE_ACCOUNT_CODES = new Set([
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
  "LAB_SETTLEMENT_CREDIT",
]);

async function findAnyPracticeTransferHoldJournal(transferId, session = null) {
  const id = String(transferId || "").trim();
  const [legacy, lab, abut] = await Promise.all([
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferHoldKey(id),
      session,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferHoldLabKey(id),
      session,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferHoldAbutmentKey(id),
      session,
    }),
  ]);
  return {
    legacy: legacy?.journalId ? legacy : null,
    lab: lab?.journalId ? lab : null,
    abutment: abut?.journalId ? abut : null,
    any: Boolean(legacy?.journalId || lab?.journalId || abut?.journalId),
  };
}

async function resolveHoldShareAmounts({
  transfer,
  toothWorks,
  holdAmount = null,
  holdLabAmount = null,
  holdAbutmentAmount = null,
}) {
  let lab =
    holdLabAmount != null
      ? Math.max(0, Math.round(Number(holdLabAmount) || 0))
      : null;
  let abut =
    holdAbutmentAmount != null
      ? Math.max(0, Math.round(Number(holdAbutmentAmount) || 0))
      : null;

  if (lab == null) {
    const fromBilling = transfer?.billing?.labFeeTotal;
    if (fromBilling != null && Number.isFinite(Number(fromBilling))) {
      lab = Math.max(0, Math.round(Number(fromBilling) || 0));
    }
  }
  if (abut == null) {
    const fromBilling = transfer?.billing?.abutmentRetailTotal;
    if (fromBilling != null && Number.isFinite(Number(fromBilling))) {
      abut = Math.max(0, Math.round(Number(fromBilling) || 0));
    }
  }

  if (lab == null || abut == null) {
    const check = await assertPracticeTransferPaidCreditSufficient({
      practiceAnchorId: transfer?.practiceBusinessAnchorId,
      labAnchorId: transfer?.targetLabAnchorId || null,
      toothWorks: toothWorks || transfer?.toothWorks || [],
      remake: isPracticeTransferRemake(transfer),
      autoMatchBudget: transfer?.billing?.autoMatchBudget || null,
    });
    if (lab == null) {
      lab = Math.max(0, Math.round(Number(check?.fees?.labFeeTotal || 0)));
    }
    if (abut == null) {
      abut = Math.max(
        0,
        Math.round(Number(check?.fees?.abutmentRetailTotal || 0)),
      );
    }
  }

  let total = lab + abut;
  const forcedTotal =
    holdAmount != null ? Math.max(0, Math.round(Number(holdAmount) || 0)) : null;
  if (forcedTotal != null && forcedTotal > 0 && total <= 0) {
    lab = forcedTotal;
    abut = 0;
    total = forcedTotal;
  } else if (forcedTotal != null && forcedTotal > 0 && total !== forcedTotal) {
    // billing 분할을 우선. total은 합.
    total = lab + abut;
  }

  return { lab, abut, total };
}

async function postOneHoldSlice({
  transferId,
  practiceAnchorId,
  devopsAnchorId,
  amount,
  shareKind,
  displayLabel,
  split,
  actorUserId,
  session,
}) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (amt <= 0) {
    return { posted: false, journalId: null, fromPaid: 0, fromFreeRequest: 0, fromFreeShipping: 0 };
  }

  const sliceSplit = allocateSpendFromCreditBuckets({
    amount: amt,
    paidCredit: Number(split.remainingPaid ?? split.paidCredit ?? 0),
    freeRequestCredit: Number(
      split.remainingFreeRequest ?? split.freeRequestCredit ?? 0,
    ),
    freeShippingCredit: Number(
      split.remainingFreeShipping ?? split.freeShippingCredit ?? 0,
    ),
    freeOrder: ["freeRequest", "freeShipping"],
  });
  if (!sliceSplit.ok) {
    const err = new Error("치과 크레딧이 부족합니다.");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_practice_transfer",
      available: sliceSplit.available,
      required: amt,
      shareKind,
    };
    throw err;
  }

  const spendMetaBase = {
    displayKind: "lab_fee_hold",
    displayLabel,
    usageKind: "practice_transfer",
    escrow: true,
    holdShare: shareKind,
    fromPaid: sliceSplit.fromPaid,
    fromFreeRequest: sliceSplit.fromFreeRequest,
    fromFreeShipping: sliceSplit.fromFreeShipping,
  };

  const idempotencyKey =
    shareKind === "abutment"
      ? practiceTransferHoldAbutmentKey(transferId)
      : practiceTransferHoldLabKey(transferId);

  const journal = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
    businessAnchorId: practiceAnchorId,
    refType: "PRACTICE_TRANSFER",
    refId: transferId,
    createdBy: actorUserId,
    meta: {
      heldTotal: amt,
      holdShare: shareKind,
      fromPaid: sliceSplit.fromPaid,
      fromFreeRequest: sliceSplit.fromFreeRequest,
      fromFreeShipping: sliceSplit.fromFreeShipping,
      devopsAnchorId,
    },
    lines: [
      ...buildPracticeDebitLines({
        split: sliceSplit,
        practiceAnchorId,
        transferId,
        meta: spendMetaBase,
      }),
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: amt,
        amountExcludingVat: amt,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          ...spendMetaBase,
          source: "practice_transfer_escrow_hold",
        },
      },
    ],
    session,
    skipIdempotencyLookup: true,
  });

  return {
    posted: true,
    journalId: journal?.journalId || null,
    fromPaid: sliceSplit.fromPaid,
    fromFreeRequest: sliceSplit.fromFreeRequest,
    fromFreeShipping: sliceSplit.fromFreeShipping,
    remainingPaid: Math.max(
      0,
      Number(split.remainingPaid ?? split.paidCredit ?? 0) - sliceSplit.fromPaid,
    ),
    remainingFreeRequest: Math.max(
      0,
      Number(split.remainingFreeRequest ?? split.freeRequestCredit ?? 0) -
        sliceSplit.fromFreeRequest,
    ),
    remainingFreeShipping: Math.max(
      0,
      Number(split.remainingFreeShipping ?? split.freeShippingCredit ?? 0) -
        sliceSplit.fromFreeShipping,
    ),
  };
}

/**
 * 전송 생성 시 치과 크레딧을 PLATFORM_ESCROW로 보류(기공 적립 없음).
 * 기공소몫·어벗츠몫을 별도 SPEND_HOLD 저널로 기재.
 */
export async function holdPracticeTransferCredits({
  transfer,
  toothWorks = null,
  holdAmount = null,
  holdLabAmount = null,
  holdAbutmentAmount = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { held: false, reason: "missing_anchors" };
  }

  const existingHolds = await findAnyPracticeTransferHoldJournal(
    transferId,
    outerSession,
  );
  if (existingHolds.any) {
    const heldTotal = Math.max(
      0,
      Math.round(
        Number(
          transfer?.billing?.heldTotal ||
            (Number(existingHolds.lab?.meta?.heldTotal || 0) +
              Number(existingHolds.abutment?.meta?.heldTotal || 0) +
              Number(existingHolds.legacy?.meta?.heldTotal || 0)),
        ),
      ),
    );
    return {
      held: false,
      reason: "already_held",
      journalId:
        existingHolds.lab?.journalId ||
        existingHolds.abutment?.journalId ||
        existingHolds.legacy?.journalId ||
        null,
      heldTotal,
      heldLabTotal: Math.max(
        0,
        Math.round(
          Number(
            transfer?.billing?.heldLabTotal ??
              existingHolds.lab?.meta?.heldTotal ??
              0,
          ),
        ),
      ),
      heldAbutmentTotal: Math.max(
        0,
        Math.round(
          Number(
            transfer?.billing?.heldAbutmentTotal ??
              existingHolds.abutment?.meta?.heldTotal ??
              0,
          ),
        ),
      ),
    };
  }

  const shares = await resolveHoldShareAmounts({
    transfer,
    toothWorks,
    holdAmount,
    holdLabAmount,
    holdAbutmentAmount,
  });
  const required = shares.total;
  if (required <= 0) {
    return {
      held: false,
      reason: "zero_fee",
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
    };
  }

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const [balance, devopsAnchorId] = await Promise.all([
      computeBusinessCreditBalanceFromLedger({
        businessAnchorId: practiceAnchorId,
        session,
      }),
      resolveDevopsEscrowOwnerId(session),
    ]);
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const totalSplit = allocateSpendFromCreditBuckets({
      amount: required,
      paidCredit: Number(balance?.paidCredit || 0),
      freeRequestCredit: Number(balance?.freeRequestCredit || 0),
      freeShippingCredit: Number(balance?.freeShippingCredit || 0),
      freeOrder: ["freeRequest", "freeShipping"],
    });
    if (!totalSplit.ok) {
      const err = new Error("치과 크레딧이 부족합니다.");
      err.statusCode = 402;
      err.payload = {
        reason: "insufficient_credit_for_practice_transfer",
        paidCredit: totalSplit.paidCredit,
        freeCredit: totalSplit.freeCredit,
        freeRequestCredit: totalSplit.freeRequestCredit,
        freeShippingCredit: totalSplit.freeShippingCredit,
        available: totalSplit.available,
        required,
      };
      throw err;
    }

    let bucket = {
      remainingPaid: Number(balance?.paidCredit || 0),
      remainingFreeRequest: Number(balance?.freeRequestCredit || 0),
      remainingFreeShipping: Number(balance?.freeShippingCredit || 0),
    };

    let fromPaid = 0;
    let fromFreeRequest = 0;
    let fromFreeShipping = 0;
    const journalIds = [];

    const labPost = await postOneHoldSlice({
      transferId,
      practiceAnchorId,
      devopsAnchorId,
      amount: shares.lab,
      shareKind: "lab",
      displayLabel: "기공소몫 보류",
      split: bucket,
      actorUserId,
      session,
    });
    if (labPost.posted) {
      journalIds.push(labPost.journalId);
      fromPaid += labPost.fromPaid;
      fromFreeRequest += labPost.fromFreeRequest;
      fromFreeShipping += labPost.fromFreeShipping;
      bucket = {
        remainingPaid: labPost.remainingPaid,
        remainingFreeRequest: labPost.remainingFreeRequest,
        remainingFreeShipping: labPost.remainingFreeShipping,
      };
    }

    const abutPost = await postOneHoldSlice({
      transferId,
      practiceAnchorId,
      devopsAnchorId,
      amount: shares.abut,
      shareKind: "abutment",
      displayLabel: "어벗츠몫 보류",
      split: bucket,
      actorUserId,
      session,
    });
    if (abutPost.posted) {
      journalIds.push(abutPost.journalId);
      fromPaid += abutPost.fromPaid;
      fromFreeRequest += abutPost.fromFreeRequest;
      fromFreeShipping += abutPost.fromFreeShipping;
    }

    if (ownSession) await session.commitTransaction();

    return {
      held: journalIds.length > 0,
      journalId: journalIds[0] || null,
      journalIds,
      heldTotal: required,
      heldLabTotal: shares.lab,
      heldAbutmentTotal: shares.abut,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

async function computeAcceptedPracticeTransferFees({
  transfer,
  toothWorks,
  session = null,
}) {
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId = transfer?.targetLabAnchorId;
  const isAutoMatch = String(transfer?.matchingMode || "").trim() === "auto";

  const [lab, practice, abutmentPricingTier, abutmentPrices, partner, devopsAnchorForFeeRate, autoMatchCatalog] =
    await Promise.all([
      BusinessAnchor.findById(labAnchorId)
        .select({ labFeeSchedule: 1, labPracticeFeeMultipliers: 1 })
        .session(session || null)
        .lean(),
      BusinessAnchor.findById(practiceAnchorId)
        .select({ "practiceTransferSettings.implantFavorites": 1 })
        .session(session || null)
        .lean(),
      resolvePracticeAbutmentPricingTier(practiceAnchorId, session),
      loadCachedAbutmentCreditPrices(practiceAnchorId),
      findLabPracticeRelationship({ labAnchorId, practiceAnchorId }),
      BusinessAnchor.findOne({ businessType: "devops" })
        .select({ payoutRates: 1 })
        .sort({ createdAt: 1 })
        .lean(),
      isAutoMatch ? loadAutoMatchBudgetCatalog() : Promise.resolve(null),
    ]);

  const remake = isPracticeTransferRemake(transfer);
  const labFeeMultiplier = isAutoMatch
    ? 1
    : normalizeLabFeeMultiplier(transfer?.billing?.labFeeMultiplier);

  const labEffectiveStars = isAutoMatch
    ? await resolveLabEffectiveStarsForFee(labAnchorId)
    : DEFAULT_EFFECTIVE_LAB_STARS;
  const autoMatchSchedule = isAutoMatch
    ? buildAutoMatchFeeScheduleForLab({
        budget: transfer?.billing?.autoMatchBudget,
        catalog: autoMatchCatalog,
        labEffectiveStars,
      })
    : null;

  const fees = computePracticeTransferRetailFees({
    toothWorks,
    implantFavorites: implantFavoritesFromPractice(practice),
    labFeeSchedule: isAutoMatch
      ? autoMatchSchedule
      : resolveLabFeeScheduleSource(lab?.labFeeSchedule),
    abutmentPricingTier,
    abutmentPrices,
    remake,
    skipAbutmentFees: remake,
    labFeeMultiplier,
  });

  if (isAutoMatch) {
    const budgetCheck = assertLabWithinAutoMatchBudget({
      toothWorks,
      budget: transfer?.billing?.autoMatchBudget,
      labFeeSchedule: lab?.labFeeSchedule,
      labFeeMultiplier: 1,
      catalog: autoMatchCatalog || undefined,
    });
    if (!budgetCheck.ok) {
      const err = new Error(
        "자동매칭 고정수가를 확인할 수 없습니다.",
      );
      err.statusCode = 409;
      err.payload = {
        reason: "auto_match_budget_mismatch",
        labFeeTotal: fees.labFeeTotal,
        labFeeMultiplier,
        autoMatchBudget: budgetCheck.budget,
        requiredKeys: budgetCheck.requiredKeys,
        unitPrices: budgetCheck.unitPrices,
      };
      throw err;
    }
  }

  const relationshipKind = relationshipKindFromPartner(partner);
  const isPartner = relationshipKind === "active";
  const feeRateApplied = resolvePracticeTransferFeeRate({
    matchingMode: isAutoMatch ? "auto" : "direct",
    payoutRates: devopsAnchorForFeeRate?.payoutRates,
  });
  const { abutsRevenueAmount, labSettlementAmount } =
    splitPracticeTransferSettlement({
      labFeeTotal: fees.labFeeTotal,
      abutmentRetailTotal: fees.abutmentRetailTotal,
      feeRateApplied,
    });

  return {
    fees,
    partner,
    relationshipKind,
    isPartner,
    feeRateApplied,
    labFeeMultiplier,
    labSettlementAmount,
    abutsRevenueAmount,
  };
}

/**
 * 수락 시 실수가로 보류액 조정. 기공크레딧 지급 없음.
 * 레거시(보류 없음)면 여기서 hold를 생성한다.
 */
export async function adjustPracticeTransferHold({
  transfer,
  toothWorks,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId = transfer?.targetLabAnchorId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { adjusted: false, reason: "missing_anchors" };
  }

  // Atlas RTT: legacy/hold/adjust 저널 + 수수료 조회를 한 파도로 묶는다.
  const [legacySpend, holdsPrefetch, adjustExistingPrefetch, computed] =
    await Promise.all([
      getJournalByIdempotencyKey({
        idempotencyKey: practiceTransferLegacySpendKey(transferId),
        session: outerSession,
      }),
      findAnyPracticeTransferHoldJournal(transferId, outerSession),
      getJournalByIdempotencyKey({
        idempotencyKey: practiceTransferHoldAdjustKey(transferId),
        session: outerSession,
      }),
      computeAcceptedPracticeTransferFees({
        transfer,
        toothWorks,
        session: outerSession,
      }),
    ]);
  if (legacySpend?.journalId) {
    return { adjusted: false, reason: "legacy_already_committed" };
  }

  const { fees } = computed;
  if (fees.total <= 0) {
    return {
      adjusted: false,
      reason: "zero_fee",
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labSettlementAmount: 0,
      abutsRevenueAmount: 0,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
    };
  }

  let holdJournal =
    holdsPrefetch.legacy || holdsPrefetch.lab || holdsPrefetch.abutment || null;

  if (!holdsPrefetch.any) {
    const holdResult = await holdPracticeTransferCredits({
      transfer,
      toothWorks,
      holdAmount: fees.total,
      holdLabAmount: fees.labFeeTotal,
      holdAbutmentAmount: fees.abutmentRetailTotal,
      actorUserId,
      session: outerSession,
    });
    return {
      adjusted: Boolean(holdResult.held || holdResult.reason === "already_held"),
      reason: holdResult.reason || null,
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: holdResult.heldTotal ?? fees.total,
      heldLabTotal: holdResult.heldLabTotal ?? fees.labFeeTotal,
      heldAbutmentTotal:
        holdResult.heldAbutmentTotal ?? fees.abutmentRetailTotal,
      fromPaid: holdResult.fromPaid,
      fromFreeRequest: holdResult.fromFreeRequest,
      fromFreeShipping: holdResult.fromFreeShipping,
    };
  }

  const heldLabTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldLabTotal ??
          holdsPrefetch.lab?.meta?.heldTotal ??
          (holdsPrefetch.legacy ? fees.labFeeTotal : 0),
      ),
    ),
  );
  const heldAbutmentTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldAbutmentTotal ??
          holdsPrefetch.abutment?.meta?.heldTotal ??
          (holdsPrefetch.legacy ? fees.abutmentRetailTotal : 0),
      ),
    ),
  );
  const heldTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldTotal ||
          heldLabTotal + heldAbutmentTotal ||
          holdJournal?.meta?.heldTotal ||
          0,
      ),
    ),
  );
  const target = fees.total;
  const delta = target - heldTotal;

  let fromPaid = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromPaid ?? holdJournal?.meta?.fromPaid ?? 0,
      ),
    ),
  );
  let fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holdJournal?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  let fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holdJournal?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );

  if (delta === 0) {
    return {
      adjusted: false,
      reason: "already_matched",
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal,
      heldLabTotal: fees.labFeeTotal,
      heldAbutmentTotal: fees.abutmentRetailTotal,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  }

  const adjustExisting = adjustExistingPrefetch;
  if (adjustExisting?.journalId) {
    // 이미 조정된 경우 billing 스냅샷을 신뢰
    return {
      adjusted: false,
      reason: "already_adjusted",
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: Math.max(
        0,
        Math.round(Number(transfer?.billing?.heldTotal || target)),
      ),
      heldLabTotal: Math.max(
        0,
        Math.round(
          Number(transfer?.billing?.heldLabTotal ?? fees.labFeeTotal),
        ),
      ),
      heldAbutmentTotal: Math.max(
        0,
        Math.round(
          Number(
            transfer?.billing?.heldAbutmentTotal ?? fees.abutmentRetailTotal,
          ),
        ),
      ),
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  }

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const devopsAnchorId =
      String(holdJournal?.meta?.devopsAnchorId || "").trim() ||
      (await resolveDevopsEscrowOwnerId(session));
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const absDelta = Math.abs(delta);
    const metaBase = {
      displayKind: "lab_fee_hold",
      displayLabel: "기공비 보류 조정",
      usageKind: "practice_transfer",
      escrow: true,
    };
    const lines = [];

    if (delta < 0) {
      const ret = allocateHoldReturn({
        amount: absDelta,
        fromPaid,
        fromFreeRequest,
        fromFreeShipping,
      });
      if (ret.shortfall > 0) {
        const err = new Error("보류 환급 배분에 실패했습니다.");
        err.statusCode = 500;
        throw err;
      }
      lines.push(
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: -absDelta,
          amountExcludingVat: -absDelta,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: { ...metaBase, source: "practice_transfer_escrow_release_partial" },
        },
        ...buildPracticeCreditLinesFromReturn({
          fromPaid: ret.fromPaid,
          fromFreeRequest: ret.fromFreeRequest,
          fromFreeShipping: ret.fromFreeShipping,
          practiceAnchorId,
          transferId,
          meta: metaBase,
        }),
      );
      fromPaid -= ret.fromPaid;
      fromFreeRequest -= ret.fromFreeRequest;
      fromFreeShipping -= ret.fromFreeShipping;
    } else {
      const balance = await computeBusinessCreditBalanceFromLedger({
        businessAnchorId: practiceAnchorId,
        session,
      });
      const split = allocateSpendFromCreditBuckets({
        amount: absDelta,
        paidCredit: Number(balance?.paidCredit || 0),
        freeRequestCredit: Number(balance?.freeRequestCredit || 0),
        freeShippingCredit: Number(balance?.freeShippingCredit || 0),
        freeOrder: ["freeRequest", "freeShipping"],
      });
      if (!split.ok) {
        const err = new Error("치과 크레딧이 부족합니다.");
        err.statusCode = 402;
        err.payload = {
          reason: "insufficient_credit_for_practice_transfer",
          available: split.available,
          required: absDelta,
        };
        throw err;
      }
      lines.push(
        ...buildPracticeDebitLines({
          split,
          practiceAnchorId,
          transferId,
          meta: {
            ...metaBase,
            fromPaid: split.fromPaid,
            fromFreeRequest: split.fromFreeRequest,
            fromFreeShipping: split.fromFreeShipping,
          },
        }),
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: absDelta,
          amountExcludingVat: absDelta,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: { ...metaBase, source: "practice_transfer_escrow_topup" },
        },
      );
      fromPaid += split.fromPaid;
      fromFreeRequest += split.fromFreeRequest;
      fromFreeShipping += split.fromFreeShipping;
    }

    await postGeneralLedgerJournal({
      idempotencyKey: practiceTransferHoldAdjustKey(transferId),
      eventType: "PRACTICE_TRANSFER_HOLD_ADJUST",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        previousHeldTotal: heldTotal,
        heldTotal: target,
        heldLabTotal: fees.labFeeTotal,
        heldAbutmentTotal: fees.abutmentRetailTotal,
        delta,
        fromPaid,
        fromFreeRequest,
        fromFreeShipping,
        devopsAnchorId,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    return {
      adjusted: true,
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: target,
      heldLabTotal: fees.labFeeTotal,
      heldAbutmentTotal: fees.abutmentRetailTotal,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 기공소 발송(mark-complete): 기공소몫 에스크로 해제 → 기공크레딧 총액 적립 + 플랫폼 수수료 차감.
 */
export async function releasePracticeTransferLabShare({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId = transfer?.targetLabAnchorId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const releaseLabKey = practiceTransferEscrowReleaseLabKey(transferId);
  const feeKey = practiceTransferLabPlatformFeeKey(transferId);
  const legacyReleaseKey = practiceTransferEscrowReleaseKey(transferId);
  const works = toothWorks || transfer?.toothWorks || [];

  const [
    existingLabRelease,
    existingFee,
    legacyRelease,
    legacySpend,
    holds,
    computed,
  ] = await Promise.all([
    getJournalByIdempotencyKey({
      idempotencyKey: releaseLabKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: feeKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: legacyReleaseKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferLegacySpendKey(transferId),
      session: outerSession,
    }),
    findAnyPracticeTransferHoldJournal(transferId, outerSession),
    computeAcceptedPracticeTransferFees({
      transfer,
      toothWorks: works,
      session: outerSession,
    }),
  ]);

  if (legacyRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: legacyRelease.journalId,
      legacyFullRelease: true,
    };
  }
  if (existingLabRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingLabRelease.journalId,
    };
  }
  if (legacySpend?.journalId) {
    return {
      released: false,
      reason: "legacy_already_settled",
      journalId: legacySpend.journalId,
    };
  }
  if (!holds.any) {
    return { released: false, reason: "no_hold" };
  }

  const { fees, feeRateApplied } = computed;
  const labFeeTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.labFeeTotal ??
          transfer?.billing?.heldLabTotal ??
          fees.labFeeTotal ??
          0,
      ),
    ),
  );
  if (labFeeTotal <= 0) {
    return {
      released: false,
      reason: "zero_lab_fee",
      fees,
      labFeeTotal: 0,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const platformFee = Math.max(
    0,
    Math.round(labFeeTotal * Number(feeRateApplied || 0)),
  );
  const labNet = Math.max(0, labFeeTotal - platformFee);

  const fromPaid = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromPaid ??
          holds.lab?.meta?.fromPaid ??
          holds.legacy?.meta?.fromPaid ??
          0,
      ),
    ),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holds.lab?.meta?.fromFreeRequest ??
          holds.legacy?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holds.lab?.meta?.fromFreeShipping ??
          holds.legacy?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const revenueOwners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId = revenueOwners?.devopsAnchorId || null;
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const releaseLines = [
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -labFeeTotal,
        amountExcludingVat: -labFeeTotal,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_escrow_release_lab",
          displayKind: "lab_share",
          displayLabel: "기공소몫",
          holdShare: "lab",
        },
      },
      {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: String(labAnchorId),
        amount: labFeeTotal,
        amountExcludingVat: labFeeTotal,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_lab_share_gross",
          displayKind: "lab_credit",
          displayLabel: "기공크레딧 적립",
          itemLabel: "기공소몫",
          feeRateApplied,
          labFee: labFeeTotal,
        },
      },
    ];

    const releaseJournal = await postGeneralLedgerJournal({
      idempotencyKey: releaseLabKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        holdShare: "lab",
        labAnchorId: String(labAnchorId),
        labFeeTotal,
        platformFee,
        labSettlementAmount: labNet,
        feeRateApplied,
        relationshipKind: computed.relationshipKind,
        fees,
      },
      lines: releaseLines,
      session,
      skipIdempotencyLookup: true,
    });

    let feeJournalId = existingFee?.journalId || null;
    if (platformFee > 0 && !existingFee?.journalId) {
      const feeLines = [
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -platformFee,
          amountExcludingVat: -platformFee,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_lab_platform_fee",
            displayKind: "platform_fee",
            displayLabel: "플랫폼 수수료",
            feeRateApplied,
            labFee: labFeeTotal,
          },
        },
      ];
      const heldTotalForFree =
        Number(transfer?.billing?.heldTotal || labFeeTotal || 0) || labFeeTotal;
      const freeShareOfPlatformFee =
        heldTotalForFree > 0
          ? Math.round(
              (platformFee * (fromFreeRequest + fromFreeShipping)) /
                heldTotalForFree,
            )
          : 0;
      const fromFree = fromFreeRequest + fromFreeShipping;
      const freeReqShareOfPlatformFee =
        fromFree > 0
          ? Math.round((freeShareOfPlatformFee * fromFreeRequest) / fromFree)
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      pushRevenueLines({
        lines: feeLines,
        owners: revenueOwners,
        spendAmount: platformFee,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "lab_platform_fee",
          displayKind: "platform_fee",
          displayLabel: "플랫폼 수수료",
          relationshipKind: computed.relationshipKind,
          feeRateApplied,
          feeTotal: labFeeTotal,
        },
      });

      const feeJournal = await postGeneralLedgerJournal({
        idempotencyKey: feeKey,
        eventType: "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
        businessAnchorId: labAnchorId,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        createdBy: actorUserId,
        meta: {
          labAnchorId: String(labAnchorId),
          labFeeTotal,
          platformFee,
          feeRateApplied,
          relationshipKind: computed.relationshipKind,
        },
        lines: feeLines,
        session,
        skipIdempotencyLookup: true,
      });
      feeJournalId = feeJournal?.journalId || null;
    }

    if (ownSession) await session.commitTransaction();

    return {
      released: true,
      journalId: releaseJournal?.journalId || null,
      feeJournalId,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labFeeTotal,
      platformFee,
      labSettlementAmount: labNet,
      abutsRevenueAmount: platformFee + Number(fees.abutmentRetailTotal || 0),
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 제조사 발송(포장.발송): 어벗츠몫 에스크로 해제 → 어벗츠 매출.
 */
export async function releasePracticeTransferAbutmentShare({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const releaseAbutKey = practiceTransferEscrowReleaseAbutmentKey(transferId);
  const legacyReleaseKey = practiceTransferEscrowReleaseKey(transferId);
  const works = toothWorks || transfer?.toothWorks || [];

  const [existingAbutRelease, legacyRelease, holds, computed] =
    await Promise.all([
      getJournalByIdempotencyKey({
        idempotencyKey: releaseAbutKey,
        session: outerSession,
      }),
      getJournalByIdempotencyKey({
        idempotencyKey: legacyReleaseKey,
        session: outerSession,
      }),
      findAnyPracticeTransferHoldJournal(transferId, outerSession),
      computeAcceptedPracticeTransferFees({
        transfer,
        toothWorks: works,
        session: outerSession,
      }),
    ]);

  if (legacyRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: legacyRelease.journalId,
      legacyFullRelease: true,
    };
  }
  if (existingAbutRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingAbutRelease.journalId,
    };
  }
  if (!holds.any) {
    return { released: false, reason: "no_hold" };
  }

  const abutmentRetailTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.abutmentRetailTotal ??
          transfer?.billing?.heldAbutmentTotal ??
          computed.fees?.abutmentRetailTotal ??
          0,
      ),
    ),
  );
  if (abutmentRetailTotal <= 0) {
    return {
      released: false,
      reason: "zero_abutment",
      fees: computed.fees,
      abutmentRetailTotal: 0,
    };
  }

  const fromPaid = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromPaid ??
          holds.abutment?.meta?.fromPaid ??
          holds.legacy?.meta?.fromPaid ??
          0,
      ),
    ),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holds.abutment?.meta?.fromFreeRequest ??
          holds.legacy?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holds.abutment?.meta?.fromFreeShipping ??
          holds.legacy?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );
  const fromFree = fromFreeRequest + fromFreeShipping;
  const heldTotalForFree =
    Number(transfer?.billing?.heldTotal || abutmentRetailTotal) ||
    abutmentRetailTotal;

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const revenueOwners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId = revenueOwners?.devopsAnchorId || null;
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const lines = [
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -abutmentRetailTotal,
        amountExcludingVat: -abutmentRetailTotal,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_escrow_release_abutment",
          displayKind: "abuts_share",
          displayLabel: "어벗츠몫",
          holdShare: "abutment",
        },
      },
    ];

    const freeShare =
      heldTotalForFree > 0
        ? Math.round((abutmentRetailTotal * fromFree) / heldTotalForFree)
        : 0;
    const freeReqShare =
      fromFree > 0 ? Math.round((freeShare * fromFreeRequest) / fromFree) : 0;
    const freeShipShare = Math.max(0, freeShare - freeReqShare);
    pushRevenueLines({
      lines,
      owners: revenueOwners,
      spendAmount: abutmentRetailTotal,
      freeAmount: freeShare,
      fromFreeRequest: freeReqShare,
      fromFreeShipping: freeShipShare,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta: {
        source: "abutment_retail",
        displayKind: "abuts_share",
        displayLabel: "어벗츠몫",
        relationshipKind: computed.relationshipKind,
        feeRateApplied: computed.feeRateApplied,
      },
    });

    const journal = await postGeneralLedgerJournal({
      idempotencyKey: releaseAbutKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        holdShare: "abutment",
        abutmentRetailTotal,
        fees: computed.fees,
        feeRateApplied: computed.feeRateApplied,
        relationshipKind: computed.relationshipKind,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    return {
      released: true,
      journalId: journal?.journalId || null,
      fees: computed.fees,
      abutmentRetailTotal,
      feeRateApplied: computed.feeRateApplied,
      relationshipKind: computed.relationshipKind,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * @deprecated 신규는 lab/abutment 분리 해제. 레거시·일괄 호환용 래퍼.
 */
export async function releasePracticeTransferEscrow({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const lab = await releasePracticeTransferLabShare({
    transfer,
    toothWorks,
    actorUserId,
    session: outerSession,
  });
  const abut = await releasePracticeTransferAbutmentShare({
    transfer,
    toothWorks,
    actorUserId,
    session: outerSession,
  });
  const released = Boolean(lab?.released || abut?.released);
  const already =
    lab?.reason === "already_released" || abut?.reason === "already_released";
  return {
    released,
    reason: released
      ? null
      : already
        ? "already_released"
        : lab?.reason || abut?.reason || "no_hold",
    journalId: lab?.journalId || abut?.journalId || null,
    fees: lab?.fees || abut?.fees,
    isPartner: lab?.isPartner,
    relationshipKind: lab?.relationshipKind || abut?.relationshipKind,
    feeRateApplied: lab?.feeRateApplied ?? abut?.feeRateApplied,
    labFeeMultiplier: lab?.labFeeMultiplier,
    labSettlementAmount: lab?.labSettlementAmount ?? 0,
    abutsRevenueAmount:
      Number(lab?.platformFee || 0) + Number(abut?.abutmentRetailTotal || 0),
    labTradingPartnerId: lab?.labTradingPartnerId || null,
    labRelease: lab,
    abutmentRelease: abut,
  };
}

/**
 * 기공의뢰 관련 GL 전부 삭제형 롤백.
 * - hold / hold_adjust / escrow_release / legacy spend
 * - lab_shipping (작업완료 시 배송비)
 * - ADJUST(어벗 디자인비 등) — refType+refId 스윕으로 누락 방지
 * 치과 cancel-batch·휴지통 비우기·기공소 작업취소/거부·생성 실패 정리에서 공통 사용.
 */
export async function rollbackPracticeTransferBilling({
  transferId,
  session: outerSession = null,
  emitRealtime = true,
}) {
  const id = String(transferId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    return {
      didRollback: false,
      reason: "invalid_id",
      deletedJournalIds: [],
      balanceRestoreByAnchor: {},
    };
  }

  const transferOid = new Types.ObjectId(id);
  const keys = [
    {
      key: practiceTransferEscrowReleaseAbutmentKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferLabPlatformFeeKey(id),
      events: ["PRACTICE_TRANSFER_LAB_PLATFORM_FEE"],
    },
    {
      key: practiceTransferEscrowReleaseLabKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferEscrowReleaseKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferHoldAdjustKey(id),
      events: ["PRACTICE_TRANSFER_HOLD_ADJUST"],
    },
    {
      key: practiceTransferHoldAbutmentKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferHoldLabKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferHoldKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferLegacySpendKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_COMMIT"],
    },
    {
      key: practiceTransferLabShippingKey(id),
      events: ["SHIPPING_SPEND_COMMIT"],
    },
  ];

  const journalEventById = new Map();

  for (const { key, events } of keys) {
    const existing = await getJournalByIdempotencyKey({
      idempotencyKey: key,
      session: outerSession,
    });
    const jid = String(existing?.journalId || "").trim();
    if (!jid) continue;
    journalEventById.set(jid, events);
  }

  // 키 누락·과거 포맷·디자인비 ADJUST 보강: refType+refId 스윕
  const byRef = await LedgerJournal.find({
    refType: "PRACTICE_TRANSFER",
    refId: { $in: [transferOid, id] },
    eventType: { $in: PRACTICE_TRANSFER_ROLLBACK_EVENT_TYPES },
  })
    .select({ journalId: 1, eventType: 1 })
    .session(outerSession || null)
    .lean();

  for (const row of byRef || []) {
    const jid = String(row?.journalId || "").trim();
    if (!jid) continue;
    if (!journalEventById.has(jid)) {
      journalEventById.set(jid, PRACTICE_TRANSFER_ROLLBACK_EVENT_TYPES);
    }
  }

  if (journalEventById.size === 0) {
    return {
      didRollback: false,
      reason: "no_spend",
      deletedJournalIds: [],
      balanceRestoreByAnchor: {},
    };
  }

  const journalIds = [...journalEventById.keys()];
  const lines = await LedgerLine.find({ journalId: { $in: journalIds } })
    .select({ journalId: 1, accountCode: 1, ownerId: 1, amount: 1 })
    .session(outerSession || null)
    .lean();

  const balanceRestoreByAnchor = {};
  for (const line of lines || []) {
    const code = String(line?.accountCode || "").trim();
    if (!PRACTICE_TRANSFER_BALANCE_ACCOUNT_CODES.has(code)) continue;
    const ownerId = String(line?.ownerId || "").trim();
    if (!ownerId || !Types.ObjectId.isValid(ownerId)) continue;
    const amount = Number(line?.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    // 소비(-) 삭제 → 잔액 복원(+). 적립(+) 삭제 → 잔액 차감(-).
    balanceRestoreByAnchor[ownerId] =
      Number(balanceRestoreByAnchor[ownerId] || 0) - amount;
  }

  let didRollback = false;
  let lastReason = "no_spend";
  const deletedJournalIds = [];

  for (const [journalId, events] of journalEventById.entries()) {
    const deleteResult = await deleteGeneralLedgerCommitJournal({
      journalId,
      expectedEventTypes: events,
      session: outerSession,
    });
    if (deleteResult?.deleted) {
      didRollback = true;
      lastReason = null;
      deletedJournalIds.push(journalId);
    } else {
      lastReason = deleteResult?.reason || lastReason;
    }
  }

  if (didRollback) {
    const affectedAnchorIds = Object.keys(balanceRestoreByAnchor);
    for (const anchorId of affectedAnchorIds) {
      try {
        await upsertBusinessCreditBalanceFromLedger({
          businessAnchorId: anchorId,
          session: outerSession,
        });
      } catch {
        // best-effort cache; ledger lines are SSOT
      }
    }

    if (emitRealtime) {
      try {
        const { emitCreditBalanceUpdatedToBusiness } = await import(
          "../utils/creditRealtime.js"
        );
        await Promise.all(
          affectedAnchorIds.map((anchorId) =>
            emitCreditBalanceUpdatedToBusiness({
              businessAnchorId: anchorId,
              balanceDelta: Number(balanceRestoreByAnchor[anchorId] || 0),
              reason: "practice_transfer_billing_rollback",
              refId: id,
              forceEmit: true,
            }),
          ),
        );
      } catch {
        // best-effort
      }
    }
  }

  return {
    didRollback,
    reason: didRollback ? null : lastReason,
    deletedJournalIds,
    balanceRestoreByAnchor,
  };
}

function relationshipKindFromPartner(partner) {
  return partner?.status === "active" || partner?.status === "referred"
    ? partner.status
    : "none";
}

function implantFavoritesFromPractice(practice) {
  const raw = practice?.practiceTransferSettings?.implantFavorites;
  return Array.isArray(raw) ? raw : [];
}

export function toFeeQuoteApi(quote) {
  const fees = quote?.fees || {};
  const billed = Boolean(quote?.billed);
  const labAbutmentTotal = Math.max(
    0,
    Math.round(Number(fees.labAbutmentTotal || 0)),
  );
  const rawLines = Array.isArray(fees.lines) ? fees.lines : [];
  return {
    labFeeTotal: Math.max(0, Math.round(Number(fees.labFeeTotal || 0))),
    labAbutmentTotal,
    labAbutmentPending:
      Boolean(fees.labAbutmentPending) || labAbutmentTotal > 0,
    abutmentRetailTotal: Math.max(
      0,
      Math.round(Number(fees.abutmentRetailTotal || 0)),
    ),
    abutmentQuotePending: Boolean(fees.abutmentQuotePending),
    abutmentQty: Math.max(0, Math.round(Number(fees.abutmentQty || 0))),
    total: Math.max(0, Math.round(Number(fees.total || 0))),
    lines: billed ? stripLabFeeMinFromFeeLines(rawLines) : rawLines,
    relationshipKind:
      quote?.relationshipKind === "active" || quote?.relationshipKind === "referred"
        ? quote.relationshipKind
        : "none",
    feeRateApplied: Number(quote?.feeRateApplied || 0),
    labFeeMultiplier: normalizeLabFeeMultiplier(
      quote?.labFeeMultiplier ?? quote?.fees?.labFeeMultiplier,
    ),
    labSettlementAmount: Math.max(
      0,
      Math.round(Number(quote?.labSettlementAmount || 0)),
    ),
    abutsRevenueAmount: Math.max(
      0,
      Math.round(Number(quote?.abutsRevenueAmount || 0)),
    ),
    labTradingPartnerId: quote?.labTradingPartnerId || null,
    billed,
    usedDefaultSchedule: Boolean(quote?.usedDefaultSchedule),
    isRemake: Boolean(quote?.isRemake || quote?.remake),
    autoMatchBudget: billed
      ? null
      : normalizeAutoMatchBudget(quote?.autoMatchBudget),
  };
}

export function toBillingPreviewFields(quote) {
  const api = toFeeQuoteApi(quote);
  return {
    labFeeTotal: api.labFeeTotal,
    abutmentRetailTotal: api.abutmentRetailTotal,
    abutmentQty: api.abutmentQty,
    total: api.total,
    isTradingPartner: api.relationshipKind === "active",
    relationshipKind: api.relationshipKind,
    feeRateApplied: api.feeRateApplied,
    labFeeMultiplier: api.labFeeMultiplier,
    labTradingPartnerId: api.labTradingPartnerId,
    labSettlementAmount: api.labSettlementAmount,
    abutsRevenueAmount: api.abutsRevenueAmount,
    billedAt: null,
    isRemake: Boolean(api.isRemake),
    autoMatchBudget: api.autoMatchBudget || undefined,
  };
}

/** 청구 완료 견적 라인에서 예산 하한(labFeeMin) 제거. */
function stripLabFeeMinFromFeeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  return lines.map((line) => {
    if (!line || typeof line !== "object" || line.labFeeMin == null) {
      return line;
    }
    const { labFeeMin: _omit, ...rest } = line;
    return rest;
  });
}

export function feeQuoteFromBillingDoc(billing, { lines = [], billed = false } = {}) {
  const total = Math.max(0, Math.round(Number(billing?.total || 0)));
  const feeRateApplied = Number(billing?.feeRateApplied || 0);
  const labSettlementAmount = Math.max(
    0,
    Math.round(Number(billing?.labSettlementAmount || 0)),
  );
  const abutsRevenueAmount = Math.max(
    0,
    Math.round(Number(billing?.abutsRevenueAmount || total - labSettlementAmount)),
  );
  return toFeeQuoteApi({
    fees: {
      labFeeTotal: billing?.labFeeTotal || 0,
      labAbutmentTotal: billing?.labAbutmentTotal || 0,
      labAbutmentPending: Boolean(billing?.labAbutmentPending),
      abutmentRetailTotal: billing?.abutmentRetailTotal || 0,
      abutmentQuotePending: Boolean(billing?.abutmentQuotePending),
      abutmentQty: billing?.abutmentQty || 0,
      total,
      lines: billed ? stripLabFeeMinFromFeeLines(lines) : lines,
      labFeeMultiplier: billing?.labFeeMultiplier,
    },
    relationshipKind: billing?.relationshipKind || "none",
    feeRateApplied,
    labFeeMultiplier: billing?.labFeeMultiplier,
    labSettlementAmount,
    abutsRevenueAmount,
    labTradingPartnerId: billing?.labTradingPartnerId
      ? String(billing.labTradingPartnerId)
      : null,
    billed,
    usedDefaultSchedule: false,
    isRemake: Boolean(billing?.isRemake),
    // 청구 완료 후에는 예산 구간 대신 확정 금액만 노출
    autoMatchBudget: billed
      ? null
      : normalizeAutoMatchBudget(billing?.autoMatchBudget),
  });
}

/** 기공비·크레딧 단가 저장 시 quote-context 캐시 무효화. */
export function invalidatePracticeTransferQuoteCaches(labAnchorId = null) {
  invalidateRequestPerfCacheByPrefix("practice-transfer:abutment-prices");
  const labId = String(labAnchorId || "").trim();
  if (labId) {
    invalidateRequestPerfCacheByPrefix(
      `practice-transfer:quote-context:${labId}:`,
    );
    return;
  }
  invalidateRequestPerfCacheByPrefix("practice-transfer:quote-context:");
}

/**
 * 기공의뢰 견적(치과 크레딧 소비액 + 기공소 수령액).
 * labAnchorId 없으면 기본수가 없음(0원).
 */
export async function buildPracticeTransferQuote({
  practiceAnchorId = null,
  labAnchorId = null,
  toothWorks,
  labFeeSchedule = undefined,
  abutmentRetailPrice: _abutmentRetailPrice = undefined,
  payoutRates = undefined,
  relationshipKind = undefined,
  labTradingPartnerId = undefined,
  remake = false,
  matchingMode = undefined,
  autoMatchBudget = undefined,
  catalog: catalogInput = undefined,
}) {
  let schedule = labFeeSchedule;
  const labId = String(labAnchorId || "").trim();
  const usedDefaultSchedule = !labId;
  const loadedFromDb = schedule == null;
  const needLab = loadedFromDb && labId && Types.ObjectId.isValid(labId);
  const needPartner = relationshipKind == null;
  const needRates = payoutRates == null;

  const practiceId = String(practiceAnchorId || "").trim();
  const needFavorites = practiceId && Types.ObjectId.isValid(practiceId);
  const needBudget =
    autoMatchBudget === undefined &&
    needFavorites &&
    (!labId || String(matchingMode || "").trim() === "auto");
  const needCatalog =
    catalogInput === undefined && (usedDefaultSchedule || needBudget);
  const [lab, practice, abutmentPricingTier, abutmentPrices, partner, cachedRates, catalog] =
    await Promise.all([
      needLab
        ? BusinessAnchor.findById(labId)
            .select({ labFeeSchedule: 1, labPracticeFeeMultipliers: 1 })
            .lean()
        : Promise.resolve(null),
      needFavorites
        ? BusinessAnchor.findById(practiceId)
            .select({
              "practiceTransferSettings.implantFavorites": 1,
              "practiceTransferSettings.autoMatchBudget": 1,
            })
            .lean()
        : Promise.resolve(null),
      resolvePracticeAbutmentPricingTier(practiceAnchorId),
      loadCachedAbutmentCreditPrices(practiceAnchorId),
      needPartner
        ? findLabPracticeRelationship({ labAnchorId, practiceAnchorId })
        : Promise.resolve(null),
      needRates ? loadCachedDevopsPayoutRates() : Promise.resolve(payoutRates),
      catalogInput !== undefined
        ? Promise.resolve(catalogInput)
        : needCatalog
          ? loadAutoMatchBudgetCatalog()
          : Promise.resolve(null),
    ]);

  const resolvedBudgetRaw =
    autoMatchBudget !== undefined
      ? autoMatchBudget
      : needBudget
        ? practice?.practiceTransferSettings?.autoMatchBudget
        : autoMatchBudget;
  const resolvedBudget = usedDefaultSchedule
    ? resolveAutoMatchBudgetOrDefaults(resolvedBudgetRaw, catalog)
    : normalizeAutoMatchBudget(resolvedBudgetRaw, catalog);

  if (schedule == null) {
    schedule = lab?.labFeeSchedule || null;
  }

  const labFeeConfigured = usedDefaultSchedule
    ? true
    : isLabFeeScheduleConfigured(schedule);

  const isAutoMatchQuote =
    String(matchingMode || "").trim() === "auto" || usedDefaultSchedule;

  if (usedDefaultSchedule) {
    schedule = buildScheduleFromAutoMatchBudget(resolvedBudget, "max", catalog);
  } else if (loadedFromDb) {
    schedule = resolveLabFeeScheduleSource(schedule);
  }

  const useRemake = Boolean(remake);
  // 자동매칭 v4: 고정수가·할증 없음. 지정만 live 할증.
  const labFeeMultiplier = isAutoMatchQuote
    ? 1
    : resolveLabPracticeFeeMultiplier(lab, practiceId);
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    implantFavorites: implantFavoritesFromPractice(practice),
    labFeeSchedule: schedule,
    abutmentPricingTier,
    abutmentPrices,
    remake: useRemake,
    skipAbutmentFees: useRemake,
    labFeeMultiplier,
  });

  let autoMatchBudgetOut = null;
  if (usedDefaultSchedule && resolvedBudget) {
    const minFees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites: implantFavoritesFromPractice(practice),
      labFeeSchedule: buildScheduleFromAutoMatchBudget(
        resolvedBudget,
        "min",
        catalog,
      ),
      abutmentPricingTier,
      abutmentPrices,
      remake: useRemake,
      skipAbutmentFees: true,
      labFeeMultiplier: 1,
    });
    fees.lines = attachLabFeeMinToLines(fees.lines, minFees.lines);
    autoMatchBudgetOut = {
      ...resolvedBudget,
      minLabFee: minFees.labFeeTotal,
      maxLabFee: fees.labFeeTotal,
    };
  }

  let kind = relationshipKind;
  let partnerId =
    labTradingPartnerId != null ? labTradingPartnerId : null;
  if (kind == null) {
    kind = relationshipKindFromPartner(partner);
    partnerId = partner?._id ? String(partner._id) : null;
  }

  const rates = cachedRates;

  const resolvedMatchingMode =
    String(matchingMode || "").trim() === "auto"
      ? "auto"
      : matchingMode == null && !labId
        ? "auto"
        : "direct";
  const feeRateApplied = resolvePracticeTransferFeeRate({
    matchingMode: resolvedMatchingMode,
    payoutRates: rates,
  });
  const { abutsRevenueAmount, labSettlementAmount } =
    splitPracticeTransferSettlement({
      labFeeTotal: fees.labFeeTotal,
      abutmentRetailTotal: fees.abutmentRetailTotal,
      feeRateApplied,
    });

  return {
    fees,
    relationshipKind: kind === "active" || kind === "referred" ? kind : "none",
    feeRateApplied,
    labFeeMultiplier,
    labSettlementAmount,
    abutsRevenueAmount,
    labTradingPartnerId: partnerId,
    usedDefaultSchedule,
    labFeeConfigured,
    billed: false,
    isRemake: useRemake,
    remake: useRemake,
    abutmentPricingTier,
    abutmentPrices,
    abutmentRetailPrice: 0,
    autoMatchBudget: autoMatchBudgetOut,
    abutsLabFeeCatalog: catalog || undefined,
    schedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeSchedule(schedule),
    remakeSchedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeRemakeSchedule(schedule),
    items: usedDefaultSchedule
      ? normalizeLabFeeItems(
          buildScheduleFromAutoMatchBudget(resolvedBudget, "max", catalog),
        )
      : normalizeLabFeeItems(schedule),
  };
}

export async function quotePracticeTransferFees({
  labAnchorId,
  toothWorks,
  practiceAnchorId = null,
}) {
  return buildPracticeTransferQuote({
    labAnchorId,
    practiceAnchorId,
    toothWorks,
  });
}

export async function loadPracticeTransferQuoteContext({
  labAnchorId = null,
  practiceAnchorId = null,
}) {
  const cacheKey = `practice-transfer:quote-context:${String(labAnchorId || "none")}:${String(practiceAnchorId || "none")}`;
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached && typeof cached === "object") return cached;

  return withRequestPerfInFlight(cacheKey, async () => {
    const quote = await buildPracticeTransferQuote({
      labAnchorId,
      practiceAnchorId,
      toothWorks: [],
      matchingMode: labAnchorId ? "direct" : "auto",
    });
    const context = {
      schedule: quote.schedule,
      remakeSchedule: quote.remakeSchedule || LAB_FEE_SCHEDULE_ZEROS,
      items: quote.items || normalizeLabFeeItems(quote.schedule),
      abutmentRetailPrice: quote.abutmentRetailPrice,
      abutmentPricingTier: quote.abutmentPricingTier || "regular",
      abutmentPrices: quote.abutmentPrices,
      relationshipKind: quote.relationshipKind,
      feeRateApplied: quote.feeRateApplied,
      labFeeMultiplier: normalizeLabFeeMultiplier(quote.labFeeMultiplier),
      usedDefaultSchedule: quote.usedDefaultSchedule,
      labFeeConfigured: quote.labFeeConfigured !== false,
      autoMatchBudget: quote.autoMatchBudget || null,
      abutsLabFeeCatalog: quote.abutsLabFeeCatalog || null,
    };
    setRequestPerfCacheValue(cacheKey, context, QUOTE_LOOKUP_CACHE_TTL_MS);
    return context;
  });
}

/**
 * 목록/상세용 견적. 과금 완료 건은 스냅샷 금액 유지.
 * 미청구·지정·수락된 자동매칭: billing.labFeeMultiplier 스냅샷(할증 소급 금지).
 * 미청구·자동매칭 공개풀: 의뢰 createdAt 기준 as-of(history).
 */
export async function buildFeeQuotesForTransferDocs({
  docs,
  viewingLabAnchorId = null,
}) {
  const list = Array.isArray(docs) ? docs : [];
  if (list.length === 0) return new Map();

  const labIds = new Set();
  const practiceIds = new Set();
  const viewerLabId = String(viewingLabAnchorId || "").trim();
  if (viewerLabId && Types.ObjectId.isValid(viewerLabId)) labIds.add(viewerLabId);
  for (const doc of list) {
    const labId = String(
      doc?.targetLabAnchorId?._id || doc?.targetLabAnchorId || "",
    ).trim();
    if (labId && Types.ObjectId.isValid(labId)) labIds.add(labId);
    const practiceId = String(
      doc?.practiceBusinessAnchorId?._id || doc?.practiceBusinessAnchorId || "",
    ).trim();
    if (practiceId && Types.ObjectId.isValid(practiceId)) practiceIds.add(practiceId);
  }

  const labIdList = [...labIds];
  const practiceIdList = [...practiceIds];
  const [payoutRates, abutmentPricesBase, labs, practices, partners, creditSettings, labRatingMap] =
    await Promise.all([
      loadCachedDevopsPayoutRates(),
      loadCachedAbutmentCreditPrices(),
      labIdList.length
        ? BusinessAnchor.find({ _id: { $in: labIdList } })
            .select({ labFeeSchedule: 1, labPracticeFeeMultipliers: 1 })
            .lean()
        : Promise.resolve([]),
      practiceIdList.length
        ? BusinessAnchor.find({ _id: { $in: practiceIdList } })
            .select({
              practiceMembershipActive: 1,
              "practiceTransferSettings.implantFavorites": 1,
            })
            .lean()
        : Promise.resolve([]),
      labIdList.length && practiceIdList.length
        ? LabTradingPartner.find({
            labAnchorId: { $in: labIdList.map((id) => new Types.ObjectId(id)) },
            practiceAnchorId: {
              $in: practiceIdList.map((id) => new Types.ObjectId(id)),
            },
            status: { $in: ["active", "referred"] },
          })
            .select({ labAnchorId: 1, practiceAnchorId: 1, status: 1 })
            .lean()
        : Promise.resolve([]),
      loadCreditSettingsDefaults(),
      // 기공소 수신·수락 확정 견적용 유효 별점
      labIdList.length
        ? loadGlobalLabRatingAggregates({ labAnchorIds: labIdList })
        : Promise.resolve(new Map()),
    ]);

  const labEffectiveStarsById = new Map();
  for (const labId of labIdList) {
    labEffectiveStarsById.set(
      labId,
      toLabRatingSummaryApi(labRatingMap.get(labId)).effectiveStars,
    );
  }
  const viewerLabEffectiveStars = viewerLabId
    ? labEffectiveStarsById.get(viewerLabId) ?? DEFAULT_EFFECTIVE_LAB_STARS
    : DEFAULT_EFFECTIVE_LAB_STARS;

  const abutmentPricesForPractice = (practiceId) =>
    normalizeAbutsAbutmentCreditPrices(
      applySpecialRequestorPricesToCreditSettings(
        {
          ...creditSettings,
          ...abutmentPricesBase,
        },
        practiceId,
      ),
    );

  const scheduleByLab = new Map(
    labs.map((lab) => [String(lab._id), lab.labFeeSchedule || null]),
  );
  const multiplierByLab = new Map(
    labs.map((lab) => [String(lab._id), lab]),
  );

  const pairKey = (labId, practiceId) => `${labId}:${practiceId}`;
  const membershipByPractice = new Map(
    practices.map((practice) => [
      String(practice._id),
      Boolean(practice.practiceMembershipActive),
    ]),
  );
  const favoritesByPractice = new Map(
    practices.map((practice) => [
      String(practice._id),
      implantFavoritesFromPractice(practice),
    ]),
  );
  const partnerByPair = new Map();
  for (const partner of partners) {
    partnerByPair.set(
      pairKey(String(partner.labAnchorId), String(partner.practiceAnchorId)),
      partner,
    );
  }

  const out = new Map();
  for (const doc of list) {
    const docId = String(doc?._id || "");
    const toothWorks = Array.isArray(doc?.toothWorks) ? doc.toothWorks : [];
    const targetLabId = String(
      doc?.targetLabAnchorId?._id || doc?.targetLabAnchorId || "",
    ).trim();
    const practiceId = String(
      doc?.practiceBusinessAnchorId?._id || doc?.practiceBusinessAnchorId || "",
    ).trim();
    const openPool = isAutoMatchOpenPool(doc);
    const quoteLabId = viewerLabId && (openPool || !targetLabId) ? viewerLabId : targetLabId;
    const billing = doc?.billing && typeof doc.billing === "object" ? doc.billing : null;
    const billed = Boolean(billing?.billedAt);
    // 과금 완료만 금액 스냅샷 고정. 미청구는 현재 수가로 재계산.
    const useStored = billed;

    const schedule = quoteLabId ? scheduleByLab.get(quoteLabId) : null;
    const noLab = !quoteLabId;
    const remake = isPracticeTransferRemake(doc);
    const abutmentPricingTier = resolveAbutsAbutmentPricingTier({
      practiceMembershipActive: Boolean(membershipByPractice.get(practiceId)),
    });
    const implantFavorites = favoritesByPractice.get(practiceId) || [];
    // 지정·수락됨: billing 스냅샷(있으면). 공개풀·스냅 없는 자동매칭: as-of(history).
    const snapLabFeeMultiplier = normalizeLabFeeMultiplier(
      billing?.labFeeMultiplier,
    );
    const liveLabFeeMultiplier = resolveLabPracticeFeeMultiplier(
      quoteLabId ? multiplierByLab.get(quoteLabId) : null,
      practiceId,
    );
    const asOfLabFeeMultiplier = resolveLabPracticeFeeMultiplierAsOf(
      quoteLabId ? multiplierByLab.get(quoteLabId) : null,
      practiceId,
      doc?.createdAt,
    );
    const matchingMode =
      String(doc?.matchingMode || "").trim() === "auto" ? "auto" : "direct";
    const storedBudget = normalizeAutoMatchBudget(billing?.autoMatchBudget);
    // v4 자동매칭: 수신 기공소가 있어도 플랫폼 고정수가(별점배수) — 기공소 스케줄/할증 금지.
    const useAutoFixedFee = matchingMode === "auto" && Boolean(storedBudget);
    const feeLabFeeMultiplier = useAutoFixedFee
      ? 1
      : openPool
        ? asOfLabFeeMultiplier
        : snapLabFeeMultiplier > 1 || matchingMode === "direct"
          ? snapLabFeeMultiplier
          : asOfLabFeeMultiplier;
    const remakeLabFeeMultiplier = liveLabFeeMultiplier;
    // 기공소 본인 수신·수락 확정: 유효 별점 확정가. 그 외 미확정: 상한(에스크로·구간).
    const autoScheduleMax = storedBudget
      ? buildScheduleFromAutoMatchBudget(storedBudget, "max")
      : null;
    const quoteForViewingLab =
      Boolean(viewerLabId) &&
      Boolean(quoteLabId) &&
      String(quoteLabId) === viewerLabId;
    const useLabStarFeeSchedule =
      useAutoFixedFee &&
      Boolean(quoteLabId) &&
      (quoteForViewingLab || billed);
    const labStarsForFee = quoteLabId
      ? labEffectiveStarsById.get(String(quoteLabId)) ??
        DEFAULT_EFFECTIVE_LAB_STARS
      : viewerLabEffectiveStars;
    const autoScheduleForFee =
      useLabStarFeeSchedule
        ? buildAutoMatchFeeScheduleForLab({
            budget: storedBudget,
            labEffectiveStars: labStarsForFee,
          }) || autoScheduleMax
        : autoScheduleMax;
    const feeSchedule = useAutoFixedFee
      ? autoScheduleForFee || LAB_FEE_SCHEDULE_ZEROS
      : noLab
        ? autoScheduleMax || LAB_FEE_SCHEDULE_ZEROS
        : resolveLabFeeScheduleSource(schedule);
    const abutmentPrices = abutmentPricesForPractice(practiceId);
    const remakeFees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites,
      labFeeSchedule: feeSchedule,
      abutmentPricingTier,
      abutmentPrices,
      remake: true,
      skipAbutmentFees: true,
      labFeeMultiplier: remakeLabFeeMultiplier,
    });
    const fees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites,
      labFeeSchedule: feeSchedule,
      abutmentPricingTier,
      abutmentPrices,
      remake,
      skipAbutmentFees: remake,
      labFeeMultiplier: feeLabFeeMultiplier,
    });

    let autoMatchBudgetOut = null;
    // 미확정만 하한~상한 부착. 청구 완료(billed)는 확정 단일가.
    if (!billed && (useAutoFixedFee || (noLab && storedBudget))) {
      const minFees = computePracticeTransferRetailFees({
        toothWorks,
        implantFavorites,
        labFeeSchedule: buildScheduleFromAutoMatchBudget(storedBudget, "min"),
        abutmentPricingTier,
        abutmentPrices,
        remake,
        skipAbutmentFees: true,
        labFeeMultiplier: 1,
      });
      const maxFeesForBand =
        useLabStarFeeSchedule && autoScheduleMax
          ? computePracticeTransferRetailFees({
              toothWorks,
              implantFavorites,
              labFeeSchedule: autoScheduleMax,
              abutmentPricingTier,
              abutmentPrices,
              remake,
              skipAbutmentFees: remake,
              labFeeMultiplier: 1,
            })
          : fees;
      fees.lines = attachLabFeeMinToLines(fees.lines, minFees.lines);
      autoMatchBudgetOut = {
        ...storedBudget,
        minLabFee: minFees.labFeeTotal,
        maxLabFee: maxFeesForBand.labFeeTotal,
      };
    }

    const partner = quoteLabId && practiceId
      ? partnerByPair.get(pairKey(quoteLabId, practiceId))
      : null;
    const kind = relationshipKindFromPartner(partner);
    const feeRateApplied = resolvePracticeTransferFeeRate({
      matchingMode,
      payoutRates,
    });
    const remakeFeeRateApplied = resolvePracticeTransferFeeRate({
      matchingMode: "direct",
      payoutRates,
    });
    const remakeSplit = splitPracticeTransferSettlement({
      labFeeTotal: remakeFees.labFeeTotal,
      abutmentRetailTotal: remakeFees.abutmentRetailTotal,
      feeRateApplied: remakeFeeRateApplied,
    });
    const remakeFeeQuote = toFeeQuoteApi({
      fees: remakeFees,
      relationshipKind: kind,
      feeRateApplied: remakeFeeRateApplied,
      labFeeMultiplier: remakeLabFeeMultiplier,
      labSettlementAmount: remakeSplit.labSettlementAmount,
      abutsRevenueAmount: remakeSplit.abutsRevenueAmount,
      labTradingPartnerId: partner?._id ? String(partner._id) : null,
      billed: false,
      usedDefaultSchedule: useAutoFixedFee || !quoteLabId,
      isRemake: true,
      autoMatchBudget: autoMatchBudgetOut,
    });

    if (useStored) {
      const storedQuote = feeQuoteFromBillingDoc(billing, {
        lines: fees.lines,
        billed,
      });
      // 청구 완료(billed): 예산 구간(autoMatchBudget)을 다시 붙이지 않는다.
      // 기공소 본인 수신: 구 상한 스냅샷 labFeeTotal과 별점 확정 라인이 어긋나면
      // 표시·수령 보조계산을 라인과 같은 확정 스케줄로 맞춘다(치과 뷰는 스냅샷 유지).
      const starLabFeeTotal = Math.max(
        0,
        Math.round(Number(fees.labFeeTotal || 0)),
      );
      const snapLabFeeTotal = Math.max(
        0,
        Math.round(Number(billing?.labFeeTotal || 0)),
      );
      const alignLabViewToStarFee =
        Boolean(viewerLabId) &&
        quoteForViewingLab &&
        useLabStarFeeSchedule &&
        starLabFeeTotal > 0 &&
        starLabFeeTotal !== snapLabFeeTotal;
      if (alignLabViewToStarFee) {
        const split = splitPracticeTransferSettlement({
          labFeeTotal: starLabFeeTotal,
          abutmentRetailTotal: Math.max(
            0,
            Math.round(
              Number(
                billing?.abutmentRetailTotal ?? fees.abutmentRetailTotal ?? 0,
              ),
            ),
          ),
          feeRateApplied,
        });
        out.set(docId, {
          ...storedQuote,
          labFeeTotal: starLabFeeTotal,
          labSettlementAmount: split.labSettlementAmount,
          abutsRevenueAmount: split.abutsRevenueAmount,
          remakeFeeQuote,
        });
      } else {
        out.set(docId, {
          ...storedQuote,
          remakeFeeQuote,
        });
      }
      continue;
    }

    const { abutsRevenueAmount, labSettlementAmount } =
      splitPracticeTransferSettlement({
        labFeeTotal: fees.labFeeTotal,
        abutmentRetailTotal: fees.abutmentRetailTotal,
        feeRateApplied,
      });
    out.set(
      docId,
      {
        ...toFeeQuoteApi({
          fees,
          relationshipKind: kind,
          feeRateApplied,
          labFeeMultiplier: feeLabFeeMultiplier,
          labSettlementAmount,
          abutsRevenueAmount,
          labTradingPartnerId: partner?._id ? String(partner._id) : null,
          billed: false,
          usedDefaultSchedule: useAutoFixedFee || !quoteLabId,
          isRemake: remake,
          autoMatchBudget: autoMatchBudgetOut,
        }),
        remakeFeeQuote,
      },
    );
  }
  return out;
}

/**
 * 기공의뢰 CA: 수락 기공소가 디자인을 올리면 어벗디자인비 지급.
 * 크레딧 흐름 SSOT:
 *   치과 →(디자인+생산가, 멤버 2.5만/일반 4만)→ 어벗츠
 *   어벗츠 →(abutmentDesignLabFee, 기본 1만)→ 기공소
 *   어벗츠 생산 몫(멤버 1.5만/일반 2만)은 제조 의뢰비로 표시·제조사 정산(9,900) 재원.
 * REV_DEVOPS → LAB_SETTLEMENT_CREDIT (idempotent per Request).
 */
export async function grantAbutmentDesignLabFee({
  requestDoc,
  transferId = null,
  labAnchorId = null,
  actorUserId = null,
}) {
  const requestId = requestDoc?._id ? String(requestDoc._id) : "";
  if (!requestId || !Types.ObjectId.isValid(requestId)) {
    return { granted: false, reason: "missing_request" };
  }

  const resolvedLabAnchorId = String(
    labAnchorId || requestDoc?.businessAnchorId || "",
  ).trim();
  if (!resolvedLabAnchorId || !Types.ObjectId.isValid(resolvedLabAnchorId)) {
    return { granted: false, reason: "missing_lab" };
  }

  const creditSettings = await loadCreditSettingsDefaults();
  const unitFee = Math.max(
    0,
    Math.round(Number(creditSettings?.abutmentDesignLabFee ?? 10000) || 0),
  );
  const { countDesignAbutmentQty } = await import(
    "../controllers/requests/designPrice.utils.js"
  );
  const qty = Math.max(1, countDesignAbutmentQty(requestDoc?.caseInfos) || 1);
  const amount = unitFee * qty;
  if (amount <= 0) {
    return { granted: false, reason: "zero_amount", unitFee, qty };
  }

  const relatedTransferId = String(
    transferId ||
      requestDoc?.partnerBilling?.relatedPracticeTransferId ||
      "",
  ).trim();
  let skipJig = false;
  if (relatedTransferId && Types.ObjectId.isValid(relatedTransferId)) {
    try {
      const PracticeTransfer = (
        await import("../models/practiceTransfer.model.js")
      ).default;
      const ptx = await PracticeTransfer.findById(relatedTransferId)
        .select({ "production.skipJig": 1 })
        .lean();
      skipJig = Boolean(ptx?.production?.skipJig);
    } catch {
      skipJig = false;
    }
  }
  const designFeeLabel = skipJig ? "디자인비" : "디자인비+지그제작비";

  const idempotencyKey = `gl:request:${requestId}:abutment_design_fee`;
  const existing = await getJournalByIdempotencyKey({ idempotencyKey });
  if (existing) {
    return {
      granted: false,
      reason: "already_granted",
      journalId: existing.journalId,
      amount,
      unitFee,
      qty,
    };
  }

  const devopsAnchorId = await resolveDevopsEscrowOwnerId();
  if (!devopsAnchorId) {
    return { granted: false, reason: "missing_devops" };
  }

  const journal = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "ADJUST",
    businessAnchorId: resolvedLabAnchorId,
    refType: relatedTransferId ? "PRACTICE_TRANSFER" : "REQUEST",
    refId: relatedTransferId || requestId,
    createdBy: actorUserId || null,
    meta: {
      source: "abutment_design_lab_fee",
      displayKind: "lab_credit",
      displayLabel: designFeeLabel,
      requestId,
      relatedPracticeTransferId: relatedTransferId || null,
      unitFee,
      qty,
      amount,
      skipJig,
    },
    lines: [
      {
        accountCode: "REV_DEVOPS",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -amount,
        amountExcludingVat: -amount,
        vatAmount: 0,
        creditKind: null,
        refType: "REQUEST",
        refId: requestId,
        meta: {
          source: "abutment_design_lab_fee",
          displayLabel: designFeeLabel,
        },
      },
      {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: resolvedLabAnchorId,
        amount,
        amountExcludingVat: amount,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "REQUEST",
        refId: requestId,
        meta: {
          source: "abutment_design_lab_fee",
          displayKind: "lab_credit",
          displayLabel: designFeeLabel,
          itemLabel: designFeeLabel,
          unitFee,
          qty,
        },
      },
    ],
  });

  if (journal?.posted) {
    try {
      const { emitCreditBalanceUpdatedToBusiness } = await import(
        "../utils/creditRealtime.js"
      );
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: resolvedLabAnchorId,
        balanceDelta: amount,
        reason: "abutment_design_lab_fee",
        refId: journal.journalId || requestId,
      });
    } catch {
      // best-effort realtime
    }
  }

  return {
    granted: Boolean(journal?.posted),
    reason: journal?.posted ? "posted" : "not_posted",
    journalId: journal?.journalId || null,
    amount,
    unitFee,
    qty,
  };
}

/**
 * 기공소 출발 배송비(치과→기공소). mark-complete 시 1회.
 * - 기공 보철/기공소어벗이 있거나, CA 디자인+지그(!skipJig)이면 차감
 * - skipJig 이고 기공 보철이 없으면 면제
 */
export async function chargePracticeTransferLabShipping({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { charged: false, reason: "missing_anchors" };
  }

  const remake = isPracticeTransferRemake(transfer);
  const computed =
    toothWorks || transfer?.toothWorks
      ? computePracticeTransferRetailFees({
          toothWorks: toothWorks || transfer?.toothWorks || [],
          remake,
          skipAbutmentFees: remake,
        })
      : null;
  const fees = {
    labFeeTotal: Math.max(
      0,
      Math.round(
        Number(
          transfer?.billing?.labFeeTotal ?? computed?.labFeeTotal ?? 0,
        ) || 0,
      ),
    ),
    labAbutmentTotal: Math.max(
      0,
      Math.round(Number(computed?.labAbutmentTotal ?? 0) || 0),
    ),
    abutmentQty: Math.max(
      0,
      Math.round(
        Number(
          transfer?.billing?.abutmentQty ?? computed?.abutmentQty ?? 0,
        ) || 0,
      ),
    ),
  };

  if (!shouldChargePracticeTransferLabShipping({ transfer, fees })) {
    return {
      charged: false,
      reason: transfer?.production?.skipJig
        ? "skip_jig_waived"
        : "no_lab_origin",
    };
  }

  const creditSettingsPromise = loadCreditSettingsDefaults();
  const spendUniqueKey = `practice_transfer:${String(transferId)}:lab_shipping`;
  const idempotencyKey = `gl:${spendUniqueKey}`;
  const [creditSettings, existing] = await Promise.all([
    creditSettingsPromise,
    getJournalByIdempotencyKey({
      idempotencyKey,
      session: outerSession,
    }),
  ]);
  const fee = Math.max(
    0,
    Math.round(Number(creditSettings?.shippingFee ?? 3500) || 0),
  );
  if (fee <= 0) {
    return { charged: false, reason: "zero_fee" };
  }

  if (existing?.journalId) {
    return {
      charged: false,
      reason: "already_charged",
      journalId: existing.journalId,
      amount: fee,
    };
  }

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);

    const spendResult = await spendShippingCreditAtomic({
      businessAnchorId: practiceAnchorId,
      spendUniqueKey,
      actorUserId,
      fee,
      session,
    });

    if (!spendResult?.didSpend) {
      if (ownSession) await session.abortTransaction();
      return {
        charged: false,
        reason: spendResult?.reason || "not_spent",
        amount: fee,
      };
    }

    const owners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const spendMeta = {
      spendUniqueKey,
      usageKind: "practice_transfer_lab_shipping",
      displayKind: "shipping",
      displayLabel: "배송비(치과→기공소)",
      fromPaid: spendResult.fromPaid,
      fromFreeRequest: spendResult.fromFreeRequest,
      fromFreeShipping: spendResult.fromFreeShipping,
    };
    const lines = [
      ...buildPracticeDebitLines({
        split: {
          fromPaid: Number(spendResult.fromPaid || 0),
          fromFreeRequest: Number(spendResult.fromFreeRequest || 0),
          fromFreeShipping: Number(spendResult.fromFreeShipping || 0),
        },
        practiceAnchorId,
        transferId,
        meta: spendMeta,
      }),
    ];
    pushRevenueLines({
      lines,
      owners,
      spendAmount: fee,
      freeAmount:
        Number(spendResult.fromFreeRequest || 0) +
        Number(spendResult.fromFreeShipping || 0),
      fromFreeRequest: Number(spendResult.fromFreeRequest || 0),
      fromFreeShipping: Number(spendResult.fromFreeShipping || 0),
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta: spendMeta,
    });

    const journal = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "SHIPPING_SPEND_COMMIT",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId || null,
      meta: {
        ...spendMeta,
        amount: fee,
        source: "practice_transfer_lab_shipping",
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    if (journal?.posted) {
      try {
        const { emitCreditBalanceUpdatedToBusiness } = await import(
          "../utils/creditRealtime.js"
        );
        await emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: practiceAnchorId,
          balanceDelta: -fee,
          reason: "practice_transfer_lab_shipping",
          refId: journal.journalId || String(transferId),
        });
      } catch {
        // best-effort
      }
    }

    return {
      charged: Boolean(journal?.posted),
      reason: journal?.posted ? "posted" : "not_posted",
      journalId: journal?.journalId || null,
      amount: fee,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 어벗디자인비 지급 회수(디자인 업로드 취소 시). ADJUST 저널 삭제.
 */
export async function revokeAbutmentDesignLabFee({
  requestDoc,
  transferId = null,
  labAnchorId = null,
  actorUserId = null,
}) {
  const requestId = requestDoc?._id ? String(requestDoc._id) : "";
  if (!requestId || !Types.ObjectId.isValid(requestId)) {
    return { revoked: false, reason: "missing_request" };
  }

  const idempotencyKey = `gl:request:${requestId}:abutment_design_fee`;
  const existing = await getJournalByIdempotencyKey({ idempotencyKey });
  if (!existing?.journalId) {
    return { revoked: false, reason: "not_found" };
  }

  const amount = Math.max(
    0,
    Math.round(Number(existing?.meta?.amount || 0)) || 0,
  );
  const resolvedLabAnchorId = String(
    labAnchorId ||
      existing?.businessAnchorId ||
      requestDoc?.businessAnchorId ||
      "",
  ).trim();

  const deleted = await deleteGeneralLedgerCommitJournal({
    journalId: existing.journalId,
    expectedEventTypes: ["ADJUST"],
  });

  if (!deleted?.deleted) {
    return {
      revoked: false,
      reason: deleted?.reason || "delete_failed",
      journalId: existing.journalId,
    };
  }

  if (resolvedLabAnchorId && amount > 0) {
    try {
      const { emitCreditBalanceUpdatedToBusiness } = await import(
        "../utils/creditRealtime.js"
      );
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: resolvedLabAnchorId,
        balanceDelta: -amount,
        reason: "abutment_design_lab_fee_revoke",
        refId: existing.journalId || requestId,
      });
    } catch {
      // best-effort
    }
  }

  return {
    revoked: true,
    journalId: existing.journalId,
    amount,
    actorUserId: actorUserId || null,
    transferId: transferId || null,
  };
}

