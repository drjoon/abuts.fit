// related files:
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/backend/controllers/requests/common.review.helpers.js

/**
 * uniqueKey 예: gl:request:<mongoId>:machining_spend | express_surcharge
 */
export function parseSpendKindFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "")
    .trim()
    .replace(/^gl:/, "");
  if (raw.endsWith(":express_surcharge")) return "express_surcharge";
  if (raw.endsWith(":machining_spend")) return "machining_spend";
  return "";
}

/**
 * 가공비(machining_spend) + 신속추가비(express_surcharge)를 동일 의뢰 기준으로 1행으로 합친다.
 * 표시 금액 SSOT(신속=가공비+추가비)와 맞추기 위함. 장부 저널 자체는 분리 유지.
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
