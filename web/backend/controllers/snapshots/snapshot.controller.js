import PricingReferralRolling30dAggregate from "../../models/pricingReferralRolling30dAggregate.model.js";
import AdminSalesmanCreditsOverviewSnapshot from "../../models/adminSalesmanCreditsOverviewSnapshot.model.js";
import BulkShippingSnapshot from "../../models/bulkShippingSnapshot.model.js";
import RequestorDashboardSummarySnapshot from "../../models/requestorDashboardSummarySnapshot.model.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";
import { recalcReferralSnapshot } from "../admin/admin.referral.controller.js";

export async function getAdminSnapshotsStatus(req, res) {
  try {
    const ymd = getTodayYmdInKst();
    if (!ymd) {
      return res.status(500).json({
        success: false,
        message: "날짜 계산에 실패했습니다.",
      });
    }

    const [referralLatest, creditLatest, bulkLatest, requestorDashboardLatest] =
      await Promise.all([
        PricingReferralRolling30dAggregate.findOne({ ymd })
          .sort({ computedAt: -1 })
          .select({ computedAt: 1, ymd: 1 })
          .lean(),
        AdminSalesmanCreditsOverviewSnapshot.findOne({ ymd, periodKey: "30d" })
          .sort({ computedAt: -1 })
          .select({ computedAt: 1, ymd: 1, periodKey: 1 })
          .lean(),
        BulkShippingSnapshot.findOne({ ymd })
          .sort({ computedAt: -1 })
          .select({ computedAt: 1, ymd: 1 })
          .lean(),
        RequestorDashboardSummarySnapshot.findOne({ ymd, periodKey: "30d" })
          .sort({ computedAt: -1 })
          .select({ computedAt: 1, ymd: 1, periodKey: 1 })
          .lean(),
      ]);

    const referralAt = referralLatest?.computedAt
      ? new Date(referralLatest.computedAt)
      : null;
    const creditAt = creditLatest?.computedAt
      ? new Date(creditLatest.computedAt)
      : null;
    const bulkAt = bulkLatest?.computedAt
      ? new Date(bulkLatest.computedAt)
      : null;
    const requestorDashboardAt = requestorDashboardLatest?.computedAt
      ? new Date(requestorDashboardLatest.computedAt)
      : null;

    const computedCandidates = [
      referralAt,
      creditAt,
      bulkAt,
      requestorDashboardAt,
    ].filter(Boolean);
    const lastComputedAt = computedCandidates.length
      ? new Date(
          Math.max(...computedCandidates.map((value) => value.getTime())),
        )
      : null;

    return res.status(200).json({
      success: true,
      data: {
        lastComputedAt: lastComputedAt ? lastComputedAt.toISOString() : null,
        baseYmd: ymd,
        snapshotMissing:
          !referralLatest ||
          !creditLatest ||
          !bulkLatest ||
          !requestorDashboardLatest,
        referralLastComputedAt: referralAt ? referralAt.toISOString() : null,
        creditLastComputedAt: creditAt ? creditAt.toISOString() : null,
        bulkShippingLastComputedAt: bulkAt ? bulkAt.toISOString() : null,
        requestorDashboardLastComputedAt: requestorDashboardAt
          ? requestorDashboardAt.toISOString()
          : null,
      },
    });
  } catch (error) {
    console.error("getAdminSnapshotsStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "스냅샷 상태 조회에 실패했습니다.",
    });
  }
}

export async function recalcAllSnapshots(req, res) {
  try {
    const referral = await recalcReferralSnapshot();
    if (!referral.success) {
      return res.status(500).json({
        success: false,
        message: referral.message || "리퍼럴 스냅샷 재계산 실패",
      });
    }

    const user = req.user;
    if (user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        referral: {
          upsertCount: referral.upsertCount,
          ymd: referral.ymd,
          computedAt: referral.computedAt?.toISOString?.() || null,
        },
      },
    });
  } catch (error) {
    console.error("recalcAllSnapshots error:", error);
    return res.status(500).json({
      success: false,
      message: "스냅샷 재계산에 실패했습니다.",
    });
  }
}
