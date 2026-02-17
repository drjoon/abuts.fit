import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import User from "../../models/user.model.js";
import { Types } from "mongoose";
import crypto from "crypto";

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

  if (period === "7d" || period === "30d" || period === "90d") {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
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

    const period = parsePeriod(req.query?.period);

    const ym = period ? null : parseYearMonth(req.query?.ym);
    const now = new Date();
    const effectiveYm = ym || {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    };

    const commissionRate = 0.05;
    const indirectCommissionRate = 0.02;
    const payoutDayOfMonth = 1;

    const { start, end } = period
      ? getPeriodRangeUtc(period)
      : getMonthRangeUtc(effectiveYm);

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
          status: "완료",
          createdAt: { $gte: start, $lt: end },
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
        ym: `${effectiveYm.year}-${String(effectiveYm.month).padStart(2, "0")}`,
        period: period || null,
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
