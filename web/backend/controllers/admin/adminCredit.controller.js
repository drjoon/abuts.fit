// related files:
// - web/backend/rules.md
// - web/backend/modules/admin/admin.routes.js

// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/services/creditBalance.service.js
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/shared/components/SalesmanLedgerModal.tsx
// - web/frontend/src/pages/admin/credits/hooks/useAdminCreditPage.ts
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

import ShippingPackage from "../../models/shippingPackage.model.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { Types } from "mongoose";
import {
  buildCreditLedgerRequestSummary,
  CREDIT_LEDGER_REQUEST_SELECT,
  mergeRequestExpressSurchargeIntoMachiningSpend,
  parseSpendKindFromUniqueKey,
} from "../credits/creditLedger.utils.js";
import { healMissingExpressSurchargesForBusiness } from "../requests/common.review.helpers.js";
import {
  getLast30DaysRangeUtc,
  getTodayMidnightUtcInKst,
  getTodayYmdInKst,
  getThisMonthStartYmdInKst,
} from "../../utils/krBusinessDays.js";
import AdminSalesmanCreditsOverviewSnapshot from "../../models/adminSalesmanCreditsOverviewSnapshot.model.js";
import { buildSalesmanReferralAggregation } from "./adminCredit.salesmanAggregation.js";

const REFERRAL_LEADER_ROLES = ["salesman", "devops"];

function normalizeNumber(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function buildPaidRequestEligibleLedgerStages() {
  return [
    {
      $lookup: {
        from: "requests",
        localField: "refId",
        foreignField: "_id",
        as: "_refRequest",
      },
    },
    {
      $addFields: {
        _requestPaidAmount: {
          $ifNull: [{ $arrayElemAt: ["$_refRequest.price.paidAmount", 0] }, 0],
        },
      },
    },
    {
      $match: {
        $or: [
          { refType: { $ne: "REQUEST" } },
          { _requestPaidAmount: { $gt: 0 } },
        ],
      },
    },
  ];
}

function buildRequestSummary(doc) {
  return buildCreditLedgerRequestSummary(doc);
}

function parseFreeCreditGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "").trim().replace(/^gl:/, "");
  const m = raw.match(/^free_credit_grant:([a-f0-9]{24})$/i);
  return m ? m[1] : "";
}

