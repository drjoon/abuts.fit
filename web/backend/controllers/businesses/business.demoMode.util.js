// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/freeCreditGrant.model.js
// - web/backend/controllers/businesses/business.freeCredit.util.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditBalance.service.js
// - web/backend/services/demoConversion.service.js
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// change-log:
// - 2026-09-09: 전환 입금 워터폴. 만료/수동은 conversionPending(부채 유지). 무료 부채 리셋 종료 폐기.
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";

/**
 * 레거시 데모 크레딧 초기 충전액(원). 신규 가입은 미지급(0원 시작).
 * 기존 grant 회수·마이그레이션 상한에만 사용.
 */
export const DEMO_CREDIT_AMOUNT = 1_000_000;

/** 데모 모드 유효기간(일). startedAt 기준 경과 시 전환 입금 대기로 잠금. */
export const DEMO_MODE_DURATION_DAYS = 30;

const DEMO_GRANT_TYPE = "DEMO_CREDIT";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @param {Date|string|null|undefined} startedAt */
export function isDemoModeExpired(startedAt, now = new Date()) {
  if (!startedAt) return false;
  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  return nowMs >= startedMs + DEMO_MODE_DURATION_DAYS * MS_PER_DAY;
}

export function resolveDemoModeExpiresAt(startedAt) {
  if (!startedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) return null;
  return new Date(startedMs + DEMO_MODE_DURATION_DAYS * MS_PER_DAY);
}

function resolveDemoGrantBusinessNumber(anchor) {
  const fromMeta = String(anchor?.metadata?.businessNumber || "")
    .replace(/\D/g, "")
    .trim();
  if (fromMeta) return fromMeta;
  return String(anchor?.businessNumberNormalized || "")
    .trim()
    .toLowerCase();
}

/**
 * 의뢰자 사업자 신규 생성 시 데모 모드만 시작(크레딧 미지급, 0원).
 * 유료 전환 입금(CHARGE_PAID 워터폴) 확정 시에만 실사용. 만료·수동은 전환 대기.
 */
export async function enableDemoModeAndGrantCreditIfEligible({
  businessAnchorId,
  userId,
} = {}) {
  void userId;
  if (!businessAnchorId) return null;

  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      businessType: 1,
      demoMode: 1,
      demoModeExitedAt: 1,
      demoModeStartedAt: 1,
    })
    .lean();
  if (!anchor) return null;
  if (String(anchor.businessType || "") !== "requestor") return null;
  if (anchor.demoModeExitedAt) return null;

  const now = new Date();
  if (!anchor.demoMode) {
    await BusinessAnchor.updateOne(
      { _id: businessAnchorId, demoModeExitedAt: null },
      {
        $set: {
          demoMode: true,
          demoModeStartedAt: anchor.demoModeStartedAt || now,
        },
      },
    );
  }

  return {
    amount: 0,
    alreadyGranted: true,
    demoMode: true,
  };
}

/**
 * 레거시 DEMO_CREDIT grant 잔여(양수 freeRequest ∩ grant) 회수.
 */
