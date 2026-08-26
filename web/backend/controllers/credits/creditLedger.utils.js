// related files:
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/services/requestCreditHold.service.js
// - 2026-08-21: hold meta.convertedAt 있으면 SPEND_PAID(지급완료)로 표시.
// - 2026-08-21: PTX CA Request도 abutmentBoxGroupKey(BA+출고일) 유지 — 기공소 배송·생산 박스 묶음.
// - 2026-08-19: 어벗디자인·어벗생산 박스는 의뢰 사업자+예정출고일. 치과명으로 쪼개지 않음.
// - 2026-08-26: 기간 요약 — 유료/무료 충전 + 소비. 소비에 HOLD(에스크로 차감) 포함.
// - 2026-08-23: STORE_SALE → SPEND_PAID(소비)·스토어 카테고리. 기간 소비 합계에 포함.
// - 2026-08-23: 치과 정산 내역 상단 — 필터 기간 소비액 집계(통계 탭 totalSpendSupply와 동일).
// - 2026-08-19: 기본 내역은 최근 라인만 잘라 10건 lookup. 기간 전체 $count 생략.
// - 2026-08-19: 어벗디자인 원장 — 수신자(박스) 묶음용 mailbox/shippingReceiver 요약. ObjectId 재귀 가드.
import mongoose from "mongoose";
import LedgerLine from "../../models/ledgerLine.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
// - 2026-08-17: PTX 디자인비(+지그) 원장을 기공의뢰(PRACTICE_TRANSFER)로 승격·묶음.
// - 2026-08-15: 행 시점 잔액 = 유료+무료+기공 합산 러닝(버킷 분리 시 잔액이 리셋되어 보임).

const SETTLEMENT_LEDGER_TYPES = new Set([
  "LAB_SETTLEMENT_CHARGE",
  "LAB_SETTLEMENT_PAYOUT",
]);

export function isSettlementLedgerType(type) {
  return SETTLEMENT_LEDGER_TYPES.has(String(type || "").trim().toUpperCase());
}

const CHARGE_TYPES = [
  "CHARGE_PAID",
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
  "LAB_SETTLEMENT_CHARGE",
];
const SPEND_TYPES = [
  "SPEND_PAID",
  "SPEND_FREE_REQUEST",
  "SPEND_FREE_SHIPPING",
  "SPEND_SETTLEMENT",
  "SPEND_HOLD",
  "LAB_SETTLEMENT_PAYOUT",
];
const ADJUST_TYPES = ["ADJUST"];

const PAID_TYPES = ["CHARGE_PAID", "SPEND_PAID", "SPEND_HOLD"];
const FREE_TYPES = [
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
  "SPEND_FREE_REQUEST",
  "SPEND_FREE_SHIPPING",
];
const SETTLEMENT_FILTER_TYPES = [
  "LAB_SETTLEMENT_CHARGE",
  "LAB_SETTLEMENT_PAYOUT",
  "SPEND_SETTLEMENT",
];

/** creditKind×action → ledger type 목록. 둘 다 있으면 교집합. */
export function resolveLedgerTypesForFilters({
  creditKind = "",
  action = "",
  type = "",
} = {}) {
  const typeRaw = String(type || "").trim().toUpperCase();
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
      "SPEND_SETTLEMENT",
      "SPEND_HOLD",
      "LAB_SETTLEMENT_CHARGE",
      "LAB_SETTLEMENT_PAYOUT",
      "ADJUST",
    ].includes(typeRaw)
  ) {
    return [typeRaw];
  }

  const kind = String(creditKind || "").trim().toUpperCase();
  const act = String(action || "").trim().toUpperCase();

  let byKind = null;
  if (kind === "PAID") byKind = new Set(PAID_TYPES);
  else if (kind === "FREE") byKind = new Set(FREE_TYPES);
  else if (kind === "SETTLEMENT" || kind === "LAB") {
    byKind = new Set(SETTLEMENT_FILTER_TYPES);
  }

  let byAction = null;
  if (act === "CHARGE") byAction = new Set(CHARGE_TYPES);
  else if (act === "SPEND") byAction = new Set(SPEND_TYPES);
  else if (act === "ADJUST") byAction = new Set(ADJUST_TYPES);

  if (!byKind && !byAction) return null;

  if (byKind && byAction) {
    return [...byKind].filter((t) => byAction.has(t));
  }
  return [...(byKind || byAction)];
}

/**
 * 장부「잔액」SSOT (행 시점 총잔액).
 * - 기공소: paid+free + settlementCredit (= spendableBalance)
 * - 치과: settlement=0 → paid+free와 동일
 * - newest-first: 현재 총잔액에서 페이지 스킵·각 행 amount를 역산
 * - API의 spendableBalance(주문 가능액)와 표시 총잔액 기준을 맞춘다.
 */
