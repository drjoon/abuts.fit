// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/models/conversionInvoice.model.js
// - web/backend/utils/creditChargeUnit.js
// change-log:
// - 2026-09-09: 데모→실사용 전환 워터폴(이용분 청산·기공소 상계/순지급·잔액 선수금).
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import ConversionInvoice from "../models/conversionInvoice.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import Request from "../models/request.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { getBusinessCreditBalanceSnapshot } from "./creditBalance.service.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";
import {
  resolveCreditChargeUnit,
} from "../utils/creditChargeUnit.js";
import { normalizeRequestorKind } from "../utils/requestorCapabilities.js";
import {
  assertChargeMeetsConversionMinimum,
  resolveConversionMinTotal,
  roundWon,
} from "../utils/demoConversionMath.js";

export { assertChargeMeetsConversionMinimum, resolveConversionMinTotal };

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

async function resolveKind(businessAnchorId, anchorDoc) {
  const anchor =
    anchorDoc ||
    (await BusinessAnchor.findById(businessAnchorId)
      .select({ requestorKind: 1, requestorCapabilities: 1 })
      .lean());
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  if (kind === "practice" || kind === "lab") return kind;
  const caps = anchor?.requestorCapabilities || {};
  if (caps.lab && !caps.practice) return "lab";
  if (caps.practice) return "practice";
  return "lab";
}

/**
 * 데모 기간 PTX의 기공비·연결 Request 기준 Lab→Abuts 소비를 기공소별로 집계.
 */
