import CreditLedger from "../../models/creditLedger.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";

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

export async function adminGetOrganizationCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const orgs = await RequestorOrganization.find()
      .select({ name: 1, extracted: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

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

      item.entries.forEach((entry) => {
        const type = entry.type;
        const amount = Number(entry.amount || 0);
        if (!Number.isFinite(amount)) return;

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
      });

      balanceMap[String(item._id)] = {
        balance: Math.max(0, paid + bonus),
        paidBalance: Math.max(0, paid),
        bonusBalance: Math.max(0, bonus),
        spentAmount: Math.max(0, spent),
      };
    });

    const result = orgs.map((org) => {
      const orgId = String(org._id);
      const balanceInfo = balanceMap[orgId] || {
        balance: 0,
        paidBalance: 0,
        bonusBalance: 0,
        spentAmount: 0,
      };

      return {
        _id: org._id,
        name: org.name,
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
