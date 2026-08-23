// change-log:
// - 2026-08-23: 고객향 ABUTS_TO_CUSTOMER 월합 — 면세(기공·어벗) / 과세(스토어) 분리.
// related files:
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/jobs/monthlyCustomerInvoiceWorker.js
// - rules.md §2.3
import { Types } from "mongoose";
import LedgerLine from "../models/ledgerLine.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { resolvePreviousKstMonthRange } from "./practiceLabInvoice.service.js";

export { resolvePreviousKstMonthRange };

const EXEMPT_SPEND_EVENTS = [
  "REQUEST_SPEND_COMMIT",
  "SHIPPING_SPEND_COMMIT",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
];

function isDuplicateKeyError(err) {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
}

async function resolveContactUserForAnchor(anchor) {
  if (!anchor?.primaryContactUserId) return null;
  return User.findById(anchor.primaryContactUserId)
    .select({ name: 1, email: 1, phone: 1 })
    .lean();
}

async function createCustomerMonthlyDraft({
  businessAnchorId,
  taxType,
  supplyAmount,
  vatAmount,
  totalAmount,
  itemName,
  periodStart,
  periodEnd,
  sourceRefType,
  sourceRefIds,
}) {
  const practice = await BusinessAnchor.findById(businessAnchorId).lean();
  if (!practice) return { created: false, skipped: true };

  const contact = await resolveContactUserForAnchor(practice);
  const buyer = buildPartySnapshotFromAnchor(practice, contact);

  try {
    await TaxInvoiceDraft.create({
      chargeOrderId: null,
      storeOrderId: null,
      userId: practice.primaryContactUserId || null,
      businessAnchorId,
      direction: "ABUTS_TO_CUSTOMER",
      issuanceMode: "SELF",
      taxType,
      kind: "NORMAL",
      sellerAnchorId: null,
      status: "PENDING_APPROVAL",
      supplyAmount,
      vatAmount,
      totalAmount,
      itemName,
      buyer,
      periodStart,
      periodEnd,
      sourceRefType,
      sourceRefIds: sourceRefIds || [],
    });
    return { created: true, skipped: false };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { created: false, skipped: true };
    }
    throw err;
  }
}

/**
 * 전월 유료 기공·어벗·배송 소비 → 면세 계산서 월합 (사업자당 1건).
 * 스토어 크레딧 차감(refType=STORE_ORDER)은 제외.
 */
async function generateExemptDrafts({ periodStart, periodEnd }) {
  const rows = await LedgerLine.aggregate([
    {
      $match: {
        accountCode: "REQ_PAID_CREDIT",
        amount: { $lt: 0 },
        occurredAt: { $gte: periodStart, $lt: periodEnd },
        refType: { $ne: "STORE_ORDER" },
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
    {
      $match: {
        "journalDoc.eventType": { $in: EXEMPT_SPEND_EVENTS },
      },
    },
    {
      $group: {
        _id: "$ownerId",
        totalAmount: { $sum: { $multiply: ["$amount", -1] } },
        refIds: { $addToSet: "$refId" },
      },
    },
    { $match: { totalAmount: { $gt: 0 } } },
  ]);

  let created = 0;
  let skippedExisting = 0;
  for (const row of rows) {
    const businessAnchorId = row?._id;
    if (!businessAnchorId || !Types.ObjectId.isValid(String(businessAnchorId))) {
      continue;
    }
    const totalAmount = Math.round(Number(row.totalAmount || 0));
    if (totalAmount <= 0) continue;

    const result = await createCustomerMonthlyDraft({
      businessAnchorId,
      taxType: "면세",
      supplyAmount: totalAmount,
      vatAmount: 0,
      totalAmount,
      itemName: "기공·커스텀어벗 대금(월합)",
      periodStart,
      periodEnd,
      sourceRefType: "EXEMPT_SPEND",
      sourceRefIds: (row.refIds || []).filter(Boolean),
    });
    if (result.created) created++;
    else if (result.skipped) skippedExisting++;
  }
  return { created, skippedExisting, groups: rows.length };
}

/**
 * 전월 STORE_SALE / REV_STORE_TAXABLE → 과세 세금계산서 월합 (사업자당 1건).
 */
async function generateTaxableStoreDrafts({ periodStart, periodEnd }) {
  const rows = await LedgerLine.aggregate([
    {
      $match: {
        accountCode: "REV_STORE_TAXABLE",
        amount: { $gt: 0 },
        occurredAt: { $gte: periodStart, $lt: periodEnd },
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
    {
      $match: {
        "journalDoc.eventType": "STORE_SALE",
      },
    },
    {
      $group: {
        _id: "$journalDoc.businessAnchorId",
        supplyAmount: {
          $sum: {
            $ifNull: ["$amountExcludingVat", "$amount"],
          },
        },
        vatAmount: { $sum: { $ifNull: ["$vatAmount", 0] } },
        totalAmount: {
          $sum: {
            $ifNull: ["$amountIncludingVat", "$amount"],
          },
        },
        refIds: { $addToSet: "$refId" },
      },
    },
    { $match: { supplyAmount: { $gt: 0 } } },
  ]);

  let created = 0;
  let skippedExisting = 0;
  for (const row of rows) {
    const businessAnchorId = row?._id;
    if (!businessAnchorId || !Types.ObjectId.isValid(String(businessAnchorId))) {
      continue;
    }
    const supplyAmount = Math.round(Number(row.supplyAmount || 0));
    const vatAmount = Math.round(Number(row.vatAmount || 0));
    let totalAmount = Math.round(Number(row.totalAmount || 0));
    if (totalAmount <= 0) totalAmount = supplyAmount + vatAmount;
    if (supplyAmount <= 0) continue;

    const result = await createCustomerMonthlyDraft({
      businessAnchorId,
      taxType: "과세",
      supplyAmount,
      vatAmount,
      totalAmount,
      itemName: "스토어 기성품(월합)",
      periodStart,
      periodEnd,
      sourceRefType: "STORE_ORDER",
      sourceRefIds: (row.refIds || []).filter(Boolean),
    });
    if (result.created) created++;
    else if (result.skipped) skippedExisting++;
  }
  return { created, skippedExisting, groups: rows.length };
}

/**
 * KST [periodStart, periodEnd) 고객향 월합 draft 생성.
 * @returns {Promise<{ exempt: object, taxable: object }>}
 */
export async function generateMonthlyCustomerInvoiceDrafts({
  periodStart,
  periodEnd,
}) {
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    throw new Error("periodStart/periodEnd(Date)가 필요합니다.");
  }
  const exempt = await generateExemptDrafts({ periodStart, periodEnd });
  const taxable = await generateTaxableStoreDrafts({ periodStart, periodEnd });
  return { exempt, taxable };
}
