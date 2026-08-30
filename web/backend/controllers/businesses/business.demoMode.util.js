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

/** 데모 크레딧 초기 충전액(원). 유료/무료와 동일하게 기공·어벗 차감에 사용. */
export const DEMO_CREDIT_AMOUNT = 10_000_000;

const DEMO_GRANT_TYPE = "DEMO_CREDIT";

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
 * 의뢰자 사업자 신규 생성 시 데모 모드 시작 + 1천만 원 데모 크레딧 1회 지급.
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
 */
export async function exitDemoMode({ businessAnchorId, userId } = {}) {
  if (!businessAnchorId) {
    const err = new Error("사업자 정보가 없습니다.");
    err.statusCode = 400;
    throw err;
  }

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
        memo: "실사용 전환 — 데모 크레딧 회수",
        source: "demo_credit_exit",
        demoCredit: true,
        clawBack,
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
          meta: { source: "demo_credit_exit", demoCredit: true },
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
          cancelReason: "실사용 전환",
          cancelJournalId: clawJournalId ? String(clawJournalId) : null,
        },
      },
    );
  }

  return {
    demoMode: false,
    clawedBack: clawBack,
    alreadyExited: false,
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
 * 데모 크레딧(무료의뢰 버킷)이 소진되면 자동 실사용 전환.
 * - freeRequestCredit === 0
 * - 미전환 HOLD(보류) 저널이 없을 때만 (취소 시 복구 가능하므로)
 */
export async function maybeAutoExitDemoModeIfExhausted({
  businessAnchorId,
  userId,
} = {}) {
  if (!businessAnchorId) return null;

  const state = await getDemoModeState(businessAnchorId);
  if (!state.demoMode || state.demoModeExitedAt) return null;

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

  return exitDemoMode({ businessAnchorId, userId });
}