export async function clawBackLegacyDemoCreditGrant({
  businessAnchorId,
  userId,
  reason,
  freeRequestCredit,
} = {}) {
  if (!businessAnchorId) {
    return { clawedBack: 0, clawJournalId: null, grant: null };
  }

  const exitReason = String(reason || "").trim() || "데모 크레딧 회수";
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      businessType: 1,
      businessNumberNormalized: 1,
      metadata: 1,
    })
    .lean();
  if (!anchor || String(anchor.businessType || "") !== "requestor") {
    return { clawedBack: 0, clawJournalId: null, grant: null };
  }

  const businessNumber = resolveDemoGrantBusinessNumber(anchor);
  const grant = businessNumber
    ? await FreeCreditGrant.findOne({
        type: DEMO_GRANT_TYPE,
        businessNumber,
        isOverride: false,
      })
        .select({ _id: 1, amount: 1, grantJournalId: 1, canceledAt: 1 })
        .lean()
    : null;

  let freeRequest = Number(freeRequestCredit);
  if (!Number.isFinite(freeRequest)) {
    const snapshot = await getBusinessCreditBalanceSnapshot({
      businessAnchorId,
    });
    freeRequest = Math.round(Number(snapshot?.freeRequestCredit || 0));
  } else {
    freeRequest = Math.round(freeRequest);
  }

  const demoCap = Math.max(
    0,
    Math.round(Number(grant?.amount || DEMO_CREDIT_AMOUNT)),
  );
  const positiveFree = Math.max(0, freeRequest);
  const clawBack =
    grant && !grant.canceledAt ? Math.min(positiveFree, demoCap) : 0;

  let clawJournalId = null;
  if (clawBack > 0 && grant?._id) {
    const glResult = await postGeneralLedgerJournal({
      idempotencyKey: `gl:demo_credit_exit:${String(grant._id)}`,
      eventType: "ADJUST",
      businessAnchorId,
      refType: "DEMO_CREDIT_EXIT",
      refId: grant._id,
      createdBy: userId || null,
      meta: {
        memo: `${exitReason} — 데모 크레딧 회수`,
        source: "demo_credit_exit",
        demoCredit: true,
        clawBack,
        exitReason,
      },
      lines: [
        {
          accountCode: "REQ_FREE_REQUEST_CREDIT",
          ownerRole: "requestor",
          ownerId: businessAnchorId,
          amount: -clawBack,
          amountExcludingVat: -clawBack,
          vatAmount: 0,
          amountIncludingVat: -clawBack,
          creditKind: "FREE_REQUEST",
          refType: "DEMO_CREDIT_EXIT",
          refId: grant._id,
          meta: { source: "demo_credit_exit", demoCredit: true, exitReason },
        },
      ],
    });
    clawJournalId = glResult?.journalId || null;
    if (glResult?.posted) {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId,
        balanceDelta: -clawBack,
        reason: "demo_credit_exit",
        refId: clawJournalId || grant._id,
      });
    }
  }

  return { clawedBack: clawBack, clawJournalId, grant };
}

/**
 * @deprecated 전환 워터폴 도입 후 무료 부채 리셋 종료 금지. 레거시/관리자 복구용만.
 */
export async function resetDemoFreeRequestDebtToZero({
  businessAnchorId,
  userId,
  reason,
  freeRequestCredit,
  idempotencySuffix,
} = {}) {
  if (!businessAnchorId) {
    return { resetAmount: 0, journalId: null };
  }

  let freeRequest = Number(freeRequestCredit);
  if (!Number.isFinite(freeRequest)) {
    const snapshot = await getBusinessCreditBalanceSnapshot({
      businessAnchorId,
    });
    freeRequest = Math.round(Number(snapshot?.freeRequestCredit || 0));
  } else {
    freeRequest = Math.round(freeRequest);
  }

  if (!(freeRequest < 0)) {
    return { resetAmount: 0, journalId: null };
  }

  const resetAmount = -freeRequest;
  const exitReason = String(reason || "").trim() || "데모 부채 리셋";
  const suffix = String(idempotencySuffix || businessAnchorId).trim();
  const glResult = await postGeneralLedgerJournal({
    idempotencyKey: `gl:demo_debt_reset:${suffix}`,
    eventType: "ADJUST",
    businessAnchorId,
    refType: "DEMO_DEBT_RESET",
    refId: businessAnchorId,
    createdBy: userId || null,
    meta: {
      memo: `${exitReason} — 데모 부채 리셋(레거시)`,
      source: "demo_debt_reset",
      demoCredit: true,
      resetAmount,
      exitReason,
    },
    lines: [
      {
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: resetAmount,
        amountExcludingVat: resetAmount,
        vatAmount: 0,
        amountIncludingVat: resetAmount,
        creditKind: "FREE_REQUEST",
        refType: "DEMO_DEBT_RESET",
        refId: businessAnchorId,
        meta: { source: "demo_debt_reset", demoCredit: true, exitReason },
      },
    ],
  });

  const journalId = glResult?.journalId || null;
  if (glResult?.posted) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: resetAmount,
      reason: "demo_debt_reset",
      refId: journalId || businessAnchorId,
    });
  }

  return { resetAmount, journalId };
}

