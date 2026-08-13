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
// - 2026-08-14: quote-context — 기공소/티어/단가/거래처/수수료율 parallel + 60s 캐시(5회 직렬 RTT 제거).
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
  isLabFeeScheduleConfigured,
  normalizeLabFeeItems,
  normalizeLabFeeRemakeSchedule,
  normalizeLabFeeSchedule,
  resolveAbutsAbutmentPricingTier,
  resolveLabFeeScheduleSource,
  splitPracticeTransferSettlement,
} from "../utils/labFeeSchedule.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import { normalizeAbutsAbutmentCreditPrices } from "../utils/abutsAbutmentService.js";
import LabTradingPartner from "../models/labTradingPartner.model.js";
import { findLabPracticeRelationship } from "../utils/labTradingPartner.util.js";
import { isAutoMatchOpenPool } from "../utils/practiceTransferAutoMatch.js";
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

async function loadCachedAbutmentCreditPrices() {
  const cacheKey = "practice-transfer:abutment-prices";
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached) return cached;
  return withRequestPerfInFlight(cacheKey, async () => {
    const prices = await loadAbutmentCreditPrices();
    setRequestPerfCacheValue(cacheKey, prices, QUOTE_LOOKUP_CACHE_TTL_MS);
    return prices;
  });
}

