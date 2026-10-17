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
import { normalizeRequestorKind } from "../../utils/requestorCapabilities.js";

/**
 * 레거시 데모 크레딧 초기 충전액(원). 신규 가입은 미지급(0원 시작).
 * 기존 grant 회수·마이그레이션 상한에만 사용.
 */
export const DEMO_CREDIT_AMOUNT = 1_000_000;

/** 데모 모드 유효기간(일). startedAt 기준 경과 시 전환 입금 대기로 잠금. */
export const DEMO_MODE_DURATION_DAYS = 90;

const DEMO_GRANT_TYPE = "DEMO_CREDIT";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 치과(practice) 사업자 여부. 기공소(lab)는 데모 대상이 아니다. */
export function isPracticeRequestorAnchor(anchor) {
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  if (kind === "practice") return true;
  if (kind === "lab") return false;
  const caps = anchor?.requestorCapabilities || {};
  return Boolean(caps.practice) && !caps.lab;
}

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
 * 치과 실사용 전환 요청(수동·관리자). 기공소별 미정산 기공비를 직접 지급받고 확인하면 전환된다.
 * 어벗츠기공소(원청) 몫은 자동 정산 완료. 확인할 기공소가 없으면 즉시 전환.
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
  const pendingReason = String(reason || "").trim() || "실사용 전환 요청";
  const { requestDemoConversion } = await import(
    "../../services/demoConversion.service.js"
  );
  return requestDemoConversion({
    businessAnchorId,
    userId,
    reason: pendingReason,
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