export function buildLedgerItemsWithBucketBalanceAfter({
  rows,
  startIdx,
  endIdx,
  spendableBalance = 0,
  settlementBalance = 0,
  skippedSum: skippedSumArg = 0,
  mapRow,
}) {
  const list = Array.isArray(rows) ? rows : [];
  const start = Math.max(0, Number(startIdx) || 0);
  const end = Math.max(start, Number(endIdx) || start);

  let skippedSum = Number(skippedSumArg || 0);
  for (const row of list.slice(0, start)) {
    skippedSum += Number(row?.amount || 0);
  }

  const totalBalance =
    Number(spendableBalance || 0) + Number(settlementBalance || 0);
  let runningBalance = totalBalance - skippedSum;

  return list.slice(start, end).map((row) => {
    const amount = Number(row?.amount || 0);
    const balanceAfter = runningBalance;
    runningBalance -= amount;

    const base = {
      _id: String(row?._id || ""),
      type: String(row?.type || "ADJUST"),
      amount,
      spentPaidAmount: Number(row?.spentPaidAmount || 0),
      spentFreeAmount: Number(row?.spentFreeAmount || 0),
      refType: String(row?.refType || ""),
      refId: row?.refId ? String(row.refId) : "",
      uniqueKey: String(row?.uniqueKey || ""),
      spendKind: row?.spendKind || null,
      includesExpressSurcharge: Boolean(row?.includesExpressSurcharge),
      createdAt: row?.occurredAt || row?.createdAt || new Date(),
      balanceAfter,
    };
    return typeof mapRow === "function" ? mapRow(row, base) : base;
  });
}

/**
 * uniqueKey 예: gl:request:<mongoId>:machining_spend | express_surcharge
 * idempotencyKey가 이미 `gl:` 접두를 가진 경우 `gl:gl:...`로 올 수 있어 전부 제거한다.
 */
export function parseSpendKindFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "")
    .trim()
    .replace(/^(gl:)+/i, "");
  if (raw.endsWith(":express_surcharge")) return "express_surcharge";
  if (raw.endsWith(":machining_spend")) return "machining_spend";
  if (raw.endsWith(":shipping_fee")) return "shipping_fee";
  return "";
}

const FREE_CREDIT_CHARGE_REF_TYPES = new Set([
  "FREE_REQUEST_CREDIT",
  "FREE_SHIPPING_CREDIT",
  "SHIPPING_FREE_CREDIT",
  "WELCOME_BONUS",
  "REQUEST_FREE_CREDIT",
  "DEMO_CREDIT",
]);

export function isFreeCreditChargeRefType(refType) {
  return FREE_CREDIT_CHARGE_REF_TYPES.has(String(refType || "").trim().toUpperCase());
}

/**
 * free credit grant uniqueKey 예:
 * - gl:free_credit_grant:<ObjectId>
 * - gl:gl:free_credit_grant:<ObjectId> (idempotencyKey에 gl:가 이미 있을 때)
 * - gl:demo_credit_grant:<ObjectId>
 */
export function parseFreeCreditGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "")
    .trim()
    .replace(/^(gl:)+/i, "");
  const m = raw.match(/^(?:free_credit_grant|demo_credit_grant):([a-f0-9]{24})$/i);
  return m ? m[1] : "";
}

export function resolveFreeCreditGrantIdFromLedgerItem(item) {
  const fromKey = parseFreeCreditGrantIdFromUniqueKey(item?.uniqueKey);
  if (fromKey) return fromKey;
  if (!isFreeCreditChargeRefType(item?.refType)) return "";
  const refId = String(item?.refId || "").trim();
  return /^[a-f0-9]{24}$/i.test(refId) ? refId : "";
}

export function buildFreeCreditGrantReason(grant) {
  const source = String(grant?.source || "").trim();
  const overrideReason = String(grant?.overrideReason || "").trim();
  const grantType = String(grant?.type || "").trim().toUpperCase();

  let reason = "환영 무료크레딧";
  if (grantType === "DEMO_CREDIT") {
    reason = "데모 크레딧";
  } else if (
    grantType === "SHIPPING_FREE_CREDIT" ||
    grantType === "FREE_SHIPPING_CREDIT"
  ) {
    reason = "환영 무료크레딧";
  }

  if (source === "admin") {
    return overrideReason ? `관리자 지급 · ${overrideReason}` : "관리자 지급";
  }
  if (source === "migrated") {
    return `시드/마이그레이션 ${reason}`;
  }
  return reason;
}

/**
 * 생산비(machining_spend) + 신속추가비(express_surcharge)를 동일 의뢰 기준으로 1행으로 합친다.
 * 표시 금액 SSOT(신속=생산비+추가비)와 맞추기 위함. 장부 저널 자체는 분리 유지.
 */
