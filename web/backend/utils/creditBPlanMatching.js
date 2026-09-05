// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/admin/adminSms.controller.js
// - web/backend/models/adminSmsTemplate.model.js
import mongoose from "mongoose";
import ChargeOrder from "../models/chargeOrder.model.js";
import StoreOrder from "../models/storeOrder.model.js";
import BankTransaction from "../models/bankTransaction.model.js";
import User from "../models/user.model.js";
import AdminSmsTemplate from "../models/adminSmsTemplate.model.js";

import { postGeneralLedgerJournal } from "../services/generalLedger.service.js";
import { finalizeStoreSale } from "../services/storeSale.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "./creditRealtime.js";
import {
  sendPopbillKakaoATS,
  sendPopbillXMS,
} from "./popbill.util.js";

function fillSmsTemplate(body, vars) {
  return String(body || "").replace(/#\{([^}]+)\}/g, (_, key) => {
    const v = vars[String(key || "").trim()];
    return v != null && String(v) !== "" ? String(v) : "";
  });
}

function pickNotifyPhone(...candidates) {
  for (const raw of candidates) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length >= 10) return digits;
  }
  return "";
}

/** 입금 매칭 후 거래 선수금 반영 안내(알림톡 우선, 실패 시 문자). 발송 실패는 충전을 막지 않는다. */
export async function notifyChargePrepaidApplied({
  userId,
  businessAnchorId,
  amount,
} = {}) {
  try {
    const tpl = await AdminSmsTemplate.findOne({
      code: "ats_credit_charged",
      active: true,
    }).lean();
    if (!tpl?.body) return;

    const [user, org] = await Promise.all([
      userId
        ? User.findById(userId)
            .select({ phoneNumber: 1, phone: 1, name: 1 })
            .lean()
        : null,
      businessAnchorId
        ? BusinessAnchor.findById(businessAnchorId)
            .select({
              "metadata.companyName": 1,
              "metadata.phoneNumber": 1,
            })
            .lean()
        : null,
    ]);

    const phone = pickNotifyPhone(
      user?.phoneNumber,
      user?.phone,
      org?.metadata?.phoneNumber,
    );
    if (!phone) return;

    const companyName =
      String(org?.metadata?.companyName || "").trim() ||
      String(user?.name || "").trim() ||
      "고객";
    const amountLabel = Number(amount || 0).toLocaleString("ko-KR");
    const content = fillSmsTemplate(tpl.body, {
      사업자명: companyName,
      입금금액: amountLabel,
      이름: String(user?.name || companyName),
    }).trim();
    if (!content) return;

    const items = [{ phone, content, name: companyName }];
    const kakaoCode = String(tpl.kakaoTemplateCode || "").trim();
    if (kakaoCode) {
      try {
        await sendPopbillKakaoATS({ items, templateCode: kakaoCode });
        return;
      } catch (err) {
        console.error(
          "[chargePrepaidNotify] kakao failed, fallback XMS:",
          err?.message || err,
        );
      }
    }
    await sendPopbillXMS({
      items,
      subject: "거래 선수금",
    });
  } catch (err) {
    console.error("[chargePrepaidNotify] failed:", err?.message || err);
  }
}

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
        const ok = await matchTxWithOrder({ tx, order }).catch((err) => {
          console.error(
            "[autoMatch] depositCode match failed:",
            err?.message || err,
          );
          return false;
        });
        if (ok) matched += 1;
        continue;
      }

      const storeOrder = await StoreOrder.findOne({
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

      if (storeOrder?._id) {
        const ok = await matchTxWithStoreOrder({
          tx,
          order: storeOrder,
        }).catch((err) => {
          console.error(
            "[autoMatch] store depositCode match failed:",
            err?.message || err,
          );
          return false;
        });
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

    if (matchedOrder) {
      const ok = await matchTxWithOrder({ tx, order: matchedOrder }).catch(
        (err) => {
          console.error(
            "[autoMatch] depositorName match failed:",
            err?.message || err,
          );
          return false;
        },
      );
      if (ok) matched += 1;
      continue;
    }

    const storeCandidates = await StoreOrder.find({
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

    let matchedStore = null;
    for (const candidate of storeCandidates) {
      const depositorName = String(candidate?.depositorName || "").trim();
      if (!depositorName) continue;
      const pattern = new RegExp(`(^|\\D)${depositorName}(\\D|$)`);
      if (pattern.test(printedContent)) {
        matchedStore = candidate;
        break;
      }
    }

    if (!matchedStore) continue;

    const ok = await matchTxWithStoreOrder({
      tx,
      order: matchedStore,
    }).catch((err) => {
      console.error(
        "[autoMatch] store depositorName match failed:",
        err?.message || err,
      );
      return false;
    });
    if (ok) matched += 1;
  }

  return { scanned, matched };
}

async function matchTxWithStoreOrder({ tx, order }) {
  const session = await mongoose.startSession();
  let matched = false;
  try {
    matched = await session.withTransaction(async () => {
      const updatedTx = await BankTransaction.updateOne(
        {
          _id: tx._id,
          status: "NEW",
          chargeOrderId: null,
          storeOrderId: null,
        },
        {
          $set: {
            status: "MATCHED",
            storeOrderId: order._id,
            matchedAt: new Date(),
            matchedBy: "AUTO",
          },
        },
        { session },
      );

      if (!updatedTx?.modifiedCount) return false;

      const updatedOrder = await StoreOrder.updateOne(
        { _id: order._id, status: "PENDING", bankTransactionId: null },
        {
          $set: {
            status: "MATCHED",
            bankTransactionId: tx._id,
            matchedAt: new Date(),
            matchedBy: "AUTO",
          },
        },
        { session },
      );

      if (!updatedOrder?.modifiedCount) {
        throw new Error("StoreOrder update failed");
      }

      return true;
    });
  } finally {
    session.endSession();
  }

  if (matched) {
    await finalizeStoreSale({
      orderId: order._id,
      bankTransactionId: tx._id,
      matchedBy: "AUTO",
      issueInline: false,
    });
  }

  return matched;
}

async function matchTxWithOrder({ tx, order }) {
  const session = await mongoose.startSession();
  let matchedChargeDelta = 0;

  try {
    const result = await session.withTransaction(async () => {
      const updatedTx = await BankTransaction.updateOne(
        { _id: tx._id, status: "NEW", chargeOrderId: null, storeOrderId: null },
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

      // SSOT GL: CHARGE_PAID journal posting + snapshot increment
      const normalizedSupplyAmount = Math.max(
        0,
        Math.round(Number(order.supplyAmount || 0)),
      );
      if (normalizedSupplyAmount > 0) {
        const glResult = await postGeneralLedgerJournal({
          idempotencyKey: `gl:bplan:chargeOrder:${String(order._id)}:charge`,
          eventType: "CHARGE_PAID",
          businessAnchorId: order.businessAnchorId,
          refType: "CHARGE_ORDER",
          refId: order._id,
          createdBy: order.userId || null,
          meta: {
            chargeOrderId: String(order._id),
            bankTransactionId: String(tx._id),
            source: "bplan_auto_match",
          },
          lines: [
            {
              accountCode: "REQ_PAID_CREDIT",
              ownerRole: "requestor",
              ownerId: order.businessAnchorId,
              amount: normalizedSupplyAmount,
              amountExcludingVat: normalizedSupplyAmount,
              vatAmount: 0,
              amountIncludingVat: normalizedSupplyAmount,
              creditKind: "PAID",
              refType: "CHARGE_ORDER",
              refId: order._id,
            },
          ],
          session,
        });

        if (glResult?.posted) {
          matchedChargeDelta = normalizedSupplyAmount;
        }
      }

      // 충전(선수금) 시점에는 (세금)계산서를 발행하지 않음. 사용분 월말 합산.

      return true;
    });

    // 트랜잭션 성공 후: 크레딧 변동 실시간 이벤트 발행
    if (result && matchedChargeDelta > 0) {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: order.businessAnchorId,
        balanceDelta: matchedChargeDelta,
        reason: "bplan_auto_charge",
        refId: order._id,
      });
      const { exitDemoModeAfterPaidCreditGrant } = await import(
        "../controllers/businesses/business.demoMode.util.js"
      );
      await exitDemoModeAfterPaidCreditGrant({
        businessAnchorId: order.businessAnchorId,
        userId: order.userId || null,
        reason: "유료 크레딧 입금",
      });
      notifyChargePrepaidApplied({
        userId: order.userId,
        businessAnchorId: order.businessAnchorId,
        amount: Number(order.amountTotal || matchedChargeDelta || 0),
      }).catch((err) => {
        console.error("[autoMatch] charge prepaid notify failed:", err?.message || err);
      });
    }

    return result;
  } finally {
    session.endSession();
  }
}
