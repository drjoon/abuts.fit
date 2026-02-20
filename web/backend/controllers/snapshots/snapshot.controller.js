import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ManufacturerDailySettlementSnapshot from "../../models/manufacturerDailySettlementSnapshot.model.js";
import {
  getTodayYmdInKst,
  getYesterdayYmdInKst,
  getTodayMidnightUtcInKst,
} from "../../utils/krBusinessDays.js";
import { recalcAdminSalesmanCreditsOverviewSnapshot } from "../admin/adminCredit.controller.js";
import { recalcReferralSnapshot } from "../admin/admin.controller.js";

function kstYmdToUtcRange(ymd) {
  const dt = new Date(`${ymd}T00:00:00.000+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

async function runManufacturerDailySettlementSnapshotRecalc({
  manufacturerOrganization,
}) {
  const baseYmd = getTodayYmdInKst();
  const snapshotYmd = getYesterdayYmdInKst();
  const baseMidnightUtc = getTodayMidnightUtcInKst();

  if (!baseYmd || !snapshotYmd || !baseMidnightUtc) {
    return { success: false, message: "날짜 계산 실패" };
  }

  const utcRange = kstYmdToUtcRange(snapshotYmd);
  if (!utcRange) {
    return { success: false, message: "날짜 범위 계산 실패" };
  }

  const { start, end } = utcRange;
  const agg = await ManufacturerCreditLedger.aggregate([
    {
      $match: {
        manufacturerOrganization,
        occurredAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: { type: "$type", refType: "$refType" },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const sums = {
    earnRequestAmount: 0,
    earnRequestCount: 0,
    earnShippingAmount: 0,
    earnShippingCount: 0,
    refundAmount: 0,
    payoutAmount: 0,
    adjustAmount: 0,
  };

  for (const row of agg) {
    const type = String(row?._id?.type || "");
    const refType = String(row?._id?.refType || "");
    const amount = Math.round(Number(row?.amount || 0));
    const count = Math.round(Number(row?.count || 0));

    if (type === "EARN" && refType === "REQUEST") {
      sums.earnRequestAmount += amount;
      sums.earnRequestCount += count;
    } else if (type === "EARN" && refType === "SHIPPING_PACKAGE") {
      sums.earnShippingAmount += amount;
      sums.earnShippingCount += count;
    } else if (type === "REFUND") {
      sums.refundAmount += amount;
    } else if (type === "PAYOUT") {
      sums.payoutAmount += amount;
    } else if (type === "ADJUST") {
      sums.adjustAmount += amount;
    }
  }

  const netAmount =
    Math.round(Number(sums.earnRequestAmount || 0)) +
    Math.round(Number(sums.earnShippingAmount || 0)) +
    Math.round(Number(sums.refundAmount || 0)) +
    Math.round(Number(sums.payoutAmount || 0)) +
    Math.round(Number(sums.adjustAmount || 0));

  const computedAt = new Date();
  await ManufacturerDailySettlementSnapshot.updateOne(
    { manufacturerOrganization, ymd: snapshotYmd },
    {
      $set: {
        ...sums,
        netAmount,
        computedAt,
      },
    },
    { upsert: true },
  );

  return {
    success: true,
    data: {
      baseYmd,
      baseMidnightUtc: baseMidnightUtc.toISOString(),
      snapshotYmd,
      computedAt: computedAt.toISOString(),
    },
  };
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
    if (user?.role === "manufacturer") {
      const manufacturerOrganization = String(user.organization || "").trim();
      if (!manufacturerOrganization) {
        return res.status(400).json({
          success: false,
          message: "조직 정보가 필요합니다.",
        });
      }

      const credit = await runManufacturerDailySettlementSnapshotRecalc({
        manufacturerOrganization,
      });
      if (!credit.success) {
        return res.status(500).json({
          success: false,
          message: credit.message || "정산 스냅샷 재계산 실패",
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
          credit: credit.data,
        },
      });
    }

    if (user?.role === "admin") {
      const periodKey = String(req.query.periodKey || "30d").trim() || "30d";
      const credit = await recalcAdminSalesmanCreditsOverviewSnapshot({
        periodKey,
      });
      if (!credit?.computedAt) {
        return res.status(500).json({
          success: false,
          message: "영업자 크레딧 요약 스냅샷 재계산 실패",
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
          credit,
        },
      });
    }

    return res.status(403).json({
      success: false,
      message: "이 작업을 수행할 권한이 없습니다.",
    });
  } catch (error) {
    console.error("recalcAllSnapshots error:", error);
    return res.status(500).json({
      success: false,
      message: "스냅샷 재계산에 실패했습니다.",
    });
  }
}