export function mergeRequestExpressSurchargeIntoMachiningSpend(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const machiningByRef = new Map();
  const expressByRef = new Map();

  for (const row of rows) {
    if (String(row?.refType || "") !== "REQUEST") continue;
    const refId = row?.refId ? String(row.refId) : "";
    if (!refId) continue;
    const kind = parseSpendKindFromUniqueKey(row?.uniqueKey);
    if (kind === "machining_spend") machiningByRef.set(refId, row);
    if (kind === "express_surcharge") expressByRef.set(refId, row);
  }

  if (expressByRef.size === 0) return rows;

  const skipKeys = new Set();
  const mergeReplace = new Map();

  for (const [refId, expressRow] of expressByRef.entries()) {
    const machiningRow = machiningByRef.get(refId);
    if (!machiningRow) continue;

    const expressTime = new Date(expressRow.occurredAt || 0).getTime();
    const machiningTime = new Date(machiningRow.occurredAt || 0).getTime();
    const primary = expressTime >= machiningTime ? expressRow : machiningRow;
    const secondary = primary === expressRow ? machiningRow : expressRow;

    skipKeys.add(String(secondary.uniqueKey || secondary._id || ""));
    mergeReplace.set(String(primary.uniqueKey || primary._id || ""), {
      ...machiningRow,
      _id: primary._id,
      occurredAt: primary.occurredAt || machiningRow.occurredAt,
      createdAt: primary.createdAt || machiningRow.createdAt,
      amount:
        Number(machiningRow.amount || 0) + Number(expressRow.amount || 0),
      spentPaidAmount:
        Number(machiningRow.spentPaidAmount || 0) +
        Number(expressRow.spentPaidAmount || 0),
      spentFreeAmount:
        Number(machiningRow.spentFreeAmount || 0) +
        Number(expressRow.spentFreeAmount || 0),
      uniqueKey: machiningRow.uniqueKey,
      includesExpressSurcharge: true,
      spendKind: "machining_spend",
    });
  }

  if (mergeReplace.size === 0) return rows;

  return rows
    .filter((row) => !skipKeys.has(String(row.uniqueKey || row._id || "")))
    .map((row) => {
      const key = String(row.uniqueKey || row._id || "");
      return mergeReplace.get(key) || row;
    });
}

function normalizeMailboxAddress(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

function shippingReceiverName(doc) {
  const receiver =
    doc?.shippingReceiver && typeof doc.shippingReceiver === "object"
      ? doc.shippingReceiver
      : {};
  return String(receiver.name || "").trim();
}

export function buildAbutmentBoxGroupKey({
  requestorBusinessAnchorId = "",
  estimatedShipYmd = "",
} = {}) {
  const ba = String(requestorBusinessAnchorId || "").trim();
  const ymd = String(estimatedShipYmd || "").trim();
  if (!ba) return "";
  return ymd ? `${ba}:${ymd}` : ba;
}

function objectIdString(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    return /^[a-fA-F0-9]{24}$/.test(s) ? s : "";
  }
  if (typeof raw !== "object") return "";
  // mongoose ObjectId._id returns itself — do not recurse into it.
  if (typeof raw.toHexString === "function") {
    try {
      const hex = String(raw.toHexString()).trim();
      if (/^[a-fA-F0-9]{24}$/.test(hex)) return hex;
    } catch {
      // fall through
    }
  }
  const nested = raw._id || raw.id || raw.businessAnchorId;
  if (nested != null && nested !== raw) return objectIdString(nested);
  const s = String(raw).trim();
  return /^[a-fA-F0-9]{24}$/.test(s) ? s : "";
}

