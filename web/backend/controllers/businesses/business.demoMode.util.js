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

/**
 * 레거시 데모 크레딧 초기 충전액(원). 신규 가입은 미지급(0원 시작).
 * 기존 grant 회수·마이그레이션 상한에만 사용.
 */
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

/**
 * 의뢰자 사업자 신규 생성 시 데모 모드만 시작(크레딧 미지급, 0원).
 * 치과(practice)만. 기공소(lab)는 데모 없음(CA 가입 무료 테스트 2건으로 대체).
 * 데모 중 장부는 가상 잔고: 구강스캔·커스텀어벗 기공비 마이너스 허용.
 * 실거래는 치과→기공소 직접 입금. 실사용 전환 후 어벗츠 선수금·월말 정산.
 * 이미 실사용 전환(demoModeExitedAt)한 사업자는 재진입하지 않는다.
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
      requestorKind: 1,
      requestorCapabilities: 1,
    })
    .lean();
  if (!anchor) return null;
  if (String(anchor.businessType || "") !== "requestor") return null;
  if (anchor.demoModeExitedAt) return null;

  const { normalizeRequestorKind, normalizeRequestorCapabilities } =
    await import("../../utils/requestorCapabilities.js");
  const kind = normalizeRequestorKind(anchor.requestorKind);
  if (kind === "lab") return null;
  if (kind !== "practice") {
    const caps = normalizeRequestorCapabilities(anchor.requestorCapabilities);
    // lab-only 레거시: 데모 미적용. practice 포함 또는 kind 미기입+practice만 허용.
    if (caps.lab && !caps.practice) return null;
    if (!caps.practice) return null;
  }

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
 * exit / 마이그레이션 공용. demoMode 플래그는 건드리지 않는다.
 * @returns {Promise<{ clawedBack: number, clawJournalId: string|null, grant: object|null }>}
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
 * 데모 부채(음수 freeRequest)를 0으로 리셋.
 * @returns {Promise<{ resetAmount: number, journalId: string|null }>}
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
      memo: `${exitReason} — 데모 부채 리셋`,
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
 * 실사용 전환: 데모 모드 OFF + 레거시 잔여 회수 + 마이너스 부채 0 리셋.
 * @param {{ businessAnchorId: any, userId?: any, reason?: string }} args
 *   reason: 사용자 요청·기간 만료 구분 (기본 "실사용 전환")
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

  const freeRequestAfterClaw = freeRequestBefore - clawedBack;
  const { resetAmount: debtReset, journalId: debtJournalId } =
    await resetDemoFreeRequestDebtToZero({
      businessAnchorId,
      userId,
      reason: exitReason,
      freeRequestCredit: freeRequestAfterClaw,
      idempotencySuffix: `${String(grant?._id || businessAnchorId)}:exit`,
    });

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
          cancelJournalId: clawJournalId
            ? String(clawJournalId)
            : debtJournalId
              ? String(debtJournalId)
              : null,
        },
      },
    );
  }

  return {
    demoMode: false,
    clawedBack,
    debtReset,
    alreadyExited: false,
    reason: exitReason,
  };
}

/**
 * 유료 크레딧(CHARGE_PAID) 지급 직후 호출.
 * 데모 중이면 실사용 전환(부채 리셋·레거시 잔여 회수). 이미 실사용이면 no-op.
 * 충전 트랜잭션 커밋 뒤에 호출할 것(선수금은 유지, freeRequest 부채만 정리).
 */
export async function exitDemoModeAfterPaidCreditGrant({
  businessAnchorId,
  userId,
  reason = "유료 크레딧 입금",
} = {}) {
  if (!businessAnchorId) return null;
  try {
    const state = await getDemoModeState(businessAnchorId);
    if (!state.demoMode || state.demoModeExitedAt) return null;
    const result = await exitDemoMode({
      businessAnchorId,
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
    // 뱃지·정산 UI가 데모 OFF를 즉시 반영하도록 강제 emit
    void emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: 0,
      reason: "demo_exit_on_paid_charge",
      refId: businessAnchorId,
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

/** 데모 중 가상 잔고: freeRequest 마이너스(구강스캔·커스텀어벗 기공비) 허용 */
export async function allowsDemoFreeRequestOverdraft(businessAnchorId) {
  const state = await getDemoModeState(businessAnchorId);
  return Boolean(state?.demoMode) && !state?.demoModeExitedAt;
}

/**
 * 데모 모드에서 무료의뢰 버킷 중 "데모 예약분" 상한(원).
 * 신규는 데모 크레딧 미지급이라 보통 0. 레거시 grant가 남아 있으면 그 amount.
 * 유효기간이 지났으면 즉시 실사용 전환 후 0.
 * 데모 overdraft 경로에서는 예약분 제외를 건너뛴다(가상 잔고 SSOT).
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

/**
 * 잔액 스냅샷에서 데모 예약 무료의뢰분을 제외(스토어 등 실사용 차감용).
 * 데모 overdraft(가상 잔고) 경로에서는 호출하지 않는다.
 * 음수 freeRequest는 이미 spendable 0으로 취급한다.
 */
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
 * 데모 모드 자동 종료(실사용 전환).
 * 유효기간(DEMO_MODE_DURATION_DAYS) 경과만 — 잔고 0 소진 종료는 하지 않는다
 * (0원 시작·마이너스 허용과 충돌).
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

  return null;
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
