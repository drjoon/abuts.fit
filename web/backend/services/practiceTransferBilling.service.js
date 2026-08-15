// related files:
// - web/backend/rules.md
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/utils/labTradingPartner.util.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditRevenuePolicy.service.js
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
// - 2026-08-15: 청구 완료 목록 견적에 autoMatchBudget 재부착 금지(확정 기공비 유지).
import mongoose, { Types } from "mongoose";
import CreditBalanceGuard from "../models/creditBalanceGuard.model.js";
import {
  allocateSpendFromCreditBuckets,
  computeBusinessCreditBalanceFromLedger,
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
  loadAutoMatchBudgetCatalog,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
} from "../utils/practiceTransferAutoMatchBudget.js";
import {
  getRequestPerfCacheValue,
  invalidateRequestPerfCacheByPrefix,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "./requestDashboardCache.service.js";

const QUOTE_LOOKUP_CACHE_TTL_MS = 60 * 1000;

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
  const practice = await BusinessAnchor.findById(practiceAnchorId)
    .select({ referredByAnchorId: 1 })
    .session(session || null)
    .lean();

  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ _id: 1, payoutRates: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();

  const manufacturer = await BusinessAnchor.findOne({
    businessType: "manufacturer",
  })
    .select({ _id: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();

  const admin = await BusinessAnchor.findOne({ businessType: "admin" })
    .select({ _id: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();

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
 * 자동매칭: 기공비는 예산 상한(maxLabFee)+어벗츠 어벗으로 검사. 실제 청구는 수락 시 기공소 스케줄.
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
  // 자동매칭: 의뢰 createdAt 기준 할증(이후 적용분은 미적용).
  const labFeeMultiplier = isAutoMatch
    ? resolveLabPracticeFeeMultiplierAsOf(
        lab,
        practiceAnchorId,
        transfer?.createdAt,
      )
    : normalizeLabFeeMultiplier(transfer?.billing?.labFeeMultiplier);
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    implantFavorites: implantFavoritesFromPractice(practice),
    labFeeSchedule: resolveLabFeeScheduleSource(lab?.labFeeSchedule),
    abutmentPricingTier,
    abutmentPrices,
    remake,
    skipAbutmentFees: remake,
    labFeeMultiplier,
  });

  if (fees.total <= 0) {
    return { billed: false, reason: "zero_fee", fees };
  }

  const budgetCheck = assertLabWithinAutoMatchBudget({
    toothWorks,
    budget: transfer?.billing?.autoMatchBudget,
    labFeeSchedule: lab?.labFeeSchedule,
    // 자동매칭 예산 게이트는 공개 수가만. 할증은 청구(fees)에만 반영.
    labFeeMultiplier: 1,
    catalog: autoMatchCatalog || undefined,
  });
  if (isAutoMatch && !budgetCheck.ok) {
    const err = new Error(
      "기공소 수가가 치과 자동매칭 예산(항목별 최소~최대) 밖입니다.",
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
function practiceTransferHoldAdjustKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_adjust`;
}
function practiceTransferEscrowReleaseKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release`;
}
function practiceTransferLegacySpendKey(transferId) {
  return `practice_transfer:${String(transferId)}:spend`;
}

/**
 * 전송 생성 시 치과 크레딧을 PLATFORM_ESCROW로 보류(기공 적립 없음).
 */
export async function holdPracticeTransferCredits({
  transfer,
  toothWorks = null,
  holdAmount = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { held: false, reason: "missing_anchors" };
  }

  const idempotencyKey = practiceTransferHoldKey(transferId);
  const existing = await getJournalByIdempotencyKey({
    idempotencyKey,
    session: outerSession,
  });
  if (existing?.journalId) {
    return {
      held: false,
      reason: "already_held",
      journalId: existing.journalId,
      heldTotal: Number(transfer?.billing?.heldTotal || 0),
    };
  }

  let required = Math.max(0, Math.round(Number(holdAmount)));
  if (!Number.isFinite(required) || required <= 0) {
    const check = await assertPracticeTransferPaidCreditSufficient({
      practiceAnchorId,
      labAnchorId: transfer?.targetLabAnchorId || null,
      toothWorks: toothWorks || transfer?.toothWorks || [],
      remake: isPracticeTransferRemake(transfer),
      autoMatchBudget: transfer?.billing?.autoMatchBudget || null,
    });
    required = Math.max(0, Math.round(Number(check?.required || check?.fees?.total || 0)));
  }

  if (required <= 0) {
    return { held: false, reason: "zero_fee", heldTotal: 0 };
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

    const split = allocateSpendFromCreditBuckets({
      amount: required,
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
        required,
      };
      throw err;
    }

    const spendMetaBase = {
      displayKind: "lab_fee_hold",
      displayLabel: "기공비 보류",
      usageKind: "practice_transfer",
      escrow: true,
      fromPaid: split.fromPaid,
      fromFreeRequest: split.fromFreeRequest,
      fromFreeShipping: split.fromFreeShipping,
    };

    const lines = [
      ...buildPracticeDebitLines({
        split,
        practiceAnchorId,
        transferId,
        meta: spendMetaBase,
      }),
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: required,
        amountExcludingVat: required,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          ...spendMetaBase,
          source: "practice_transfer_escrow_hold",
        },
      },
    ];

    const journal = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        heldTotal: required,
        fromPaid: split.fromPaid,
        fromFreeRequest: split.fromFreeRequest,
        fromFreeShipping: split.fromFreeShipping,
        devopsAnchorId,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    return {
      held: true,
      journalId: journal?.journalId || null,
      heldTotal: required,
      fromPaid: split.fromPaid,
      fromFreeRequest: split.fromFreeRequest,
      fromFreeShipping: split.fromFreeShipping,
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
    ? resolveLabPracticeFeeMultiplierAsOf(
        lab,
        practiceAnchorId,
        transfer?.createdAt,
      )
    : normalizeLabFeeMultiplier(transfer?.billing?.labFeeMultiplier);

  const fees = computePracticeTransferRetailFees({
    toothWorks,
    implantFavorites: implantFavoritesFromPractice(practice),
    labFeeSchedule: resolveLabFeeScheduleSource(lab?.labFeeSchedule),
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
      // 자동매칭 예산 게이트는 공개 수가만. 할증은 청구(fees)에만 반영.
      labFeeMultiplier: 1,
      catalog: autoMatchCatalog || undefined,
    });
    if (!budgetCheck.ok) {
      const err = new Error(
        "기공소 수가가 치과 자동매칭 예산(항목별 최소~최대) 밖입니다.",
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

  const legacySpend = await getJournalByIdempotencyKey({
    idempotencyKey: practiceTransferLegacySpendKey(transferId),
    session: outerSession,
  });
  if (legacySpend?.journalId) {
    return { adjusted: false, reason: "legacy_already_committed" };
  }

  const computed = await computeAcceptedPracticeTransferFees({
    transfer,
    toothWorks,
    session: outerSession,
  });
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
    };
  }

  let holdJournal = await getJournalByIdempotencyKey({
    idempotencyKey: practiceTransferHoldKey(transferId),
    session: outerSession,
  });

  if (!holdJournal?.journalId) {
    const holdResult = await holdPracticeTransferCredits({
      transfer,
      toothWorks,
      holdAmount: fees.total,
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
      fromPaid: holdResult.fromPaid,
      fromFreeRequest: holdResult.fromFreeRequest,
      fromFreeShipping: holdResult.fromFreeShipping,
    };
  }

  const heldTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldTotal ||
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
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  }

  const adjustExisting = await getJournalByIdempotencyKey({
    idempotencyKey: practiceTransferHoldAdjustKey(transferId),
    session: outerSession,
  });
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
 * 작업완료 시 에스크로 해제 → 기공크레딧 + 플랫폼 매출.
 */
export async function releasePracticeTransferEscrow({
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

  const releaseKey = practiceTransferEscrowReleaseKey(transferId);
  const existingRelease = await getJournalByIdempotencyKey({
    idempotencyKey: releaseKey,
    session: outerSession,
  });
  if (existingRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingRelease.journalId,
    };
  }

  const legacySpend = await getJournalByIdempotencyKey({
    idempotencyKey: practiceTransferLegacySpendKey(transferId),
    session: outerSession,
  });
  if (legacySpend?.journalId) {
    return {
      released: false,
      reason: "legacy_already_settled",
      journalId: legacySpend.journalId,
    };
  }

  const holdJournal = await getJournalByIdempotencyKey({
    idempotencyKey: practiceTransferHoldKey(transferId),
    session: outerSession,
  });
  if (!holdJournal?.journalId) {
    return { released: false, reason: "no_hold" };
  }

  const works = toothWorks || transfer?.toothWorks || [];
  const computed = await computeAcceptedPracticeTransferFees({
    transfer,
    toothWorks: works,
    session: outerSession,
  });
  const { fees, labSettlementAmount, abutsRevenueAmount } = computed;
  const releaseTotal = Math.max(
    0,
    Math.round(
      Number(transfer?.billing?.heldTotal || fees.total || 0),
    ),
  );
  if (releaseTotal <= 0 && fees.total <= 0) {
    return { released: false, reason: "zero_fee", fees };
  }

  const escrowAmount = fees.total > 0 ? fees.total : releaseTotal;
  const fromPaid = Math.max(
    0,
    Math.round(Number(transfer?.billing?.holdFromPaid ?? holdJournal?.meta?.fromPaid ?? 0)),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holdJournal?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holdJournal?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );
  const fromFree = fromFreeRequest + fromFreeShipping;

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const [devopsAnchorId, revenueOwners] = await Promise.all([
      resolveDevopsEscrowOwnerId(session),
      resolveRevenueOwners({ practiceAnchorId, session }),
    ]);
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
        amount: -escrowAmount,
        amountExcludingVat: -escrowAmount,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_escrow_release",
          displayKind: "lab_fee",
          displayLabel: "기공비",
        },
      },
    ];

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
          isTradingPartner: computed.isPartner,
          relationshipKind: computed.relationshipKind,
          feeRateApplied: computed.feeRateApplied,
          labFee: fees.labFeeTotal,
          abutmentRetailIncluded: 0,
          displayKind: "lab_credit",
          displayLabel: "기공정산크레딧",
          itemLabel: "기공비",
        },
      });
    }

    if (abutsRevenueAmount > 0) {
      const freeShareOfPlatformFee =
        escrowAmount > 0
          ? Math.round((abutsRevenueAmount * fromFree) / escrowAmount)
          : 0;
      const freeReqShareOfPlatformFee =
        fromFree > 0
          ? Math.round((freeShareOfPlatformFee * fromFreeRequest) / fromFree)
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      pushRevenueLines({
        lines,
        owners: revenueOwners,
        spendAmount: abutsRevenueAmount,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source:
            computed.relationshipKind === "active" ||
            computed.relationshipKind === "referred"
              ? "partner_platform_fee"
              : "non_partner_platform_fee",
          relationshipKind: computed.relationshipKind,
          feeRateApplied: computed.feeRateApplied,
          feeTotal: escrowAmount,
        },
      });
    }

    const journal = await postGeneralLedgerJournal({
      idempotencyKey: releaseKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        labAnchorId: String(labAnchorId),
        fees,
        labSettlementAmount,
        abutsRevenueAmount,
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
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labSettlementAmount,
      abutsRevenueAmount,
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

export async function rollbackPracticeTransferBilling({
  transferId,
  session: outerSession = null,
}) {
  const id = String(transferId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    return { didRollback: false, reason: "invalid_id" };
  }

  const keys = [
    {
      key: practiceTransferEscrowReleaseKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferHoldAdjustKey(id),
      events: ["PRACTICE_TRANSFER_HOLD_ADJUST"],
    },
    {
      key: practiceTransferHoldKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferLegacySpendKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_COMMIT"],
    },
  ];

  let didRollback = false;
  let lastReason = "no_spend";
  for (const { key, events } of keys) {
    const existing = await getJournalByIdempotencyKey({
      idempotencyKey: key,
      session: outerSession,
    });
    if (!existing?.journalId) continue;
    const deleteResult = await deleteGeneralLedgerCommitJournal({
      journalId: existing.journalId,
      expectedEventTypes: events,
      session: outerSession,
    });
    if (deleteResult?.deleted) {
      didRollback = true;
      lastReason = null;
    } else {
      lastReason = deleteResult?.reason || lastReason;
    }
  }

  return {
    didRollback,
    reason: didRollback ? null : lastReason,
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
  const labAbutmentTotal = Math.max(
    0,
    Math.round(Number(fees.labAbutmentTotal || 0)),
  );
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
    lines: Array.isArray(fees.lines) ? fees.lines : [],
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
    billed: Boolean(quote?.billed),
    usedDefaultSchedule: Boolean(quote?.usedDefaultSchedule),
    isRemake: Boolean(quote?.isRemake || quote?.remake),
    autoMatchBudget: normalizeAutoMatchBudget(quote?.autoMatchBudget),
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
      lines,
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

  if (usedDefaultSchedule) {
    schedule = buildScheduleFromAutoMatchBudget(resolvedBudget, "max", catalog);
  } else if (loadedFromDb) {
    schedule = resolveLabFeeScheduleSource(schedule);
  }

  const useRemake = Boolean(remake);
  // 작성 중 견적: live 할증(아직 의뢰 시각 없음). 지정·자동매칭 공통.
  const labFeeMultiplier = resolveLabPracticeFeeMultiplier(lab, practiceId);
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
  const [payoutRates, abutmentPricesBase, labs, practices, partners, creditSettings] =
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
    ]);

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
    const feeLabFeeMultiplier = openPool
      ? asOfLabFeeMultiplier
      : snapLabFeeMultiplier > 1 || matchingMode === "direct"
        ? snapLabFeeMultiplier
        : asOfLabFeeMultiplier;
    const remakeLabFeeMultiplier = liveLabFeeMultiplier;
    const storedBudget = normalizeAutoMatchBudget(billing?.autoMatchBudget);
    const autoScheduleMax =
      noLab && storedBudget
        ? buildScheduleFromAutoMatchBudget(storedBudget, "max")
        : null;
    const abutmentPrices = abutmentPricesForPractice(practiceId);
    const remakeFees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites,
      labFeeSchedule: noLab
        ? autoScheduleMax || LAB_FEE_SCHEDULE_ZEROS
        : resolveLabFeeScheduleSource(schedule),
      abutmentPricingTier,
      abutmentPrices,
      remake: true,
      skipAbutmentFees: true,
      labFeeMultiplier: remakeLabFeeMultiplier,
    });
    const fees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites,
      labFeeSchedule: noLab
        ? autoScheduleMax || LAB_FEE_SCHEDULE_ZEROS
        : resolveLabFeeScheduleSource(schedule),
      abutmentPricingTier,
      abutmentPrices,
      remake,
      skipAbutmentFees: remake,
      labFeeMultiplier: feeLabFeeMultiplier,
    });

    let autoMatchBudgetOut = null;
    if (noLab && storedBudget) {
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
      fees.lines = attachLabFeeMinToLines(fees.lines, minFees.lines);
      autoMatchBudgetOut = {
        ...storedBudget,
        minLabFee: minFees.labFeeTotal,
        maxLabFee: fees.labFeeTotal,
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
      usedDefaultSchedule: !quoteLabId,
      isRemake: true,
      autoMatchBudget: autoMatchBudgetOut,
    });

    if (useStored) {
      const storedQuote = feeQuoteFromBillingDoc(billing, {
        lines: fees.lines,
        billed,
      });
      // 청구 완료(billed): 예산 구간(autoMatchBudget)을 다시 붙이지 않는다.
      out.set(docId, {
        ...storedQuote,
        remakeFeeQuote,
      });
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
          usedDefaultSchedule: !quoteLabId,
          isRemake: remake,
          autoMatchBudget: autoMatchBudgetOut,
        }),
        remakeFeeQuote,
      },
    );
  }
  return out;
}
