// related files:
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/services/practiceTransferBilling.service.js
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
  mapRow,
}) {
  const list = Array.isArray(rows) ? rows : [];
  const start = Math.max(0, Number(startIdx) || 0);
  const end = Math.max(start, Number(endIdx) || start);

  let skippedSum = 0;
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
  return "";
}

const FREE_CREDIT_CHARGE_REF_TYPES = new Set([
  "FREE_REQUEST_CREDIT",
  "FREE_SHIPPING_CREDIT",
  "SHIPPING_FREE_CREDIT",
  "WELCOME_BONUS",
  "REQUEST_FREE_CREDIT",
]);

export function isFreeCreditChargeRefType(refType) {
  return FREE_CREDIT_CHARGE_REF_TYPES.has(String(refType || "").trim().toUpperCase());
}

/**
 * free credit grant uniqueKey 예:
 * - gl:free_credit_grant:<ObjectId>
 * - gl:gl:free_credit_grant:<ObjectId> (idempotencyKey에 gl:가 이미 있을 때)
 */
export function parseFreeCreditGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "")
    .trim()
    .replace(/^(gl:)+/i, "");
  const m = raw.match(/^free_credit_grant:([a-f0-9]{24})$/i);
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
  if (
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

export function buildCreditLedgerRequestSummary(doc) {
  if (!doc?._id) return null;
  const caseInfos = doc?.caseInfos || {};
  const shippingMode =
    doc?.finalShipping?.mode ||
    doc?.originalShipping?.mode ||
    doc?.shippingMode ||
    "normal";

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
