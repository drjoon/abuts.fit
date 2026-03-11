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

    const userStats = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);
    const userStatsByRole = {};
    userStats.forEach((stat) => {
      userStatsByRole[stat._id] = stat.count;
    });

    const totalUsers = await User.countDocuments({ role: "requestor" });
    const activeUsers = await User.countDocuments({
      role: "requestor",
      active: true,
    });

    const { start, end } = getDateRangeFromQuery(req);
    console.log("[getDashboardStats] Query params:", req.query);
    console.log("[getDashboardStats] Date range:", { start, end });

    const allRequestsForStats = await Request.find({
      createdAt: { $gte: start, $lte: end },
    })
      .select({
        manufacturerStage: 1,
        "caseInfos.reviewByStage.shipping.status": 1,
      })
      .lean();

    console.log(
      "[getDashboardStats] Total requests in range:",
      allRequestsForStats.length,
    );

    const normalizeStage = (r) => {
      const stage = String(r.manufacturerStage || "");
      if (stage === "취소") return "취소";
      if (["shipping", "발송", "포장.발송"].includes(stage)) return "발송";
      if (["tracking", "추적관리"].includes(stage)) return "추적관리";
      if (
        [
          "machining",
          "packing",
          "production",
          "생산",
          "가공",
          "세척.패킹",
        ].includes(stage)
      )
        return "생산";
      if (["cam", "CAM"].includes(stage)) return "CAM";
      return "의뢰";
    };

    const requestStatsByStatus = {
      의뢰: 0,
      CAM: 0,
      생산: 0,
      발송: 0,
      추적관리: 0,
      취소: 0,
    };
    allRequestsForStats.forEach((r) => {
      const s = normalizeStage(r);
      if (requestStatsByStatus[s] != null) requestStatsByStatus[s] += 1;
    });

    const totalRequests = allRequestsForStats.length;
    const recentRequests = await Request.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("requestor", "name email")
      .populate("manufacturer", "name email");

    const totalFiles = await File.countDocuments();
    const totalFileSize = await File.aggregate([
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
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

    console.log("[getDashboardStats] Response data:", {
      requestStats: dashboardData.requests,
      dateRange: { start, end },
    });

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
