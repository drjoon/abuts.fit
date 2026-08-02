// related files:
// - web/backend/rules.md
// - web/backend/modules/manufacturer/manufacturer.routes.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/creditBalance.service.js
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
import { Types } from "mongoose";
import ManufacturerPayment from "../../models/manufacturerPayment.model.js";
import ManufacturerDailySettlementSnapshot from "../../models/manufacturerDailySettlementSnapshot.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
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

    const manufacturerOrganization = String(user.business || "").trim();
    const manufacturerAnchorIdRaw = String(user?.businessAnchorId || "").trim();
    if (!manufacturerOrganization || !Types.ObjectId.isValid(manufacturerAnchorIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const {
      page = 1,
      limit = 50,
      from,
      to,
      q,
      type,
      requestSettlement = "all",
    } = req.query;

    const p = Math.max(1, parseInt(page));
    const l = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (p - 1) * l;

    const rx =
      typeof q === "string" && q.trim()
        ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : null;

    const normalizedType = String(type || "").trim().toUpperCase();
    if (
      normalizedType &&
      normalizedType !== "ALL" &&
      !["EARN", "ADJUST", "PAYOUT"].includes(normalizedType)
    ) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          page: p,
          limit: l,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const match = {
      ownerRole: "manufacturer",
      ownerId: new Types.ObjectId(manufacturerAnchorIdRaw),
      accountCode: "REV_MANUFACTURER",
    };

    if (typeof from === "string" && from.trim()) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) {
        match.occurredAt = { ...(match.occurredAt || {}), $gte: d };
      }
    }
    if (typeof to === "string" && to.trim()) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        match.occurredAt = { ...(match.occurredAt || {}), $lte: d };
      }
    }

    if (requestSettlement === "paid") {
      match.creditKind = "PAID";
    } else if (requestSettlement === "free") {
      match.creditKind = { $in: ["FREE_REQUEST", "FREE_SHIPPING"] };
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: LedgerJournal.collection.name,
          localField: "journalId",
          foreignField: "journalId",
          as: "journalDoc",
        },
      },
      {
        $unwind: {
          path: "$journalDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          uniqueKey: {
            $concat: [
              "gl:",
              { $ifNull: ["$journalDoc.meta.spendUniqueKey", "$journalId"] },
            ],
          },
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                  then: "PAYOUT",
                },
                {
                  case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "EARN",
            },
          },
          amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
          requestIdMeta: { $ifNull: ["$journalDoc.meta.requestId", ""] },
        },
      },
    ];

    if (normalizedType === "EARN" || normalizedType === "ADJUST" || normalizedType === "PAYOUT") {
      pipeline.push({ $match: { type: normalizedType } });
    }

    if (rx) {
      pipeline.push({
        $match: {
          $or: [{ uniqueKey: rx }, { refType: rx }, { requestIdMeta: rx }],
        },
      });
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: l },
            {
              $project: {
                _id: 1,
                manufacturerOrganization: { $literal: manufacturerOrganization },
                manufacturerId: user._id,
                type: 1,
                amount: "$amountBase",
                amountExcludingVat: "$amountBase",
                vatAmount: { $literal: 0 },
                amountIncludingVat: "$amountBase",
                refType: 1,
                refId: 1,
                uniqueKey: 1,
                occurredAt: 1,
                createdAt: 1,
                creditKind: 1,
                eventType: "$journalDoc.eventType",
              },
            },
          ],
          totalRows: [{ $count: "count" }],
        },
      },
    );

    const [result] = await LedgerLine.aggregate(pipeline);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const total = Number(result?.totalRows?.[0]?.count || 0);

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

    const manufacturerOrganization = String(user.business || "").trim();
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

    const manufacturerOrganization = String(user.business || "").trim();
    const manufacturerAnchorIdRaw = String(user?.businessAnchorId || "").trim();
    if (!manufacturerOrganization || !Types.ObjectId.isValid(manufacturerAnchorIdRaw)) {
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
    // SSOT 정책:
    // - REQUEST_SPEND_COMMIT: CAM 승인(가공 진입) 시점 소비
    // - SHIPPING_SPEND_COMMIT: 세척.패킹 승인(포장.발송 진입) 시점 소비
    // - 롤백은 REFUND 적재가 아니라 COMMIT 물리삭제이므로 refundAmount는 0 고정(legacy 스키마 호환)
    const [summary] = await LedgerLine.aggregate([
      {
        $match: {
          ownerRole: "manufacturer",
          ownerId: new Types.ObjectId(manufacturerAnchorIdRaw),
          accountCode: "REV_MANUFACTURER",
          occurredAt: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: LedgerJournal.collection.name,
          localField: "journalId",
          foreignField: "journalId",
          as: "journalDoc",
        },
      },
      {
        $unwind: {
          path: "$journalDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
          eventType: { $ifNull: ["$journalDoc.eventType", ""] },
        },
      },
      {
        $group: {
          _id: null,
          earnRequestPaidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          earnRequestPaidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnShippingPaidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          earnShippingPaidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          payoutAmount: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "SETTLEMENT_PAYOUT"] }, "$baseAmount", 0],
            },
          },
          adjustAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "ADJUST"] },
                    {
                      $or: [
                        { $eq: ["$creditKind", "PAID"] },
                        { $eq: ["$creditKind", null] },
                      ],
                    },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          earnRequestAmount: "$earnRequestPaidAmount",
          earnRequestCount: "$earnRequestPaidCount",
          earnShippingAmount: "$earnShippingPaidAmount",
          earnShippingCount: "$earnShippingPaidCount",
          refundAmount: { $literal: 0 },
          payoutAmount: "$payoutAmount",
          adjustAmount: "$adjustAmount",
        },
      },
    ]);

    const sums = {
      earnRequestAmount: Number(summary?.earnRequestAmount || 0),
      earnRequestCount: Number(summary?.earnRequestCount || 0),
      earnShippingAmount: Number(summary?.earnShippingAmount || 0),
      earnShippingCount: Number(summary?.earnShippingCount || 0),
      refundAmount: Number(summary?.refundAmount || 0),
      payoutAmount: Number(summary?.payoutAmount || 0),
      adjustAmount: Number(summary?.adjustAmount || 0),
    };

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

    const manufacturerOrganization = String(user.business || "").trim();
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

