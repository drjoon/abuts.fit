import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import File from "../../models/file.model.js";
import {
  getDateRangeFromQuery,
  getMongoHealth,
} from "./admin.shared.controller.js";
import { getLatestPricingSsotHealthSnapshot } from "../../services/pricingSsotHealth.service.js";

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
    const [
      userStats,
      totalUsers,
      activeUsers,
      allRequestsForStats,
      latestPricingSsotHealth,
    ] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      User.countDocuments({ role: "requestor" }),
      User.countDocuments({ role: "requestor", active: true }),
      Request.find({
        createdAt: { $gte: start, $lte: end },
        source: { $ne: "manufacturer_sample" },
      })
        .select({
          manufacturerStage: 1,
          shippingPackageId: 1,
          requestId: 1,
          title: 1,
          caseInfos: 1,
          createdAt: 1,
          rnd: 1,
        })
        .lean(),
      getLatestPricingSsotHealthSnapshot(),
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
      가공불가: 0,
    };

    const unmachinableSummary = {
      potentialCount: 0,
      judgedCount: 0,
      confirmedCount: 0,
      items: [],
    };
    const shippingPackageIds = new Set();
    const trackingPackageIds = new Set();
    allRequestsForStats.forEach((r) => {
      const s = normalizeStage(r);
      if (requestStatsByStatus[s] != null) requestStatsByStatus[s] += 1;

      const hasPotential = Boolean(r?.rnd?.unmachinablePotentialAt);
      const hasJudged = Boolean(r?.rnd?.unmachinableAt);
      const hasConfirmed = Boolean(r?.rnd?.unmachinableConfirmedAt);
      const detailCode = hasConfirmed
        ? "confirmed"
        : hasJudged
          ? "judged"
          : hasPotential
            ? "potential"
            : "none";

      if (detailCode !== "none") {
        requestStatsByStatus["가공불가"] += 1;
      }
      if (detailCode === "potential") unmachinableSummary.potentialCount += 1;
      if (detailCode === "judged") unmachinableSummary.judgedCount += 1;
      if (detailCode === "confirmed") unmachinableSummary.confirmedCount += 1;

      const shippingPackageId = String(r.shippingPackageId || "").trim();
      if (shippingPackageId) {
        if (s === "포장.발송") {
          shippingPackageIds.add(shippingPackageId);
        } else if (s === "추적관리") {
          trackingPackageIds.add(shippingPackageId);
        }
      }

      if (detailCode !== "none") {
        unmachinableSummary.items.push({
          _id: r._id,
          requestId: r.requestId,
          title: r.title || "",
          manufacturerStage: r.manufacturerStage,
          createdAt: r.createdAt || null,
          caseInfos: r.caseInfos || {},
          rnd: {
            ...(r.rnd || {}),
            unmachinablePotentialAt: r?.rnd?.unmachinablePotentialAt || null,
            unmachinableAt: r?.rnd?.unmachinableAt || null,
            unmachinableConfirmedAt: r?.rnd?.unmachinableConfirmedAt || null,
            unmachinableReason: String(r?.rnd?.unmachinableReason || ""),
          },
          unmachinableDetailCode: detailCode,
        });
      }
    });
    requestStatsByStatus["포장.발송박스"] = shippingPackageIds.size;
    requestStatsByStatus["추적관리박스"] = trackingPackageIds.size;

    const totalRequests = allRequestsForStats.length;

    unmachinableSummary.items = unmachinableSummary.items
      .sort((a, b) => {
        const aKey =
          a?.rnd?.unmachinableConfirmedAt ||
          a?.rnd?.unmachinableAt ||
          a?.rnd?.unmachinablePotentialAt ||
          a?.createdAt ||
          0;
        const bKey =
          b?.rnd?.unmachinableConfirmedAt ||
          b?.rnd?.unmachinableAt ||
          b?.rnd?.unmachinablePotentialAt ||
          b?.createdAt ||
          0;
        return new Date(bKey).getTime() - new Date(aKey).getTime();
      })
      .slice(0, 10);

    const ssotCheckedAt = latestPricingSsotHealth?.checkedAt
      ? new Date(latestPricingSsotHealth.checkedAt)
      : null;
    const ssotAgeHours = ssotCheckedAt
      ? (Date.now() - ssotCheckedAt.getTime()) / (1000 * 60 * 60)
      : null;
    const pricingSsotHealth = {
      success: Boolean(latestPricingSsotHealth?.success),
      mismatchCount: Number(latestPricingSsotHealth?.mismatchCount || 0),
      checkedSnapshotCount: Number(
        latestPricingSsotHealth?.checkedSnapshotCount || 0,
      ),
      checkedAt: latestPricingSsotHealth?.checkedAt || null,
      range: latestPricingSsotHealth?.range || null,
      topMismatches: Array.isArray(latestPricingSsotHealth?.mismatches)
        ? latestPricingSsotHealth.mismatches.slice(0, 5).map((row) => ({
            businessAnchorId: String(row?.businessAnchorId || "").trim(),
            name: String(row?.name || ""),
            gap: Number(row?.gap || 0),
            latestRequestMongoId: String(
              row?.latestRequestMongoId || "",
            ).trim(),
            latestRequestId: String(row?.latestRequestId || "").trim(),
          }))
        : [],
    };

    // SSOT 점검 상태를 관리자 알림에 반영한다.
    // - 누락: 점검 자체가 아직 실행되지 않음
    // - stale: 워커/배치가 정상 수행되지 않았을 가능성
    // - mismatch: Request SSOT와 스냅샷 불일치 발생
    if (!latestPricingSsotHealth) {
      systemAlerts.push({
        id: "pricing-ssot:missing",
        type: "warning",
        message:
          "가격 SSOT 점검 스냅샷이 없습니다. 점검 스크립트를 실행하세요.",
        date: new Date().toISOString(),
      });
    } else if (pricingSsotHealth.mismatchCount > 0) {
      systemAlerts.push({
        id: "pricing-ssot:mismatch",
        type: "warning",
        message: `가격 SSOT 불일치 ${pricingSsotHealth.mismatchCount}건 발생`,
        date: new Date().toISOString(),
      });
    } else if (ssotAgeHours !== null && ssotAgeHours > 26) {
      systemAlerts.push({
        id: "pricing-ssot:stale",
        type: "warning",
        message: "가격 SSOT 점검 결과가 26시간 이상 갱신되지 않았습니다.",
        date: new Date().toISOString(),
      });
    }

    // 최근 요청 및 파일 통계를 병렬로 조회
    const [recentRequests, totalFiles, totalFileSize] = await Promise.all([
      Request.find({ source: { $ne: "manufacturer_sample" } })
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
        pricingSsotHealth,
        unmachinableSummary,
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
