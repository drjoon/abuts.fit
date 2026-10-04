// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/models/conversionInvoice.model.js
// - web/backend/services/labDemoCredit.service.js
// - web/backend/controllers/credits/conversionInvoice.controller.js
// change-log:
// - 2026-10-04: 입금 워터폴 폐기. 치과 전환 = 기공소 직접 지급 확인. 협력=수행 기공소 승인, 하청·어벗츠 자체=어벗츠기공소 승인.
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import ConversionInvoice from "../models/conversionInvoice.model.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";
import { aggregatePracticeLabCredits } from "./labDemoCredit.service.js";
import {
  exitDemoModeAfterConversionPaid,
  isDemoModeExpired,
  isPracticeRequestorAnchor,
  resetDemoFreeRequestDebtToZero,
  resolveDemoModeExpiresAt,
} from "../controllers/businesses/business.demoMode.util.js";

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const PRACTICE_ANCHOR_SELECT = {
  businessType: 1,
  name: 1,
  requestorKind: 1,
  requestorCapabilities: 1,
  demoMode: 1,
  demoModeStartedAt: 1,
  demoModeExitedAt: 1,
  conversionPendingAt: 1,
};

async function loadPracticeAnchor(businessAnchorId) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) throw httpError("사업자 정보가 없습니다.", 400);
  const anchor = await BusinessAnchor.findById(anchorId)
    .select(PRACTICE_ANCHOR_SELECT)
    .lean();
  if (!anchor) throw httpError("사업자를 찾을 수 없습니다.", 404);
  if (
    String(anchor.businessType || "") !== "requestor" ||
    !isPracticeRequestorAnchor(anchor)
  ) {
    throw httpError("치과만 실사용 전환할 수 있습니다.", 400);
  }
  return { anchorId, anchor };
}

/**
 * 기공소별 직접 지급 행.
 * - 협력: 수행 기공소만 승인(어벗츠기공본부는 gross 경유라 행 없음).
 * - 하청·어벗츠 자체: 어벗츠기공소(원청, internalLab) 승인 필요.
 */
async function buildLabRows(practiceAnchorId, previousRows = []) {
  const credits = await aggregatePracticeLabCredits(practiceAnchorId);
  if (!credits.length) return [];
  const labs = await BusinessAnchor.find({
    _id: { $in: credits.map((row) => row.labAnchorId) },
  })
    .select({ name: 1 })
    .lean();
  const labById = new Map(labs.map((lab) => [String(lab._id), lab]));
  const prevById = new Map(
    (previousRows || []).map((row) => [String(row.labAnchorId), row]),
  );

  return credits.map((row) => {
    const lab = labById.get(String(row.labAnchorId));
    const prev = prevById.get(String(row.labAnchorId));
    const confirmed = prev?.status === "CONFIRMED";
    return {
      labAnchorId: row.labAnchorId,
      labName: String(lab?.name || "").trim(),
      amount: row.amount,
      isAbutsLab: row.isAbutsLab,
      status: confirmed ? "CONFIRMED" : "PENDING",
      autoConfirmed: false,
      confirmedAt: prev?.confirmedAt || null,
      confirmedByUserId: prev?.confirmedByUserId || null,
    };
  });
}

function toInvoiceConfirmations(rows) {
  return rows.map((row) => ({
    labAnchorId: row.labAnchorId,
    labName: row.labName,
    amount: row.amount,
    status: row.status,
    autoConfirmed: Boolean(row.autoConfirmed),
    confirmedAt: row.confirmedAt || null,
    confirmedByUserId: row.confirmedByUserId || null,
  }));
}

