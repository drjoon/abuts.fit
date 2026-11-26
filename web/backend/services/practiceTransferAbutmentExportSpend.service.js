// related: docs/intent/abutment-design-export-stl-credit.md
// 크라운 export 시 어벗츠 어벗 생산비를 기공소 크레딧에서 1회 확정 차감(환불 없음).
// 가공 진입 ensureRequestCreditSpendOnMachiningEnter 와 이중 차감하지 않는다.

import { Types } from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import Request from "../models/request.model.js";
import { spendCreditByUniqueKey } from "./creditBalance.service.js";
import { getJournalByIdempotencyKey } from "./generalLedger.service.js";
import { resolvePerformingLabAnchorId } from "../utils/practiceTransferAutoMatchCore.js";
import { countCustomAbutmentWorks } from "../utils/labFeeSchedule.js";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  pickAbutsAbutmentCreditPrices,
} from "../utils/abutsAbutmentService.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";

export function practiceTransferAbutmentExportSpendKey(transferId) {
  return `practice_transfer:${String(transferId || "").trim()}:abutment_export_spend`;
}

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

function isExportChargeExempt(transfer) {
  const billing =
    transfer?.billing && typeof transfer.billing === "object" ? transfer.billing : {};
  const practicePrepaid = Number(billing.abutmentRetailTotal || 0) > 0;
  const isTradingPartner = Boolean(billing.isTradingPartner);
  // 비거래처 선불: 치과 PTX 보류·발송 해제. 기공소 export 생산비 없음.
  if (practicePrepaid && !isTradingPartner) return true;
  const route = String(transfer?.production?.abutmentFeeRoute || "").trim();
  // 플랫폼 디자인 루트: 치과가 디자인+생산. 기공소 생산비 재차감 없음.
  if (route === "platform") return true;
  return false;
}

export async function hasPracticeTransferAbutmentProductionPaid({
  transfer,
  session = null,
}) {
  if (!transfer?._id) return false;
  if (transfer?.production?.abutmentExportPaidAt) return true;

  const exportKey = practiceTransferAbutmentExportSpendKey(transfer._id);
  const exportJournal = await getJournalByIdempotencyKey({
    idempotencyKey: `gl:${exportKey}`,
    session,
  });
  if (exportJournal?.journalId) return true;

  const relatedIds = (
    Array.isArray(transfer?.production?.relatedRequestIds)
      ? transfer.production.relatedRequestIds
      : []
  )
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  const machiningKeys = relatedIds.map(
    (id) => `gl:request:${id}:machining_spend`,
  );
  if (machiningKeys.length) {
    for (const key of machiningKeys) {
      const journal = await getJournalByIdempotencyKey({
        idempotencyKey: key,
        session,
      });
      if (journal?.journalId) return true;
    }
  }

  const transferOid = toObjectId(transfer._id);
  if (!transferOid) return false;
  const linked = await Request.find({
    "partnerBilling.relatedPracticeTransferId": transferOid,
    manufacturerStage: { $ne: "취소" },
  })
    .select({ _id: 1 })
    .session(session || null)
    .lean();
  for (const row of linked || []) {
    const journal = await getJournalByIdempotencyKey({
      idempotencyKey: `gl:request:${String(row._id)}:machining_spend`,
      session,
    });
    if (journal?.journalId) return true;
  }
  return false;
}

export async function quotePracticeTransferAbutmentExportSpend({
  transfer,
  session = null,
}) {
  const performingLabId =
    resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  const qty = Math.max(1, countCustomAbutmentWorks(transfer?.toothWorks) || 1);
  const alreadyPaid = await hasPracticeTransferAbutmentProductionPaid({
    transfer,
    session,
  });
  const exempt = isExportChargeExempt(transfer);

  let unit = ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
  if (performingLabId && !exempt && !alreadyPaid) {
    try {
      const creditSettings = await loadCreditSettingsDefaults({
        requestorOrgId: performingLabId,
        applyLabSupplyPrices: true,
      });
      const picked = pickAbutsAbutmentCreditPrices(creditSettings || {});
      unit = Math.max(
        0,
        Number(picked.productionPrice) || ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
      );
    } catch {
      unit = ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE;
    }
  }

  const amount =
    alreadyPaid || exempt ? 0 : Math.max(0, Math.round(unit * qty));

  return {
    alreadyPaid,
    exempt,
    qty,
    unitPrice: alreadyPaid || exempt ? 0 : unit,
    amount,
    currency: "KRW",
    performingLabAnchorId: performingLabId ? String(performingLabId) : null,
    refundable: false,
  };
}

/**
 * export 확정 시 생산비 1회 차감. 이미 결제·면제면 no-op.
 * 환불 API는 두지 않는다.
 */
