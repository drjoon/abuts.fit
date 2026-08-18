// change-log:
// - 2026-08-19: 기공의뢰 견적 열 — 보철기공비|어벗 디자인+생산비(둘 다 기공비). 원청/하청 수수료 분기.
// - 2026-08-17: PTX 디자인비(+지그)를 기공의뢰 행으로 승격(보철기공비와 동일 의뢰건).
// - 2026-08-17: PRACTICE_TRANSFER enrich — transferMemo(크레딧 상세 주문일·도착일·메모).
// - 2026-08-17: PRACTICE_TRANSFER enrich — feeQuote·skipJig(크레딧 행 클릭 상세 모달).
// - 2026-08-17: PRACTICE_TRANSFER enrich — lab/abutment pending·holdShare(기공소/어벗츠 행 분리).
// - 2026-08-17: PRACTICE_TRANSFER enrich에 practiceTransferPending(heldAt·!settledAt).
// - 2026-08-12: currentBalanceSnapshot에 settlementCredit·requestorKind 포함(기공소 기공크레딧 UI).
// related files:
// - web/backend/rules.md
// - web/backend/modules/credits/creditLedger.routes.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/credits/creditLedger.utils.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/utils/requestorCapabilities.js
import mongoose from "mongoose";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import { buildFeeQuotesForTransferDocs } from "../../services/practiceTransferBilling.service.js";
import { healMissingExpressSurchargesForBusiness } from "../requests/common.review.helpers.js";
import { normalizeRequestorKind } from "../../utils/requestorCapabilities.js";
import {
  buildCreditLedgerRequestSummary,
  buildFreeCreditGrantReason,
  buildLedgerItemsWithBucketBalanceAfter,
  collectPracticeTransferLookupIds,
  CREDIT_LEDGER_DESIGN_FEE_AS_SETTLEMENT_CASE,
  CREDIT_LEDGER_RELATED_PTX_ID_EXPR,
  CREDIT_LEDGER_REQUEST_SELECT,
  CREDIT_LEDGER_SOURCE_EXPR,
  isAbutmentDesignLabFeeLedgerRow,
  mergeRequestExpressSurchargeIntoMachiningSpend,
  parseSpendKindFromUniqueKey,
  promoteAbutmentDesignFeeToPracticeTransfer,
  resolveFreeCreditGrantIdFromLedgerItem,
  resolveLedgerTypesForFilters,
} from "./creditLedger.utils.js";

async function resolveRequestorKindForAnchor(businessAnchorId, fallbackKind) {
  const anchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ requestorKind: 1 })
    .lean();
  return (
    normalizeRequestorKind(anchor?.requestorKind) ||
    normalizeRequestorKind(fallbackKind) ||
    null
  );
}

function buildCurrentBalanceSnapshot(balanceSnapshot, requestorKind) {
  const kind = normalizeRequestorKind(requestorKind) || null;
  const isLab = kind === "lab";
  const freeRequestCredit = Number(balanceSnapshot?.freeRequestCredit || 0);
  const freeShippingCredit = Number(balanceSnapshot?.freeShippingCredit || 0);
  const freeCredit = Number(
    balanceSnapshot?.freeCredit ?? freeRequestCredit + freeShippingCredit,
  );
  return {
    paidCredit: Number(balanceSnapshot?.paidCredit || 0),
    freeRequestCredit,
    freeShippingCredit,
    freeCredit,
    // 기공정산크레딧은 기공소 전용 버킷. 치과 응답에도 숫자는 포함하되 UI는 requestorKind로 숨긴다.
    settlementCredit: Number(balanceSnapshot?.settlementCredit || 0),
    balance: Number(balanceSnapshot?.balance || 0),
    spendableBalance: Number(
      balanceSnapshot?.spendableBalance ??
        Number(balanceSnapshot?.balance || 0) +
          Number(balanceSnapshot?.settlementCredit || 0),
    ),
    requestorKind: kind,
    showSettlementCredit: isLab,
  };
}

