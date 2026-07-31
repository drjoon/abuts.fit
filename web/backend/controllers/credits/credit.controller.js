// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/models/creditLedger.model.js
import CreditLedger from "../../models/creditLedger.model.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
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
  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId: scope.businessAnchorId,
    upsertIfMissing: true,
  });

  return {
    balance: Number(snapshot?.balance || 0),
    paidCredit: Number(snapshot?.paidCredit || 0),
    bonusRequestCredit: Number(snapshot?.bonusRequestCredit || 0),
    bonusShippingCredit: Number(snapshot?.bonusShippingCredit || 0),
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
  // KST 기준 90일 전
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T00:00:00+09:00`);
  todayKst.setDate(todayKst.getDate() - WINDOW_DAYS);
  const since = todayKst;

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
