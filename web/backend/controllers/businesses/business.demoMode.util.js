// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/freeCreditGrant.model.js
// - web/backend/controllers/businesses/business.freeCredit.util.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditBalance.service.js
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import { isDuplicateKeyError } from "./business.validation.util.js";

/** 데모 크레딧 초기 충전액(원). 치과↔기공소 기공의뢰(PTX) 차감 전용. */
export const DEMO_CREDIT_AMOUNT = 1_000_000;

/** 데모 모드 유효기간(일). startedAt 기준 경과 시 자동 실사용 전환. */
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

async function ensureDemoCreditGrant({
  businessAnchorId,
  userId,
  businessNumber,
  amount,
}) {
  let grant = await FreeCreditGrant.findOne({
    type: DEMO_GRANT_TYPE,
    businessNumber,
    isOverride: false,
  })
    .select({ _id: 1, grantJournalId: 1, amount: 1, canceledAt: 1 })
    .lean();

  if (!grant) {
    try {
      const created = await FreeCreditGrant.create({
        type: DEMO_GRANT_TYPE,
        businessNumber,
        amount,
        businessAnchorId,
        userId: userId || null,
        isOverride: false,
        source: "auto",
        grantedByUserId: null,
      });
      grant = {
        _id: created._id,
        grantJournalId: created.grantJournalId || null,
        amount,
        canceledAt: null,
      };
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        grant = await FreeCreditGrant.findOne({
          type: DEMO_GRANT_TYPE,
          businessNumber,
          isOverride: false,
        })
          .select({ _id: 1, grantJournalId: 1, amount: 1, canceledAt: 1 })
          .lean();
      } else {
        throw e;
      }
    }
  }

  return grant;
}

async function postDemoCreditCharge({
  businessAnchorId,
  userId,
  amount,
  grantId,
}) {
  const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!normalizedAmount) {
    return { ok: false, posted: false, journalId: null };
  }

  const idempotencyKey = `gl:demo_credit_grant:${String(grantId)}`;
  const glResult = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "CHARGE_FREE_REQUEST",
    businessAnchorId,
    refType: "DEMO_CREDIT",
    refId: grantId,
    createdBy: userId || null,
    meta: {
      memo: "데모 크레딧 충전",
      freeCreditGrantId: String(grantId || "").trim() || null,
      source: "demo_credit",
      demoCredit: true,
    },
    lines: [
      {
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: normalizedAmount,
        amountExcludingVat: normalizedAmount,
        vatAmount: 0,
        amountIncludingVat: normalizedAmount,
        creditKind: "FREE_REQUEST",
        refType: "DEMO_CREDIT",
        refId: grantId,
        meta: { source: "demo_credit", demoCredit: true },
      },
    ],
  });

  return {
    ok: true,
    posted: Boolean(glResult?.posted),
    journalId: glResult?.journalId || null,
  };
}

/**
 * 의뢰자 사업자 신규 생성 시 데모 모드 시작 + 100만 원 데모 크레딧 1회 지급.
 * 이미 실사용 전환(demoModeExitedAt)한 사업자는 재진입하지 않는다.
 */
export async function enableDemoModeAndGrantCreditIfEligible({
  businessAnchorId,
  userId,
} = {}) {
  if (!businessAnchorId) return null;

  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      businessType: 1,
      businessNumberNormalized: 1,
      metadata: 1,
      demoMode: 1,
      demoModeExitedAt: 1,
      demoModeStartedAt: 1,
    })
    .lean();
  if (!anchor) return null;
  if (String(anchor.businessType || "") !== "requestor") return null;
  if (anchor.demoModeExitedAt) return null;

  const businessNumber = resolveDemoGrantBusinessNumber(anchor);
  if (!businessNumber) return null;

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

  const grant = await ensureDemoCreditGrant({
    businessAnchorId,
    userId,
    businessNumber,
    amount: DEMO_CREDIT_AMOUNT,
  });
  if (!grant?._id || grant.canceledAt) return null;
  if (grant.grantJournalId) {
    return { amount: 0, alreadyGranted: true, demoMode: true };
  }

  const postResult = await postDemoCreditCharge({
    businessAnchorId,
    userId,
    amount: DEMO_CREDIT_AMOUNT,
    grantId: grant._id,
  });
  if (!postResult?.ok) return null;

  if (postResult.journalId) {
    await FreeCreditGrant.updateOne(
      { _id: grant._id },
      { $set: { grantJournalId: String(postResult.journalId) } },
    );
  }

  if (postResult.posted) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: DEMO_CREDIT_AMOUNT,
      reason: "demo_credit_grant",
      refId: postResult.journalId || grant._id,
    });
  }

  return {
    amount: postResult.posted ? DEMO_CREDIT_AMOUNT : 0,
    alreadyGranted: !postResult.posted,
    demoMode: true,
  };
}

/**
 * 실사용 전환: 데모 모드 OFF + 잔여 데모 크레딧(무료의뢰 버킷) 회수.
 * 데모 지급액 한도 내에서 현재 freeRequestCredit만 차감한다.
 * @param {{ businessAnchorId: any, userId?: any, reason?: string }} args
 *   reason: 사용자 요청·소진·기간 만료 구분 (기본 "실사용 전환")
 */
