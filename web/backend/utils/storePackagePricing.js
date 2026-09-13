// change-log:
// - 2026-09-13: 유료 크레딧(CHARGE_PAID) 누적 ≥550만 → 스토어 pkg 구매자.
// related files:
// - web/backend/constants/storeCatalog.js
// - web/backend/controllers/store/storeOrder.controller.js
import mongoose from "mongoose";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { STORE_PACKAGE_PREPAID_THRESHOLD } from "../constants/storeCatalog.js";

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * 사업자 앵커의 유료 크레딧 누적 충전액(CHARGE_PAID · REQ_PAID_CREDIT 양수 합).
 * @param {string|import("mongoose").Types.ObjectId} businessAnchorId
 * @returns {Promise<number>}
 */
export async function sumPaidCreditChargeSupply(businessAnchorId) {
  const oid = toObjectId(businessAnchorId);
  if (!oid) return 0;

  const rows = await LedgerLine.aggregate([
    {
      $match: {
        businessAnchorId: oid,
        accountCode: "REQ_PAID_CREDIT",
        amount: { $gt: 0 },
      },
    },
    {
      $lookup: {
        from: LedgerJournal.collection.name,
        localField: "journalId",
        foreignField: "journalId",
        as: "journalDoc",
      },
    },
    { $unwind: { path: "$journalDoc", preserveNullAndEmptyArrays: false } },
    { $match: { "journalDoc.eventType": "CHARGE_PAID" } },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
      },
    },
  ]);

  const total = Number(rows[0]?.total || 0);
  return Number.isFinite(total) ? Math.round(total) : 0;
}

/**
 * @param {string|import("mongoose").Types.ObjectId} businessAnchorId
 * @returns {Promise<{
 *   isPackageBuyer: boolean,
 *   paidChargeTotal: number,
 *   packageThreshold: number,
 * }>}
 */
export async function resolveStorePackageBuyer(businessAnchorId) {
  const paidChargeTotal = await sumPaidCreditChargeSupply(businessAnchorId);
  const packageThreshold = STORE_PACKAGE_PREPAID_THRESHOLD;
  return {
    isPackageBuyer: paidChargeTotal >= packageThreshold,
    paidChargeTotal,
    packageThreshold,
  };
}
