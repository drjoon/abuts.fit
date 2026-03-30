import mongoose from "mongoose";
import ChargeOrder from "../models/chargeOrder.model.js";
import BankTransaction from "../models/bankTransaction.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { emitCreditBalanceUpdatedToBusiness } from "./creditRealtime.js";
import { enqueueTaxInvoiceIssue } from "./queueClient.js";

export function extractDepositCodeFromText(text) {
  const raw = String(text || "");
  // 2자리 숫자만 추출 (01~99), 숫자 경계 보존
  const matches = [...raw.matchAll(/(^|\D)(\d{2})(\D|$)/g)].map((m) => m?.[2]);
  const uniq = Array.from(new Set(matches.filter(Boolean)));
  if (uniq.length !== 1) return "";
  return String(uniq[0]);
}

export async function upsertBankTransaction({
  externalId,
  bankCode,
  accountNumber,
  tranAmt,
  printedContent,
  occurredAt,
  raw,
}) {
  const id = String(externalId || "").trim();
  if (!id) {
    const err = new Error("externalId가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  const amount = Number(tranAmt);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error("tranAmt가 유효하지 않습니다.");
    err.statusCode = 400;
    throw err;
  }

  const depositCode = extractDepositCodeFromText(printedContent);

  let occurredAtDate = null;
  if (occurredAt) {
    const d = new Date(occurredAt);
    if (!Number.isNaN(d.getTime())) {
      occurredAtDate = d;
    }
  }

  const doc = await BankTransaction.findOneAndUpdate(
    { externalId: id },
    {
      $setOnInsert: { externalId: id },
      $set: {
        bankCode: String(bankCode || ""),
        accountNumber: String(accountNumber || ""),
        tranAmt: amount,
        printedContent: String(printedContent || ""),
        depositCode,
        occurredAt: occurredAtDate,
        raw: raw ?? null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return doc;
}

export async function autoMatchBankTransactionsOnce({ limit = 200 } = {}) {
  const max = Math.min(500, Math.max(1, Number(limit) || 200));
  const txs = await BankTransaction.find({
    status: "NEW",
  })
    .sort({ occurredAt: 1, createdAt: 1, _id: 1 })
    .limit(max)
    .lean();

  const now = new Date();
  let scanned = 0;
  let matched = 0;

  for (const tx of txs) {
    scanned += 1;

    const printedContent = String(tx?.printedContent || "").trim();
    const tranAmt = Number(tx?.tranAmt || 0);
    if (!printedContent || !Number.isFinite(tranAmt) || tranAmt <= 0) continue;

    const txDepositCode = String(tx?.depositCode || "").trim();

    if (txDepositCode) {
      const order = await ChargeOrder.findOne({
        status: "PENDING",
        amountTotal: tranAmt,
        expiresAt: { $gt: now },
        bankTransactionId: null,
        depositCode: txDepositCode,
      })
        .select({
          _id: 1,
          businessAnchorId: 1,
          userId: 1,
          supplyAmount: 1,
          vatAmount: 1,
          amountTotal: 1,
        })
        .sort({ createdAt: -1, _id: -1 })
        .lean();

      if (order?._id) {
        const ok = await matchTxWithOrder({ tx, order }).catch(() => false);
        if (ok) matched += 1;
        continue;
      }
    }

    const candidates = await ChargeOrder.find({
      status: "PENDING",
      amountTotal: tranAmt,
      expiresAt: { $gt: now },
      bankTransactionId: null,
    })
      .select({
        _id: 1,
        businessAnchorId: 1,
        userId: 1,
        supplyAmount: 1,
        depositorName: 1,
        vatAmount: 1,
        amountTotal: 1,
      })
      .lean();

    let matchedOrder = null;
    for (const candidate of candidates) {
      const depositorName = String(candidate?.depositorName || "").trim();
      if (!depositorName) continue;
      const pattern = new RegExp(`(^|\\D)${depositorName}(\\D|$)`);
      if (pattern.test(printedContent)) {
        matchedOrder = candidate;
        break;
      }
    }

    if (!matchedOrder) continue;

    const ok = await matchTxWithOrder({ tx, order: matchedOrder }).catch(
      () => false,
    );
    if (ok) matched += 1;
  }

  return { scanned, matched };
}

async function matchTxWithOrder({ tx, order }) {
  const session = await mongoose.startSession();
  let autoCreatedDraftId = null;

  try {
    const result = await session.withTransaction(async () => {
      const updatedTx = await BankTransaction.updateOne(
        { _id: tx._id, status: "NEW", chargeOrderId: null },
        {
          $set: {
            status: "MATCHED",
            chargeOrderId: order._id,
            matchedAt: new Date(),
            matchedBy: "AUTO",
          },
        },
        { session },
      );

      if (!updatedTx?.modifiedCount) return false;

      const updatedOrder = await ChargeOrder.updateOne(
        { _id: order._id, status: "PENDING", bankTransactionId: null },
        {
          $set: {
            status: "MATCHED",
            bankTransactionId: tx._id,
            matchedAt: new Date(),
            matchedBy: "AUTO",
            adminApprovalStatus: "APPROVED",
            adminApprovalAt: new Date(),
            adminApprovalBy: null,
          },
        },
        { session },
      );

      if (!updatedOrder?.modifiedCount) {
        throw new Error("ChargeOrder update failed");
      }

      // 크레딧 즉시 충전
      const uniqueKey = `bplan:bankTx:${String(tx._id)}:charge`;
      const creditLedgerResult = await CreditLedger.updateOne(
        { uniqueKey },
        {
          $setOnInsert: {
            businessAnchorId: order.businessAnchorId || null,
            userId: order.userId,
            type: "CHARGE",
            amount: Number(order.supplyAmount),
            refType: "CHARGE_ORDER",
            refId: order._id,
            uniqueKey,
          },
        },
        { upsert: true, session },
      );

      if (creditLedgerResult?.upsertedCount) {
        await emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: order.businessAnchorId,
          balanceDelta: Number(order.supplyAmount),
          reason: "bplan_auto_charge",
          refId: order._id,
        });
      }

      // 세금계산서 Draft 생성 (APPROVED 상태 → 자동발행 큐잉)
      const existingDraft = await TaxInvoiceDraft.findOne(
        { chargeOrderId: order._id },
        null,
        { session },
      );
      if (!existingDraft) {
        const org = await BusinessAnchor.findById(order.businessAnchorId)
          .select({
            "metadata.businessNumber": 1,
            "metadata.companyName": 1,
            "metadata.representativeName": 1,
            "metadata.address": 1,
            "metadata.businessType": 1,
            "metadata.businessItem": 1,
            "metadata.email": 1,
            "metadata.phoneNumber": 1,
          })
          .lean({ session });

        const [createdDraft] = await TaxInvoiceDraft.create(
          [
            {
              chargeOrderId: order._id,
              businessAnchorId: order.businessAnchorId,
              status: "APPROVED",
              supplyAmount: Number(order.supplyAmount),
              vatAmount: Number(order.vatAmount || 0),
              totalAmount: Number(order.amountTotal || 0),
              buyer: {
                bizNo: org?.extracted?.businessNumber || "",
                corpName: org?.extracted?.companyName || "",
                ceoName: org?.extracted?.representativeName || "",
                addr: org?.extracted?.address || "",
                bizType: org?.extracted?.businessType || "",
                bizClass: org?.extracted?.businessItem || "",
                contactEmail: org?.extracted?.email || "",
                contactTel: org?.extracted?.phoneNumber || "",
                contactName: org?.extracted?.representativeName || "",
              },
            },
          ],
          { session },
        );
        autoCreatedDraftId = createdDraft?._id ?? null;
      }

      return true;
    });

    // 트랜잭션 성공 후: 새로 생성된 APPROVED 드래프트를 발행 큐에 자동 등록
    if (result && autoCreatedDraftId) {
      const corpNum = process.env.POPBILL_CORP_NUM || "";
      if (corpNum) {
        enqueueTaxInvoiceIssue({
          draftId: String(autoCreatedDraftId),
          corpNum,
          priority: 5,
        }).catch((err) => {
          console.error(
            "[autoMatch] enqueueTaxInvoiceIssue 실패:",
            err.message,
          );
        });
      }
    }

    return result;
  } finally {
    session.endSession();
  }
}
