// related files:
// - web/backend/models/settlementBatch.model.js
// - web/backend/models/settlementBatchItem.model.js
// - web/backend/services/settlement.service.js
// - web/backend/models/taxInvoiceDraft.model.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import SettlementBatch from "../../models/settlementBatch.model.js";
import SettlementBatchItem from "../../models/settlementBatchItem.model.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import {
  AFFILIATE_SETTLEMENT_ACCOUNTS,
  computeSettlementPayoutBreakdown,
  hasPayoutAccount,
  postSettlementPayoutJournal,
  resolveSettlementInvoiceDraftSpec,
} from "../../services/settlement.service.js";
import { buildPartySnapshotFromAnchor } from "../../utils/taxInvoiceParty.util.js";

// change-log:
// - 2026-08-18: 정산 배치 확정 시 제조사·기공소 면세 계산서 Draft 자동 생성.
// - 2026-08-17: 영업자·개발운영사 지급액=공급가+VAT. 세금계산서는 분해 필드 SSOT(제조사 이중 VAT 방지).

const ROLE_FILTERS = [
  {
    role: "lab",
    accountCode: "LAB_SETTLEMENT_CREDIT",
    filter: { businessType: "requestor", requestorKind: "lab" },
  },
  ...Object.entries(AFFILIATE_SETTLEMENT_ACCOUNTS).map(
    ([role, accountCode]) => ({
      role,
      accountCode,
      filter: { businessType: role },
    }),
  ),
];

function parseRange(req) {
  const start = req.body?.periodStart
    ? new Date(`${req.body.periodStart}T00:00:00.000+09:00`)
    : null;
  const end = req.body?.periodEnd
    ? new Date(`${req.body.periodEnd}T00:00:00.000+09:00`)
    : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return null;
  }
  return { periodStart: start, periodEnd: end };
}

function accountSnapshot(anchor) {
  const account = anchor?.payoutAccount || {};
  return {
    bankName: String(account.bankName || ""),
    accountNumber: String(account.accountNumber || ""),
    holderName: String(account.holderName || ""),
  };
}

async function resolveAbutsAnchor() {
  return BusinessAnchor.findOne({ businessType: "admin" })
    .sort({ createdAt: 1 })
    .lean();
}

export async function adminListSettlementBatches(req, res) {
  const batches = await SettlementBatch.find({})
    .sort({ periodStart: -1, _id: -1 })
    .limit(100)
    .lean();
  return res.json({ success: true, data: batches });
}

export async function adminGetSettlementBatch(req, res) {
  const batch = await SettlementBatch.findById(req.params.id).lean();
  if (!batch) return res.status(404).json({ success: false, message: "not_found" });
  const items = await SettlementBatchItem.find({ batchId: batch._id })
    .sort({ role: 1, createdAt: 1 })
    .populate("businessAnchorId", "name businessType requestorKind metadata")
    .populate("invoiceDraftId", "status taxType totalAmount hometaxTrxId")
    .lean();
  return res.json({ success: true, data: { ...batch, items } });
}