async function aggregatePracticeLabRemittances({
  practiceAnchorId,
  periodStart,
  periodEnd,
}) {
  const practiceId = toObjectId(practiceAnchorId);
  if (!practiceId) return [];

  const timeFilter = {};
  if (periodStart) timeFilter.$gte = new Date(periodStart);
  if (periodEnd) timeFilter.$lte = new Date(periodEnd);

  const transfers = await PracticeTransfer.find({
    practiceBusinessAnchorId: practiceId,
    ...(Object.keys(timeFilter).length
      ? {
          $or: [
            { "billing.heldAt": timeFilter },
            { createdAt: timeFilter },
          ],
        }
      : {}),
  })
    .select({
      _id: 1,
      targetLabAnchorId: 1,
      "billing.labFeeTotal": 1,
      "billing.heldLabTotal": 1,
      "billing.labSettlementAmount": 1,
      "billing.labSettledAt": 1,
      "production.relatedRequestIds": 1,
    })
    .lean();

  if (!transfers.length) return [];

  const byLab = new Map();
  const allTransferIds = [];
  for (const t of transfers) {
    const labId = String(t.targetLabAnchorId || "").trim();
    if (!labId) continue;
    allTransferIds.push(t._id);
    const labFee = roundWon(
      Math.max(
        Number(t.billing?.labFeeTotal || 0),
        Number(t.billing?.heldLabTotal || 0),
        Number(t.billing?.labSettlementAmount || 0),
      ),
    );
    const row = byLab.get(labId) || {
      labAnchorId: t.targetLabAnchorId,
      labFee: 0,
      practiceTransferIds: [],
      requestIds: [],
    };
    row.labFee += labFee;
    row.practiceTransferIds.push(t._id);
    for (const rid of t.production?.relatedRequestIds || []) {
      if (rid) row.requestIds.push(rid);
    }
    byLab.set(labId, row);
  }

  const linkedRequests = await Request.find({
    "partnerBilling.relatedPracticeTransferId": { $in: allTransferIds },
  })
    .select({ _id: 1, "partnerBilling.relatedPracticeTransferId": 1 })
    .lean();

  const transferToRequests = new Map();
  for (const req of linkedRequests) {
    const ptxId = String(
      req?.partnerBilling?.relatedPracticeTransferId || "",
    ).trim();
    if (!ptxId) continue;
    if (!transferToRequests.has(ptxId)) transferToRequests.set(ptxId, []);
    transferToRequests.get(ptxId).push(req._id);
  }

  for (const row of byLab.values()) {
    const reqSet = new Set(row.requestIds.map((id) => String(id)));
    for (const ptxId of row.practiceTransferIds) {
      for (const rid of transferToRequests.get(String(ptxId)) || []) {
        reqSet.add(String(rid));
      }
    }
    row.requestIds = [...reqSet]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
  }

  const remittances = [];
  for (const row of byLab.values()) {
    let labToAbuts = 0;
    if (row.requestIds.length) {
      const spend = await LedgerLine.aggregate([
        {
          $match: {
            ownerId: row.labAnchorId,
            amount: { $lt: 0 },
            refId: { $in: row.requestIds },
            accountCode: {
              $in: [
                "REQ_FREE_REQUEST_CREDIT",
                "REQ_FREE_SHIPPING_CREDIT",
                "REQ_PAID_CREDIT",
                "LAB_SETTLEMENT_CREDIT",
              ],
            },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      labToAbuts = roundWon(-Number(spend?.[0]?.total || 0));
    }
    labToAbuts = Math.min(labToAbuts, row.labFee);
    const labNet = Math.max(0, row.labFee - labToAbuts);
    remittances.push({
      labAnchorId: row.labAnchorId,
      labFee: row.labFee,
      labToAbuts,
      labNet,
      practiceTransferIds: row.practiceTransferIds,
      requestIds: row.requestIds,
    });
  }

  return remittances;
}

/**
 * 전환 견적(하한·라인). 입금 생성·UI·워터폴 SSOT.
 */
export async function computeDemoConversionQuote(businessAnchorId) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) {
    const err = new Error("사업자 정보가 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({
      businessType: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
      demoMode: 1,
      demoModeStartedAt: 1,
      demoModeExitedAt: 1,
      conversionPendingAt: 1,
    })
    .lean();
  if (!anchor || String(anchor.businessType || "") !== "requestor") {
    const err = new Error("의뢰자 사업자만 전환 견적을 계산할 수 있습니다.");
    err.statusCode = 400;
    throw err;
  }

  const kind = await resolveKind(anchorId, anchor);
  const unit = resolveCreditChargeUnit(kind);
  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId: anchorId,
  });
  const freeRequest = Math.round(Number(snapshot?.freeRequestCredit || 0));
  const demoDebt = freeRequest < 0 ? -freeRequest : 0;
  const periodStart = anchor.demoModeStartedAt || null;
  const periodEnd = new Date();

  if (kind === "lab") {
    const prepaidMin = unit;
    const minTotal = resolveConversionMinTotal({
      demoDebt,
      prepaidMin,
      chargeUnit: unit,
    });
    return {
      kind: "lab",
      demoMode: Boolean(anchor.demoMode) && !anchor.demoModeExitedAt,
      conversionPending: Boolean(anchor.conversionPendingAt),
      periodStart,
      periodEnd,
      demoDebt,
      abutsUsage: demoDebt,
      practiceToLabTotal: 0,
      prepaidMin,
      minTotal,
      chargeUnit: unit,
      labRemittances: [],
      freeRequestCredit: freeRequest,
      settlementCredit: Math.round(Number(snapshot?.settlementCredit || 0)),
    };
  }

  const labRemittances = await aggregatePracticeLabRemittances({
    practiceAnchorId: anchorId,
    periodStart,
    periodEnd,
  });
  const practiceToLabTotal = labRemittances.reduce(
    (sum, row) => sum + roundWon(row.labFee),
    0,
  );
  // ① = 데모 부채 중 기공비로 설명되지 않는 분(어벗츠 직접 이용). 부채가 더 작으면 0.
  const abutsUsage = Math.max(0, demoDebt - practiceToLabTotal);
  const prepaidMin = unit;
  const minTotal = resolveConversionMinTotal({
    demoDebt,
    prepaidMin,
    chargeUnit: unit,
  });

  return {
    kind: "practice",
    demoMode: Boolean(anchor.demoMode) && !anchor.demoModeExitedAt,
    conversionPending: Boolean(anchor.conversionPendingAt),
    periodStart,
    periodEnd,
    demoDebt,
    abutsUsage,
    practiceToLabTotal,
    prepaidMin,
    minTotal,
    chargeUnit: unit,
    labRemittances,
    freeRequestCredit: freeRequest,
    settlementCredit: Math.round(Number(snapshot?.settlementCredit || 0)),
  };
}

