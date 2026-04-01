import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import File from "../../models/file.model.js";
import {
  getDateRangeFromQuery,
  getMongoHealth,
} from "./admin.shared.controller.js";

export async function getDashboardStats(req, res) {
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

    const { start, end } = getDateRangeFromQuery(req);

    // 모든 쿼리를 병렬로 실행
    const [userStats, totalUsers, activeUsers, allRequestsForStats] =
      await Promise.all([
        User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
        User.countDocuments({ role: "requestor" }),
        User.countDocuments({ role: "requestor", active: true }),
        Request.find({
          createdAt: { $gte: start, $lte: end },
        })
          .select({
            manufacturerStage: 1,
            shippingPackageId: 1,
          })
          .lean(),
      ]);

    const userStatsByRole = {};
    userStats.forEach((stat) => {
      userStatsByRole[stat._id] = stat.count;
    });

    console.log("[Admin Dashboard] User stats:", {
      totalUsers,
      activeUsers,
      byRole: userStatsByRole,
    });

    const normalizeStage = (r) => {
      const stage = String(r.manufacturerStage || "");
      if (stage === "취소") return "취소";
      if (["tracking", "추적관리"].includes(stage)) return "추적관리";
      if (["shipping", "포장.발송"].includes(stage)) return "포장.발송";
      if (["packing", "세척.패킹"].includes(stage)) return "세척.패킹";
      if (["machining", "가공"].includes(stage)) return "가공";
      if (["cam", "CAM"].includes(stage)) return "CAM";
      return "의뢰";
    };

    const requestStatsByStatus = {
      의뢰: 0,
      CAM: 0,
      가공: 0,
      "세척.패킹": 0,
      "포장.발송": 0,
      "포장.발송박스": 0,
      추적관리: 0,
      추적관리박스: 0,
      취소: 0,
    };
    const shippingPackageIds = new Set();
    const trackingPackageIds = new Set();
    allRequestsForStats.forEach((r) => {
      const s = normalizeStage(r);
      if (requestStatsByStatus[s] != null) requestStatsByStatus[s] += 1;

      const shippingPackageId = String(r.shippingPackageId || "").trim();
      if (!shippingPackageId) return;

      if (s === "포장.발송") {
        shippingPackageIds.add(shippingPackageId);
      } else if (s === "추적관리") {
        trackingPackageIds.add(shippingPackageId);
      }
    });
    requestStatsByStatus["포장.발송박스"] = shippingPackageIds.size;
    requestStatsByStatus["추적관리박스"] = trackingPackageIds.size;

    const totalRequests = allRequestsForStats.length;

    // 최근 요청 및 파일 통계를 병렬로 조회
    const [recentRequests, totalFiles, totalFileSize] = await Promise.all([
      Request.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("requestor", "name email")
        .populate("caManufacturer", "name email"),
      File.countDocuments(),
      File.aggregate([{ $group: { _id: null, totalSize: { $sum: "$size" } } }]),
    ]);

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
    };

    res.status(200).json({
      success: true,
      data: {
        userStats: dashboardData.users,
        requestStats: dashboardData.requests,
        recentActivity: dashboardData.files,
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