/**
 * 만료·수동 전환: 실사용 종료가 아니라 전환 입금 대기.
 * 부채 유지, overdraft 잠금, ConversionInvoice PENDING.
 */
export async function beginDemoConversionPending({
  businessAnchorId,
  userId,
  reason,
} = {}) {
  if (!businessAnchorId) {
    const err = new Error("사업자 정보가 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const pendingReason = String(reason || "").trim() || "실사용 전환 대기";
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      businessType: 1,
      demoMode: 1,
      demoModeExitedAt: 1,
      conversionPendingAt: 1,
    })
    .lean();
  if (!anchor) {
    const err = new Error("사업자를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  if (String(anchor.businessType || "") !== "requestor") {
    const err = new Error("의뢰자 사업자만 실사용 전환할 수 있습니다.");
    err.statusCode = 400;
    throw err;
  }
  if (anchor.demoModeExitedAt || !anchor.demoMode) {
    return {
      demoMode: false,
      conversionPending: false,
      alreadyExited: true,
      reason: pendingReason,
    };
  }

  const now = new Date();
  const alreadyPending = Boolean(anchor.conversionPendingAt);
  if (!alreadyPending) {
    await BusinessAnchor.updateOne(
      { _id: businessAnchorId, demoModeExitedAt: null },
      {
        $set: {
          conversionPendingAt: now,
          conversionPendingReason: pendingReason,
        },
      },
    );
  } else {
    await BusinessAnchor.updateOne(
      { _id: businessAnchorId },
      { $set: { conversionPendingReason: pendingReason } },
    );
  }

  let quote = null;
  let invoice = null;
  try {
    const {
      computeDemoConversionQuote,
      ensureConversionInvoicePending,
    } = await import("../../services/demoConversion.service.js");
    quote = await computeDemoConversionQuote(businessAnchorId);
    invoice = await ensureConversionInvoicePending({
      businessAnchorId,
      reason: pendingReason,
      quote,
    });
  } catch (e) {
    console.error(
      "[demoMode] conversion invoice on pending failed",
      String(businessAnchorId),
      e?.message || e,
    );
  }

  void emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: 0,
    reason: "demo_conversion_pending",
    refId: businessAnchorId,
    forceEmit: true,
  }).catch(() => {});

  void userId;
  return {
    demoMode: true,
    conversionPending: true,
    alreadyExited: false,
    alreadyPending,
    reason: pendingReason,
    minTotal: quote?.minTotal ?? null,
    quote,
    invoiceId: invoice?._id || null,
  };
}

/**
 * @deprecated 무료 종료 금지. beginDemoConversionPending 사용.
 * 호환: 호출부 → 전환 대기로 위임.
 */
export async function exitDemoMode({
  businessAnchorId,
  userId,
  reason,
} = {}) {
  return beginDemoConversionPending({
    businessAnchorId,
    userId,
    reason: reason || "실사용 전환 대기",
  });
}

/**
 * 전환 입금 워터폴 완료 후 데모 OFF (부채는 이미 유료로 청산됨 — 리셋 없음).
 */