export async function getLatestConversionInvoice(businessAnchorId) {
  const anchorId = toObjectId(businessAnchorId);
  if (!anchorId) return null;
  return ConversionInvoice.findOne({ businessAnchorId: anchorId })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * 전환 견적: 기공소별 직접 지급액과 확인 상태. 입금 하한은 없다.
 */
export async function computeDemoConversionQuote(businessAnchorId) {
  const { anchorId, anchor } = await loadPracticeAnchor(businessAnchorId);
  const pendingInvoice = await ConversionInvoice.findOne({
    businessAnchorId: anchorId,
    status: "PENDING",
  })
    .sort({ createdAt: -1 })
    .lean();

  const rows = await buildLabRows(
    anchorId,
    pendingInvoice?.labConfirmations || [],
  );
  const directTotal = rows
    .reduce((sum, row) => sum + row.amount, 0);

  const demoMode = Boolean(anchor.demoMode) && !anchor.demoModeExitedAt;
  return {
    kind: "practice",
    demoMode,
    conversionPending: demoMode && Boolean(anchor.conversionPendingAt),
    expired: demoMode && isDemoModeExpired(anchor.demoModeStartedAt),
    demoModeStartedAt: anchor.demoModeStartedAt || null,
    demoModeExpiresAt: resolveDemoModeExpiresAt(anchor.demoModeStartedAt),
    labs: rows,
    directTotal,
    invoiceId: pendingInvoice?._id || null,
  };
}

/**
 * 치과 전환 요청. 승인 대상 기공소(협력 수행 기공소, 하청·자체 건의 어벗츠기공소)의 지급 확인을 기다린다.
 * 승인할 행이 없으면 즉시 전환한다.
 */
export async function requestDemoConversion({
  businessAnchorId,
  userId,
  reason = "실사용 전환 요청",
} = {}) {
  const { anchorId, anchor } = await loadPracticeAnchor(businessAnchorId);
  if (anchor.demoModeExitedAt || !anchor.demoMode) {
    return {
      demoMode: false,
      conversionPending: false,
      completed: true,
      alreadyExited: true,
      labs: [],
    };
  }

  const existing = await ConversionInvoice.findOne({
    businessAnchorId: anchorId,
    status: "PENDING",
  }).sort({ createdAt: -1 });
  const alreadyPending = Boolean(existing);

  const rows = await buildLabRows(anchorId, existing?.labConfirmations || []);
  const confirmations = toInvoiceConfirmations(rows);
  const directTotal = rows
    .reduce((sum, row) => sum + row.amount, 0);

  let invoice = existing;
  const payload = {
    requestorKind: "practice",
    periodStart: anchor.demoModeStartedAt || null,
    periodEnd: new Date(),
    practiceToLabTotal: directTotal,
    labConfirmations: confirmations,
    reason: String(reason || "").trim(),
  };
  if (invoice) {
    invoice.set(payload);
    await invoice.save();
  } else {
    invoice = await ConversionInvoice.create({
      businessAnchorId: anchorId,
      status: "PENDING",
      ...payload,
    });
  }

  await BusinessAnchor.updateOne(
    { _id: anchorId, demoModeExitedAt: null },
    {
      $set: {
        conversionPendingAt: anchor.conversionPendingAt || new Date(),
        conversionPendingReason: String(reason || "").trim(),
      },
    },
  );

  const pendingRows = rows.filter((row) => row.status === "PENDING");
  if (pendingRows.length === 0) {
    const result = await finalizeDemoConversion({
      invoiceId: invoice._id,
      userId,
    });
    return {
      demoMode: false,
      conversionPending: false,
      completed: true,
      alreadyPending,
      invoiceId: invoice._id,
      labs: rows,
      result,
    };
  }

  if (!alreadyPending) {
    for (const row of pendingRows) {
      void emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: row.labAnchorId,
        balanceDelta: 0,
        reason: "demo_conversion_requested",
        refId: invoice._id,
        forceEmit: true,
      }).catch(() => {});
    }
  }
  void emitCreditBalanceUpdatedToBusiness({
    businessAnchorId: anchorId,
    balanceDelta: 0,
    reason: "demo_conversion_pending",
    refId: invoice._id,
    forceEmit: true,
  }).catch(() => {});

  return {
    demoMode: true,
    conversionPending: true,
    completed: false,
    alreadyPending,
    invoiceId: invoice._id,
    labs: rows,
    directTotal,
  };
}

/**
 * 기공소 대기 중인 전환 요청(미정산 잔액 직접 수령 확인).
 */
export async function listPendingConversionsForLab(labAnchorId) {
  const labId = toObjectId(labAnchorId);
  if (!labId) return [];
  const invoices = await ConversionInvoice.find({
    status: "PENDING",
    labConfirmations: {
      $elemMatch: { labAnchorId: labId, status: "PENDING" },
    },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!invoices.length) return [];
  const practices = await BusinessAnchor.find({
    _id: { $in: invoices.map((inv) => inv.businessAnchorId) },
  })
    .select({ name: 1 })
    .lean();
  const nameById = new Map(practices.map((p) => [String(p._id), p.name]));
  return invoices.map((inv) => {
    const mine = inv.labConfirmations.find(
      (row) => String(row.labAnchorId) === String(labId),
    );
    return {
      invoiceId: inv._id,
      practiceAnchorId: inv.businessAnchorId,
      practiceName: String(nameById.get(String(inv.businessAnchorId)) || ""),
      amount: Number(mine?.amount || 0),
      requestedAt: inv.createdAt,
    };
  });
}

/**
 * 기공소 지급 완료 확인. 모든 확인이 모이면 치과를 실사용으로 전환한다.
 */
export async function confirmLabDirectPayment({
  invoiceId,
  labAnchorId,
  userId,
} = {}) {
  const invId = toObjectId(invoiceId);
  const labId = toObjectId(labAnchorId);
  if (!invId || !labId) throw httpError("요청 정보가 올바르지 않습니다.", 400);

  const updated = await ConversionInvoice.findOneAndUpdate(
    {
      _id: invId,
      status: "PENDING",
      labConfirmations: {
        $elemMatch: { labAnchorId: labId, status: "PENDING" },
      },
    },
    {
      $set: {
        "labConfirmations.$.status": "CONFIRMED",
        "labConfirmations.$.confirmedAt": new Date(),
        "labConfirmations.$.confirmedByUserId": userId || null,
      },
    },
    { new: true },
  ).lean();
  if (!updated) {
    throw httpError("확인할 전환 요청이 없습니다.", 404);
  }

  const allConfirmed = (updated.labConfirmations || []).every(
    (row) => row.status === "CONFIRMED",
  );
  let completed = false;
  if (allConfirmed) {
    const result = await finalizeDemoConversion({
      invoiceId: invId,
      userId,
    });
    completed = Boolean(result?.finalized);
  } else {
    void emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: updated.businessAnchorId,
      balanceDelta: 0,
      reason: "demo_conversion_lab_confirmed",
      refId: invId,
      forceEmit: true,
    }).catch(() => {});
  }
  return { completed, invoiceId: invId };
}