function shippingReceiverGroupKeyFromDoc(doc) {
  const receiver =
    doc?.shippingReceiver && typeof doc.shippingReceiver === "object"
      ? doc.shippingReceiver
      : {};
  const org =
    objectIdString(receiver.sourceAnchorId) ||
    objectIdString(doc?.businessAnchorId) ||
    "_";
  const name = String(receiver.name || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const phone = String(receiver.phone || "").replace(/\D/g, "");
  const zip = String(receiver.zipCode || "").replace(/\s+/g, "");
  const address = String(receiver.address || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const detail = String(receiver.addressDetail || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const fp =
    name || phone || address
      ? `${name}|${phone}|${zip}|${address}|${detail}`
      : "_";
  return `${org}:${fp}`;
}

export function buildCreditLedgerRequestSummary(doc) {
  if (!doc?._id) return null;
  const caseInfos = doc?.caseInfos || {};
  const shippingMode =
    doc?.finalShipping?.mode ||
    doc?.originalShipping?.mode ||
    doc?.shippingMode ||
    "normal";
  const receiver =
    doc?.shippingReceiver && typeof doc.shippingReceiver === "object"
      ? doc.shippingReceiver
      : {};
  const relatedPracticeTransferId = String(
    doc?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  const shippingPackageId = String(
    doc?.shippingPackageId?._id || doc?.shippingPackageId || "",
  ).trim();
  const requestorBusinessAnchorId = objectIdString(doc?.businessAnchorId);
  const estimatedShipYmd = String(doc?.timeline?.estimatedShipYmd || "").trim();
  // PTX CA도 동일 박스키 — 기공소 장부에서 생산비+배송비를 한 행으로 묶는다.
  const abutmentBoxGroupKey = buildAbutmentBoxGroupKey({
    requestorBusinessAnchorId,
    estimatedShipYmd,
  });

  return {
    requestId: String(doc.requestId || ""),
    manufacturerStage: String(doc.manufacturerStage || ""),
    patientName: String(caseInfos.patientName || ""),
    tooth: String(caseInfos.tooth || ""),
    clinicName: String(caseInfos.clinicName || ""),
    shippingMode: shippingMode === "express" ? "express" : "normal",
    finalShipping: doc?.finalShipping
      ? { mode: doc.finalShipping.mode || null }
      : null,
    originalShipping: doc?.originalShipping
      ? { mode: doc.originalShipping.mode || null }
      : null,
    price: doc?.price
      ? {
          amount: doc.price.amount ?? null,
          expressFee: doc.price.expressFee ?? null,
          expressFeeStatus: doc.price.expressFeeStatus ?? null,
        }
      : null,
    lotNumber: {
      value: String(doc?.lotNumber?.value || ""),
    },
    mailboxAddress: normalizeMailboxAddress(doc?.mailboxAddress),
    shippingPackageId,
    shippingReceiverGroupKey: shippingReceiverGroupKeyFromDoc(doc),
    recipientName: shippingReceiverName(doc),
    requestorBusinessAnchorId,
    requestorBusinessName: "",
    estimatedShipYmd,
    abutmentBoxGroupKey,
    relatedPracticeTransferId,
    shippingReceiver: {
      name: String(receiver.name || "").trim(),
      address: String(receiver.address || "").trim(),
      addressDetail: String(receiver.addressDetail || "").trim(),
      zipCode: String(receiver.zipCode || "").trim(),
      phone: String(receiver.phone || "").trim(),
    },
    caseInfos: {
      clinicName: String(caseInfos.clinicName || ""),
      patientName: String(caseInfos.patientName || ""),
      tooth: String(caseInfos.tooth || ""),
      implantManufacturer: String(caseInfos.implantManufacturer || ""),
      implantBrand: String(caseInfos.implantBrand || ""),
      implantFamily: String(caseInfos.implantFamily || ""),
      implantType: String(caseInfos.implantType || ""),
      maxDiameter:
        caseInfos.maxDiameter == null ? null : Number(caseInfos.maxDiameter),
      connectionDiameter:
        caseInfos.connectionDiameter == null
          ? null
          : Number(caseInfos.connectionDiameter),
    },
  };
}

export function attachCreditLedgerRequestFields(
  item,
  requestSummary,
  refRequestId = "",
) {
  return {
    ...item,
    refRequestId: refRequestId || requestSummary?.requestId || "",
    refRequestSummary: requestSummary || null,
    patientName: requestSummary?.patientName || "",
    tooth: requestSummary?.tooth || "",
    clinicName: requestSummary?.clinicName || "",
    manufacturerStage: requestSummary?.manufacturerStage || "",
    shippingMode: requestSummary?.shippingMode || "normal",
    lotNumber: requestSummary?.lotNumber || null,
    caseInfos: requestSummary?.caseInfos || null,
    mailboxAddress: requestSummary?.mailboxAddress || "",
    shippingPackageId: requestSummary?.shippingPackageId || "",
    shippingReceiverGroupKey: requestSummary?.shippingReceiverGroupKey || "",
    recipientName: requestSummary?.recipientName || "",
    requestorBusinessAnchorId: requestSummary?.requestorBusinessAnchorId || "",
    requestorBusinessName: requestSummary?.requestorBusinessName || "",
    estimatedShipYmd: requestSummary?.estimatedShipYmd || "",
    abutmentBoxGroupKey: requestSummary?.abutmentBoxGroupKey || "",
    relatedPracticeTransferId: requestSummary?.relatedPracticeTransferId || null,
  };
}

export function applyRequestorBusinessNameToSummary(summary, businessName) {
  if (!summary) return summary;
  const name = String(businessName || "").trim();
  return {
    ...summary,
    requestorBusinessName: name,
    recipientName: String(summary.recipientName || "").trim() || name,
  };
}

/** 어벗디자인·어벗생산 원장 수신자 표시는 의뢰 사업자명(치과명 폴백 금지). */
export async function hydrateCreditLedgerRequestorNames(summariesById) {
  if (!summariesById || typeof summariesById.values !== "function") {
    return summariesById;
  }
  const idSet = new Set();
  for (const summary of summariesById.values()) {
    const id = String(summary?.requestorBusinessAnchorId || "").trim();
    if (id && mongoose.Types.ObjectId.isValid(id)) idSet.add(id);
  }
  if (idSet.size === 0) return summariesById;

  const anchors = await BusinessAnchor.find({
    _id: { $in: [...idSet].map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select({ name: 1, "metadata.companyName": 1 })
    .lean();

  const nameById = new Map();
  for (const anchor of anchors || []) {
    const name =
      String(anchor?.name || "").trim() ||
      String(anchor?.metadata?.companyName || "").trim();
    if (anchor?._id && name) nameById.set(String(anchor._id), name);
  }

  for (const [key, summary] of summariesById.entries()) {
    const ba = String(summary?.requestorBusinessAnchorId || "").trim();
    summariesById.set(
      key,
      applyRequestorBusinessNameToSummary(summary, nameById.get(ba) || ""),
    );
  }
  return summariesById;
}

export function buildCreditLedgerShippingPackageMeta({
  packageDocs = [],
  deliveryInfoByRequestId = new Map(),
  requestSummaryById = new Map(),
} = {}) {
  const byId = new Map();
  for (const pkg of packageDocs || []) {
    if (!pkg?._id) continue;
    const requestIds = Array.from(
      new Set(
        (Array.isArray(pkg.requestIds) ? pkg.requestIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    );
    const trackingNumbers = Array.from(
      new Set(
        requestIds
          .map((requestId) => deliveryInfoByRequestId.get(String(requestId)) || "")
          .filter(Boolean),
      ),
    );
    const firstSummary = requestIds
      .map((id) => requestSummaryById.get(String(id)) || null)
      .find(Boolean);
    byId.set(String(pkg._id), {
      trackingNumbers,
      mailboxAddress:
        normalizeMailboxAddress(pkg.mailboxAddress) ||
        String(firstSummary?.mailboxAddress || "").trim(),
      recipientName: String(firstSummary?.recipientName || "").trim(),
      requestorBusinessName: String(
        firstSummary?.requestorBusinessName || "",
      ).trim(),
      estimatedShipYmd: String(firstSummary?.estimatedShipYmd || "").trim(),
      abutmentBoxGroupKey: String(
        firstSummary?.abutmentBoxGroupKey || "",
      ).trim(),
      shippingReceiverGroupKey: String(
        firstSummary?.shippingReceiverGroupKey || "",
      ).trim(),
      requestIds,
      requestCount: requestIds.length,
    });
  }
  return byId;
}

export const ABUTMENT_DESIGN_LAB_FEE_SOURCE = "abutment_design_lab_fee";

/** 저널 meta.relatedPracticeTransferId — 없으면 디자인비 저널의 PTX refId */
export const CREDIT_LEDGER_RELATED_PTX_ID_EXPR = {
  $ifNull: [
    "$journalDoc.meta.relatedPracticeTransferId",
    {
      $cond: [
        {
          $and: [
            {
              $eq: ["$journalDoc.meta.source", ABUTMENT_DESIGN_LAB_FEE_SOURCE],
            },
            { $eq: ["$journalDoc.refType", "PRACTICE_TRANSFER"] },
          ],
        },
        { $ifNull: ["$journalDoc.refId", null] },
        null,
      ],
    },
  ],
};

export const CREDIT_LEDGER_SOURCE_EXPR = {
  $ifNull: ["$journalDoc.meta.source", { $ifNull: ["$meta.source", ""] }],
};

export const CREDIT_LEDGER_DESIGN_FEE_AS_SETTLEMENT_CASE = {
  case: { $eq: ["$ledgerSource", ABUTMENT_DESIGN_LAB_FEE_SOURCE] },
  then: "LAB_SETTLEMENT_CHARGE",
};

export function isAbutmentDesignLabFeeLedgerRow(row) {
  const source = String(row?.ledgerSource || "").trim();
  if (source === ABUTMENT_DESIGN_LAB_FEE_SOURCE) return true;
  return String(row?.uniqueKey || "").includes("abutment_design_fee");
}

export function collectPracticeTransferLookupIds(items) {
  const ids = new Set();
  for (const it of items || []) {
    if (String(it?.refType || "") === "PRACTICE_TRANSFER" && it?.refId) {
      ids.add(String(it.refId));
    }
    const related = String(it?.relatedPracticeTransferId || "").trim();
    if (related) ids.add(related);
  }
  return Array.from(ids);
}

/** 기공의뢰 CA 디자인비를 보철기공비와 같은 PRACTICE_TRANSFER 의뢰건으로 승격 */
export function promoteAbutmentDesignFeeToPracticeTransfer(item, relatedId) {
  if (!item || !relatedId) return item;
  if (!isAbutmentDesignLabFeeLedgerRow(item)) return item;
  return {
    ...item,
    refType: "PRACTICE_TRANSFER",
    refId: String(relatedId),
    relatedPracticeTransferId: String(relatedId),
  };
}

export const CREDIT_LEDGER_REQUEST_SELECT = {
  _id: 1,
  requestId: 1,
  manufacturerStage: 1,
  lotNumber: 1,
  shippingMode: 1,
  mailboxAddress: 1,
  shippingPackageId: 1,
  businessAnchorId: 1,
  shippingReceiver: 1,
  "timeline.estimatedShipYmd": 1,
  "partnerBilling.relatedPracticeTransferId": 1,
  "finalShipping.mode": 1,
  "originalShipping.mode": 1,
  "price.amount": 1,
  "price.expressFee": 1,
  "price.expressFeeStatus": 1,
  "caseInfos.patientName": 1,
  "caseInfos.tooth": 1,
  "caseInfos.clinicName": 1,
  "caseInfos.implantManufacturer": 1,
  "caseInfos.implantBrand": 1,
  "caseInfos.implantFamily": 1,
  "caseInfos.implantType": 1,
  "caseInfos.maxDiameter": 1,
  "caseInfos.connectionDiameter": 1,
};

const REQUESTOR_CREDIT_ACCOUNT_CODES = [
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
  "LAB_SETTLEMENT_CREDIT",
];

const SPEND_SETTLEMENT_EVENT_TYPES = [
  "REQUEST_SPEND_COMMIT",
  "REQUEST_SPEND_HOLD",
  "SHIPPING_SPEND_COMMIT",
  "SHIPPING_SPEND_HOLD",
];

function uniqueKeyFromJournalDocExpr() {
  return {
    $let: {
      vars: {
        rawKey: {
          $ifNull: [
            "$journalDoc.meta.spendUniqueKey",
            { $ifNull: ["$journalDoc.idempotencyKey", "$_id"] },
          ],
        },
      },
      in: {
        $cond: [
          { $eq: [{ $substrBytes: ["$$rawKey", 0, 3] }, "gl:"] },
          "$$rawKey",
          { $concat: ["gl:", "$$rawKey"] },
        ],
      },
    },
  };
}

function creditLedgerRowTypeExpr() {
  return {
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
                  [
                    "PRACTICE_TRANSFER_SPEND_HOLD",
                    "PRACTICE_TRANSFER_HOLD_ADJUST",
                    "REQUEST_SPEND_HOLD",
                    "SHIPPING_SPEND_HOLD",
                  ],
                ],
              },
              {
                $ne: [
                  { $ifNull: ["$journalDoc.meta.convertedAt", null] },
                  null,
                ],
              },
            ],
          },
          then: "SPEND_PAID",
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
              { $in: ["$eventType", SPEND_SETTLEMENT_EVENT_TYPES] },
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
                  ["REQUEST_SPEND_COMMIT", "PRACTICE_TRANSFER_SPEND_COMMIT"],
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
          case: { $eq: ["$eventType", "PRACTICE_TRANSFER_LAB_PLATFORM_FEE"] },
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
        {
          case: {
            $and: [
              { $eq: ["$eventType", "STORE_SALE"] },
              { $lt: ["$amount", 0] },
            ],
          },
          then: "SPEND_PAID",
        },
        {
          case: {
            $and: [
              { $eq: ["$eventType", "STORE_SALE"] },
              { $gt: ["$amount", 0] },
            ],
          },
          then: "ADJUST",
        },
        { case: { $eq: ["$eventType", "ADJUST"] }, then: "ADJUST" },
      ],
      default: "ADJUST",
    },
  };
}

function journalLookupAndTypeStages(journalCollectionName) {
  return [
    {
      $lookup: {
        from: journalCollectionName,
        localField: "_id",
        foreignField: "journalId",
        as: "journalDoc",
      },
    },
    {
      $unwind: { path: "$journalDoc", preserveNullAndEmptyArrays: true },
    },
    {
      $addFields: {
        eventType: { $ifNull: ["$journalDoc.eventType", ""] },
        uniqueKey: uniqueKeyFromJournalDocExpr(),
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
        refType: {
          $ifNull: ["$refType", { $ifNull: ["$journalDoc.refType", ""] }],
        },
        refId: { $ifNull: ["$refId", "$journalDoc.refId"] },
      },
    },
    { $addFields: { type: creditLedgerRowTypeExpr() } },
    { $project: { journalDoc: 0 } },
  ];
}

function lineGroupStage() {
  const amountBase = { $ifNull: ["$amountExcludingVat", "$amount"] };
  return {
    $group: {
      _id: "$journalId",
      occurredAt: { $max: "$occurredAt" },
      createdAt: { $max: "$createdAt" },
      refType: { $first: "$refType" },
      refId: { $first: "$refId" },
      meta: { $first: "$meta" },
      amount: { $sum: amountBase },
      spentPaidAmount: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$accountCode", "REQ_PAID_CREDIT"] },
                { $lt: [amountBase, 0] },
              ],
            },
            { $abs: amountBase },
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
                    "$accountCode",
                    ["REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"],
                  ],
                },
                { $lt: [amountBase, 0] },
              ],
            },
            { $abs: amountBase },
            0,
          ],
        },
      },
      spentSettlementAmount: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$accountCode", "LAB_SETTLEMENT_CREDIT"] },
                { $lt: [amountBase, 0] },
              ],
            },
            { $abs: amountBase },
            0,
          ],
        },
      },
      accountCode: { $first: "$accountCode" },
    },
  };
}

