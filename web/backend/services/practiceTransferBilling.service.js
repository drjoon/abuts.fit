// related files:
// - web/backend/rules.md
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/labTradingPartner.util.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditRevenuePolicy.service.js
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
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import {
  computePracticeTransferRetailFees,
  normalizeLabFeeSchedule,
} from "../utils/labFeeSchedule.js";
import { findLabPracticeRelationship } from "../utils/labTradingPartner.util.js";

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
 * 자동매칭은 기공소 미정이라 기본 기공비 스케줄로 견적한다.
 */
export async function assertPracticeTransferPaidCreditSufficient({
  practiceAnchorId,
  labAnchorId = null,
  toothWorks,
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

  const creditSettings = await loadCreditSettingsDefaults();
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    labFeeSchedule: normalizeLabFeeSchedule(labFeeSchedule),
    abutmentRetailPrice: creditSettings.abutmentRetailPrice,
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
  const creditSettings = await loadCreditSettingsDefaults();
  const fees = computePracticeTransferRetailFees({
    toothWorks,
    labFeeSchedule: normalizeLabFeeSchedule(lab?.labFeeSchedule),
    abutmentRetailPrice: creditSettings.abutmentRetailPrice,
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

  const abutsRevenueAmount = Math.round(fees.total * feeRateApplied);
  const labSettlementAmount = fees.total - abutsRevenueAmount;

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
          abutmentRetailIncluded: isPartner ? fees.abutmentRetailTotal : 0,
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

export async function quotePracticeTransferFees({
  labAnchorId,
  toothWorks,
}) {
  const lab = await BusinessAnchor.findById(labAnchorId)
    .select({ labFeeSchedule: 1 })
    .lean();
  const creditSettings = await loadCreditSettingsDefaults();
  return computePracticeTransferRetailFees({
    toothWorks,
    labFeeSchedule: normalizeLabFeeSchedule(lab?.labFeeSchedule),
    abutmentRetailPrice: creditSettings.abutmentRetailPrice,
  });
}
