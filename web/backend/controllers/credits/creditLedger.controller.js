// related files:
// - web/backend/rules.md
// - web/backend/modules/credits/creditLedger.routes.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/creditBalance.service.js
import mongoose from "mongoose";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildRequestSummary(doc) {
  if (!doc?._id) return null;
  const caseInfos = doc?.caseInfos || {};
  return {
    requestId: String(doc.requestId || ""),
    manufacturerStage: String(doc.manufacturerStage || ""),
    patientName: String(caseInfos.patientName || ""),
    tooth: String(caseInfos.tooth || ""),
    clinicName: String(caseInfos.clinicName || ""),
    lotNumber: {
      value: String(doc?.lotNumber?.value || ""),
    },
    caseInfos: {
      clinicName: String(caseInfos.clinicName || ""),
      patientName: String(caseInfos.patientName || ""),
      tooth: String(caseInfos.tooth || ""),
      implantManufacturer: String(caseInfos.implantManufacturer || ""),
      implantBrand: String(caseInfos.implantBrand || ""),
      implantFamily: String(caseInfos.implantFamily || ""),
      implantType: String(caseInfos.implantType || ""),
      maxDiameter: normalizeNumber(caseInfos.maxDiameter),
      connectionDiameter: normalizeNumber(caseInfos.connectionDiameter),
    },
  };
}