function pagingFacet({ startIdx, pageSize, itemStages = [], extra = 0 }) {
  const skip = Math.max(0, Number(startIdx) || 0);
  const limit = Math.max(1, Number(pageSize) || 10) + Math.max(0, Number(extra) || 0);
  const facet = {
    items: [{ $skip: skip }, { $limit: limit }, ...itemStages],
  };
  if (skip > 0) {
    facet.skipped = [
      { $limit: skip },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ];
  }
  return { $facet: facet };
}

const JOURNAL_LINE_OVERFETCH = 8;

const CREDIT_LEDGER_STATS_CHARGE_EVENT_TYPES = [
  "CHARGE_PAID",
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
];

const CREDIT_LEDGER_STATS_PAID_CHARGE_EVENT_TYPES = ["CHARGE_PAID"];

const CREDIT_LEDGER_STATS_FREE_CHARGE_EVENT_TYPES = [
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
];

/**
 * 치과 잔액 차감 기준 소비 이벤트.
 * 에스크로 HOLD가 REQ_*를 먼저 차감하고, HOLD→COMMIT은 PLATFORM_ESCROW만 움직이므로
 * COMMIT만 세면 소비 합계가 0으로 나온다. HOLD를 포함한다.
 */
const CREDIT_LEDGER_STATS_SPEND_EVENT_TYPES = [
  "REQUEST_SPEND_COMMIT",
  "REQUEST_SPEND_HOLD",
  "SHIPPING_SPEND_COMMIT",
  "SHIPPING_SPEND_HOLD",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "PRACTICE_TRANSFER_SPEND_HOLD",
  "PRACTICE_TRANSFER_HOLD_ADJUST",
  "PRACTICE_MEMBERSHIP_SPEND",
  "STORE_SALE",
];

