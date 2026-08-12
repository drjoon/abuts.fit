// related files:
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
// - web/backend/controllers/credits/credit.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import { computeBusinessCreditBalanceFromLedger } from "./creditBalance.service.js";

export const AFFILIATE_SETTLEMENT_ACCOUNTS = {
  manufacturer: "REV_MANUFACTURER",
  salesman: "REV_SALESMAN",
  devops: "REV_DEVOPS",
};

export async function computeAffiliateSettlementBalance({
  ownerRole,
  ownerAnchorId,
  accountCode = AFFILIATE_SETTLEMENT_ACCOUNTS[ownerRole],
}) {
  if (!accountCode) throw new Error("Unsupported affiliate ownerRole.");
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
 */
export async function postSettlementPayoutJournal({
  item,
  actorUserId,
  occurredAt = new Date(),
}) {
  const isLab = item.role === "lab";
  const amount = Math.round(Number(item.amount || 0));
  if (amount <= 0) throw new Error("Settlement amount must be positive.");
  const accountCode = item.accountCode;
  const ownerRole = isLab ? "requestor" : item.role;
  const lineAmount = isLab ? -amount : amount;

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
      payoutAmount: amount,
      settlementBatchId: String(item.batchId),
      payoutAccount: item.payoutAccount,
    },
    lines: [
      {
        accountCode,
        ownerRole,
        ownerId: item.businessAnchorId,
        amount: lineAmount,
        amountExcludingVat: lineAmount,
        vatAmount: 0,
        amountIncludingVat: lineAmount,
        creditKind: isLab ? "SETTLEMENT" : "PAID",
        refType: "SETTLEMENT_BATCH_ITEM",
        refId: item._id,
        meta: { payoutKind: "settlement_batch", payoutTargetRole: item.role },
      },
    ],
  });
}
