// related files:
// - web/backend/models/practiceLabDirectSettlement.model.js
// - web/backend/utils/practiceLabDirectSettlement.util.js
// - web/backend/services/practiceObBilling.service.js
// - web/backend/services/practiceObPaymentInvoice.service.js
//
// 외부 기공소 기공비 정산서. 익월 1일 전월분. 치과가 기공소 계좌로 직접 입금한다.
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import PracticeLabDirectSettlement from "../models/practiceLabDirectSettlement.model.js";
import User from "../models/user.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { resolvePerformingLabAnchorId } from "../utils/practiceTransferAutoMatchCore.js";
import {
  resolveMonthBoundsFromYearMonth,
  resolvePreviousKstYearMonth,
} from "./practiceObBilling.service.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { writeDateFromPeriodEnd } from "../utils/taxInvoicePeriod.util.js";
import { approveAndIssueTaxInvoiceDraftById } from "./taxInvoiceAutoIssue.service.js";
import { resolveTrusteeIssueEnabled } from "../utils/trusteeIssueConsent.js";
import {
  DIRECT_LAB_SETTLEMENT_START_YEAR_MONTH,
  isDirectSettlementLocked,
  isEligibleDirectSettlementMonth,
  isDirectPayLabAnchor,
  nextYearMonth,
  labFeeAmountFromTransfer,
  livePayoutAccount,
  patientLabelFromTransfer,
  resolvePayableAmount,
  roundWon,
  sumLineAmounts,
} from "../utils/practiceLabDirectSettlement.util.js";

function isDuplicateKey(err) {
  const code = err?.code;
  const msg = String(err?.message || "");
  return code === 11000 || msg.includes("E11000");
}

function partyFromAnchor(anchor, contact) {
  const party = buildPartySnapshotFromAnchor(anchor, contact);
  if (!party.corpName) party.corpName = String(anchor?.name || "").trim();
  return party;
}

async function resolveContactUser(anchor) {
  if (!anchor?.primaryContactUserId) return null;
  return User.findById(anchor.primaryContactUserId)
    .select({ name: 1, email: 1, phone: 1 })
    .lean();
}

function serializeStatement(doc, account) {
  const lines = (doc.lines || []).map((line) => ({
    id: String(line._id),
    transferId: String(line.transferId),
    patientLabel: line.patientLabel || "기공의뢰",
    originalAmount: Math.round(Number(line.originalAmount) || 0),
    amount: Math.round(Number(line.amount) || 0),
  }));
  const totalOverride =
    doc.totalOverride === null || doc.totalOverride === undefined
      ? null
      : Math.round(Number(doc.totalOverride) || 0);
  return {
    id: String(doc._id),
    yearMonth: doc.yearMonth,
    status: doc.status,
    practiceAnchorId: String(doc.practiceAnchorId),
    labAnchorId: String(doc.labAnchorId),
    practiceName: doc.practiceName || "",
    labName: doc.labName || "",
    originalTotal: Math.round(Number(doc.originalTotal) || 0),
    totalOverride,
    payableAmount: Math.round(Number(doc.payableAmount) || 0),
    lineSum: sumLineAmounts(lines),
    lines,
    account: account || null,
    depositConfirmedAt: doc.depositConfirmedAt || null,
    taxInvoiceDraftId: doc.taxInvoiceDraftId ? String(doc.taxInvoiceDraftId) : null,
    locked: isDirectSettlementLocked(doc.status),
  };
}

async function accountsByLabId(labIds) {
  if (!labIds.length) return new Map();
  const anchors = await BusinessAnchor.find({ _id: { $in: labIds } })
    .select({ name: 1, payoutAccount: 1, taxInvoice: 1, businessType: 1 })
    .lean();
  return new Map(anchors.map((anchor) => [String(anchor._id), anchor]));
}

function withAccounts(docs, labMap) {
  return docs.map((doc) =>
    serializeStatement(doc, livePayoutAccount(labMap.get(String(doc.labAnchorId)))),
  );
}

