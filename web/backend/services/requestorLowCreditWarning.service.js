// related files:
// - web/backend/controllers/credits/credit.controller.js
// - web/backend/services/creditBalance.service.js
// - web/backend/utils/practiceObBeta.util.js
// - web/frontend/src/shared/credits/RequestorLowCreditWarning.tsx
//
// 최근 충전(유료·무료)의 1/4 이하로 주문 가능 크레딧이 남으면 의뢰 화면 경고.
// 기공크레딧(정산 적립)은 주문 보류에 쓰지 않으므로 남은 금액에 넣지 않는다.

import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { getBusinessCreditBalanceSnapshot } from "./creditBalance.service.js";
import { resolveLabCustomAbutmentCreditHoldPolicy } from "../utils/practiceObBeta.util.js";

const CHARGE_EVENT_TYPES = [
  "CHARGE_PAID",
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
];

const CHARGE_ACCOUNT_CODES = [
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
];

export function orderableCreditForLowWarning(
  balance,
  { freeCreditOnly = false } = {},
) {
  const paid = Math.max(0, Math.round(Number(balance?.paidCredit) || 0));
  const freeRequest = Math.max(
    0,
    Math.round(Number(balance?.freeRequestCredit) || 0),
  );
  const freeShipping = Math.max(
    0,
    Math.round(Number(balance?.freeShippingCredit) || 0),
  );
  if (freeCreditOnly) return freeRequest + freeShipping;
  return paid + freeRequest + freeShipping;
}

/** 남은 주문 크레딧이 최근 충전액의 1/4 이하이면 경고. 충전 이력이 없으면 끈다. */
export function evaluateLowCreditWarning({
  orderableCredit = 0,
  lastChargeAmount = 0,
} = {}) {
  const orderable = Math.max(0, Math.round(Number(orderableCredit) || 0));
  const last = Math.max(0, Math.round(Number(lastChargeAmount) || 0));
  const thresholdAmount = last > 0 ? Math.floor(last / 4) : 0;
  return {
    active: last > 0 && orderable <= thresholdAmount,
    orderableCredit: orderable,
    lastChargeAmount: last,
    thresholdAmount,
  };
}

export async function findLastRequestorCreditCharge(businessAnchorId) {
  const anchorId = String(businessAnchorId || "").trim();
  if (!anchorId) return null;
  const journal = await LedgerJournal.findOne({
    businessAnchorId: anchorId,
    eventType: { $in: CHARGE_EVENT_TYPES },
  })
    .sort({ occurredAt: -1, _id: -1 })
    .select({ journalId: 1, eventType: 1, occurredAt: 1 })
    .lean();
  const journalId = String(journal?.journalId || "").trim();
  if (!journalId) return null;

  const lines = await LedgerLine.find({
    journalId,
    ownerRole: "requestor",
    accountCode: { $in: CHARGE_ACCOUNT_CODES },
  })
    .select({ amountExcludingVat: 1, amount: 1 })
    .lean();
  const amount = (lines || []).reduce((sum, line) => {
    const value = Number(line?.amountExcludingVat ?? line?.amount ?? 0);
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
  if (!(amount > 0)) return null;
  return {
    journalId,
    eventType: String(journal.eventType || ""),
    occurredAt: journal.occurredAt || null,
    amount: Math.round(amount),
  };
}

export async function resolveRequestorLowCreditWarning(businessAnchorId) {
  const anchorId = String(businessAnchorId || "").trim();
  const empty = {
    active: false,
    orderableCredit: 0,
    lastChargeAmount: 0,
    lastChargeJournalId: null,
    lastChargeAt: null,
    thresholdAmount: 0,
  };
  if (!anchorId) return empty;

  const [snapshot, lastCharge, policy] = await Promise.all([
    getBusinessCreditBalanceSnapshot({
      businessAnchorId: anchorId,
      upsertIfMissing: false,
    }),
    findLastRequestorCreditCharge(anchorId),
    resolveLabCustomAbutmentCreditHoldPolicy(anchorId),
  ]);
  const evaluated = evaluateLowCreditWarning({
    orderableCredit: orderableCreditForLowWarning(snapshot, {
      freeCreditOnly: Boolean(policy?.freeCreditOnly),
    }),
    lastChargeAmount: lastCharge?.amount || 0,
  });
  return {
    ...evaluated,
    lastChargeJournalId: lastCharge?.journalId || null,
    lastChargeAt: lastCharge?.occurredAt || null,
  };
}