function buildRequestSummary(doc) {
  return buildCreditLedgerRequestSummary(doc);
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

/** idempotencyKey가 이미 gl:면 이중 접두를 만들지 않는다. */
function buildLedgerUniqueKeyExpr() {
  return {
    $let: {
      vars: {
        rawKey: {
          $ifNull: [
            "$journalDoc.meta.spendUniqueKey",
            { $ifNull: ["$journalDoc.idempotencyKey", "$journalId"] },
          ],
        },
      },
      in: {
        $cond: [
          {
            $eq: [{ $substrBytes: ["$$rawKey", 0, 3] }, "gl:"],
          },
          "$$rawKey",
          { $concat: ["gl:", "$$rawKey"] },
        ],
      },
    },
  };
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
  const creditKindRaw = String(req.query.creditKind || "").trim().toUpperCase();
  const actionRaw = String(req.query.action || "").trim().toUpperCase();
  const periodRaw = String(req.query.period || "").trim();
  const qRaw = String(req.query.q || "").trim();

  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50) || 50));

  // 신속배송 추가비 누락 보정: 가공 진입 후 express_surcharge 미차감 건을 보완한다.
  try {
    await healMissingExpressSurchargesForBusiness({
      businessAnchorId: anchorObjectId,
      actorUserId: req.user?._id || null,
      limit: 30,
    });
  } catch (healErr) {
    console.error("[CREDIT_LEDGER] healMissingExpressSurcharges failed", {
      businessAnchorId: String(anchorObjectId),
      message: healErr?.message || String(healErr || ""),
    });
  }

  const [balanceSnapshot, requestorKind] = await Promise.all([
    getBusinessCreditBalanceSnapshot({
      businessAnchorId: anchorObjectId,
      upsertIfMissing: true,
    }),
    resolveRequestorKindForAnchor(anchorObjectId, req.user?.requestorKind),
  ]);
  const currentBalance = Number(balanceSnapshot?.balance || 0);
  const currentSettlementCredit = Number(balanceSnapshot?.settlementCredit || 0);

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
      $in: [
        "REQ_PAID_CREDIT",
        "REQ_FREE_REQUEST_CREDIT",
        "REQ_FREE_SHIPPING_CREDIT",
        "LAB_SETTLEMENT_CREDIT",
      ],
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
        uniqueKey: buildLedgerUniqueKeyExpr(),
        requestIdMeta: { $ifNull: ["$journalDoc.meta.requestId", ""] },
        displayLabel: {
          $ifNull: [
            "$meta.displayLabel",
            { $ifNull: ["$journalDoc.meta.displayLabel", ""] },
          ],
        },
        holdShare: {
          $ifNull: [
            "$meta.holdShare",
            { $ifNull: ["$journalDoc.meta.holdShare", ""] },
          ],
        },
        relatedPracticeTransferId: CREDIT_LEDGER_RELATED_PTX_ID_EXPR,
        ledgerSource: CREDIT_LEDGER_SOURCE_EXPR,
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
        displayLabel: { $first: "$displayLabel" },
        holdShare: { $first: "$holdShare" },
        relatedPracticeTransferId: { $first: "$relatedPracticeTransferId" },
        ledgerSource: { $first: "$ledgerSource" },
        amount: { $sum: "$amountBase" },
        spentPaidAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $in: [
                      "$eventType",
                      [
                        "REQUEST_SPEND_COMMIT",
                        "REQUEST_SPEND_HOLD",
                        "SHIPPING_SPEND_COMMIT",
                        "SHIPPING_SPEND_HOLD",
                        "PRACTICE_TRANSFER_SPEND_COMMIT",
                        "PRACTICE_TRANSFER_SPEND_HOLD",
                        "PRACTICE_TRANSFER_HOLD_ADJUST",
                        "PRACTICE_MEMBERSHIP_SPEND",
                      ],
                    ],
                  },
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
                  {
                    $in: [
                      "$eventType",
                      [
                        "REQUEST_SPEND_COMMIT",
                        "REQUEST_SPEND_HOLD",
                        "SHIPPING_SPEND_COMMIT",
                        "SHIPPING_SPEND_HOLD",
                        "PRACTICE_TRANSFER_SPEND_COMMIT",
                        "PRACTICE_TRANSFER_SPEND_HOLD",
                        "PRACTICE_TRANSFER_HOLD_ADJUST",
                      ],
                    ],
                  },
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
        spentSettlementAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $in: [
                      "$eventType",
                      ["REQUEST_SPEND_COMMIT", "REQUEST_SPEND_HOLD", "SHIPPING_SPEND_COMMIT", "SHIPPING_SPEND_HOLD"],
                    ],
                  },
                  { $eq: ["$accountCode", "LAB_SETTLEMENT_CREDIT"] },
                  { $lt: ["$amountBase", 0] },
                ],
              },
              { $abs: "$amountBase" },
              0,
            ],
          },
        },
        accountCode: { $first: "$accountCode" },
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
                  $in: [
                    "$eventType",
                    [
                      "PRACTICE_TRANSFER_SPEND_HOLD",
                      "PRACTICE_TRANSFER_HOLD_ADJUST",
                      "REQUEST_SPEND_HOLD",
                      "SHIPPING_SPEND_HOLD",
                    ],
                  ],
                },
                then: "SPEND_HOLD",
              },
              {
                case: {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        [
                          "REQUEST_SPEND_COMMIT",
                          "SHIPPING_SPEND_COMMIT",
                          "PRACTICE_TRANSFER_SPEND_COMMIT",
                          "PRACTICE_MEMBERSHIP_SPEND",
                        ],
                      ],
                    },
                    { $gt: ["$spentPaidAmount", 0] },
                  ],
                },
                then: "SPEND_PAID",
              },
              {
                case: {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        ["REQUEST_SPEND_COMMIT", "REQUEST_SPEND_HOLD", "SHIPPING_SPEND_COMMIT", "SHIPPING_SPEND_HOLD"],
                      ],
                    },
                    { $gt: ["$spentSettlementAmount", 0] },
                  ],
                },
                then: "SPEND_SETTLEMENT",
              },
              {
                case: {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        [
                          "REQUEST_SPEND_COMMIT",
                          "PRACTICE_TRANSFER_SPEND_COMMIT",
                        ],
                      ],
                    },
                    { $gt: ["$spentFreeAmount", 0] },
                  ],
                },
                then: "SPEND_FREE_REQUEST",
              },
              {
                case: { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                then: "SPEND_FREE_REQUEST",
              },
              {
                case: { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                then: "SPEND_FREE_SHIPPING",
              },
              {
                case: { $eq: ["$eventType", "LAB_SETTLEMENT_CHARGE"] },
                then: "LAB_SETTLEMENT_CHARGE",
              },
              {
                case: {
                  $eq: ["$eventType", "PRACTICE_TRANSFER_LAB_PLATFORM_FEE"],
                },
                then: "SPEND_SETTLEMENT",
              },
              {
                case: { $eq: ["$eventType", "SETTLEMENT_PAYOUT"] },
                then: "LAB_SETTLEMENT_PAYOUT",
              },
              {
                case: {
                  $and: [
                    {
                      $in: [
                        "$eventType",
                        [
                          "PRACTICE_TRANSFER_SPEND_COMMIT",
                          "PRACTICE_TRANSFER_ESCROW_RELEASE",
                        ],
                      ],
                    },
                    { $gt: ["$amount", 0] },
                  ],
                },
                then: "LAB_SETTLEMENT_CHARGE",
              },
              CREDIT_LEDGER_DESIGN_FEE_AS_SETTLEMENT_CASE,
              { case: { $eq: ["$eventType", "ADJUST"] }, then: "ADJUST" },
            ],
            default: "ADJUST",
          },
        },
      },
    },
  ];

  const filterTypes = resolveLedgerTypesForFilters({
    creditKind: creditKindRaw,
    action: actionRaw,
    type: typeRaw,
  });
  if (Array.isArray(filterTypes)) {
    pipeline.push({
      $match: { type: { $in: filterTypes.length ? filterTypes : ["__none__"] } },
    });
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

  const allRowsRaw = await LedgerLine.aggregate(pipeline);
  const allRows = mergeRequestExpressSurchargeIntoMachiningSpend(allRowsRaw);
  const total = Array.isArray(allRows) ? allRows.length : 0;
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  const items = buildLedgerItemsWithBucketBalanceAfter({
    rows: allRows,
    startIdx,
    endIdx,
    spendableBalance: currentBalance,
    settlementBalance: currentSettlementCredit,
    mapRow: (row, base) => {
      const uniqueKey = String(row?.uniqueKey || base.uniqueKey || "");
      return {
        ...base,
        uniqueKey,
        displayLabel: String(row?.displayLabel || "").trim() || null,
        holdShare: String(row?.holdShare || "").trim() || null,
        relatedPracticeTransferId: row?.relatedPracticeTransferId
          ? String(row.relatedPracticeTransferId)
          : null,
        ledgerSource: String(row?.ledgerSource || "").trim() || null,
        spendKind:
          row?.spendKind || parseSpendKindFromUniqueKey(uniqueKey) || null,
        includesExpressSurcharge: Boolean(row?.includesExpressSurcharge),
      };
    },
  });

  const requestRefIds = Array.from(
    new Set(
      items
        .filter(
          (it) =>
            String(it?.refType || "") === "REQUEST" &&
            !isAbutmentDesignLabFeeLedgerRow(it) &&
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

  const practiceTransferRefIds = collectPracticeTransferLookupIds(items).filter(
    (id) => mongoose.Types.ObjectId.isValid(id),
  );

  const freeCreditGrantIds = Array.from(
    new Set(
      items
        .map((it) => resolveFreeCreditGrantIdFromLedgerItem(it))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  );

  const refRequestIdById = new Map();
  const refRequestSummaryById = new Map();
  if (requestRefIds.length > 0) {
    const requestDocs = await Request.find({
      _id: { $in: requestRefIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select(CREDIT_LEDGER_REQUEST_SELECT)
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

  const practiceTransferIdById = new Map();
  const practiceTransferMetaById = new Map();
  if (practiceTransferRefIds.length > 0) {
    const transferDocs = await PracticeTransfer.find({
      _id: {
        $in: practiceTransferRefIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select({
        _id: 1,
        transferId: 1,
        targetLabName: 1,
        targetLabAnchorId: 1,
        assigneeLabAnchorId: 1,
        practiceBusinessAnchorId: 1,
        matchingMode: 1,
        transferMemo: 1,
        files: 1,
        toothWorks: 1,
        billing: 1,
        "production.skipJig": 1,
        "production.rushProcessing": 1,
        autoMatch: 1,
      })
      .lean();

    const quotesById = await buildFeeQuotesForTransferDocs({
      docs: transferDocs,
      viewingLabAnchorId:
        String(requestorKind || "").trim() === "lab"
          ? String(anchorObjectId)
          : null,
    });

    for (const doc of transferDocs || []) {
      if (!doc?._id) continue;
      const id = String(doc._id);
      const memo = String(doc.transferMemo || "");
      const memoPatient = String(
        memo.match(/\[\s*환자명\s*:\s*([^\]]*)\]/)?.[1] || "",
      ).trim();
      const filePatient = String(
        (Array.isArray(doc.files) ? doc.files : [])
          .map((f) => String(f?.patientName || "").trim())
          .find(Boolean) || "",
      ).trim();
      const heldAt = doc?.billing?.heldAt || null;
      const settledAt = doc?.billing?.settledAt || null;
      const labSettledAt = doc?.billing?.labSettledAt || null;
      const abutmentSettledAt = doc?.billing?.abutmentSettledAt || null;
      const fullySettled = Boolean(settledAt);
      const skipJigRaw = doc?.production?.skipJig;
      practiceTransferIdById.set(id, String(doc.transferId || ""));
      practiceTransferMetaById.set(id, {
        patientName: memoPatient || filePatient,
        labName: String(doc.targetLabName || "").trim(),
        transferMemo: memo,
        practiceTransferPending: Boolean(heldAt) && !fullySettled,
        practiceTransferLabPending:
          Boolean(heldAt) && !fullySettled && !labSettledAt,
        practiceTransferAbutmentPending:
          Boolean(heldAt) && !fullySettled && !abutmentSettledAt,
        feeQuote: quotesById.get(id) || null,
        skipJig: !(
          skipJigRaw === false ||
          skipJigRaw === "false" ||
          skipJigRaw === 0 ||
          skipJigRaw === "0"
        ),
        rushProcessing: Boolean(doc?.production?.rushProcessing),
      });
    }
  }

  const freeReasonByGrantId = new Map();
  if (freeCreditGrantIds.length > 0) {
    const grants = await FreeCreditGrant.find({
      _id: {
        $in: freeCreditGrantIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select({ _id: 1, type: 1, source: 1, overrideReason: 1 })
      .lean();

    for (const grant of grants || []) {
      if (!grant?._id) continue;
      freeReasonByGrantId.set(
        String(grant._id),
        buildFreeCreditGrantReason(grant),
      );
    }
  }

  const enrichedItems = items.map((it) => {
    const relatedPtxId = String(it?.relatedPracticeTransferId || "").trim();
    const asPtxDesignFee =
      isAbutmentDesignLabFeeLedgerRow(it) &&
      relatedPtxId &&
      mongoose.Types.ObjectId.isValid(relatedPtxId);
    const refType = String(it?.refType || "");
    const ptxLookupId = asPtxDesignFee
      ? relatedPtxId
      : refType === "PRACTICE_TRANSFER"
        ? String(it?.refId || "")
        : "";

    if (ptxLookupId && mongoose.Types.ObjectId.isValid(ptxLookupId)) {
      const meta = practiceTransferMetaById.get(ptxLookupId) || null;
      const base = asPtxDesignFee
        ? promoteAbutmentDesignFeeToPracticeTransfer(it, ptxLookupId)
        : it;
      return {
        ...base,
        refPracticeTransferId: ptxLookupId
          ? practiceTransferIdById.get(ptxLookupId) || ""
          : "",
        patientName: meta?.patientName || "",
        labName: meta?.labName || "",
        transferMemo: meta?.transferMemo || "",
        practiceTransferPending: Boolean(meta?.practiceTransferPending),
        practiceTransferLabPending: Boolean(meta?.practiceTransferLabPending),
        practiceTransferAbutmentPending: Boolean(
          meta?.practiceTransferAbutmentPending,
        ),
        feeQuote: meta?.feeQuote || null,
        skipJig: meta?.skipJig !== false,
        rushProcessing: Boolean(meta?.rushProcessing),
      };
    }

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
        shippingMode: requestSummary?.shippingMode || "normal",
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

    const grantId = resolveFreeCreditGrantIdFromLedgerItem(it);
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
      currentBalanceSnapshot: buildCurrentBalanceSnapshot(
        balanceSnapshot,
        requestorKind,
      ),
    },
  });
}