function parsePeriod(period) {
  const p = String(period || "").trim();
  if (!p || p === "all") return null;

  // KST 기준 N일 전 계산
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T00:00:00+09:00`);

  if (p === "7d") {
    todayKst.setDate(todayKst.getDate() - 7);
    return todayKst;
  }
  if (p === "30d") {
    todayKst.setDate(todayKst.getDate() - 30);
    return todayKst;
  }
  if (p === "90d") {
    todayKst.setDate(todayKst.getDate() - 90);
    return todayKst;
  }
  return null;
}

function safeRegex(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function parseFreeCreditGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "").trim().replace(/^gl:/, "");
  const m = raw.match(/^free_credit_grant:([a-f0-9]{24})$/i);
  return m ? m[1] : "";
}

export async function listMyCreditLedger(req, res) {
  const businessAnchorId = req.user?.businessAnchorId;

  if (!businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const anchorObjectId = new mongoose.Types.ObjectId(String(businessAnchorId));

  const typeRaw = String(req.query.type || "").trim().toUpperCase();
  const periodRaw = String(req.query.period || "").trim();
  const qRaw = String(req.query.q || "").trim();

  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50) || 50));

  const balanceSnapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId: anchorObjectId,
    upsertIfMissing: true,
  });
  const currentBalance = Number(balanceSnapshot?.balance || 0);

  const occurredAt = {};
  const sinceFromPeriod = parsePeriod(periodRaw);
  if (sinceFromPeriod) occurredAt.$gte = sinceFromPeriod;

  const fromRaw = String(req.query.from || "").trim();
  const toRaw = String(req.query.to || "").trim();

  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) occurredAt.$gte = from;
  }
  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) occurredAt.$lte = to;
  }

  let requestIdSearchObjectId = null;
  const looksLikeRequestId = /^\d{8}-\d{6}$/.test(qRaw);
  if (looksLikeRequestId) {
    const requestDoc = await Request.findOne({ requestId: qRaw }).select({ _id: 1 }).lean();
    if (requestDoc?._id) {
      requestIdSearchObjectId = new mongoose.Types.ObjectId(String(requestDoc._id));
    }
  }

  const match = {
    ownerRole: "requestor",
    ownerId: anchorObjectId,
    accountCode: {
      $in: ["REQ_PAID_CREDIT", "REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"],
    },
  };

  if (Object.keys(occurredAt).length) {
    match.occurredAt = occurredAt;
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
        eventType: { $ifNull: ["$journalDoc.eventType", ""] },
        amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
        uniqueKey: {
          $concat: [
            "gl:",
            {
              $ifNull: [
                "$journalDoc.meta.spendUniqueKey",
                { $ifNull: ["$journalDoc.idempotencyKey", "$journalId"] },
              ],
            },
          ],
        },
        requestIdMeta: { $ifNull: ["$journalDoc.meta.requestId", ""] },
      },
    },
    {
      $group: {
        _id: "$journalId",
        occurredAt: { $max: "$occurredAt" },
        createdAt: { $max: "$createdAt" },
        eventType: { $first: "$eventType" },
        refType: { $first: "$refType" },
        refId: { $first: "$refId" },
        uniqueKey: { $first: "$uniqueKey" },
        amount: { $sum: "$amountBase" },
        spentPaidAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ["$eventType", ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"]] },
                  { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                  { $lt: ["$amountBase", 0] },
                ],
              },
              { $abs: "$amountBase" },
              0,
            ],
          },
        },
        spentFreeAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ["$eventType", ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"]] },
                  {
                    $in: [
                      "$accountCode",
                      ["REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"],
                    ],
                  },
                  { $lt: ["$amountBase", 0] },
                ],
              },
              { $abs: "$amountBase" },
              0,
            ],
          },
        },
      },
    },
    {
      $addFields: {
        type: {
          $switch: {
            branches: [
              { case: { $eq: ["$eventType", "CHARGE_PAID"] }, then: "CHARGE_PAID" },
              {
                case: { $eq: ["$eventType", "CHARGE_FREE_REQUEST"] },
                then: "CHARGE_FREE_REQUEST",
              },
              {
                case: { $eq: ["$eventType", "CHARGE_FREE_SHIPPING"] },
                then: "CHARGE_FREE_SHIPPING",
              },
              {
                case: {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"],
                      ],
                    },
                    { $gt: ["$spentPaidAmount", 0] },
                  ],
                },
                then: "SPEND_PAID",
              },
              {
                case: { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                then: "SPEND_FREE_REQUEST",
              },
              {
                case: { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                then: "SPEND_FREE_SHIPPING",
              },
              { case: { $eq: ["$eventType", "ADJUST"] }, then: "ADJUST" },
            ],
            default: "ADJUST",
          },
        },
      },
    },
  ];

  if (
    typeRaw &&
    typeRaw !== "ALL" &&
    [
      "CHARGE_PAID",
      "CHARGE_FREE_REQUEST",
      "CHARGE_FREE_SHIPPING",
      "SPEND_PAID",
      "SPEND_FREE_REQUEST",
      "SPEND_FREE_SHIPPING",
      "ADJUST",
    ].includes(typeRaw)
  ) {
    pipeline.push({ $match: { type: typeRaw } });
  }

  if (qRaw) {
    const rx = safeRegex(qRaw);
    const ors = [];
    if (rx) {
      ors.push({ uniqueKey: rx }, { refType: rx }, { requestIdMeta: rx });
    }
    if (mongoose.Types.ObjectId.isValid(qRaw)) {
      ors.push({ refId: new mongoose.Types.ObjectId(qRaw) });
    }
    if (requestIdSearchObjectId) {
      ors.push({ refId: requestIdSearchObjectId });
    }
    if (ors.length) {
      pipeline.push({ $match: { $or: ors } });
    }
  }

  pipeline.push({ $sort: { occurredAt: -1, _id: -1 } });

  const allRows = await LedgerLine.aggregate(pipeline);
  const total = Array.isArray(allRows) ? allRows.length : 0;
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  let skippedSum = 0;
  for (const row of allRows.slice(0, startIdx)) {
    skippedSum += Number(row?.amount || 0);
  }

  let runningBalance = currentBalance - skippedSum;
  const items = allRows.slice(startIdx, endIdx).map((row) => {
    const balanceAfter = runningBalance;
    runningBalance -= Number(row?.amount || 0);
    return {
      _id: String(row?._id || ""),
      type: String(row?.type || "ADJUST"),
      amount: Number(row?.amount || 0),
      spentPaidAmount: Number(row?.spentPaidAmount || 0),
      spentFreeAmount: Number(row?.spentFreeAmount || 0),
      refType: String(row?.refType || ""),
      refId: row?.refId ? String(row.refId) : "",
      uniqueKey: String(row?.uniqueKey || ""),
      createdAt: row?.occurredAt || row?.createdAt || new Date(),
      balanceAfter,
    };
  });

  const requestRefIds = Array.from(
    new Set(
      items
        .filter(
          (it) =>
            String(it?.refType || "") === "REQUEST" &&
            it?.refId &&
            mongoose.Types.ObjectId.isValid(String(it.refId)),
        )
        .map((it) => String(it.refId)),
    ),
  );

  const shippingPackageRefIds = Array.from(
    new Set(
      items
        .filter(
          (it) =>
            String(it?.refType || "") === "SHIPPING_PACKAGE" &&
            it?.refId &&
            mongoose.Types.ObjectId.isValid(String(it.refId)),
        )
        .map((it) => String(it.refId)),
    ),
  );

  const freeCreditGrantIds = Array.from(
    new Set(
      items
        .map((it) => parseFreeCreditGrantIdFromUniqueKey(it?.uniqueKey))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  );

  const refRequestIdById = new Map();
  const refRequestSummaryById = new Map();
  if (requestRefIds.length > 0) {
    const requestDocs = await Request.find({
      _id: { $in: requestRefIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select({
        _id: 1,
        requestId: 1,
        manufacturerStage: 1,
        lotNumber: 1,
        "caseInfos.patientName": 1,
        "caseInfos.tooth": 1,
        "caseInfos.clinicName": 1,
        "caseInfos.implantManufacturer": 1,
        "caseInfos.implantBrand": 1,
        "caseInfos.implantFamily": 1,
        "caseInfos.implantType": 1,
        "caseInfos.maxDiameter": 1,
        "caseInfos.connectionDiameter": 1,
      })
      .lean();

    for (const doc of requestDocs || []) {
      if (doc?._id) {
        refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
        refRequestSummaryById.set(String(doc._id), buildRequestSummary(doc));
      }
    }
  }

  const shippingTrackingNumbersByPackageId = new Map();
  if (shippingPackageRefIds.length > 0) {
    const packageDocs = await ShippingPackage.find({
      _id: {
        $in: shippingPackageRefIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select({ _id: 1, requestIds: 1 })
      .lean();

    const requestIdSet = new Set();
    for (const pkg of packageDocs || []) {
      for (const requestId of pkg?.requestIds || []) {
        if (requestId) requestIdSet.add(String(requestId));
      }
    }

    const deliveryInfoByRequestId = new Map();
    if (requestIdSet.size > 0) {
      const deliveryInfos = await DeliveryInfo.find({
        request: {
          $in: Array.from(requestIdSet).map((id) => new mongoose.Types.ObjectId(id)),
        },
      })
        .select({ request: 1, trackingNumber: 1 })
        .lean();

      for (const delivery of deliveryInfos || []) {
        if (delivery?.request) {
          deliveryInfoByRequestId.set(
            String(delivery.request),
            String(delivery.trackingNumber || ""),
          );
        }
      }
    }

    for (const pkg of packageDocs || []) {
      const trackingNumbers = Array.from(
        new Set(
          (pkg?.requestIds || [])
            .map((requestId) => deliveryInfoByRequestId.get(String(requestId)) || "")
            .filter(Boolean),
        ),
      );
      shippingTrackingNumbersByPackageId.set(String(pkg._id), trackingNumbers);
    }
  }

  const freeReasonByGrantId = new Map();
  if (freeCreditGrantIds.length > 0) {
    const grants = await FreeCreditGrant.find({
      _id: {
        $in: freeCreditGrantIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select({ _id: 1, type: 1, source: 1, overrideReason: 1, businessNumber: 1 })
      .lean();

    for (const grant of grants || []) {
      if (!grant?._id) continue;
      const source = String(grant.source || "");
      const overrideReason = String(grant.overrideReason || "").trim();
      const businessNumber = String(grant.businessNumber || "").trim();
      const grantType = String(grant.type || "").trim().toUpperCase();
      let reason = "환영 무료 의뢰크레딧";
      if (grantType === "SHIPPING_FREE_CREDIT") {
        reason = "환영 무료 배송크레딧";
      }
      if (source === "admin" && overrideReason) {
        reason = `관리자 지급 · ${overrideReason}`;
      } else if (source === "migrated") {
        reason = `시드/마이그레이션 ${reason}`;
      }
      if (businessNumber) {
        reason = `${reason} · 사업자번호 ${businessNumber}`;
      }
      freeReasonByGrantId.set(String(grant._id), reason);
    }
  }

  const enrichedItems = items.map((it) => {
    const refType = String(it?.refType || "");
    if (refType === "REQUEST") {
      const refId = it?.refId ? String(it.refId) : "";
      const refRequestId = refId ? refRequestIdById.get(refId) || "" : "";
      const requestSummary = refId ? refRequestSummaryById.get(refId) || null : null;
      return {
        ...it,
        refRequestId,
        refRequestSummary: requestSummary,
        patientName: requestSummary?.patientName || "",
        tooth: requestSummary?.tooth || "",
        clinicName: requestSummary?.clinicName || "",
        manufacturerStage: requestSummary?.manufacturerStage || "",
        lotNumber: requestSummary?.lotNumber || null,
        caseInfos: requestSummary?.caseInfos || null,
      };
    }

    if (refType === "SHIPPING_PACKAGE") {
      const refId = it?.refId ? String(it.refId) : "";
      return {
        ...it,
        trackingNumbers: refId
          ? shippingTrackingNumbersByPackageId.get(refId) || []
          : [],
      };
    }

    const grantId = parseFreeCreditGrantIdFromUniqueKey(it?.uniqueKey);
    if (grantId) {
      const freeReason = freeReasonByGrantId.get(grantId) || "";
      return {
        ...it,
        freeReason,
      };
    }

    return it;
  });

  return res.json({
    success: true,
    data: {
      items: enrichedItems,
      total,
      page,
      pageSize,
      currentBalanceSnapshot: {
        paidCredit: Number(balanceSnapshot?.paidCredit || 0),
        freeRequestCredit: Number(balanceSnapshot?.freeRequestCredit || 0),
        freeShippingCredit: Number(balanceSnapshot?.freeShippingCredit || 0),
        balance: Number(balanceSnapshot?.balance || 0),
      },
    },
  });
}
