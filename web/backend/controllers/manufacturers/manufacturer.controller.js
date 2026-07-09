import ManufacturerPayment from "../../models/manufacturerPayment.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ManufacturerDailySettlementSnapshot from "../../models/manufacturerDailySettlementSnapshot.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import Request from "../../models/request.model.js";
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
    if (!manufacturerOrganization) {
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

    if (requestSettlement === "paid" || requestSettlement === "free") {
      const requestPaidQuery = {
        manufacturerOrganization,
        type: "EARN",
        refType: "REQUEST",
      };

      if (typeof from === "string" && from.trim()) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) {
          requestPaidQuery.occurredAt = {
            ...(requestPaidQuery.occurredAt || {}),
            $gte: d,
          };
        }
      }
      if (typeof to === "string" && to.trim()) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          requestPaidQuery.occurredAt = {
            ...(requestPaidQuery.occurredAt || {}),
            $lte: d,
          };
        }
      }
      if (rx) {
        requestPaidQuery.$or = [{ uniqueKey: rx }, { refType: rx }];
      }

      const requestPaidRows =
        requestSettlement === "paid"
          ? await ManufacturerCreditLedger.find(requestPaidQuery)
              .sort({ occurredAt: -1, createdAt: -1 })
              .lean()
          : [];

      const requestFreeMatch = {
        type: "SPEND",
        refType: "REQUEST",
        $or: [
          {
            spentBonusAmount: { $gt: 0 },
            $or: [{ spentPaidAmount: { $lte: 0 } }, { spentPaidAmount: null }],
          },
          { hasFreeRequest: true },
        ],
      };

      if (typeof from === "string" && from.trim()) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) {
          requestFreeMatch.createdAt = {
            ...(requestFreeMatch.createdAt || {}),
            $gte: d,
          };
        }
      }
      if (typeof to === "string" && to.trim()) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          requestFreeMatch.createdAt = {
            ...(requestFreeMatch.createdAt || {}),
            $lte: d,
          };
        }
      }

      const requestFreePipeline = [
        { $match: requestFreeMatch },
        {
          $lookup: {
            from: Request.collection.name,
            localField: "refId",
            foreignField: "_id",
            as: "requestDoc",
          },
        },
        { $unwind: "$requestDoc" },
        { $match: { "requestDoc.caManufacturer": user._id } },
      ];

      if (rx) {
        requestFreePipeline.push({
          $match: {
            $or: [
              { uniqueKey: rx },
              { "requestDoc.requestId": rx },
              { "requestDoc.caseInfos.patientName": rx },
            ],
          },
        });
      }

      const requestFreeRowsFromLedger =
        requestSettlement === "free"
          ? await CreditLedger.aggregate([
              ...requestFreePipeline,
              {
                $project: {
                  _id: { $concat: ["free-request:", { $toString: "$_id" }] },
                  manufacturerOrganization: {
                    $literal: manufacturerOrganization,
                  },
                  manufacturerId: { $literal: user._id },
                  type: { $literal: "EARN" },
                  amount: { $literal: 0 },
                  refType: { $literal: "REQUEST_FREE" },
                  refId: "$refId",
                  uniqueKey: {
                    $concat: [
                      "request:",
                      { $toString: "$refId" },
                      ":manufacturer_commission_free",
                    ],
                  },
                  occurredAt: "$createdAt",
                  createdAt: "$createdAt",
                },
              },
            ])
          : [];

      const requestFreeRuleQuery = {
        caManufacturer: user._id,
        "price.rule": "remake_monthly_free_3",
        manufacturerStage: { $ne: "취소" },
      };

      if (typeof from === "string" && from.trim()) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) {
          requestFreeRuleQuery.createdAt = {
            ...(requestFreeRuleQuery.createdAt || {}),
            $gte: d,
          };
        }
      }
      if (typeof to === "string" && to.trim()) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          requestFreeRuleQuery.createdAt = {
            ...(requestFreeRuleQuery.createdAt || {}),
            $lte: d,
          };
        }
      }

      if (rx) {
        requestFreeRuleQuery.$or = [
          { requestId: rx },
          { "caseInfos.patientName": rx },
        ];
      }

      const requestFreeRowsFromRule =
        requestSettlement === "free"
          ? await Request.find(requestFreeRuleQuery)
              .select({ _id: 1, createdAt: 1 })
              .sort({ createdAt: -1, _id: -1 })
              .lean()
          : [];

      const requestFreeRowsMap = new Map();
      for (const row of requestFreeRowsFromLedger || []) {
        const key = String(row?.refId || row?._id || "");
        if (!key) continue;
        requestFreeRowsMap.set(key, row);
      }
      for (const reqRow of requestFreeRowsFromRule || []) {
        const refId = String(reqRow?._id || "");
        if (!refId || requestFreeRowsMap.has(refId)) continue;
        requestFreeRowsMap.set(refId, {
          _id: `free-request-rule:${refId}`,
          manufacturerOrganization,
          manufacturerId: user._id,
          type: "EARN",
          amount: 0,
          refType: "REQUEST_FREE",
          refId,
          uniqueKey: `request:${refId}:manufacturer_commission_free`,
          occurredAt: reqRow?.createdAt || new Date(),
          createdAt: reqRow?.createdAt || new Date(),
        });
      }
      const requestFreeRows = Array.from(requestFreeRowsMap.values());

      const shippingMatch = {
        manufacturerOrganization,
        type: "EARN",
        refType: "SHIPPING_PACKAGE",
      };

      if (typeof from === "string" && from.trim()) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) {
          shippingMatch.occurredAt = {
            ...(shippingMatch.occurredAt || {}),
            $gte: d,
          };
        }
      }
      if (typeof to === "string" && to.trim()) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          shippingMatch.occurredAt = {
            ...(shippingMatch.occurredAt || {}),
            $lte: d,
          };
        }
      }

      const shippingPipeline = [
        { $match: shippingMatch },
        {
          $lookup: {
            from: CreditLedger.collection.name,
            let: { shippingRefId: "$refId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$refId", "$$shippingRefId"] },
                      { $eq: ["$type", "SPEND"] },
                      { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                    ],
                  },
                },
              },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 0,
                  spentPaidAmount: 1,
                  spentBonusAmount: 1,
                },
              },
            ],
            as: "shippingSpend",
          },
        },
        {
          $unwind: {
            path: "$shippingSpend",
            preserveNullAndEmptyArrays: true,
          },
        },
      ];

      if (requestSettlement === "paid") {
        shippingPipeline.push({
          $match: {
            "shippingSpend.spentPaidAmount": { $gt: 0 },
          },
        });
      } else {
        shippingPipeline.push({
          $match: {
            "shippingSpend.spentBonusAmount": { $gt: 0 },
            $or: [
              { "shippingSpend.spentPaidAmount": { $lte: 0 } },
              { "shippingSpend.spentPaidAmount": null },
            ],
          },
        });
      }

      if (rx) {
        shippingPipeline.push({
          $match: {
            $or: [{ uniqueKey: rx }, { refType: rx }],
          },
        });
      }

      const shippingRows =
        await ManufacturerCreditLedger.aggregate(shippingPipeline);

      const rows = [
        ...requestPaidRows,
        ...requestFreeRows,
        ...shippingRows,
      ].sort(
        (a, b) =>
          new Date(String(b?.occurredAt || 0)).getTime() -
          new Date(String(a?.occurredAt || 0)).getTime(),
      );

      const total = rows.length;
      const pagedRows = rows.slice(skip, skip + l);

      return res.status(200).json({
        success: true,
        data: pagedRows,
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l),
        },
      });
    }

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

    if (rx) {
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

    const manufacturerOrganization = String(user.business || "").trim();
    if (!manufacturerOrganization) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const { fromYmd, toYmd, limit = "60", debug } = req.query;
    const l = Math.min(366, Math.max(1, parseInt(limit)));
    const shouldDebugSummary =
      String(debug || "").trim() === "1" ||
      String(process.env.DEBUG_MANUFACTURER_DAILY_SUMMARY || "")
        .trim()
        .toLowerCase() === "true";

    const match = { manufacturerOrganization };
    if (typeof fromYmd === "string" && fromYmd.trim()) {
      const from = new Date(`${fromYmd.trim()}T00:00:00.000+09:00`);
      if (!Number.isNaN(from.getTime())) {
        match.occurredAt = { ...(match.occurredAt || {}), $gte: from };
      }
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      const to = new Date(`${toYmd.trim()}T23:59:59.999+09:00`);
      if (!Number.isNaN(to.getTime())) {
        match.occurredAt = { ...(match.occurredAt || {}), $lte: to };
      }
    }

    const rows = await ManufacturerCreditLedger.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            ymd: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$occurredAt",
                timezone: "Asia/Seoul",
              },
            },
          },
          earnRequestAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "EARN"] },
                    { $ne: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnRequestCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "EARN"] },
                    { $ne: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          earnShippingAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "EARN"] },
                    { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnShippingCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$type", "EARN"] },
                    { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          refundAmount: {
            $sum: { $cond: [{ $eq: ["$type", "REFUND"] }, "$amount", 0] },
          },
          payoutAmount: {
            $sum: { $cond: [{ $eq: ["$type", "PAYOUT"] }, "$amount", 0] },
          },
          adjustAmount: {
            $sum: { $cond: [{ $eq: ["$type", "ADJUST"] }, "$amount", 0] },
          },
        },
      },
      {
        $addFields: {
          ymd: "$_id.ymd",
          netAmount: {
            $add: [
              "$earnRequestAmount",
              "$earnShippingAmount",
              "$refundAmount",
              "$payoutAmount",
              "$adjustAmount",
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          ymd: 1,
          earnRequestAmount: 1,
          earnRequestCount: 1,
          earnShippingAmount: 1,
          earnShippingCount: 1,
          refundAmount: 1,
          payoutAmount: 1,
          adjustAmount: 1,
          netAmount: 1,
        },
      },
    ]);

    const freeMatch = {
      type: "SPEND",
      refType: "REQUEST",
      spentBonusAmount: { $gt: 0 },
      $or: [{ spentPaidAmount: { $lte: 0 } }, { spentPaidAmount: null }],
    };

    if (typeof fromYmd === "string" && fromYmd.trim()) {
      const from = new Date(`${fromYmd.trim()}T00:00:00.000+09:00`);
      if (!Number.isNaN(from.getTime())) {
        freeMatch.createdAt = { ...(freeMatch.createdAt || {}), $gte: from };
      }
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      const to = new Date(`${toYmd.trim()}T23:59:59.999+09:00`);
      if (!Number.isNaN(to.getTime())) {
        freeMatch.createdAt = { ...(freeMatch.createdAt || {}), $lte: to };
      }
    }

    const freeRows = await CreditLedger.aggregate([
      { $match: freeMatch },
      {
        $lookup: {
          from: Request.collection.name,
          localField: "refId",
          foreignField: "_id",
          as: "requestDoc",
        },
      },
      { $unwind: "$requestDoc" },
      { $match: { "requestDoc.caManufacturer": user._id } },
      {
        $group: {
          _id: {
            ymd: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "Asia/Seoul",
              },
            },
          },
          earnRequestFreeCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          ymd: "$_id.ymd",
          earnRequestFreeCount: 1,
        },
      },
    ]);

    const freeRuleRequestMatch = {
      caManufacturer: user._id,
      "price.rule": "remake_monthly_free_3",
      manufacturerStage: { $ne: "취소" },
    };
    if (typeof fromYmd === "string" && fromYmd.trim()) {
      const from = new Date(`${fromYmd.trim()}T00:00:00.000+09:00`);
      if (!Number.isNaN(from.getTime())) {
        freeRuleRequestMatch.createdAt = {
          ...(freeRuleRequestMatch.createdAt || {}),
          $gte: from,
        };
      }
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      const to = new Date(`${toYmd.trim()}T23:59:59.999+09:00`);
      if (!Number.isNaN(to.getTime())) {
        freeRuleRequestMatch.createdAt = {
          ...(freeRuleRequestMatch.createdAt || {}),
          $lte: to,
        };
      }
    }

    const freeRuleRows = await Request.aggregate([
      { $match: freeRuleRequestMatch },
      {
        $group: {
          _id: {
            ymd: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "Asia/Seoul",
              },
            },
          },
          earnRequestFreeCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          ymd: "$_id.ymd",
          earnRequestFreeCount: 1,
        },
      },
    ]);

    const freeCountMap = new Map();
    for (const row of freeRows || []) {
      freeCountMap.set(
        String(row?.ymd || ""),
        Number(row?.earnRequestFreeCount || 0),
      );
    }
    for (const row of freeRuleRows || []) {
      const ymd = String(row?.ymd || "");
      freeCountMap.set(
        ymd,
        Number(freeCountMap.get(ymd) || 0) +
          Number(row?.earnRequestFreeCount || 0),
      );
    }

    const mergedFreeRows = Array.from(freeCountMap.entries()).map(
      ([ymd, count]) => ({ ymd, earnRequestFreeCount: count }),
    );

    const shippingMatch = {
      manufacturerOrganization,
      type: "EARN",
      refType: "SHIPPING_PACKAGE",
    };

    if (typeof fromYmd === "string" && fromYmd.trim()) {
      const from = new Date(`${fromYmd.trim()}T00:00:00.000+09:00`);
      if (!Number.isNaN(from.getTime())) {
        shippingMatch.occurredAt = {
          ...(shippingMatch.occurredAt || {}),
          $gte: from,
        };
      }
    }
    if (typeof toYmd === "string" && toYmd.trim()) {
      const to = new Date(`${toYmd.trim()}T23:59:59.999+09:00`);
      if (!Number.isNaN(to.getTime())) {
        shippingMatch.occurredAt = {
          ...(shippingMatch.occurredAt || {}),
          $lte: to,
        };
      }
    }

    const shippingClassRows = await ManufacturerCreditLedger.aggregate([
      { $match: shippingMatch },
      {
        $lookup: {
          from: CreditLedger.collection.name,
          let: { shippingRefId: "$refId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$refId", "$$shippingRefId"] },
                    { $eq: ["$type", "SPEND"] },
                    { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                _id: 0,
                spentPaidAmount: 1,
                spentBonusAmount: 1,
              },
            },
          ],
          as: "shippingSpend",
        },
      },
      {
        $unwind: {
          path: "$shippingSpend",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            ymd: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$occurredAt",
                timezone: "Asia/Seoul",
              },
            },
          },
          earnShippingPaidAmount: {
            $sum: {
              $cond: [
                { $gt: ["$shippingSpend.spentPaidAmount", 0] },
                "$amount",
                0,
              ],
            },
          },
          earnShippingPaidCount: {
            $sum: {
              $cond: [{ $gt: ["$shippingSpend.spentPaidAmount", 0] }, 1, 0],
            },
          },
          earnShippingFreeAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$shippingSpend.spentBonusAmount", 0] },
                    {
                      $or: [
                        { $lte: ["$shippingSpend.spentPaidAmount", 0] },
                        { $eq: ["$shippingSpend.spentPaidAmount", null] },
                      ],
                    },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          earnShippingFreeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$shippingSpend.spentBonusAmount", 0] },
                    {
                      $or: [
                        { $lte: ["$shippingSpend.spentPaidAmount", 0] },
                        { $eq: ["$shippingSpend.spentPaidAmount", null] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          ymd: "$_id.ymd",
          earnShippingPaidAmount: 1,
          earnShippingPaidCount: 1,
          earnShippingFreeAmount: 1,
          earnShippingFreeCount: 1,
        },
      },
    ]);

    const rowMap = new Map();

    for (const row of rows || []) {
      const ymd = String(row?.ymd || "");
      rowMap.set(ymd, {
        ...row,
        earnRequestPaidAmount: Number(row?.earnRequestAmount || 0),
        earnRequestPaidCount: Number(row?.earnRequestCount || 0),
        earnRequestFreeAmount: 0,
        earnRequestFreeCount: 0,
        earnShippingPaidAmount: Number(row?.earnShippingAmount || 0),
        earnShippingPaidCount: Number(row?.earnShippingCount || 0),
        earnShippingFreeAmount: 0,
        earnShippingFreeCount: 0,
      });
    }

    for (const free of mergedFreeRows || []) {
      const ymd = String(free?.ymd || "");
      const existing = rowMap.get(ymd) || {
        ymd,
        earnRequestAmount: 0,
        earnRequestCount: 0,
        earnShippingAmount: 0,
        earnShippingCount: 0,
        refundAmount: 0,
        payoutAmount: 0,
        adjustAmount: 0,
        netAmount: 0,
        earnRequestPaidAmount: 0,
        earnRequestPaidCount: 0,
        earnRequestFreeAmount: 0,
        earnRequestFreeCount: 0,
        earnShippingPaidAmount: 0,
        earnShippingPaidCount: 0,
        earnShippingFreeAmount: 0,
        earnShippingFreeCount: 0,
      };

      existing.earnRequestFreeCount = Number(free?.earnRequestFreeCount || 0);
      rowMap.set(ymd, existing);
    }

    for (const shipping of shippingClassRows || []) {
      const ymd = String(shipping?.ymd || "");
      const existing = rowMap.get(ymd) || {
        ymd,
        earnRequestAmount: 0,
        earnRequestCount: 0,
        earnShippingAmount: 0,
        earnShippingCount: 0,
        refundAmount: 0,
        payoutAmount: 0,
        adjustAmount: 0,
        netAmount: 0,
        earnRequestPaidAmount: 0,
        earnRequestPaidCount: 0,
        earnRequestFreeAmount: 0,
        earnRequestFreeCount: 0,
        earnShippingPaidAmount: 0,
        earnShippingPaidCount: 0,
        earnShippingFreeAmount: 0,
        earnShippingFreeCount: 0,
      };

      existing.earnShippingPaidAmount = Number(
        shipping?.earnShippingPaidAmount || 0,
      );
      existing.earnShippingPaidCount = Number(
        shipping?.earnShippingPaidCount || 0,
      );
      existing.earnShippingFreeAmount = Number(
        shipping?.earnShippingFreeAmount || 0,
      );
      existing.earnShippingFreeCount = Number(
        shipping?.earnShippingFreeCount || 0,
      );
      rowMap.set(ymd, existing);
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
      typeof toYmd === "string" && toYmd.trim()
        ? toYmd.trim()
        : getTodayYmdInKst();
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

    const emptyRow = (ymd) => ({
      ymd,
      earnRequestAmount: 0,
      earnRequestCount: 0,
      earnShippingAmount: 0,
      earnShippingCount: 0,
      refundAmount: 0,
      payoutAmount: 0,
      adjustAmount: 0,
      netAmount: 0,
      earnRequestPaidAmount: 0,
      earnRequestPaidCount: 0,
      earnRequestFreeAmount: 0,
      earnRequestFreeCount: 0,
      earnShippingPaidAmount: 0,
      earnShippingPaidCount: 0,
      earnShippingFreeAmount: 0,
      earnShippingFreeCount: 0,
    });

    const mergedRows = [];
    for (let t = toMs; t >= fromMs; t -= 24 * 60 * 60 * 1000) {
      const ymd = formatKstYmd(new Date(t));
      const existing = rowMap.get(ymd);
      mergedRows.push(
        existing ? { ...emptyRow(ymd), ...existing, ymd } : emptyRow(ymd),
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

      console.log("[manufacturer/daily-summary][debug]", {
        userId: String(user?._id || ""),
        manufacturerOrganization,
        period: {
          fromYmd: fromYmd || null,
          toYmd: toYmd || null,
          limit: l,
        },
        sourceCounts: {
          manufacturerLedgerRows: Array.isArray(rows) ? rows.length : 0,
          requestFreeRowsFromCreditLedger: Array.isArray(freeRows)
            ? freeRows.length
            : 0,
          requestFreeRowsFromPriceRule: Array.isArray(freeRuleRows)
            ? freeRuleRows.length
            : 0,
          mergedFreeRows: Array.isArray(mergedFreeRows)
            ? mergedFreeRows.length
            : 0,
          shippingClassRows: Array.isArray(shippingClassRows)
            ? shippingClassRows.length
            : 0,
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
