// related files:
// - web/backend/jobs/fmDentalShippingBillingWorker.js
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/backend/models/ledgerJournal.model.js
// change-log:
// - 2026-10-13: 딜러 거래처는 적립에서 빼지 않는다. 적립 총액을 입금하고, 딜러사가 딜리버리 회사에 직접 입금한다. 기존 차감 저널은 삭제.
// - 2026-10-08: 월 의뢰 2건 이하 거래처는 배송업체 무료 → 원가 미기록.
// - 2026-10-08: 딜리버리 월정액(거래처 1곳당 55,000원 VAT 포함)은 딜러 부담(딜러 정산에서 차감). 딜러 없으면 어벗츠 부담.
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { DELIVERY_FREE_MAX_MONTHLY_REQUESTS, DELIVERY_MONTHLY_FEE } from "../utils/requestorUnitPricePolicy.js";
import {
  deleteGeneralLedgerCommitJournal,
  postGeneralLedgerJournal,
} from "./generalLedger.service.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";

const VAT_RATE = 0.1;

/** @returns {{ startYmd: string, endYmd: string, ym: string, start: Date, end: Date }} 직전 달(KST). */
export function resolvePreviousMonthKst(todayYmd = getTodayYmdInKst()) {
  const [y, m] = String(todayYmd).split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const ym = `${py}-${String(pm).padStart(2, "0")}`;
  const startYmd = `${ym}-01`;
  const endYmd = `${y}-${String(m).padStart(2, "0")}-01`;
  return {
    ym,
    startYmd,
    endYmd,
    start: new Date(`${startYmd}T00:00:00+09:00`),
    end: new Date(`${endYmd}T00:00:00+09:00`),
  };
}

/** 직판만 어벗츠가 부담한다. 딜러 거래처는 적립에서 빼지 않는다. */
export function buildDeliveryMonthlyCostLines({ adminAnchorId, customerAnchorId, ym }) {
  const gross = DELIVERY_MONTHLY_FEE;
  const supply = Math.round(gross / (1 + VAT_RATE));
  const vat = gross - supply;
  const meta = { displayKind: "delivery_monthly_cost", displayLabel: "딜리버리 월정액", ym, customerAnchorId: String(customerAnchorId) };
  return [{
    accountCode: "REV_ADMIN",
    ownerRole: "admin",
    ownerId: String(adminAnchorId),
    amount: -gross,
    amountExcludingVat: -supply,
    vatAmount: -vat,
    amountIncludingVat: -gross,
    creditKind: null,
    refType: "DELIVERY_MONTHLY",
    refId: String(customerAnchorId),
    meta,
  }];
}

/**
 * 예전에 딜러 적립에서 뺀 딜리버리 월정액 저널을 지운다.
 * 지우면 미지급 잔액이 적립 총액으로 돌아간다.
 */
export async function voidDealerDeliveryMonthlyDeductions() {
  const [byLine, byMeta] = await Promise.all([
    LedgerLine.find({ accountCode: "REV_SALESMAN", refType: "DELIVERY_MONTHLY" })
      .select({ journalId: 1 })
      .lean(),
    LedgerJournal.find({
      eventType: "DELIVERY_MONTHLY_COST",
      "meta.dealerAnchorId": { $nin: [null, ""] },
    })
      .select({ journalId: 1 })
      .lean(),
  ]);
  const ids = [
    ...new Set(
      [...byLine, ...byMeta]
        .map((row) => String(row.journalId || "").trim())
        .filter(Boolean),
    ),
  ];
  let voided = 0;
  for (const journalId of ids) {
    const res = await deleteGeneralLedgerCommitJournal({
      journalId,
      expectedEventTypes: ["DELIVERY_MONTHLY_COST"],
    });
    if (res?.deleted) voided += 1;
  }
  return voided;
}

/** 직전 달 의뢰 건수가 무료 구간(2건 이하)이면 월정액 원가가 없다. */
export function isDeliveryMonthlyCostBillable(monthlyRequestCount) {
  return Math.floor(Number(monthlyRequestCount) || 0) > DELIVERY_FREE_MAX_MONTHLY_REQUESTS;
}

/**
 * 직전 달에 의뢰가 3건 이상이었던 직판 거래처마다 월정액 1회(2건 이하는 배송업체 무료). 멱등키=거래처+월.
 * 딜러 거래처는 저널을 쓰지 않는다. 적립 총액을 입금하고, 딜러사가 딜리버리 회사에 직접 입금한다.
 * dryRun=true이면 저널을 쓰지 않고 대상만 센다.
 */
export async function processDeliveryMonthlyCosts({ now = new Date(), dryRun = false } = {}) {
  const prev = resolvePreviousMonthKst(getTodayYmdInKst(now));
  const voided = dryRun ? 0 : await voidDealerDeliveryMonthlyDeductions();
  const admin = await BusinessAnchor.findOne({ businessType: "admin", status: { $ne: "merged" } })
    .select({ _id: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  if (!admin?._id) {
    return { ym: prev.ym, customers: 0, billable: 0, dealerDirect: 0, posted: 0, voided, reason: "no_admin_anchor" };
  }

  const counts = await Request.aggregate([
    {
      $match: {
        createdAt: { $gte: prev.start, $lt: prev.end },
        manufacturerStage: { $ne: "취소" },
        businessAnchorId: { $ne: null },
      },
    },
    { $group: { _id: "$businessAnchorId", n: { $sum: 1 } } },
  ]);
  const billableIds = counts.filter((c) => isDeliveryMonthlyCostBillable(c.n)).map((c) => c._id);
  if (!billableIds.length) {
    return { ym: prev.ym, customers: counts.length, billable: 0, dealerDirect: 0, posted: 0, voided };
  }

  const anchors = await BusinessAnchor.find({ _id: { $in: billableIds }, businessType: "requestor" })
    .select({ _id: 1, referredByAnchorId: 1 })
    .lean();
  const refIds = anchors.map((a) => a.referredByAnchorId).filter((v) => v && Types.ObjectId.isValid(String(v)));
  const dealers = refIds.length
    ? await BusinessAnchor.find({ _id: { $in: refIds }, businessType: "salesman" }).select({ _id: 1 }).lean()
    : [];
  const dealerSet = new Set(dealers.map((d) => String(d._id)));

  let posted = 0;
  let dealerDirect = 0;
  for (const a of anchors) {
    const dealerId = a.referredByAnchorId && dealerSet.has(String(a.referredByAnchorId)) ? a.referredByAnchorId : null;
    if (dealerId) {
      dealerDirect += 1;
      continue;
    }
    if (dryRun) continue;
    const res = await postGeneralLedgerJournal({
      idempotencyKey: `delivery_monthly:${String(a._id)}:${prev.ym}`,
      eventType: "DELIVERY_MONTHLY_COST",
      businessAnchorId: admin._id,
      refType: "DELIVERY_MONTHLY",
      refId: String(a._id),
      occurredAt: prev.end,
      meta: { ym: prev.ym, customerAnchorId: String(a._id), dealerAnchorId: null },
      lines: buildDeliveryMonthlyCostLines({
        adminAnchorId: admin._id,
        customerAnchorId: a._id,
        ym: prev.ym,
      }),
    });
    if (res?.posted) posted += 1;
  }
  return { ym: prev.ym, customers: counts.length, billable: anchors.length, dealerDirect, posted, voided };
}
