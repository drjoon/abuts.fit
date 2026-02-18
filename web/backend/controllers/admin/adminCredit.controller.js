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
                revenueAmount: { $sum: "$price.amount" },
                orderCount: { $sum: 1 },
              },
            },
          ]);

    const revenueByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        {
          revenueAmount: Number(r.revenueAmount || 0),
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
      const balance = Math.round(
        Number(ledger.earn || 0) -
          Number(ledger.payout || 0) +
          Number(ledger.adjust || 0),
      );

      const orgSet = orgIdsBySalesmanId.get(sid) || new Set();
      let revenue30d = 0;
      let orders30d = 0;
      for (const orgId of orgSet) {
        const row = revenueByOrgId.get(String(orgId));
        if (!row) continue;
        revenue30d += Number(row.revenueAmount || 0);
        orders30d += Number(row.orderCount || 0);
      }
      const commission30d = Math.round(revenue30d * commissionRate);

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
        },
        performance30d: {
          referredOrgCount: orgSet.size,
          revenueAmount: Math.round(revenue30d),
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
          let spend = absAmount;
          spent += spend;
          const fromBonus = Math.min(bonus, spend);
          bonus -= fromBonus;
          spentBonus += fromBonus;
          spend -= fromBonus;
          paid -= spend;
          spentPaid += spend;
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
