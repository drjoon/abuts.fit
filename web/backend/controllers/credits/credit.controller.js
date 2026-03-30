import CreditLedger from "../../models/creditLedger.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

const __creditBalanceCache = new Map();

function getCreditBalanceCacheValue(key) {
  const hit = __creditBalanceCache.get(key);
  if (!hit) return null;
  if (typeof hit.expiresAt !== "number" || hit.expiresAt <= Date.now()) {
    __creditBalanceCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCreditBalanceCacheValue(key, value, ttlMs) {
  __creditBalanceCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

function roundUpUnit(amount, unit) {
  const n = Number(amount);
  const u = Number(unit);
  if (!Number.isFinite(n) || !Number.isFinite(u) || u <= 0) return 0;
  return Math.ceil(n / u) * u;
}

async function resolveCreditScopeIdentity(req) {
  const directBusinessAnchorId = req.user?.businessAnchorId;
  if (directBusinessAnchorId) {
    return {
      businessAnchorId: String(directBusinessAnchorId),
    };
  }

  const userId = req.user?._id;
  if (!userId) {
    return { businessAnchorId: "" };
  }

  const anchor = await BusinessAnchor.findOne({
    $or: [
      { primaryContactUserId: userId },
      { owners: userId },
      { members: userId },
    ],
  })
    .select({ _id: 1 })
    .lean();

  if (anchor?._id) {
    const resolvedBusinessAnchorId = String(anchor._id);
    console.error("[CREDIT_BALANCE_SCOPE_RESOLVED] resolved from anchor", {
      userId: String(userId),
      resolvedBusinessAnchorId,
      originalUserBusinessAnchorId: req.user?.businessAnchorId
        ? String(req.user.businessAnchorId)
        : null,
    });
    return {
      businessAnchorId: resolvedBusinessAnchorId,
    };
  }

  const requestWithBusiness = await Request.findOne({ requestor: userId })
    .sort({ createdAt: -1, _id: -1 })
    .select({ businessAnchorId: 1, requestId: 1 })
    .lean();

  if (requestWithBusiness?.businessAnchorId) {
    const resolvedBusinessAnchorId = String(
      requestWithBusiness.businessAnchorId || "",
    );
    console.error("[CREDIT_BALANCE_SCOPE_RESOLVED] resolved from request", {
      userId: String(userId),
      resolvedBusinessAnchorId,
      requestId: String(requestWithBusiness.requestId || ""),
      originalUserBusinessAnchorId: req.user?.businessAnchorId
        ? String(req.user.businessAnchorId)
        : null,
    });
    return {
      businessAnchorId: resolvedBusinessAnchorId,
    };
  }

  return { businessAnchorId: "" };
}

async function getCreditScope(req) {
  const { businessAnchorId } = await resolveCreditScopeIdentity(req);
  if (!businessAnchorId) {
    throw new Error("사업자 정보가 설정되지 않았습니다.");
  }
  return { businessAnchorId };
}

function buildLedgerQuery(scope) {
  return { businessAnchorId: scope.businessAnchorId };
}

async function getBalanceBreakdown(scope) {
  const ledgerQuery = buildLedgerQuery(scope);
  const rows = await CreditLedger.find(ledgerQuery)
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1, refType: 1 })
    .lean();

  let paid = 0;
  let bonus = 0;
  let freeShippingCredit = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);
    const refType = String(r?.refType || "");

    if (!Number.isFinite(amount)) continue;

    const absAmount = Math.abs(amount);

    if (type === "CHARGE") {
      paid += absAmount;
      continue;
    }
    if (type === "BONUS") {
      bonus += absAmount;
      if (refType === "FREE_SHIPPING_CREDIT") {
        freeShippingCredit += absAmount;
      }
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
      if (refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE") {
        const fromFreeShippingCredit = Math.min(freeShippingCredit, spend);
        freeShippingCredit -= fromFreeShippingCredit;
        spend -= fromFreeShippingCredit;
      }
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const bonusRequestCredit = Math.max(0, Math.round(bonus));
  const bonusShippingCredit = Math.max(0, Math.round(freeShippingCredit));
  return {
    balance: paidCredit + bonusRequestCredit,
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
  };
}

export async function getMyCreditBalance(req, res) {
  const identity = await resolveCreditScopeIdentity(req);
  if (!identity?.businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const scope = { businessAnchorId: String(identity.businessAnchorId || "") };
  const cacheKey = `credit-balance:${scope.businessAnchorId}`;
  const cached = getCreditBalanceCacheValue(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      cached: true,
    });
  }

  const balanceData = await getBalanceBreakdown(scope);
  setCreditBalanceCacheValue(cacheKey, balanceData, 15 * 1000);

  return res.json({
    success: true,
    data: balanceData,
  });
}

export async function getMyCreditSpendInsights(req, res) {
  const identity = await resolveCreditScopeIdentity(req);
  if (!identity?.businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const scope = await getCreditScope(req);
  const ledgerQuery = buildLedgerQuery(scope);
  console.error("[CREDIT_SPEND_INSIGHTS_SCOPE]", {
    userId: req.user?._id ? String(req.user._id) : null,
    userBusinessAnchorId: req.user?.businessAnchorId
      ? String(req.user.businessAnchorId)
      : null,
    resolvedBusinessAnchorId: String(scope.businessAnchorId || ""),
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