/**
 * 전환 확정: 부채 리셋 → 데모 종료 → 기공소별 직접 수령분을 기공크레딧에서 차감(ADJUST).
 * 차감하지 않으면 어벗츠가 직접 지급된 금액을 다시 정산하게 된다.
 */
export async function finalizeDemoConversion({ invoiceId, userId } = {}) {
  const invId = toObjectId(invoiceId);
  if (!invId) return { finalized: false };

  // 동시 확인 경합: 먼저 PAID로 바꾼 쪽만 진행.
  const claimed = await ConversionInvoice.findOneAndUpdate(
    { _id: invId, status: "PENDING" },
    { $set: { status: "PAID", paidAt: new Date() } },
    { new: true },
  ).lean();
  if (!claimed) return { finalized: false, reason: "already_finalized" };

  const practiceId = claimed.businessAnchorId;
  try {
    const credits = await aggregatePracticeLabCredits(practiceId);

    await resetDemoFreeRequestDebtToZero({
      businessAnchorId: practiceId,
      userId,
      reason: "실사용 전환 — 기공소 직접 지급 확인",
      idempotencySuffix: `conv:${String(invId)}`,
    });
    await exitDemoModeAfterConversionPaid({
      businessAnchorId: practiceId,
      userId,
      reason: "기공소 직접 지급 확인 완료",
    });

    const journals = [];
    for (const row of credits) {
      const posted = await postGeneralLedgerJournal({
        idempotencyKey: `gl:demo_conversion_lab_direct:${String(practiceId)}:${String(row.labAnchorId)}:${String(invId)}`,
        eventType: "ADJUST",
        businessAnchorId: row.labAnchorId,
        refType: "DEMO_CONVERSION",
        refId: invId,
        createdBy: userId || null,
        meta: {
          memo: "실사용 전환 — 치과가 기공소에 직접 지급한 데모 기공비",
          source: "demo_conversion_lab_direct_payment",
          practiceAnchorId: String(practiceId),
          amount: row.amount,
        },
        lines: [
          {
            accountCode: "LAB_SETTLEMENT_CREDIT",
            ownerRole: "requestor",
            ownerId: row.labAnchorId,
            amount: -row.amount,
            amountExcludingVat: -row.amount,
            vatAmount: 0,
            amountIncludingVat: -row.amount,
            creditKind: "SETTLEMENT",
            refType: "DEMO_CONVERSION",
            refId: invId,
            meta: {
              source: "demo_conversion_lab_direct_payment",
              practiceAnchorId: String(practiceId),
            },
          },
        ],
      });
      journals.push({
        labAnchorId: String(row.labAnchorId),
        amount: row.amount,
        journalId: posted?.journalId || null,
      });
      void emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: row.labAnchorId,
        balanceDelta: 0,
        reason: "demo_conversion_settled",
        refId: invId,
        forceEmit: true,
      }).catch(() => {});
    }

    await ConversionInvoice.updateOne(
      { _id: invId },
      {
        $set: {
          paidChargeAmount: credits.reduce((s, r) => s + r.amount, 0),
          quoteSnapshot: { settled: journals },
        },
      },
    );

    try {
      const { invalidateMyBusinessCache } = await import(
        "../controllers/businesses/business.controller.js"
      );
      invalidateMyBusinessCache(practiceId);
    } catch (cacheErr) {
      console.warn("[demoConversion] cache invalidate failed", cacheErr?.message);
    }
    void emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: practiceId,
      balanceDelta: 0,
      reason: "demo_conversion_completed",
      refId: invId,
      forceEmit: true,
    }).catch(() => {});

    return { finalized: true, settled: journals };
  } catch (error) {
    console.error(
      "[demoConversion] finalize failed",
      String(invId),
      error?.message || error,
    );
    // 재시도 가능하도록 되돌린다(저널은 idempotencyKey로 멱등).
    await ConversionInvoice.updateOne(
      { _id: invId },
      { $set: { status: "PENDING", paidAt: null } },
    ).catch(() => {});
    throw error;
  }
}

/**
 * 기공소 데모 모드는 폐지됐다. 데모 치과 적립분은 잔액 집계에서 이미 제외되므로 동결할 필요가 없다.
 * @deprecated 호환용 — 항상 false.
 */
export async function shouldFreezeLabSettlementPayout() {
  return false;
}
