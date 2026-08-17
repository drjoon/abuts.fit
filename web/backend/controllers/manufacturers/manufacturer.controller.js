// change-log:
// - 2026-08-17: 제조사 장부는 의뢰 1건=어벗 1개라 KST 하루로 묶고, 상세는 우편함(수취자)별.
// - 2026-08-17: 기공의뢰 생산(PTX)도 의뢰 집계에 포함. 제조사 고정단가 1개당.
// - 2026-08-07: 일별 정산 건수를 저널/라인 수가 아닌 의뢰·패키지 refId 유니크로 집계
//   (machining_spend+express_surcharge, paid/free 분해 라인으로 건수 부풀림 방지)
// - 2026-08-07: 일별 빈 행은 KST 오늘 이후(미도래 일자)를 채우지 않음
// related files:
// - web/backend/rules.md
// - web/backend/modules/manufacturer/manufacturer.routes.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/utils/manufacturerLedgerDisplay.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
import { Types } from "mongoose";
import ManufacturerPayment from "../../models/manufacturerPayment.model.js";
import ManufacturerDailySettlementSnapshot from "../../models/manufacturerDailySettlementSnapshot.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { sendNotificationViaQueue } from "../../utils/notificationQueue.js";
import User from "../../models/user.model.js";
import {
  collectManufacturerLedgerLookupIds,
  groupManufacturerLedgerForDisplay,
  summarizeManufacturerLedgerPackage,
  summarizeManufacturerLedgerRequest,
} from "../../utils/manufacturerLedgerDisplay.js";
import {
  getTodayMidnightUtcInKst,
  getTodayYmdInKst,
  getYesterdayYmdInKst,
} from "../../utils/krBusinessDays.js";
import {
  MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
  MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
} from "../../services/creditRevenuePolicy.service.js";

function toObjectIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

