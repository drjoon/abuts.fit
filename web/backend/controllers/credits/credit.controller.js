import CreditLedger from "../../models/creditLedger.model.js";
import User from "../../models/user.model.js";

function roundUpUnit(amount, unit) {
  const n = Number(amount);
  const u = Number(unit);
  if (!Number.isFinite(n) || !Number.isFinite(u) || u <= 0) return 0;
  return Math.ceil(n / u) * u;
}

async function getCreditScope(req) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    throw new Error("기공소 정보가 설정되지 않았습니다.");
  }

  const members = await User.find({ organizationId }).select({ _id: 1 }).lean();
  const userIds = (members || []).map((m) => m?._id).filter(Boolean);
  if (
    req.user?._id &&
    !userIds.some((id) => String(id) === String(req.user._id))
  ) {
    userIds.push(req.user._id);
  }

  return { organizationId, userIds };
}

function buildLedgerQuery(scope) {
  return { organizationId: scope.organizationId };
}

async function getBalanceBreakdown(scope) {
  const ledgerQuery = buildLedgerQuery(scope);
  const rows = await CreditLedger.find(ledgerQuery)
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1 })
    .lean();

  let paid = 0;
  let bonus = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);

    if (!Number.isFinite(amount)) continue;

    const absAmount = Math.abs(amount);

    if (type === "CHARGE") {
      paid += absAmount;
      continue;
    }
    if (type === "BONUS") {
      bonus += absAmount;
      continue;
    }
    if (type === "REFUND") {
      paid += absAmount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = absAmount;
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidBalance = Math.max(0, Math.round(paid));
  const bonusBalance = Math.max(0, Math.round(bonus));
  return {
    balance: paidBalance + bonusBalance,
    paidBalance,
    bonusBalance,
  };
}

export async function getMyCreditBalance(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const { balance, paidBalance, bonusBalance } =
    await getBalanceBreakdown(scope);
  return res.json({
    success: true,
    data: { balance, paidBalance, bonusBalance },
  });
}

export async function getMyCreditSpendInsights(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const ledgerQuery = buildLedgerQuery(scope);

  const MIN = 500000;
  const MAX = 5000000;
  const WINDOW_DAYS = 90;
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const match = {
    ...ledgerQuery,
    type: "SPEND",
    createdAt: { $gte: since },
  };

  const rows = await CreditLedger.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        spentSupply: { $sum: { $abs: "$amount" } },
      },
    },
  ]);

  const spentSupply90 = Number(rows?.[0]?.spentSupply || 0);
  const avgDailySpendSupply =
    spentSupply90 > 0 ? spentSupply90 / WINDOW_DAYS : 0;
  const avgMonthlySpendSupply = spentSupply90 > 0 ? spentSupply90 / 3 : 0;

  const estimatedDaysFor500k =
    avgDailySpendSupply > 0
      ? Math.max(1, Math.ceil(500000 / avgDailySpendSupply))
      : null;

  const recommendedOneMonthSupply = roundUpUnit(avgMonthlySpendSupply, 500000);
  const recommendedThreeMonthsSupply = roundUpUnit(
    avgMonthlySpendSupply * 3,
    500000,
  );

  const oneMonthSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedOneMonthSupply || 0),
  );
  const threeMonthsSupply = Math.min(
    MAX,
    Math.max(MIN, recommendedThreeMonthsSupply || 0),
  );

  return res.json({
    success: true,
    data: {
      windowDays: WINDOW_DAYS,
      spentSupply90,
      avgDailySpendSupply,
      avgMonthlySpendSupply,
      estimatedDaysFor500k,
      hasUsageData: spentSupply90 > 0,
      recommended: {
        oneMonthSupply,
        threeMonthsSupply,
      },
    },
  });
}
