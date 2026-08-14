// related files:
// - web/backend/rules.md
// - web/backend/models/freeCreditGrant.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js

// - web/backend/controllers/admin/adminFreeCreditGrant.controller.js
// - web/backend/services/generalLedger.service.js
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

import {
  CREDIT_SETTINGS_SCHEMA_DEFAULTS,
  loadCreditSettingsDefaults,
} from "../../utils/creditSettingsDefaults.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  normalizeRequestorCapabilities,
  normalizeRequestorKind,
} from "../../utils/requestorCapabilities.js";
import {
  formatBusinessNumber,
  isDuplicateKeyError,
} from "./business.validation.util.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";

/** 환영 무료 크레딧: 의뢰자·기공소(lab)만. 치과(practice) 제외. */
function isWelcomeFreeCreditEligibleLabAnchor(businessAnchor) {
  if (String(businessAnchor?.businessType || "") !== "requestor") return false;
  const kind = normalizeRequestorKind(businessAnchor?.requestorKind);
  if (kind === "lab") return true;
  if (kind === "practice") return false;
  // kind 미기입: 레거시 caps가 lab만인 경우만 허용
  const caps = normalizeRequestorCapabilities(
    businessAnchor?.requestorCapabilities,
  );
  return caps.lab && !caps.practice;
}

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
  // 환영 지급은 무료크레딧 단일(CHARGE_FREE_REQUEST). 레거시 FREE_SHIPPING 계정은
  // 원장 추적용으로만 유지되며 자동 환영 지급에는 쓰지 않는다.
  const glResult = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "CHARGE_FREE_REQUEST",
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
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        amount: normalizedAmount,
        amountExcludingVat: normalizedAmount,
        vatAmount: 0,
        amountIncludingVat: normalizedAmount,
        creditKind: "FREE_REQUEST",
        refType,
        refId,
      },
    ],
  });

  return {
    ok: true,
    posted: Boolean(glResult?.posted),
    journalId: glResult?.journalId || null,
  };
}

function resolveGrantTypeAlias(type) {
  const t = String(type || "").trim().toUpperCase();
  // 사업자번호당 환영 무료크레딧 1회. legacy WELCOME_BONUS도 기지급으로 간주.
  if (
    !t ||
    t === "REQUEST_FREE_CREDIT" ||
    t === "WELCOME_BONUS" ||
    t === "SHIPPING_FREE_CREDIT" ||
    t === "FREE_SHIPPING_CREDIT"
  ) {
    return {
      queryTypes: [
        "REQUEST_FREE_CREDIT",
        "WELCOME_BONUS",
        "SHIPPING_FREE_CREDIT",
        "FREE_SHIPPING_CREDIT",
      ],
      canonicalType: "REQUEST_FREE_CREDIT",
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

/** 기공소 가입 환영 무료크레딧 1회 지급. 금액 SSOT: defaultRequestFreeCredit. */
export async function grantWelcomeFreeCreditIfEligible({
  businessAnchorId,
  userId,
  userRole,
}) {
  if (!businessAnchorId) return null;
  if (userRole !== "requestor") return null;
  const businessAnchor = await BusinessAnchor.findById(businessAnchorId)
    .select({
      businessType: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
      metadata: 1,
    })
    .lean();
  if (!businessAnchor) return null;
  if (!isWelcomeFreeCreditEligibleLabAnchor(businessAnchor)) return null;

  const normalizedBusinessNumber = formatBusinessNumber(
    businessAnchor?.metadata?.businessNumber,
  );
  if (!normalizedBusinessNumber) return null;

  const defaults = await loadCreditSettingsDefaults();
  const amount =
    Number(defaults.defaultRequestFreeCredit ?? 0) ||
    CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultRequestFreeCredit;
  if (!(amount > 0)) return null;

  const grant = await ensureFreeCreditGrant({
    businessAnchorId,
    userId,
    type: "REQUEST_FREE_CREDIT",
    businessNumber: normalizedBusinessNumber,
    amount,
  });

  if (!grant?._id) return null;

  // 레거시 배송 환영만 있고 REQUEST 건이 없으면 grant 문서가 이미 있어
  // 신규 저널을 건너뛸 수 있다. grantJournalId가 있으면 기지급으로 본다.
  if (grant.grantJournalId) return null;

  const postResult = await upsertFreeCreditLedger({
    businessAnchorId,
    userId,
    amount,
    refType: "FREE_REQUEST_CREDIT",
    refId: grant._id,
    memo: "환영 무료크레딧",
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
      reason: "welcome_free_credit",
      refId: postResult.journalId || grant._id,
    });
  }

  return amount;
}

/** @deprecated use grantWelcomeFreeCreditIfEligible */
export const grantRequestFreeCreditIfEligible = grantWelcomeFreeCreditIfEligible;

export async function grantSalesmanReferralBonusIfEligible() {
  // 정책 변경: 영업자에게는 정액 보너스를 지급하지 않고 매출 비율 정산으로 대체
  return null;
}


