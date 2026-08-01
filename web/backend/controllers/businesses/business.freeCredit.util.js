// related files:
// - web/backend/rules.md
// - web/backend/models/freeCreditGrant.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/controllers/admin/adminFreeCreditGrant.controller.js
// - web/backend/services/generalLedger.service.js
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import BusinessCreditBalance from "../../models/businessCreditBalance.model.js";
import {
  CREDIT_SETTINGS_SCHEMA_DEFAULTS,
  loadCreditSettingsDefaults,
} from "../../utils/creditSettingsDefaults.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  formatBusinessNumber,
  isDuplicateKeyError,
} from "./business.validation.util.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

async function upsertFreeCreditLedger({
  businessAnchorId,
  userId,
  amount,
  refType,
  refId,
  memo = "",
}) {
  const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!normalizedAmount) {
    return { ok: false, posted: false, journalId: null };
  }

  const idempotencyKey = `gl:free_credit_grant:${String(refId)}`;
  const isShipping = String(refType || "") === "FREE_SHIPPING_CREDIT";
  const eventType = isShipping ? "CHARGE_FREE_SHIPPING" : "CHARGE_FREE_REQUEST";
  const accountCode = isShipping
    ? "REQ_FREE_SHIPPING_CREDIT"
    : "REQ_FREE_REQUEST_CREDIT";
  const creditKind = isShipping ? "FREE_SHIPPING" : "FREE_REQUEST";

  const glResult = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType,
    businessAnchorId,
    refType,
    refId,
    createdBy: userId || null,
    meta: {
      memo: String(memo || "").trim(),
      freeCreditGrantId: String(refId || "").trim() || null,
      source: "business_auto_free_credit",
    },
    lines: [
      {
        accountCode,
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: normalizedAmount,
        amountExcludingVat: normalizedAmount,
        vatAmount: 0,
        amountIncludingVat: normalizedAmount,
        creditKind,
        refType,
        refId,
      },
    ],
  });

  if (glResult?.posted) {
    const freeField = isShipping ? "freeShippingCredit" : "freeRequestCredit";
    await BusinessCreditBalance.updateOne(
      { businessAnchorId },
      {
        $inc: {
          [freeField]: normalizedAmount,
          version: 1,
        },
        $setOnInsert: {
          businessAnchorId,
          paidCredit: 0,
          freeRequestCredit: 0,
          freeShippingCredit: 0,
        },
      },
      { upsert: true },
    );
  }

  return {
    ok: true,
    posted: Boolean(glResult?.posted),
    journalId: glResult?.journalId || null,
  };
}

function resolveGrantTypeAlias(type) {
  const t = String(type || "").trim().toUpperCase();
  if (!t || t === "REQUEST_FREE_CREDIT") {
    return {
      queryTypes: ["REQUEST_FREE_CREDIT"],
      canonicalType: "REQUEST_FREE_CREDIT",
    };
  }
  if (t === "SHIPPING_FREE_CREDIT") {
    return {
      queryTypes: ["SHIPPING_FREE_CREDIT"],
      canonicalType: "SHIPPING_FREE_CREDIT",
    };
  }
  return { queryTypes: [t], canonicalType: t };
}

async function ensureFreeCreditGrant({
  businessAnchorId,
  userId,
  type,
  businessNumber,
  amount,
}) {
  const typeInfo = resolveGrantTypeAlias(type);

  let grant = await FreeCreditGrant.findOne({
    type: { $in: typeInfo.queryTypes },
    businessNumber,
    isOverride: false,
  })
    .select({ _id: 1, grantJournalId: 1, amount: 1 })
    .lean();

  if (!grant) {
    try {
      const created = await FreeCreditGrant.create({
        type: typeInfo.canonicalType,
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
      };
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        grant = await FreeCreditGrant.findOne({
          type: { $in: typeInfo.queryTypes },
          businessNumber,
          isOverride: false,
        })
          .select({ _id: 1, grantJournalId: 1, amount: 1 })
          .lean();
      } else {
        throw e;
      }
    }
  }

  return grant;
}

export async function grantRequestFreeCreditIfEligible({
  businessAnchorId,
  userId,
  userRole,
}) {
  if (!businessAnchorId) return null;
  if (userRole !== "requestor") return null;
  const businessAnchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ businessType: 1, metadata: 1 })
    .lean();
  if (!businessAnchor) return null;
  if (String(businessAnchor.businessType || "") !== "requestor") return null;

  const normalizedBusinessNumber = formatBusinessNumber(
    businessAnchor?.metadata?.businessNumber,
  );
  if (!normalizedBusinessNumber) return null;

  const defaults = await loadCreditSettingsDefaults();
  const amount =
    Number(defaults.defaultRequestFreeCredit ?? 0) ||
    CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultRequestFreeCredit;

  const grant = await ensureFreeCreditGrant({
    businessAnchorId,
    userId,
    type: "REQUEST_FREE_CREDIT",
    businessNumber: normalizedBusinessNumber,
    amount,
  });

  if (!grant?._id) return null;

  const postResult = await upsertFreeCreditLedger({
    businessAnchorId,
    userId,
    amount,
    refType: "FREE_REQUEST_CREDIT",
    refId: grant._id,
    memo: "환영 무료 의뢰크레딧",
  });
  if (!postResult?.ok) return null;

  if (!grant.grantJournalId && postResult.journalId) {
    await FreeCreditGrant.updateOne(
      { _id: grant._id },
      { $set: { grantJournalId: String(postResult.journalId) } },
    );
  }

  if (postResult.posted) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: amount,
      reason: "request_free_credit",
      refId: postResult.journalId || grant._id,
    });
  }

  return amount;
}

export async function grantShippingFreeCreditIfEligible({
  businessAnchorId,
  userId,
  userRole,
}) {
  if (!businessAnchorId) return null;
  if (userRole !== "requestor") return null;
  const businessAnchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ businessType: 1, metadata: 1 })
    .lean();
  if (!businessAnchor) return null;
  if (String(businessAnchor.businessType || "") !== "requestor") return null;

  const normalizedBusinessNumber = formatBusinessNumber(
    businessAnchor?.metadata?.businessNumber,
  );
  if (!normalizedBusinessNumber) return null;

  const defaults = await loadCreditSettingsDefaults();
  const amount =
    Number(defaults.defaultShippingFreeCredit ?? 0) ||
    CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultShippingFreeCredit;

  const grant = await ensureFreeCreditGrant({
    businessAnchorId,
    userId,
    type: "SHIPPING_FREE_CREDIT",
    businessNumber: normalizedBusinessNumber,
    amount,
  });

  if (!grant?._id) return null;

  const postResult = await upsertFreeCreditLedger({
    businessAnchorId,
    userId,
    amount,
    refType: "FREE_SHIPPING_CREDIT",
    refId: grant._id,
    memo: "환영 무료 배송크레딧",
  });
  if (!postResult?.ok) return amount;

  if (!grant.grantJournalId && postResult.journalId) {
    await FreeCreditGrant.updateOne(
      { _id: grant._id },
      { $set: { grantJournalId: String(postResult.journalId) } },
    );
  }

  if (postResult.posted) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: amount,
      reason: "free_shipping_credit",
      refId: postResult.journalId || grant._id,
    });
  }

  return amount;
}

export async function grantSalesmanReferralBonusIfEligible() {
  // 정책 변경: 영업자에게는 정액 보너스를 지급하지 않고 매출 비율 정산으로 대체
  return null;
}