export async function ensureDirectSettlementsForMonth(yearMonth, scope = {}) {
  const previous = resolvePreviousKstYearMonth();
  if (!isEligibleDirectSettlementMonth(yearMonth, previous)) {
    return { created: 0, yearMonth };
  }
  const { start, end } = resolveMonthBoundsFromYearMonth(yearMonth);
  const transferQuery = {
    status: { $nin: ["canceled", "rejected"] },
    createdAt: { $gte: start, $lt: end },
  };
  if (scope.practiceAnchorId) {
    transferQuery.practiceBusinessAnchorId = scope.practiceAnchorId;
  }
  if (scope.labAnchorId) {
    const labId = scope.labAnchorId;
    transferQuery.$or = [
      { assigneeLabAnchorId: labId },
      {
        targetLabAnchorId: labId,
        $or: [{ assigneeLabAnchorId: null }, { assigneeLabAnchorId: { $exists: false } }],
      },
    ];
  }

  const [transfers, internalLab] = await Promise.all([
    PracticeTransfer.find(transferQuery)
      .select({
        practiceBusinessAnchorId: 1,
        targetLabAnchorId: 1,
        assigneeLabAnchorId: 1,
        billing: 1,
        files: 1,
        toothWorks: 1,
      })
      .lean(),
    BusinessAnchor.findOne({ businessType: "internalLab" }).select({ _id: 1 }).lean(),
  ]);
  const internalId = internalLab?._id ? String(internalLab._id) : "";

  const groups = new Map();
  for (const transfer of transfers) {
    const practiceId = String(transfer.practiceBusinessAnchorId || "");
    const performerId = String(resolvePerformingLabAnchorId(transfer) || "");
    if (!practiceId || !performerId || performerId === internalId) continue;
    const amount = labFeeAmountFromTransfer(transfer);
    if (amount <= 0) continue;
    const key = `${practiceId}:${performerId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        practiceAnchorId: transfer.practiceBusinessAnchorId,
        labAnchorId: new Types.ObjectId(performerId),
        lines: [],
      });
    }
    groups.get(key).lines.push({
      transferId: transfer._id,
      patientLabel: patientLabelFromTransfer(transfer),
      originalAmount: amount,
      amount,
    });
  }
  if (!groups.size) return { created: 0, yearMonth };

  const practiceIds = [];
  const labIds = [];
  for (const group of groups.values()) {
    practiceIds.push(group.practiceAnchorId);
    labIds.push(group.labAnchorId);
  }
  const [existing, anchors] = await Promise.all([
    PracticeLabDirectSettlement.find({
      yearMonth,
      practiceAnchorId: { $in: practiceIds },
      labAnchorId: { $in: labIds },
    })
      .select({ practiceAnchorId: 1, labAnchorId: 1 })
      .lean(),
    BusinessAnchor.find({ _id: { $in: [...practiceIds, ...labIds] } })
      .select({ name: 1, businessType: 1, requestorKind: 1 })
      .lean(),
  ]);
  const anchorById = new Map(anchors.map((anchor) => [String(anchor._id), anchor]));
  const existingKeys = new Set(
    existing.map((row) => `${row.practiceAnchorId}:${row.labAnchorId}`),
  );

  const docs = [];
  for (const group of groups.values()) {
    const key = `${group.practiceAnchorId}:${group.labAnchorId}`;
    if (existingKeys.has(key)) continue;
    const lab = anchorById.get(String(group.labAnchorId));
    if (!isDirectPayLabAnchor(lab)) continue;
    const originalTotal = sumLineAmounts(group.lines);
    const practice = anchorById.get(String(group.practiceAnchorId));
    docs.push({
      practiceAnchorId: group.practiceAnchorId,
      labAnchorId: group.labAnchorId,
      yearMonth,
      practiceName: practice?.name || "",
      labName: lab?.name || "",
      status: "OPEN",
      lines: group.lines,
      originalTotal,
      totalOverride: null,
      payableAmount: originalTotal,
      edits: [],
    });
  }
  if (!docs.length) return { created: 0, yearMonth };
  try {
    await PracticeLabDirectSettlement.insertMany(docs, { ordered: false });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
  return { created: docs.length, yearMonth };
}

/** 시작월부터 전월까지. 같은 치과·기공소·월은 다시 만들지 않는다. */
export async function ensureDirectSettlementsThroughPrevious(scope = {}) {
  const previous = resolvePreviousKstYearMonth();
  let cursor = DIRECT_LAB_SETTLEMENT_START_YEAR_MONTH;
  let created = 0;
  while (cursor && cursor <= previous) {
    const result = await ensureDirectSettlementsForMonth(cursor, scope);
    created += Number(result?.created || 0);
    cursor = nextYearMonth(cursor);
  }
  return { created, yearMonth: previous };
}

export async function listPracticeDirectSettlements(practiceAnchorId) {
  await ensureDirectSettlementsThroughPrevious({ practiceAnchorId });
  const docs = await PracticeLabDirectSettlement.find({ practiceAnchorId })
    .sort({ yearMonth: -1, labName: 1 })
    .lean();
  const labMap = await accountsByLabId(docs.map((doc) => doc.labAnchorId));
  return { statements: withAccounts(docs, labMap) };
}

export async function listLabDirectSettlements(labAnchorId) {
  const lab = await BusinessAnchor.findById(labAnchorId)
    .select({ taxInvoice: 1, businessType: 1, requestorKind: 1, payoutAccount: 1 })
    .lean();
  const applies = isDirectPayLabAnchor(lab);
  if (applies) {
    await ensureDirectSettlementsThroughPrevious({ labAnchorId });
  }
  const docs = await PracticeLabDirectSettlement.find({ labAnchorId })
    .sort({ yearMonth: -1, practiceName: 1 })
    .lean();
  const account = livePayoutAccount(lab);
  return {
    applies,
    trusteeIssueEnabled: resolveTrusteeIssueEnabled(lab?.taxInvoice),
    account,
    statements: docs.map((doc) => serializeStatement(doc, account)),
  };
}

export async function listAdminDirectSettlements() {
  await ensureDirectSettlementsThroughPrevious();
  const docs = await PracticeLabDirectSettlement.find({
    yearMonth: { $gte: DIRECT_LAB_SETTLEMENT_START_YEAR_MONTH },
  })
    .sort({ yearMonth: -1, practiceName: 1 })
    .limit(200)
    .lean();
  const labMap = await accountsByLabId(docs.map((doc) => doc.labAnchorId));
  const transferIds = docs.flatMap((doc) =>
    (doc.lines || []).map((line) => line.transferId).filter(Boolean),
  );
  let legacyByTransfer = new Map();
  if (transferIds.length) {
    const rows = await LedgerLine.aggregate([
      {
        $match: {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          refType: "PRACTICE_TRANSFER",
          refId: { $in: transferIds },
        },
      },
      { $group: { _id: "$refId", total: { $sum: "$amount" } } },
    ]);
    legacyByTransfer = new Map(rows.map((row) => [String(row._id), Math.round(row.total || 0)]));
  }
  return {
    statements: withAccounts(docs, labMap).map((row) => {
      const doc = docs.find((item) => String(item._id) === row.id);
      const legacyCreditWon = (doc?.lines || []).reduce(
        (sum, line) => sum + (legacyByTransfer.get(String(line.transferId)) || 0),
        0,
      );
      return { ...row, legacyCreditWon: Math.max(0, legacyCreditWon) };
    }),
  };
}

export async function updateLabDirectSettlement({
  settlementId,
  labAnchorId,
  actorUserId,
  lines,
  totalOverride,
  totalOverrideSet = false,
}) {
  const doc = await PracticeLabDirectSettlement.findById(settlementId);
  if (!doc || String(doc.labAnchorId) !== String(labAnchorId)) {
    const err = new Error("정산서를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  if (isDirectSettlementLocked(doc.status)) {
    const err = new Error("입금 확인 후에는 금액을 바꿀 수 없습니다.");
    err.statusCode = 409;
    throw err;
  }

  const before = {
    payableAmount: doc.payableAmount,
    totalOverride: doc.totalOverride,
    lines: doc.lines.map((line) => ({
      id: String(line._id),
      amount: line.amount,
    })),
  };

  if (Array.isArray(lines)) {
    const nextById = new Map(
      lines
        .map((line) => [String(line?.id || line?.transferId || ""), roundWon(line?.amount)])
        .filter((entry) => entry[0] && entry[1] !== null),
    );
    for (const line of doc.lines) {
      const byId = nextById.get(String(line._id));
      const byTransfer = nextById.get(String(line.transferId));
      const next = byId !== undefined ? byId : byTransfer;
      if (next !== undefined && next !== null) line.amount = next;
    }
  }
  if (totalOverrideSet) {
    doc.totalOverride =
      totalOverride === null || totalOverride === "" ? null : roundWon(totalOverride);
    if (doc.totalOverride === null && totalOverride !== null && totalOverride !== "") {
      const err = new Error("총액은 0 이상의 정수입니다.");
      err.statusCode = 400;
      throw err;
    }
  }
  doc.payableAmount = resolvePayableAmount(doc.lines, doc.totalOverride);
  doc.status = "ADJUSTED";
  doc.edits.push({
    at: new Date(),
    actorUserId: actorUserId || null,
    kind: "adjust",
    before,
    after: {
      payableAmount: doc.payableAmount,
      totalOverride: doc.totalOverride,
    },
  });
  await doc.save();
  const account = livePayoutAccount(
    await BusinessAnchor.findById(doc.labAnchorId).select({ payoutAccount: 1 }).lean(),
  );
  return serializeStatement(doc.toObject(), account);
}

async function issueDirectLabFeeInvoice(doc) {
  const amount = Math.round(Number(doc.payableAmount) || 0);
  if (amount <= 0) return null;
  const { start, end } = resolveMonthBoundsFromYearMonth(doc.yearMonth);
  const writeDate = writeDateFromPeriodEnd(end);
  const existing = await TaxInvoiceDraft.findOne({
    sellerAnchorId: doc.labAnchorId,
    businessAnchorId: doc.practiceAnchorId,
    direction: "LAB_TO_PRACTICE",
    periodStart: start,
    periodEnd: end,
    kind: "NORMAL",
  })
    .select({ _id: 1, status: 1 })
    .lean();
  if (existing?._id) {
    if (existing.status === "PENDING_APPROVAL") {
      await TaxInvoiceDraft.updateOne(
        { _id: existing._id },
        {
          $set: {
            supplyAmount: amount,
            vatAmount: 0,
            totalAmount: amount,
            itemName: "기공서비스(면세 계산서)",
            writeDate,
            sourceRefType: "PRACTICE_LAB_DIRECT_SETTLEMENT",
            sourceRefIds: [doc._id],
          },
        },
      );
    }
    return existing._id;
  }

  const [practice, lab] = await Promise.all([
    BusinessAnchor.findById(doc.practiceAnchorId).lean(),
    BusinessAnchor.findById(doc.labAnchorId).lean(),
  ]);
  if (!practice || !lab) return null;
  if (resolveTrusteeIssueEnabled(lab.taxInvoice) !== true) return null;
  const [practiceContact, labContact] = await Promise.all([
    resolveContactUser(practice),
    resolveContactUser(lab),
  ]);
  let draft;
  try {
    draft = await TaxInvoiceDraft.create({
      chargeOrderId: null,
      storeOrderId: null,
      userId: practice.primaryContactUserId || null,
      businessAnchorId: practice._id,
      direction: "LAB_TO_PRACTICE",
      issuanceMode: "TRUSTEE",
      taxType: "면세",
      kind: "NORMAL",
      buyerKind: "practice",
      sellerAnchorId: lab._id,
      seller: partyFromAnchor(lab, labContact),
      status: "PENDING_APPROVAL",
      supplyAmount: amount,
      vatAmount: 0,
      totalAmount: amount,
      itemName: "기공서비스(면세 계산서)",
      buyer: partyFromAnchor(practice, practiceContact),
      writeDate,
      periodStart: start,
      periodEnd: end,
      sourceRefType: "PRACTICE_LAB_DIRECT_SETTLEMENT",
      sourceRefIds: [doc._id],
    });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    const again = await TaxInvoiceDraft.findOne({
      sellerAnchorId: doc.labAnchorId,
      businessAnchorId: doc.practiceAnchorId,
      direction: "LAB_TO_PRACTICE",
      periodStart: start,
      kind: "NORMAL",
    })
      .select({ _id: 1 })
      .lean();
    return again?._id || null;
  }
  const corpNum = String(process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
  if (corpNum) {
    void approveAndIssueTaxInvoiceDraftById(draft._id).catch((error) => {
      console.error("[directLabFeeInvoice] popbill failed", error);
    });
  }
  return draft._id;
}

export async function confirmLabDirectSettlementDeposit({
  settlementId,
  labAnchorId,
  actorUserId,
}) {
  const lab = await BusinessAnchor.findById(labAnchorId)
    .select({ taxInvoice: 1, payoutAccount: 1 })
    .lean();
  const trustee = resolveTrusteeIssueEnabled(lab?.taxInvoice);
  const account = livePayoutAccount(lab);
  const doc = await PracticeLabDirectSettlement.findById(settlementId);
  if (!doc || String(doc.labAnchorId) !== String(labAnchorId)) {
    const err = new Error("정산서를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  if (isDirectSettlementLocked(doc.status)) {
    return serializeStatement(doc.toObject(), account);
  }
  doc.depositConfirmedAt = new Date();
  doc.depositConfirmedBy = actorUserId || null;
  doc.payableAmount = resolvePayableAmount(doc.lines, doc.totalOverride);
  if (trustee === null) {
    doc.status = "DEPOSIT_CONFIRMED";
    await doc.save();
    return serializeStatement(doc.toObject(), account);
  }
  if (trustee === true && doc.payableAmount > 0) {
    const draftId = await issueDirectLabFeeInvoice(doc);
    doc.taxInvoiceDraftId = draftId;
    doc.status = draftId ? "INVOICE_ISSUED" : "DEPOSIT_CONFIRMED";
  } else {
    doc.status = "SELF_INVOICE";
  }
  await doc.save();
  return serializeStatement(doc.toObject(), account);
}

export async function saveLabTrusteeIssueChoice({ labAnchorId, enabled }) {
  if (typeof enabled !== "boolean") {
    const err = new Error("대신 발행 여부를 선택해 주세요.");
    err.statusCode = 400;
    throw err;
  }
  const lab = await BusinessAnchor.findById(labAnchorId).select({
    businessType: 1,
    requestorKind: 1,
    taxInvoice: 1,
  });
  if (!lab || !isDirectPayLabAnchor(lab)) {
    const err = new Error("기공소만 선택할 수 있습니다.");
    err.statusCode = 403;
    throw err;
  }
  lab.taxInvoice = {
    ...(lab.taxInvoice?.toObject?.() || lab.taxInvoice || {}),
    trusteeIssueEnabled: enabled,
    updatedAt: new Date(),
  };
  lab.markModified("taxInvoice");
  await lab.save();
  await applyTrusteeChoiceToConfirmedStatements(labAnchorId, enabled);
  return { trusteeIssueEnabled: enabled };
}

export async function applyTrusteeChoiceToConfirmedStatements(labAnchorId, enabled) {
  const docs = await PracticeLabDirectSettlement.find({
    labAnchorId,
    status: "DEPOSIT_CONFIRMED",
  });
  await Promise.all(
    docs.map(async (doc) => {
      const amount = Math.round(Number(doc.payableAmount) || 0);
      if (enabled && amount > 0) {
        const draftId = await issueDirectLabFeeInvoice(doc);
        if (!draftId) {
          const err = new Error("계산서를 만들지 못했습니다.");
          err.statusCode = 409;
          throw err;
        }
        doc.taxInvoiceDraftId = draftId;
        doc.status = "INVOICE_ISSUED";
      } else {
        doc.status = "SELF_INVOICE";
      }
      await doc.save();
    }),
  );
}

/** 정산서에 포함된 의뢰의 기존 기공크레딧. 월 지급액에서 뺀다. */
export async function sumLegacyLabCreditCoveredByDirectStatements(labAnchorId) {
  if (!labAnchorId || !Types.ObjectId.isValid(String(labAnchorId))) return 0;
  const docs = await PracticeLabDirectSettlement.find({})
    .select({ "lines.transferId": 1 })
    .lean();
  const transferIds = docs.flatMap((doc) =>
    (doc.lines || []).map((line) => line.transferId).filter(Boolean),
  );
  if (!transferIds.length) return 0;
  const rows = await LedgerLine.aggregate([
    {
      $match: {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerId: new Types.ObjectId(String(labAnchorId)),
        refType: "PRACTICE_TRANSFER",
        refId: { $in: transferIds },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return Math.max(0, Math.round(Number(rows?.[0]?.total) || 0));
}
