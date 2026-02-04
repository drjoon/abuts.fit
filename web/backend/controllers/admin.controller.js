import mongoose, { Types } from "mongoose";
import User from "../models/user.model.js";
import Request from "../models/request.model.js";
import File from "../models/file.model.js";
import ActivityLog from "../models/activityLog.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import SystemSettings from "../models/systemSettings.model.js";
import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  ymdToMmDd,
} from "../utils/krBusinessDays.js";

const DEFAULT_DELIVERY_ETA_LEAD_DAYS = {
  d6: 2,
  d8: 2,
  d10: 5,
  d10plus: 5,
};

async function getMongoHealth() {
  const start = performance.now();
  try {
    const adminDb = mongoose.connection.db.admin();
    const [pingResult, serverStatus] = await Promise.all([
      adminDb.command({ ping: 1 }),
      adminDb.command({ serverStatus: 1 }),
    ]);
    const latencyMs = Math.round(performance.now() - start);
    const connections = serverStatus?.connections || {};
    const current = Number(connections.current || 0);
    const available = Number(connections.available || 0);
    const total = current + available || 1;
    const usageRatio = current / total;
    const status = latencyMs > 500 || usageRatio > 0.8 ? "warning" : "ok";
    const message = `ping ${latencyMs}ms, connections ${current}/${
      current + available
    }`;

    return {
      ok: true,
      latencyMs,
      status,
      message,
      metrics: {
        connections: { current, available, usageRatio },
        opCounters: serverStatus?.opcounters || {},
      },
      raw: { ping: pingResult },
    };
  } catch (error) {
    return { ok: false, message: error.message, status: "critical" };
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
      status: { $ne: "취소" },
    };

    const rows = await Request.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ["$price.amount", 0] } },
          totalBaseAmount: { $sum: { $ifNull: ["$price.baseAmount", 0] } },
          totalDiscountAmount: {
            $sum: { $ifNull: ["$price.discountAmount", 0] },
          },
        },
      },
    ]);

    const summary = rows && rows.length > 0 ? rows[0] : {};
    const totalOrders = summary.totalOrders || 0;
    const totalRevenue = summary.totalRevenue || 0;
    const totalBaseAmount = summary.totalBaseAmount || 0;
    const totalDiscountAmount = summary.totalDiscountAmount || 0;

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
        totalReferralOrders,
        totalRevenue,
        totalBaseAmount,
        totalDiscountAmount,
        avgUnitPrice: totalOrders ? Math.round(totalRevenue / totalOrders) : 0,
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
          revenue: { $sum: { $ifNull: ["$price.amount", 0] } },
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
      .limit(limit);

    // 전체 사용자 수
    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        users,
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
    const validRoles = ["requestor", "manufacturer", "admin"];
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

// 최대 직경 기준 4개 구간(<=6, <=8, <=10, 10+mm) 통계를 계산하는 헬퍼 (관리자용)
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
      diameter: "10+",
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

    // 총 사용자 수
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ active: true });

    // 의뢰 통계 (4단계 공정 + 완료/취소)
    const allRequestsForStats = await Request.find()
      .select({ status: 1, status2: 1, manufacturerStage: 1 })
      .lean();

    const normalizeStage = (r) => {
      const status = String(r.status || "");
      const stage = String(r.manufacturerStage || "");
      const status2 = String(r.status2 || "");

      if (status === "취소") return "취소";
      if (status2 === "완료") return "완료";

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
  getUserById,
  updateUser,
  deleteUser,
  toggleUserActive,
  changeUserRole,
  getDashboardStats,
  getPricingStats,
  getPricingStatsByUser,
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
