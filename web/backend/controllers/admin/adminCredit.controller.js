import CreditLedger from "../../models/creditLedger.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import Request from "../../models/request.model.js";
import { Types } from "mongoose";

function getLast30Cutoff() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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

    const [total, items] = await Promise.all([
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

    // 구매/무료 차감 분해(무료 우선 차감) - 조직 단위로 시뮬레이션
    const orgRows = await CreditLedger.aggregate([
      {
        $group: {
          _id: "$organizationId",
          entries: {
            $push: {
              type: "$type",
              amount: "$amount",
              createdAt: "$createdAt",
              _id: "$_id",
            },
          },
        },
      },
    ]);

    let totalSpentPaidAmount = 0;
    let totalSpentBonusAmount = 0;
    let totalPaidBalance = 0;
    let totalBonusBalance = 0;

    for (const org of orgRows || []) {
      const entries = (org?.entries || []).slice().sort((a, b) => {
        const at = new Date(a?.createdAt || 0).getTime();
        const bt = new Date(b?.createdAt || 0).getTime();
        if (at !== bt) return at - bt;
        return String(a?._id || "").localeCompare(String(b?._id || ""));
      });

      let paid = 0;
      let bonus = 0;

      for (const e of entries) {
        const type = String(e?.type || "");
        const amount = Number(e?.amount || 0);
        if (!Number.isFinite(amount)) continue;

        if (type === "CHARGE" || type === "REFUND") {
          paid += Math.abs(amount);
          continue;
        }
        if (type === "BONUS") {
          bonus += Math.abs(amount);
          continue;
        }
        if (type === "ADJUST") {
          paid += amount;
          continue;
        }
        if (type === "SPEND") {
          let spend = Math.abs(amount);
          const fromBonus = Math.min(Math.max(0, bonus), spend);
          bonus -= fromBonus;
          totalSpentBonusAmount += fromBonus;
          spend -= fromBonus;

          const fromPaid = spend;
          paid -= fromPaid;
          totalSpentPaidAmount += fromPaid;
        }
      }

      totalPaidBalance += Math.max(0, paid);
      totalBonusBalance += Math.max(0, bonus);
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
    const last30Cutoff = getLast30Cutoff();
    const commissionRate = 0.05;

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

    const ledgerRows30d = await SalesmanLedger.aggregate([
      {
        $match: {
          salesmanId: { $in: salesmanIds },
          createdAt: { $gte: last30Cutoff },
        },
      },
      {
        $group: {
          _id: { salesmanId: "$salesmanId", type: "$type" },
          total: { $sum: "$amount" },
        },
      },
    ]);
    const ledger30dBySalesmanId = new Map();
    for (const r of ledgerRows30d) {
      const sid = String(r?._id?.salesmanId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!sid) continue;
      const prev = ledger30dBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledger30dBySalesmanId.set(sid, prev);
    }

    const referred = await User.find({
      role: "requestor",
      referredByUserId: { $in: salesmanIds },
      active: true,
      organizationId: { $ne: null },
    })
      .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
      .lean();

    const orgIdsBySalesmanId = new Map();
    for (const u of referred || []) {
      const sid = String(u?.referredByUserId || "");
      const orgId = u?.organizationId ? String(u.organizationId) : "";
      if (!sid || !orgId) continue;
      const set = orgIdsBySalesmanId.get(sid) || new Set();
      set.add(orgId);
      orgIdsBySalesmanId.set(sid, set);
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
                createdAt: { $gte: last30Cutoff },
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

    const items = salesmen.map((s) => {
      const sid = String(s._id);
      const ledger = ledgerBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };

      const ledger30d = ledger30dBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      const balance = Math.round(
        Number(ledger.earn || 0) -
          Number(ledger.payout || 0) +
          Number(ledger.adjust || 0),
      );

      const balance30d = Math.round(
        Number(ledger30d.earn || 0) -
          Number(ledger30d.payout || 0) +
          Number(ledger30d.adjust || 0),
      );

      const orgSet = orgIdsBySalesmanId.get(sid) || new Set();
      let revenue30d = 0;
      let bonus30d = 0;
      let orders30d = 0;
      for (const orgId of orgSet) {
        const row = revenueByOrgId.get(String(orgId));
        if (!row) continue;
        revenue30d += Number(row.revenueAmount || 0);
        bonus30d += Number(row.bonusAmount || 0);
        orders30d += Number(row.orderCount || 0);
      }
      const commission30d = Math.round(Number(ledger30d.earn || 0));

      return {
        salesmanId: sid,
        name: String(s?.name || ""),
        email: String(s?.email || ""),
        referralCode: String(s?.referralCode || ""),
        active: Boolean(s?.active),
        wallet: {
          earnedAmount: Math.round(Number(ledger.earn || 0)),
          paidOutAmount: Math.round(Number(ledger.payout || 0)),
          adjustedAmount: Math.round(Number(ledger.adjust || 0)),
          balanceAmount: balance,
          earnedAmount30d: Math.round(Number(ledger30d.earn || 0)),
          paidOutAmount30d: Math.round(Number(ledger30d.payout || 0)),
          adjustedAmount30d: Math.round(Number(ledger30d.adjust || 0)),
          balanceAmount30d: balance30d,
        },
        performance30d: {
          referredOrgCount: orgSet.size,
          revenueAmount: Math.round(revenue30d),
          bonusAmount: Math.round(bonus30d),
          orderCount: Math.round(orders30d),
          commissionAmount: Math.round(commission30d),
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

    const [total, items] = await Promise.all([
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

    return res.json({
      success: true,
      data: { items: Array.isArray(items) ? items : [], total, page, pageSize },
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
          entries: { $push: { type: "$type", amount: "$amount" } },
        },
      },
    ]);

    const balanceMap = {};
    ledgerData.forEach((item) => {
      let paid = 0;
      let bonus = 0;
      let spent = 0;
      let chargedPaid = 0;
      let chargedBonus = 0;
      let spentPaid = 0;
      let spentBonus = 0;

      item.entries.forEach((entry) => {
        const type = entry.type;
        const amount = Number(entry.amount || 0);
        if (!Number.isFinite(amount)) return;

        const absAmount = Math.abs(amount);

        if (type === "CHARGE" || type === "REFUND") {
          paid += absAmount;
          chargedPaid += absAmount;
        } else if (type === "BONUS") {
          bonus += absAmount;
          chargedBonus += absAmount;
        } else if (type === "ADJUST") {
          paid += amount;
          if (amount > 0) chargedPaid += amount;
        } else if (type === "SPEND") {
          const spend = absAmount;
          spent += spend;
          const fromBonus = Math.min(Math.max(0, bonus), spend);
          bonus -= fromBonus;
          spentBonus += fromBonus;
          const fromPaid = spend - fromBonus;
          paid -= fromPaid;
          spentPaid += fromPaid;
        }
      });

      balanceMap[String(item._id)] = {
        balance: Math.max(0, paid + bonus),
        paidBalance: Math.max(0, paid),
        bonusBalance: Math.max(0, bonus),
        spentAmount: Math.max(0, spent),
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
