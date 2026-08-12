// related files:
// - web/backend/rules.md
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/taxInvoiceDraft.model.js
// - web/backend/utils/taxInvoiceParty.util.js
// - web/backend/jobs/monthlyPracticeLabInvoiceWorker.js
//
// ①치과→기공소 기공의뢰비(크레딧)의 반대방향 계산서(면세, 위수탁) 월 합계 발행.
// 기공소가 실제 공급자, 치과가 공급받는자, 어벗츠는 팝빌 수탁자로 대리발행한다.
import { Types } from "mongoose";
import LedgerLine from "../models/ledgerLine.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";

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

/**
 * [periodStart, periodEnd) 구간의 PRACTICE_TRANSFER_SPEND_COMMIT 청구 내역을
 * (치과, 기공소) 쌍별로 월 합계하여 TaxInvoiceDraft(면세, 위수탁)를 생성한다.
 * 이미 생성된 (sellerAnchorId, businessAnchorId, direction, periodStart, periodEnd)는 건너뛴다.
 *
 * @returns {Promise<{ created: number, skippedExisting: number, groups: number }>}
 */
export async function generateMonthlyLabToPracticeInvoiceDrafts({
  periodStart,
  periodEnd,
}) {
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    throw new Error("periodStart/periodEnd(Date)가 필요합니다.");
  }

  const rows = await LedgerLine.aggregate([
    {
      $match: {
        accountCode: "REQ_PAID_CREDIT",
        refType: "PRACTICE_TRANSFER",
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
    {
      $unwind: {
        path: "$journalDoc",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $match: {
        "journalDoc.eventType": "PRACTICE_TRANSFER_SPEND_COMMIT",
      },
    },
    {
      $addFields: {
        labAnchorId: "$journalDoc.meta.labAnchorId",
      },
    },
    {
      $group: {
        _id: {
          practiceAnchorId: "$ownerId",
          labAnchorId: "$labAnchorId",
        },
        // amount는 음수(차감)이므로 절대값 합계 = 치과가 청구받은 총액
        totalAmount: { $sum: { $multiply: ["$amount", -1] } },
        transferIds: { $addToSet: "$refId" },
      },
    },
    { $match: { totalAmount: { $gt: 0 } } },
  ]);

  let created = 0;
  let skippedExisting = 0;

  for (const row of rows) {
    const practiceAnchorId = row?._id?.practiceAnchorId;
    const labAnchorIdRaw = row?._id?.labAnchorId;
    if (!practiceAnchorId || !labAnchorIdRaw) continue;
    if (!Types.ObjectId.isValid(String(labAnchorIdRaw))) continue;

    const labAnchorId = new Types.ObjectId(String(labAnchorIdRaw));
    const totalAmount = Math.round(Number(row?.totalAmount || 0));
    if (totalAmount <= 0) continue;

    const [lab, practice] = await Promise.all([
      BusinessAnchor.findById(labAnchorId).lean(),
      BusinessAnchor.findById(practiceAnchorId).lean(),
    ]);
    if (!lab || !practice) continue;

    const [labContact, practiceContact] = await Promise.all([
      resolveContactUserForAnchor(lab),
      resolveContactUserForAnchor(practice),
    ]);

    const seller = buildPartySnapshotFromAnchor(lab, labContact);
    const buyer = buildPartySnapshotFromAnchor(practice, practiceContact);

    try {
      await TaxInvoiceDraft.create({
        userId: null,
        businessAnchorId: practiceAnchorId,
        direction: "LAB_TO_PRACTICE",
        issuanceMode: "TRUSTEE",
        taxType: "면세",
        sellerAnchorId: labAnchorId,
        seller,
        buyer,
        itemName: "기공의뢰비",
        status: "PENDING_APPROVAL",
        supplyAmount: totalAmount,
        vatAmount: 0,
        totalAmount,
        periodStart,
        periodEnd,
        sourceRefType: "PRACTICE_TRANSFER",
        sourceRefIds: row?.transferIds || [],
      });
      created++;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        skippedExisting++;
        continue;
      }
      throw err;
    }
  }

  return { created, skippedExisting, groups: rows.length };
}

/** KST 기준 "지난달" [start, end) 구간(UTC Date)을 계산한다. */
export function resolvePreviousKstMonthRange(now = new Date()) {
  const kstNowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m] = kstNowStr.split("-").map(Number);
  // 이번달 1일 00:00 KST = UTC-9h
  const thisMonthStartUtc = new Date(Date.UTC(y, m - 1, 1, -9, 0, 0, 0));
  const prevMonthStartUtc = new Date(Date.UTC(y, m - 2, 1, -9, 0, 0, 0));
  return { periodStart: prevMonthStartUtc, periodEnd: thisMonthStartUtc };
}