/** 통계 탭 카테고리와 동일한 분류식(원장 드릴다운용) */
export function creditLedgerStatsCategoryExpr() {
  return {
    $switch: {
      branches: [
        {
          case: { $in: ["$eventType", CREDIT_LEDGER_STATS_CHARGE_EVENT_TYPES] },
          then: "charge",
        },
        { case: { $eq: ["$eventType", "ADJUST"] }, then: "adjust" },
        { case: { $eq: ["$eventType", "SETTLEMENT_PAYOUT"] }, then: "settlement_payout" },
        {
          case: {
            $or: [
              { $eq: ["$eventType", "LAB_SETTLEMENT_CHARGE"] },
              {
                $and: [
                  { $eq: ["$eventType", "PRACTICE_TRANSFER_SPEND_COMMIT"] },
                  { $eq: ["$accountCode", "LAB_SETTLEMENT_CREDIT"] },
                  { $gt: ["$amount", 0] },
                ],
              },
            ],
          },
          then: "settlement_earn",
        },
        {
          case: {
            $or: [
              { $regexMatch: { input: "$eventType", regex: "PRACTICE_TRANSFER" } },
              { $eq: [{ $toUpper: { $ifNull: ["$refType", ""] } }, "PRACTICE_TRANSFER"] },
            ],
          },
          then: "practice_transfer",
        },
        {
          case: {
            $or: [
              { $regexMatch: { input: "$eventType", regex: "SHIPPING" } },
              {
                $eq: [
                  { $toUpper: { $ifNull: ["$refType", ""] } },
                  "SHIPPING_PACKAGE",
                ],
              },
            ],
          },
          then: "shipping",
        },
        {
          case: {
            $or: [
              { $regexMatch: { input: "$eventType", regex: "REQUEST" } },
              { $eq: [{ $toUpper: { $ifNull: ["$refType", ""] } }, "REQUEST"] },
            ],
          },
          then: "abutment_production",
        },
        {
          case: {
            $or: [
              { $eq: ["$eventType", "STORE_SALE"] },
              {
                $eq: [
                  { $toUpper: { $ifNull: ["$refType", ""] } },
                  "STORE_ORDER",
                ],
              },
            ],
          },
          then: "store",
        },
        {
          case: { $in: ["$eventType", CREDIT_LEDGER_STATS_SPEND_EVENT_TYPES] },
          then: "other",
        },
      ],
      default: "other",
    },
  };
}

