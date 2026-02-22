import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import { Types } from "mongoose";
import crypto from "crypto";
import { getLast30DaysRangeUtc } from "../../utils/krBusinessDays.js";

function parsePeriod(input) {
  const raw = String(input || "").trim();
  if (
    raw !== "7d" &&
    raw !== "30d" &&
    raw !== "90d" &&
    raw !== "thisMonth" &&
    raw !== "lastMonth" &&
    raw !== "all"
  ) {
    return null;
  }
  return raw;
}

function parseYearMonth(input) {
  const raw = String(input || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map((v) => Number(v));
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function getMonthRangeUtc({ year, month }) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function getPeriodRangeUtc(period) {
  const now = new Date();
  const nowMs = now.getTime();

  if (period === "thisMonth") {
    return getMonthRangeUtc({
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    });
  }

  if (period === "lastMonth") {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const prev = m - 1;
    if (prev >= 1) return getMonthRangeUtc({ year: y, month: prev });
    return getMonthRangeUtc({ year: y - 1, month: 12 });
  }

  if (period === "30d") {
    const range = getLast30DaysRangeUtc(now);
    return (
      range ?? { start: new Date(nowMs - 30 * 24 * 60 * 60 * 1000), end: now }
    );
  }

  if (period === "7d" || period === "90d") {
    const days = period === "7d" ? 7 : 90;
    const start = new Date(nowMs - days * 24 * 60 * 60 * 1000);
    return { start, end: now };
  }

  return { start: new Date(0), end: now };
}

function roundMoney(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function safeRegex(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(escaped, "i");
  } catch {
    return null;
  }
}

function parseLedgerPeriod(period) {
  const p = String(period || "").trim();
  if (!p || p === "all") return null;
  const now = Date.now();
  if (p === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (p === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (p === "90d") return new Date(now - 90 * 24 * 60 * 60 * 1000);
  return null;
}

export async function getSalesmanLedger(req, res) {
  try {
    res.set("x-abuts-handler", "salesman.getSalesmanLedger");

    const me = req.user;
    if (!me || me.role !== "salesman") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const salesmanId = new Types.ObjectId(String(me._id));

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

    const sinceFromPeriod = parseLedgerPeriod(periodRaw);
    if (sinceFromPeriod) createdAt.$gte = sinceFromPeriod;

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();

    if (fromRaw) {
      const from = new Date(fromRaw);
      if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
    }

    if (toRaw) {
      const to = new Date(toRaw);
      if (!Number.isNaN(to.getTime())) createdAt.$lte = to;
    }

    if (Object.keys(createdAt).length) match.createdAt = createdAt;

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
      if (ors.length) match.$or = ors;
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
    console.error("[salesman.getSalesmanLedger] error", error);
    return res.status(500).json({
      success: false,
      message: "정산 내역 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

function createReferralCode3() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = alphabet[crypto.randomInt(0, alphabet.length)];
  const b = alphabet[crypto.randomInt(0, alphabet.length)];
  const c = alphabet[crypto.randomInt(0, alphabet.length)];
  return `${a}${b}${c}`;
}

async function ensureUniqueReferralCode3() {
  for (let i = 0; i < 200; i += 1) {
    const code = createReferralCode3();
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("리퍼럴 코드 생성에 실패했습니다.");
}

export async function getSalesmanDashboard(req, res) {
  try {
    res.set("x-abuts-handler", "salesman.getSalesmanDashboard");

    const me = req.user;
    if (!me || me.role !== "salesman") {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    let effectiveReferralCode = String(me.referralCode || "").trim();
    if (!/^[A-Z]{3}$/.test(effectiveReferralCode)) {
      try {
        effectiveReferralCode = await ensureUniqueReferralCode3();
        await User.updateOne(
          { _id: me._id },
          { $set: { referralCode: effectiveReferralCode } },
        );
      } catch (e) {
        console.error(
          "[salesman.getSalesmanDashboard] referralCode refresh failed",
          e,
        );
      }
    }

    const period = parsePeriod(req.query?.period) || "30d";

    const commissionRate = 0.05;
    const indirectCommissionRate = commissionRate * 0.5;
    const payoutDayOfMonth = 1;

    const { start, end } = getPeriodRangeUtc(period);

    const referredRequestors = await User.find({
      referredByUserId: me._id,
      role: "requestor",
      active: true,
    })
      .select({ _id: 1, organizationId: 1 })
      .lean();

    const referredSalesmen = await User.find({
      referredByUserId: me._id,
      role: "salesman",
      active: true,
    })
      .select({ _id: 1, name: 1 })
      .lean();

    const referredSalesmanIds = (referredSalesmen || [])
      .map((u) => String(u?._id || ""))
      .filter(Boolean);

    const referredSalesmanObjectIds = referredSalesmanIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const level1Requestors =
      referredSalesmanObjectIds.length === 0
        ? []
        : await User.find({
            referredByUserId: { $in: referredSalesmanObjectIds },
            role: "requestor",
            active: true,
          })
            .select({ _id: 1, organizationId: 1 })
            .lean();

    const directOrgIdSet = new Set(
      (referredRequestors || [])
        .map((u) => (u?.organizationId ? String(u.organizationId) : ""))
        .filter(Boolean),
    );
    const level1OrgIdSet = new Set(
      (level1Requestors || [])
        .map((u) => (u?.organizationId ? String(u.organizationId) : ""))
        .filter(Boolean)
        .filter((id) => !directOrgIdSet.has(id)),
    );

    const organizationIds = Array.from(
      new Set([...Array.from(directOrgIdSet), ...Array.from(level1OrgIdSet)]),
    );

    const referralSalesmanCount = referredSalesmanObjectIds.length;
    const referralSalesmen = (referredSalesmen || []).map((u) => ({
      userId: String(u?._id || ""),
      name: String(u?.name || ""),
    }));

    if (organizationIds.length === 0) {
      const totalCommissionAmount = 0;
      return res.status(200).json({
        success: true,
        data: {
          ym: `${effectiveYm.year}-${String(effectiveYm.month).padStart(2, "0")}`,
          period: period || null,
          commissionRate,
          indirectCommissionRate,
          payoutDayOfMonth,
          referralCode: effectiveReferralCode,
          overview: {
            referredOrganizationCount: 0,
            monthRevenueAmount: 0,
            monthCommissionAmount: 0,
            directOrganizationCount: 0,
            level1OrganizationCount: 0,
            totalOrganizationCount: 0,
            directCommissionAmount: 0,
            level1CommissionAmount: 0,
            totalCommissionAmount: 0,
            payableGrossCommissionAmount: 0,
            paidNetCommissionAmount: roundMoney(totalCommissionAmount),
            referralSalesmanCount,
          },
          referralSalesmen,
          organizations: [],
        },
      });
    }

    const orgDocs = await RequestorOrganization.find({
      _id: { $in: organizationIds },
    })
      .select({ _id: 1, name: 1, extracted: 1, verification: 1 })
      .lean();

    const orgNameById = new Map(
      (orgDocs || []).map((o) => [String(o._id), String(o.name || "")]),
    );

    const orgObjectIds = organizationIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const revenueRows = await Request.aggregate([
      {
        $match: {
          requestorOrganizationId: { $in: orgObjectIds },
          "caseInfos.reviewByStage.shipping.status": "APPROVED",
          createdAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: "$requestorOrganizationId",
          revenueAmount: {
            $sum: {
              $ifNull: ["$price.paidAmount", { $ifNull: ["$price.amount", 0] }],
            },
          },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const revenueByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        Number(r.revenueAmount || 0),
      ]),
    );
    const ordersByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        Number(r.orderCount || 0),
      ]),
    );

    const organizations = organizationIds
      .map((id) => {
        const idStr = String(id);
        const revenueAmount = roundMoney(revenueByOrgId.get(idStr) || 0);
        const orderCount = ordersByOrgId.get(idStr) || 0;

        const isDirect = directOrgIdSet.has(idStr);
        const rate = isDirect ? commissionRate : indirectCommissionRate;
        const commissionAmount = roundMoney(revenueAmount * rate);

        return {
          organizationId: idStr,
          name: orgNameById.get(idStr) || "",
          monthRevenueAmount: revenueAmount,
          monthOrderCount: orderCount,
          monthCommissionAmount: commissionAmount,
          referralLevel: isDirect ? "direct" : "level1",
        };
      })
      .sort(
        (a, b) => (b.monthRevenueAmount || 0) - (a.monthRevenueAmount || 0),
      );

    const directOrganizations = organizations.filter(
      (o) => o.referralLevel === "direct",
    );
    const level1Organizations = organizations.filter(
      (o) => o.referralLevel === "level1",
    );

    const directCommissionAmount = directOrganizations.reduce(
      (acc, o) => acc + Number(o.monthCommissionAmount || 0),
      0,
    );
    const level1CommissionAmount = level1Organizations.reduce(
      (acc, o) => acc + Number(o.monthCommissionAmount || 0),
      0,
    );
    const totalCommissionAmount =
      directCommissionAmount + level1CommissionAmount;

    const monthRevenueAmount = organizations.reduce(
      (acc, o) => acc + Number(o.monthRevenueAmount || 0),
      0,
    );
    const monthCommissionAmount = totalCommissionAmount;

    return res.status(200).json({
      success: true,
      data: {
        ym: null,
        period,
        commissionRate,
        indirectCommissionRate,
        payoutDayOfMonth,
        referralCode: effectiveReferralCode,
        overview: {
          referredOrganizationCount: organizations.length,
          monthRevenueAmount: roundMoney(monthRevenueAmount),
          monthCommissionAmount: roundMoney(monthCommissionAmount),
          directOrganizationCount: directOrganizations.length,
          level1OrganizationCount: level1Organizations.length,
          totalOrganizationCount: organizations.length,
          directCommissionAmount: roundMoney(directCommissionAmount),
          level1CommissionAmount: roundMoney(level1CommissionAmount),
          totalCommissionAmount: roundMoney(totalCommissionAmount),
          payableGrossCommissionAmount: roundMoney(totalCommissionAmount),
          paidNetCommissionAmount: 0,
        },
        referralSalesmen,
        organizations,
      },
    });
  } catch (error) {
    console.error("[salesman.getSalesmanDashboard] error", error);
    return res.status(500).json({
      success: false,
      message: "영업자 대시보드 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