export async function adminCreateSettlementBatch(req, res) {
  try {
    const range = parseRange(req);
    if (!range) {
      return res.status(400).json({ success: false, message: "periodStart/periodEnd가 필요합니다." });
    }
    const active = await SettlementBatch.findOne({
      status: { $in: ["DRAFT", "CONFIRMED"] },
    }).lean();
    if (active) {
      return res.status(409).json({
        success: false,
        message: "진행 중인 정산 배치가 있습니다.",
        data: { batchId: String(active._id) },
      });
    }

    const batch = await SettlementBatch.create({
      ...range,
      createdBy: req.user?._id || null,
    });
    const items = [];
    for (const definition of ROLE_FILTERS) {
      const anchors = await BusinessAnchor.find(definition.filter)
        .select({ payoutAccount: 1 })
        .lean();
      for (const anchor of anchors) {
        const breakdown = await computeSettlementPayoutBreakdown({
          role: definition.role,
          businessAnchorId: anchor._id,
        });
        if (breakdown.amount <= 0) continue;
        items.push({
          batchId: batch._id,
          role: definition.role,
          businessAnchorId: anchor._id,
          accountCode: definition.accountCode,
          amount: breakdown.amount,
          supplyAmount: breakdown.supplyAmount,
          vatAmount: breakdown.vatAmount,
          payoutAccount: accountSnapshot(anchor),
          status: "PENDING",
        });
      }
    }
    if (items.length) await SettlementBatchItem.insertMany(items);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    await SettlementBatch.updateOne(
      { _id: batch._id },
      { $set: { totalAmount, itemCount: items.length } },
    );
    return res.status(201).json({
      success: true,
      data: { ...batch.toObject(), totalAmount, itemCount: items.length },
    });
  } catch (error) {
    console.error("adminCreateSettlementBatch error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function adminConfirmSettlementBatch(req, res) {
  try {
    const batch = await SettlementBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, message: "not_found" });
    if (batch.status !== "DRAFT") {
      return res.status(409).json({ success: false, message: "DRAFT 배치만 확정할 수 있습니다." });
    }
    const abuts = await resolveAbutsAnchor();
    const items = await SettlementBatchItem.find({ batchId: batch._id });
    let totalAmount = 0;
    for (const item of items) {
      const anchor = await BusinessAnchor.findById(item.businessAnchorId).lean();
      if (!anchor) {
        item.status = "CANCELLED";
        await item.save();
        continue;
      }
      const breakdown = await computeSettlementPayoutBreakdown({
        role: item.role,
        businessAnchorId: item.businessAnchorId,
      });
      item.amount = breakdown.amount;
      item.supplyAmount = breakdown.supplyAmount;
      item.vatAmount = breakdown.vatAmount;
      item.payoutAccount = accountSnapshot(anchor);
      if (breakdown.amount <= 0 || !hasPayoutAccount(item.payoutAccount)) {
        item.status = "EXCLUDED_NO_ACCOUNT";
        await item.save();
        continue;
      }
      item.status = "CONFIRMED";
      totalAmount += breakdown.amount;

      const invoiceSpec = resolveSettlementInvoiceDraftSpec({
        role: item.role,
        breakdown,
      });
      if (invoiceSpec) {
        const seller = buildPartySnapshotFromAnchor(anchor);
        const buyer = abuts ? buildPartySnapshotFromAnchor(abuts) : {};
        const draft = await TaxInvoiceDraft.create({
          businessAnchorId: abuts?._id || null,
          direction: invoiceSpec.direction,
          issuanceMode: invoiceSpec.issuanceMode,
          taxType: invoiceSpec.taxType,
          sellerAnchorId: anchor._id,
          seller,
          buyer,
          itemName: invoiceSpec.itemName,
          status: "PENDING_APPROVAL",
          supplyAmount: invoiceSpec.supplyAmount,
          vatAmount: invoiceSpec.vatAmount,
          totalAmount: invoiceSpec.totalAmount,
          periodStart: batch.periodStart,
          periodEnd: batch.periodEnd,
          sourceRefType: "SETTLEMENT_BATCH_ITEM",
          sourceRefIds: [item._id],
        });
        item.invoiceDraftId = draft._id;
      }
      await item.save();
    }
    batch.status = "CONFIRMED";
    batch.confirmedAt = new Date();
    batch.confirmedBy = req.user?._id || null;
    batch.totalAmount = totalAmount;
    await batch.save();
    return res.json({ success: true, data: batch });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "동일 기간 정산 계산서가 이미 생성되어 있습니다." });
    }
    console.error("adminConfirmSettlementBatch error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function markItemPaid({ item, actorUserId }) {
  if (item.status !== "CONFIRMED") {
    throw new Error("확정(CONFIRMED) 상태인 항목만 지급완료 처리할 수 있습니다.");
  }
  const journal = await postSettlementPayoutJournal({ item, actorUserId });
  item.status = "PAID";
  item.journalId = journal.journalId;
  item.paidAt = new Date();
  item.paidBy = actorUserId || null;
  await item.save();
  return item;
}

async function completeIfAllPaid(batch) {
  const remaining = await SettlementBatchItem.countDocuments({
    batchId: batch._id,
    status: "CONFIRMED",
  });
  if (remaining === 0) {
    batch.status = "COMPLETED";
    batch.completedAt = new Date();
    await batch.save();
  }
}

export async function adminMarkSettlementBatchItemPaid(req, res) {
  try {
    const item = await SettlementBatchItem.findOne({
      _id: req.params.itemId,
      batchId: req.params.id,
    });
    if (!item) return res.status(404).json({ success: false, message: "not_found" });
    const batch = await SettlementBatch.findById(item.batchId);
    if (!batch || batch.status !== "CONFIRMED") {
      return res.status(409).json({ success: false, message: "확정된 배치만 지급완료 처리할 수 있습니다." });
    }
    await markItemPaid({ item, actorUserId: req.user?._id });
    await completeIfAllPaid(batch);
    return res.json({ success: true, data: item });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function adminMarkAllSettlementBatchItemsPaid(req, res) {
  try {
    const batch = await SettlementBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, message: "not_found" });
    if (batch.status !== "CONFIRMED") {
      return res.status(409).json({ success: false, message: "확정된 배치만 지급완료 처리할 수 있습니다." });
    }
    const items = await SettlementBatchItem.find({
      batchId: batch._id,
      status: "CONFIRMED",
    });
    for (const item of items) {
      await markItemPaid({ item, actorUserId: req.user?._id });
    }
    await completeIfAllPaid(batch);
    return res.json({ success: true, data: { paidCount: items.length } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function adminCancelSettlementBatch(req, res) {
  const batch = await SettlementBatch.findById(req.params.id);
  if (!batch) return res.status(404).json({ success: false, message: "not_found" });
  if (!["DRAFT", "CONFIRMED"].includes(batch.status)) {
    return res.status(409).json({ success: false, message: "완료/취소된 배치는 취소할 수 없습니다." });
  }
  // CONFIRMED 상태에서 생성된 미발행 계산서 초안도 함께 취소한다. 이미 발행/지급된 것은 이 API 경로에 없다.
  const items = await SettlementBatchItem.find({ batchId: batch._id });
  const draftIds = items.map((item) => item.invoiceDraftId).filter(Boolean);
  if (draftIds.length) {
    await TaxInvoiceDraft.updateMany(
      { _id: { $in: draftIds }, status: { $nin: ["SENT"] } },
      { $set: { status: "CANCELLED" } },
    );
  }
  await SettlementBatchItem.updateMany(
    { batchId: batch._id, status: { $in: ["PENDING", "CONFIRMED", "EXCLUDED_NO_ACCOUNT"] } },
    { $set: { status: "CANCELLED" } },
  );
  batch.status = "CANCELLED";
  await batch.save();
  return res.json({ success: true, data: batch });
}
