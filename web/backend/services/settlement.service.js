// related files:
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
// - web/backend/controllers/credits/credit.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/utils/creditSettingsDefaults.js
// change-log:
// - 2026-08-18: 제조사는 기공소(면세) — TAXABLE_SETTLEMENT_ROLES에서 제외.
// - 2026-08-17: 영업자·개발운영사 지급 시 VAT 합산(입금·세금계산서·GL).
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { computeBusinessCreditBalanceFromLedger } from "./creditBalance.service.js";
import { DEFAULT_AFFILIATE_VAT_RATE } from "./creditRevenuePolicy.service.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";

export const AFFILIATE_SETTLEMENT_ACCOUNTS = {
  manufacturer: "REV_MANUFACTURER",
  salesman: "REV_SALESMAN",
  devops: "REV_DEVOPS",
};

/** 지급 시 과세(세금계산서) 대상. 기공소·제조사·어벗츠(관리자)는 면세. */
export const TAXABLE_SETTLEMENT_ROLES = new Set(["salesman", "devops"]);

export function normalizeAffiliateVatRate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_AFFILIATE_VAT_RATE;
  return Math.min(1, n);
}

export async function resolveAffiliateVatRate() {
  const settings = await loadCreditSettingsDefaults();
  return normalizeAffiliateVatRate(settings?.affiliateVatRate);
}

/**
 * 원장 미지급 잔액 → 지급(입금) 분해.
 * - lab/manufacturer: 면세. balance=입금액.
 * - salesman/devops: balance=공급가 미지급. 지급 시 VAT 가산.
 */
export function resolveSettlementPayoutAmounts({
  role,
  balanceAmount,
  vatRate = DEFAULT_AFFILIATE_VAT_RATE,
}) {
  const balance = Math.max(0, Math.round(Number(balanceAmount || 0)));
  const rate = normalizeAffiliateVatRate(vatRate);

  if (role === "lab" || role === "manufacturer" || !TAXABLE_SETTLEMENT_ROLES.has(role)) {
    return {
      supplyAmount: balance,
      vatAmount: 0,
      amount: balance,
      vatRate: rate,
    };
  }

  // salesman / devops
  const supplyAmount = balance;
  const vatAmount = Math.round(supplyAmount * rate);
  return {
    supplyAmount,
    vatAmount,
    amount: supplyAmount + vatAmount,
    vatRate: rate,
  };
}

export async function computeAffiliateSettlementBalance({
  ownerRole,
  ownerAnchorId,
  accountCode = AFFILIATE_SETTLEMENT_ACCOUNTS[ownerRole],
}) {
  if (!accountCode) throw new Error("Unsupported affiliate ownerRole.");
  // 제조사·영업자·개발운영사 하청/수수료: 지급은 유료만, 잔액은 공급가(amountExcludingVat).
  const rows = await LedgerLine.aggregate([
    { $match: { ownerRole, ownerId: ownerAnchorId, accountCode } },
    {
      $lookup: {
        from: LedgerJournal.collection.name,
        localField: "journalId",
        foreignField: "journalId",
        as: "journalDoc",
      },
    },
    { $unwind: { path: "$journalDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        kind: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                then: "PAYOUT",
              },
              {
                case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                then: "ADJUST",
              },
            ],
            default: "EARN",
          },
        },
        base: { $ifNull: ["$amountExcludingVat", "$amount"] },
      },
    },
    {
      $match: {
        $or: [
          { kind: "PAYOUT" },
          {
            kind: { $in: ["EARN", "ADJUST"] },
            creditKind: { $in: ["PAID", null] },
          },
        ],
      },
    },
    { $group: { _id: "$kind", total: { $sum: "$base" } } },
  ]);

  let earn = 0;
  let payout = 0;
  let adjust = 0;
  for (const row of rows) {
    if (row._id === "PAYOUT") payout += Number(row.total || 0);
    else if (row._id === "ADJUST") adjust += Number(row.total || 0);
    else earn += Number(row.total || 0);
  }
  return Math.max(0, Math.round(earn - payout + adjust));
}

export async function computeSettlementBalance({ role, businessAnchorId }) {
  if (role === "lab") {
    const snapshot = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId,
    });
    return Math.max(0, Math.round(Number(snapshot?.settlementCredit || 0)));
  }
  return computeAffiliateSettlementBalance({
    ownerRole: role,
    ownerAnchorId: businessAnchorId,
  });
}

