// related files:
// - web/backend/jobs/fmDentalShippingBillingWorker.js
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/backend/models/ledgerJournal.model.js
// change-log:
// - 2026-10-08: 월 의뢰 2건 이하 거래처는 배송업체 무료 → 원가 미기록.
// - 2026-10-08: 딜리버리 월정액(거래처 1곳당 55,000원 VAT 포함)은 딜러 부담(딜러 정산에서 차감). 딜러 없으면 어벗츠 부담.
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { DELIVERY_FREE_MAX_MONTHLY_REQUESTS, DELIVERY_MONTHLY_FEE } from "../utils/requestorUnitPricePolicy.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
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

export function buildDeliveryMonthlyCostLines({ dealerAnchorId, adminAnchorId, customerAnchorId, ym }) {
  const gross = DELIVERY_MONTHLY_FEE;
  const supply = Math.round(gross / (1 + VAT_RATE));
  const vat = gross - supply;
  const meta = { displayKind: "delivery_monthly_cost", displayLabel: "딜리버리 월정액", ym, customerAnchorId: String(customerAnchorId) };
  const line = (accountCode, ownerRole, ownerId, sign) => ({
    accountCode,
    ownerRole,
    ownerId: String(ownerId),
    amount: sign * gross,
    amountExcludingVat: sign * supply,
    vatAmount: sign * vat,
    amountIncludingVat: sign * gross,
    creditKind: null,
    refType: "DELIVERY_MONTHLY",
    refId: String(customerAnchorId),
    meta,
  });
  if (dealerAnchorId) {
    // 딜러 정산 차감 + 어벗츠 환입(어벗츠가 딜리버리사에 선지급).
    return [
      line("REV_SALESMAN", "salesman", dealerAnchorId, -1),
      line("REV_ADMIN", "admin", adminAnchorId, +1),
    ];
  }
  // 직판: 어벗츠 부담.
  return [line("REV_ADMIN", "admin", adminAnchorId, -1)];
}

/** 직전 달 의뢰 건수가 무료 구간(2건 이하)이면 월정액 원가가 없다. */
export function isDeliveryMonthlyCostBillable(monthlyRequestCount) {
  return Math.floor(Number(monthlyRequestCount) || 0) > DELIVERY_FREE_MAX_MONTHLY_REQUESTS;
}

/**
 * 직전 달에 의뢰가 3건 이상이었던 거래처마다 월정액 1회(2건 이하는 배송업체 무료). 멱등키=거래처+월.
 * dryRun=true이면 저널을 쓰지 않고 대상만 센다.
 */
export async function processDeliveryMonthlyCosts({ now = new Date(), dryRun = false } = {}) {
  const prev = resolvePreviousMonthKst(getTodayYmdInKst(now));
  const admin = await BusinessAnchor.findOne({ businessType: "admin", status: { $ne: "merged" } })
    .select({ _id: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  if (!admin?._id) return { ym: prev.ym, customers: 0, billable: 0, posted: 0, reason: "no_admin_anchor" };

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
  if (!billableIds.length) return { ym: prev.ym, customers: counts.length, billable: 0, posted: 0 };

  const anchors = await BusinessAnchor.find({ _id: { $in: billableIds }, businessType: "requestor" })
    .select({ _id: 1, referredByAnchorId: 1 })
    .lean();
  const refIds = anchors.map((a) => a.referredByAnchorId).filter((v) => v && Types.ObjectId.isValid(String(v)));
  const dealers = refIds.length
    ? await BusinessAnchor.find({ _id: { $in: refIds }, businessType: "salesman" }).select({ _id: 1 }).lean()
    : [];
  const dealerSet = new Set(dealers.map((d) => String(d._id)));

  let posted = 0;
  for (const a of anchors) {
    if (dryRun) continue;
    const dealerId = a.referredByAnchorId && dealerSet.has(String(a.referredByAnchorId)) ? a.referredByAnchorId : null;
    const res = await postGeneralLedgerJournal({
      idempotencyKey: `delivery_monthly:${String(a._id)}:${prev.ym}`,
      eventType: "DELIVERY_MONTHLY_COST",
      businessAnchorId: dealerId || admin._id,
      refType: "DELIVERY_MONTHLY",
      refId: String(a._id),
      occurredAt: prev.end,
      meta: { ym: prev.ym, customerAnchorId: String(a._id), dealerAnchorId: dealerId ? String(dealerId) : null },
      lines: buildDeliveryMonthlyCostLines({
        dealerAnchorId: dealerId,
        adminAnchorId: admin._id,
        customerAnchorId: a._id,
        ym: prev.ym,
      }),
    });
    if (res?.posted) posted += 1;
  }
  return { ym: prev.ym, customers: counts.length, billable: anchors.length, posted };
}