export async function ensurePracticeTransferAbutmentExportSpend({
  transfer,
  actorUserId = null,
  session = null,
}) {
  if (!transfer?._id) {
    return { charged: false, reason: "missing_transfer" };
  }

  const quote = await quotePracticeTransferAbutmentExportSpend({
    transfer,
    session,
  });
  if (quote.alreadyPaid) {
    if (!transfer.production?.abutmentExportPaidAt) {
      const now = new Date();
      await PracticeTransfer.updateOne(
        { _id: transfer._id, "production.abutmentExportPaidAt": null },
        {
          $set: {
            "production.abutmentExportPaidAt": now,
            "production.abutmentExportPaidAmount": 0,
            "production.abutmentExportPaidBy": actorUserId || null,
          },
        },
        { session: session || undefined },
      );
      transfer.production = {
        ...(transfer.production && typeof transfer.production === "object"
          ? transfer.production
          : {}),
        abutmentExportPaidAt: now,
        abutmentExportPaidAmount: 0,
        abutmentExportPaidBy: actorUserId || null,
      };
    }
    return {
      charged: false,
      reason: "already_paid",
      quote,
    };
  }
  if (quote.exempt || quote.amount <= 0) {
    const now = new Date();
    await PracticeTransfer.updateOne(
      { _id: transfer._id },
      {
        $set: {
          "production.abutmentExportPaidAt": now,
          "production.abutmentExportPaidAmount": 0,
          "production.abutmentExportPaidBy": actorUserId || null,
        },
      },
      { session: session || undefined },
    );
    transfer.production = {
      ...(transfer.production && typeof transfer.production === "object"
        ? transfer.production
        : {}),
      abutmentExportPaidAt: now,
      abutmentExportPaidAmount: 0,
      abutmentExportPaidBy: actorUserId || null,
    };
    return {
      charged: false,
      reason: quote.exempt ? "exempt" : "zero_amount",
      quote,
    };
  }

  const spendAnchorId = quote.performingLabAnchorId;
  if (!spendAnchorId) {
    const err = new Error("수행 기공소를 찾을 수 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const spendUniqueKey = practiceTransferAbutmentExportSpendKey(transfer._id);
  const spendResult = await spendCreditByUniqueKey({
    businessAnchorId: spendAnchorId,
    session,
    amount: quote.amount,
    spendUniqueKey,
    insufficientMessage: "기공소 크레딧이 부족해 export할 수 없습니다.",
    insufficientReason: "insufficient_credit_for_abutment_export",
    refId: transfer._id,
  });

  if (spendResult?.reason === "already_spent") {
    const now = new Date();
    await PracticeTransfer.updateOne(
      { _id: transfer._id, "production.abutmentExportPaidAt": null },
      {
        $set: {
          "production.abutmentExportPaidAt": now,
          "production.abutmentExportPaidAmount": quote.amount,
          "production.abutmentExportPaidBy": actorUserId || null,
        },
      },
      { session: session || undefined },
    );
    return { charged: false, reason: "already_spent", quote };
  }

  if (!spendResult?.didSpend) {
    return { charged: false, reason: spendResult?.reason || "not_spent", quote };
  }

  const syntheticRequest = {
    _id: transfer._id,
    requestId: String(transfer.transferId || transfer._id || ""),
    caseInfos: {
      productMode: "design_custom_abutment",
      tooth: String(
        (Array.isArray(transfer.toothWorks) ? transfer.toothWorks : [])
          .map((row) => row?.toothNumber || row?.tooth || "")
          .filter(Boolean)
          .join(",") || "",
      ),
      patientName: String(transfer?.patientName || "").trim(),
      clinicName: String(transfer?.clinicName || "").trim(),
    },
    price: {
      amount: quote.amount,
      baseAmount: quote.unitPrice,
      rule: "ptx_abuts_production_membership",
      abutmentQty: quote.qty,
    },
    partnerBilling: {
      relatedPracticeTransferId: transfer._id,
      labDesignedAbutment: true,
    },
  };

  // helpers ↔ 이 서비스 순환 import 방지
  const { postSpendCommitGeneralLedger } = await import(
    "../controllers/requests/common.review.helpers.js"
  );
  const glPostResult = await postSpendCommitGeneralLedger({
    eventType: "REQUEST_SPEND_COMMIT",
    spendUniqueKey,
    request: syntheticRequest,
    businessAnchorId: spendAnchorId,
    actorUserId,
    amount: Number(spendResult.resolvedAmount || 0),
    fromPaid: Number(spendResult.fromPaid || 0),
    fromFreeRequest: Number(spendResult.fromFreeRequest || 0),
    fromFreeShipping: Number(spendResult.fromFreeShipping || 0),
    fromSettlement: Number(spendResult.fromSettlement || 0),
    freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
    refType: "PRACTICE_TRANSFER",
    refId: transfer._id,
    stageFrom: "디자인",
    stageTo: "export",
    session,
    usageKind: "abutment_production",
    displayLabel: "어벗 디자인 export(생산비)",
  });

  if (!glPostResult?.posted && !glPostResult?.idempotent) {
    throw new Error("REQUEST_SPEND_COMMIT abutment export ledger posting failed");
  }

  const now = new Date();
  const paidAmount = Number(spendResult.resolvedAmount || 0);
  await PracticeTransfer.updateOne(
    { _id: transfer._id },
    {
      $set: {
        "production.abutmentExportPaidAt": now,
        "production.abutmentExportPaidAmount": paidAmount,
        "production.abutmentExportPaidBy": actorUserId || null,
      },
    },
    { session: session || undefined },
  );
  transfer.production = {
    ...(transfer.production && typeof transfer.production === "object"
      ? transfer.production
      : {}),
    abutmentExportPaidAt: now,
    abutmentExportPaidAmount: paidAmount,
    abutmentExportPaidBy: actorUserId || null,
  };

  if (!session) {
    void emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: spendAnchorId,
      balanceDelta: -paidAmount,
      reason: "abutment_export_spend",
      refId: transfer._id,
    }).catch(() => {});
  }

  return {
    charged: Boolean(glPostResult?.posted),
    reason: glPostResult?.idempotent ? "idempotent" : "posted",
    quote: { ...quote, amount: paidAmount },
    journalId: glPostResult?.journalId || null,
  };
}