async function loadManufacturerLedgerDisplayContext(rows) {
  const { requestIds, packageIds, ptxIds } =
    collectManufacturerLedgerLookupIds(rows);
  const requestObjectIds = toObjectIds(requestIds);
  const packageObjectIds = toObjectIds(packageIds);
  const ptxObjectIds = toObjectIds(ptxIds);

  const packages = packageObjectIds.length
    ? await ShippingPackage.find({ _id: { $in: packageObjectIds } })
        .select({ mailboxAddress: 1, requestIds: 1 })
        .lean()
    : [];

  const packageRequestIds = packages.flatMap((pkg) =>
    Array.isArray(pkg?.requestIds) ? pkg.requestIds : [],
  );
  const ptxRequestFilter = ptxObjectIds.length
    ? [{ "partnerBilling.relatedPracticeTransferId": { $in: ptxObjectIds } }]
    : [];
  const requestFilterIds = toObjectIds([
    ...requestObjectIds,
    ...packageRequestIds,
  ]);

  const requests =
    requestFilterIds.length || ptxRequestFilter.length
      ? await Request.find({
          $or: [
            ...(requestFilterIds.length ? [{ _id: { $in: requestFilterIds } }] : []),
            ...ptxRequestFilter,
          ],
        })
          .select({
            requestId: 1,
            mailboxAddress: 1,
            caseInfos: 1,
            shippingReceiver: 1,
            partnerBilling: 1,
            businessAnchorId: 1,
          })
          .lean()
      : [];

  const anchorIds = [
    ...new Set(
      requests
        .map((doc) => String(doc?.businessAnchorId || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
  const anchors = anchorIds.length
    ? await BusinessAnchor.find({ _id: { $in: toObjectIds(anchorIds) } })
        .select({ name: 1 })
        .lean()
    : [];
  const anchorNameById = new Map(
    anchors.map((doc) => [String(doc._id), String(doc.name || "").trim()]),
  );

  const requestsById = new Map();
  const requestsByPtxId = new Map();
  for (const doc of requests) {
    const summary = summarizeManufacturerLedgerRequest({
      ...doc,
      anchorName: anchorNameById.get(String(doc.businessAnchorId || "")) || "",
    });
    if (summary.id) requestsById.set(summary.id, summary);
    if (summary.relatedPracticeTransferId) {
      const list = requestsByPtxId.get(summary.relatedPracticeTransferId) || [];
      list.push(summary);
      requestsByPtxId.set(summary.relatedPracticeTransferId, list);
    }
  }

  const packagesById = new Map(
    packages.map((doc) => {
      const summary = summarizeManufacturerLedgerPackage(doc, requestsById);
      return [summary.id, summary];
    }),
  );

  return { requestsById, packagesById, requestsByPtxId };
}

function parseLedgerOccurredAt(raw, endOfDay) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(
      `${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+09:00`,
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function kstYmdToUtcRange(ymd) {
  const dt = new Date(`${ymd}T00:00:00.000+09:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/**
 * 제조사 REV 라인 → 일별(또는 단일 기간) 금액/건수 집계 스테이지.
 * 금액: 라인 합산(신속추가비 저널 포함).
 * 건수: (eventType, creditKind, spendUniqueKey|refId) 유니크.
 *   기공의뢰 배송 lab/abuts 2구간은 같은 refId라도 구간별로 1건.
 */
function buildManufacturerEarnCollapseAndGroupStages({ groupByYmd }) {
  const amountCond = (eventTypes, creditKind) => ({
    $sum: {
      $cond: [
        {
          $and: [
            { $in: ["$_id.eventType", eventTypes] },
            { $eq: ["$_id.creditKind", creditKind] },
          ],
        },
        "$amount",
        0,
      ],
    },
  });

  const vatCond = (eventTypes, creditKind) => ({
    $sum: {
      $cond: [
        {
          $and: [
            { $in: ["$_id.eventType", eventTypes] },
            { $eq: ["$_id.creditKind", creditKind] },
          ],
        },
        "$vat",
        0,
      ],
    },
  });

  const totalCond = (eventTypes, creditKind) => ({
    $sum: {
      $cond: [
        {
          $and: [
            { $in: ["$_id.eventType", eventTypes] },
            { $eq: ["$_id.creditKind", creditKind] },
          ],
        },
        "$total",
        0,
      ],
    },
  });

  const countCond = (eventTypes, creditKind) => ({
    $sum: {
      $cond: [
        {
          $and: [
            { $in: ["$_id.eventType", eventTypes] },
            { $eq: ["$_id.creditKind", creditKind] },
          ],
        },
        1,
        0,
      ],
    },
  });

  return [
    {
      $addFields: {
        ...(groupByYmd
          ? {
              ymd: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$occurredAt",
                  timezone: "Asia/Seoul",
                },
              },
            }
          : {}),
        baseAmount: { $ifNull: ["$amountExcludingVat", "$amount"] },
        vatAmountField: { $ifNull: ["$vatAmount", 0] },
        totalAmount: {
          $ifNull: [
            "$amountIncludingVat",
            { $ifNull: ["$amount", { $ifNull: ["$amountExcludingVat", 0] }] },
          ],
        },
        eventType: { $ifNull: ["$journalDoc.eventType", ""] },
        // 기공의뢰 배송은 같은 refId에 lab/abuts 2구간이 있어 spendUniqueKey로 건수 분리
        settleRefKey: {
          $ifNull: [
            "$journalDoc.meta.spendUniqueKey",
            { $ifNull: ["$meta.spendUniqueKey", { $ifNull: ["$refId", "$journalId"] }] },
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          ...(groupByYmd ? { ymd: "$ymd" } : {}),
          eventType: "$eventType",
          creditKind: "$creditKind",
          refId: "$settleRefKey",
        },
        amount: { $sum: "$baseAmount" },
        vat: { $sum: "$vatAmountField" },
        total: { $sum: "$totalAmount" },
      },
    },
    {
      $group: {
        _id: groupByYmd ? "$_id.ymd" : null,
        earnRequestPaidAmount: amountCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnRequestPaidVat: vatCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnRequestPaidTotal: totalCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnRequestPaidCount: countCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnRequestFreeAmount: amountCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "FREE_REQUEST",
        ),
        earnRequestFreeVat: vatCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "FREE_REQUEST",
        ),
        earnRequestFreeTotal: totalCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "FREE_REQUEST",
        ),
        earnRequestFreeCount: countCond(
          MANUFACTURER_REQUEST_EARN_EVENT_TYPES,
          "FREE_REQUEST",
        ),
        earnShippingPaidAmount: amountCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnShippingPaidVat: vatCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnShippingPaidTotal: totalCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnShippingPaidCount: countCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "PAID",
        ),
        earnShippingFreeAmount: amountCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "FREE_SHIPPING",
        ),
        earnShippingFreeVat: vatCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "FREE_SHIPPING",
        ),
        earnShippingFreeTotal: totalCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "FREE_SHIPPING",
        ),
        earnShippingFreeCount: countCond(
          MANUFACTURER_SHIPPING_EARN_EVENT_TYPES,
          "FREE_SHIPPING",
        ),
        payoutAmount: {
          $sum: {
            $cond: [
              { $eq: ["$_id.eventType", "SETTLEMENT_PAYOUT"] },
              "$total",
              0,
            ],
          },
        },
        adjustAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$_id.eventType", "ADJUST"] },
                  {
                    $or: [
                      { $eq: ["$_id.creditKind", "PAID"] },
                      { $eq: ["$_id.creditKind", null] },
                    ],
                  },
                ],
              },
              "$total",
              0,
            ],
          },
        },
      },
    },
  ];
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
      const d = parseLedgerOccurredAt(from, false);
      if (d) match.occurredAt = { ...(match.occurredAt || {}), $gte: d };
    }
    if (typeof to === "string" && to.trim()) {
      const d = parseLedgerOccurredAt(to, true);
      if (d) match.occurredAt = { ...(match.occurredAt || {}), $lte: d };
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
          displayLabel: {
            $ifNull: [
              "$meta.displayLabel",
              { $ifNull: ["$journalDoc.meta.displayLabel", ""] },
            ],
          },
          usageKind: {
            $ifNull: [
              "$meta.usageKind",
              { $ifNull: ["$journalDoc.meta.usageKind", ""] },
            ],
          },
          occurredAt: { $ifNull: ["$occurredAt", "$journalDoc.occurredAt"] },
        },
      },
    ];

    if (normalizedType === "EARN" || normalizedType === "ADJUST" || normalizedType === "PAYOUT") {
      pipeline.push({ $match: { type: normalizedType } });
    }

    if (rx) {
      pipeline.push({
        $match: {
          $or: [
            { uniqueKey: rx },
            { refType: rx },
            { requestIdMeta: rx },
            { displayLabel: rx },
            { usageKind: rx },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
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
          createdAt: "$occurredAt",
          creditKind: 1,
          eventType: "$journalDoc.eventType",
          displayLabel: 1,
          usageKind: 1,
        },
      },
    );

    const allRows = await LedgerLine.aggregate(pipeline);
    const displayCtx = await loadManufacturerLedgerDisplayContext(allRows);
    const groupedRows = groupManufacturerLedgerForDisplay(allRows, displayCtx);

    let totalBalance = 0;
    for (const r of groupedRows) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }
    const total = groupedRows.length;
    const startIdx = skip;
    const endIdx = skip + l;
    let skippedSum = 0;
    for (const r of groupedRows.slice(0, startIdx)) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }
    let runningBalance = totalBalance - skippedSum;
    const rows = groupedRows.slice(startIdx, endIdx).map((r) => {
      const v = Number(r?.amount || 0);
      const t = String(r?.type || "");
      const balanceAfter = runningBalance;
      if (t === "EARN" || t === "ADJUST") runningBalance -= v;
      else if (t === "PAYOUT") runningBalance += v;
      return { ...r, balanceAfter };
    });

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
      ...buildManufacturerEarnCollapseAndGroupStages({ groupByYmd: false }),
      {
        $project: {
          _id: 0,
          earnRequestPaidAmount: 1,
          earnRequestFreeAmount: 1,
          earnRequestPaidTotal: 1,
          earnRequestFreeTotal: 1,
          earnRequestPaidCount: 1,
          earnRequestFreeCount: 1,
          earnShippingPaidAmount: 1,
          earnShippingFreeAmount: 1,
          earnShippingPaidTotal: 1,
          earnShippingFreeTotal: 1,
          earnShippingPaidCount: 1,
          earnShippingFreeCount: 1,
          payoutAmount: 1,
          adjustAmount: 1,
        },
      },
    ]);

    const requestTotal =
      Number(summary?.earnRequestPaidTotal || 0);
    const shippingTotal =
      Number(summary?.earnShippingPaidTotal || 0);
    const sums = {
      earnRequestAmount: requestTotal,
      earnRequestCount: Number(summary?.earnRequestPaidCount || 0),
      earnShippingAmount: shippingTotal,
      earnShippingCount: Number(summary?.earnShippingPaidCount || 0),
      refundAmount: 0,
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
      ...buildManufacturerEarnCollapseAndGroupStages({ groupByYmd: true }),
      {
        $project: {
          _id: 0,
          ymd: "$_id",
          earnRequestPaidAmount: 1,
          earnRequestPaidVat: 1,
          earnRequestPaidTotal: 1,
          earnRequestPaidCount: 1,
          earnRequestFreeAmount: 1,
          earnRequestFreeVat: 1,
          earnRequestFreeTotal: 1,
          earnRequestFreeCount: 1,
          earnShippingPaidAmount: 1,
          earnShippingPaidVat: 1,
          earnShippingPaidTotal: 1,
          earnShippingPaidCount: 1,
          earnShippingFreeAmount: 1,
          earnShippingFreeVat: 1,
          earnShippingFreeTotal: 1,
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
      earnRequestVat: 0,
      earnRequestTotal: 0,
      earnShippingAmount: 0,
      earnShippingCount: 0,
      earnShippingVat: 0,
      earnShippingTotal: 0,
      refundAmount: 0,
      payoutAmount: 0,
      adjustAmount: 0,
      netAmount: 0,
      netPaidAmount: 0,
      netPayoutAmount: 0,
      netFreeRequestAmount: 0,
      netFreeShippingAmount: 0,
      netFreeAmount: 0,
      earnRequestPaidAmount: 0,
      earnRequestPaidVat: 0,
      earnRequestPaidTotal: 0,
      earnRequestPaidCount: 0,
      earnRequestFreeAmount: 0,
      earnRequestFreeVat: 0,
      earnRequestFreeTotal: 0,
      earnRequestFreeCount: 0,
      earnShippingPaidAmount: 0,
      earnShippingPaidVat: 0,
      earnShippingPaidTotal: 0,
      earnShippingPaidCount: 0,
      earnShippingFreeAmount: 0,
      earnShippingFreeVat: 0,
      earnShippingFreeTotal: 0,
      earnShippingFreeCount: 0,
    });

    const recomputeNetAmount = (targetRow) => {
      const requestSupply =
        Number(targetRow.earnRequestPaidAmount || 0) +
        Number(targetRow.earnRequestFreeAmount || 0);
      const requestVat =
        Number(targetRow.earnRequestPaidVat || 0) +
        Number(targetRow.earnRequestFreeVat || 0);
      const requestTotal =
        Number(targetRow.earnRequestPaidTotal || 0) +
        Number(targetRow.earnRequestFreeTotal || 0) ||
        requestSupply + requestVat;
      const shippingSupply =
        Number(targetRow.earnShippingPaidAmount || 0) +
        Number(targetRow.earnShippingFreeAmount || 0);
      const shippingVat =
        Number(targetRow.earnShippingPaidVat || 0) +
        Number(targetRow.earnShippingFreeVat || 0);
      const shippingTotal =
        Number(targetRow.earnShippingPaidTotal || 0) +
        Number(targetRow.earnShippingFreeTotal || 0) ||
        shippingSupply + shippingVat;

      // 표시용 총액(유료+무료). 지급 순액은 유료만.
      targetRow.earnRequestAmount = requestSupply;
      targetRow.earnRequestVat = requestVat;
      targetRow.earnRequestTotal = requestTotal;
      targetRow.earnRequestCount =
        Number(targetRow.earnRequestPaidCount || 0) +
        Number(targetRow.earnRequestFreeCount || 0);
      targetRow.earnShippingAmount = shippingSupply;
      targetRow.earnShippingVat = shippingVat;
      targetRow.earnShippingTotal = shippingTotal;
      targetRow.earnShippingCount =
        Number(targetRow.earnShippingPaidCount || 0) +
        Number(targetRow.earnShippingFreeCount || 0);

      const paidRequestTotal =
        Number(targetRow.earnRequestPaidTotal || 0) ||
        Number(targetRow.earnRequestPaidAmount || 0) +
          Number(targetRow.earnRequestPaidVat || 0);
      const paidShippingTotal =
        Number(targetRow.earnShippingPaidTotal || 0) ||
        Number(targetRow.earnShippingPaidAmount || 0) +
          Number(targetRow.earnShippingPaidVat || 0);

      const payoutEligibleTotal =
        paidRequestTotal +
        paidShippingTotal +
        Number(targetRow.refundAmount || 0) +
        Number(targetRow.payoutAmount || 0) +
        Number(targetRow.adjustAmount || 0);

      const freeRequestNet = Number(targetRow.earnRequestFreeAmount || 0);
      const freeShippingNet = Number(targetRow.earnShippingFreeAmount || 0);

      // 지급 순액: 유료만(VAT 포함). 무료는 표시·확인용.
      targetRow.netPayoutAmount = payoutEligibleTotal;
      targetRow.netPaidAmount = payoutEligibleTotal;
      targetRow.netFreeRequestAmount = freeRequestNet;
      targetRow.netFreeShippingAmount = freeShippingNet;
      targetRow.netFreeAmount = freeRequestNet + freeShippingNet;
      targetRow.netAmount = payoutEligibleTotal;
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

    const todayYmd = getTodayYmdInKst();
    const requestedEndYmd =
      typeof toYmd === "string" && toYmd.trim() ? toYmd.trim() : todayYmd;
    // 미도래 일자 빈 행 금지: toYmd가 미래여도 KST 오늘까지만 채운다.
    const endYmd =
      todayYmd && requestedEndYmd > todayYmd ? todayYmd : requestedEndYmd;
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
      if (todayYmd && ymd > todayYmd) continue;
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