export async function exitDemoMode({
  businessAnchorId,
  userId,
  reason,
} = {}) {
  if (!businessAnchorId) {
    const err = new Error("사업자 정보가 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const exitReason = String(reason || "").trim() || "실사용 전환";

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
      alreadyExited: true,
      reason: exitReason,
    };
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

  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId,
  });
  const freeRequest = Math.max(
    0,
    Math.round(Number(snapshot?.freeRequestCredit || 0)),
  );
  const demoCap = Math.max(
    0,
    Math.round(Number(grant?.amount || DEMO_CREDIT_AMOUNT)),
  );
  const clawBack = Math.min(freeRequest, demoCap);

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

  const now = new Date();
  await BusinessAnchor.updateOne(
    { _id: businessAnchorId },
    {
      $set: {
        demoMode: false,
        demoModeExitedAt: now,
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

  return {
    demoMode: false,
    clawedBack: clawBack,
    alreadyExited: false,
    reason: exitReason,
  };
}

export async function getDemoModeState(businessAnchorId) {
  if (!businessAnchorId) {
    return { demoMode: false, demoModeExitedAt: null };
  }
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ demoMode: 1, demoModeExitedAt: 1, demoModeStartedAt: 1 })
    .lean();
  return {
    demoMode: Boolean(anchor?.demoMode),
    demoModeExitedAt: anchor?.demoModeExitedAt || null,
    demoModeStartedAt: anchor?.demoModeStartedAt || null,
  };
}

/**
 * 데모 모드에서 무료의뢰 버킷 중 "데모 예약분" 상한(원).
 * 치과↔기공소 기공의뢰(PTX)만 이 예약을 쓰고, 스토어·커스텀어벗 등은 제외한다.
 * 유효기간이 지났으면 즉시 실사용 전환 후 0.
 */
export async function resolveDemoFreeRequestReserveCap(businessAnchorId) {
  if (!businessAnchorId) return 0;
  const state = await getDemoModeState(businessAnchorId);
  if (!state.demoMode || state.demoModeExitedAt) return 0;

  if (isDemoModeExpired(state.demoModeStartedAt)) {
    try {
      await exitDemoMode({
        businessAnchorId,
        reason: "데모 기간 만료",
      });
    } catch (e) {
      console.error(
        "[demoMode] expiry exit in reserveCap failed",
        String(businessAnchorId),
        e?.message || e,
      );
    }
    return 0;
  }

  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ businessNumberNormalized: 1, metadata: 1 })
    .lean();
  const businessNumber = resolveDemoGrantBusinessNumber(anchor || {});
  if (!businessNumber) return DEMO_CREDIT_AMOUNT;

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

/**
 * 잔액 스냅샷에서 데모 예약 무료의뢰분을 제외(스토어·커스텀어벗 등 실사용 차감용).
 */
export function excludeDemoFreeRequestFromBalance(balance, demoReserveCap) {
  const cap = Math.max(0, Math.round(Number(demoReserveCap || 0)));
  if (!cap || !balance) return balance;
  const freeRequest = Math.max(
    0,
    Math.round(Number(balance.freeRequestCredit || 0)),
  );
  const reserved = Math.min(freeRequest, cap);
  if (reserved <= 0) return balance;
  return {
    ...balance,
    freeRequestCredit: Math.max(0, freeRequest - reserved),
  };
}

/**
 * 데모 모드 자동 종료(실사용 전환 + 잔여 데모 크레딧 회수).
 * 1) 유효기간(DEMO_MODE_DURATION_DAYS) 경과
 * 2) 데모 크레딧(무료의뢰 버킷) 소진 — freeRequestCredit === 0 이고
 *    미전환 HOLD가 없을 때(취소 시 복구 가능하므로)
 */
export async function maybeAutoExitDemoModeIfExhausted({
  businessAnchorId,
  userId,
} = {}) {
  if (!businessAnchorId) return null;

  const state = await getDemoModeState(businessAnchorId);
  if (!state.demoMode || state.demoModeExitedAt) return null;

  if (isDemoModeExpired(state.demoModeStartedAt)) {
    return exitDemoMode({
      businessAnchorId,
      userId,
      reason: "데모 기간 만료",
    });
  }

  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId,
  });
  const freeRequest = Math.max(
    0,
    Math.round(Number(snapshot?.freeRequestCredit || 0)),
  );
  if (freeRequest > 0) return null;

  const LedgerJournal = (await import("../../models/ledgerJournal.model.js"))
    .default;
  const openHold = await LedgerJournal.exists({
    businessAnchorId,
    eventType: {
      $in: [
        "REQUEST_SPEND_HOLD",
        "SHIPPING_SPEND_HOLD",
        "PRACTICE_TRANSFER_SPEND_HOLD",
      ],
    },
    $or: [
      { "meta.convertedAt": { $exists: false } },
      { "meta.convertedAt": null },
    ],
  });
  if (openHold) return null;

  return exitDemoMode({
    businessAnchorId,
    userId,
    reason: "데모 크레딧 소진",
  });
}

/**
 * 만료된 데모 모드 사업자를 일괄 실사용 전환(워커용).
 * @returns {Promise<{ scanned: number, exited: number, errors: number }>}
 */
export async function exitExpiredDemoModesBatch({ limit = 200 } = {}) {
  const cutoff = new Date(
    Date.now() - DEMO_MODE_DURATION_DAYS * MS_PER_DAY,
  );
  const batchLimit = Math.max(1, Math.min(1000, Math.round(Number(limit) || 200)));
  const anchors = await BusinessAnchor.find({
    businessType: "requestor",
    demoMode: true,
    demoModeExitedAt: null,
    demoModeStartedAt: { $ne: null, $lte: cutoff },
  })
    .select({ _id: 1 })
    .limit(batchLimit)
    .lean();

  let exited = 0;
  let errors = 0;
  for (const row of anchors) {
    try {
      const result = await exitDemoMode({
        businessAnchorId: row._id,
        reason: "데모 기간 만료",
      });
      if (result && !result.alreadyExited) exited += 1;
    } catch (e) {
      errors += 1;
      console.error(
        "[demoMode] expiry exit failed",
        String(row?._id || ""),
        e?.message || e,
      );
    }
  }
  return { scanned: anchors.length, exited, errors };
}