/**
 * 의뢰자 원장: 기본 조회는 최근 라인만 잘라 저널 10건(+1)만 lookup.
 * 유형/검색 필터가 있을 때만 기간 전체를 저널에 붙인다.
 */
export function buildRequestorCreditLedgerPipeline({
  ownerId,
  journalCollectionName,
  occurredAt,
  filterTypes,
  searchOrs,
  refIdIn,
  statsCategories,
  startIdx,
  pageSize,
}) {
  const match = {
    ownerRole: "requestor",
    ownerId,
    accountCode: { $in: REQUESTOR_CREDIT_ACCOUNT_CODES },
  };
  if (occurredAt && Object.keys(occurredAt).length) {
    match.occurredAt = occurredAt;
  }

  const skip = Math.max(0, Number(startIdx) || 0);
  const limit = Math.max(1, Number(pageSize) || 10);
  const pipeline = [
    { $match: match },
    {
      $project: {
        journalId: 1,
        occurredAt: 1,
        createdAt: 1,
        accountCode: 1,
        amount: 1,
        amountExcludingVat: 1,
        refType: 1,
        refId: 1,
        meta: 1,
      },
    },
  ];

  const hasTypeFilter = Array.isArray(filterTypes);
  const hasSearch = Array.isArray(searchOrs) && searchOrs.length > 0;
  const hasRefIdIn = Array.isArray(refIdIn);
  const hasStatsCategories =
    Array.isArray(statsCategories) && statsCategories.length > 0;
  const lookupStages = journalLookupAndTypeStages(journalCollectionName);

  if (hasTypeFilter || hasSearch || hasRefIdIn || hasStatsCategories) {
    pipeline.push(lineGroupStage(), { $sort: { occurredAt: -1, _id: -1 } });
    pipeline.push(...lookupStages);
    if (hasTypeFilter) {
      pipeline.push({
        $match: {
          type: { $in: filterTypes.length ? filterTypes : ["__none__"] },
        },
      });
    }
    if (hasRefIdIn) {
      pipeline.push({
        $match: {
          refId: refIdIn.length ? { $in: refIdIn } : null,
        },
      });
    }
    if (hasStatsCategories) {
      pipeline.push(
        { $addFields: { statsCategory: creditLedgerStatsCategoryExpr() } },
        { $match: { statsCategory: { $in: statsCategories } } },
      );
    }
    if (hasSearch) {
      pipeline.push({ $match: { $or: searchOrs } });
    }
    pipeline.push(
      pagingFacet({
        startIdx: skip,
        pageSize: limit,
        extra: 1,
      }),
    );
  } else {
    const lineCap = (skip + limit + 1) * JOURNAL_LINE_OVERFETCH;
    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      { $limit: lineCap },
      lineGroupStage(),
      { $sort: { occurredAt: -1, _id: -1 } },
      pagingFacet({
        startIdx: skip,
        pageSize: limit,
        extra: 1,
        itemStages: lookupStages,
      }),
    );
  }

  return pipeline;
}