/**
 * PENDING ConversionInvoice upsert (만료·수동 전환 대기).
 */
export async function ensureConversionInvoicePending({
  businessAnchorId,
  reason = "",
  quote: quoteInput = null,
} = {}) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) return null;

  const quote = quoteInput || (await computeDemoConversionQuote(anchorId));
  const existing = await ConversionInvoice.findOne({
    businessAnchorId: anchorId,
    status: "PENDING",
  })
    .sort({ createdAt: -1 })
    .lean();

  const payload = {
    requestorKind: quote.kind,
    periodStart: quote.periodStart,
    periodEnd: quote.periodEnd,
    abutsUsage: quote.abutsUsage,
    practiceToLabTotal: quote.practiceToLabTotal,
    demoDebt: quote.demoDebt,
    prepaidMin: quote.prepaidMin,
    minTotal: quote.minTotal,
    labRemittances: quote.labRemittances || [],
    reason: String(reason || "").trim(),
    quoteSnapshot: quote,
  };

  if (existing?._id) {
    await ConversionInvoice.updateOne({ _id: existing._id }, { $set: payload });
    return ConversionInvoice.findById(existing._id).lean();
  }

  const created = await ConversionInvoice.create({
    businessAnchorId: anchorId,
    status: "PENDING",
    ...payload,
  });
  return created.toObject ? created.toObject() : created;
}

/**
 * 유료 잔고로 데모 freeRequest 부채 청산 (용서 리셋 아님).
 */
async function settleDemoDebtFromPaidCredit({
  businessAnchorId,
  userId,
  debtAmount,
  chargeOrderId,
} = {}) {
  const debt = roundWon(debtAmount);
  if (debt <= 0) return { settled: 0, journalId: null };

  const glResult = await postGeneralLedgerJournal({
    idempotencyKey: `gl:demo_conversion_debt:${String(businessAnchorId)}:${String(chargeOrderId || "none")}`,
    eventType: "ADJUST",
    businessAnchorId,
    refType: "DEMO_CONVERSION",
    refId: chargeOrderId || businessAnchorId,
    createdBy: userId || null,
    meta: {
      memo: "실사용 전환 — 데모 이용분 정산(선수금→부채 청산)",
      source: "demo_conversion_debt_settle",
      debt,
    },
    lines: [
      {
        accountCode: "REQ_PAID_CREDIT",
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: -debt,
        amountExcludingVat: -debt,
        vatAmount: 0,
        amountIncludingVat: -debt,
        creditKind: "PAID",
        refType: "DEMO_CONVERSION",
        refId: chargeOrderId || businessAnchorId,
        meta: { source: "demo_conversion_debt_settle" },
      },
      {
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: debt,
        amountExcludingVat: debt,
        vatAmount: 0,
        amountIncludingVat: debt,
        creditKind: "FREE_REQUEST",
        refType: "DEMO_CONVERSION",
        refId: chargeOrderId || businessAnchorId,
        meta: { source: "demo_conversion_debt_settle" },
      },
    ],
  });

  return { settled: debt, journalId: glResult?.journalId || null };
}

/**
 * 치과 전환: 기공소 정산크레딧에서 ②-a(Lab→Abuts)만큼 차감하고 기공소 데모 부채를 같은 금액 청산.
 * 남는 정산크레딧 = ②-b (월정산 파이프 유지).
 */
