// related files:
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
// - web/backend/controllers/credits/credit.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/utils/creditSettingsDefaults.js
// change-log:
// - 2026-08-23: 제조사=일반과세 — TAXABLE_SETTLEMENT_ROLES·지급 VAT·세금계산서.
// - 2026-08-23: 제조사 지급에서 무료크레딧·리메이크 생산분 제외.
// - 2026-08-20: 제조사 지급 잔액은 고객 유료/무료 크레딧을 가리지 않고 REV 전액(말일 일괄 지급).
// - 2026-08-18: (철회) 제조사 면세 — 일반과세로 복귀.
// - 2026-08-17: 영업자·개발운영사 지급 시 VAT 합산(입금·세금계산서·GL).
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { computeBusinessCreditBalanceFromLedger } from "./creditBalance.service.js";
import {
  DEFAULT_AFFILIATE_VAT_RATE,
  normalizeAffiliateVatRate,
} from "./creditRevenuePolicy.service.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";

export { normalizeAffiliateVatRate };

export const AFFILIATE_SETTLEMENT_ACCOUNTS = {
  manufacturer: "REV_MANUFACTURER",
  salesman: "REV_SALESMAN",
  devops: "REV_DEVOPS",
};

/** 지급 시 과세(세금계산서) 대상. 기공소·어벗츠(관리자)는 면세. */
export const TAXABLE_SETTLEMENT_ROLES = new Set([
  "manufacturer",
  "salesman",
  "devops",
]);

/** 정산 배치 확정 시 계산서/세금계산서 Draft 자동 생성 대상(면세 포함). */
export const SETTLEMENT_INVOICE_DRAFT_ROLES = new Set([
  "lab",
  ...TAXABLE_SETTLEMENT_ROLES,
]);

const SETTLEMENT_INVOICE_ITEM_NAMES = {
  lab: "기공 정산",
  manufacturer: "커스텀어벗 생산 하청 정산",
  salesman: "플랫폼 운영 수수료 정산",
  devops: "플랫폼 개발운영 정산",
};

/**
 * 정산 배치 항목 → TaxInvoiceDraft 필드 SSOT.
 * - lab: AFFILIATE_TO_ABUTS · 면세 · 위수탁
 * - manufacturer/salesman/devops: AFFILIATE_TO_ABUTS · 과세 · 위수탁
 * admin 등 Draft 미생성 role은 null.
 */
export function resolveSettlementInvoiceDraftSpec({ role, breakdown }) {
  const normalizedRole = String(role || "").trim();
  if (!SETTLEMENT_INVOICE_DRAFT_ROLES.has(normalizedRole)) return null;

  const supplyAmount = Math.max(0, Math.round(Number(breakdown?.supplyAmount || 0)));
  const taxable = TAXABLE_SETTLEMENT_ROLES.has(normalizedRole);
  const vatAmount = taxable
    ? Math.max(0, Math.round(Number(breakdown?.vatAmount || 0)))
    : 0;
  const totalAmount = taxable
    ? Math.max(0, Math.round(Number(breakdown?.amount || 0)))
    : supplyAmount;

  if (supplyAmount <= 0 || totalAmount <= 0) return null;

  return {
    direction: "AFFILIATE_TO_ABUTS",
    issuanceMode: "TRUSTEE",
    taxType: taxable ? "과세" : "면세",
    itemName:
      SETTLEMENT_INVOICE_ITEM_NAMES[normalizedRole] || "플랫폼 정산",
    supplyAmount,
    vatAmount,
    totalAmount,
  };
}

export async function resolveAffiliateVatRate() {
  const settings = await loadCreditSettingsDefaults();
  return normalizeAffiliateVatRate(settings?.affiliateVatRate);
}

/**
 * 원장 미지급 잔액 → 지급(입금) 분해.
 * - lab: 면세. balance=입금액.
 * - manufacturer/salesman/devops: balance=공급가 미지급. 지급 시 VAT 가산.
 */
export function resolveSettlementPayoutAmounts({
  role,
  balanceAmount,
  vatRate = DEFAULT_AFFILIATE_VAT_RATE,
}) {
  const balance = Math.max(0, Math.round(Number(balanceAmount || 0)));
  const rate = normalizeAffiliateVatRate(vatRate);

  if (role === "lab" || !TAXABLE_SETTLEMENT_ROLES.has(role)) {
    return {
      supplyAmount: balance,
      vatAmount: 0,
      amount: balance,
      vatRate: rate,
    };
  }

  const supplyAmount = balance;
  const vatAmount = Math.round(supplyAmount * rate);
  return {
    supplyAmount,
    vatAmount,
    amount: supplyAmount + vatAmount,
    vatRate: rate,
  };
}

/** 제조사·딜러·개발운영 모두 유료(PAID) EARN/ADJUST만 지급. 무료크레딧·리메이크 생산분은 미지급. */
function affiliatePayoutEarnMatch(ownerRole) {
  void ownerRole;
  return {
    kind: { $in: ["EARN", "ADJUST"] },
    creditKind: { $in: ["PAID", null] },
  };
}

export async function computeAffiliateSettlementBalance({
  ownerRole,
  ownerAnchorId,
  accountCode = AFFILIATE_SETTLEMENT_ACCOUNTS[ownerRole],
}) {
  if (!accountCode) throw new Error("Unsupported affiliate ownerRole.");
  // 잔액은 공급가(amountExcludingVat). 제조사·딜러·개발운영=유료만(무료·리메이크 생산 미지급). 제조사는 말일 일괄.
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
        $or: [{ kind: "PAYOUT" }, affiliatePayoutEarnMatch(ownerRole)],
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
  // 제조사 PAYOUT 라인은 과세(양수 차감), 레거시 면세는 음수. 부호와 무관하게 지급액을 뺀다.
  return Math.max(0, Math.round(earn - Math.abs(payout) + adjust));
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
 * 과세 관계사(제조사·딜러사·개발운영사):
 * - amount = 입금 합계(VAT 포함)
 * - amountExcludingVat = 공급가(원장 잔액 차감)
 * - vatAmount = 부가세
 * 기공소: 면세. amount = 공급가 = 입금액.
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
  const isExempt = isLab || !TAXABLE_SETTLEMENT_ROLES.has(item.role);
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
