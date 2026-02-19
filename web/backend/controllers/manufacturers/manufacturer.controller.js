import ManufacturerPayment from "../../models/manufacturerPayment.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ManufacturerDailySettlementSnapshot from "../../models/manufacturerDailySettlementSnapshot.model.js";
import { sendNotificationViaQueue } from "../../utils/notificationQueue.js";
import User from "../../models/user.model.js";
import {
  getTodayMidnightUtcInKst,
  getTodayYmdInKst,
  getYesterdayYmdInKst,
} from "../../utils/krBusinessDays.js";

function kstYmdToUtcRange(ymd) {
  const dt = new Date(`${ymd}T00:00:00.000+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export async function getManufacturerCreditLedger(req, res) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const manufacturerOrganization = String(user.organization || "").trim();
    if (!manufacturerOrganization) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const { page = 1, limit = 50, from, to, q, type } = req.query;
    const p = Math.max(1, parseInt(page));
    const l = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (p - 1) * l;

    const query = { manufacturerOrganization };
    if (typeof type === "string" && type.trim()) {
      query.type = type.trim();
    }

    if (typeof from === "string" && from.trim()) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        query.occurredAt = { ...(query.occurredAt || {}), $gte: d };
      }
    }
    if (typeof to === "string" && to.trim()) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        query.occurredAt = { ...(query.occurredAt || {}), $lte: d };
      }
    }

    if (typeof q === "string" && q.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      query.$or = [{ uniqueKey: rx }, { refType: rx }];
    }

    const rows = await ManufacturerCreditLedger.find(query)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean();
    const total = await ManufacturerCreditLedger.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page: p,
        limit: l,
        total,
        totalPages: Math.ceil(total / l),
      },
    });
  } catch (error) {
    console.error("제조사 크레딧 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "제조사 크레딧 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function getManufacturerDailySettlementSnapshotStatus(req, res) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const manufacturerOrganization = String(user.organization || "").trim();
    if (!manufacturerOrganization) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const baseYmd = getTodayYmdInKst();
    const snapshotYmd = getYesterdayYmdInKst();
    const baseMidnightUtc = getTodayMidnightUtcInKst();

    if (!baseYmd || !snapshotYmd || !baseMidnightUtc) {
      return res
        .status(500)
        .json({ success: false, message: "날짜 계산 실패" });
    }

    const latest = await ManufacturerDailySettlementSnapshot.findOne({
      manufacturerOrganization,
      ymd: snapshotYmd,
    })
      .select({ computedAt: 1, ymd: 1 })
      .lean();

    const snapshotMissing = !latest;
    return res.status(200).json({
      success: true,
      data: {
        lastComputedAt: latest?.computedAt || null,
        baseYmd,
        baseMidnightUtc: baseMidnightUtc.toISOString(),
        snapshotYmd,
        snapshotMissing,
      },
    });
  } catch (error) {
    console.error("제조사 정산 스냅샷 상태 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "정산 스냅샷 상태 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function triggerManufacturerDailySettlementSnapshotRecalc(
  req,
  res,
) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const manufacturerOrganization = String(user.organization || "").trim();
    if (!manufacturerOrganization) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const baseYmd = getTodayYmdInKst();
    const snapshotYmd = getYesterdayYmdInKst();
    const baseMidnightUtc = getTodayMidnightUtcInKst();

    if (!baseYmd || !snapshotYmd || !baseMidnightUtc) {
      return res
        .status(500)
        .json({ success: false, message: "날짜 계산 실패" });
    }

    const utcRange = kstYmdToUtcRange(snapshotYmd);
    if (!utcRange) {
      return res
        .status(500)
        .json({ success: false, message: "날짜 범위 계산 실패" });
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

    return res.status(200).json({
      success: true,
      data: {
        baseYmd,
        baseMidnightUtc: baseMidnightUtc.toISOString(),
        snapshotYmd,
        computedAt: computedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("제조사 정산 스냅샷 재계산 실패:", error);
    return res.status(500).json({
      success: false,
      message: "정산 스냅샷 재계산에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function getManufacturerDailySettlementSnapshots(req, res) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const manufacturerOrganization = String(user.organization || "").trim();
    if (!manufacturerOrganization) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const { fromYmd, toYmd, limit = 60 } = req.query;
    const query = { manufacturerOrganization };
    if (typeof fromYmd === "string" && fromYmd.trim()) {
      query.ymd = { ...(query.ymd || {}), $gte: fromYmd.trim() };
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      query.ymd = { ...(query.ymd || {}), $lte: toYmd.trim() };
    }

    const l = Math.min(366, Math.max(1, parseInt(limit)));
    const rows = await ManufacturerDailySettlementSnapshot.find(query)
      .sort({ ymd: -1 })
      .limit(l)
      .lean();

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("제조사 일별 정산 스냅샷 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "제조사 일별 정산 스냅샷 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function recordManufacturerPayment(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const {
      amount,
      occurredAt,
      bankTransactionId,
      externalId,
      printedContent,
      note,
    } = req.body;

    if (!amount || !occurredAt) {
      return res.status(400).json({
        success: false,
        message: "금액과 발생일시가 필요합니다.",
      });
    }

    const payment = await ManufacturerPayment.create({
      userId,
      amount: Number(amount),
      occurredAt: new Date(occurredAt),
      bankTransactionId: bankTransactionId || null,
      externalId: externalId || "",
      printedContent: printedContent || "",
      note: note || "",
      status: "CONFIRMED",
    });

    return res.status(201).json({
      success: true,
      data: payment,
      message: "입금 내역이 기록되었습니다.",
    });
  } catch (error) {
    console.error("입금 내역 기록 실패:", error);
    return res.status(500).json({
      success: false,
      message: "입금 내역 기록에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function listManufacturerPayments(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const { page = 1, limit = 20, status, from, to, q } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { userId };
    if (status) {
      query.status = status;
    }

    if (typeof from === "string" && from.trim()) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        query.occurredAt = { ...(query.occurredAt || {}), $gte: d };
      }
    }
    if (typeof to === "string" && to.trim()) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        query.occurredAt = { ...(query.occurredAt || {}), $lte: d };
      }
    }
    if (typeof q === "string" && q.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      query.$or = [{ note: rx }, { externalId: rx }, { printedContent: rx }];
    }

    const payments = await ManufacturerPayment.find(query)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ManufacturerPayment.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("입금 내역 조회 실패:", error);
    return res.status(500).json({
      success: false,
      message: "입금 내역 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function sendUrgentMessage(req, res) {
  try {
    const senderId = req.user?._id;
    if (!senderId || req.user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const { targetUserId, message, useKakao = true, templateCode } = req.body;

    if (!targetUserId || !message) {
      return res.status(400).json({
        success: false,
        message: "수신자와 메시지 내용이 필요합니다.",
      });
    }

    const targetUser = await User.findById(targetUserId).select("phone").lean();
    if (!targetUser || !targetUser.phone) {
      return res.status(404).json({
        success: false,
        message: "수신자의 전화번호를 찾을 수 없습니다.",
      });
    }

    const cleanedPhone = targetUser.phone.replace(/[^0-9+]/g, "");
    if (cleanedPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "올바른 전화번호가 아닙니다.",
      });
    }

    // 큐를 통한 발송
    const type =
      message.length > 90 ? "LMS" : useKakao && templateCode ? "KAKAO" : "SMS";

    await sendNotificationViaQueue({
      type,
      to: cleanedPhone,
      content: message,
      templateCode: type === "KAKAO" ? templateCode : undefined,
      subject: type === "LMS" ? "긴급 알림" : "",
      priority: 10, // 긴급이므로 우선순위 높임
    });

    return res.status(200).json({
      success: true,
      message: "긴급 메시지가 발송 요청되었습니다.",
    });
  } catch (error) {
    console.error("긴급 메시지 발송 실패:", error);
    return res.status(500).json({
      success: false,
      message: "긴급 메시지 발송 요청에 실패했습니다.",
      error: error.message,
    });
  }
}

export default {
  recordManufacturerPayment,
  listManufacturerPayments,
  sendUrgentMessage,
  getManufacturerCreditLedger,
  getManufacturerDailySettlementSnapshots,
};
