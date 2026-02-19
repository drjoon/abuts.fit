import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import File from "../../models/file.model.js";
import ActivityLog from "../../models/activityLog.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import PricingReferralStatsSnapshot from "../../models/pricingReferralStatsSnapshot.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  ymdToMmDd,
} from "../../utils/krBusinessDays.js";

const DEFAULT_DELIVERY_ETA_LEAD_DAYS = {
  d6: 2,
  d8: 2,
  d10: 5,
  d10plus: 5,
};

const BASE_UNIT_PRICE = 15000;
const DISCOUNT_PER_ORDER = 10;
const MAX_DISCOUNT_PER_UNIT = 5000;

function computeVolumeEffectiveUnitPrice(groupTotalOrders) {
  const totalOrders = Number(groupTotalOrders || 0);
  const discountAmount = Math.min(
    totalOrders * DISCOUNT_PER_ORDER,
    MAX_DISCOUNT_PER_UNIT,
  );
  return Math.max(0, BASE_UNIT_PRICE - discountAmount);
}

async function getMongoHealth() {
  const start = performance.now();
  try {
    const adminDb = mongoose.connection.db.admin();
    const pingResult = await adminDb.command({ ping: 1 });

    let serverStatus = null;
    try {
      serverStatus = await adminDb.command({ serverStatus: 1 });
    } catch {
      // serverStatus는 권한이 없는 환경에서 실패할 수 있으므로 무시한다.
    }

    const latencyMs = Math.round(performance.now() - start);
    const connections = serverStatus?.connections || null;
    const current = Number(connections?.current || 0);
    const available = Number(connections?.available || 0);
    const total = current + available || 0;
    const usageRatio = total > 0 ? current / total : 0;

    const status =
      latencyMs > 500 || (total > 0 && usageRatio > 0.8) ? "warning" : "ok";
    const message =
      total > 0
        ? `ping ${latencyMs}ms, connections ${current}/${current + available}`
        : `ping ${latencyMs}ms`;

    return {
      ok: true,
      latencyMs,
      status,
      message,
      metrics: {
        connections: total > 0 ? { current, available, usageRatio } : null,
        opCounters: serverStatus?.opcounters || null,
      },
      raw: { ping: pingResult },
    };
  } catch (error) {
    return { ok: false, message: error.message, status: "critical" };
  }
}

function generateRandomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

const ADMIN_REFERRAL_CACHE_TTL_MS = 60 * 60 * 1000;
const adminReferralCache = new Map();

function getAdminReferralCache(key) {
  const hit = adminReferralCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ADMIN_REFERRAL_CACHE_TTL_MS) {
    adminReferralCache.delete(key);
    return null;
  }
  return hit.value;
}

function setAdminReferralCache(key, value) {
  adminReferralCache.set(key, { ts: Date.now(), value });
}

/**
 * KST 기준 지난달(전월) 1일 00:00:00 ~ 말일 23:59:59 UTC 범위를 반환한다.
 */
function getLastMonthRangeUtc() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstYear = kstNow.getUTCFullYear();
  const kstMonth = kstNow.getUTCMonth(); // 0-indexed, 현재 월
  // 전월: kstMonth === 0이면 전년 12월
  const lastMonthYear = kstMonth === 0 ? kstYear - 1 : kstYear;
  const lastMonth = kstMonth === 0 ? 12 : kstMonth; // 1-indexed
  // KST 전월 1일 00:00:00 → UTC
  const startKst = new Date(
    Date.UTC(lastMonthYear, lastMonth - 1, 1, -9, 0, 0, 0),
  );
  // KST 전월 말일 23:59:59.999 → UTC
  const endKst = new Date(
    Date.UTC(lastMonthYear, lastMonth, 0, 14, 59, 59, 999),
  );
  return { start: startKst, end: endKst };
}