async function applyPracticeLabRemittanceOffsets({
  practiceAnchorId,
  remittances,
  chargeOrderId,
  userId,
} = {}) {
  const results = [];
  for (const row of remittances || []) {
    const labId = toObjectId(row.labAnchorId);
    const labToAbuts = roundWon(row.labToAbuts);
    if (!labId || labToAbuts <= 0) {
      results.push({
        labAnchorId: row.labAnchorId,
        labToAbuts: 0,
        clawedSettlement: 0,
        clearedLabDebt: 0,
      });
      continue;
    }

    const labSnap = await getBusinessCreditBalanceSnapshot({
      businessAnchorId: labId,
    });
    const settlementBal = Math.max(
      0,
      Math.round(Number(labSnap?.settlementCredit || 0)),
    );
    const freeRequest = Math.round(Number(labSnap?.freeRequestCredit || 0));
    const labDebt = freeRequest < 0 ? -freeRequest : 0;
    const clawSettlement = Math.min(labToAbuts, settlementBal);
    const clearDebt = Math.min(labToAbuts, labDebt);

    const lines = [];
    if (clawSettlement > 0) {
      lines.push({
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: labId,
        amount: -clawSettlement,
        amountExcludingVat: -clawSettlement,
        vatAmount: 0,
        amountIncludingVat: -clawSettlement,
        creditKind: "SETTLEMENT",
        refType: "DEMO_CONVERSION",
        refId: chargeOrderId || practiceAnchorId,
        meta: {
          source: "demo_conversion_lab_to_abuts_offset",
          practiceAnchorId: String(practiceAnchorId),
        },
      });
    }
    if (clearDebt > 0) {
      lines.push({
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: labId,
        amount: clearDebt,
        amountExcludingVat: clearDebt,
        vatAmount: 0,
        amountIncludingVat: clearDebt,
        creditKind: "FREE_REQUEST",
        refType: "DEMO_CONVERSION",
        refId: chargeOrderId || practiceAnchorId,
        meta: {
          source: "demo_conversion_lab_debt_clear",
          practiceAnchorId: String(practiceAnchorId),
        },
      });
    }

    // 정산 차감과 부채 청산 금액이 다르면 플랫폼 잔여(어벗츠 수취)로 균형.
    // claw > clear: 어벗츠가 정산에서 가져감(부채 없던 분).
    // clear > claw: 이미 정산 없는 부채를 전환 입금으로 탕감(practice 입금 경제효과).
    const imbalance = clawSettlement - clearDebt;
    if (imbalance !== 0 && lines.length) {
      // 단선 저널 균형은 동일 owner 합이 0일 필요 없음(멀티 계정). 플랫폼 REV는 생략(정산/부채만).
    }

    if (lines.length) {
      await postGeneralLedgerJournal({
        idempotencyKey: `gl:demo_conversion_lab_offset:${String(practiceAnchorId)}:${String(labId)}:${String(chargeOrderId || "none")}`,
        eventType: "ADJUST",
        businessAnchorId: labId,
        refType: "DEMO_CONVERSION",
        refId: chargeOrderId || practiceAnchorId,
        createdBy: userId || null,
        meta: {
          memo: "실사용 전환 — 치과 입금 경유 Lab→Abuts 상계",
          source: "demo_conversion_lab_offset",
          practiceAnchorId: String(practiceAnchorId),
          labFee: roundWon(row.labFee),
          labToAbuts,
          labNet: roundWon(row.labNet),
          clawSettlement,
          clearDebt,
        },
        lines,
      });
      void emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: labId,
        balanceDelta: clearDebt - clawSettlement,
        reason: "demo_conversion_lab_offset",
        refId: chargeOrderId || practiceAnchorId,
        forceEmit: true,
      }).catch(() => {});
    }

    results.push({
      labAnchorId: labId,
      labToAbuts,
      clawedSettlement: clawSettlement,
      clearedLabDebt: clearDebt,
      labNet: roundWon(row.labNet),
    });
  }
  return results;
}

