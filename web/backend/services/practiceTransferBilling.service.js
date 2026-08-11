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
  refType,
  refId,
  meta,
}) {
  if (spendAmount <= 0) return;
  const revenueBaseByOwner = resolveRevenueOwnerBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
    owners,
    isShippingSpend: false,
  });
  const revenueKindSplit = splitRevenueByCreditKindProRata({
    ownerBaseByRole: revenueBaseByOwner,
    freeAmount: 0,
  });

  const push = (accountCode, ownerRole, ownerId, paidBase) => {
    const amount = Math.round(Number(paidBase || 0));
    if (!ownerId || amount <= 0) return;
    lines.push({
      accountCode,
      ownerRole,
      ownerId,
      amount,
      amountExcludingVat: amount,
      vatAmount: 0,
      amountIncludingVat: amount,
      creditKind: "PAID",
      refType,
      refId,
      meta,
    });
  };

  push(
    "REV_MANUFACTURER",
    "manufacturer",
    owners.manufacturerAnchorId,
    revenueKindSplit.manufacturer?.paid,
  );
  push(
    "REV_DEVOPS",
    "devops",
    owners.devopsAnchorId,
    revenueKindSplit.devops?.paid,
  );
  push(
    "REV_SALESMAN",
    "salesman",
    owners.salesmanAnchorId,
    revenueKindSplit.salesman?.paid,
  );
  push(
    "REV_ADMIN",
    "admin",
    owners.adminAnchorId,
    revenueKindSplit.admin?.paid,
  );
}

/**
 * 기공의뢰: 치과 유료크레딧(REQ_PAID_CREDIT) 1회 차감 + 기공소 기공크레딧(LAB_SETTLEMENT_CREDIT)/REV_* 분배.
 * 치과는 settlement 버킷을 쓰지 않고 유료 잔액으로 기공비를 지불한다.
 * 호출 시점: 기공소 의뢰수락(mark-accepted). 전송 생성 시점이 아님.
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
    const paidCredit = Number(balance?.paidCredit || 0);
    if (paidCredit < fees.total) {
      const err = new Error("치과 유료크레딧이 부족합니다.");
      err.statusCode = 402;
      err.payload = {
        reason: "insufficient_credit_for_practice_transfer",
        paidCredit,
        required: fees.total,
        fees,
      };
      throw err;
    }

    const owners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });

    const lines = [
      {
        accountCode: "REQ_PAID_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -fees.total,
        amountExcludingVat: -fees.total,
        vatAmount: 0,
        creditKind: "PAID",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          labFee: fees.labFeeTotal,
          abutmentRetail: fees.abutmentRetailTotal,
          abutmentQty: fees.abutmentQty,
          isTradingPartner: isPartner,
          relationshipKind,
          feeRateApplied,
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
          isTradingPartner: isPartner,
          relationshipKind,
          feeRateApplied,
          labFee: fees.labFeeTotal,
          abutmentRetailIncluded: isPartner ? fees.abutmentRetailTotal : 0,
          displayKind: "lab_credit",
          displayLabel: "기공크레딧",
          itemLabel: "기공비",
        },
      });
    }

    if (abutsRevenueAmount > 0) {
      pushRevenueLines({
        lines,
        owners,
        spendAmount: abutsRevenueAmount,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source:
            relationshipKind === "referred"
              ? "lab_referred_platform_fee"
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