export async function exitDemoModeAfterConversionPaid({
  businessAnchorId,
  userId,
  reason = "유료 전환 입금",
  chargeOrderId,
} = {}) {
  if (!businessAnchorId) {
    const err = new Error("사업자 정보가 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const exitReason = String(reason || "").trim() || "유료 전환 입금";
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      businessType: 1,
      businessNumberNormalized: 1,
      metadata: 1,
      demoMode: 1,
      demoModeExitedAt: 1,
    })
    .lean();
  if (!anchor) {
    const err = new Error("사업자를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  if (String(anchor.businessType || "") !== "requestor") {
    const err = new Error("의뢰자 사업자만 실사용 전환할 수 있습니다.");
    err.statusCode = 400;
    throw err;
  }
  if (!anchor.demoMode || anchor.demoModeExitedAt) {
    return {
      demoMode: false,
      clawedBack: 0,
      debtReset: 0,
      alreadyExited: true,
      reason: exitReason,
    };
  }

  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId,
  });
  const freeRequestBefore = Math.round(
    Number(snapshot?.freeRequestCredit || 0),
  );

  const { clawedBack, clawJournalId, grant } =
    await clawBackLegacyDemoCreditGrant({
      businessAnchorId,
      userId,
      reason: exitReason,
      freeRequestCredit: freeRequestBefore,
    });

  const now = new Date();
  await BusinessAnchor.updateOne(
    { _id: businessAnchorId },
    {
      $set: {
        demoMode: false,
        demoModeExitedAt: now,
        conversionPendingAt: null,
        conversionPendingReason: "",
      },
    },
  );

  if (grant?._id && !grant.canceledAt) {
    await FreeCreditGrant.updateOne(
      { _id: grant._id },
      {
        $set: {
          canceledAt: now,
          canceledByUserId: userId || null,
          cancelReason: exitReason,
          cancelJournalId: clawJournalId ? String(clawJournalId) : null,
        },
      },
    );
  }

  void chargeOrderId;
  return {
    demoMode: false,
    clawedBack,
    debtReset: 0,
    alreadyExited: false,
    reason: exitReason,
  };
}

/**
 * 유료 크레딧(CHARGE_PAID) 지급 직후 — 전환 워터폴 적용.
 */
export async function exitDemoModeAfterPaidCreditGrant({
  businessAnchorId,
  userId,
  reason = "유료 크레딧 입금",
  chargeOrderId = null,
  chargeAmount = null,
} = {}) {
  if (!businessAnchorId) return null;
  try {
    const state = await getDemoModeState(businessAnchorId);
    if (!state.demoMode || state.demoModeExitedAt) return null;

    const { applyDemoConversionWaterfallAfterPaidCharge } = await import(
      "../../services/demoConversion.service.js"
    );

    let amount = Number(chargeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      if (chargeOrderId) {
        const ChargeOrder = (await import("../../models/chargeOrder.model.js"))
          .default;
        const order = await ChargeOrder.findById(chargeOrderId)
          .select({ supplyAmount: 1, amountTotal: 1 })
          .lean();
        amount = Math.round(
          Number(order?.supplyAmount || order?.amountTotal || 0),
        );
      }
    }

    const result = await applyDemoConversionWaterfallAfterPaidCharge({
      businessAnchorId,
      chargeOrderId,
      chargeAmount: amount,
      userId,
      reason,
    });

    try {
      const { invalidateMyBusinessCache } = await import(
        "./business.controller.js"
      );
      invalidateMyBusinessCache(businessAnchorId);
    } catch (cacheErr) {
      console.warn(
        "[demoMode] invalidate cache after paid charge failed",
        String(businessAnchorId),
        cacheErr?.message || cacheErr,
      );
    }

    void emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: 0,
      reason: "demo_exit_on_paid_charge",
      refId: chargeOrderId || businessAnchorId,
      forceEmit: true,
    }).catch((e) => {
      console.warn(
        "[demoMode] emit after paid-charge exit failed",
        e?.message || e,
      );
    });
    return result;
  } catch (e) {
    console.error(
      "[demoMode] exit on paid credit grant failed",
      String(businessAnchorId),
      e?.message || e,
    );
    return null;
  }
}

export async function getDemoModeState(businessAnchorId) {
  if (!businessAnchorId) {
    return {
      demoMode: false,
      demoModeExitedAt: null,
      conversionPendingAt: null,
    };
  }
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      demoMode: 1,
      demoModeExitedAt: 1,
      demoModeStartedAt: 1,
      conversionPendingAt: 1,
      conversionPendingReason: 1,
    })
    .lean();
  return {
    demoMode: Boolean(anchor?.demoMode),
    demoModeExitedAt: anchor?.demoModeExitedAt || null,
    demoModeStartedAt: anchor?.demoModeStartedAt || null,
    conversionPendingAt: anchor?.conversionPendingAt || null,
    conversionPendingReason: anchor?.conversionPendingReason || "",
  };
}

/**
 * 데모 중 가상 잔고 overdraft 허용.
 * 전환 입금 대기(conversionPending)면 잠금.
 */