async function loadAbutmentCreditPrices() {
  try {
    return normalizeAbutsAbutmentCreditPrices(
      await loadCreditSettingsDefaults(),
    );
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
 * 자동매칭(기공소 미정)은 기본수가가 없어 0원. 실제 청구는 수락 시 기공소 스케줄.
 */
export async function assertPracticeTransferPaidCreditSufficient({
  practiceAnchorId,
  labAnchorId = null,
  toothWorks,
  remake = false,
}) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId || !Types.ObjectId.isValid(practiceId)) {
    const err = new Error("치과 사업자 정보가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  let labFeeSchedule = null;
  const labId = String(labAnchorId || "").trim();
  if (labId && Types.ObjectId.isValid(labId)) {
    const lab = await BusinessAnchor.findById(labId)
      .select({ labFeeSchedule: 1 })
      .lean();
    labFeeSchedule = lab?.labFeeSchedule || null;
  }

  const noLab = !labId;
  const useRemake = Boolean(remake);
  const abutmentPricingTier =
    await resolvePracticeAbutmentPricingTier(practiceId);
  const abutmentPrices = await loadAbutmentCreditPrices();
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    labFeeSchedule: noLab
      ? LAB_FEE_SCHEDULE_ZEROS
      : resolveLabFeeScheduleSource(labFeeSchedule),
    abutmentPricingTier,
    abutmentPrices,
    remake: useRemake,
    skipAbutmentFees: useRemake,
  });

  if (fees.total <= 0) {
    return { ok: true, fees, paidCredit: null, freeCredit: null, required: 0 };
  }

  const balance = await computeBusinessCreditBalanceFromLedger({
    businessAnchorId: practiceId,
  });
  const split = allocateSpendFromCreditBuckets({
    amount: fees.total,
    paidCredit: Number(balance?.paidCredit || 0),
    freeRequestCredit: Number(balance?.freeRequestCredit || 0),
    freeShippingCredit: Number(balance?.freeShippingCredit || 0),
    freeOrder: ["freeRequest", "freeShipping"],
  });
  if (!split.ok) {
    const err = new Error(
      `크레딧이 부족합니다. (잔액 ${(split.available).toLocaleString("ko-KR")}원 / 필요 ${fees.total.toLocaleString("ko-KR")}원)`,
    );
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

  return {
    ok: true,
    fees,
    paidCredit: split.paidCredit,
    freeCredit: split.freeCredit,
    required: fees.total,
  };
}

/**
 * 기공의뢰: 치과 유료/무료크레딧 1회 차감 + 기공소 기공정산크레딧(LAB_SETTLEMENT_CREDIT)/REV_* 분배.
 * 무료 프로모션 비용은 플랫폼이 부담하고, 기공소 정산 적립은 청구 총액 기준으로 유지한다.
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
  const existing = await getJournalByIdempotencyKey({
    idempotencyKey,
    session: outerSession,
  });
  if (existing?.journalId) {
    return { billed: false, reason: "already_billed", journalId: existing.journalId };
  }

  const lab = await BusinessAnchor.findById(labAnchorId)
    .select({ labFeeSchedule: 1 })
    .session(outerSession || null)
    .lean();
  const remake = isPracticeTransferRemake(transfer);
  const abutmentPricingTier = await resolvePracticeAbutmentPricingTier(
    practiceAnchorId,
    outerSession,
  );
  const abutmentPrices = await loadAbutmentCreditPrices();
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    labFeeSchedule: resolveLabFeeScheduleSource(lab?.labFeeSchedule),
    abutmentPricingTier,
    abutmentPrices,
    remake,
    skipAbutmentFees: remake,
  });

  if (fees.total <= 0) {
    return { billed: false, reason: "zero_fee", fees };
  }

  const partner = await findLabPracticeRelationship({
    labAnchorId,
    practiceAnchorId,
  });
  const relationshipKind =
    partner?.status === "active" || partner?.status === "referred"
      ? partner.status
      : "none";
  const isPartner = relationshipKind === "active";

  const devopsAnchorForFeeRate = await BusinessAnchor.findOne({
    businessType: "devops",
  })
    .select({ payoutRates: 1 })
    .sort({ createdAt: 1 })
    .lean();
  const feeRateApplied = resolvePracticeTransferFeeRate({
    relationshipKind,
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

    const owners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });

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

export async function rollbackPracticeTransferBilling({
  transferId,
  session: outerSession = null,
}) {
  const id = String(transferId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    return { didRollback: false, reason: "invalid_id" };
  }
  const idempotencyKey = `practice_transfer:${id}:spend`;
  const existing = await getJournalByIdempotencyKey({
    idempotencyKey,
    session: outerSession,
  });
  if (!existing?.journalId) {
    return { didRollback: false, reason: "no_spend" };
  }
  const deleteResult = await deleteGeneralLedgerCommitJournal({
    journalId: existing.journalId,
    expectedEventTypes: ["PRACTICE_TRANSFER_SPEND_COMMIT"],
    session: outerSession,
  });
  return {
    didRollback: Boolean(deleteResult?.deleted),
    reason: deleteResult?.reason || null,
  };
}

function relationshipKindFromPartner(partner) {
  return partner?.status === "active" || partner?.status === "referred"
    ? partner.status
    : "none";
}

export function toFeeQuoteApi(quote) {
  const fees = quote?.fees || {};
  return {
    labFeeTotal: Math.max(0, Math.round(Number(fees.labFeeTotal || 0))),
    abutmentRetailTotal: Math.max(
      0,
      Math.round(Number(fees.abutmentRetailTotal || 0)),
    ),
    abutmentQty: Math.max(0, Math.round(Number(fees.abutmentQty || 0))),
    total: Math.max(0, Math.round(Number(fees.total || 0))),
    lines: Array.isArray(fees.lines) ? fees.lines : [],
    relationshipKind:
      quote?.relationshipKind === "active" || quote?.relationshipKind === "referred"
        ? quote.relationshipKind
        : "none",
    feeRateApplied: Number(quote?.feeRateApplied || 0),
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
    labTradingPartnerId: api.labTradingPartnerId,
    labSettlementAmount: api.labSettlementAmount,
    abutsRevenueAmount: api.abutsRevenueAmount,
    billedAt: null,
    isRemake: Boolean(api.isRemake),
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
      abutmentRetailTotal: billing?.abutmentRetailTotal || 0,
      abutmentQty: billing?.abutmentQty || 0,
      total,
      lines,
    },
    relationshipKind: billing?.relationshipKind || "none",
    feeRateApplied,
    labSettlementAmount,
    abutsRevenueAmount,
    labTradingPartnerId: billing?.labTradingPartnerId
      ? String(billing.labTradingPartnerId)
      : null,
    billed,
    usedDefaultSchedule: false,
    isRemake: Boolean(billing?.isRemake),
  });
}

/** 기공비 저장 시 quote-context 캐시 무효화. */
export function invalidatePracticeTransferQuoteCaches(labAnchorId = null) {
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
}) {
  let schedule = labFeeSchedule;
  const labId = String(labAnchorId || "").trim();
  const usedDefaultSchedule = !labId;
  const loadedFromDb = schedule == null;
  const needLab = loadedFromDb && labId && Types.ObjectId.isValid(labId);
  const needPartner = relationshipKind == null;
  const needRates = payoutRates == null;

  const [lab, abutmentPricingTier, abutmentPrices, partner, cachedRates] =
    await Promise.all([
      needLab
        ? BusinessAnchor.findById(labId).select({ labFeeSchedule: 1 }).lean()
        : Promise.resolve(null),
      resolvePracticeAbutmentPricingTier(practiceAnchorId),
      loadCachedAbutmentCreditPrices(),
      needPartner
        ? findLabPracticeRelationship({ labAnchorId, practiceAnchorId })
        : Promise.resolve(null),
      needRates ? loadCachedDevopsPayoutRates() : Promise.resolve(payoutRates),
    ]);

  if (schedule == null) {
    schedule = lab?.labFeeSchedule || null;
  }

  const labFeeConfigured = usedDefaultSchedule
    ? true
    : isLabFeeScheduleConfigured(schedule);

  if (usedDefaultSchedule) {
    schedule = LAB_FEE_SCHEDULE_ZEROS;
  } else if (loadedFromDb) {
    schedule = resolveLabFeeScheduleSource(schedule);
  }

  const useRemake = Boolean(remake);
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    labFeeSchedule: schedule,
    abutmentPricingTier,
    abutmentPrices,
    remake: useRemake,
    skipAbutmentFees: useRemake,
  });

  let kind = relationshipKind;
  let partnerId =
    labTradingPartnerId != null ? labTradingPartnerId : null;
  if (kind == null) {
    kind = relationshipKindFromPartner(partner);
    partnerId = partner?._id ? String(partner._id) : null;
  }

  const rates = cachedRates;

  const feeRateApplied = resolvePracticeTransferFeeRate({
    relationshipKind: kind,
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
    schedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeSchedule(schedule),
    remakeSchedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeRemakeSchedule(schedule),
    items: usedDefaultSchedule
      ? normalizeLabFeeItems(LAB_FEE_SCHEDULE_ZEROS)
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
    });
    const context = {
      schedule: quote.schedule,
      remakeSchedule: quote.remakeSchedule || LAB_FEE_SCHEDULE_ZEROS,
      items: quote.items || normalizeLabFeeItems(quote.schedule),
      abutmentRetailPrice: quote.abutmentRetailPrice,
      abutmentPricingTier: quote.abutmentPricingTier || "regular",
      relationshipKind: quote.relationshipKind,
      feeRateApplied: quote.feeRateApplied,
      usedDefaultSchedule: quote.usedDefaultSchedule,
      labFeeConfigured: quote.labFeeConfigured !== false,
    };
    setRequestPerfCacheValue(cacheKey, context, QUOTE_LOOKUP_CACHE_TTL_MS);
    return context;
  });
}

