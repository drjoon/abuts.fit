import BonusGrant from "../../models/bonusGrant.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import {
  CREDIT_SETTINGS_SCHEMA_DEFAULTS,
  loadCreditSettingsDefaults,
} from "../../utils/creditSettingsDefaults.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  formatBusinessNumber,
  isDuplicateKeyError,
} from "./business.validation.util.js";

async function upsertBonusLedger({
  businessId,
  userId,
  amount,
  refType,
  refId,
}) {
  const uniqueKey = `bonus_grant:${String(refId)}`;
  const result = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        businessId,
        userId: userId || null,
        type: "BONUS",
        amount,
        refType,
        refId: businessId,
        uniqueKey,
      },
    },
    { upsert: true },
  );

  if (!result?.upsertedCount) return null;
  const ledgerDoc = await CreditLedger.findOne({ uniqueKey })
    .select({ _id: 1 })
    .lean();
  return ledgerDoc?._id || null;
}

async function ensureBonusGrant({
  businessId,
  userId,
  type,
  businessNumber,
  amount,
}) {
  let grant = await BonusGrant.findOne({
    type,
    businessNumber,
    isOverride: false,
  })
    .select({ _id: 1, creditLedgerId: 1, amount: 1 })
    .lean();

  if (!grant) {
    try {
      const created = await BonusGrant.create({
        type,
        businessNumber,
        amount,
        businessId,
        userId: userId || null,
        isOverride: false,
        source: "auto",
        grantedByUserId: null,
      });
      grant = {
        _id: created._id,
        creditLedgerId: created.creditLedgerId,
        amount,
      };
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        grant = await BonusGrant.findOne({
          type,
          businessNumber,
          isOverride: false,
        })
          .select({ _id: 1, creditLedgerId: 1, amount: 1 })
          .lean();
      } else {
        throw e;
      }
    }
  }

  return grant;
}

export async function grantWelcomeBonusIfEligible({ businessId, userId }) {
  if (!businessId) return null;
  const businessNumber = formatBusinessNumber(userId?.businessNumber || null);
  const business = await BonusGrant.db
    .model("Business")
    .findById(businessId)
    .select({ businessType: 1, extracted: 1 })
    .lean();
  if (!business) return null;
  if (String(business.businessType || "") !== "requestor") return null;

  const normalizedBusinessNumber = formatBusinessNumber(
    business?.extracted?.businessNumber,
  );
  if (!normalizedBusinessNumber) return null;

  const defaults = await loadCreditSettingsDefaults();
  const amount =
    Number(defaults.defaultWelcomeBonusCredit ?? 0) ||
    CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultWelcomeBonusCredit;

  const grant = await ensureBonusGrant({
    businessId,
    userId,
    type: "WELCOME_BONUS",
    businessNumber: normalizedBusinessNumber,
    amount,
  });

  if (!grant?._id || grant.creditLedgerId) return grant?.amount || null;

  const ledgerId = await upsertBonusLedger({
    businessId,
    userId,
    amount,
    refType: "WELCOME_BONUS",
    refId: grant._id,
  });
  if (!ledgerId) return null;

  await BonusGrant.updateOne(
    { _id: grant._id },
    { $set: { creditLedgerId: ledgerId } },
  );

  await emitCreditBalanceUpdatedToBusiness({
    businessId,
    balanceDelta: amount,
    reason: "welcome_bonus",
    refId: ledgerId,
  });

  return amount;
}

export async function grantFreeShippingCreditIfEligible({
  businessId,
  userId,
}) {
  if (!businessId) return null;
  const business = await BonusGrant.db
    .model("Business")
    .findById(businessId)
    .select({ businessType: 1, extracted: 1 })
    .lean();
  if (!business) return null;
  if (String(business.businessType || "") !== "requestor") return null;

  const normalizedBusinessNumber = formatBusinessNumber(
    business?.extracted?.businessNumber,
  );
  if (!normalizedBusinessNumber) return null;

  const defaults = await loadCreditSettingsDefaults();
  const amount =
    Number(defaults.defaultFreeShippingCredit ?? 0) ||
    CREDIT_SETTINGS_SCHEMA_DEFAULTS.defaultFreeShippingCredit;

  const grant = await ensureBonusGrant({
    businessId,
    userId,
    type: "FREE_SHIPPING_CREDIT",
    businessNumber: normalizedBusinessNumber,
    amount,
  });

  if (!grant?._id) return null;
  if (grant.creditLedgerId) return grant.amount || amount;

  const ledgerId = await upsertBonusLedger({
    businessId,
    userId,
    amount,
    refType: "FREE_SHIPPING_CREDIT",
    refId: grant._id,
  });
  if (!ledgerId) return amount;

  await BonusGrant.updateOne(
    { _id: grant._id },
    { $set: { creditLedgerId: ledgerId } },
  );

  await emitCreditBalanceUpdatedToBusiness({
    businessId,
    balanceDelta: amount,
    reason: "free_shipping_credit",
    refId: ledgerId,
  });

  return amount;
}

export async function grantSalesmanReferralBonusIfEligible() {
  // 정책 변경: 영업자에게는 정액 보너스를 지급하지 않고 매출 비율 정산으로 대체
  return null;
}