export async function allowsDemoFreeRequestOverdraft(businessAnchorId) {
  const state = await getDemoModeState(businessAnchorId);
  if (!state?.demoMode || state?.demoModeExitedAt) return false;
  if (state?.conversionPendingAt) return false;
  return true;
}

/**
 * 데모 모드에서 무료의뢰 버킷 중 "데모 예약분" 상한(원).
 * 유효기간이 지났으면 전환 대기로 잠금 후 0.
 */
export async function resolveDemoFreeRequestReserveCap(businessAnchorId) {
  if (!businessAnchorId) return 0;
  const state = await getDemoModeState(businessAnchorId);
  if (!state.demoMode || state.demoModeExitedAt) return 0;

  if (isDemoModeExpired(state.demoModeStartedAt)) {
    try {
      await beginDemoConversionPending({
        businessAnchorId,
        reason: "데모 기간 만료",
      });
    } catch (e) {
      console.error(
        "[demoMode] expiry pending in reserveCap failed",
        String(businessAnchorId),
        e?.message || e,
      );
    }
    return 0;
  }

  if (state.conversionPendingAt) return 0;

  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ businessNumberNormalized: 1, metadata: 1 })
    .lean();
  const businessNumber = resolveDemoGrantBusinessNumber(anchor || {});
  if (!businessNumber) return 0;

  const grant = await FreeCreditGrant.findOne({
    type: DEMO_GRANT_TYPE,
    businessNumber,
    isOverride: false,
  })
    .select({ amount: 1, canceledAt: 1 })
    .lean();
  if (!grant || grant.canceledAt) return 0;
  return Math.max(0, Math.round(Number(grant.amount || DEMO_CREDIT_AMOUNT)));
}

export function excludeDemoFreeRequestFromBalance(balance, demoReserveCap) {
  const cap = Math.max(0, Math.round(Number(demoReserveCap || 0)));
  if (!cap || !balance) return balance;
  const freeRequest = Math.round(Number(balance.freeRequestCredit || 0));
  const positiveFree = Math.max(0, freeRequest);
  const reserved = Math.min(positiveFree, cap);
  if (reserved <= 0) return balance;
  return {
    ...balance,
    freeRequestCredit: Math.max(0, positiveFree - reserved),
  };
}

/**
 * 데모 기간 만료 → 전환 입금 대기(부채 유지).
 */
export async function maybeAutoExitDemoModeIfExhausted({
  businessAnchorId,
  userId,
} = {}) {
  if (!businessAnchorId) return null;

  const state = await getDemoModeState(businessAnchorId);
  if (!state.demoMode || state.demoModeExitedAt) return null;

  if (isDemoModeExpired(state.demoModeStartedAt)) {
    return beginDemoConversionPending({
      businessAnchorId,
      userId,
      reason: "데모 기간 만료",
    });
  }

  return null;
}

/**
 * 만료된 데모 모드 → 전환 입금 대기 일괄.
 */
export async function exitExpiredDemoModesBatch({ limit = 200 } = {}) {
  const cutoff = new Date(
    Date.now() - DEMO_MODE_DURATION_DAYS * MS_PER_DAY,
  );
  const batchLimit = Math.max(
    1,
    Math.min(1000, Math.round(Number(limit) || 200)),
  );
  const anchors = await BusinessAnchor.find({
    businessType: "requestor",
    demoMode: true,
    demoModeExitedAt: null,
    conversionPendingAt: null,
    demoModeStartedAt: { $ne: null, $lte: cutoff },
  })
    .select({ _id: 1 })
    .limit(batchLimit)
    .lean();

  let exited = 0;
  let errors = 0;
  for (const row of anchors) {
    try {
      const result = await beginDemoConversionPending({
        businessAnchorId: row._id,
        reason: "데모 기간 만료",
      });
      if (result && !result.alreadyExited && !result.alreadyPending) exited += 1;
    } catch (e) {
      errors += 1;
      console.error(
        "[demoMode] expiry pending failed",
        String(row?._id || ""),
        e?.message || e,
      );
    }
  }
  return { scanned: anchors.length, exited, errors };
}