function billingLooksStored(billing) {
  if (!billing || typeof billing !== "object") return false;
  if (billing.billedAt) return true;
  return Math.max(0, Math.round(Number(billing.total || 0))) > 0;
}

/**
 * 목록/상세용 견적. 과금 스냅샷이 있으면 금액은 스냅샷, 치식별 라인은 현재 스케줄로 보강.
 * 자동매칭 공개 풀은 조회 기공소 스케줄·관계로 다시 계산한다.
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
  const [payoutRates, abutmentPrices, labs, practices, partners] =
    await Promise.all([
      loadCachedDevopsPayoutRates(),
      loadCachedAbutmentCreditPrices(),
      labIdList.length
        ? BusinessAnchor.find({ _id: { $in: labIdList } })
            .select({ labFeeSchedule: 1 })
            .lean()
        : Promise.resolve([]),
      practiceIdList.length
        ? BusinessAnchor.find({ _id: { $in: practiceIdList } })
            .select({ practiceMembershipActive: 1 })
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
    ]);

  const scheduleByLab = new Map(
    labs.map((lab) => [String(lab._id), lab.labFeeSchedule || null]),
  );

  const pairKey = (labId, practiceId) => `${labId}:${practiceId}`;
  const membershipByPractice = new Map(
    practices.map((practice) => [
      String(practice._id),
      Boolean(practice.practiceMembershipActive),
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
    const useStored =
      billingLooksStored(billing) && !(viewerLabId && openPool && !billed);

    const schedule = quoteLabId ? scheduleByLab.get(quoteLabId) : null;
    const noLab = !quoteLabId;
    const remake = isPracticeTransferRemake(doc);
    const abutmentPricingTier = resolveAbutsAbutmentPricingTier({
      practiceMembershipActive: Boolean(membershipByPractice.get(practiceId)),
    });
    const remakeFees = computePracticeTransferRetailFees({
      toothWorks,
      labFeeSchedule: noLab
        ? LAB_FEE_SCHEDULE_ZEROS
        : resolveLabFeeScheduleSource(schedule),
      abutmentPricingTier,
      abutmentPrices,
      remake: true,
      skipAbutmentFees: true,
    });
    const fees = remake
      ? remakeFees
      : computePracticeTransferRetailFees({
          toothWorks,
          labFeeSchedule: noLab
            ? LAB_FEE_SCHEDULE_ZEROS
            : resolveLabFeeScheduleSource(schedule),
          abutmentPricingTier,
          abutmentPrices,
        });

    const partner = quoteLabId && practiceId
      ? partnerByPair.get(pairKey(quoteLabId, practiceId))
      : null;
    const kind = relationshipKindFromPartner(partner);
    const feeRateApplied = resolvePracticeTransferFeeRate({
      relationshipKind: kind,
      payoutRates,
    });
    const remakeSplit = splitPracticeTransferSettlement({
      labFeeTotal: remakeFees.labFeeTotal,
      abutmentRetailTotal: remakeFees.abutmentRetailTotal,
      feeRateApplied,
    });
    const remakeFeeQuote = toFeeQuoteApi({
      fees: remakeFees,
      relationshipKind: kind,
      feeRateApplied,
      labSettlementAmount: remakeSplit.labSettlementAmount,
      abutsRevenueAmount: remakeSplit.abutsRevenueAmount,
      labTradingPartnerId: partner?._id ? String(partner._id) : null,
      billed: false,
      usedDefaultSchedule: !quoteLabId,
      isRemake: true,
    });

    if (useStored) {
      out.set(docId, {
        ...feeQuoteFromBillingDoc(billing, { lines: fees.lines, billed }),
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
          labSettlementAmount,
          abutsRevenueAmount,
          labTradingPartnerId: partner?._id ? String(partner._id) : null,
          billed: false,
          usedDefaultSchedule: !quoteLabId,
          isRemake: remake,
        }),
        remakeFeeQuote,
      },
    );
  }
  return out;
}
