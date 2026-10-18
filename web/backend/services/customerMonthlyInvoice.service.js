// change-log:
// - 2026-10-18: 월합은 어벗츠 커스텀어벗을 선결제 크레딧으로 주문한 사용분만.
//   구매자=기공소·기공실 있는 치과. 스토어·기공서비스는 치과 OB 이체 때 발행.
// - 2026-10-15: PTX 기공비 면세 월합 공급자=어벗츠기공소(ABUTS_LAB_TO_CUSTOMER, 위수탁). flag `ABUTS_LAB_SELLER_INVOICE`.
// - 2026-09-20: PTX 라이브 HOLD/HOLD_ADJUST를 면세 월합에 포함. LAB_TO_PRACTICE와 이중발행 금지.
// - 2026-09-20: 월합 writeDate=기간 말일(KST).
// - 2026-08-23: 고객향 ABUTS_TO_CUSTOMER 월합 — 면세(기공·어벗) / 과세(스토어) 분리.
// related files:
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/jobs/monthlyCustomerInvoiceWorker.js
// - web/backend/utils/taxInvoicePeriod.util.js
// - rules.md §2.3
import { Types } from "mongoose";
import LedgerLine from "../models/ledgerLine.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { writeDateFromPeriodEnd } from "../utils/taxInvoicePeriod.util.js";
import { resolvePreviousKstMonthRange } from "./practiceLabInvoice.service.js";

export { resolvePreviousKstMonthRange };

/** 어벗츠 커스텀어벗 선결제 크레딧 확정 차감. 배송·스토어·기공서비스는 여기 넣지 않는다. */
export const PREPAID_EXEMPT_SPEND_EVENTS = ["REQUEST_SPEND_COMMIT"];

/** 기공소, 또는 기공실 있는 치과. 어벗츠 커스텀어벗을 선결제로 주문하는 구매자. */
export function isPrepaidCreditUsageBuyer(anchor) {
  const kind = String(anchor?.requestorKind || "").trim();
  if (kind === "lab") return true;
  return kind === "practice" && anchor?.practiceHasInHouseLab === true;
}

async function listPrepaidCreditInvoiceBuyerIds() {
  const rows = await BusinessAnchor.find({
    businessType: "requestor",
    $or: [
      { requestorKind: "lab" },
      { requestorKind: "practice", practiceHasInHouseLab: true },
    ],
  })
    .select({ _id: 1 })
    .lean();
  return rows.map((row) => row._id);
}

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
  sellerAnchor = null,
}) {
  const practice = await BusinessAnchor.findById(businessAnchorId).lean();
  if (!practice) return { created: false, skipped: true };

  const contact = await resolveContactUserForAnchor(practice);
  const buyer = buildPartySnapshotFromAnchor(practice, contact);
  const buyerKind =
    String(practice.requestorKind || "").trim() === "lab" ? "lab" : "practice";

  // 어벗츠기공소 공급자: 위수탁(법인=팝빌 수탁자). 그 외는 기존 어벗츠 정발행.
  const sellerContact = sellerAnchor
    ? await resolveContactUserForAnchor(sellerAnchor)
    : null;
  const seller = sellerAnchor
    ? buildPartySnapshotFromAnchor(sellerAnchor, sellerContact)
    : undefined;

  try {
    await TaxInvoiceDraft.create({
      chargeOrderId: null,
      storeOrderId: null,
      userId: practice.primaryContactUserId || null,
      businessAnchorId,
      direction: sellerAnchor ? "ABUTS_LAB_TO_CUSTOMER" : "ABUTS_TO_CUSTOMER",
      issuanceMode: sellerAnchor ? "TRUSTEE" : "SELF",
      taxType,
      kind: "NORMAL",
      buyerKind,
      sellerAnchorId: sellerAnchor ? sellerAnchor._id : null,
      ...(seller ? { seller } : {}),
      status: "PENDING_APPROVAL",
      supplyAmount,
      vatAmount,
      totalAmount,
      itemName,
      buyer,
      writeDate: writeDateFromPeriodEnd(periodEnd),
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
 * 어벗츠 커스텀어벗 선결제 사용분 → 어벗츠 법인 면세 계산서 (사업자당 1건).
 * 구매자는 기공소와 기공실 있는 치과만.
 */
async function generateExemptDrafts({ periodStart, periodEnd, buyerIds }) {
  if (!buyerIds.length) return { created: 0, skippedExisting: 0, groups: 0 };
  const rows = await LedgerLine.aggregate([
    {
      $match: {
        accountCode: "REQ_PAID_CREDIT",
        ownerId: { $in: buyerIds },
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
        "journalDoc.eventType": { $in: PREPAID_EXEMPT_SPEND_EVENTS },
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
      itemName: "커스텀어벗 대금(월합·면세 계산서)",
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
 * KST [periodStart, periodEnd) 어벗츠 커스텀어벗 선결제 사용분 월합.
 * 스토어는 치과 OB 이체 때 어벗츠가 발행하므로 여기서 만들지 않는다.
 */
export async function generateMonthlyCustomerInvoiceDrafts({
  periodStart,
  periodEnd,
}) {
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    throw new Error("periodStart/periodEnd(Date)가 필요합니다.");
  }
  const buyerIds = await listPrepaidCreditInvoiceBuyerIds();
  const exempt = await generateExemptDrafts({ periodStart, periodEnd, buyerIds });
  return {
    exempt,
    taxable: { created: 0, skippedExisting: 0, groups: 0 },
  };
}