/** 원장 잔액 + 지급 시 VAT 분해(입금·세금계산서용). */
export async function computeSettlementPayoutBreakdown({
  role,
  businessAnchorId,
  vatRate,
}) {
  const balanceAmount = await computeSettlementBalance({
    role,
    businessAnchorId,
  });
  const rate =
    vatRate === undefined || vatRate === null
      ? await resolveAffiliateVatRate()
      : normalizeAffiliateVatRate(vatRate);
  return resolveSettlementPayoutAmounts({
    role,
    balanceAmount,
    vatRate: rate,
  });
}

export function hasPayoutAccount(account) {
  return Boolean(
    String(account?.bankName || "").trim() &&
      String(account?.accountNumber || "").trim() &&
      String(account?.holderName || "").trim(),
  );
}

/**
 * 실송금이 끝난 뒤에만 GL에 지급을 포스팅한다. 배치 item ID가 idempotency key라
 * 관리자 재클릭/네트워크 재시도에도 이중 지급 원장을 만들지 않는다.
 *
 * 과세 관계사(영업자·개발운영사):
 * - amount = 입금 합계(VAT 포함)
 * - amountExcludingVat = 공급가(원장 잔액 차감)
 * - vatAmount = 부가세
 * 기공소·제조사: 면세. amount = 공급가 = 입금액.
 */
export async function postSettlementPayoutJournal({
  item,
  actorUserId,
  occurredAt = new Date(),
}) {
  const isLab = item.role === "lab";
  const depositTotal = Math.round(Number(item.amount || 0));
  if (depositTotal <= 0) throw new Error("Settlement amount must be positive.");

  const hasSplit =
    item.supplyAmount !== undefined &&
    item.supplyAmount !== null &&
    item.vatAmount !== undefined &&
    item.vatAmount !== null;

  const split = hasSplit
    ? {
        supplyAmount: Math.round(Number(item.supplyAmount)),
        vatAmount: Math.max(0, Math.round(Number(item.vatAmount))),
        amount: depositTotal,
      }
    : resolveSettlementPayoutAmounts({
        role: item.role,
        balanceAmount: depositTotal,
      });

  const supplyAmount = split.supplyAmount;
  const vatAmount = split.vatAmount;
  const accountCode = item.accountCode;
  const ownerRole = isLab ? "requestor" : item.role;
  const isExempt = isLab || item.role === "manufacturer";
  const ledgerClearAmount = supplyAmount;
  const lineClear = isExempt ? -ledgerClearAmount : ledgerClearAmount;
  const lineSupply = isExempt ? -supplyAmount : supplyAmount;
  const lineVat = isExempt ? 0 : vatAmount;
  const lineTotal = isExempt ? -depositTotal : depositTotal;

  return postGeneralLedgerJournal({
    idempotencyKey: `gl:settlement-batch-item:${String(item._id)}:paid`,
    eventType: "SETTLEMENT_PAYOUT",
    businessAnchorId: item.businessAnchorId,
    refType: "SETTLEMENT_BATCH_ITEM",
    refId: item._id,
    occurredAt,
    createdBy: actorUserId || null,
    meta: {
      payoutTargetRole: item.role,
      payoutAmount: depositTotal,
      payoutSupplyAmount: supplyAmount,
      payoutVatAmount: vatAmount,
      settlementBatchId: String(item.batchId),
      payoutAccount: item.payoutAccount,
    },
    lines: [
      {
        accountCode,
        ownerRole,
        ownerId: item.businessAnchorId,
        amount: isExempt ? lineTotal : lineClear,
        amountExcludingVat: lineSupply,
        vatAmount: lineVat,
        amountIncludingVat: lineTotal,
        creditKind: isLab ? "SETTLEMENT" : "PAID",
        refType: "SETTLEMENT_BATCH_ITEM",
        refId: item._id,
        meta: {
          payoutKind: "settlement_batch",
          payoutTargetRole: item.role,
          payoutSupplyAmount: supplyAmount,
          payoutVatAmount: vatAmount,
          payoutAmount: depositTotal,
        },
      },
    ],
  });
}
