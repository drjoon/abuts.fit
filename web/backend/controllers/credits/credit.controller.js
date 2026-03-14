import CreditLedger from "../../models/creditLedger.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import Business from "../../models/business.model.js";

function roundUpUnit(amount, unit) {
  const n = Number(amount);
  const u = Number(unit);
  if (!Number.isFinite(n) || !Number.isFinite(u) || u <= 0) return 0;
  return Math.ceil(n / u) * u;
}

async function resolveBusinessIdForCredit(req) {
  const directBusinessId = req.user?.businessId;
  if (directBusinessId) {
    return String(directBusinessId);
  }

  const userId = req.user?._id;
  if (!userId) {
    return "";
  }

  const business = await Business.findOne({
    $or: [
      { owner: userId },
      { owners: userId },
      { members: userId },
      {
        "joinRequests.user": userId,
        "joinRequests.status": "approved",
      },
    ],
  })
    .select({ _id: 1 })
    .lean();

  if (business?._id) {
    const resolved = String(business._id);
    console.error("[CREDIT_BALANCE_SCOPE_FALLBACK] resolved from business", {
      userId: String(userId),
      resolvedBusinessId: resolved,
      originalUserBusinessId: req.user?.businessId
        ? String(req.user.businessId)
        : null,
    });
    return resolved;
  }

  const requestWithBusiness = await Request.findOne({ requestor: userId })
    .sort({ createdAt: -1, _id: -1 })
    .select({ businessId: 1, requestId: 1 })
    .lean();

  if (requestWithBusiness?.businessId) {
    const resolved = String(requestWithBusiness.businessId);
    console.error("[CREDIT_BALANCE_SCOPE_FALLBACK] resolved from request", {
      userId: String(userId),
      resolvedBusinessId: resolved,
      requestId: String(requestWithBusiness.requestId || ""),
      originalUserBusinessId: req.user?.businessId
        ? String(req.user.businessId)
        : null,
    });
    return resolved;
  }

  return "";
}

async function getCreditScope(req) {
  const businessId = await resolveBusinessIdForCredit(req);
  if (!businessId) {
    throw new Error("사업자 정보가 설정되지 않았습니다.");
  }

  const members = await User.find({ businessId }).select({ _id: 1 }).lean();
  const userIds = (members || []).map((m) => m?._id).filter(Boolean);
  if (
    req.user?._id &&
    !userIds.some((id) => String(id) === String(req.user._id))
  ) {
    userIds.push(req.user._id);
  }

  return { businessId, userIds };
}

function buildLedgerQuery(scope) {
  return { businessId: scope.businessId };
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
  const businessId = await resolveBusinessIdForCredit(req);
  if (!businessId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const { balance, paidBalance, bonusBalance } =
    await getBalanceBreakdown(scope);
  console.error("[CREDIT_BALANCE_RESPONSE]", {
    userId: req.user?._id ? String(req.user._id) : null,
    userBusinessId: req.user?.businessId ? String(req.user.businessId) : null,
    resolvedBusinessId: String(scope.businessId),
    balance,
    paidBalance,
    bonusBalance,
  });
  return res.json({
    success: true,
    data: { balance, paidBalance, bonusBalance },
  });
}

export async function getMyCreditSpendInsights(req, res) {
  const businessId = await resolveBusinessIdForCredit(req);
  if (!businessId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const ledgerQuery = buildLedgerQuery(scope);
  console.error("[CREDIT_SPEND_INSIGHTS_SCOPE]", {
    userId: req.user?._id ? String(req.user._id) : null,
    userBusinessId: req.user?.businessId ? String(req.user.businessId) : null,
    resolvedBusinessId: String(scope.businessId),
  });

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