export async function getReferralGroups(req, res) {
  try {
    const refresh = String(req.query.refresh || "") === "1";
    if (!refresh) {
      const cached = getAdminReferralCache("referral-groups:v3");
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    const leaders = await User.find({
      $or: [
        { role: "salesman" },
        { role: "requestor", requestorRole: "owner" },
      ],
    })
      .select({
        _id: 1,
        role: 1,
        requestorRole: 1,
        name: 1,
        email: 1,
        organization: 1,
        organizationId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .lean();

    const leaderIds = leaders.map((l) => l._id).filter(Boolean);
    if (leaderIds.length === 0) {
      return res.status(200).json({ success: true, data: { groups: [] } });
    }

    const ymd = getTodayYmdInKst();

    const [directCounts, snapshots] = await Promise.all([
      User.aggregate([
        {
          $match: {
            referredByUserId: { $in: leaderIds },
            active: true,
            role: { $in: ["requestor", "salesman"] },
          },
        },
        { $group: { _id: "$referredByUserId", count: { $sum: 1 } } },
      ]),
      PricingReferralStatsSnapshot.find({
        ownerUserId: { $in: leaderIds },
        ymd,
      })
        .select({
          ownerUserId: 1,
          groupMemberCount: 1,
          groupTotalOrders: 1,
          computedAt: 1,
        })
        .lean(),
    ]);

    // 스냅샷이 비어있어도 overview 정합성을 위해 지난달 완료 의뢰 기준으로 fallback 집계
    const now = new Date();
    const { start: lastMonthStart, end: lastMonthEnd } = getLastMonthRangeUtc();

    const directChildren = leaderIds.length
      ? await User.find({
          referredByUserId: { $in: leaderIds },
          role: { $in: ["requestor", "salesman"] },
          active: true,
        })
          .select({ _id: 1, referredByUserId: 1 })
          .lean()
      : [];

    const childIds = (directChildren || []).map((u) => u._id).filter(Boolean);
    const relevantUserIds = [...leaderIds, ...childIds];
    const requestRows = relevantUserIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestor: { $in: relevantUserIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestor",
              orderCount: { $sum: 1 },
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
              bonusAmount: {
                $sum: { $ifNull: ["$price.bonusAmount", 0] },
              },
            },
          },
        ])
      : [];

    const requestorLeaderOrgIds = (leaders || [])
      .filter((l) => String(l?.role || "") === "requestor")
      .map((l) => String(l?.organizationId || ""))
      .filter(Boolean);
    const requestorLeaderOrgObjectIds = requestorLeaderOrgIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const requestorOrgRows = requestorLeaderOrgObjectIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestorOrganizationId: { $in: requestorLeaderOrgObjectIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestorOrganizationId",
              orderCount: { $sum: 1 },
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
              bonusAmount: {
                $sum: { $ifNull: ["$price.bonusAmount", 0] },
              },
            },
          },
        ])
      : [];
    const requestorOrgStatsByOrgId = new Map(
      (requestorOrgRows || []).map((r) => [
        String(r._id),
        {
          orderCount: Number(r.orderCount || 0),
          revenueAmount: Number(r.revenueAmount || 0),
          bonusAmount: Number(r.bonusAmount || 0),
        },
      ]),
    );

    const ordersByUserId = new Map(
      (requestRows || []).map((r) => [
        String(r._id),
        Number(r.orderCount || 0),
      ]),
    );
    const revenueByUserId = new Map(
      (requestRows || []).map((r) => [
        String(r._id),
        Number(r.revenueAmount || 0),
      ]),
    );
    const bonusByUserId = new Map(
      (requestRows || []).map((r) => [
        String(r._id),
        Number(r.bonusAmount || 0),
      ]),
    );

    const childIdsByLeaderId = new Map();
    for (const u of directChildren || []) {
      const lid = String(u?.referredByUserId || "");
      if (!lid) continue;
      const arr = childIdsByLeaderId.get(lid) || [];
      arr.push(String(u._id));
      childIdsByLeaderId.set(lid, arr);
    }

    const directCountByLeaderId = new Map();
    for (const r of directCounts || []) {
      directCountByLeaderId.set(String(r._id), Number(r.count || 0));
    }

    const isDev = process.env.NODE_ENV !== "production";
    const groups = leaders.map((leader) => {
      const directCount = directCountByLeaderId.get(String(leader._id)) || 0;

      const snapshot = (snapshots || []).find(
        (s) => String(s.ownerUserId) === String(leader._id),
      );
      const snapshotGroupMemberCount = Number(snapshot?.groupMemberCount || 0);

      const role = String(leader?.role || "");
      const fallbackChildIds = childIdsByLeaderId.get(String(leader._id)) || [];

      // 의뢰자 그룹: 조직(organizationId) 기준 집계(조직당 bonus 50,000원 정책과 정합)
      let groupTotalOrders = 0;
      let groupRevenueAmount = 0;
      let groupBonusAmount = 0;
      if (role === "requestor") {
        const orgIdStr = String(leader?.organizationId || "");
        const orgStats = orgIdStr
          ? requestorOrgStatsByOrgId.get(orgIdStr)
          : null;
        groupTotalOrders = Number(orgStats?.orderCount || 0);
        groupRevenueAmount = Number(orgStats?.revenueAmount || 0);
        groupBonusAmount = Number(orgStats?.bonusAmount || 0);
      } else {
        const fallbackOrders = fallbackChildIds.reduce((acc, cid) => {
          return acc + Number(ordersByUserId.get(String(cid)) || 0);
        }, 0);
        const fallbackLeaderOrders = Number(
          ordersByUserId.get(String(leader._id)) || 0,
        );
        groupTotalOrders = fallbackLeaderOrders + fallbackOrders;

        const fallbackRevenue = fallbackChildIds.reduce((acc, cid) => {
          return acc + Number(revenueByUserId.get(String(cid)) || 0);
        }, 0);
        const fallbackLeaderRevenue = Number(
          revenueByUserId.get(String(leader._id)) || 0,
        );
        groupRevenueAmount = fallbackLeaderRevenue + fallbackRevenue;

        const fallbackBonus = fallbackChildIds.reduce((acc, cid) => {
          return acc + Number(bonusByUserId.get(String(cid)) || 0);
        }, 0);
        const fallbackLeaderBonus = Number(
          bonusByUserId.get(String(leader._id)) || 0,
        );
        groupBonusAmount = fallbackLeaderBonus + fallbackBonus;
      }

      const baseUnitPrice = 15000;
      const discountPerOrder = 20;
      const maxDiscountPerUnit = 5000;
      const discountAmount = Math.min(
        groupTotalOrders * discountPerOrder,
        maxDiscountPerUnit,
      );
      let effectiveUnitPrice = Math.max(0, baseUnitPrice - discountAmount);
      let unitPriceDebug = null;

      if (String(leader?.role || "") === "requestor") {
        const baseDate =
          leader?.approvedAt ||
          (leader?.active ? leader?.updatedAt : null) ||
          leader?.createdAt;
        if (baseDate) {
          const fixedUntil = new Date(baseDate);
          fixedUntil.setDate(fixedUntil.getDate() + 90);
          if (now < fixedUntil) {
            effectiveUnitPrice = 10000;
          }
          if (isDev) {
            unitPriceDebug = {
              baseDate,
              fixedUntil,
              now,
              applied: now < fixedUntil,
              discountAmount,
              groupTotalOrders,
            };
          }
        }
      }

      return {
        leader,
        memberCount: directCount + 1,
        groupMemberCount: snapshotGroupMemberCount || directCount + 1,
        groupTotalOrders,
        effectiveUnitPrice,
        groupRevenueAmount,
        groupBonusAmount,
        snapshotComputedAt: snapshot?.computedAt || null,
        ...(isDev ? { unitPriceDebug } : {}),
      };
    });

    const requestorGroups = groups.filter(
      (g) => String(g?.leader?.role || "") === "requestor",
    );
    const salesmanGroups = groups.filter(
      (g) => String(g?.leader?.role || "") === "salesman",
    );

    const requestorGroupCount = requestorGroups.length;
    const salesmanGroupCount = salesmanGroups.length;

    const requestorTotalAccounts = requestorGroups.reduce(
      (acc, g) => acc + Number(g.memberCount || 0),
      0,
    );
    const salesmanTotalAccounts = salesmanGroups.reduce(
      (acc, g) => acc + Number(g.memberCount || 0),
      0,
    );

    const requestorAvgAccountsPerGroup = requestorGroupCount
      ? Math.round(requestorTotalAccounts / requestorGroupCount)
      : 0;
    const salesmanAvgAccountsPerGroup = salesmanGroupCount
      ? Math.round(salesmanTotalAccounts / salesmanGroupCount)
      : 0;

    const requestorTotalOrders = requestorGroups.reduce(
      (acc, g) => acc + Number(g.groupTotalOrders || 0),
      0,
    );

    // 매출은 가능한 실제 Request 합계(fallback) 사용. 스냅샷 기반 그룹은 추정치로 계산.
    const requestorTotalRevenueAmount = requestorGroups.reduce((acc, g) => {
      const revenue = Number(g.groupRevenueAmount || 0);
      if (Number.isFinite(revenue) && revenue > 0) return acc + revenue;
      const orders = Number(g.groupTotalOrders || 0);
      const unit = Number(g.effectiveUnitPrice || 0);
      return acc + orders * unit;
    }, 0);

    const requestorTotalBonusAmount = requestorGroups.reduce((acc, g) => {
      return acc + Number(g.groupBonusAmount || 0);
    }, 0);
    const requestorAvgRevenuePerGroup = requestorGroupCount
      ? Math.round(requestorTotalRevenueAmount / requestorGroupCount)
      : 0;

    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const kstStartOfDayUtc = new Date(
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate(),
        -9,
        0,
        0,
        0,
      ),
    );

    const requestorNetNewGroups = leaders.filter(
      (l) =>
        String(l?.role || "") === "requestor" &&
        l.createdAt &&
        new Date(l.createdAt).getTime() >= kstStartOfDayUtc.getTime(),
    ).length;

    const salesmanNetNewGroups = leaders.filter(
      (l) =>
        String(l?.role || "") === "salesman" &&
        l.createdAt &&
        new Date(l.createdAt).getTime() >= kstStartOfDayUtc.getTime(),
    ).length;

    const commissionRate = 0.05;

    const salesmanLeaderIds = salesmanGroups
      .map((g) => g.leader?._id)
      .filter(Boolean);

    const directRequestors = salesmanLeaderIds.length
      ? await User.find({
          referredByUserId: { $in: salesmanLeaderIds },
          role: "requestor",
          active: true,
        })
          .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
          .lean()
      : [];

    const referredSalesmen = salesmanLeaderIds.length
      ? await User.find({
          referredByUserId: { $in: salesmanLeaderIds },
          role: "salesman",
          active: true,
        })
          .select({ _id: 1, referredByUserId: 1 })
          .lean()
      : [];

    const referredSalesmanIds = (referredSalesmen || [])
      .map((u) => String(u?._id || ""))
      .filter(Boolean);

    const referredSalesmanObjectIds = referredSalesmanIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const level1Requestors = referredSalesmanObjectIds.length
      ? await User.find({
          referredByUserId: { $in: referredSalesmanObjectIds },
          role: "requestor",
          active: true,
        })
          .select({ _id: 1, referredByUserId: 1, organizationId: 1 })
          .lean()
      : [];

    // 수수료/주문 집계는 조직 단위(organizationId)로 통일한다.
    const commissionOrgIdStrings = [
      ...(directRequestors || [])
        .map((u) => String(u?.organizationId || ""))
        .filter(Boolean),
      ...(level1Requestors || [])
        .map((u) => String(u?.organizationId || ""))
        .filter(Boolean),
    ];
    const commissionOrgObjectIds = Array.from(new Set(commissionOrgIdStrings))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const commissionOrgRows = commissionOrgObjectIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestorOrganizationId: { $in: commissionOrgObjectIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestorOrganizationId",
              orderCount: { $sum: 1 },
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
            },
          },
        ])
      : [];

    const commissionOrdersByOrgId = new Map(
      (commissionOrgRows || []).map((r) => [
        String(r._id),
        Number(r.orderCount || 0),
      ]),
    );
    const commissionRevenueByOrgId = new Map(
      (commissionOrgRows || []).map((r) => [
        String(r._id),
        Number(r.revenueAmount || 0),
      ]),
    );

    const requestorOrgIdsBySalesmanLeaderId = new Map();
    for (const u of directRequestors || []) {
      const leaderId = String(u?.referredByUserId || "");
      const orgId = String(u?.organizationId || "");
      if (!leaderId || !orgId) continue;
      const arr = requestorOrgIdsBySalesmanLeaderId.get(leaderId) || [];
      arr.push(orgId);
      requestorOrgIdsBySalesmanLeaderId.set(leaderId, arr);
    }

    const leaderIdByReferredSalesmanId = new Map();
    for (const s of referredSalesmen || []) {
      const sid = String(s?._id || "");
      const leaderId = String(s?.referredByUserId || "");
      if (!sid || !leaderId) continue;
      leaderIdByReferredSalesmanId.set(sid, leaderId);
    }

    const level1RequestorOrgIdsBySalesmanLeaderId = new Map();
    for (const u of level1Requestors || []) {
      const refSalesmanId = String(u?.referredByUserId || "");
      const leaderId = String(
        leaderIdByReferredSalesmanId.get(refSalesmanId) || "",
      );
      const orgId = String(u?.organizationId || "");
      if (!leaderId || !orgId) continue;
      const arr = level1RequestorOrgIdsBySalesmanLeaderId.get(leaderId) || [];
      arr.push(orgId);
      level1RequestorOrgIdsBySalesmanLeaderId.set(leaderId, arr);
    }

    // 1단계: 각 영업자 리더의 직접 수수료 계산
    const directCommissionByLeaderId = new Map();
    let salesmanTotalReferralOrders = 0;
    let salesmanTotalReferredRevenueAmount = 0;
    for (const g of salesmanGroups) {
      const leaderId = String(g?.leader?._id || "");
      if (!leaderId) continue;
      const requestorOrgIds =
        requestorOrgIdsBySalesmanLeaderId.get(leaderId) || [];
      let directRevenue = 0;
      for (const oid of requestorOrgIds) {
        directRevenue += Number(commissionRevenueByOrgId.get(String(oid)) || 0);
        salesmanTotalReferralOrders += Number(
          commissionOrdersByOrgId.get(String(oid)) || 0,
        );
      }
      const level1RequestorOrgIds =
        level1RequestorOrgIdsBySalesmanLeaderId.get(leaderId) || [];
      for (const oid of level1RequestorOrgIds) {
        salesmanTotalReferralOrders += Number(
          commissionOrdersByOrgId.get(String(oid)) || 0,
        );
        salesmanTotalReferredRevenueAmount += Number(
          commissionRevenueByOrgId.get(String(oid)) || 0,
        );
      }
      salesmanTotalReferredRevenueAmount += directRevenue;
      directCommissionByLeaderId.set(leaderId, directRevenue * commissionRate);
    }

    // referredSalesmen을 리더별로 그룹화 (직계1 영업자 목록)
    const childSalesmanIdsByLeaderId = new Map();
    for (const s of referredSalesmen || []) {
      const sid = String(s?._id || "");
      const leaderId = String(s?.referredByUserId || "");
      if (!sid || !leaderId) continue;
      const arr = childSalesmanIdsByLeaderId.get(leaderId) || [];
      arr.push(sid);
      childSalesmanIdsByLeaderId.set(leaderId, arr);
    }

    // 2단계: 직계1 영업자의 직접 수수료 * 50%를 간접 수수료로 합산
    const commissionBySalesmanLeaderId = new Map();
    let salesmanTotalCommissionAmount = 0;
    for (const g of salesmanGroups) {
      const leaderId = String(g?.leader?._id || "");
      if (!leaderId) continue;
      const directCommission = Number(
        directCommissionByLeaderId.get(leaderId) || 0,
      );
      const childSalesmanIds = childSalesmanIdsByLeaderId.get(leaderId) || [];
      const indirectCommission =
        childSalesmanIds.reduce((acc, sid) => {
          return acc + Number(directCommissionByLeaderId.get(sid) || 0);
        }, 0) * 0.5;
      const totalCommission = directCommission + indirectCommission;
      commissionBySalesmanLeaderId.set(leaderId, totalCommission);
      salesmanTotalCommissionAmount += totalCommission;
    }

    let salesmanAvgCommissionPerGroup = salesmanGroupCount
      ? Math.round(salesmanTotalCommissionAmount / salesmanGroupCount)
      : 0;

    const groupsWithCommission = groups.map((g) => {
      const role = String(g?.leader?.role || "");
      if (role !== "salesman") return g;
      const leaderId = String(g?.leader?._id || "");
      return {
        ...g,
        commissionAmount: Math.round(
          Number(commissionBySalesmanLeaderId.get(leaderId) || 0),
        ),
      };
    });

    // overview는 전체 영업자 기준으로 집계한다(리더만 합산하면 누락 가능)
    const allSalesmen = await User.find({ role: "salesman", active: true })
      .select({ _id: 1, referredByUserId: 1 })
      .lean();
    const allSalesmanIds = (allSalesmen || [])
      .map((s) => s._id)
      .filter(Boolean);

    const allDirectRequestors = allSalesmanIds.length
      ? await User.find({
          role: "requestor",
          active: true,
          referredByUserId: { $in: allSalesmanIds },
        })
          .select({ _id: 1, referredByUserId: 1 })
          .lean()
      : [];

    const allDirectRequestorIds = (allDirectRequestors || [])
      .map((u) => u._id)
      .filter(Boolean);

    const allSalesmanRequestRows = allDirectRequestorIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestor: { $in: allDirectRequestorIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestor",
              orderCount: { $sum: 1 },
              revenueAmount: {
                $sum: {
                  $ifNull: [
                    "$price.paidAmount",
                    { $ifNull: ["$price.amount", 0] },
                  ],
                },
              },
            },
          },
        ])
      : [];

    const allSalesmanOrdersByRequestorId = new Map(
      (allSalesmanRequestRows || []).map((r) => [
        String(r._id),
        Number(r.orderCount || 0),
      ]),
    );
    const allSalesmanRevenueByRequestorId = new Map(
      (allSalesmanRequestRows || []).map((r) => [
        String(r._id),
        Number(r.revenueAmount || 0),
      ]),
    );

    const directRevenueBySalesmanId = new Map();
    let allSalesmanTotalReferralOrders = 0;
    let allSalesmanTotalReferredRevenueAmount = 0;
    for (const u of allDirectRequestors || []) {
      const sid = String(u?.referredByUserId || "");
      if (!sid) continue;
      const rid = String(u?._id || "");
      if (!rid) continue;
      const revenue = Number(allSalesmanRevenueByRequestorId.get(rid) || 0);
      const orders = Number(allSalesmanOrdersByRequestorId.get(rid) || 0);
      allSalesmanTotalReferralOrders += orders;
      allSalesmanTotalReferredRevenueAmount += revenue;
      directRevenueBySalesmanId.set(
        sid,
        Number(directRevenueBySalesmanId.get(sid) || 0) + revenue,
      );
    }

    const directCommissionBySalesmanId = new Map();
    for (const s of allSalesmen || []) {
      const sid = String(s?._id || "");
      if (!sid) continue;
      const revenue = Number(directRevenueBySalesmanId.get(sid) || 0);
      directCommissionBySalesmanId.set(sid, revenue * commissionRate);
    }

    const childrenSalesmenIdsByParentId = new Map();
    for (const s of allSalesmen || []) {
      const sid = String(s?._id || "");
      const parentId = String(s?.referredByUserId || "");
      if (!sid || !parentId) continue;
      const arr = childrenSalesmenIdsByParentId.get(parentId) || [];
      arr.push(sid);
      childrenSalesmenIdsByParentId.set(parentId, arr);
    }

    let allSalesmanTotalCommissionAmount = 0;
    for (const s of allSalesmen || []) {
      const sid = String(s?._id || "");
      if (!sid) continue;
      const directCommission = Number(
        directCommissionBySalesmanId.get(sid) || 0,
      );
      const childIds = childrenSalesmenIdsByParentId.get(sid) || [];
      const childDirectCommissionSum = childIds.reduce((acc, cid) => {
        return acc + Number(directCommissionBySalesmanId.get(cid) || 0);
      }, 0);
      const indirectCommission = childDirectCommissionSum * 0.5;
      allSalesmanTotalCommissionAmount += directCommission + indirectCommission;
    }

    salesmanAvgCommissionPerGroup = salesmanGroupCount
      ? Math.round(allSalesmanTotalCommissionAmount / salesmanGroupCount)
      : 0;

    const totalGroups = groupsWithCommission.length;
    const totalAccounts = groups.reduce(
      (acc, g) => acc + Number(g.memberCount || 0),
      0,
    );
    const totalGroupOrders = groupsWithCommission.reduce(
      (acc, g) => acc + Number(g.groupTotalOrders || 0),
      0,
    );
    const avgEffectiveUnitPrice =
      groups.length > 0
        ? Math.round(
            groups.reduce(
              (acc, g) => acc + Number(g.effectiveUnitPrice || 0),
              0,
            ) / groups.length,
          )
        : BASE_UNIT_PRICE;

    const payload = {
      success: true,
      data: {
        overview: {
          ymd,
          totalGroups,
          totalAccounts,
          totalGroupOrders,
          avgEffectiveUnitPrice,
          requestor: {
            groupCount: requestorGroupCount,
            avgAccountsPerGroup: requestorAvgAccountsPerGroup,
            netNewGroups: requestorNetNewGroups,
            avgRevenuePerGroup: requestorAvgRevenuePerGroup,
            totalRevenueAmount: Math.round(requestorTotalRevenueAmount),
            totalBonusAmount: Math.round(requestorTotalBonusAmount),
            totalOrders: Math.round(requestorTotalOrders),
          },
          salesman: {
            groupCount: salesmanGroupCount,
            avgAccountsPerGroup: salesmanAvgAccountsPerGroup,
            netNewGroups: salesmanNetNewGroups,
            avgCommissionPerGroup: salesmanAvgCommissionPerGroup,
            totalCommissionAmount: Math.round(allSalesmanTotalCommissionAmount),
            totalReferredRevenueAmount: Math.round(
              allSalesmanTotalReferredRevenueAmount,
            ),
            totalReferredBonusAmount: Math.round(
              salesmanGroups.reduce(
                (acc, g) => acc + Number(g.groupBonusAmount || 0),
                0,
              ),
            ),
            totalReferralOrders: Math.round(allSalesmanTotalReferralOrders),
          },
        },
        groups: groupsWithCommission,
      },
    };

    if (!refresh) {
      setAdminReferralCache("referral-groups:v3", payload);
    }
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "리퍼럴 그룹 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function getReferralGroupTree(req, res) {
  try {
    const { leaderId } = req.params;

    const cacheKey = `referral-group-tree:v3:${leaderId}`;
    const refresh = String(req.query.refresh || "") === "1";
    if (!refresh) {
      const cached = getAdminReferralCache(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    if (!Types.ObjectId.isValid(leaderId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 리더 ID입니다.",
      });
    }

    const leader = await User.findById(leaderId)
      .select({
        _id: 1,
        role: 1,
        name: 1,
        email: 1,
        organization: 1,
        organizationId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
        referredByUserId: 1,
        referralGroupLeaderId: 1,
      })
      .lean();

    if (!leader) {
      return res.status(404).json({
        success: false,
        message: "리더를 찾을 수 없습니다.",
      });
    }

    if (!["requestor", "salesman"].includes(String(leader.role || ""))) {
      return res.status(404).json({
        success: false,
        message: "리더를 찾을 수 없습니다.",
      });
    }

    const members = await User.find({
      $or: [
        { _id: leader._id },
        { referralGroupLeaderId: leader._id },
        { referredByUserId: leader._id },
      ],
      role: { $in: ["requestor", "salesman"] },
    })
      .select({
        _id: 1,
        role: 1,
        name: 1,
        email: 1,
        organization: 1,
        organizationId: 1,
        active: 1,
        createdAt: 1,
        approvedAt: 1,
        updatedAt: 1,
        referredByUserId: 1,
        referralGroupLeaderId: 1,
      })
      .lean();

    const now = new Date();
    const { start: lastMonthStart, end: lastMonthEnd } = getLastMonthRangeUtc();

    const memberIds = (members || []).map((m) => m._id).filter(Boolean);
    const orderRows = memberIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestor: { $in: memberIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestor",
              totalOrders: { $sum: 1 },
              paidOrders: {
                $sum: {
                  $cond: [
                    { $gt: [{ $ifNull: ["$price.paidAmount", 0] }, 0] },
                    1,
                    0,
                  ],
                },
              },
              bonusOrders: {
                $sum: {
                  $cond: [
                    { $gt: [{ $ifNull: ["$price.bonusAmount", 0] }, 0] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [];
    const ordersByUserId = new Map();
    for (const r of orderRows || []) {
      ordersByUserId.set(String(r._id), {
        total: Number(r.totalOrders || 0),
        paid: Number(r.paidOrders || 0),
        bonus: Number(r.bonusOrders || 0),
      });
    }

    const ymd = getTodayYmdInKst();
    const snapshot = await PricingReferralStatsSnapshot.findOne({
      $or: [
        { ownerUserId: leader._id, ymd },
        { groupLeaderId: leader._id, ymd, ownerUserId: null },
      ],
    })
      .select({
        ownerUserId: 1,
        groupMemberCount: 1,
        groupTotalOrders: 1,
        computedAt: 1,
      })
      .lean();
    const snapshotGroupTotalOrders = Number(snapshot?.groupTotalOrders || 0);
    const snapshotGroupMemberCount = Number(snapshot?.groupMemberCount || 0);

    const nodes = (members || []).map((u) => ({
      _id: u._id,
      role: u.role,
      name: u.name,
      email: u.email,
      organization: u.organization,
      organizationId: u.organizationId,
      active: u.active,
      createdAt: u.createdAt,
      approvedAt: u.approvedAt,
      updatedAt: u.updatedAt,
      referredByUserId: u.referredByUserId || null,
      lastMonthOrders: ordersByUserId.get(String(u._id))?.total || 0,
      lastMonthPaidOrders: ordersByUserId.get(String(u._id))?.paid || 0,
      lastMonthBonusOrders: ordersByUserId.get(String(u._id))?.bonus || 0,
      commissionAmount: 0, // 이후 루프에서 채워짐
    }));

    // 영업자 노드용 수수료 계산(지난달, 유료 매출 기준)
    const requestorNodes = nodes.filter(
      (n) => String(n?.role || "") === "requestor" && n.organizationId,
    );
    const orgIdsInGroup = Array.from(
      new Set(
        (requestorNodes || [])
          .map((n) => String(n.organizationId || ""))
          .filter(Boolean),
      ),
    );
    const orgObjectIdsInGroup = orgIdsInGroup
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const orgRevenueRows = orgObjectIdsInGroup.length
      ? await Request.aggregate([
          {
            $match: {
              requestorOrganizationId: { $in: orgObjectIdsInGroup },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
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
            },
          },
        ])
      : [];
    const revenueByOrgIdInGroup = new Map();
    for (const r of orgRevenueRows || []) {
      revenueByOrgIdInGroup.set(String(r._id), {
        paid: Number(r.revenueAmount || 0),
        bonus: Number(r.bonusAmount || 0),
      });
    }

    const nodesByReferredBy = new Map();
    for (const n of nodes) {
      const pid = n.referredByUserId ? String(n.referredByUserId) : "";
      if (!pid) continue;
      const arr = nodesByReferredBy.get(pid) || [];
      arr.push(n);
      nodesByReferredBy.set(pid, arr);
    }

    const commissionRate = 0.05;

    // 의뢰자 노드: commissionAmount = 해당 조직의 지난달 유료 매출 * 5%
    for (const n of nodes) {
      if (String(n?.role || "") !== "requestor") continue;
      const oid = String(n.organizationId || "");
      if (!oid) continue;
      const rev = revenueByOrgIdInGroup.get(oid);
      if (!rev) continue;
      n.commissionAmount = Math.round(Number(rev.paid || 0) * commissionRate);
    }

    // 1단계: 모든 영업자의 직접 수수료(directCommissionAmount) 먼저 계산
    for (const n of nodes) {
      if (String(n?.role || "") !== "salesman") continue;
      const directChildren = nodesByReferredBy.get(String(n._id)) || [];
      const directRequestors = directChildren.filter(
        (c) => String(c?.role || "") === "requestor",
      );

      const directRevenue = directRequestors.reduce((acc, r) => {
        const oid = String(r.organizationId || "");
        if (!oid) return acc;
        return acc + Number(revenueByOrgIdInGroup.get(oid)?.paid || 0);
      }, 0);

      n.directCommissionAmount = Math.round(directRevenue * commissionRate);

      // 영업자 노드의 lastMonthOrders = 직계 의뢰자들의 주문 합계
      n.lastMonthOrders = directRequestors.reduce(
        (acc, r) => acc + Number(r.lastMonthOrders || 0),
        0,
      );
      n.lastMonthPaidOrders = directRequestors.reduce(
        (acc, r) => acc + Number(r.lastMonthPaidOrders || 0),
        0,
      );
      n.lastMonthBonusOrders = directRequestors.reduce(
        (acc, r) => acc + Number(r.lastMonthBonusOrders || 0),
        0,
      );
    }

    // 2단계: 직계1 영업자의 directCommissionAmount * 50%를 간접 수수료로 계산
    const indirectCommissionShareRate = 0.5;
    for (const n of nodes) {
      if (String(n?.role || "") !== "salesman") continue;
      const directChildren = nodesByReferredBy.get(String(n._id)) || [];
      const directSalesmen = directChildren.filter(
        (c) => String(c?.role || "") === "salesman",
      );

      n.level1CommissionAmount = Math.round(
        directSalesmen.reduce(
          (acc, s) => acc + Number(s.directCommissionAmount || 0),
          0,
        ) * indirectCommissionShareRate,
      );
      n.commissionAmount =
        (n.directCommissionAmount || 0) + n.level1CommissionAmount;
    }

    const nodeById = new Map(nodes.map((n) => [String(n._id), n]));
    const childrenByParentId = new Map();

    for (const n of nodes) {
      const parentId = n.referredByUserId ? String(n.referredByUserId) : null;
      if (!parentId) continue;
      if (!nodeById.has(parentId)) continue;
      const arr = childrenByParentId.get(parentId) || [];
      arr.push(String(n._id));
      childrenByParentId.set(parentId, arr);
    }

    const buildTree = (id, visited) => {
      if (visited.has(id)) return null;
      visited.add(id);

      const base = nodeById.get(id);
      if (!base) return null;

      const childIds = childrenByParentId.get(id) || [];
      const children = childIds
        .map((cid) => buildTree(cid, visited))
        .filter(Boolean);

      return {
        ...base,
        children,
      };
    };

    const rootId = String(leader._id);
    const tree = buildTree(rootId, new Set()) || {
      ...nodeById.get(rootId),
      children: [],
    };

    const attached = new Set();
    const walk = (t) => {
      if (!t) return;
      attached.add(String(t._id));
      for (const c of t.children || []) walk(c);
    };
    walk(tree);

    const orphans = nodes
      .filter((n) => !attached.has(String(n._id)))
      .map((n) => ({ ...n, children: [] }));

    if (orphans.length) {
      tree.children = [...(tree.children || []), ...orphans];
    }

    const directChildIdSet = new Set(
      nodes
        .filter((n) => String(n.referredByUserId || "") === String(leader._id))
        .map((n) => String(n._id)),
    );
    const computedTierTotalOrders = nodes.reduce((acc, n) => {
      const idStr = String(n._id);
      const isOwner = idStr === String(leader._id);
      const isDirectChild = directChildIdSet.has(idStr);
      if (!isOwner && !isDirectChild) return acc;
      return acc + Number(n.lastMonthOrders || 0);
    }, 0);
    const computedTierPaidOrders = nodes.reduce((acc, n) => {
      const idStr = String(n._id);
      const isOwner = idStr === String(leader._id);
      const isDirectChild = directChildIdSet.has(idStr);
      if (!isOwner && !isDirectChild) return acc;
      return acc + Number(n.lastMonthPaidOrders || 0);
    }, 0);
    const computedTierBonusOrders = nodes.reduce((acc, n) => {
      const idStr = String(n._id);
      const isOwner = idStr === String(leader._id);
      const isDirectChild = directChildIdSet.has(idStr);
      if (!isOwner && !isDirectChild) return acc;
      return acc + Number(n.lastMonthBonusOrders || 0);
    }, 0);
    const computedTierMemberCount = 1 + directChildIdSet.size;

    const computedTierOrgIdSet = new Set(
      nodes
        .filter((n) => {
          const idStr = String(n._id);
          const isOwner = idStr === String(leader._id);
          const isDirectChild = directChildIdSet.has(idStr);
          if (!isOwner && !isDirectChild) return false;
          return String(n?.role || "") === "requestor" && n.organizationId;
        })
        .map((n) => String(n.organizationId || ""))
        .filter(Boolean),
    );
    const computedTierPaidRevenue = Array.from(computedTierOrgIdSet).reduce(
      (acc, oid) => acc + Number(revenueByOrgIdInGroup.get(oid)?.paid || 0),
      0,
    );
    const computedTierBonusRevenue = Array.from(computedTierOrgIdSet).reduce(
      (acc, oid) => acc + Number(revenueByOrgIdInGroup.get(oid)?.bonus || 0),
      0,
    );

    tree.tierPaidOrders = computedTierPaidOrders;
    tree.tierBonusOrders = computedTierBonusOrders;
    tree.tierPaidRevenue = Math.round(computedTierPaidRevenue);
    tree.tierBonusRevenue = Math.round(computedTierBonusRevenue);

    if (!snapshot) {
      await PricingReferralStatsSnapshot.findOneAndUpdate(
        { groupLeaderId: leader._id, ymd },
        {
          $set: {
            ownerUserId: leader._id,
            groupLeaderId: leader._id,
            groupMemberCount: computedTierMemberCount,
            groupTotalOrders: computedTierTotalOrders,
            computedAt: now,
          },
        },
        { upsert: true, new: false },
      );
    }

    const groupTotalOrders = snapshot
      ? snapshotGroupTotalOrders
      : computedTierTotalOrders;
    const baseUnitPrice = 15000;
    const discountPerOrder = 20;
    const maxDiscountPerUnit = 5000;
    const discountAmount = Math.min(
      groupTotalOrders * discountPerOrder,
      maxDiscountPerUnit,
    );
    const isDev = process.env.NODE_ENV !== "production";
    let effectiveUnitPrice = Math.max(0, baseUnitPrice - discountAmount);
    let unitPriceDebug = null;

    if (String(leader?.role || "") === "requestor") {
      const baseDate =
        leader?.approvedAt ||
        (leader?.active ? leader?.updatedAt : null) ||
        leader?.createdAt;
      if (baseDate) {
        const fixedUntil = new Date(baseDate);
        fixedUntil.setDate(fixedUntil.getDate() + 90);
        if (now < fixedUntil) {
          effectiveUnitPrice = 10000;
        }
        if (isDev) {
          unitPriceDebug = {
            baseDate,
            fixedUntil,
            now,
            applied: now < fixedUntil,
          };
        }
      }
    }

    let commissionAmount = 0;
    if (String(leader?.role || "") === "salesman") {
      const leaderNode = nodes.find(
        (n) => String(n?._id || "") === String(leader._id),
      );
      commissionAmount = Math.round(Number(leaderNode?.commissionAmount || 0));
    }

    const payload = {
      success: true,
      data: {
        leader,
        memberCount: computedTierMemberCount,
        groupTotalOrders,
        tierPaidOrders: computedTierPaidOrders,
        tierBonusOrders: computedTierBonusOrders,
        tierPaidRevenue: Math.round(computedTierPaidRevenue),
        tierBonusRevenue: Math.round(computedTierBonusRevenue),
        effectiveUnitPrice,
        commissionAmount,
        snapshot: snapshot
          ? {
              ymd,
              groupMemberCount: snapshotGroupMemberCount,
              groupTotalOrders: snapshotGroupTotalOrders,
              computedAt: snapshot?.computedAt || null,
            }
          : null,
        tree,
        ...(isDev ? { unitPriceDebug } : {}),
      },
    };

    if (!refresh) {
      setAdminReferralCache(cacheKey, payload);
    }
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "리퍼럴 그룹 계층도 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function triggerReferralSnapshotRecalc(req, res) {
  try {
    const ymd = getTodayYmdInKst();
    const { start: lastMonthStart, end: lastMonthEnd } = getLastMonthRangeUtc();

    const leaders = await User.find({
      $or: [
        { role: "salesman" },
        { role: "requestor", requestorRole: "owner" },
      ],
      active: true,
    })
      .select({ _id: 1, role: 1, organizationId: 1 })
      .lean();

    if (!leaders.length) {
      return res.status(200).json({ success: true, upsertCount: 0, ymd });
    }

    const leaderIds = leaders.map((l) => l._id).filter(Boolean);

    const directChildren = await User.find({
      referredByUserId: { $in: leaderIds },
      role: { $in: ["requestor", "salesman"] },
      active: true,
    })
      .select({ _id: 1, referredByUserId: 1, organizationId: 1, role: 1 })
      .lean();

    const childIdsByLeaderId = new Map();
    for (const u of directChildren) {
      const lid = String(u.referredByUserId || "");
      if (!lid) continue;
      const arr = childIdsByLeaderId.get(lid) || [];
      arr.push(u);
      childIdsByLeaderId.set(lid, arr);
    }

    const relevantUserIds = [
      ...leaderIds,
      ...directChildren.map((u) => u._id),
    ].filter(Boolean);

    const requestRows = relevantUserIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestor: { $in: relevantUserIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          { $group: { _id: "$requestor", orderCount: { $sum: 1 } } },
        ])
      : [];

    const ordersByUserId = new Map(
      requestRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
    );

    const requestorLeaderOrgIds = leaders
      .filter((l) => String(l.role) === "requestor" && l.organizationId)
      .map((l) => String(l.organizationId));
    const requestorLeaderOrgObjectIds = requestorLeaderOrgIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const orgOrderRows = requestorLeaderOrgObjectIds.length
      ? await Request.aggregate([
          {
            $match: {
              requestorOrganizationId: { $in: requestorLeaderOrgObjectIds },
              status: "완료",
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          {
            $group: {
              _id: "$requestorOrganizationId",
              orderCount: { $sum: 1 },
            },
          },
        ])
      : [];

    const ordersByOrgId = new Map(
      orgOrderRows.map((r) => [String(r._id), Number(r.orderCount || 0)]),
    );

    let upsertCount = 0;
    for (const leader of leaders) {
      const lid = String(leader._id);
      const children = childIdsByLeaderId.get(lid) || [];
      const memberCount = 1 + children.length;

      let groupTotalOrders = 0;
      if (String(leader.role) === "requestor") {
        const orgId = String(leader.organizationId || "");
        groupTotalOrders = orgId ? ordersByOrgId.get(orgId) || 0 : 0;
      } else {
        const leaderOrders = ordersByUserId.get(lid) || 0;
        const childOrders = children.reduce(
          (acc, c) => acc + (ordersByUserId.get(String(c._id)) || 0),
          0,
        );
        groupTotalOrders = leaderOrders + childOrders;
      }

      await PricingReferralStatsSnapshot.findOneAndUpdate(
        { groupLeaderId: leader._id, ymd },
        {
          $set: {
            ownerUserId: leader._id,
            groupLeaderId: leader._id,
            groupMemberCount: memberCount,
            groupTotalOrders,
            computedAt: new Date(),
          },
        },
        { upsert: true, new: false },
      );
      upsertCount++;
    }

    adminReferralCache.clear();

    return res.status(200).json({
      success: true,
      upsertCount,
      ymd,
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "스냅샷 재계산 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getReferralSnapshotStatus(req, res) {
  try {
    const ymd = getTodayYmdInKst();
    const latest = await PricingReferralStatsSnapshot.findOne()
      .sort({ computedAt: -1 })
      .select({ computedAt: 1, ymd: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        lastComputedAt: latest?.computedAt || null,
        lastYmd: latest?.ymd || null,
        todayYmd: ymd,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "스냅샷 상태 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function fetchHealthJson(url, fallbackMessage) {
  if (!url) return { status: "unknown", message: fallbackMessage };
  try {
    const res = await fetch(url, { timeout: 3000 });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    return {
      status: data.status || "ok",
      message: data.message || fallbackMessage,
      data,
    };
  } catch (err) {
    return { status: "warning", message: fallbackMessage || err.message };
  }
}

async function getNetworkHealth() {
  const tlsUrl = process.env.TLS_HEALTH_URL;
  const wafUrl = process.env.WAF_HEALTH_URL;
  const [tls, waf] = await Promise.all([
    fetchHealthJson(tlsUrl, "TLS 만료 정보를 가져오지 못했습니다"),
    fetchHealthJson(wafUrl, "WAF 상태 정보를 가져오지 못했습니다"),
  ]);
  const status =
    tls.status === "critical" || waf.status === "critical"
      ? "critical"
      : tls.status === "warning" || waf.status === "warning"
        ? "warning"
        : "ok";
  const message = `TLS: ${tls.message || "-"}, WAF: ${waf.message || "-"}`;
  return { status, message };
}

async function getApiHealth({ blockedAttempts }) {
  return {
    status: blockedAttempts > 0 ? "warning" : "ok",
    message:
      blockedAttempts > 0
        ? "차단 이벤트 감지됨"
        : "속도 제한 적용, 토큰 관리 중",
  };
}

async function getBackupHealth(sec) {
  const backupUrl = process.env.BACKUP_HEALTH_URL;
  const backup = await fetchHealthJson(
    backupUrl,
    sec.backupFrequency
      ? `백업 주기: ${sec.backupFrequency}`
      : "백업 주기가 설정되지 않았습니다",
  );
  const status =
    backup.status && backup.status !== "unknown"
      ? backup.status
      : sec.backupFrequency
        ? "ok"
        : "warning";
  return { status, message: backup.message };
}

export async function logSecurityEvent({
  userId,
  action,
  severity = "info",
  status = "info",
  details = null,
  ipAddress = "",
}) {
  try {
    await ActivityLog.create({
      userId,
      action,
      severity,
      status,
      details,
      ipAddress,
    });
    if (
      (severity === "high" || severity === "critical") &&
      process.env.PUSHOVER_TOKEN &&
      process.env.PUSHOVER_USER_KEY
    ) {
      try {
        await fetch("https://api.pushover.net/1/messages.json", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: process.env.PUSHOVER_TOKEN,
            user: process.env.PUSHOVER_USER_KEY,
            title: `[Security] ${severity.toUpperCase()}`,
            message: `${action || "event"} - ${status}`,
            priority: severity === "critical" ? "1" : "0",
          }).toString(),
        });
      } catch (pushErr) {
        console.error("[logSecurityEvent] pushover send failed", pushErr);
      }
    }
  } catch (err) {
    console.error("[logSecurityEvent] failed", err);
  }
}

export async function logAuthFailure(req, reason, user = null) {
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
  await logSecurityEvent({
    userId: user?._id,
    action: "AUTH_FAILURE",
    severity: "medium",
    status: "failed",
    details: {
      reason,
      email: req.body?.email,
    },
    ipAddress: clientIp,
  });
}

async function formatEtaLabelFromNow(days) {
  const d = typeof days === "number" && !Number.isNaN(days) ? days : 0;
  const todayYmd = getTodayYmdInKst();
  const etaYmd = await addKoreanBusinessDays({ startYmd: todayYmd, days: d });
  return ymdToMmDd(etaYmd);
}

async function getDeliveryEtaLeadDays() {
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return {
      ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
      ...(doc?.deliveryEtaLeadDays || {}),
    };
  } catch {
    return DEFAULT_DELIVERY_ETA_LEAD_DAYS;
  }
}

function getDateRangeFromQuery(req) {
  const now = new Date();
  const startDateRaw = req.query.startDate;
  const endDateRaw = req.query.endDate;

  if (startDateRaw && endDateRaw) {
    const start = new Date(startDateRaw);
    const end = new Date(endDateRaw);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }

  // 기본값: 최근 30일
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { start, end: now };
}

/**
 * 가격/할인 통계(요약)
 * @route GET /api/admin/pricing-stats
 */
async function getPricingStats(req, res) {
  try {
    const { start, end } = getDateRangeFromQuery(req);
    const match = {
      createdAt: { $gte: start, $lte: end },
      status: "완료",
    };

    const rows = await Request.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          paidOrders: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$price.paidAmount", 0] }, 0] },
                1,
                0,
              ],
            },
          },
          bonusOrders: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $ifNull: ["$price.bonusAmount", 0] }, 0] },
                    { $eq: [{ $ifNull: ["$price.paidAmount", 0] }, 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalRevenue: {
            $sum: {
              $ifNull: ["$price.paidAmount", { $ifNull: ["$price.amount", 0] }],
            },
          },
          totalBonusRevenue: {
            $sum: { $ifNull: ["$price.bonusAmount", 0] },
          },
          totalBaseAmount: { $sum: { $ifNull: ["$price.baseAmount", 0] } },
          totalDiscountAmount: {
            $sum: { $ifNull: ["$price.discountAmount", 0] },
          },
        },
      },
    ]);

    const summary = rows && rows.length > 0 ? rows[0] : {};
    const totalOrders = summary.totalOrders || 0;
    const paidOrders = summary.paidOrders || 0;
    const bonusOrders = summary.bonusOrders || 0;
    const totalRevenue = summary.totalRevenue || 0;
    const totalBonusRevenue = summary.totalBonusRevenue || 0;
    const totalBaseAmount = summary.totalBaseAmount || 0;
    const totalDiscountAmount = summary.totalDiscountAmount || 0;

    const shippingRows = await ShippingPackage.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          packageCount: { $sum: 1 },
          totalShippingFeeSupply: {
            $sum: { $ifNull: ["$shippingFeeSupply", 0] },
          },
        },
      },
    ]);
    const shipSummary =
      shippingRows && shippingRows.length > 0 ? shippingRows[0] : {};
    const rawPackageCount = Number(shipSummary.packageCount || 0);
    const rawTotalShippingFeeSupply = Number(
      shipSummary.totalShippingFeeSupply || 0,
    );

    const DEFAULT_SHIPPING_FEE_SUPPLY = 3500;
    const packageCount = rawPackageCount > 0 ? rawPackageCount : totalOrders;
    const totalShippingFeeSupply =
      rawPackageCount > 0
        ? rawTotalShippingFeeSupply
        : totalOrders * DEFAULT_SHIPPING_FEE_SUPPLY;
    const avgShippingFeeSupply = totalOrders
      ? Math.round(totalShippingFeeSupply / totalOrders)
      : 0;

    // 추천인(referrer) 기준으로, 추천받은 유저들의 주문을 합산 집계
    const referralRows = await Request.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "requestor",
          foreignField: "_id",
          as: "requestorUser",
        },
      },
      { $unwind: "$requestorUser" },
      {
        $group: {
          _id: "$requestorUser.referredByUserId",
          referralOrders: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
    ]);

    const totalReferralOrders = referralRows.reduce(
      (acc, r) => acc + (r.referralOrders || 0),
      0,
    );

    res.status(200).json({
      success: true,
      data: {
        range: { startDate: start, endDate: end },
        totalOrders,
        paidOrders,
        bonusOrders,
        totalReferralOrders,
        totalRevenue,
        totalBonusRevenue,
        totalBaseAmount,
        totalDiscountAmount,
        totalShippingFeeSupply,
        avgShippingFeeSupply,
        avgUnitPrice: paidOrders ? Math.round(totalRevenue / paidOrders) : 0,
        avgBonusUnitPrice: bonusOrders
          ? Math.round(totalBonusRevenue / bonusOrders)
          : 0,
        avgDiscountPerOrder: totalOrders
          ? Math.round(totalDiscountAmount / totalOrders)
          : 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "가격 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사업자 검증 수동 처리
 * @route POST /api/admin/organizations/:id/verification/override
 */
export async function adminOverrideOrganizationVerification(req, res) {
  try {
    const orgId = req.params.id;
    const verified = Boolean(req.body?.verified);
    const message = String(req.body?.message || "").trim();

    const org = await RequestorOrganization.findById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "조직을 찾을 수 없습니다.",
      });
    }

    org.verification = {
      verified,
      provider: "admin-override",
      message,
      checkedAt: new Date(),
    };
    await org.save();

    return res.json({
      success: true,
      data: {
        organizationId: org._id,
        verification: org.verification,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "검증 상태를 업데이트하지 못했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자별 가격/할인 통계
 * @route GET /api/admin/pricing-stats/users
 */
async function getPricingStatsByUser(req, res) {
  try {
    const { start, end } = getDateRangeFromQuery(req);
    const match = {
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "취소" },
    };

    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

    const rows = await Request.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$requestor",
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $ifNull: ["$price.paidAmount", { $ifNull: ["$price.amount", 0] }],
            },
          },
          baseAmount: { $sum: { $ifNull: ["$price.baseAmount", 0] } },
          discountAmount: {
            $sum: { $ifNull: ["$price.discountAmount", 0] },
          },
        },
      },
      { $sort: { orders: -1 } },
      { $limit: limit },
    ]);

    // 추천인(referrer) 기준 리퍼럴 주문량 집계(기간 내)
    const referralRows = await Request.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "requestor",
          foreignField: "_id",
          as: "requestorUser",
        },
      },
      { $unwind: "$requestorUser" },
      {
        $group: {
          _id: "$requestorUser.referredByUserId",
          referralOrders: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
    ]);
    const referralMap = new Map(
      referralRows.map((r) => [String(r._id), r.referralOrders || 0]),
    );

    const userIds = rows
      .map((r) => r._id)
      .filter((id) => Types.ObjectId.isValid(id));
    const users = await User.find({ _id: { $in: userIds } })
      .select({ name: 1, email: 1, organization: 1, role: 1, createdAt: 1 })
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const data = rows.map((r) => {
      const user = userMap.get(r._id?.toString?.() || String(r._id));
      const orders = r.orders || 0;
      const revenue = r.revenue || 0;
      const discountAmount = r.discountAmount || 0;
      const referralLast30DaysOrders = referralMap.get(String(r._id)) || 0;
      return {
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              organization: user.organization,
              role: user.role,
              createdAt: user.createdAt,
            }
          : { _id: r._id },
        orders,
        referralLast30DaysOrders,
        totalOrders: orders + referralLast30DaysOrders,
        revenue,
        baseAmount: r.baseAmount || 0,
        discountAmount,
        avgUnitPrice: orders ? Math.round(revenue / orders) : 0,
        avgDiscountPerOrder: orders ? Math.round(discountAmount / orders) : 0,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        range: { startDate: start, endDate: end },
        items: data,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자별 가격 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 사용자 목록 조회
 * @route GET /api/admin/users
 */
async function getAllUsers(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
        { originalEmail: { $regex: req.query.search, $options: "i" } },
        { organization: { $regex: req.query.search, $options: "i" } },
      ];
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 사용자 조회 (비밀번호 제외)
    const users = await User.find(filter)
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const userIds = users
      .map((u) => u?._id)
      .filter((id) => Types.ObjectId.isValid(String(id)));

    const requestCounts = await Request.aggregate([
      {
        $match: {
          requestor: { $in: userIds },
          status: { $ne: "취소" },
        },
      },
      {
        $group: {
          _id: "$requestor",
          count: { $sum: 1 },
        },
      },
    ]);
    const countMap = new Map(
      requestCounts.map((r) => [String(r._id), Number(r.count || 0)]),
    );

    const usersWithStats = users.map((u) => ({
      ...u,
      totalRequests: countMap.get(String(u._id)) || 0,
    }));

    // 전체 사용자 수
    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function createUser(req, res) {
  try {
    const name = String(req.body?.name || "").trim() || "사용자";
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const role = String(req.body?.role || "requestor").trim();
    const organization = String(req.body?.organization || "").trim();
    const passwordRaw = String(req.body?.password || "");
    const autoActivate = Boolean(req.body?.autoActivate);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "이메일은 필수입니다.",
      });
    }

    const validRoles = ["requestor", "manufacturer", "admin", "salesman"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 역할입니다.",
      });
    }

    const existing = await User.findOne({ email }).select({ _id: 1 }).lean();
    if (existing?._id) {
      return res.status(409).json({
        success: false,
        message: "이미 존재하는 이메일입니다.",
      });
    }

    const tempPassword = passwordRaw || generateRandomPassword();

    const approvedAt = autoActivate ? new Date() : null;
    const active = autoActivate ? true : false;

    const user = new User({
      name,
      email,
      password: tempPassword,
      role,
      organization,
      requestorRole: role === "requestor" ? "owner" : null,
      manufacturerRole: role === "manufacturer" ? "owner" : null,
      adminRole: role === "admin" ? "owner" : null,
      approvedAt,
      active,
    });
    await user.save();

    const fresh = await User.findById(user._id).select("-password").lean();
    return res.status(201).json({
      success: true,
      data: {
        user: fresh,
        tempPassword: passwordRaw ? null : tempPassword,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function approveUser(req, res) {
  try {
    const userId = req.params.id;
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    if (!user.approvedAt) {
      user.approvedAt = new Date();
    }
    user.active = true;
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        approvedAt: user.approvedAt,
        active: user.active,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자 승인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function rejectUser(req, res) {
  try {
    const userId = req.params.id;
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    user.active = false;
    user.approvedAt = null;
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        approvedAt: user.approvedAt,
        active: user.active,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "사용자 거절 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 상세 조회
 * @route GET /api/admin/users/:id
 */
async function getUserById(req, res) {
  try {
    const userId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 사용자 조회 (비밀번호 제외)
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 정보 수정
 * @route PUT /api/admin/users/:id
 */
async function updateUser(req, res) {
  try {
    const userId = req.params.id;
    const updateData = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 수정 불가능한 필드 제거
    delete updateData.password;
    delete updateData.email; // 이메일은 변경 불가
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // 자기 자신의 관리자 권한 제거 방지
    if (
      userId === req.user.id &&
      updateData.role &&
      req.user.role === "admin" &&
      updateData.role !== "admin"
    ) {
      return res.status(400).json({
        success: false,
        message: "자기 자신의 관리자 권한을 제거할 수 없습니다.",
      });
    }

    // 사용자 수정
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true },
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      message: "사용자 정보가 성공적으로 수정되었습니다.",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 정보 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 활성화/비활성화
 * @route PATCH /api/admin/users/:id/toggle-active
 */
async function toggleUserActive(req, res) {
  try {
    const userId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 사용자 조회
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // 자기 자신을 비활성화하는 것 방지
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "자기 자신을 비활성화할 수 없습니다.",
      });
    }

    // 활성화 상태 토글
    user.active = !user.active;

    // 활성화(=승인)되는 순간 승인일을 기록
    if (user.active && !user.approvedAt) {
      user.approvedAt = new Date();
    }
    await user.save();

    res.status(200).json({
      success: true,
      message: `사용자가 ${user.active ? "활성화" : "비활성화"}되었습니다.`,
      data: {
        userId: user._id,
        active: user.active,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 활성화/비활성화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 역할 변경
 * @route PATCH /api/admin/users/:id/change-role
 */
async function changeUserRole(req, res) {
  try {
    const userId = req.params.id;
    const {
      role,
      requestorRole = null,
      manufacturerRole = null,
      adminRole = null,
    } = req.body || {};

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 역할 유효성 검사
    const validRoles = ["requestor", "manufacturer", "admin", "salesman"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 역할입니다.",
      });
    }

    // 사용자 조회
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    const isSelf = user._id.equals(req.user._id);
    // 자기 자신의 role 전환 금지
    if (isSelf && role !== user.role) {
      return res.status(400).json({
        success: false,
        message: "자기 자신의 역할을 변경할 수 없습니다.",
      });
    }

    // 자기 자신의 서브역할 승격/변경 금지
    if (isSelf) {
      if (
        (user.role === "admin" && adminRole && adminRole !== user.adminRole) ||
        (user.role === "manufacturer" &&
          manufacturerRole &&
          manufacturerRole !== user.manufacturerRole) ||
        (user.role === "requestor" &&
          requestorRole &&
          requestorRole !== user.requestorRole)
      ) {
        return res.status(400).json({
          success: false,
          message: "자기 자신의 서브역할을 변경할 수 없습니다.",
        });
      }
    }

    // 역할 변경 및 서브역할 설정
    user.role = role;
    if (role === "admin") {
      user.adminRole = adminRole || "owner";
      user.manufacturerRole = null;
      user.requestorRole = null;
    } else if (role === "manufacturer") {
      user.manufacturerRole = manufacturerRole || "owner";
      user.adminRole = null;
      user.requestorRole = null;
    } else {
      user.requestorRole = requestorRole || "owner";
      user.adminRole = null;
      user.manufacturerRole = null;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "사용자 역할이 성공적으로 변경되었습니다.",
      data: {
        userId: user._id,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 역할 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 최대 직경 기준 4개 구간(<=6, <=8, <=10, 12mm) 통계를 계산하는 헬퍼 (관리자용)
async function computeAdminDiameterStats(requests, leadDays) {
  const effectiveLeadDays = {
    ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
    ...(leadDays || {}),
  };

  const [shipLabelD6, shipLabelD8, shipLabelD10, shipLabelD10plus] =
    await Promise.all([
      formatEtaLabelFromNow(effectiveLeadDays.d6),
      formatEtaLabelFromNow(effectiveLeadDays.d8),
      formatEtaLabelFromNow(effectiveLeadDays.d10),
      formatEtaLabelFromNow(effectiveLeadDays.d10plus),
    ]);

  const bucketDefs = [
    {
      id: "d6",
      diameter: 6,
      shipLabel: shipLabelD6,
    },
    {
      id: "d8",
      diameter: 8,
      shipLabel: shipLabelD8,
    },
    {
      id: "d10",
      diameter: 10,
      shipLabel: shipLabelD10,
    },
    {
      id: "d10plus",
      diameter: 12,
      shipLabel: shipLabelD10plus,
    },
  ];

  const counts = {
    d6: 0,
    d8: 0,
    d10: 0,
    d10plus: 0,
  };

  if (Array.isArray(requests)) {
    requests.forEach((r) => {
      const raw = r?.caseInfos?.maxDiameter;
      const d =
        typeof raw === "number" ? raw : raw != null ? Number(raw) : null;
      if (d == null || Number.isNaN(d)) return;

      if (d <= 6) counts.d6 += 1;
      else if (d <= 8) counts.d8 += 1;
      else if (d <= 10) counts.d10 += 1;
      else counts.d10plus += 1;
    });
  }

  const total = counts.d6 + counts.d8 + counts.d10 + counts.d10plus;
  const maxCount = Math.max(
    1,
    counts.d6,
    counts.d8,
    counts.d10,
    counts.d10plus,
  );

  const buckets = bucketDefs.map((def) => ({
    diameter: def.diameter,
    shipLabel: def.shipLabel,
    count: counts[def.id] || 0,
    ratio: maxCount > 0 ? (counts[def.id] || 0) / maxCount : 0,
  }));

  return { total, buckets };
}

/**
 * 대시보드 통계 조회
 * @route GET /api/admin/dashboard
 */
async function getDashboardStats(req, res) {
  try {
    const systemAlerts = [];

    const mongoHealth = await getMongoHealth();
    if (!mongoHealth?.ok) {
      systemAlerts.push({
        id: "mongo:down",
        type: "warning",
        message: mongoHealth?.message || "MongoDB 상태 확인 실패",
        date: new Date().toISOString(),
      });
    } else if (mongoHealth.status !== "ok") {
      systemAlerts.push({
        id: "mongo:warning",
        type: "warning",
        message: mongoHealth.message,
        date: new Date().toISOString(),
      });
    }

    // 사용자 통계
    const userStats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    // 사용자 통계 가공
    const userStatsByRole = {};
    userStats.forEach((stat) => {
      userStatsByRole[stat._id] = stat.count;
    });

    // 총 의뢰자 수
    const totalUsers = await User.countDocuments({ role: "requestor" });
    const activeUsers = await User.countDocuments({
      role: "requestor",
      active: true,
    });

    // 의뢰 통계 (4단계 공정 + 완료/취소)
    const { start, end } = getDateRangeFromQuery(req);
    const allRequestsForStats = await Request.find({
      createdAt: { $gte: start, $lte: end },
    })
      .select({ status: 1, status2: 1, manufacturerStage: 1 })
      .lean();

    const normalizeStage = (r) => {
      const status = String(r.status || "");
      const stage = String(r.manufacturerStage || "");
      const status2 = String(r.status2 || "");

      if (status === "취소") return "취소";
      if (status === "완료" || status2 === "완료") return "완료";

      if (["shipping", "tracking", "발송", "추적관리"].includes(stage))
        return "발송";
      if (["machining", "packaging", "production", "생산"].includes(stage))
        return "생산";
      if (["cam", "CAM", "가공전"].includes(stage)) return "CAM";
      return "의뢰";
    };

    const requestStatsByStatus = {
      의뢰: 0,
      CAM: 0,
      생산: 0,
      발송: 0,
      완료: 0,
      취소: 0,
    };

    allRequestsForStats.forEach((r) => {
      const s = normalizeStage(r);
      if (requestStatsByStatus[s] != null) {
        requestStatsByStatus[s] += 1;
      }
    });

    // 총 의뢰 수
    const totalRequests = allRequestsForStats.length;

    // 최근 의뢰 (최대 5개)
    const recentRequests = await Request.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("requestor", "name email")
      .populate("manufacturer", "name email");

    // 파일 통계
    const totalFiles = await File.countDocuments();
    const totalFileSize = await File.aggregate([
      {
        $group: {
          _id: null,
          totalSize: { $sum: "$size" },
        },
      },
    ]);

    // 직경 통계 (caseInfos.maxDiameter 기반)
    const leadDays = await getDeliveryEtaLeadDays();
    const requestsForDiameter = await Request.find({
      status: { $ne: "취소" },
      "caseInfos.implantSystem": { $exists: true, $ne: "" },
      "caseInfos.maxDiameter": { $ne: null },
    })
      .select({ caseInfos: 1 })
      .lean();
    const diameterStats = await computeAdminDiameterStats(
      requestsForDiameter,
      leadDays,
    );

    // 응답 데이터 구성
    const dashboardData = {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: userStatsByRole,
      },
      requests: {
        total: totalRequests,
        byStatus: requestStatsByStatus,
        range: { startDate: start, endDate: end },
        recent: recentRequests,
      },
      files: {
        total: totalFiles,
        totalSize: totalFileSize.length > 0 ? totalFileSize[0].totalSize : 0,
      },
      diameterStats,
    };

    res.status(200).json({
      success: true,
      data: {
        userStats: dashboardData.users,
        requestStats: dashboardData.requests,
        recentActivity: dashboardData.files,
        diameterStats: dashboardData.diameterStats,
        systemAlerts,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "대시보드 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 시스템 로그 조회 (예시, 실제 구현은 로그 저장 방식에 따라 다름)
 * @route GET /api/admin/logs
 */
async function getSystemLogs(req, res) {
  try {
    // 실제 구현에서는 로그 파일을 읽거나 DB에서 로그를 조회
    // 여기서는 예시로 빈 배열 반환
    res.status(200).json({
      success: true,
      message: "시스템 로그 조회 기능은 아직 구현되지 않았습니다.",
      data: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 시스템 설정 조회 (예시)
 * @route GET /api/admin/settings
 */
async function getSystemSettings(req, res) {
  try {
    const leadDays = await getDeliveryEtaLeadDays();

    const settings = {
      fileUpload: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain",
          "model/stl",
          "application/octet-stream",
        ],
      },
      security: {
        rateLimit: {
          windowMs: 15 * 60 * 1000, // 15분
          max: 100, // 15분 동안 최대 100개 요청
        },
        jwtExpiration: "1d", // 1일
        refreshTokenExpiration: "7d", // 7일
      },
      deliveryEtaLeadDays: leadDays,
    };

    res.status(200).json({
      success: true,
      data: { settings },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 삭제
 * @route DELETE /api/admin/users/:id
 */
async function deleteUser(req, res) {
  try {
    const userId = req.params.id;
    const adminId = req.user.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사용자 ID입니다.",
      });
    }

    // 자기 자신을 삭제하려는 경우 방지
    if (userId.toString() === adminId.toString()) {
      return res.status(400).json({
        success: false,
        message: "자기 자신을 삭제할 수 없습니다.",
      });
    }

    // 사용자 삭제
    const deletedUser = await User.findByIdAndUpdate(
      userId,
      { active: false, deletedAt: new Date() },
      { new: true },
    );

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // 그룹 리더 변경 처리 (삭제되는 사용자가 리더인 경우)
    const { handleReferralGroupLeaderChange } =
      await import("../request/utils.js");
    await handleReferralGroupLeaderChange(userId);

    // 실제 DB에서 삭제 (테스트에서는 이 방식을 사용)
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "사용자가 성공적으로 삭제되었습니다.",
      data: deletedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 의뢰 목록 조회
 * @route GET /api/admin/requests
 */
async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.requestorId) {
      const requestorId = String(req.query.requestorId || "").trim();
      if (!Types.ObjectId.isValid(requestorId)) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 requestorId입니다.",
        });
      }
      filter.requestor = new Types.ObjectId(requestorId);
    }
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
        { requestId: { $regex: req.query.search, $options: "i" } },
      ];
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회
    const requests = await Request.find(filter)
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상세 조회
 * @route GET /api/admin/requests/:id
 */
async function getRequestById(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId)
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상세 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상태 변경
 * @route PATCH /api/admin/requests/:id/status
 */
async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status, statusNote } = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 상태 유효성 검사 (4단계 공통 공정)
    const validStatuses = ["의뢰", "CAM", "생산", "발송", "완료", "취소"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 상태입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 상태 변경 이력 추가
    const statusHistory = {
      status,
      note: statusNote || "",
      updatedBy: req.user.id,
      updatedAt: new Date(),
    };

    // 의뢰 상태 업데이트
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        status,
        $push: { statusHistory },
      },
      { new: true },
    )
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization");

    // statusHistory가 없으면 빈 배열 반환 보장
    const result = updatedRequest.toObject();
    if (!result.statusHistory) result.statusHistory = [];

    res.status(200).json({
      success: true,
      message: "의뢰 상태가 성공적으로 변경되었습니다.",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사 할당
 * @route PATCH /api/admin/requests/:id/assign
 */
async function assignManufacturer(req, res) {
  try {
    const requestId = req.params.id;
    const { manufacturerId } = req.body;

    // ObjectId 유효성 검사
    if (
      !Types.ObjectId.isValid(requestId) ||
      !Types.ObjectId.isValid(manufacturerId)
    ) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 ID입니다.",
      });
    }

    // 제조사 존재 확인
    const manufacturer = await User.findById(manufacturerId);
    if (!manufacturer || manufacturer.role !== "manufacturer") {
      return res.status(400).json({
        success: false,
        message: "유효한 제조사를 찾을 수 없습니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 제조사 할당
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      {
        manufacturer: manufacturerId,
        assignedAt: new Date(),
      },
      { new: true },
    )
      .populate("requestor", "name email organization")
      .populate("manufacturer", "name email organization");

    // statusHistory가 없으면 빈 배열 반환 보장
    const result = updatedRequest.toObject();
    if (!result.statusHistory) result.statusHistory = [];

    // manufacturer는 ObjectId만 반환
    res.status(200).json({
      success: true,
      message: "제조사가 성공적으로 할당되었습니다.",
      data: {
        ...result,
        manufacturer: result.manufacturer?._id || result.manufacturer,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "제조사 할당 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 활동 로그 조회
 * @route GET /api/admin/activity-logs
 */
async function getActivityLogs(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const filter = {};
    if (req.query.userId) {
      if (!Types.ObjectId.isValid(req.query.userId)) {
        return res
          .status(400)
          .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
      }
      filter.user = new Types.ObjectId(req.query.userId);
    }
    if (req.query.action) filter.action = req.query.action;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.createdAt.$lte = new Date(req.query.endDate);
      }
    }
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    // 실제 로그 조회
    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await ActivityLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "활동 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * 시스템 설정 업데이트
 * @route PUT /api/admin/settings
 */
async function updateSystemSettings(req, res) {
  try {
    const input = req.body && typeof req.body === "object" ? req.body : {};

    const rawLeadDays =
      input.deliveryEtaLeadDays && typeof input.deliveryEtaLeadDays === "object"
        ? input.deliveryEtaLeadDays
        : null;

    const sanitized = rawLeadDays
      ? {
          d6:
            rawLeadDays.d6 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d6)),
          d8:
            rawLeadDays.d8 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d8)),
          d10:
            rawLeadDays.d10 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d10)),
          d10plus:
            rawLeadDays.d10plus == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d10plus)),
        }
      : null;

    const nextLeadDays = {
      ...(sanitized || {}),
    };

    Object.keys(nextLeadDays).forEach((k) => {
      if (Number.isNaN(nextLeadDays[k]) || nextLeadDays[k] == null) {
        delete nextLeadDays[k];
      }
    });

    const currentLeadDays = await getDeliveryEtaLeadDays();
    const mergedLeadDays = {
      ...currentLeadDays,
      ...nextLeadDays,
    };

    const updatedDoc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $setOnInsert: { key: "global" },
        ...(rawLeadDays
          ? { $set: { deliveryEtaLeadDays: mergedLeadDays } }
          : {}),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const updatedSettings = {
      deliveryEtaLeadDays: {
        ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
        ...(updatedDoc?.deliveryEtaLeadDays || {}),
      },
    };

    res.status(200).json({
      success: true,
      message: "시스템 설정이 성공적으로 업데이트되었습니다.",
      data: updatedSettings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 설정 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 전체 파일 목록 조회 (관리자 전용)
 * @route GET /api/files
 */
async function getAllFiles(req, res) {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자 권한이 필요합니다.",
      });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.fileType) filter.fileType = req.query.fileType;
    if (req.query.uploadedBy) filter.uploadedBy = req.query.uploadedBy;
    if (req.query.requestId) filter.relatedRequest = req.query.requestId;
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1;
    }
    const files = await File.find(filter)
      .populate("uploadedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limit);
    const total = await File.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: {
        files,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "파일 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 보안 설정 조회
 * @route GET /api/admin/security-settings
 */
async function getSecuritySettings(req, res) {
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    res.status(200).json({
      success: true,
      data: {
        securitySettings: doc?.securitySettings || {},
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 보안 설정 업데이트
 * @route PUT /api/admin/security-settings
 */
async function updateSecuritySettings(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const allowedKeys = [
      "twoFactorAuth",
      "loginNotifications",
      "dataEncryption",
      "fileUploadScan",
      "autoLogout",
      "maxLoginAttempts",
      "passwordExpiry",
      "ipWhitelist",
      "apiRateLimit",
      "backupFrequency",
    ];

    const sanitized = {};
    allowedKeys.forEach((k) => {
      if (payload[k] === undefined) return;
      if (
        [
          "autoLogout",
          "maxLoginAttempts",
          "passwordExpiry",
          "apiRateLimit",
        ].includes(k)
      ) {
        const num = Number(payload[k]);
        if (!Number.isNaN(num)) sanitized[k] = num;
      } else if (
        typeof payload[k] === "boolean" ||
        typeof payload[k] === "string"
      ) {
        sanitized[k] = payload[k];
      }
    });

    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $setOnInsert: { key: "global" },
        ...(Object.keys(sanitized).length > 0
          ? { $set: { securitySettings: sanitized } }
          : {}),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    res.status(200).json({
      success: true,
      message: "보안 설정이 업데이트되었습니다.",
      data: {
        securitySettings: doc?.securitySettings || {},
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 설정 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 보안 통계 조회 (간단 계산: 최근 30일 활동 로그 기반)
 * @route GET /api/admin/security-stats
 */
async function getSecurityStats(req, res) {
  try {
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);

    const [
      alertsDetected,
      blockedAttempts,
      severityCounts,
      statusCounts,
      totalEvents,
      systemSettings,
    ] = await Promise.all([
      ActivityLog.countDocuments({
        createdAt: { $gte: last30, $lte: now },
        severity: { $in: ["high", "critical"] },
      }),
      ActivityLog.countDocuments({
        status: "blocked",
        createdAt: { $gte: last30, $lte: now },
      }),
      ActivityLog.aggregate([
        {
          $match: {
            createdAt: { $gte: last30, $lte: now },
          },
        },
        {
          $group: {
            _id: "$severity",
            count: { $sum: 1 },
          },
        },
      ]),
      ActivityLog.aggregate([
        {
          $match: {
            createdAt: { $gte: last30, $lte: now },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      ActivityLog.countDocuments({ createdAt: { $gte: last30, $lte: now } }),
      SystemSettings.findOne({ key: "global" }).lean(),
    ]);

    const severityMap = severityCounts.reduce((acc, cur) => {
      acc[cur._id || "unknown"] = cur.count;
      return acc;
    }, {});
    const statusMap = statusCounts.reduce((acc, cur) => {
      acc[cur._id || "unknown"] = cur.count;
      return acc;
    }, {});

    const incidentPenalty =
      (severityMap.high || 0) * 3 + (severityMap.critical || 0) * 5;
    const blockedPenalty = blockedAttempts * 1;
    const baseScore = 100;
    const securityScore = Math.max(
      50,
      baseScore - incidentPenalty - blockedPenalty,
    );

    const sec = systemSettings?.securitySettings || {};
    const policyIssues = [];
    if (!sec.twoFactorAuth) policyIssues.push("2FA 비활성");
    if (!sec.loginNotifications) policyIssues.push("로그인 알림 미사용");
    if (!sec.dataEncryption) policyIssues.push("데이터 암호화 미사용");
    if (!sec.fileUploadScan) policyIssues.push("파일 업로드 스캔 미사용");
    if ((sec.autoLogout ?? 0) > 60)
      policyIssues.push("자동 로그아웃 시간이 김");
    if ((sec.maxLoginAttempts ?? 0) > 10)
      policyIssues.push("로그인 시도 허용 횟수 과다");
    if (!sec.ipWhitelist) policyIssues.push("IP 화이트리스트 미사용");
    if ((sec.apiRateLimit ?? 0) > 2000)
      policyIssues.push("API 속도 제한이 높음");
    if (
      sec.backupFrequency &&
      !["daily", "weekly"].includes(sec.backupFrequency)
    )
      policyIssues.push("백업 주기 비권장");
    if ((sec.passwordExpiry ?? 0) > 180)
      policyIssues.push("비밀번호 만료 주기 과다");
    const policyScore = Math.max(50, 100 - policyIssues.length * 5);

    const mongoHealth = await getMongoHealth();
    const networkHealth = await getNetworkHealth();
    const apiHealth = await getApiHealth({ blockedAttempts });
    const backupHealth = await getBackupHealth(sec);

    const systemStatus = [
      {
        name: "데이터베이스",
        status: mongoHealth.status,
        message: mongoHealth.message,
      },
      {
        name: "네트워크",
        status: networkHealth.status,
        message: networkHealth.message,
      },
      {
        name: "API 보안",
        status: apiHealth.status,
        message: apiHealth.message,
      },
      {
        name: "백업 시스템",
        status: backupHealth.status,
        message: backupHealth.message,
      },
    ];

    res.status(200).json({
      success: true,
      data: {
        securityScore,
        policyCompliance: {
          score: policyScore,
          issues: policyIssues,
        },
        monitoring: "24/7",
        alertsDetected,
        blockedAttempts,
        severity: severityMap,
        status: statusMap,
        totalEvents,
        systemStatus,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 보안 로그 조회 (ActivityLog 사용)
 * @route GET /api/admin/security-logs
 */
async function getSecurityLogs(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.userId) {
      if (!Types.ObjectId.isValid(req.query.userId)) {
        return res
          .status(400)
          .json({ success: false, message: "유효하지 않은 사용자 ID입니다." });
      }
      filter.userId = new Types.ObjectId(req.query.userId);
    }
    if (req.query.action) filter.action = req.query.action;

    const logsRaw = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const logs = logsRaw.map((log) => {
      const severity =
        log.severity ||
        (log.details && typeof log.details.severity === "string"
          ? log.details.severity
          : "info");
      const status =
        log.status ||
        (log.details && typeof log.details.status === "string"
          ? log.details.status
          : "info");
      return { ...log, severity, status };
    });
    const total = await ActivityLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 로그 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  getAllUsers,
  createUser,
  approveUser,
  rejectUser,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserActive,
  changeUserRole,
  getDashboardStats,
  getPricingStats,
  getPricingStatsByUser,
  getReferralGroups,
  getReferralGroupTree,
  getAllRequests,
  getRequestById,
  updateRequestStatus,
  assignManufacturer,
  getSystemLogs,
  getActivityLogs,
  getSystemSettings,
  updateSystemSettings,
  getSecuritySettings,
  updateSecuritySettings,
  getSecurityStats,
  getSecurityLogs,
  getAllFiles,
};