function parseYmd(ymd) {
  const parts = String(ymd || "")
    .split("-")
    .map((v) => Number(v));
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function kstMonthRangeUtc({ y, m }) {
  if (!y || !m) return null;
  const startKst = new Date(
    `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01T00:00:00.000+09:00`,
  );
  if (Number.isNaN(startKst.getTime())) return null;
  const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const nextStartKst = new Date(
    `${String(nextMonth.y).padStart(4, "0")}-${String(nextMonth.m).padStart(2, "0")}-01T00:00:00.000+09:00`,
  );
  if (Number.isNaN(nextStartKst.getTime())) return null;
  const start = startKst;
  const end = new Date(nextStartKst.getTime() - 1);
  return { start, end };
}

function getPeriodRangeUtcFromPeriodKey(periodKey) {
  const period = String(periodKey || "").trim();
  const now = new Date();
  const todayMidnight = getTodayMidnightUtcInKst(now);

  if (["7d", "30d", "90d"].includes(period)) {
    if (!todayMidnight) return null;
    if (period === "30d") {
      return getLast30DaysRangeUtc(now);
    }
    const days = period === "7d" ? 7 : 90;
    const end = new Date(todayMidnight.getTime() - 1);
    const start = new Date(
      todayMidnight.getTime() - days * 24 * 60 * 60 * 1000,
    );
    return { start, end };
  }

  if (period === "thisMonth") {
    const ymd = getThisMonthStartYmdInKst(now);
    const p = parseYmd(ymd);
    if (!p) return null;
    return kstMonthRangeUtc({ y: p.y, m: p.m });
  }

  if (period === "lastMonth") {
    const ymd = getThisMonthStartYmdInKst(now);
    const p = parseYmd(ymd);
    if (!p) return null;
    const prev = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
    return kstMonthRangeUtc(prev);
  }

  // fallback
  return getLast30DaysRangeUtc(now);
}

async function computeSalesmanOverviewSnapshot({ range, salesmanIds }) {
  const commissionRate = 0.1;

  const targetUsers = await User.find({ _id: { $in: salesmanIds } })
    .select({ _id: 1, role: 1, businessAnchorId: 1 })
    .lean();

  const roleAnchorPairs = (targetUsers || [])
    .map((u) => ({
      role: String(u?.role || "").trim(),
      anchorId: String(u?.businessAnchorId || "").trim(),
    }))
    .filter(
      (it) =>
        (it.role === "salesman" || it.role === "devops") &&
        Types.ObjectId.isValid(it.anchorId),
    );

  const matchOr = roleAnchorPairs.map((it) => ({
    ownerRole: it.role,
    ownerId: new Types.ObjectId(it.anchorId),
    accountCode: it.role === "devops" ? "REV_DEVOPS" : "REV_SALESMAN",
  }));

  const [ledgerPeriodRows, freePeriodRows] = matchOr.length
    ? await Promise.all([
        LedgerLine.aggregate([
          {
            $match: {
              $or: matchOr,
              occurredAt: { $gte: range.start, $lte: range.end },
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
            $addFields: {
              type: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                      then: "PAYOUT",
                    },
                    {
                      case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                      then: "ADJUST",
                    },
                  ],
                  default: "EARN",
                },
              },
              settlementEligible: {
                $or: [
                  { $eq: ["$type", "PAYOUT"] },
                  {
                    $and: [
                      { $in: ["$type", ["EARN", "ADJUST"]] },
                      {
                        $or: [
                          { $eq: ["$creditKind", "PAID"] },
                          { $eq: ["$creditKind", null] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $match: { settlementEligible: true } },
          {
            $group: {
              _id: "$type",
              total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
            },
          },
        ]),
        LedgerLine.aggregate([
          {
            $match: {
              $or: matchOr,
              occurredAt: { $gte: range.start, $lte: range.end },
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
            $addFields: {
              eventType: { $ifNull: ["$journalDoc.eventType", ""] },
              baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
            },
          },
          {
            $group: {
              _id: null,
              freeRequestAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$creditKind", "FREE_REQUEST"] },
                        { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                      ],
                    },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              freeRequestCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$creditKind", "FREE_REQUEST"] },
                        { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              freeShippingAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$creditKind", "FREE_SHIPPING"] },
                        { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                      ],
                    },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              freeShippingCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$creditKind", "FREE_SHIPPING"] },
                        { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
      ])
    : [[], []];

  let earnedAmount = 0;
  let paidOutAmount = 0;
  let adjustedAmount = 0;
  for (const r of ledgerPeriodRows || []) {
    const type = String(r?._id || "");
    const total = normalizeNumber(r?.total || 0);
    if (type === "EARN") earnedAmount += total;
    else if (type === "PAYOUT") paidOutAmount += total;
    else if (type === "ADJUST") adjustedAmount += total;
  }

  const balanceAmount = normalizeNumber(
    earnedAmount - paidOutAmount + adjustedAmount,
  );

  const { directOrgIdsBySalesmanId, revenueByOrgId } =
    await buildSalesmanReferralAggregation({
      salesmanIds,
      range,
    });

  let paidRevenueAmount = 0;
  let bonusRevenueAmount = 0;
  let orderCount = 0;
  let paidOrderCount = 0;
  for (const row of revenueByOrgId.values()) {
    const revenueAmount = Number(row.revenueAmount || 0);
    const bonusAmount = Number(row.bonusAmount || 0);
    const thisOrderCount = Number(row.orderCount || 0);
    paidRevenueAmount += revenueAmount;
    bonusRevenueAmount += bonusAmount;
    orderCount += thisOrderCount;
    if (revenueAmount > 0) paidOrderCount += thisOrderCount;
  }

  let directAmount = 0;
  for (const orgSet of directOrgIdsBySalesmanId.values()) {
    let rev = 0;
    for (const oid of orgSet) {
      rev += Number(revenueByOrgId.get(String(oid))?.revenueAmount || 0);
    }
    directAmount += rev * commissionRate;
  }

  const totalAmount = normalizeNumber(directAmount);

  const freeRequestAmount = normalizeNumber(Number(freePeriodRows?.[0]?.freeRequestAmount || 0));
  const freeRequestCount = normalizeNumber(Number(freePeriodRows?.[0]?.freeRequestCount || 0));
  const freeShippingAmount = normalizeNumber(Number(freePeriodRows?.[0]?.freeShippingAmount || 0));
  const freeShippingCount = normalizeNumber(Number(freePeriodRows?.[0]?.freeShippingCount || 0));
  const freeAmount = normalizeNumber(freeRequestAmount + freeShippingAmount);

  return {
    salesmenCount: salesmanIds.length,
    referral: {
      paidRevenueAmount: normalizeNumber(paidRevenueAmount),
      bonusRevenueAmount: normalizeNumber(bonusRevenueAmount),
      orderCount: normalizeNumber(orderCount),
      paidOrderCount: normalizeNumber(paidOrderCount),
    },
    commission: {
      totalAmount,
      amount: normalizeNumber(directAmount),
    },
    walletPeriod: {
      earnedAmount: normalizeNumber(earnedAmount),
      paidOutAmount: normalizeNumber(paidOutAmount),
      adjustedAmount: normalizeNumber(adjustedAmount),
      balanceAmount: normalizeNumber(balanceAmount),
      freeRequestAmount,
      freeRequestCount,
      freeShippingAmount,
      freeShippingCount,
      freeAmount,
    },
  };
}

export async function recalcAdminSalesmanCreditsOverviewSnapshot({
  periodKey = "30d",
} = {}) {
  const range = getPeriodRangeUtcFromPeriodKey(periodKey);
  if (!range) return null;

  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  const salesmen = await User.find({
    role: { $in: REFERRAL_LEADER_ROLES },
    active: true,
  })
    .select({ _id: 1 })
    .lean();
  const salesmanIds = (salesmen || [])
    .map((s) => String(s?._id || ""))
    .filter(Boolean)
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const overview = await computeSalesmanOverviewSnapshot({
    range,
    salesmanIds,
  });

  const payload = {
    ymd,
    periodKey,
    rangeStartUtc: range.start,
    rangeEndUtc: range.end,
    salesmenCount: normalizeNumber(overview.salesmenCount || 0),
    referral: {
      paidRevenueAmount: normalizeNumber(overview?.referral?.paidRevenueAmount),
      bonusRevenueAmount: normalizeNumber(
        overview?.referral?.bonusRevenueAmount,
      ),
      orderCount: normalizeNumber(overview?.referral?.orderCount),
      paidOrderCount: normalizeNumber(overview?.referral?.paidOrderCount),
    },
    commission: {
      totalAmount: normalizeNumber(overview?.commission?.totalAmount),
      amount: normalizeNumber(
        overview?.commission?.amount ?? overview?.commission?.totalAmount,
      ),
    },
    walletPeriod: {
      earnedAmount: normalizeNumber(overview?.walletPeriod?.earnedAmount),
      paidOutAmount: normalizeNumber(overview?.walletPeriod?.paidOutAmount),
      adjustedAmount: normalizeNumber(overview?.walletPeriod?.adjustedAmount),
      balanceAmount: normalizeNumber(overview?.walletPeriod?.balanceAmount),
      freeRequestAmount: normalizeNumber(overview?.walletPeriod?.freeRequestAmount),
      freeRequestCount: normalizeNumber(overview?.walletPeriod?.freeRequestCount),
      freeShippingAmount: normalizeNumber(overview?.walletPeriod?.freeShippingAmount),
      freeShippingCount: normalizeNumber(overview?.walletPeriod?.freeShippingCount),
      freeAmount: normalizeNumber(overview?.walletPeriod?.freeAmount),
    },
    computedAt: new Date(),
  };

  await AdminSalesmanCreditsOverviewSnapshot.updateOne(
    { ymd, periodKey },
    { $set: payload },
    { upsert: true },
  );

  return payload;
}

export async function adminGetSalesmanCreditsOverview(req, res) {
  try {
    const periodKey = String(req.query.period || "30d").trim() || "30d";

    const payload = await recalcAdminSalesmanCreditsOverviewSnapshot({
      periodKey,
    });
    if (!payload) {
      return res.status(500).json({
        success: false,
        message: "영업자 크레딧 요약 조회에 실패했습니다.",
      });
    }

    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    console.error("adminGetSalesmanCreditsOverview error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 크레딧 요약 조회에 실패했습니다.",
    });
  }
}

export async function adminGetBusinessLedger(req, res) {
  try {
    const orgIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(orgIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "사업자 ID가 올바르지 않습니다.",
      });
    }
    const businessAnchorId = new Types.ObjectId(orgIdRaw);

    const typeRaw = String(req.query.type || "")
      .trim()
      .toUpperCase();
    const periodRaw = String(req.query.period || "").trim();
    const qRaw = String(req.query.q || "").trim();

    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(req.query.pageSize || 50) || 50),
    );

    try {
      await healMissingExpressSurchargesForBusiness({
        businessAnchorId,
        actorUserId: req.user?._id || null,
        limit: 30,
      });
    } catch (healErr) {
      console.error("[ADMIN_CREDIT_LEDGER] healMissingExpressSurcharges failed", {
        businessAnchorId: String(businessAnchorId),
        message: healErr?.message || String(healErr || ""),
      });
    }

    const balanceSnapshot = await getBusinessCreditBalanceSnapshot({
      businessAnchorId,
      upsertIfMissing: true,
    });

    const currentBalanceSnapshot = {
      balance: Number(balanceSnapshot?.balance || 0),
      paidCredit: Number(balanceSnapshot?.paidCredit || 0),
      freeRequestCredit: Number(balanceSnapshot?.freeRequestCredit || 0),
      freeShippingCredit: Number(balanceSnapshot?.freeShippingCredit || 0),
      updatedAt: balanceSnapshot?.updatedAt || null,
    };

    const match = {
      ownerRole: "requestor",
      ownerId: businessAnchorId,
      accountCode: {
        $in: [
          "REQ_PAID_CREDIT",
          "REQ_FREE_REQUEST_CREDIT",
          "REQ_FREE_SHIPPING_CREDIT",
        ],
      },
    };

    const occurredAt = {};
    const sinceFromPeriod = parsePeriod(periodRaw);
    if (sinceFromPeriod) {
      occurredAt.$gte = sinceFromPeriod;
    }

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    if (fromRaw) {
      const from = new Date(fromRaw);
      if (!Number.isNaN(from.getTime())) occurredAt.$gte = from;
    }
    if (toRaw) {
      const to = new Date(toRaw);
      if (!Number.isNaN(to.getTime())) occurredAt.$lte = to;
    }

    if (Object.keys(occurredAt).length) {
      match.occurredAt = occurredAt;
    }

    const pipeline = [
      { $match: match },
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
        $addFields: {
          eventType: { $ifNull: ["$journalDoc.eventType", ""] },
          amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
          mergedUniqueKey: {
            $concat: [
              "gl:",
              {
                $ifNull: [
                  "$journalDoc.meta.spendUniqueKey",
                  { $ifNull: ["$journalDoc.idempotencyKey", "$journalId"] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$journalId",
          occurredAt: { $max: "$occurredAt" },
          createdAt: { $max: "$createdAt" },
          eventType: { $first: "$eventType" },
          refType: { $first: "$refType" },
          refId: { $first: "$refId" },
          uniqueKey: { $first: "$mergedUniqueKey" },
          amount: { $sum: "$amountBase" },
          spentPaidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                      ],
                    },
                    { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                    { $lt: ["$amountBase", 0] },
                  ],
                },
                { $abs: "$amountBase" },
                0,
              ],
            },
          },
          spentFreeAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                      ],
                    },
                    {
                      $in: [
                        "$accountCode",
                        ["REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"],
                      ],
                    },
                    { $lt: ["$amountBase", 0] },
                  ],
                },
                { $abs: "$amountBase" },
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$eventType", "CHARGE_PAID"] },
                  then: "CHARGE_PAID",
                },
                {
                  case: { $eq: ["$eventType", "CHARGE_FREE_REQUEST"] },
                  then: "CHARGE_FREE_REQUEST",
                },
                {
                  case: { $eq: ["$eventType", "CHARGE_FREE_SHIPPING"] },
                  then: "CHARGE_FREE_SHIPPING",
                },
                {
                  case: {
                    $and: [
                      {
                        $in: [
                          "$eventType",
                          ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                        ],
                      },
                      { $gt: ["$spentPaidAmount", 0] },
                    ],
                  },
                  then: "SPEND_PAID",
                },
                {
                  case: { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                  then: "SPEND_FREE_REQUEST",
                },
                {
                  case: { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                  then: "SPEND_FREE_SHIPPING",
                },
                {
                  case: { $eq: ["$eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "ADJUST",
            },
          },
        },
      },
    ];

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      [
        "CHARGE_PAID",
        "CHARGE_FREE_REQUEST",
        "CHARGE_FREE_SHIPPING",
        "SPEND_PAID",
        "SPEND_FREE_REQUEST",
        "SPEND_FREE_SHIPPING",
        "ADJUST",
      ].includes(typeRaw)
    ) {
      pipeline.push({ $match: { type: typeRaw } });
    }

    if (qRaw) {
      const rx = safeRegex(qRaw);
      const ors = [];
      if (rx) {
        ors.push({ uniqueKey: rx });
        ors.push({ refType: rx });
      }
      if (Types.ObjectId.isValid(qRaw)) {
        ors.push({ refId: new Types.ObjectId(qRaw) });
      }
      if (ors.length) {
        pipeline.push({ $match: { $or: ors } });
      }
    }

    pipeline.push({ $sort: { occurredAt: -1, _id: -1 } });

    const allRowsRaw = await LedgerLine.aggregate(pipeline);
    const allRows = mergeRequestExpressSurchargeIntoMachiningSpend(allRowsRaw);
    const total = Array.isArray(allRows) ? allRows.length : 0;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;

    let runningBalance = Number(currentBalanceSnapshot.balance || 0);
    let skippedSum = 0;
    for (const r of allRows.slice(0, startIdx)) {
      skippedSum += Number(r?.amount || 0);
    }
    runningBalance -= skippedSum;

    const items = allRows.slice(startIdx, endIdx).map((r) => {
      const balanceAfter = runningBalance;
      runningBalance -= Number(r?.amount || 0);
      const uniqueKey = String(r?.uniqueKey || "");
      return {
        _id: String(r?._id || ""),
        type: String(r?.type || "ADJUST"),
        amount: Number(r?.amount || 0),
        spentPaidAmount: Number(r?.spentPaidAmount || 0),
        spentFreeAmount: Number(r?.spentFreeAmount || 0),
        refType: String(r?.refType || ""),
        refId: r?.refId ? String(r.refId) : null,
        uniqueKey,
        spendKind:
          r?.spendKind || parseSpendKindFromUniqueKey(uniqueKey) || null,
        includesExpressSurcharge: Boolean(r?.includesExpressSurcharge),
        createdAt: r?.createdAt || r?.occurredAt || new Date(),
        occurredAt: r?.occurredAt || null,
        balanceAfter,
      };
    });

    const requestRefIds = Array.from(
      new Set(
        (items || [])
          .filter(
            (it) =>
              String(it?.refType || "") === "REQUEST" &&
              it?.refId &&
              Types.ObjectId.isValid(String(it.refId)),
          )
          .map((it) => String(it.refId)),
      ),
    );

    const shippingPackageRefIds = Array.from(
      new Set(
        (items || [])
          .filter(
            (it) =>
              String(it?.refType || "") === "SHIPPING_PACKAGE" &&
              it?.refId &&
              Types.ObjectId.isValid(String(it.refId)),
          )
          .map((it) => String(it.refId)),
      ),
    );

    const freeCreditGrantIds = Array.from(
      new Set(
        (items || [])
          .map((it) => parseFreeCreditGrantIdFromUniqueKey(it?.uniqueKey))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    const refRequestIdById = new Map();
    const refRequestSummaryById = new Map();
    if (requestRefIds.length > 0) {
      const requestDocs = await Request.find({
        _id: { $in: requestRefIds.map((id) => new Types.ObjectId(id)) },
      })
        .select(CREDIT_LEDGER_REQUEST_SELECT)
        .lean();

      for (const doc of requestDocs || []) {
        if (doc?._id) {
          refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
          refRequestSummaryById.set(String(doc._id), buildRequestSummary(doc));
        }
      }
    }

    const shippingTrackingNumbersByPackageId = new Map();
    if (shippingPackageRefIds.length > 0) {
      const packageDocs = await ShippingPackage.find({
        _id: { $in: shippingPackageRefIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ _id: 1, requestIds: 1 })
        .lean();

      const requestIdSet = new Set();
      for (const pkg of packageDocs || []) {
        for (const requestId of pkg?.requestIds || []) {
          if (requestId) requestIdSet.add(String(requestId));
        }
      }

      const deliveryInfoByRequestId = new Map();
      if (requestIdSet.size > 0) {
        const deliveryInfos = await DeliveryInfo.find({
          request: {
            $in: Array.from(requestIdSet).map((id) => new Types.ObjectId(id)),
          },
        })
          .select({ request: 1, trackingNumber: 1 })
          .lean();

        for (const delivery of deliveryInfos || []) {
          if (delivery?.request) {
            deliveryInfoByRequestId.set(
              String(delivery.request),
              String(delivery.trackingNumber || ""),
            );
          }
        }
      }

      for (const pkg of packageDocs || []) {
        const trackingNumbers = Array.from(
          new Set(
            (pkg?.requestIds || [])
              .map(
                (requestId) =>
                  deliveryInfoByRequestId.get(String(requestId)) || "",
              )
              .filter(Boolean),
          ),
        );
        shippingTrackingNumbersByPackageId.set(String(pkg._id), trackingNumbers);
      }
    }

    const freeReasonByGrantId = new Map();
    if (freeCreditGrantIds.length > 0) {
      const grants = await FreeCreditGrant.find({
        _id: { $in: freeCreditGrantIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ _id: 1, type: 1, source: 1, overrideReason: 1 })
        .lean();

      for (const grant of grants || []) {
        if (!grant?._id) continue;
        const source = String(grant.source || "").trim();
        const grantType = String(grant.type || "").trim().toUpperCase();
        const overrideReason = String(grant.overrideReason || "").trim();

        let reason = "환영 무료 의뢰크레딧";
        if (grantType === "FREE_SHIPPING_CREDIT" || grantType === "SHIPPING_FREE_CREDIT") {
          reason = "환영 무료 배송크레딧";
        }
        if (source === "migrated") {
          reason = "시드/마이그레이션 지급";
        }
        if (source === "admin") {
          reason = overrideReason || "관리자 지급";
        }

        freeReasonByGrantId.set(String(grant._id), reason);
      }
    }

    const enrichedItems = (items || []).map((it) => {
      const refType = String(it?.refType || "");
      if (refType === "REQUEST") {
        const refId = it?.refId ? String(it.refId) : "";
        const refRequestId = refId ? refRequestIdById.get(refId) || "" : "";
        const requestSummary = refId
          ? refRequestSummaryById.get(refId) || null
          : null;
        return {
          ...it,
          refRequestId,
          refRequestSummary: requestSummary,
          patientName: requestSummary?.patientName || "",
          tooth: requestSummary?.tooth || "",
          clinicName: requestSummary?.clinicName || "",
          manufacturerStage: requestSummary?.manufacturerStage || "",
          shippingMode: requestSummary?.shippingMode || "normal",
          lotNumber: requestSummary?.lotNumber || null,
        };
      }

      if (refType === "SHIPPING_PACKAGE") {
        const refId = it?.refId ? String(it.refId) : "";
        return {
          ...it,
          trackingNumbers: refId
            ? shippingTrackingNumbersByPackageId.get(refId) || []
            : [],
        };
      }

      const grantId = parseFreeCreditGrantIdFromUniqueKey(it?.uniqueKey);
      if (grantId) {
        const freeReason = freeReasonByGrantId.get(grantId) || "";
        return {
          ...it,
          freeReason,
        };
      }

      return it;
    });

    return res.json({
      success: true,
      data: {
        items: enrichedItems,
        total,
        page,
        pageSize,
        currentBalanceSnapshot,
      },
    });
  } catch (error) {
    console.error("adminGetBusinessLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자 크레딧 원장 조회에 실패했습니다.",
    });
  }
}

export async function adminCreateSalesmanPayout(req, res) {
  try {
    const salesmanIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(salesmanIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "영업자 ID가 올바르지 않습니다.",
      });
    }
    const salesmanId = new Types.ObjectId(salesmanIdRaw);

    const amountRaw = Number(req.body?.amount || 0);
    const amount = Number.isFinite(amountRaw) ? Math.round(amountRaw) : 0;
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "정산 금액이 올바르지 않습니다.",
      });
    }
    if (amount % 10000 !== 0) {
      return res.status(400).json({
        success: false,
        message: "정산 금액은 10,000원 단위로만 가능합니다.",
      });
    }

    const salesman = await User.findById(salesmanId)
      .select({ _id: 1, role: 1, active: 1, businessAnchorId: 1 })
      .lean();
    if (!salesman || String(salesman.role || "") !== "salesman") {
      return res.status(404).json({
        success: false,
        message: "영업자를 찾을 수 없습니다.",
      });
    }

    const ownerAnchorIdRaw = String(salesman?.businessAnchorId || "").trim();
    if (!ownerAnchorIdRaw || !Types.ObjectId.isValid(ownerAnchorIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "영업자 사업체 정보가 없습니다.",
      });
    }
    const ownerAnchorId = new Types.ObjectId(ownerAnchorIdRaw);

    const ledgerRows = await LedgerLine.aggregate([
      {
        $match: {
          ownerRole: "salesman",
          ownerId: ownerAnchorId,
          accountCode: "REV_SALESMAN",
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
        $addFields: {
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                  then: "PAYOUT",
                },
                {
                  case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "EARN",
            },
          },
          settlementEligible: {
            $or: [
              { $eq: ["$type", "PAYOUT"] },
              {
                $and: [
                  { $in: ["$type", ["EARN", "ADJUST"]] },
                  {
                    $or: [
                      { $eq: ["$creditKind", "PAID"] },
                      { $eq: ["$creditKind", null] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $match: { settlementEligible: true } },
      {
        $group: {
          _id: "$type",
          total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
        },
      },
    ]);

    let earn = 0;
    let payout = 0;
    let adjust = 0;
    for (const r of ledgerRows || []) {
      const type = String(r?._id || "");
      const total = Number(r?.total || 0);
      if (type === "EARN") earn += total;
      else if (type === "PAYOUT") payout += total;
      else if (type === "ADJUST") adjust += total;
    }
    const balance = Math.round(earn - payout + adjust);
    if (balance < amount) {
      return res.status(400).json({
        success: false,
        message: "정산 전 잔액이 부족합니다.",
      });
    }

    const now = new Date();
    const requestIdempotencyKey = String(req.body?.idempotencyKey || "").trim();
    const idempotencyKey =
      requestIdempotencyKey ||
      `gl:settlement_payout:salesman:${String(ownerAnchorId)}:${String(amount)}:${now.getTime()}`;

    const posted = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "SETTLEMENT_PAYOUT",
      businessAnchorId: ownerAnchorId,
      refType: "ADMIN_PAYOUT",
      refId: null,
      occurredAt: now,
      createdBy: req.user?._id || null,
      meta: {
        payoutTargetRole: "salesman",
        payoutTargetUserId: String(salesmanId),
        payoutAmount: amount,
      },
      lines: [
        {
          accountCode: "REV_SALESMAN",
          ownerRole: "salesman",
          ownerId: ownerAnchorId,
          amount,
          amountExcludingVat: amount,
          vatAmount: 0,
          amountIncludingVat: amount,
          refType: "ADMIN_PAYOUT",
          refId: null,
          meta: {
            payoutTargetRole: "salesman",
            payoutTargetUserId: String(salesmanId),
          },
        },
      ],
    });

    return res.status(200).json({
      success: true,
      data: {
        _id: posted?.journalId || null,
        salesmanId: String(salesmanId),
        amount,
        type: "PAYOUT",
        createdAt: now,
        idempotent: Boolean(posted?.idempotent),
      },
    });
  } catch (error) {
    console.error("adminCreateSalesmanPayout error:", error);
    return res.status(500).json({
      success: false,
      message: "정산 처리에 실패했습니다.",
    });
  }
}

export async function adminGetCreditStats(req, res) {
  try {
    const totalOrgs = await BusinessAnchor.countDocuments({
      businessType: "requestor",
    });

    const requestorAnchorIds = await BusinessAnchor.distinct("_id", {
      businessType: "requestor",
    });

    const [
      totalChargeOrders,
      totalBankTransactions,
      pendingChargeOrders,
      matchedChargeOrders,
      newBankTransactions,
      matchedBankTransactions,
      glRows,
      balanceRows,
    ] = await Promise.all([
      ChargeOrder.countDocuments({
        businessAnchorId: { $in: requestorAnchorIds },
      }),
      BankTransaction.countDocuments(),
      ChargeOrder.countDocuments({
        businessAnchorId: { $in: requestorAnchorIds },
        status: "PENDING",
      }),
      ChargeOrder.countDocuments({
        businessAnchorId: { $in: requestorAnchorIds },
        status: "MATCHED",
      }),
      BankTransaction.countDocuments({ status: "NEW" }),
      BankTransaction.countDocuments({ status: "MATCHED" }),
      requestorAnchorIds.length
        ? LedgerLine.aggregate([
            {
              $match: {
                ownerRole: "requestor",
                ownerId: { $in: requestorAnchorIds },
                accountCode: {
                  $in: [
                    "REQ_PAID_CREDIT",
                    "REQ_FREE_REQUEST_CREDIT",
                    "REQ_FREE_SHIPPING_CREDIT",
                  ],
                },
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
              $addFields: {
                eventType: { $ifNull: ["$journalDoc.eventType", ""] },
                baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
              },
            },
            {
              $group: {
                _id: null,
                chargedPaid: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$eventType", "CHARGE_PAID"] },
                          { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                          { $gt: ["$baseAmount", 0] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                chargedFreeRequest: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$eventType", "CHARGE_FREE_REQUEST"] },
                          { $eq: ["$accountCode", "REQ_FREE_REQUEST_CREDIT"] },
                          { $gt: ["$baseAmount", 0] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                chargedFreeShipping: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$eventType", "CHARGE_FREE_SHIPPING"] },
                          { $eq: ["$accountCode", "REQ_FREE_SHIPPING_CREDIT"] },
                          { $gt: ["$baseAmount", 0] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                spentPaid: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $in: [
                              "$eventType",
                              ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                            ],
                          },
                          { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                          { $lt: ["$baseAmount", 0] },
                        ],
                      },
                      { $abs: "$baseAmount" },
                      0,
                    ],
                  },
                },
                spentFreeRequest: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $in: [
                              "$eventType",
                              ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                            ],
                          },
                          { $eq: ["$accountCode", "REQ_FREE_REQUEST_CREDIT"] },
                          { $lt: ["$baseAmount", 0] },
                        ],
                      },
                      { $abs: "$baseAmount" },
                      0,
                    ],
                  },
                },
                spentFreeShipping: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $in: [
                              "$eventType",
                              ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                            ],
                          },
                          { $eq: ["$accountCode", "REQ_FREE_SHIPPING_CREDIT"] },
                          { $lt: ["$baseAmount", 0] },
                        ],
                      },
                      { $abs: "$baseAmount" },
                      0,
                    ],
                  },
                },
              },
            },
          ])
        : [],
      requestorAnchorIds.length
        ? LedgerLine.aggregate([
            {
              $match: {
                ownerRole: "requestor",
                ownerId: { $in: requestorAnchorIds },
                accountCode: {
                  $in: [
                    "REQ_PAID_CREDIT",
                    "REQ_FREE_REQUEST_CREDIT",
                    "REQ_FREE_SHIPPING_CREDIT",
                  ],
                },
              },
            },
            {
              $group: {
                _id: "$accountCode",
                total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
              },
            },
          ])
        : [],
    ]);

    const summary = glRows?.[0] || {};
    const balanceSummaryByCode = new Map(
      (balanceRows || []).map((row) => [String(row?._id || ""), Number(row?.total || 0)]),
    );

    const totalCharged = Number(summary.chargedPaid || 0);
    const totalFreeRequest = Number(summary.chargedFreeRequest || 0);
    const totalFreeShipping = Number(summary.chargedFreeShipping || 0);
    const totalFree = totalFreeRequest + totalFreeShipping;

    const totalSpentPaidAmount = Number(summary.spentPaid || 0);
    const totalSpentFreeRequestAmount = Number(summary.spentFreeRequest || 0);
    const totalSpentFreeShippingAmount = Number(summary.spentFreeShipping || 0);
    const totalSpentFreeAmount =
      totalSpentFreeRequestAmount + totalSpentFreeShippingAmount;
    const totalSpent = totalSpentPaidAmount + totalSpentFreeAmount;

    const totalPaidCredit = Math.max(
      0,
      Math.round(Number(balanceSummaryByCode.get("REQ_PAID_CREDIT") || 0)),
    );
    const totalFreeRequestCredit = Math.max(
      0,
      Math.round(Number(balanceSummaryByCode.get("REQ_FREE_REQUEST_CREDIT") || 0)),
    );
    const totalFreeShippingCredit = Math.max(
      0,
      Math.round(Number(balanceSummaryByCode.get("REQ_FREE_SHIPPING_CREDIT") || 0)),
    );

    return res.json({
      success: true,
      data: {
        totalOrgs,
        totalChargeOrders,
        totalBankTransactions,
        pendingChargeOrders,
        matchedChargeOrders,
        newBankTransactions,
        matchedBankTransactions,
        totalCharged: Math.max(0, Math.round(totalCharged)),
        totalSpent: Math.max(0, Math.round(totalSpent)),
        totalFree: Math.max(0, Math.round(totalFree)),
        totalFreeRequest: Math.max(0, Math.round(totalFreeRequest)),
        totalFreeShipping: Math.max(0, Math.round(totalFreeShipping)),
        totalChargedFreeAmount: Math.max(0, Math.round(totalFree)),
        totalSpentPaidAmount: Math.max(0, Math.round(totalSpentPaidAmount)),
        totalSpentFreeAmount: Math.max(0, Math.round(totalSpentFreeAmount)),
        totalSpentFreeRequestAmount: Math.max(
          0,
          Math.round(totalSpentFreeRequestAmount),
        ),
        totalSpentFreeShippingAmount: Math.max(
          0,
          Math.round(totalSpentFreeShippingAmount),
        ),
        totalPaidCredit: Math.max(0, Math.round(totalPaidCredit)),
        totalFreeRequestCredit: Math.max(0, Math.round(totalFreeRequestCredit)),
        totalFreeShippingCredit: Math.max(
          0,
          Math.round(totalFreeShippingCredit),
        ),
        ledgerByType: {},
      },
    });
  } catch (error) {
    console.error("adminGetCreditStats error:", error);
    return res.status(500).json({
      success: false,
      message: "크레딧 통계 조회에 실패했습니다.",
    });
  }
}

