import CreditLedger from "../../models/creditLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import User from "../../models/user.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import Request from "../../models/request.model.js";
import { Types } from "mongoose";
import {
  getLast30DaysRangeUtc,
  getTodayMidnightUtcInKst,
  getTodayYmdInKst,
  getThisMonthStartYmdInKst,
} from "../../utils/krBusinessDays.js";
import { normalizeBusinessNumber } from "../../utils/businessAnchor.utils.js";
import AdminSalesmanCreditsOverviewSnapshot from "../../models/adminSalesmanCreditsOverviewSnapshot.model.js";
import { buildSalesmanReferralAggregation } from "./adminCredit.salesmanAggregation.js";

const REFERRAL_LEADER_ROLES = ["salesman", "devops"];

function normalizeNumber(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function buildRequestSummary(doc) {
  if (!doc?._id) return null;
  return {
    requestId: String(doc.requestId || ""),
    manufacturerStage: String(doc.manufacturerStage || ""),
    patientName: String(doc?.caseInfos?.patientName || ""),
    tooth: String(doc?.caseInfos?.tooth || ""),
    clinicName: String(doc?.caseInfos?.clinicName || ""),
    lotNumber: {
      value: String(doc?.lotNumber?.value || ""),
    },
  };
}

function parseBonusGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "").trim();
  const m = raw.match(/^bonus_grant:(.+)$/);
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
  const commissionRate = 0.05;

  const ledgerPeriodRows = await SalesmanLedger.aggregate([
    {
      $match: {
        salesmanId: { $in: salesmanIds },
        createdAt: { $gte: range.start, $lte: range.end },
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
      },
    },
  ]);

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
  const {
    salesmenById,
    directOrgIdsBySalesmanId,
    level1OrgIdsBySalesmanId,
    revenueByOrgId,
  } = await buildSalesmanReferralAggregation({
    salesmanIds,
    range,
  });

  let paidRevenueAmount = 0;
  let bonusRevenueAmount = 0;
  let orderCount = 0;
  for (const row of revenueByOrgId.values()) {
    paidRevenueAmount += Number(row.revenueAmount || 0);
    bonusRevenueAmount += Number(row.bonusAmount || 0);
    orderCount += Number(row.orderCount || 0);
  }

  let directAmount = 0;
  for (const orgSet of directOrgIdsBySalesmanId.values()) {
    let rev = 0;
    for (const oid of orgSet) {
      rev += Number(revenueByOrgId.get(String(oid))?.revenueAmount || 0);
    }
    directAmount += rev * commissionRate;
  }

  let indirectAmount = 0;
  for (const [sid, orgSet] of level1OrgIdsBySalesmanId.entries()) {
    const salesmanRole = String(salesmenById?.get(sid)?.role || "");
    if (salesmanRole === "devops") continue;
    let rev = 0;
    for (const oid of orgSet || []) {
      rev += Number(revenueByOrgId.get(String(oid))?.revenueAmount || 0);
    }
    indirectAmount += rev * commissionRate * 0.5;
  }

  const totalAmount = normalizeNumber(directAmount + indirectAmount);

  return {
    salesmenCount: salesmanIds.length,
    referral: {
      paidRevenueAmount: normalizeNumber(paidRevenueAmount),
      bonusRevenueAmount: normalizeNumber(bonusRevenueAmount),
      orderCount: normalizeNumber(orderCount),
    },
    commission: {
      totalAmount,
      directAmount: normalizeNumber(directAmount),
      indirectAmount: normalizeNumber(indirectAmount),
    },
    walletPeriod: {
      earnedAmount: normalizeNumber(earnedAmount),
      paidOutAmount: normalizeNumber(paidOutAmount),
      adjustedAmount: normalizeNumber(adjustedAmount),
      balanceAmount: normalizeNumber(balanceAmount),
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
    },
    commission: {
      totalAmount: normalizeNumber(overview?.commission?.totalAmount),
      directAmount: normalizeNumber(overview?.commission?.directAmount),
      indirectAmount: normalizeNumber(overview?.commission?.indirectAmount),
    },
    walletPeriod: {
      earnedAmount: normalizeNumber(overview?.walletPeriod?.earnedAmount),
      paidOutAmount: normalizeNumber(overview?.walletPeriod?.paidOutAmount),
      adjustedAmount: normalizeNumber(overview?.walletPeriod?.adjustedAmount),
      balanceAmount: normalizeNumber(overview?.walletPeriod?.balanceAmount),
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
    const range = getPeriodRangeUtcFromPeriodKey(periodKey);
    if (!range) {
      return res.status(500).json({
        success: false,
        message: "기간 계산에 실패했습니다.",
      });
    }

    const ymd = getTodayYmdInKst();
    if (!ymd) {
      return res.status(500).json({
        success: false,
        message: "날짜 계산에 실패했습니다.",
      });
    }

    const refresh = String(req.query.refresh || "") === "1";
    if (!refresh) {
      const cached = await AdminSalesmanCreditsOverviewSnapshot.findOne({
        ymd,
        periodKey,
      })
        .select({
          _id: 0,
          ymd: 1,
          periodKey: 1,
          rangeStartUtc: 1,
          rangeEndUtc: 1,
          salesmenCount: 1,
          referral: 1,
          commission: 1,
          walletPeriod: 1,
          computedAt: 1,
        })
        .lean();
      if (cached?.computedAt) {
        return res.status(200).json({
          success: true,
          data: cached,
          cached: true,
        });
      }
    }

    const payload = await recalcAdminSalesmanCreditsOverviewSnapshot({
      periodKey,
    });
    if (!payload) {
      return res.status(500).json({
        success: false,
        message: "영업자 크레딧 요약 스냅샷 재계산에 실패했습니다.",
      });
    }

    return res
      .status(200)
      .json({ success: true, data: payload, cached: false });
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

    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "해당 사업자에 businessAnchorId가 없습니다.",
      });
    }

    const match = { businessAnchorId };

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      ["CHARGE", "BONUS", "SPEND", "REFUND", "ADJUST"].includes(typeRaw)
    ) {
      match.type = typeRaw;
    }

    const createdAt = {};
    const sinceFromPeriod = parsePeriod(periodRaw);
    if (sinceFromPeriod) {
      createdAt.$gte = sinceFromPeriod;
    }

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    if (fromRaw) {
      const from = new Date(fromRaw);
      if (!Number.isNaN(from.getTime())) {
        createdAt.$gte = from;
      }
    }

    if (toRaw) {
      const to = new Date(toRaw);
      if (!Number.isNaN(to.getTime())) {
        createdAt.$lte = to;
      }
    }

    if (Object.keys(createdAt).length) {
      match.createdAt = createdAt;
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
        match.$or = ors;
      }
    }

    // running balance: 전체 잔액 계산 (필터 무관)
    const allLedgerRows = await CreditLedger.aggregate([
      { $match: { businessAnchorId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    let totalBalance = Number(allLedgerRows[0]?.total || 0);

    const skippedRows =
      (page - 1) * pageSize > 0
        ? await CreditLedger.find(match)
            .sort({ createdAt: -1, _id: -1 })
            .limit((page - 1) * pageSize)
            .select({ amount: 1 })
            .lean()
        : [];
    let skippedSum = 0;
    for (const r of skippedRows) skippedSum += Number(r.amount || 0);

    const [total, rawItems] = await Promise.all([
      CreditLedger.countDocuments(match),
      CreditLedger.find(match)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select({
          type: 1,
          amount: 1,
          spentPaidAmount: 1,
          spentBonusAmount: 1,
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          userId: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

    let runningBalance = totalBalance - skippedSum;
    const items = (Array.isArray(rawItems) ? rawItems : []).map((r) => {
      const balanceAfter = runningBalance;
      runningBalance -= Number(r.amount || 0);
      return { ...r, balanceAfter };
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

    const welcomeBonusGrantIds = Array.from(
      new Set(
        (items || [])
          .filter((it) => String(it?.refType || "") === "WELCOME_BONUS")
          .map((it) => parseBonusGrantIdFromUniqueKey(it?.uniqueKey))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    const refRequestIdById = new Map();
    const refRequestSummaryById = new Map();
    if (requestRefIds.length > 0) {
      const requestDocs = await Request.find({
        _id: { $in: requestRefIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({
          _id: 1,
          requestId: 1,
          manufacturerStage: 1,
          lotNumber: 1,
          "caseInfos.patientName": 1,
          "caseInfos.tooth": 1,
          "caseInfos.clinicName": 1,
        })
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
        shippingTrackingNumbersByPackageId.set(
          String(pkg._id),
          trackingNumbers,
        );
      }
    }

    const welcomeBonusReasonByGrantId = new Map();
    if (welcomeBonusGrantIds.length > 0) {
      const grants = await BonusGrant.find({
        _id: { $in: welcomeBonusGrantIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ _id: 1, source: 1, overrideReason: 1, businessNumber: 1 })
        .lean();

      for (const grant of grants || []) {
        if (!grant?._id) continue;
        const source = String(grant.source || "");
        const overrideReason = String(grant.overrideReason || "").trim();
        const businessNumber = String(grant.businessNumber || "").trim();
        let reason = "가입 축하 크레딧";
        if (source === "admin" && overrideReason) {
          reason = `관리자 지급 · ${overrideReason}`;
        } else if (source === "migrated") {
          reason = "시드/마이그레이션 가입 축하 크레딧";
        }
        if (businessNumber) {
          reason = `${reason} · 사업자번호 ${businessNumber}`;
        }
        welcomeBonusReasonByGrantId.set(String(grant._id), reason);
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

      if (refType === "WELCOME_BONUS") {
        const grantId = parseBonusGrantIdFromUniqueKey(it?.uniqueKey);
        return {
          ...it,
          bonusReason: grantId
            ? welcomeBonusReasonByGrantId.get(grantId) || ""
            : "",
        };
      }

      return it;
    });

    return res.json({
      success: true,
      data: { items: enrichedItems, total, page, pageSize },
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
      .select({ _id: 1, role: 1, active: 1 })
      .lean();
    if (!salesman || String(salesman.role || "") !== "salesman") {
      return res.status(404).json({
        success: false,
        message: "영업자를 찾을 수 없습니다.",
      });
    }

    const ledgerRows = await SalesmanLedger.aggregate([
      { $match: { salesmanId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
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
    const uniqueKey = `admin:salesman:payout:${String(salesmanId)}:${now.getTime()}`;
    const created = await SalesmanLedger.create({
      salesmanId,
      type: "PAYOUT",
      amount,
      refType: "ADMIN_PAYOUT",
      refId: null,
      uniqueKey,
    });

    return res.status(200).json({
      success: true,
      data: {
        _id: created?._id,
        salesmanId: String(salesmanId),
        amount,
        type: "PAYOUT",
        createdAt: created?.createdAt,
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
    const [
      totalOrgs,
      totalChargeOrders,
      totalBankTransactions,
      pendingChargeOrders,
      matchedChargeOrders,
      newBankTransactions,
      matchedBankTransactions,
    ] = await Promise.all([
      BusinessAnchor.countDocuments({ businessType: "requestor" }),
      ChargeOrder.countDocuments(),
      BankTransaction.countDocuments(),
      ChargeOrder.countDocuments({ status: "PENDING" }),
      ChargeOrder.countDocuments({ status: "MATCHED" }),
      BankTransaction.countDocuments({ status: "NEW" }),
      BankTransaction.countDocuments({ status: "MATCHED" }),
    ]);

    const [totalCreditLedger, bonusBreakdown] = await Promise.all([
      CreditLedger.aggregate([
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      CreditLedger.aggregate([
        {
          $match: { type: "BONUS" },
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$refType", "FREE_SHIPPING_CREDIT"] },
                "shipping",
                "request",
              ],
            },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const ledgerByType = {};
    totalCreditLedger.forEach((item) => {
      ledgerByType[item._id] = {
        totalAmount: item.totalAmount,
        count: item.count,
      };
    });

    const bonusByCategory = {};
    bonusBreakdown.forEach((item) => {
      bonusByCategory[item._id] = Math.abs(item.totalAmount || 0);
    });

    const totalCharged = Math.abs(ledgerByType.CHARGE?.totalAmount || 0);
    const totalSpent = Math.abs(ledgerByType.SPEND?.totalAmount || 0);
    const totalBonus = Math.abs(ledgerByType.BONUS?.totalAmount || 0);
    const totalBonusRequest = bonusByCategory.request || 0;
    const totalBonusShipping = bonusByCategory.shipping || 0;

    const creditSummary = await CreditLedger.aggregate([
      {
        $group: {
          _id: null,
          chargedPaid: {
            $sum: {
              $cond: [
                { $in: ["$type", ["CHARGE", "REFUND"]] },
                { $abs: "$amount" },
                0,
              ],
            },
          },
          chargedBonusRequest: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "BONUS"] },
                    { $ne: ["$refType", "FREE_SHIPPING_CREDIT"] },
                  ],
                },
                { $abs: "$amount" },
                0,
              ],
            },
          },
          chargedBonusShipping: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "BONUS"] },
                    { $eq: ["$refType", "FREE_SHIPPING_CREDIT"] },
                  ],
                },
                { $abs: "$amount" },
                0,
              ],
            },
          },
          adjustSum: {
            $sum: {
              $cond: [{ $eq: ["$type", "ADJUST"] }, "$amount", 0],
            },
          },
          spentPaidSum: {
            $sum: {
              $cond: [
                { $eq: ["$type", "SPEND"] },
                { $ifNull: ["$spentPaidAmount", 0] },
                0,
              ],
            },
          },
          spentBonusRequestSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "SPEND"] },
                    { $ne: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                { $ifNull: ["$spentBonusAmount", 0] },
                0,
              ],
            },
          },
          spentBonusShippingSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "SPEND"] },
                    { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                { $ifNull: ["$spentBonusAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const summary = creditSummary[0] || {};
    const totalSpentPaidAmount = Number(summary.spentPaidSum || 0);
    const totalSpentBonusRequestAmount = Number(
      summary.spentBonusRequestSum || 0,
    );
    const totalSpentBonusShippingAmount = Number(
      summary.spentBonusShippingSum || 0,
    );
    const totalPaidCredit = Math.max(
      0,
      Number(summary.chargedPaid || 0) +
        Number(summary.adjustSum || 0) -
        totalSpentPaidAmount,
    );
    const totalBonusRequestCredit = Math.max(
      0,
      Number(summary.chargedBonusRequest || 0) - totalSpentBonusRequestAmount,
    );
    const totalBonusShippingCredit = Math.max(
      0,
      Number(summary.chargedBonusShipping || 0) - totalSpentBonusShippingAmount,
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
        totalCharged,
        totalSpent,
        totalBonus,
        totalBonusRequest: Math.max(0, Math.round(totalBonusRequest)),
        totalBonusShipping: Math.max(0, Math.round(totalBonusShipping)),
        totalSpentPaidAmount: Math.max(0, Math.round(totalSpentPaidAmount)),
        totalSpentBonusRequestAmount: Math.max(
          0,
          Math.round(totalSpentBonusRequestAmount),
        ),
        totalSpentBonusShippingAmount: Math.max(
          0,
          Math.round(totalSpentBonusShippingAmount),
        ),
        totalPaidCredit: Math.max(0, Math.round(totalPaidCredit)),
        totalBonusRequestCredit: Math.max(
          0,
          Math.round(totalBonusRequestCredit),
        ),
        totalBonusShippingCredit: Math.max(
          0,
          Math.round(totalBonusShippingCredit),
        ),
        ledgerByType,
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
    const commissionRate = 0.05;

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

    // 기간 필터 적용된 ledger 집계
    const ledgerPeriodMatch = { salesmanId: { $in: salesmanIds } };
    if (periodCutoff) ledgerPeriodMatch.createdAt = { $gte: periodCutoff };
    if (periodEnd) {
      ledgerPeriodMatch.createdAt = ledgerPeriodMatch.createdAt || {};
      ledgerPeriodMatch.createdAt.$lte = periodEnd;
    }

    // 병렬 실행: BusinessAnchor 조회 + 2개의 SalesmanLedger aggregate
    const [anchors, ledgerRows, ledgerRowsPeriod] = await Promise.all([
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
      SalesmanLedger.aggregate([
        { $match: { salesmanId: { $in: salesmanIds } } },
        {
          $group: {
            _id: { salesmanId: "$salesmanId", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ]),
      SalesmanLedger.aggregate([
        { $match: ledgerPeriodMatch },
        {
          $group: {
            _id: { salesmanId: "$salesmanId", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const anchorById = new Map(
      (anchors || []).map((a) => [String(a?._id || ""), a]),
    );

    // 잔액(balance)은 항상 전체 기간 기준 (정산 전 잔액)
    const ledgerBySalesmanId = new Map();
    for (const r of ledgerRows) {
      const sid = String(r?._id?.salesmanId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!sid) continue;
      const prev = ledgerBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledgerBySalesmanId.set(sid, prev);
    }

    const ledgerPeriodBySalesmanId = new Map();
    for (const r of ledgerRowsPeriod) {
      const sid = String(r?._id?.salesmanId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!sid) continue;
      const prev = ledgerPeriodBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledgerPeriodBySalesmanId.set(sid, prev);
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
      level1OrgIdsBySalesmanId,
      referredSalesmanCountBySalesmanId,
      revenueByOrgId,
    } = await buildSalesmanReferralAggregation({
      salesmanIds,
      range,
    });

    const items = salesmen.map((s) => {
      const sid = String(s._id);
      const ledger = ledgerBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };

      const ledgerPeriod = ledgerPeriodBySalesmanId.get(sid) || {
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

      const directOrgSet = directOrgIdsBySalesmanId.get(sid) || new Set();
      const level1OrgSet = level1OrgIdsBySalesmanId.get(sid) || new Set();

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

      let level1Revenue30d = 0;
      let level1Bonus30d = 0;
      let level1Orders30d = 0;
      for (const orgId of level1OrgSet) {
        const row = revenueByOrgId.get(String(orgId));
        if (!row) continue;
        level1Revenue30d += Number(row.revenueAmount || 0);
        level1Bonus30d += Number(row.bonusAmount || 0);
        level1Orders30d += Number(row.orderCount || 0);
      }

      const revenue30d = directRevenue30d + level1Revenue30d;
      const bonus30d = directBonus30d + level1Bonus30d;
      const orders30d = directOrders30d + level1Orders30d;
      const myCommission30d = Math.round(directRevenue30d * commissionRate);
      const isDevops = String(s?.role || "") === "devops";
      const level1Commission30d = isDevops
        ? 0
        : Math.round(level1Revenue30d * commissionRate * 0.5); // 2.5%
      const commission30d = myCommission30d + level1Commission30d;
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
        },
        performance30d: {
          referredOrgCount: directOrgSet.size,
          level1OrgCount: level1OrgSet.size,
          revenueAmount: Math.round(revenue30d),
          directRevenueAmount: Math.round(directRevenue30d),
          level1RevenueAmount: Math.round(level1Revenue30d),
          bonusAmount: Math.round(bonus30d),
          directBonusAmount: Math.round(directBonus30d),
          level1BonusAmount: Math.round(level1Bonus30d),
          orderCount: Math.round(orders30d),
          commissionAmount: Math.round(commission30d),
          myCommissionAmount: Math.round(myCommission30d),
          level1CommissionAmount: Math.round(level1Commission30d),
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

    const total = await User.countDocuments({
      role: { $in: REFERRAL_LEADER_ROLES },
    });
    return res.json({
      success: true,
      data: {
        items: sortedItems.slice(skip, skip + limit),
        total,
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
    const range = getPeriodRangeUtcFromPeriodKey(periodKey);

    const [anchorCount, periodLedgerRows, allLedgerRows] = await Promise.all([
      BusinessAnchor.countDocuments({ businessType: "manufacturer" }),
      range
        ? ManufacturerCreditLedger.aggregate([
            {
              $match: {
                occurredAt: { $gte: range.start, $lte: range.end },
              },
            },
            {
              $group: {
                _id: "$type",
                total: { $sum: "$amount" },
              },
            },
          ])
        : Promise.resolve([]),
      ManufacturerCreditLedger.aggregate([
        {
          $group: {
            _id: { org: "$manufacturerOrganization", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ]),
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
      const org = String(r?._id?.org || "");
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

    return res.json({
      success: true,
      data: {
        anchorCount,
        periodEarnedAmount,
        periodPaidOutAmount,
        periodBalanceAmount,
        totalBalanceAmount,
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
  const now = Date.now();
  if (p === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (p === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (p === "90d") return new Date(now - 90 * 24 * 60 * 60 * 1000);
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
    const salesmanId = new Types.ObjectId(salesmanIdRaw);

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

    const match = { salesmanId };

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      ["EARN", "PAYOUT", "ADJUST"].includes(typeRaw)
    ) {
      match.type = typeRaw;
    }

    const createdAt = {};

    const sinceFromPeriod = parsePeriod(periodRaw);
    if (sinceFromPeriod) {
      createdAt.$gte = sinceFromPeriod;
    }

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    if (fromRaw) {
      const from = new Date(fromRaw);
      if (!Number.isNaN(from.getTime())) {
        createdAt.$gte = from;
      }
    }

    if (toRaw) {
      const to = new Date(toRaw);
      if (!Number.isNaN(to.getTime())) {
        createdAt.$lte = to;
      }
    }

    if (Object.keys(createdAt).length) {
      match.createdAt = createdAt;
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
        match.$or = ors;
      }
    }

    // running balance를 위해 전체 누적 잔액 계산 (필터 무관)
    const allLedgerRows = await SalesmanLedger.aggregate([
      { $match: { salesmanId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    let totalBalance = 0;
    for (const r of allLedgerRows) {
      const t = String(r._id || "");
      const v = Number(r.total || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }

    // 현재 페이지 이후(더 오래된) 항목들의 합산 잔액 계산
    // sort: createdAt desc → 페이지1이 가장 최신
    // skip된 항목들(더 최신)의 합을 전체잔액에서 빼면 현재 페이지 첫 항목 직후 잔액
    const skippedRows =
      (page - 1) * pageSize > 0
        ? await SalesmanLedger.find(match)
            .sort({ createdAt: -1, _id: -1 })
            .limit((page - 1) * pageSize)
            .select({ type: 1, amount: 1 })
            .lean()
        : [];
    let skippedSum = 0;
    for (const r of skippedRows) {
      const t = String(r.type || "");
      const v = Number(r.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }

    const [total, rawItems] = await Promise.all([
      SalesmanLedger.countDocuments(match),
      SalesmanLedger.find(match)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select({
          type: 1,
          amount: 1,
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

    // running balance: 각 행 이후의 잔액 (최신→과거 순)
    let runningBalance = totalBalance - skippedSum;
    const items = (Array.isArray(rawItems) ? rawItems : []).map((r) => {
      const v = Number(r.amount || 0);
      const t = String(r.type || "");
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

    const orgs = await BusinessAnchor.find({ businessType: "requestor" })
      .select({
        name: 1,
        primaryContactUserId: 1,
        extracted: 1,
        businessAnchorId: 1,
        businessType: 1,
      })
      .sort({ createdAt: -1 })
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

    const businessNumberNormalizedSet = new Set(
      (orgs || [])
        .map((org) =>
          normalizeBusinessNumber(org?.extracted?.businessNumber || ""),
        )
        .filter(Boolean),
    );

    const [owners, anchors] = await Promise.all([
      ownerIds.length
        ? User.find({ _id: { $in: ownerIds } })
            .select({
              _id: 1,
              name: 1,
              email: 1,
              businessAnchorId: 1,
              businessId: 1,
            })
            .lean()
        : Promise.resolve([]),
      businessNumberNormalizedSet.size
        ? BusinessAnchor.find({
            businessNumberNormalized: {
              $in: Array.from(businessNumberNormalizedSet),
            },
          })
            .select({
              _id: 1,
              businessNumberNormalized: 1,
              sourceBusinessId: 1,
            })
            .lean()
        : Promise.resolve([]),
    ]);

    const ownerById = new Map(
      (owners || []).map((u) => [
        String(u._id),
        {
          name: u.name,
          email: u.email,
          businessAnchorId: u.businessAnchorId || null,
          businessId: u.businessId || null,
        },
      ]),
    );

    const anchorIdByBusinessNumber = new Map(
      (anchors || []).map((anchor) => [
        String(anchor?.businessNumberNormalized || ""),
        String(anchor?._id || ""),
      ]),
    );

    const anchorIdBySourceBusinessId = new Map(
      (anchors || [])
        .filter((anchor) => anchor?.sourceBusinessId)
        .map((anchor) => [
          String(anchor?.sourceBusinessId || ""),
          String(anchor?._id || ""),
        ]),
    );

    const resolvedAnchorIdByBusinessId = new Map();
    for (const org of orgs || []) {
      const businessId = String(org?._id || "");
      const directAnchorId = String(org?.businessAnchorId || "").trim();
      const ownerInfo = ownerById.get(String(org?.owner || "")) || null;
      const ownerAnchorId = String(ownerInfo?.businessAnchorId || "").trim();
      const normalizedBusinessNumber = normalizeBusinessNumber(
        org?.extracted?.businessNumber || "",
      );
      const mappedAnchorId =
        directAnchorId ||
        ownerAnchorId ||
        String(anchorIdBySourceBusinessId.get(businessId) || "") ||
        String(anchorIdByBusinessNumber.get(normalizedBusinessNumber) || "");
      if (businessId) {
        resolvedAnchorIdByBusinessId.set(businessId, mappedAnchorId);
      }
    }

    const orgAnchorIds = Array.from(
      new Set(
        Array.from(resolvedAnchorIdByBusinessId.values()).filter((id) =>
          Boolean(id),
        ),
      ),
    ).map((id) => new Types.ObjectId(String(id)));

    // CreditLedger 집계: 무료 크레딧을 의뢰용과 배송비용으로 분리
    // - bonusRequestCredit: 의뢰 결제만 가능 (배송비 결제 불가)
    // - bonusShippingCredit: 배송비 결제만 가능 (의뢰 결제 불가)
    // - paidCredit: 의뢰 + 배송비 모두 가능
    const ledgerData = orgAnchorIds.length
      ? await CreditLedger.aggregate([
          { $match: { businessAnchorId: { $in: orgAnchorIds } } },
          {
            $group: {
              _id: "$businessAnchorId",
              // 유료 크레딧 충전 (CHARGE, REFUND)
              chargedPaid: {
                $sum: {
                  $cond: [
                    { $in: ["$type", ["CHARGE", "REFUND"]] },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              // 무료 의뢰 크레딧 충전 (BONUS이지만 FREE_SHIPPING_CREDIT 아님)
              chargedBonusRequest: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "BONUS"] },
                        { $ne: ["$refType", "FREE_SHIPPING_CREDIT"] },
                      ],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              // 무료 배송비 크레딧 충전 (BONUS + FREE_SHIPPING_CREDIT)
              chargedBonusShipping: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "BONUS"] },
                        { $eq: ["$refType", "FREE_SHIPPING_CREDIT"] },
                      ],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              adjustSum: {
                $sum: {
                  $cond: [{ $eq: ["$type", "ADJUST"] }, "$amount", 0],
                },
              },
              spentTotal: {
                $sum: {
                  $cond: [{ $eq: ["$type", "SPEND"] }, { $abs: "$amount" }, 0],
                },
              },
              spentPaidSum: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "SPEND"] },
                    { $ifNull: ["$spentPaidAmount", 0] },
                    0,
                  ],
                },
              },
              // 무료 의뢰 크레딧 소비 (배송비가 아닌 의뢰 결제에 사용된 무료 크레딧)
              spentBonusRequestSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        { $ne: ["$refType", "SHIPPING_PACKAGE"] },
                      ],
                    },
                    { $ifNull: ["$spentBonusAmount", 0] },
                    0,
                  ],
                },
              },
              // 무료 배송비 크레딧 소비 (배송비 결제에 사용된 무료 크레딧)
              spentBonusShippingSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                      ],
                    },
                    { $ifNull: ["$spentBonusAmount", 0] },
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
      const chargedPaid = Number(item.chargedPaid || 0);
      const chargedBonusRequest = Number(item.chargedBonusRequest || 0);
      const chargedBonusShipping = Number(item.chargedBonusShipping || 0);
      const adjustSum = Number(item.adjustSum || 0);
      const spentTotal = Number(item.spentTotal || 0);
      const spentPaidRaw = Number(item.spentPaidSum || 0);
      const spentBonusRequestRaw = Number(item.spentBonusRequestSum || 0);
      const spentBonusShippingRaw = Number(item.spentBonusShippingSum || 0);

      // CreditLedger에 spentPaidAmount/spentBonusAmount가 저장되어 있으면 그 값 사용
      // 저장된 값이 없거나 합계가 맞지 않으면 fallback 로직 사용
      const spentBonusTotal = spentBonusRequestRaw + spentBonusShippingRaw;
      let spentPaid, spentBonusRequest, spentBonusShipping;

      if (
        Math.round(spentPaidRaw + spentBonusTotal) === Math.round(spentTotal)
      ) {
        // 저장된 값이 신뢰 가능한 경우 그대로 사용
        spentPaid = spentPaidRaw;
        spentBonusRequest = spentBonusRequestRaw;
        spentBonusShipping = spentBonusShippingRaw;
      } else {
        // fallback: 무료 크레딧 우선 차감 시뮬레이션
        // (레거시 데이터나 spentPaidAmount/spentBonusAmount 미저장 케이스 대응)
        const totalBonus = chargedBonusRequest + chargedBonusShipping;
        const spentBonus = Math.min(totalBonus, spentTotal);
        spentPaid = spentTotal - spentBonus;

        // 무료 의뢰/배송비 크레딧을 충전 비율대로 분배
        if (totalBonus > 0) {
          spentBonusRequest = spentBonus * (chargedBonusRequest / totalBonus);
          spentBonusShipping = spentBonus * (chargedBonusShipping / totalBonus);
        } else {
          spentBonusRequest = 0;
          spentBonusShipping = 0;
        }
      }

      // 최종 잔액 계산
      // - paidCredit: 유료 크레딧 잔액 (의뢰 + 배송비 모두 사용 가능)
      // - bonusRequestCredit: 무료 의뢰 크레딧 잔액 (의뢰만 사용 가능)
      // - bonusShippingCredit: 무료 배송비 크레딧 잔액 (배송비만 사용 가능)
      const paidCredit = chargedPaid + adjustSum - spentPaid;
      const bonusRequestCredit = chargedBonusRequest - spentBonusRequest;
      const bonusShippingCredit = chargedBonusShipping - spentBonusShipping;

      balanceMap[String(item._id)] = {
        balance: Math.max(
          0,
          paidCredit + bonusRequestCredit + bonusShippingCredit,
        ),
        paidCredit: Math.max(0, paidCredit),
        bonusRequestCredit: Math.max(0, bonusRequestCredit),
        bonusShippingCredit: Math.max(0, bonusShippingCredit),
        spentAmount: Math.max(0, spentTotal),
        chargedPaidAmount: Math.max(0, chargedPaid),
        chargedBonusRequestAmount: Math.max(0, chargedBonusRequest),
        chargedBonusShippingAmount: Math.max(0, chargedBonusShipping),
        spentPaidAmount: Math.max(0, spentPaid),
        spentBonusRequestAmount: Math.max(0, spentBonusRequest),
        spentBonusShippingAmount: Math.max(0, spentBonusShipping),
      };
    });

    const result = orgs.map((org) => {
      const anchorId = String(org?._id || "");
      const balanceInfo = balanceMap[anchorId] || {
        balance: 0,
        paidCredit: 0,
        bonusRequestCredit: 0,
        bonusShippingCredit: 0,
        spentAmount: 0,
        chargedPaidAmount: 0,
        chargedBonusRequestAmount: 0,
        chargedBonusShippingAmount: 0,
        spentPaidAmount: 0,
        spentBonusRequestAmount: 0,
        spentBonusShippingAmount: 0,
      };

      const ownerInfo =
        ownerById.get(String(org?.primaryContactUserId || "")) || null;

      return {
        _id: org._id,
        businessAnchorId: anchorId,
        businessType: String(org.businessType || "").trim(),
        name: org.name,
        ownerName: ownerInfo?.name || "",
        ownerEmail: ownerInfo?.email || "",
        companyName: org.extracted?.companyName || "",
        businessNumber: org.extracted?.businessNumber || "",
        // 프론트엔드 호환: paidBalance, bonusBalance 필드 제공
        paidBalance: balanceInfo.paidCredit, // 유료 잔액
        bonusBalance:
          balanceInfo.bonusRequestCredit + balanceInfo.bonusShippingCredit, // 무료 잔액 (의뢰용 + 배송비용)
        // 상세 정보: bonusRequestCredit, bonusShippingCredit 등 모든 필드 포함
        ...balanceInfo,
      };
    });

    const sortedResult = [...result].sort(
      (a, b) =>
        Number(b.paidCredit || 0) - Number(a.paidCredit || 0) ||
        Number(b.bonusRequestCredit || 0) - Number(a.bonusRequestCredit || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "ko"),
    );

    const total = await BusinessAnchor.countDocuments({
      businessType: "requestor",
    });

    return res.json({
      success: true,
      data: {
        items: sortedResult.slice(skip, skip + limit),
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

    const businessAnchorId = org?.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "해당 사업자에 businessAnchorId가 없습니다.",
      });
    }

    const ledgers = await CreditLedger.find({ businessAnchorId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    let paid = 0;
    let bonus = 0;
    let spent = 0;
    const history = [];

    for (const ledger of ledgers.reverse()) {
      const type = ledger.type;
      const amount = Number(ledger.amount || 0);
      if (!Number.isFinite(amount)) continue;
      const absAmount = Math.abs(amount);

      if (type === "CHARGE" || type === "REFUND") {
        paid += absAmount;
      } else if (type === "BONUS") {
        bonus += absAmount;
      } else if (type === "ADJUST") {
        paid += amount;
      } else if (type === "SPEND") {
        let spend = absAmount;
        spent += spend;
        const fromBonus = Math.min(bonus, spend);
        bonus -= fromBonus;
        spend -= fromBonus;
        paid -= spend;
      }

      history.push({
        ...ledger,
        balanceAfter: Math.max(0, paid + bonus),
        paidCreditAfter: Math.max(0, paid),
        bonusRequestCreditAfter: Math.max(0, bonus),
      });
    }

    return res.json({
      success: true,
      data: {
        business: org,
        balance: Math.max(0, paid + bonus),
        paidCredit: Math.max(0, paid),
        bonusRequestCredit: Math.max(0, bonus),
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