export function parseCreditLedgerFacetResult(facetRaw, { pageSize } = {}) {
  const row = Array.isArray(facetRaw) ? facetRaw[0] : facetRaw;
  const size = Math.max(1, Number(pageSize) || 10);
  const rawItems = Array.isArray(row?.items) ? row.items : [];
  const hasMore = rawItems.length > size;
  return {
    hasMore,
    skippedSum: Number(row?.skipped?.[0]?.sum || 0),
    items: hasMore ? rawItems.slice(0, size) : rawItems,
  };
}

/**
 * 치과 정산 내역 상단 카드 — 필터 기간 유료/무료 충전·소비 공급가.
 * 소비는 REQ_* 실차감(HOLD 포함). 통계 탭 spend와 동일 이벤트 기준.
 */
export async function aggregateRequestorPeriodLedgerSummary({
  ownerObjectId,
  occurredAt,
  journalCollectionName,
}) {
  const match = {
    ownerRole: "requestor",
    ownerId: ownerObjectId,
    accountCode: { $in: REQUESTOR_CREDIT_ACCOUNT_CODES },
  };
  if (occurredAt && Object.keys(occurredAt).length) {
    match.occurredAt = occurredAt;
  }

  const rows = await LedgerLine.aggregate([
    { $match: match },
    {
      $lookup: {
        from: journalCollectionName,
        localField: "journalId",
        foreignField: "journalId",
        as: "journalDoc",
      },
    },
    { $unwind: { path: "$journalDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
        eventType: { $ifNull: ["$journalDoc.eventType", ""] },
      },
    },
    {
      $group: {
        _id: "$journalId",
        eventType: { $first: "$eventType" },
        amount: { $sum: "$amountBase" },
      },
    },
  ]);

  let totalPaidChargeSupply = 0;
  let totalFreeChargeSupply = 0;
  let totalSpendSupply = 0;
  for (const row of rows) {
    const eventType = String(row?.eventType || "");
    const amount = Number(row?.amount || 0);
    if (
      CREDIT_LEDGER_STATS_PAID_CHARGE_EVENT_TYPES.includes(eventType) &&
      amount > 0
    ) {
      totalPaidChargeSupply += amount;
    } else if (
      CREDIT_LEDGER_STATS_FREE_CHARGE_EVENT_TYPES.includes(eventType) &&
      amount > 0
    ) {
      totalFreeChargeSupply += amount;
    } else if (
      CREDIT_LEDGER_STATS_SPEND_EVENT_TYPES.includes(eventType) &&
      amount < 0
    ) {
      totalSpendSupply += Math.abs(amount);
    }
  }

  return {
    totalPaidChargeSupply: Math.max(0, Math.round(totalPaidChargeSupply)),
    totalFreeChargeSupply: Math.max(0, Math.round(totalFreeChargeSupply)),
    totalSpendSupply: Math.max(0, Math.round(totalSpendSupply)),
  };
}

/** @deprecated Use aggregateRequestorPeriodLedgerSummary */
export async function aggregateRequestorPeriodSpendSupply(args) {
  const summary = await aggregateRequestorPeriodLedgerSummary(args);
  return summary.totalSpendSupply;
}
