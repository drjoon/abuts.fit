// change-log:
// - 2026-08-21: PTX abuts_shipping enrich — BA+출고일 박스키(기공소 생산·배송 묶음).
// - 2026-08-19: 어벗디자인 박스 키=의뢰 사업자+예정출고일. 수신자는 의뢰 사업자명.
// - 2026-08-22: q 검색 — 기공소명·치과명으로 연결된 기공의뢰 refId 매칭.
// - 2026-08-19: 기본 내역은 10건+hasMore. 기간 전체 $count를 하지 않는다.
// - 2026-08-19: 원장 GET에서 신속비 보정을 기다리지 않음. 잔액·집계 병렬, enrich 병렬.
// - 2026-08-19: 어벗디자인 원장 — 수신자/박스 묶음용 mailbox·shippingPackage 메타.
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
import { scheduleHealMissingExpressSurchargesForBusiness } from "../requests/common.review.helpers.js";
import { normalizeRequestorKind } from "../../utils/requestorCapabilities.js";
import {
  attachCreditLedgerRequestFields,
  buildAbutmentBoxGroupKey,
  buildCreditLedgerRequestSummary,
  buildCreditLedgerShippingPackageMeta,
  hydrateCreditLedgerRequestorNames,
  buildFreeCreditGrantReason,
  buildLedgerItemsWithBucketBalanceAfter,
  collectPracticeTransferLookupIds,
  CREDIT_LEDGER_REQUEST_SELECT,
  isAbutmentDesignLabFeeLedgerRow,
  mergeRequestExpressSurchargeIntoMachiningSpend,
  parseCreditLedgerFacetResult,
  parseSpendKindFromUniqueKey,
  promoteAbutmentDesignFeeToPracticeTransfer,
  resolveFreeCreditGrantIdFromLedgerItem,
  resolveLedgerTypesForFilters,
  buildRequestorCreditLedgerPipeline,
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
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 10) || 10));

  // 신속비 누락 보정은 읽기 경로를 막지 않는다. 실제 차감 시 소켓으로 목록 재조회.
  scheduleHealMissingExpressSurchargesForBusiness({
    businessAnchorId: anchorObjectId,
    actorUserId: req.user?._id || null,
    limit: 30,
  });

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

  const filterTypes = resolveLedgerTypesForFilters({
    creditKind: creditKindRaw,
    action: actionRaw,
    type: typeRaw,
  });

  const searchOrs = [];
  if (qRaw) {
    const rx = safeRegex(qRaw);
    if (rx) {
      searchOrs.push({ uniqueKey: rx }, { refType: rx }, { requestIdMeta: rx });
    }
    if (mongoose.Types.ObjectId.isValid(qRaw)) {
      searchOrs.push({ refId: new mongoose.Types.ObjectId(qRaw) });
    }
    if (requestIdSearchObjectId) {
      searchOrs.push({ refId: requestIdSearchObjectId });
    }
    if (rx && qRaw.length >= 2) {
      const requestorKind = await resolveRequestorKindForAnchor(
        anchorObjectId,
        req.user?.requestorKind,
      );
      let ptxMatch = null;
      if (requestorKind === "practice") {
        ptxMatch = {
          practiceBusinessAnchorId: anchorObjectId,
          $or: [{ targetLabName: rx }, { assigneeLabName: rx }],
        };
      } else if (requestorKind === "lab") {
        const practiceAnchors = await BusinessAnchor.find({
          businessType: "requestor",
          $or: [{ name: rx }, { companyName: rx }],
        })
          .select({ _id: 1 })
          .limit(40)
          .lean();
        const practiceIds = practiceAnchors
          .map((row) => row?._id)
          .filter(Boolean);
        ptxMatch = {
          $and: [
            {
              $or: [
                { assigneeLabAnchorId: anchorObjectId },
                { targetLabAnchorId: anchorObjectId },
              ],
            },
            practiceIds.length
              ? { practiceBusinessAnchorId: { $in: practiceIds } }
              : { $or: [{ targetLabName: rx }, { assigneeLabName: rx }] },
          ],
        };
      }
      if (ptxMatch) {
        const partnerPtx = await PracticeTransfer.find(ptxMatch)
          .select({ _id: 1 })
          .limit(80)
          .lean();
        for (const doc of partnerPtx) {
          if (doc?._id) searchOrs.push({ refId: doc._id });
        }
      }
    }
  }

  const startIdx = (page - 1) * pageSize;
  const pipeline = buildRequestorCreditLedgerPipeline({
    ownerId: anchorObjectId,
    journalCollectionName: LedgerJournal.collection.name,
    occurredAt: Object.keys(occurredAt).length ? occurredAt : null,
    filterTypes,
    searchOrs,
    startIdx,
    pageSize,
  });

  const [balanceSnapshot, requestorKind, facetRaw] = await Promise.all([
    getBusinessCreditBalanceSnapshot({
      businessAnchorId: anchorObjectId,
      upsertIfMissing: true,
    }),
    resolveRequestorKindForAnchor(anchorObjectId, req.user?.requestorKind),
    LedgerLine.aggregate(pipeline),
  ]);
  const currentBalance = Number(balanceSnapshot?.balance || 0);
  const currentSettlementCredit = Number(balanceSnapshot?.settlementCredit || 0);

  const { hasMore, skippedSum, items: pageRows } =
    parseCreditLedgerFacetResult(facetRaw, { pageSize });
  const allRows = mergeRequestExpressSurchargeIntoMachiningSpend(pageRows);

  const items = buildLedgerItemsWithBucketBalanceAfter({
    rows: allRows,
    startIdx: 0,
    endIdx: allRows.length,
    spendableBalance: currentBalance,
    settlementBalance: currentSettlementCredit,
    skippedSum,
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

  const toObjectIds = (ids) =>
    ids.map((id) => new mongoose.Types.ObjectId(id));

  const [requestDocs, packageDocs, transferDocs, grants, ptxCaRequestDocs] =
    await Promise.all([
      requestRefIds.length
        ? Request.find({ _id: { $in: toObjectIds(requestRefIds) } })
            .select(CREDIT_LEDGER_REQUEST_SELECT)
            .lean()
        : Promise.resolve([]),
      shippingPackageRefIds.length
        ? ShippingPackage.find({
            _id: { $in: toObjectIds(shippingPackageRefIds) },
          })
            .select({ _id: 1, requestIds: 1, mailboxAddress: 1 })
            .lean()
        : Promise.resolve([]),
      practiceTransferRefIds.length
        ? PracticeTransfer.find({
            _id: { $in: toObjectIds(practiceTransferRefIds) },
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
            .lean()
        : Promise.resolve([]),
      freeCreditGrantIds.length
        ? FreeCreditGrant.find({ _id: { $in: toObjectIds(freeCreditGrantIds) } })
            .select({ _id: 1, type: 1, source: 1, overrideReason: 1 })
            .lean()
        : Promise.resolve([]),
      // PTX→어벗츠 배송 박스키용 CA Request(출고일)
      practiceTransferRefIds.length
        ? Request.find({
            "partnerBilling.relatedPracticeTransferId": {
              $in: toObjectIds(practiceTransferRefIds),
            },
          })
            .select({
              businessAnchorId: 1,
              "timeline.estimatedShipYmd": 1,
              "partnerBilling.relatedPracticeTransferId": 1,
            })
            .lean()
        : Promise.resolve([]),
    ]);

  const refRequestIdById = new Map();
  const refRequestSummaryById = new Map();
  for (const doc of requestDocs || []) {
    if (!doc?._id) continue;
    refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
    refRequestSummaryById.set(String(doc._id), buildRequestSummary(doc));
  }

  const requestIdSet = new Set();
  for (const pkg of packageDocs || []) {
    for (const requestId of pkg?.requestIds || []) {
      if (requestId) requestIdSet.add(String(requestId));
    }
  }
  const missingRequestIds = [...requestIdSet].filter(
    (id) =>
      !refRequestSummaryById.has(id) && mongoose.Types.ObjectId.isValid(id),
  );

  const [extraDocs, deliveryInfos, quotesById] = await Promise.all([
    missingRequestIds.length
      ? Request.find({ _id: { $in: toObjectIds(missingRequestIds) } })
          .select(CREDIT_LEDGER_REQUEST_SELECT)
          .lean()
      : Promise.resolve([]),
    requestIdSet.size
      ? DeliveryInfo.find({
          request: { $in: toObjectIds(Array.from(requestIdSet)) },
        })
          .select({ request: 1, trackingNumber: 1 })
          .lean()
      : Promise.resolve([]),
    (transferDocs || []).length
      ? buildFeeQuotesForTransferDocs({
          docs: transferDocs,
          viewingLabAnchorId:
            String(requestorKind || "").trim() === "lab"
              ? String(anchorObjectId)
              : null,
        })
      : Promise.resolve(new Map()),
  ]);

  for (const doc of extraDocs || []) {
    if (!doc?._id) continue;
    refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
    refRequestSummaryById.set(String(doc._id), buildRequestSummary(doc));
  }
  await hydrateCreditLedgerRequestorNames(refRequestSummaryById);

  const deliveryInfoByRequestId = new Map();
  for (const delivery of deliveryInfos || []) {
    if (delivery?.request) {
      deliveryInfoByRequestId.set(
        String(delivery.request),
        String(delivery.trackingNumber || ""),
      );
    }
  }

  const shippingPackageMetaById = buildCreditLedgerShippingPackageMeta({
    packageDocs,
    deliveryInfoByRequestId,
    requestSummaryById: refRequestSummaryById,
  });

  const practiceTransferIdById = new Map();
  const practiceTransferMetaById = new Map();
  /** PTX id → { labBa, estimatedShipYmd, abutmentBoxGroupKey } */
  const ptxAbutsBoxById = new Map();
  for (const ca of ptxCaRequestDocs || []) {
    const ptxId = String(ca?.partnerBilling?.relatedPracticeTransferId || "").trim();
    if (!ptxId || !mongoose.Types.ObjectId.isValid(ptxId)) continue;
    const labBa = String(ca?.businessAnchorId || "").trim();
    const ymd = String(ca?.timeline?.estimatedShipYmd || "").trim();
    const prev = ptxAbutsBoxById.get(ptxId);
    if (!prev) {
      ptxAbutsBoxById.set(ptxId, {
        labBa,
        estimatedShipYmd: ymd,
        abutmentBoxGroupKey: buildAbutmentBoxGroupKey({
          requestorBusinessAnchorId: labBa,
          estimatedShipYmd: ymd,
        }),
      });
      continue;
    }
    // 동일 PTX CA는 같은 출고일을 기대. 비어 있으면 채운다.
    if (!prev.estimatedShipYmd && ymd) {
      prev.estimatedShipYmd = ymd;
      prev.abutmentBoxGroupKey = buildAbutmentBoxGroupKey({
        requestorBusinessAnchorId: prev.labBa || labBa,
        estimatedShipYmd: ymd,
      });
    }
    if (!prev.labBa && labBa) prev.labBa = labBa;
  }
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
    const labBa =
      String(doc.assigneeLabAnchorId || doc.targetLabAnchorId || "").trim() ||
      ptxAbutsBoxById.get(id)?.labBa ||
      "";
    const boxMeta = ptxAbutsBoxById.get(id) || null;
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
      labBusinessAnchorId: labBa,
      estimatedShipYmd: boxMeta?.estimatedShipYmd || "",
      abutmentBoxGroupKey:
        boxMeta?.abutmentBoxGroupKey ||
        buildAbutmentBoxGroupKey({
          requestorBusinessAnchorId: labBa,
          estimatedShipYmd: boxMeta?.estimatedShipYmd || "",
        }),
    });
  }

  const freeReasonByGrantId = new Map();
  for (const grant of grants || []) {
    if (!grant?._id) continue;
    freeReasonByGrantId.set(String(grant._id), buildFreeCreditGrantReason(grant));
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
      const holdShare = String(base?.holdShare || it?.holdShare || "").trim();
      const isAbutsShippingHold =
        holdShare === "abuts_shipping" ||
        holdShare === "lab_shipping" ||
        String(base?.displayLabel || it?.displayLabel || "").includes(
          "기공소→어벗츠",
        );
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
        ...(isAbutsShippingHold
          ? {
              relatedPracticeTransferId:
                String(base?.relatedPracticeTransferId || "").trim() ||
                ptxLookupId,
              requestorBusinessAnchorId:
                meta?.labBusinessAnchorId ||
                String(base?.requestorBusinessAnchorId || "").trim(),
              estimatedShipYmd: meta?.estimatedShipYmd || "",
              abutmentBoxGroupKey: meta?.abutmentBoxGroupKey || "",
            }
          : {}),
      };
    }

    if (refType === "REQUEST") {
      const refId = it?.refId ? String(it.refId) : "";
      const refRequestId = refId ? refRequestIdById.get(refId) || "" : "";
      const requestSummary = refId ? refRequestSummaryById.get(refId) || null : null;
      return attachCreditLedgerRequestFields(it, requestSummary, refRequestId);
    }

    if (refType === "SHIPPING_PACKAGE") {
      const refId = it?.refId ? String(it.refId) : "";
      const pkgMeta = refId ? shippingPackageMetaById.get(refId) || null : null;
      return {
        ...it,
        trackingNumbers: pkgMeta?.trackingNumbers || [],
        mailboxAddress: pkgMeta?.mailboxAddress || "",
        shippingPackageId: refId,
        shippingReceiverGroupKey: pkgMeta?.shippingReceiverGroupKey || "",
        recipientName:
          pkgMeta?.recipientName || pkgMeta?.requestorBusinessName || "",
        requestorBusinessName: pkgMeta?.requestorBusinessName || "",
        estimatedShipYmd: pkgMeta?.estimatedShipYmd || "",
        abutmentBoxGroupKey: pkgMeta?.abutmentBoxGroupKey || "",
        shippingPackageRequestCount: Number(pkgMeta?.requestCount || 0),
        shippingPackageRequestIds: pkgMeta?.requestIds || [],
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
      total: startIdx + enrichedItems.length + (hasMore ? 1 : 0),
      hasMore,
      page,
      pageSize,
      currentBalanceSnapshot: buildCurrentBalanceSnapshot(
        balanceSnapshot,
        requestorKind,
      ),
    },
  });
}
