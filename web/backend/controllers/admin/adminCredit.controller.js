import CreditLedger from "../../models/creditLedger.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
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
import AdminSalesmanCreditsOverviewSnapshot from "../../models/adminSalesmanCreditsOverviewSnapshot.model.js";

function normalizeNumber(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
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

  const directRequestors = await User.find({
    role: "requestor",
    referredByUserId: { $in: salesmanIds },
    active: true,
    organizationId: { $ne: null },
  })
    .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
    .lean();

  const childSalesmen = await User.find({
    role: "salesman",
    referredByUserId: { $in: salesmanIds },
    active: true,
  })
    .select({ _id: 1, referredByUserId: 1 })
    .lean();

  const childSalesmanIds = (childSalesmen || [])
    .map((s) => String(s?._id || ""))
    .filter(Boolean)
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const level1Requestors =
    childSalesmanIds.length === 0
      ? []
      : await User.find({
          role: "requestor",
          referredByUserId: { $in: childSalesmanIds },
          active: true,
          organizationId: { $ne: null },
        })
          .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
          .lean();

  const leaderIdByChildSalesmanId = new Map(
    (childSalesmen || [])
      .map((s) => [String(s?._id || ""), String(s?.referredByUserId || "")])
      .filter(([cid, pid]) => cid && pid),
  );

  const directOrgIdsBySalesmanId = new Map();
  for (const u of directRequestors || []) {
    const sid = String(u?.referredByUserId || "");
    const orgId = u?.organizationId ? String(u.organizationId) : "";
    if (!sid || !orgId) continue;
    const set = directOrgIdsBySalesmanId.get(sid) || new Set();
    set.add(orgId);
    directOrgIdsBySalesmanId.set(sid, set);
  }

  const requestorOrgIdsByChildSalesmanId = new Map();
  const level1OrgIdsBySalesmanId = new Map();
  for (const u of level1Requestors || []) {
    const childSid = String(u?.referredByUserId || "");
    const leaderSid = String(leaderIdByChildSalesmanId.get(childSid) || "");
    const orgId = u?.organizationId ? String(u.organizationId) : "";
    if (!orgId) continue;

    if (leaderSid) {
      const set = level1OrgIdsBySalesmanId.get(leaderSid) || new Set();
      set.add(orgId);
      level1OrgIdsBySalesmanId.set(leaderSid, set);
    }
    if (childSid) {
      const set2 = requestorOrgIdsByChildSalesmanId.get(childSid) || new Set();
      set2.add(orgId);
      requestorOrgIdsByChildSalesmanId.set(childSid, set2);
    }
  }

  const orgIdsBySalesmanId = new Map();
  for (const [sid, set] of directOrgIdsBySalesmanId) {
    const merged = orgIdsBySalesmanId.get(sid) || new Set();
    for (const id of set) merged.add(id);
    orgIdsBySalesmanId.set(sid, merged);
  }
  for (const [sid, set] of level1OrgIdsBySalesmanId) {
    const merged = orgIdsBySalesmanId.get(sid) || new Set();
    for (const id of set) merged.add(id);
    orgIdsBySalesmanId.set(sid, merged);
  }

  const allOrgIds = Array.from(
    new Set(
      Array.from(orgIdsBySalesmanId.values()).flatMap((s) => Array.from(s)),
    ),
  )
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const revenueRows =
    allOrgIds.length === 0
      ? []
      : await Request.aggregate([
          {
            $match: {
              requestorOrganizationId: { $in: allOrgIds },
              status: "완료",
              createdAt: { $gte: range.start, $lte: range.end },
            },
          },
          {
            $group: {
              _id: "$requestorOrganizationId",
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
              bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
              orderCount: { $sum: 1 },
            },
          },
        ]);

  const revenueByOrgId = new Map(
    (revenueRows || []).map((r) => [
      String(r._id),
      {
        revenueAmount: normalizeNumber(r.revenueAmount || 0),
        bonusAmount: normalizeNumber(r.bonusAmount || 0),
        orderCount: normalizeNumber(r.orderCount || 0),
      },
    ]),
  );

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
  for (const child of childSalesmen || []) {
    const childSid = String(child?._id || "");
    if (!childSid) continue;
    const orgSet = requestorOrgIdsByChildSalesmanId.get(childSid) || new Set();
    let rev = 0;
    for (const oid of orgSet) {
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

  const salesmen = await User.find({ role: "salesman", active: true })
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

export async function adminGetOrganizationLedger(req, res) {
  try {
    const orgIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(orgIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "조직 ID가 올바르지 않습니다.",
      });
    }
    const organizationId = new Types.ObjectId(orgIdRaw);

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

    const match = { organizationId };

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
      { $match: { organizationId } },
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

    const refRequestIdById = new Map();
    if (requestRefIds.length > 0) {
      const requestDocs = await Request.find({
        _id: { $in: requestRefIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ _id: 1, requestId: 1 })
        .lean();

      for (const doc of requestDocs || []) {
        if (doc?._id) {
          refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
        }
      }
    }

    const enrichedItems = (items || []).map((it) => {
      if (String(it?.refType || "") !== "REQUEST") return it;
      const refRequestId = it?.refId
        ? refRequestIdById.get(String(it.refId)) || ""
        : "";
      return { ...it, refRequestId };
    });

    return res.json({
      success: true,
      data: { items: enrichedItems, total, page, pageSize },
    });
  } catch (error) {
    console.error("adminGetOrganizationLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "조직 크레딧 원장 조회에 실패했습니다.",
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
      RequestorOrganization.countDocuments(),
      ChargeOrder.countDocuments(),
      BankTransaction.countDocuments(),
      ChargeOrder.countDocuments({ status: "PENDING" }),
      ChargeOrder.countDocuments({ status: "MATCHED" }),
      BankTransaction.countDocuments({ status: "NEW" }),
      BankTransaction.countDocuments({ status: "MATCHED" }),
    ]);

    const totalCreditLedger = await CreditLedger.aggregate([
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const ledgerByType = {};
    totalCreditLedger.forEach((item) => {
      ledgerByType[item._id] = {
        totalAmount: item.totalAmount,
        count: item.count,
      };
    });

    const totalCharged = Math.abs(ledgerByType.CHARGE?.totalAmount || 0);
    const totalSpent = Math.abs(ledgerByType.SPEND?.totalAmount || 0);
    const totalBonus = Math.abs(ledgerByType.BONUS?.totalAmount || 0);

    const statsRows = await CreditLedger.aggregate([
      {
        $group: {
          _id: "$organizationId",
          chargedPaid: {
            $sum: {
              $cond: [
                { $in: ["$type", ["CHARGE", "REFUND"]] },
                { $abs: "$amount" },
                0,
              ],
            },
          },
          chargedBonus: {
            $sum: {
              $cond: [{ $eq: ["$type", "BONUS"] }, { $abs: "$amount" }, 0],
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
          spentBonusSum: {
            $sum: {
              $cond: [
                { $eq: ["$type", "SPEND"] },
                { $ifNull: ["$spentBonusAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    let totalSpentPaidAmount = 0;
    let totalSpentBonusAmount = 0;
    let totalPaidBalance = 0;
    let totalBonusBalance = 0;

    for (const row of statsRows || []) {
      const chargedPaid = Number(row.chargedPaid || 0);
      const chargedBonus = Number(row.chargedBonus || 0);
      const adjustSum = Number(row.adjustSum || 0);
      const spentTotal = Number(row.spentTotal || 0);
      const spentPaidRaw = Number(row.spentPaidSum || 0);
      const spentBonusRaw = Number(row.spentBonusSum || 0);

      let spentPaid, spentBonus;
      if (Math.round(spentPaidRaw + spentBonusRaw) === Math.round(spentTotal)) {
        spentPaid = spentPaidRaw;
        spentBonus = spentBonusRaw;
      } else {
        spentBonus = Math.min(chargedBonus, spentTotal);
        spentPaid = spentTotal - spentBonus;
      }

      totalSpentPaidAmount += spentPaid;
      totalSpentBonusAmount += spentBonus;
      totalPaidBalance += Math.max(0, chargedPaid + adjustSum - spentPaid);
      totalBonusBalance += Math.max(0, chargedBonus - spentBonus);
    }

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
        totalSpentPaidAmount: Math.max(0, Math.round(totalSpentPaidAmount)),
        totalSpentBonusAmount: Math.max(0, Math.round(totalSpentBonusAmount)),
        totalPaidBalance: Math.max(0, Math.round(totalPaidBalance)),
        totalBonusBalance: Math.max(0, Math.round(totalBonusBalance)),
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

    const salesmen = await User.find({ role: "salesman" })
      .select({ _id: 1, name: 1, email: 1, referralCode: 1, active: 1 })
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

    // 잔액(balance)은 항상 전체 기간 기준 (정산 전 잔액)
    const ledgerRows = await SalesmanLedger.aggregate([
      { $match: { salesmanId: { $in: salesmanIds } } },
      {
        $group: {
          _id: { salesmanId: "$salesmanId", type: "$type" },
          total: { $sum: "$amount" },
        },
      },
    ]);
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

    // 기간 필터 적용된 ledger 집계
    const ledgerPeriodMatch = { salesmanId: { $in: salesmanIds } };
    if (periodCutoff) ledgerPeriodMatch.createdAt = { $gte: periodCutoff };
    if (periodEnd) {
      ledgerPeriodMatch.createdAt = ledgerPeriodMatch.createdAt || {};
      ledgerPeriodMatch.createdAt.$lte = periodEnd;
    }

    const ledgerRowsPeriod = await SalesmanLedger.aggregate([
      { $match: ledgerPeriodMatch },
      {
        $group: {
          _id: { salesmanId: "$salesmanId", type: "$type" },
          total: { $sum: "$amount" },
        },
      },
    ]);
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

    const directRequestors = await User.find({
      role: "requestor",
      referredByUserId: { $in: salesmanIds },
      active: true,
      organizationId: { $ne: null },
    })
      .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
      .lean();

    const childSalesmen = await User.find({
      role: "salesman",
      referredByUserId: { $in: salesmanIds },
      active: true,
    })
      .select({ _id: 1, referredByUserId: 1 })
      .lean();

    const childSalesmanIds = (childSalesmen || [])
      .map((s) => String(s?._id || ""))
      .filter(Boolean)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const level1Requestors =
      childSalesmanIds.length === 0
        ? []
        : await User.find({
            role: "requestor",
            referredByUserId: { $in: childSalesmanIds },
            active: true,
            organizationId: { $ne: null },
          })
            .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
            .lean();

    const leaderIdByChildSalesmanId = new Map(
      (childSalesmen || [])
        .map((s) => [String(s?._id || ""), String(s?.referredByUserId || "")])
        .filter(([cid, pid]) => cid && pid),
    );

    // 직접 소개 조직 (나의 수수료 5%)
    const directOrgIdsBySalesmanId = new Map();
    for (const u of directRequestors || []) {
      const sid = String(u?.referredByUserId || "");
      const orgId = u?.organizationId ? String(u.organizationId) : "";
      if (!sid || !orgId) continue;
      const set = directOrgIdsBySalesmanId.get(sid) || new Set();
      set.add(orgId);
      directOrgIdsBySalesmanId.set(sid, set);
    }
    // 직계1 소개 조직 (직계1 수수료 2.5%)
    const level1OrgIdsBySalesmanId = new Map();
    for (const u of level1Requestors || []) {
      const childSid = String(u?.referredByUserId || "");
      const leaderSid = String(leaderIdByChildSalesmanId.get(childSid) || "");
      const orgId = u?.organizationId ? String(u.organizationId) : "";
      if (!leaderSid || !orgId) continue;
      const set = level1OrgIdsBySalesmanId.get(leaderSid) || new Set();
      set.add(orgId);
      level1OrgIdsBySalesmanId.set(leaderSid, set);
    }
    // 전체 조직 (revenue 집계용)
    const orgIdsBySalesmanId = new Map();
    for (const [sid, set] of directOrgIdsBySalesmanId) {
      const merged = orgIdsBySalesmanId.get(sid) || new Set();
      for (const id of set) merged.add(id);
      orgIdsBySalesmanId.set(sid, merged);
    }
    for (const [sid, set] of level1OrgIdsBySalesmanId) {
      const merged = orgIdsBySalesmanId.get(sid) || new Set();
      for (const id of set) merged.add(id);
      orgIdsBySalesmanId.set(sid, merged);
    }

    const allOrgIds = Array.from(
      new Set(
        Array.from(orgIdsBySalesmanId.values()).flatMap((s) => Array.from(s)),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const revenueCreatedAtMatch = {};
    if (periodCutoff) revenueCreatedAtMatch.$gte = periodCutoff;
    if (periodEnd) revenueCreatedAtMatch.$lte = periodEnd;

    const revenueRows =
      allOrgIds.length === 0
        ? []
        : await Request.aggregate([
            {
              $match: {
                requestorOrganizationId: { $in: allOrgIds },
                status: "완료",
                ...(Object.keys(revenueCreatedAtMatch).length
                  ? { createdAt: revenueCreatedAtMatch }
                  : {}),
              },
            },
            {
              $group: {
                _id: "$requestorOrganizationId",
                revenueAmount: {
                  $sum: {
                    $ifNull: [
                      "$price.paidAmount",
                      { $ifNull: ["$price.amount", 0] },
                    ],
                  },
                },
                bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
                orderCount: { $sum: 1 },
              },
            },
          ]);

    const revenueByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        {
          revenueAmount: Number(r.revenueAmount || 0),
          bonusAmount: Number(r.bonusAmount || 0),
          orderCount: Number(r.orderCount || 0),
        },
      ]),
    );

    // 영업자별 소개한 영업자 수 집계
    // referredByUserId가 ObjectId/문자열로 혼재해도 안정적으로 카운트되도록 toString 기반으로 통일
    const salesmanIdStrings = salesmanIds.map((id) => String(id));
    const referredSalesmanCountRows = await User.aggregate([
      {
        $match: {
          role: "salesman",
          active: true,
          referredByUserId: { $ne: null },
        },
      },
      {
        $addFields: {
          referredByKey: { $toString: "$referredByUserId" },
        },
      },
      {
        $match: {
          referredByKey: { $in: salesmanIdStrings },
        },
      },
      { $group: { _id: "$referredByKey", count: { $sum: 1 } } },
    ]);
    const referredSalesmanCountBySalesmanId = new Map(
      (referredSalesmanCountRows || []).map((r) => [
        String(r?._id || ""),
        Number(r?.count || 0),
      ]),
    );

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
      const level1Commission30d = Math.round(
        level1Revenue30d * commissionRate * 0.5,
      ); // 2.5%
      const commission30d = myCommission30d + level1Commission30d;

      return {
        salesmanId: sid,
        name: String(s?.name || ""),
        email: String(s?.email || ""),
        referralCode: String(s?.referralCode || ""),
        active: Boolean(s?.active),
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

    const total = await User.countDocuments({ role: "salesman" });
    return res.json({ success: true, data: { items, total, skip, limit } });
  } catch (error) {
    console.error("adminGetSalesmanCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 크레딧 조회에 실패했습니다.",
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

export async function adminGetOrganizationCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const orgs = await RequestorOrganization.find()
      .select({ name: 1, owner: 1, extracted: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const ownerIds = Array.from(
      new Set(
        (orgs || [])
          .map((o) => o?.owner)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select({ _id: 1, name: 1, email: 1 })
          .lean()
      : [];

    const ownerById = new Map(
      (owners || []).map((u) => [
        String(u._id),
        { name: u.name, email: u.email },
      ]),
    );

    const orgIds = orgs.map((o) => o._id);

    const ledgerData = await CreditLedger.aggregate([
      { $match: { organizationId: { $in: orgIds } } },
      {
        $group: {
          _id: "$organizationId",
          chargedPaid: {
            $sum: {
              $cond: [
                { $in: ["$type", ["CHARGE", "REFUND"]] },
                { $abs: "$amount" },
                0,
              ],
            },
          },
          chargedBonus: {
            $sum: {
              $cond: [{ $eq: ["$type", "BONUS"] }, { $abs: "$amount" }, 0],
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
          spentBonusSum: {
            $sum: {
              $cond: [
                { $eq: ["$type", "SPEND"] },
                { $ifNull: ["$spentBonusAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const balanceMap = {};
    ledgerData.forEach((item) => {
      const chargedPaid = Number(item.chargedPaid || 0);
      const chargedBonus = Number(item.chargedBonus || 0);
      const adjustSum = Number(item.adjustSum || 0);
      const spentTotal = Number(item.spentTotal || 0);
      const spentPaidRaw = Number(item.spentPaidSum || 0);
      const spentBonusRaw = Number(item.spentBonusSum || 0);

      // spentPaidAmount/spentBonusAmount가 저장된 경우 그걸 직접 사용
      // 합이 spentTotal과 일치하면 신뢰, 아니면 전액 paid에서 차감으로 fallback
      let spentPaid, spentBonus;
      if (Math.round(spentPaidRaw + spentBonusRaw) === Math.round(spentTotal)) {
        spentPaid = spentPaidRaw;
        spentBonus = spentBonusRaw;
      } else {
        // fallback: 보너스 우선 차감 시뮬레이션(단순 총액 기준)
        spentBonus = Math.min(chargedBonus, spentTotal);
        spentPaid = spentTotal - spentBonus;
      }

      const paidBalance = chargedPaid + adjustSum - spentPaid;
      const bonusBalance = chargedBonus - spentBonus;

      balanceMap[String(item._id)] = {
        balance: Math.max(0, paidBalance + bonusBalance),
        paidBalance: Math.max(0, paidBalance),
        bonusBalance: Math.max(0, bonusBalance),
        spentAmount: Math.max(0, spentTotal),
        chargedPaidAmount: Math.max(0, chargedPaid),
        chargedBonusAmount: Math.max(0, chargedBonus),
        spentPaidAmount: Math.max(0, spentPaid),
        spentBonusAmount: Math.max(0, spentBonus),
      };
    });

    const result = orgs.map((org) => {
      const orgId = String(org._id);
      const balanceInfo = balanceMap[orgId] || {
        balance: 0,
        paidBalance: 0,
        bonusBalance: 0,
        spentAmount: 0,
        chargedPaidAmount: 0,
        chargedBonusAmount: 0,
        spentPaidAmount: 0,
        spentBonusAmount: 0,
      };

      const ownerInfo = ownerById.get(String(org?.owner || "")) || null;

      return {
        _id: org._id,
        name: org.name,
        ownerName: ownerInfo?.name || "",
        ownerEmail: ownerInfo?.email || "",
        companyName: org.extracted?.companyName || "",
        businessNumber: org.extracted?.businessNumber || "",
        ...balanceInfo,
      };
    });

    const total = await RequestorOrganization.countDocuments();

    return res.json({
      success: true,
      data: {
        items: result,
        total,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetOrganizationCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "조직별 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetOrganizationCreditDetail(req, res) {
  try {
    const orgId = req.params.id;
    const org = await RequestorOrganization.findById(orgId)
      .select({ name: 1, extracted: 1 })
      .lean();

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "조직을 찾을 수 없습니다.",
      });
    }

    const ledgers = await CreditLedger.find({ organizationId: orgId })
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
        paidBalanceAfter: Math.max(0, paid),
        bonusBalanceAfter: Math.max(0, bonus),
      });
    }

    return res.json({
      success: true,
      data: {
        organization: org,
        balance: Math.max(0, paid + bonus),
        paidBalance: Math.max(0, paid),
        bonusBalance: Math.max(0, bonus),
        spentAmount: Math.max(0, spent),
        history: history.reverse(),
      },
    });
  } catch (error) {
    console.error("adminGetOrganizationCreditDetail error:", error);
    return res.status(500).json({
      success: false,
      message: "조직 크레딧 상세 조회에 실패했습니다.",
    });
  }
}