export async function getManufacturerCreditDailySummary(req, res) {
  try {
    const user = req.user;
    if (!user?._id || user?.role !== "manufacturer") {
      return res.status(403).json({
        success: false,
        message: "제조사 권한이 필요합니다.",
      });
    }

    const manufacturerAnchorIdRaw = String(user?.businessAnchorId || "").trim();
    if (!manufacturerAnchorIdRaw || !Types.ObjectId.isValid(manufacturerAnchorIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "제조사 사업체 정보가 필요합니다.",
      });
    }
    const manufacturerAnchorId = new Types.ObjectId(manufacturerAnchorIdRaw);

    const { fromYmd, toYmd, limit = "60", debug } = req.query;
    const l = Math.min(366, Math.max(1, parseInt(limit)));
    const shouldDebugSummary =
      String(debug || "").trim() === "1" ||
      String(process.env.DEBUG_MANUFACTURER_DAILY_SUMMARY || "")
        .trim()
        .toLowerCase() === "true";

    const occurredAtMatch = {};
    if (typeof fromYmd === "string" && fromYmd.trim()) {
      const from = new Date(`${fromYmd.trim()}T00:00:00.000+09:00`);
      if (!Number.isNaN(from.getTime())) {
        occurredAtMatch.$gte = from;
      }
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      const to = new Date(`${toYmd.trim()}T23:59:59.999+09:00`);
      if (!Number.isNaN(to.getTime())) {
        occurredAtMatch.$lte = to;
      }
    }

    const baseMatch = {
      ownerRole: "manufacturer",
      ownerId: manufacturerAnchorId,
      accountCode: "REV_MANUFACTURER",
      ...(Object.keys(occurredAtMatch).length > 0
        ? { occurredAt: occurredAtMatch }
        : {}),
    };

    // 일별 요약도 동일 SSOT 이벤트만 집계한다.
    // 샘플/무자료 NC 작업은 원천적으로 GL 비적재 정책이므로 이 집계에서 자동 제외된다.
    const rows = await LedgerLine.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: LedgerJournal.collection.name,
          localField: "journalId",
          foreignField: "journalId",
          as: "journalDoc",
        },
      },
      {
        $unwind: {
          path: "$journalDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          ymd: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$occurredAt",
              timezone: "Asia/Seoul",
            },
          },
          baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
          eventType: { $ifNull: ["$journalDoc.eventType", ""] },
        },
      },
      {
        $group: {
          _id: "$ymd",
          earnRequestPaidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          earnRequestPaidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnRequestFreeAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "FREE_REQUEST"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          earnRequestFreeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "FREE_REQUEST"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnShippingPaidAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          earnShippingPaidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "PAID"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnShippingFreeAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "FREE_SHIPPING"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          earnShippingFreeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                    { $eq: ["$creditKind", "FREE_SHIPPING"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          payoutAmount: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "SETTLEMENT_PAYOUT"] }, "$baseAmount", 0],
            },
          },
          adjustAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "ADJUST"] },
                    {
                      $or: [
                        { $eq: ["$creditKind", "PAID"] },
                        { $eq: ["$creditKind", null] },
                      ],
                    },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          ymd: "$_id",
          earnRequestPaidAmount: 1,
          earnRequestPaidCount: 1,
          earnRequestFreeAmount: 1,
          earnRequestFreeCount: 1,
          earnShippingPaidAmount: 1,
          earnShippingPaidCount: 1,
          earnShippingFreeAmount: 1,
          earnShippingFreeCount: 1,
          payoutAmount: 1,
          adjustAmount: 1,
        },
      },
    ]);

    const makeEmptyRow = (ymd) => ({
      ymd,
      earnRequestAmount: 0,
      earnRequestCount: 0,
      earnShippingAmount: 0,
      earnShippingCount: 0,
      refundAmount: 0,
      payoutAmount: 0,
      adjustAmount: 0,
      netAmount: 0,
      netPaidAmount: 0,
      netFreeRequestAmount: 0,
      netFreeShippingAmount: 0,
      netFreeAmount: 0,
      earnRequestPaidAmount: 0,
      earnRequestPaidCount: 0,
      earnRequestFreeAmount: 0,
      earnRequestFreeCount: 0,
      earnShippingPaidAmount: 0,
      earnShippingPaidCount: 0,
      earnShippingFreeAmount: 0,
      earnShippingFreeCount: 0,
    });

    const recomputeNetAmount = (targetRow) => {
      const paidNet =
        Number(targetRow.earnRequestAmount || 0) +
        Number(targetRow.earnShippingAmount || 0) +
        Number(targetRow.refundAmount || 0) +
        Number(targetRow.payoutAmount || 0) +
        Number(targetRow.adjustAmount || 0);
      const freeRequestNet = Number(targetRow.earnRequestFreeAmount || 0);
      const freeShippingNet = Number(targetRow.earnShippingFreeAmount || 0);
      const freeNet = freeRequestNet + freeShippingNet;

      targetRow.netPaidAmount = paidNet;
      targetRow.netFreeRequestAmount = freeRequestNet;
      targetRow.netFreeShippingAmount = freeShippingNet;
      targetRow.netFreeAmount = freeNet;
      // 하위호환: 기존 netAmount는 유료 정산 순액으로 유지
      targetRow.netAmount = paidNet;
      return targetRow;
    };

    const rowMap = new Map();
    for (const row of rows || []) {
      const ymd = String(row?.ymd || "");
      if (!ymd) continue;

      const normalized = {
        ...makeEmptyRow(ymd),
        ...row,
      };

      // 정책: 화면 총액/총건수는 paid 분해값만 반영
      normalized.earnRequestAmount = Number(normalized.earnRequestPaidAmount || 0);
      normalized.earnRequestCount = Number(normalized.earnRequestPaidCount || 0);
      normalized.earnShippingAmount = Number(normalized.earnShippingPaidAmount || 0);
      normalized.earnShippingCount = Number(normalized.earnShippingPaidCount || 0);

      rowMap.set(ymd, recomputeNetAmount(normalized));
    }

    const parseKstYmd = (ymd) => {
      if (typeof ymd !== "string" || !ymd.trim()) return null;
      const d = new Date(`${ymd.trim()}T00:00:00.000+09:00`);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    };

    const formatKstYmd = (d) =>
      d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

    const endYmd =
      typeof toYmd === "string" && toYmd.trim() ? toYmd.trim() : getTodayYmdInKst();
    const endDate = parseKstYmd(endYmd) || new Date();

    const startDateByFrom =
      typeof fromYmd === "string" && fromYmd.trim()
        ? parseKstYmd(fromYmd.trim())
        : null;
    const startDate =
      startDateByFrom ||
      new Date(endDate.getTime() - (l - 1) * 24 * 60 * 60 * 1000);

    const fromMs = Math.min(startDate.getTime(), endDate.getTime());
    const toMs = Math.max(startDate.getTime(), endDate.getTime());

    const mergedRows = [];
    for (let t = toMs; t >= fromMs; t -= 24 * 60 * 60 * 1000) {
      const ymd = formatKstYmd(new Date(t));
      const existing = rowMap.get(ymd);
      mergedRows.push(
        existing ? { ...makeEmptyRow(ymd), ...existing, ymd } : makeEmptyRow(ymd),
      );
      if (mergedRows.length >= l) break;
    }

    if (shouldDebugSummary) {
      const sampleRows = (mergedRows || []).slice(0, 5).map((r) => ({
        ymd: r?.ymd,
        earnRequestPaidCount: Number(r?.earnRequestPaidCount || 0),
        earnRequestFreeCount: Number(r?.earnRequestFreeCount || 0),
        earnShippingPaidCount: Number(r?.earnShippingPaidCount || 0),
        earnShippingFreeCount: Number(r?.earnShippingFreeCount || 0),
      }));

      console.log("[manufacturer/daily-summary][debug][gl-ssot]", {
        userId: String(user?._id || ""),
        manufacturerAnchorId: manufacturerAnchorIdRaw,
        period: {
          fromYmd: fromYmd || null,
          toYmd: toYmd || null,
          limit: l,
        },
        sourceCounts: {
          ledgerLineRows: Array.isArray(rows) ? rows.length : 0,
          finalMergedRows: Array.isArray(mergedRows) ? mergedRows.length : 0,
        },
        sampleRows,
      });
    }

    return res.status(200).json({
      success: true,
      data: mergedRows,
    });
  } catch (error) {
    console.error("제조사 일별 정산 집계 실패:", error);
    return res.status(500).json({
      success: false,
      message: "제조사 일별 정산 집계에 실패했습니다.",
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
  getManufacturerCreditDailySummary,
};