export async function adminGetSalesmanCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const commissionRate = 0.1;

    // 기간 필터: startDate/endDate 파라미터 우선, 없으면 KST 자정 기준 최근 30일
    const startDateRaw = String(req.query.startDate || "").trim();
    const endDateRaw = String(req.query.endDate || "").trim();
    const defaultRange = getLast30DaysRangeUtc();
    const periodCutoff = startDateRaw
      ? new Date(startDateRaw)
      : (defaultRange?.start ?? null);
    const periodEnd = endDateRaw
      ? new Date(endDateRaw)
      : (defaultRange?.end ?? null);

    // 전체 개수 조회
    const totalSalesmen = await User.countDocuments({
      role: { $in: REFERRAL_LEADER_ROLES },
    });

    // 페이지네이션 적용하여 필요한 영업자만 조회
    const salesmen = await User.find({
      role: { $in: REFERRAL_LEADER_ROLES },
    })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        referralCode: 1,
        active: 1,
        role: 1,
        businessAnchorId: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const salesmanIds = salesmen
      .map((u) => String(u?._id || ""))
      .filter(Boolean)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (salesmanIds.length === 0) {
      return res.json({
        success: true,
        data: { items: [], total: 0, skip, limit },
      });
    }

    const businessAnchorIds = Array.from(
      new Set(
        salesmen
          .map((u) => String(u?.businessAnchorId || ""))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const roleAnchorPairs = salesmen
      .map((u) => ({
        role: String(u?.role || "").trim(),
        anchorId: String(u?.businessAnchorId || "").trim(),
      }))
      .filter(
        (it) =>
          (it.role === "salesman" || it.role === "devops") &&
          Types.ObjectId.isValid(it.anchorId),
      );

    const matchOr = roleAnchorPairs.map((it) => ({
      ownerRole: it.role,
      ownerId: new Types.ObjectId(it.anchorId),
      accountCode: it.role === "devops" ? "REV_DEVOPS" : "REV_SALESMAN",
    }));

    const periodMatch = {};
    if (periodCutoff) periodMatch.$gte = periodCutoff;
    if (periodEnd) periodMatch.$lte = periodEnd;

    const aggregateLedgerByRoleAnchor = async ({ withPeriod = false }) => {
      if (!matchOr.length) return [];
      const baseMatch = {
        $or: matchOr,
        ...(withPeriod && Object.keys(periodMatch).length
          ? { occurredAt: periodMatch }
          : {}),
      };

      return LedgerLine.aggregate([
        { $match: baseMatch },
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
          $addFields: {
            type: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                    then: "PAYOUT",
                  },
                  {
                    case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                    then: "ADJUST",
                  },
                ],
                default: "EARN",
              },
            },
            ownerIdStr: { $toString: "$ownerId" },
            settlementEligible: {
              $or: [
                { $eq: ["$type", "PAYOUT"] },
                {
                  $and: [
                    { $in: ["$type", ["EARN", "ADJUST"]] },
                    {
                      $or: [
                        { $eq: ["$creditKind", "PAID"] },
                        { $eq: ["$creditKind", null] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $match: { settlementEligible: true } },
        {
          $group: {
            _id: {
              ownerRole: "$ownerRole",
              ownerId: "$ownerIdStr",
              type: "$type",
            },
            total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
          },
        },
      ]);
    };

    const aggregateFreeByRoleAnchor = async () => {
      if (!matchOr.length) return [];
      const baseMatch = {
        $or: matchOr,
        ...(Object.keys(periodMatch).length ? { occurredAt: periodMatch } : {}),
      };

      return LedgerLine.aggregate([
        { $match: baseMatch },
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
          $addFields: {
            ownerIdStr: { $toString: "$ownerId" },
            eventType: { $ifNull: ["$journalDoc.eventType", ""] },
            baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
          },
        },
        {
          $group: {
            _id: {
              ownerRole: "$ownerRole",
              ownerId: "$ownerIdStr",
            },
            freeRequestAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_REQUEST"] },
                      { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    ],
                  },
                  "$baseAmount",
                  0,
                ],
              },
            },
            freeRequestCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_REQUEST"] },
                      { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            freeShippingAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_SHIPPING"] },
                      { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    ],
                  },
                  "$baseAmount",
                  0,
                ],
              },
            },
            freeShippingCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_SHIPPING"] },
                      { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);
    };

    // 병렬 실행: BusinessAnchor 조회 + 전체/기간 GL 집계
    const [anchors, ledgerRows, ledgerRowsPeriod, freeRowsPeriod] = await Promise.all([
      businessAnchorIds.length
        ? BusinessAnchor.find({ _id: { $in: businessAnchorIds } })
            .select({
              _id: 1,
              name: 1,
              businessType: 1,
              metadata: 1,
              status: 1,
            })
            .lean()
        : Promise.resolve([]),
      aggregateLedgerByRoleAnchor({ withPeriod: false }),
      aggregateLedgerByRoleAnchor({ withPeriod: true }),
      aggregateFreeByRoleAnchor(),
    ]);

    const anchorById = new Map(
      (anchors || []).map((a) => [String(a?._id || ""), a]),
    );

    // 잔액(balance)은 항상 전체 기간 기준 (정산 전 잔액)
    const ledgerByRoleAnchor = new Map();
    for (const r of ledgerRows) {
      const ownerRole = String(r?._id?.ownerRole || "");
      const ownerId = String(r?._id?.ownerId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!ownerRole || !ownerId) continue;
      const key = `${ownerRole}:${ownerId}`;
      const prev = ledgerByRoleAnchor.get(key) || { earn: 0, payout: 0, adjust: 0 };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledgerByRoleAnchor.set(key, prev);
    }

    const ledgerPeriodByRoleAnchor = new Map();
    for (const r of ledgerRowsPeriod) {
      const ownerRole = String(r?._id?.ownerRole || "");
      const ownerId = String(r?._id?.ownerId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!ownerRole || !ownerId) continue;
      const key = `${ownerRole}:${ownerId}`;
      const prev = ledgerPeriodByRoleAnchor.get(key) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledgerPeriodByRoleAnchor.set(key, prev);
    }

    const freePeriodByRoleAnchor = new Map();
    for (const r of freeRowsPeriod || []) {
      const ownerRole = String(r?._id?.ownerRole || "");
      const ownerId = String(r?._id?.ownerId || "");
      if (!ownerRole || !ownerId) continue;
      const key = `${ownerRole}:${ownerId}`;
      const freeRequestAmount = Math.round(Number(r?.freeRequestAmount || 0));
      const freeRequestCount = Math.round(Number(r?.freeRequestCount || 0));
      const freeShippingAmount = Math.round(Number(r?.freeShippingAmount || 0));
      const freeShippingCount = Math.round(Number(r?.freeShippingCount || 0));
      freePeriodByRoleAnchor.set(key, {
        freeRequestAmount,
        freeRequestCount,
        freeShippingAmount,
        freeShippingCount,
        freeAmount: freeRequestAmount + freeShippingAmount,
      });
    }

    const range =
      periodCutoff || periodEnd
        ? {
            start: periodCutoff || new Date(0),
            end: periodEnd || new Date(),
          }
        : null;
    const {
      directOrgIdsBySalesmanId,
      referredSalesmanCountBySalesmanId,
      revenueByOrgId,
    } = await buildSalesmanReferralAggregation({
      salesmanIds,
      range,
    });

    const items = salesmen.map((s) => {
      const sid = String(s._id);
      const ownerRole = String(s?.role || "") === "devops" ? "devops" : "salesman";
      const ownerAnchorId = String(s?.businessAnchorId || "");
      const ownerKey = `${ownerRole}:${ownerAnchorId}`;

      const ledger = ledgerByRoleAnchor.get(ownerKey) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };

      const ledgerPeriod = ledgerPeriodByRoleAnchor.get(ownerKey) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      const balance = Math.round(
        Number(ledger.earn || 0) -
          Number(ledger.payout || 0) +
          Number(ledger.adjust || 0),
      );

      const balancePeriod = Math.round(
        Number(ledgerPeriod.earn || 0) -
          Number(ledgerPeriod.payout || 0) +
          Number(ledgerPeriod.adjust || 0),
      );

      const freePeriod = freePeriodByRoleAnchor.get(ownerKey) || {
        freeRequestAmount: 0,
        freeRequestCount: 0,
        freeShippingAmount: 0,
        freeShippingCount: 0,
        freeAmount: 0,
      };

      const directOrgSet = directOrgIdsBySalesmanId.get(sid) || new Set();

      let directRevenue30d = 0;
      let directBonus30d = 0;
      let directOrders30d = 0;
      for (const orgId of directOrgSet) {
        const row = revenueByOrgId.get(String(orgId));
        if (!row) continue;
        directRevenue30d += Number(row.revenueAmount || 0);
        directBonus30d += Number(row.bonusAmount || 0);
        directOrders30d += Number(row.orderCount || 0);
      }

      const revenue30d = directRevenue30d;
      const bonus30d = directBonus30d;
      const orders30d = directOrders30d;
      const commission30d = Math.round(directRevenue30d * commissionRate);
      const anchorId = String(s?.businessAnchorId || "");
      const anchor = anchorById.get(anchorId) || null;

      return {
        salesmanId: sid,
        name: String(s?.name || ""),
        email: String(s?.email || ""),
        role: String(s?.role || ""),
        referralCode: String(s?.referralCode || ""),
        active: Boolean(s?.active),
        businessAnchorId: anchorId || null,
        businessAnchor: anchor
          ? {
              id: String(anchor?._id || ""),
              name: String(anchor?.name || ""),
              businessType: String(anchor?.businessType || ""),
              status: String(anchor?.status || ""),
              representativeName: String(
                anchor?.metadata?.representativeName || "",
              ),
              email: String(anchor?.metadata?.email || ""),
              phoneNumber: String(anchor?.metadata?.phoneNumber || ""),
            }
          : null,
        referredSalesmanCount: referredSalesmanCountBySalesmanId.get(sid) || 0,
        wallet: {
          earnedAmount: Math.round(Number(ledger.earn || 0)),
          paidOutAmount: Math.round(Number(ledger.payout || 0)),
          adjustedAmount: Math.round(Number(ledger.adjust || 0)),
          balanceAmount: balance,
          earnedAmountPeriod: Math.round(Number(ledgerPeriod.earn || 0)),
          paidOutAmountPeriod: Math.round(Number(ledgerPeriod.payout || 0)),
          adjustedAmountPeriod: Math.round(Number(ledgerPeriod.adjust || 0)),
          balanceAmountPeriod: balancePeriod,
          freeRequestAmountPeriod: Number(freePeriod.freeRequestAmount || 0),
          freeRequestCountPeriod: Number(freePeriod.freeRequestCount || 0),
          freeShippingAmountPeriod: Number(freePeriod.freeShippingAmount || 0),
          freeShippingCountPeriod: Number(freePeriod.freeShippingCount || 0),
          freeAmountPeriod: Number(freePeriod.freeAmount || 0),
        },
        performance30d: {
          introducedCount: directOrgSet.size,
          referredOrgCount: directOrgSet.size,
          revenueAmount: Math.round(revenue30d),
          bonusAmount: Math.round(bonus30d),
          orderCount: Math.round(orders30d),
          commissionAmount: Math.round(commission30d),
        },
      };
    });

    const sortedItems = [...items].sort(
      (a, b) =>
        Number(b.wallet?.balanceAmountPeriod || 0) -
          Number(a.wallet?.balanceAmountPeriod || 0) ||
        Number(b.performance30d?.commissionAmount || 0) -
          Number(a.performance30d?.commissionAmount || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "ko"),
    );

    return res.json({
      success: true,
      data: {
        items: sortedItems,
        total: totalSalesmen,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetSalesmanCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetManufacturerSummary(req, res) {
  try {
    const periodKey = String(req.query.period || "30d").trim() || "30d";
    const startDateRaw = String(req.query.startDate || "").trim();
    const endDateRaw = String(req.query.endDate || "").trim();

    const periodRange = getPeriodRangeUtcFromPeriodKey(periodKey);
    const dateRangeOverride = {};
    if (startDateRaw) {
      const start = new Date(startDateRaw);
      if (!Number.isNaN(start.getTime())) dateRangeOverride.start = start;
    }
    if (endDateRaw) {
      const end = new Date(endDateRaw);
      if (!Number.isNaN(end.getTime())) dateRangeOverride.end = end;
    }
    const range =
      dateRangeOverride.start || dateRangeOverride.end
        ? {
            start: dateRangeOverride.start || new Date(0),
            end: dateRangeOverride.end || new Date(),
          }
        : periodRange;

    const activeManufacturerAnchors = await BusinessAnchor.find({
      businessType: "manufacturer",
      status: { $ne: "merged" },
    })
      .select({ _id: 1 })
      .lean();

    const activeManufacturerAnchorIds = Array.from(
      new Set(
        (activeManufacturerAnchors || [])
          .map((a) => String(a?._id || ""))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const buildPipeline = ({ withPeriod = false }) => [
      {
        $match: {
          ownerRole: "manufacturer",
          ownerId: { $in: activeManufacturerAnchorIds },
          accountCode: "REV_MANUFACTURER",
          ...(withPeriod && range
            ? { occurredAt: { $gte: range.start, $lte: range.end } }
            : {}),
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
        $addFields: {
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                  then: "PAYOUT",
                },
                {
                  case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "EARN",
            },
          },
          ownerIdStr: { $toString: "$ownerId" },
          amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
          settlementEligible: {
            $or: [
              { $eq: ["$type", "PAYOUT"] },
              {
                $and: [
                  { $in: ["$type", ["EARN", "ADJUST"]] },
                  {
                    $or: [
                      { $eq: ["$creditKind", "PAID"] },
                      { $eq: ["$creditKind", null] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $match: { settlementEligible: true } },
    ];

    const [anchorCount, periodLedgerRows, allLedgerRows, periodFreeRows] = await Promise.all([
      Promise.resolve(activeManufacturerAnchorIds.length),
      range
        ? LedgerLine.aggregate([
            ...buildPipeline({ withPeriod: true }),
            {
              $group: {
                _id: "$type",
                total: { $sum: "$amountBase" },
              },
            },
          ])
        : Promise.resolve([]),
      LedgerLine.aggregate([
        ...buildPipeline({ withPeriod: false }),
        {
          $group: {
            _id: { ownerId: "$ownerIdStr", type: "$type" },
            total: { $sum: "$amountBase" },
          },
        },
      ]),
      range
        ? LedgerLine.aggregate([
            {
              $match: {
                ownerRole: "manufacturer",
                ownerId: { $in: activeManufacturerAnchorIds },
                accountCode: "REV_MANUFACTURER",
                occurredAt: { $gte: range.start, $lte: range.end },
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
              $addFields: {
                eventType: { $ifNull: ["$journalDoc.eventType", ""] },
                baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
              },
            },
            {
              $group: {
                _id: null,
                freeRequestAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "FREE_REQUEST"] },
                          { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                freeRequestCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "FREE_REQUEST"] },
                          { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                freeShippingAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "FREE_SHIPPING"] },
                          { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                freeShippingCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "FREE_SHIPPING"] },
                          { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                paidRequestAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "PAID"] },
                          { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                paidRequestCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "PAID"] },
                          { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                paidShippingAmount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "PAID"] },
                          { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                        ],
                      },
                      "$baseAmount",
                      0,
                    ],
                  },
                },
                paidShippingCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$creditKind", "PAID"] },
                          { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ])
        : Promise.resolve([]),
    ]);

    let periodEarnedAmount = 0;
    let periodPaidOutAmount = 0;
    let periodAdjustedAmount = 0;
    for (const r of periodLedgerRows || []) {
      const type = String(r?._id || "");
      const total = normalizeNumber(r?.total || 0);
      if (type === "EARN") periodEarnedAmount += total;
      else if (type === "PAYOUT") periodPaidOutAmount += total;
      else if (type === "ADJUST") periodAdjustedAmount += total;
    }

    const periodBalanceAmount = normalizeNumber(
      periodEarnedAmount - periodPaidOutAmount + periodAdjustedAmount,
    );

    const balanceByOrg = new Map();
    for (const r of allLedgerRows || []) {
      const org = String(r?._id?.ownerId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!org) continue;
      const prev = balanceByOrg.get(org) || { earn: 0, payout: 0, adjust: 0 };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      balanceByOrg.set(org, prev);
    }

    let totalBalanceAmount = 0;
    for (const v of balanceByOrg.values()) {
      totalBalanceAmount += Math.max(
        0,
        normalizeNumber(v.earn - v.payout + v.adjust),
      );
    }

    const periodFreeRequestAmount = normalizeNumber(
      Number(periodFreeRows?.[0]?.freeRequestAmount || 0),
    );
    const periodFreeRequestCount = normalizeNumber(
      Number(periodFreeRows?.[0]?.freeRequestCount || 0),
    );
    const periodFreeShippingAmount = normalizeNumber(
      Number(periodFreeRows?.[0]?.freeShippingAmount || 0),
    );
    const periodFreeShippingCount = normalizeNumber(
      Number(periodFreeRows?.[0]?.freeShippingCount || 0),
    );
    const periodPaidRequestAmount = normalizeNumber(
      Number(periodFreeRows?.[0]?.paidRequestAmount || 0),
    );
    const periodPaidRequestCount = normalizeNumber(
      Number(periodFreeRows?.[0]?.paidRequestCount || 0),
    );
    const periodPaidShippingAmount = normalizeNumber(
      Number(periodFreeRows?.[0]?.paidShippingAmount || 0),
    );
    const periodPaidShippingCount = normalizeNumber(
      Number(periodFreeRows?.[0]?.paidShippingCount || 0),
    );
    const periodFreeAmount = normalizeNumber(
      periodFreeRequestAmount + periodFreeShippingAmount,
    );
    const periodShippingAmount = normalizeNumber(
      periodPaidShippingAmount + periodFreeShippingAmount,
    );

    return res.json({
      success: true,
      data: {
        anchorCount,
        periodEarnedAmount,
        periodPaidOutAmount,
        periodBalanceAmount,
        totalBalanceAmount,
        periodFreeRequestAmount,
        periodFreeRequestCount,
        periodFreeShippingAmount,
        periodFreeShippingCount,
        periodPaidRequestAmount,
        periodPaidRequestCount,
        periodPaidShippingAmount,
        periodPaidShippingCount,
        periodShippingAmount,
        periodFreeAmount,
      },
    });
  } catch (error) {
    console.error("adminGetManufacturerSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "제조사 통계 조회에 실패했습니다.",
    });
  }
}

function parsePeriod(period) {
  const p = String(period || "").trim();
  if (!p || p === "all") return null;

  // KST 기준 N일 전 계산
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T00:00:00+09:00`);

  if (p === "7d") {
    todayKst.setDate(todayKst.getDate() - 7);
    return todayKst;
  }
  if (p === "30d") {
    todayKst.setDate(todayKst.getDate() - 30);
    return todayKst;
  }
  if (p === "90d") {
    todayKst.setDate(todayKst.getDate() - 90);
    return todayKst;
  }
  return null;
}

function safeRegex(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export async function adminGetSalesmanLedger(req, res) {
  try {
    const salesmanIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(salesmanIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "영업자 ID가 올바르지 않습니다.",
      });
    }

    const targetUser = await User.findById(salesmanIdRaw)
      .select({ _id: 1, role: 1, businessAnchorId: 1 })
      .lean();
    if (!targetUser?._id) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    const ownerRole = targetUser.role === "devops" ? "devops" : "salesman";
    const ownerAnchorIdRaw = String(targetUser?.businessAnchorId || "").trim();
    if (!ownerAnchorIdRaw || !Types.ObjectId.isValid(ownerAnchorIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }
    const ownerAnchorId = new Types.ObjectId(ownerAnchorIdRaw);

    const typeRaw = String(req.query.type || "")
      .trim()
      .toUpperCase();
    const periodRaw = String(req.query.period || "").trim();
    const qRaw = String(req.query.q || "").trim();

    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(req.query.pageSize || 50) || 50),
    );

    const match = {
      ownerRole,
      ownerId: ownerAnchorId,
      accountCode: ownerRole === "devops" ? "REV_DEVOPS" : "REV_SALESMAN",
    };

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      !["EARN", "ADJUST", "PAYOUT"].includes(typeRaw)
    ) {
      return res.json({
        success: true,
        data: { items: [], total: 0, page, pageSize },
      });
    }

    const occurredAt = {};

    const sinceFromPeriod = parsePeriod(periodRaw);
    if (sinceFromPeriod) {
      occurredAt.$gte = sinceFromPeriod;
    }

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    if (fromRaw) {
      const from = new Date(fromRaw);
      if (!Number.isNaN(from.getTime())) {
        occurredAt.$gte = from;
      }
    }

    if (toRaw) {
      const to = new Date(toRaw);
      if (!Number.isNaN(to.getTime())) {
        occurredAt.$lte = to;
      }
    }

    if (Object.keys(occurredAt).length) {
      match.occurredAt = occurredAt;
    }

    const pipeline = [
      { $match: match },
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
        $addFields: {
          uniqueKey: {
            $concat: [
              "gl:",
              { $ifNull: ["$journalDoc.meta.spendUniqueKey", "$journalId"] },
            ],
          },
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                  then: "PAYOUT",
                },
                {
                  case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "EARN",
            },
          },
          amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
          settlementEligible: {
            $or: [
              { $eq: ["$type", "PAYOUT"] },
              {
                $and: [
                  { $in: ["$type", ["EARN", "ADJUST"]] },
                  {
                    $or: [
                      { $eq: ["$creditKind", "PAID"] },
                      { $eq: ["$creditKind", null] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $match: { settlementEligible: true } },
    ];

    if (typeRaw === "EARN" || typeRaw === "ADJUST" || typeRaw === "PAYOUT") {
      pipeline.push({ $match: { type: typeRaw } });
    }

    if (qRaw) {
      const rx = safeRegex(qRaw);
      if (rx) {
        pipeline.push({
          $match: {
            $or: [{ uniqueKey: rx }, { refType: rx }],
          },
        });
      }
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $project: {
          _id: 1,
          type: 1,
          amount: "$amountBase",
          amountExcludingVat: "$amountBase",
          vatAmount: { $literal: 0 },
          amountIncludingVat: "$amountBase",
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          createdAt: "$occurredAt",
          occurredAt: "$occurredAt",
        },
      },
    );

    const allRows = await LedgerLine.aggregate(pipeline);

    let totalBalance = 0;
    for (const r of allRows) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }

    const total = Array.isArray(allRows) ? allRows.length : 0;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;

    let skippedSum = 0;
    for (const r of allRows.slice(0, startIdx)) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }

    let runningBalance = totalBalance - skippedSum;
    const items = allRows.slice(startIdx, endIdx).map((r) => {
      const v = Number(r?.amount || 0);
      const t = String(r?.type || "");
      const balanceAfter = runningBalance;
      if (t === "EARN" || t === "ADJUST") runningBalance -= v;
      else if (t === "PAYOUT") runningBalance += v;
      return { ...r, balanceAfter };
    });

    return res.json({
      success: true,
      data: { items, total, page, pageSize },
    });
  } catch (error) {
    console.error("adminGetSalesmanLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 원장 조회에 실패했습니다.",
    });
  }
}

export async function adminGetBusinessCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const businessAnchorId = String(req.query.businessAnchorId || "").trim();

    const matchQuery = {};
    if (businessAnchorId) {
      if (!Types.ObjectId.isValid(businessAnchorId)) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 businessAnchorId 입니다.",
        });
      }
      matchQuery._id = new Types.ObjectId(businessAnchorId);
    }

    // 전체 개수 조회 (캐싱 가능)
    const total = await BusinessAnchor.countDocuments(matchQuery);

    // SSOT: metadata 사용 (extracted 레거시 제거)
    // 페이지네이션 적용하여 필요한 데이터만 조회
    const orgs = await BusinessAnchor.find(matchQuery)
      .select({
        name: 1,
        primaryContactUserId: 1,
        metadata: 1,
        businessAnchorId: 1,
        businessType: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const ownerIds = Array.from(
      new Set(
        (orgs || [])
          .map((o) => o?.primaryContactUserId)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select({ _id: 1, name: 1, email: 1, role: 1 })
          .lean()
      : [];

    const ownerById = new Map(
      (owners || []).map((u) => [
        String(u._id),
        { name: u.name, email: u.email, role: u.role },
      ]),
    );

    // BusinessAnchor._id 자체가 businessAnchorId이므로 직접 사용
    const orgAnchorIds = (orgs || [])
      .map((org) => org._id)
      .filter(Boolean)
      .map((id) => new Types.ObjectId(String(id)));

    // 잔액 SSOT는 GL 집계값이다. (BusinessCreditBalance 스냅샷 참조 금지)

    const ledgerData = orgAnchorIds.length
      ? await LedgerLine.aggregate([
          {
            $match: {
              ownerRole: "requestor",
              ownerId: { $in: orgAnchorIds },
              accountCode: {
                $in: [
                  "REQ_PAID_CREDIT",
                  "REQ_FREE_REQUEST_CREDIT",
                  "REQ_FREE_SHIPPING_CREDIT",
                ],
              },
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
            $addFields: {
              ownerIdStr: { $toString: "$ownerId" },
              eventType: { $ifNull: ["$journalDoc.eventType", ""] },
              baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
            },
          },
          {
            $group: {
              _id: "$ownerIdStr",
              chargedPaid: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$eventType", "CHARGE_PAID"] },
                        { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                        { $gt: ["$baseAmount", 0] },
                      ],
                    },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              chargedFreeRequest: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$eventType", "CHARGE_FREE_REQUEST"] },
                        { $eq: ["$accountCode", "REQ_FREE_REQUEST_CREDIT"] },
                        { $gt: ["$baseAmount", 0] },
                      ],
                    },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              chargedFreeShipping: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$eventType", "CHARGE_FREE_SHIPPING"] },
                        { $eq: ["$accountCode", "REQ_FREE_SHIPPING_CREDIT"] },
                        { $gt: ["$baseAmount", 0] },
                      ],
                    },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              adjustPaidAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$eventType", "ADJUST"] },
                        { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                      ],
                    },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              spentAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $in: [
                            "$eventType",
                            ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                          ],
                        },
                        { $lt: ["$baseAmount", 0] },
                      ],
                    },
                    { $abs: "$baseAmount" },
                    0,
                  ],
                },
              },
              spentPaidAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $in: [
                            "$eventType",
                            ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                          ],
                        },
                        { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                        { $lt: ["$baseAmount", 0] },
                      ],
                    },
                    { $abs: "$baseAmount" },
                    0,
                  ],
                },
              },
              spentFreeRequestAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $in: [
                            "$eventType",
                            ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                          ],
                        },
                        { $eq: ["$accountCode", "REQ_FREE_REQUEST_CREDIT"] },
                        { $lt: ["$baseAmount", 0] },
                      ],
                    },
                    { $abs: "$baseAmount" },
                    0,
                  ],
                },
              },
              spentFreeShippingAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $in: [
                            "$eventType",
                            ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                          ],
                        },
                        { $eq: ["$accountCode", "REQ_FREE_SHIPPING_CREDIT"] },
                        { $lt: ["$baseAmount", 0] },
                      ],
                    },
                    { $abs: "$baseAmount" },
                    0,
                  ],
                },
              },
              currentPaidCredit: {
                $sum: {
                  $cond: [{ $eq: ["$accountCode", "REQ_PAID_CREDIT"] }, "$baseAmount", 0],
                },
              },
              currentFreeRequestCredit: {
                $sum: {
                  $cond: [
                    { $eq: ["$accountCode", "REQ_FREE_REQUEST_CREDIT"] },
                    "$baseAmount",
                    0,
                  ],
                },
              },
              currentFreeShippingCredit: {
                $sum: {
                  $cond: [
                    { $eq: ["$accountCode", "REQ_FREE_SHIPPING_CREDIT"] },
                    "$baseAmount",
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [];

    const balanceMap = {};
    ledgerData.forEach((item) => {
      const chargedPaid = Number(item?.chargedPaid || 0);
      const chargedFreeRequest = Number(item?.chargedFreeRequest || 0);
      const chargedFreeShipping = Number(item?.chargedFreeShipping || 0);
      const spentAmount = Number(item?.spentAmount || 0);
      const spentPaidAmount = Number(item?.spentPaidAmount || 0);
      const spentFreeRequestAmount = Number(item?.spentFreeRequestAmount || 0);
      const spentFreeShippingAmount = Number(item?.spentFreeShippingAmount || 0);

      const anchorId = String(item?._id || "").trim();

      const paidCredit = Math.max(
        0,
        Math.round(Number(item?.currentPaidCredit || 0)),
      );
      const freeRequestCredit = Math.max(
        0,
        Math.round(Number(item?.currentFreeRequestCredit || 0)),
      );
      const freeShippingCredit = Math.max(
        0,
        Math.round(Number(item?.currentFreeShippingCredit || 0)),
      );

      const chargedFreeAmount = Math.max(
        0,
        Math.round(chargedFreeRequest + chargedFreeShipping),
      );
      const spentFreeAmount = Math.max(
        0,
        Math.round(spentFreeRequestAmount + spentFreeShippingAmount),
      );

      balanceMap[anchorId] = {
        balance: paidCredit + freeRequestCredit + freeShippingCredit,
        paidCredit,
        freeRequestCredit,
        freeShippingCredit,
        spentAmount: Math.max(0, Math.round(spentAmount)),
        chargedPaidAmount: Math.max(0, Math.round(chargedPaid)),
        chargedFreeAmount,
        chargedFreeRequestAmount: Math.max(0, Math.round(chargedFreeRequest)),
        chargedFreeShippingAmount: Math.max(0, Math.round(chargedFreeShipping)),
        spentPaidAmount: Math.max(0, Math.round(spentPaidAmount)),
        spentFreeAmount,
        spentFreeRequestAmount: Math.max(0, Math.round(spentFreeRequestAmount)),
        spentFreeShippingAmount: Math.max(0, Math.round(spentFreeShippingAmount)),
      };
    });

    const result = orgs.map((org) => {
      const anchorId = String(org?._id || "");
      const balanceInfo = balanceMap[anchorId] || {
        balance: 0,
        paidCredit: 0,
        freeRequestCredit: 0,
        freeShippingCredit: 0,
        spentAmount: 0,
        chargedPaidAmount: 0,
        chargedFreeAmount: 0,
        chargedFreeRequestAmount: 0,
        chargedFreeShippingAmount: 0,
        spentPaidAmount: 0,
        spentFreeAmount: 0,
        spentFreeRequestAmount: 0,
        spentFreeShippingAmount: 0,
      };

      const ownerInfo =
        ownerById.get(String(org?.primaryContactUserId || "")) || null;

      const businessType = String(org.businessType || "").trim();
      const ownerRole = String(ownerInfo?.role || "").trim();
      const isFreeCreditEligible =
        businessType === "requestor" || ownerRole === "requestor";

      return {
        _id: org._id,
        businessAnchorId: anchorId,
        businessType,
        ownerRole,
        isFreeCreditEligible,
        name: org.name,
        ownerName: ownerInfo?.name || "",
        ownerEmail: ownerInfo?.email || "",
        companyName: org.metadata?.companyName || "",
        businessNumber: org.metadata?.businessNumber || "",
        representativeName: org.metadata?.representativeName || "",
        address: org.metadata?.address || "",
        addressDetail: org.metadata?.addressDetail || "",
        zipCode: org.metadata?.zipCode || "",
        phoneNumber: org.metadata?.phoneNumber || "",
        businessEmail: org.metadata?.email || "",
        businessItem: org.metadata?.businessItem || "",
        businessCategory: org.metadata?.businessType || "",
        startDate: org.metadata?.startDate || "",
        paidBalance: balanceInfo.paidCredit,
        freeBalance:
          balanceInfo.freeRequestCredit + balanceInfo.freeShippingCredit,
        ...balanceInfo,
      };
    });

    const sortedResult = [...result].sort((a, b) =>
      Number(b.paidCredit || 0) - Number(a.paidCredit || 0) ||
      Number(b.freeRequestCredit || 0) - Number(a.freeRequestCredit || 0) ||
      String(a.name || "").localeCompare(String(b.name || ""), "ko"),
    );

    return res.json({
      success: true,
      data: {
        items: sortedResult,
        total,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetBusinessCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자별 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetBusinessCreditDetail(req, res) {
  try {
    const orgId = req.params.id;
    const org = await BusinessAnchor.findById(orgId)
      .select({ name: 1, metadata: 1 })
      .lean();

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "해당 사업자를 찾을 수 없습니다.",
      });
    }

    const businessAnchorId = org?._id;
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "해당 사업자의 anchor ID가 없습니다.",
      });
    }

    const balanceSnapshot = await getBusinessCreditBalanceSnapshot({
      businessAnchorId,
      upsertIfMissing: true,
    });

    const rows = await LedgerLine.aggregate([
      {
        $match: {
          ownerRole: "requestor",
          ownerId: new Types.ObjectId(String(businessAnchorId)),
          accountCode: {
            $in: [
              "REQ_PAID_CREDIT",
              "REQ_FREE_REQUEST_CREDIT",
              "REQ_FREE_SHIPPING_CREDIT",
            ],
          },
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
        $addFields: {
          eventType: { $ifNull: ["$journalDoc.eventType", ""] },
          baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
          mergedUniqueKey: {
            $concat: [
              "gl:",
              {
                $ifNull: [
                  "$journalDoc.meta.spendUniqueKey",
                  { $ifNull: ["$journalDoc.idempotencyKey", "$journalId"] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$journalId",
          occurredAt: { $max: "$occurredAt" },
          createdAt: { $max: "$createdAt" },
          eventType: { $first: "$eventType" },
          refType: { $first: "$refType" },
          refId: { $first: "$refId" },
          uniqueKey: { $first: "$mergedUniqueKey" },
          amount: { $sum: "$baseAmount" },
          deltaPaid: {
            $sum: {
              $cond: [{ $eq: ["$accountCode", "REQ_PAID_CREDIT"] }, "$baseAmount", 0],
            },
          },
          deltaBonusRequest: {
            $sum: {
              $cond: [
                { $eq: ["$accountCode", "REQ_FREE_REQUEST_CREDIT"] },
                "$baseAmount",
                0,
              ],
            },
          },
          deltaBonusShipping: {
            $sum: {
              $cond: [
                { $eq: ["$accountCode", "REQ_FREE_SHIPPING_CREDIT"] },
                "$baseAmount",
                0,
              ],
            },
          },
          spentPaidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                      ],
                    },
                    { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                    { $lt: ["$baseAmount", 0] },
                  ],
                },
                { $abs: "$baseAmount" },
                0,
              ],
            },
          },
          spentFreeAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                      ],
                    },
                    {
                      $in: [
                        "$accountCode",
                        ["REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"],
                      ],
                    },
                    { $lt: ["$baseAmount", 0] },
                  ],
                },
                { $abs: "$baseAmount" },
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$eventType", "CHARGE_PAID"] },
                  then: "CHARGE_PAID",
                },
                {
                  case: { $eq: ["$eventType", "CHARGE_FREE_REQUEST"] },
                  then: "CHARGE_FREE_REQUEST",
                },
                {
                  case: { $eq: ["$eventType", "CHARGE_FREE_SHIPPING"] },
                  then: "CHARGE_FREE_SHIPPING",
                },
                {
                  case: {
                    $and: [
                      {
                        $in: [
                          "$eventType",
                          ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                        ],
                      },
                      { $gt: ["$spentPaidAmount", 0] },
                    ],
                  },
                  then: "SPEND_PAID",
                },
                {
                  case: { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                  then: "SPEND_FREE_REQUEST",
                },
                {
                  case: { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                  then: "SPEND_FREE_SHIPPING",
                },
                {
                  case: { $eq: ["$eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "ADJUST",
            },
          },
        },
      },
      { $sort: { occurredAt: 1, _id: 1 } },
      { $limit: 100 },
    ]);

    let paid = 0;
    let freeRequest = 0;
    let freeShipping = 0;
    let spent = 0;
    const history = [];

    for (const row of rows || []) {
      const deltaPaid = Number(row?.deltaPaid || 0);
      const deltaFreeRequest = Number(row?.deltaBonusRequest || 0);
      const deltaFreeShipping = Number(row?.deltaBonusShipping || 0);

      paid += deltaPaid;
      freeRequest += deltaFreeRequest;
      freeShipping += deltaFreeShipping;

      if (
        String(row?.type || "") === "SPEND_PAID" ||
        String(row?.type || "") === "SPEND_FREE_REQUEST" ||
        String(row?.type || "") === "SPEND_FREE_SHIPPING"
      ) {
        spent += Math.max(0, Number(row?.spentPaidAmount || 0)) + Math.max(0, Number(row?.spentFreeAmount || 0));
      }

      history.push({
        _id: String(row?._id || ""),
        type: String(row?.type || "ADJUST"),
        amount: Number(row?.amount || 0),
        spentPaidAmount: Number(row?.spentPaidAmount || 0),
        spentFreeAmount: Number(row?.spentFreeAmount || 0),
        refType: String(row?.refType || ""),
        refId: row?.refId ? String(row.refId) : null,
        uniqueKey: String(row?.uniqueKey || ""),
        createdAt: row?.createdAt || row?.occurredAt || new Date(),
        occurredAt: row?.occurredAt || null,
        balanceAfter: Math.max(0, paid + freeRequest + freeShipping),
        paidCreditAfter: Math.max(0, paid),
        freeRequestCreditAfter: Math.max(0, freeRequest),
        freeShippingCreditAfter: Math.max(0, freeShipping),
      });
    }

    return res.json({
      success: true,
      data: {
        business: org,
        balance: Number(balanceSnapshot?.balance || 0),
        paidCredit: Number(balanceSnapshot?.paidCredit || 0),
        freeRequestCredit: Number(balanceSnapshot?.freeRequestCredit || 0),
        freeShippingCredit: Number(balanceSnapshot?.freeShippingCredit || 0),
        spentAmount: Math.max(0, spent),
        history: history.reverse(),
      },
    });
  } catch (error) {
    console.error("adminGetBusinessCreditDetail error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자 크레딧 상세 조회에 실패했습니다.",
    });
  }
}

export async function adminGetAdminCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const startDateRaw = String(req.query.startDate || "").trim();
    const endDateRaw = String(req.query.endDate || "").trim();

    const total = await User.countDocuments({ role: "admin" });

    const admins = await User.find({ role: "admin" })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        active: 1,
        createdAt: 1,
        businessAnchorId: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const periodOccurredAt = {};
    if (startDateRaw) {
      const start = new Date(startDateRaw);
      if (!Number.isNaN(start.getTime())) periodOccurredAt.$gte = start;
    }
    if (endDateRaw) {
      const end = new Date(endDateRaw);
      if (!Number.isNaN(end.getTime())) periodOccurredAt.$lte = end;
    }

    const adminAnchorIds = Array.from(
      new Set(
        admins
          .map((a) => String(a?.businessAnchorId || ""))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    const aggregateAdminWallet = async ({ withPeriod = false }) => {
      if (!adminAnchorIds.length) return [];
      return LedgerLine.aggregate([
        {
          $match: {
            ownerRole: "admin",
            ownerId: { $in: adminAnchorIds },
            accountCode: "REV_ADMIN",
            ...(withPeriod && Object.keys(periodOccurredAt).length
              ? { occurredAt: periodOccurredAt }
              : {}),
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
          $addFields: {
            ownerIdStr: { $toString: "$ownerId" },
            type: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                    then: "PAYOUT",
                  },
                  {
                    case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                    then: "ADJUST",
                  },
                ],
                default: "EARN",
              },
            },
            settlementEligible: {
              $or: [
                { $eq: ["$type", "PAYOUT"] },
                {
                  $and: [
                    { $in: ["$type", ["EARN", "ADJUST"]] },
                    {
                      $or: [
                        { $eq: ["$creditKind", "PAID"] },
                        { $eq: ["$creditKind", null] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $match: { settlementEligible: true } },
        {
          $group: {
            _id: { ownerId: "$ownerIdStr", type: "$type" },
            total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
          },
        },
      ]);
    };

    const aggregateAdminFree = async ({ withPeriod = false }) => {
      if (!adminAnchorIds.length) return [];
      return LedgerLine.aggregate([
        {
          $match: {
            ownerRole: "admin",
            ownerId: { $in: adminAnchorIds },
            accountCode: "REV_ADMIN",
            ...(withPeriod && Object.keys(periodOccurredAt).length
              ? { occurredAt: periodOccurredAt }
              : {}),
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
          $addFields: {
            ownerIdStr: { $toString: "$ownerId" },
            eventType: { $ifNull: ["$journalDoc.eventType", ""] },
            baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
          },
        },
        {
          $group: {
            _id: { ownerId: "$ownerIdStr" },
            freeRequestAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_REQUEST"] },
                      { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    ],
                  },
                  "$baseAmount",
                  0,
                ],
              },
            },
            freeRequestCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_REQUEST"] },
                      { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            freeShippingAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_SHIPPING"] },
                      { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    ],
                  },
                  "$baseAmount",
                  0,
                ],
              },
            },
            freeShippingCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$creditKind", "FREE_SHIPPING"] },
                      { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);
    };

    const [allRows, periodRows, allFreeRows, periodFreeRows] = await Promise.all([
      aggregateAdminWallet({ withPeriod: false }),
      aggregateAdminWallet({ withPeriod: true }),
      aggregateAdminFree({ withPeriod: false }),
      aggregateAdminFree({ withPeriod: true }),
    ]);

    const allMap = new Map();
    for (const row of allRows || []) {
      const ownerId = String(row?._id?.ownerId || "");
      const type = String(row?._id?.type || "");
      const totalAmount = Number(row?.total || 0);
      if (!ownerId) continue;
      const prev = allMap.get(ownerId) || { earn: 0, payout: 0, adjust: 0 };
      if (type === "EARN") prev.earn += totalAmount;
      else if (type === "PAYOUT") prev.payout += totalAmount;
      else if (type === "ADJUST") prev.adjust += totalAmount;
      allMap.set(ownerId, prev);
    }

    const periodMap = new Map();
    for (const row of periodRows || []) {
      const ownerId = String(row?._id?.ownerId || "");
      const type = String(row?._id?.type || "");
      const totalAmount = Number(row?.total || 0);
      if (!ownerId) continue;
      const prev = periodMap.get(ownerId) || { earn: 0, payout: 0, adjust: 0 };
      if (type === "EARN") prev.earn += totalAmount;
      else if (type === "PAYOUT") prev.payout += totalAmount;
      else if (type === "ADJUST") prev.adjust += totalAmount;
      periodMap.set(ownerId, prev);
    }

    const allFreeMap = new Map();
    for (const row of allFreeRows || []) {
      const ownerId = String(row?._id?.ownerId || "");
      if (!ownerId) continue;
      const freeRequestAmount = Number(row?.freeRequestAmount || 0);
      const freeRequestCount = Number(row?.freeRequestCount || 0);
      const freeShippingAmount = Number(row?.freeShippingAmount || 0);
      const freeShippingCount = Number(row?.freeShippingCount || 0);
      allFreeMap.set(ownerId, {
        freeRequestAmount,
        freeRequestCount,
        freeShippingAmount,
        freeShippingCount,
        freeAmount: freeRequestAmount + freeShippingAmount,
      });
    }

    const periodFreeMap = new Map();
    for (const row of periodFreeRows || []) {
      const ownerId = String(row?._id?.ownerId || "");
      if (!ownerId) continue;
      const freeRequestAmount = Number(row?.freeRequestAmount || 0);
      const freeRequestCount = Number(row?.freeRequestCount || 0);
      const freeShippingAmount = Number(row?.freeShippingAmount || 0);
      const freeShippingCount = Number(row?.freeShippingCount || 0);
      periodFreeMap.set(ownerId, {
        freeRequestAmount,
        freeRequestCount,
        freeShippingAmount,
        freeShippingCount,
        freeAmount: freeRequestAmount + freeShippingAmount,
      });
    }

    const results = admins.map((admin) => {
      const ownerId = String(admin?.businessAnchorId || "");
      const all = allMap.get(ownerId) || { earn: 0, payout: 0, adjust: 0 };
      const period = periodMap.get(ownerId) || { earn: 0, payout: 0, adjust: 0 };

      const allFree = allFreeMap.get(ownerId) || {
        freeRequestAmount: 0,
        freeRequestCount: 0,
        freeShippingAmount: 0,
        freeShippingCount: 0,
        freeAmount: 0,
      };
      const periodFree = periodFreeMap.get(ownerId) || {
        freeRequestAmount: 0,
        freeRequestCount: 0,
        freeShippingAmount: 0,
        freeShippingCount: 0,
        freeAmount: 0,
      };

      const balanceAmount = all.earn - all.payout + all.adjust;
      const balanceAmountPeriod = period.earn - period.payout + period.adjust;

      return {
        adminUserId: admin._id,
        businessAnchorId: admin?.businessAnchorId || null,
        name: admin.name,
        email: admin.email,
        active: admin.active,
        createdAt: admin.createdAt,
        wallet: {
          earnedAmount: all.earn,
          paidOutAmount: all.payout,
          adjustedAmount: all.adjust,
          balanceAmount,
          earnedAmountPeriod: period.earn,
          paidOutAmountPeriod: period.payout,
          adjustedAmountPeriod: period.adjust,
          balanceAmountPeriod,
          freeRequestAmount: allFree.freeRequestAmount,
          freeRequestCount: allFree.freeRequestCount,
          freeShippingAmount: allFree.freeShippingAmount,
          freeShippingCount: allFree.freeShippingCount,
          freeAmount: allFree.freeAmount,
          freeRequestAmountPeriod: periodFree.freeRequestAmount,
          freeRequestCountPeriod: periodFree.freeRequestCount,
          freeShippingAmountPeriod: periodFree.freeShippingAmount,
          freeShippingCountPeriod: periodFree.freeShippingCount,
          freeAmountPeriod: periodFree.freeAmount,
        },
      };
    });

    return res.json({
      success: true,
      data: {
        items: results,
        total,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetAdminCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "관리자 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetAdminLedger(req, res) {
  try {
    const adminIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(adminIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "관리자 ID가 올바르지 않습니다.",
      });
    }

    const adminUser = await User.findById(adminIdRaw)
      .select({ _id: 1, role: 1, businessAnchorId: 1 })
      .lean();
    if (!adminUser?._id) {
      return res.status(404).json({
        success: false,
        message: "관리자를 찾을 수 없습니다.",
      });
    }

    const ownerAnchorIdRaw = String(adminUser?.businessAnchorId || "").trim();
    if (!ownerAnchorIdRaw || !Types.ObjectId.isValid(ownerAnchorIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "관리자 사업체 정보가 없습니다.",
      });
    }

    const typeRaw = String(req.query.type || "")
      .trim()
      .toUpperCase();
    const periodRaw = String(req.query.period || "").trim();
    const qRaw = String(req.query.q || "").trim();

    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(req.query.pageSize || 50) || 50),
    );

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      !["EARN", "ADJUST", "PAYOUT"].includes(typeRaw)
    ) {
      return res.json({
        success: true,
        data: { items: [], total: 0, page, pageSize },
      });
    }

    const match = {
      ownerRole: "admin",
      ownerId: new Types.ObjectId(ownerAnchorIdRaw),
      accountCode: "REV_ADMIN",
    };

    const occurredAt = {};
    const sinceFromPeriod = parsePeriod(periodRaw);
    if (sinceFromPeriod) {
      occurredAt.$gte = sinceFromPeriod;
    }

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    if (fromRaw) {
      const from = new Date(fromRaw);
      if (!Number.isNaN(from.getTime())) {
        occurredAt.$gte = from;
      }
    }

    if (toRaw) {
      const to = new Date(toRaw);
      if (!Number.isNaN(to.getTime())) {
        occurredAt.$lte = to;
      }
    }

    if (Object.keys(occurredAt).length) {
      match.occurredAt = occurredAt;
    }

    const pipeline = [
      { $match: match },
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
        $addFields: {
          uniqueKey: {
            $concat: [
              "gl:",
              { $ifNull: ["$journalDoc.meta.spendUniqueKey", "$journalId"] },
            ],
          },
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                  then: "PAYOUT",
                },
                {
                  case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "EARN",
            },
          },
          amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
          settlementEligible: {
            $or: [
              { $eq: ["$type", "PAYOUT"] },
              {
                $and: [
                  { $in: ["$type", ["EARN", "ADJUST"]] },
                  {
                    $or: [
                      { $eq: ["$creditKind", "PAID"] },
                      { $eq: ["$creditKind", null] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $match: { settlementEligible: true } },
    ];

    if (typeRaw === "EARN" || typeRaw === "ADJUST" || typeRaw === "PAYOUT") {
      pipeline.push({ $match: { type: typeRaw } });
    }

    if (qRaw) {
      const rx = safeRegex(qRaw);
      const ors = [];
      if (rx) {
        ors.push({ uniqueKey: rx });
        ors.push({ refType: rx });
      }
      if (Types.ObjectId.isValid(qRaw)) {
        ors.push({ refId: new Types.ObjectId(qRaw) });
      }
      if (ors.length) {
        pipeline.push({
          $match: {
            $or: ors,
          },
        });
      }
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $project: {
          _id: 1,
          journalId: 1,
          type: 1,
          amount: "$amountBase",
          amountExcludingVat: "$amountBase",
          vatAmount: { $literal: 0 },
          amountIncludingVat: "$amountBase",
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          createdAt: "$occurredAt",
          occurredAt: "$occurredAt",
        },
      },
    );

    const allRows = await LedgerLine.aggregate(pipeline);

    let totalBalance = 0;
    for (const r of allRows) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }

    const total = Array.isArray(allRows) ? allRows.length : 0;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;

    let skippedSum = 0;
    for (const r of allRows.slice(0, startIdx)) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }

    let runningBalance = totalBalance - skippedSum;
    const items = allRows.slice(startIdx, endIdx).map((r) => {
      const v = Number(r?.amount || 0);
      const t = String(r?.type || "");
      const balanceAfter = runningBalance;
      if (t === "EARN" || t === "ADJUST") runningBalance -= v;
      else if (t === "PAYOUT") runningBalance += v;
      return { ...r, balanceAfter };
    });

    return res.json({
      success: true,
      data: { items, total, page, pageSize },
    });
  } catch (error) {
    console.error("adminGetAdminLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "관리자 원장 조회에 실패했습니다.",
    });
  }
}