/**
 * CHARGE_PAID 직후: 워터폴 적용 + 데모 종료(부채 용서 리셋 없음).
 */
export async function applyDemoConversionWaterfallAfterPaidCharge({
  businessAnchorId,
  chargeOrderId,
  chargeAmount,
  userId,
  reason = "유료 크레딧 입금",
} = {}) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) return null;

  const { getDemoModeState, exitDemoModeAfterConversionPaid } = await import(
    "../controllers/businesses/business.demoMode.util.js"
  );
  const state = await getDemoModeState(anchorId);
  if (!state.demoMode || state.demoModeExitedAt) {
    return { skipped: true, reason: "not_in_demo" };
  }

  const quote = await computeDemoConversionQuote(anchorId);
  const amount = roundWon(chargeAmount);
  try {
    assertChargeMeetsConversionMinimum(amount, quote);
  } catch (err) {
    console.error(
      "[demoConversion] charge below conversion minimum after match",
      String(anchorId),
      amount,
      quote?.minTotal,
      err?.message || err,
    );
    // 입금은 이미 매칭됨 — 부채만이라도 청산하고 종료. 선수금 하한 미달은 운영 로그.
  }

  const invoice = await ensureConversionInvoicePending({
    businessAnchorId: anchorId,
    reason,
    quote,
  });

  const { settled, journalId: debtJournalId } =
    await settleDemoDebtFromPaidCredit({
      businessAnchorId: anchorId,
      userId,
      debtAmount: quote.demoDebt,
      chargeOrderId,
    });

  let remittanceResults = [];
  if (quote.kind === "practice" && (quote.labRemittances || []).length) {
    remittanceResults = await applyPracticeLabRemittanceOffsets({
      practiceAnchorId: anchorId,
      remittances: quote.labRemittances,
      chargeOrderId,
      userId,
    });
  }

  const prepaidCredited = Math.max(0, amount - settled);

  if (invoice?._id) {
    await ConversionInvoice.updateOne(
      { _id: invoice._id },
      {
        $set: {
          status: "PAID",
          paidAt: new Date(),
          paidChargeAmount: amount,
          prepaidCredited,
          chargeOrderId: chargeOrderId || null,
          quoteSnapshot: { ...quote, remittanceResults },
        },
      },
    );
  }

  const exitResult = await exitDemoModeAfterConversionPaid({
    businessAnchorId: anchorId,
    userId,
    reason,
    chargeOrderId,
  });

  void emitCreditBalanceUpdatedToBusiness({
    businessAnchorId: anchorId,
    balanceDelta: 0,
    reason: "demo_conversion_waterfall",
    refId: chargeOrderId || anchorId,
    forceEmit: true,
  }).catch(() => {});

  return {
    skipped: false,
    quote,
    settled,
    prepaidCredited,
    debtJournalId,
    remittanceResults,
    exitResult,
    invoiceId: invoice?._id || null,
  };
}

/**
 * 데모 기공소 정산 지급 동결 여부.
 */
export async function shouldFreezeLabSettlementPayout(businessAnchorId) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) return false;
  const anchor = await BusinessAnchor.findById(anchorId)
    .select({
      demoMode: 1,
      demoModeExitedAt: 1,
      conversionPendingAt: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
    })
    .lean();
  if (!anchor) return false;
  const kind = await resolveKind(anchorId, anchor);
  if (kind !== "lab") return false;
  if (anchor.demoMode && !anchor.demoModeExitedAt) return true;
  if (anchor.conversionPendingAt && !anchor.demoModeExitedAt) return true;
  const open = await ConversionInvoice.exists({
    businessAnchorId: anchorId,
    status: "PENDING",
  });
  return Boolean(open);
}

export async function getLatestConversionInvoice(businessAnchorId) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) return null;
  return ConversionInvoice.findOne({ businessAnchorId: anchorId })
    .sort({ createdAt: -1 })
    .lean();
}
