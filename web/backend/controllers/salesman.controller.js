import Request from "../models/request.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import User from "../models/user.model.js";
import { Types } from "mongoose";

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

function roundMoney(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
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

    const ym = parseYearMonth(req.query?.ym);
    const now = new Date();
    const effectiveYm = ym || {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    };

    const commissionRate = 0.05;
    const payoutDayOfMonth = 1;

    const { start, end } = getMonthRangeUtc(effectiveYm);

    const referredUsers = await User.find({
      referredByUserId: me._id,
      role: "requestor",
      active: true,
    })
      .select({ _id: 1, organizationId: 1, organization: 1, approvedAt: 1 })
      .lean();

    const organizationIdStrSet = new Set(
      (referredUsers || [])
        .map((u) => (u?.organizationId ? String(u.organizationId) : ""))
        .filter(Boolean),
    );

    const organizationIds = Array.from(organizationIdStrSet);

    if (organizationIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          ym: `${effectiveYm.year}-${String(effectiveYm.month).padStart(2, "0")}`,
          commissionRate,
          payoutDayOfMonth,
          referralCode: String(me.referralCode || ""),
          overview: {
            referredOrganizationCount: 0,
            monthRevenueAmount: 0,
            monthCommissionAmount: 0,
          },
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
        const revenueAmount = roundMoney(revenueByOrgId.get(String(id)) || 0);
        const orderCount = ordersByOrgId.get(String(id)) || 0;
        const commissionAmount = roundMoney(revenueAmount * commissionRate);
        return {
          organizationId: id,
          name: orgNameById.get(String(id)) || "",
          monthRevenueAmount: revenueAmount,
          monthOrderCount: orderCount,
          monthCommissionAmount: commissionAmount,
        };
      })
      .sort(
        (a, b) => (b.monthRevenueAmount || 0) - (a.monthRevenueAmount || 0),
      );

    const monthRevenueAmount = organizations.reduce(
      (acc, o) => acc + Number(o.monthRevenueAmount || 0),
      0,
    );
    const monthCommissionAmount = organizations.reduce(
      (acc, o) => acc + Number(o.monthCommissionAmount || 0),
      0,
    );

    return res.status(200).json({
      success: true,
      data: {
        ym: `${effectiveYm.year}-${String(effectiveYm.month).padStart(2, "0")}`,
        commissionRate,
        payoutDayOfMonth,
        referralCode: String(me.referralCode || ""),
        overview: {
          referredOrganizationCount: organizations.length,
          monthRevenueAmount: roundMoney(monthRevenueAmount),
          monthCommissionAmount: roundMoney(monthCommissionAmount),
        },
        organizations,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "영업자 대시보드 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
