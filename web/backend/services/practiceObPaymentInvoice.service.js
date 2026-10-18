// change-log:
// - 2026-10-18: 치과 OB 이체 성공분과 같은 금액으로 계산서 발행.
//   스토어=어벗츠 법인 과세(SELF), 기공서비스=수행 기공소 면세(팝빌 위수탁),
//   커스텀어벗=어벗츠 법인 면세(SELF).
// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/services/taxInvoiceAutoIssue.service.js
// - web/backend/models/taxInvoiceDraft.model.js
// - rules.md §2.3
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import { buildPartySnapshotFromAnchor } from "../utils/taxInvoiceParty.util.js";
import { formatKstWriteDate } from "../utils/taxInvoicePeriod.util.js";
import { approveAndIssueTaxInvoiceDraftById } from "./taxInvoiceAutoIssue.service.js";

function isDuplicateKeyError(err) {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
}

function periodFromYearMonth(yearMonth) {
  const [yStr, mStr] = String(yearMonth || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;
  const start = new Date(`${yStr}-${mStr}-01T00:00:00+09:00`);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = new Date(
    `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`,
  );
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { periodStart: start, periodEnd: end };
}

function partyFromAnchor(anchor, contact) {
  const party = buildPartySnapshotFromAnchor(anchor, contact);
  if (!party.corpName) party.corpName = String(anchor?.name || "").trim();
  return party;
}

async function resolveContactUser(anchor) {
  if (!anchor?.primaryContactUserId) return null;
  return User.findById(anchor.primaryContactUserId)
    .select({ name: 1, email: 1, phone: 1 })
    .lean();
}

/**
 * 어벗츠 법인으로 이체된 금액을 스토어(과세)와 커스텀어벗(면세)으로 나눈다.
 * 분해 합계와 이체액이 같으면 주문 공급가·세액을 그대로 쓴다.
 * 분해가 없으면 이체액 전체를 면세(커스텀어벗)로 둔다.
 */
export function allocateAbutsPaymentInvoice(paidAmount, split) {
  const paid = Math.max(0, Math.round(Number(paidAmount) || 0));
  const storeTotal = Math.max(0, Math.round(Number(split?.storeTotalAmount) || 0));
  const storeSupply = Math.max(0, Math.round(Number(split?.storeSupplyAmount) || 0));
  const storeVat = Math.max(0, Math.round(Number(split?.storeVatAmount) || 0));
  const abutment = Math.max(0, Math.round(Number(split?.abutmentAmount) || 0));
  if (paid <= 0) {
    return { storeSupply: 0, storeVat: 0, storeTotal: 0, abutment: 0 };
  }
  const natural = storeTotal + abutment;
  if (natural <= 0 || storeTotal <= 0) {
    return { storeSupply: 0, storeVat: 0, storeTotal: 0, abutment: paid };
  }
  if (natural === paid) {
    return { storeSupply, storeVat, storeTotal, abutment };
  }
  const nextStoreTotal = Math.min(
    paid,
    Math.round((paid * storeTotal) / natural),
  );
  const nextAbutment = paid - nextStoreTotal;
  if (nextStoreTotal <= 0) {
    return { storeSupply: 0, storeVat: 0, storeTotal: 0, abutment: paid };
  }
  const ratio = nextStoreTotal / storeTotal;
  let supply = Math.round(storeSupply * ratio);
  let vat = nextStoreTotal - supply;
  if (supply < 0) supply = 0;
  if (vat < 0) {
    supply = nextStoreTotal;
    vat = 0;
  }
  return {
    storeSupply: supply,
    storeVat: vat,
    storeTotal: nextStoreTotal,
    abutment: nextAbutment,
  };
}

async function createDraft(payload) {
  try {
    const doc = await TaxInvoiceDraft.create(payload);
    return { created: true, id: doc._id };
  } catch (err) {
    if (isDuplicateKeyError(err)) return { created: false, skipped: true };
    throw err;
  }
}

async function issueIfPopbillReady(draftId) {
  const corpNum = String(process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
  if (!corpNum || !draftId) return false;
  const result = await approveAndIssueTaxInvoiceDraftById(draftId);
  return Boolean(result?.ok && result.status === "SENT");
}

/**
 * OB 이체 성공 라인만 계산서 초안을 만들고, 팝빌 회원번호가 있으면 바로 발행한다.
 * 같은 기간·공급자·세목은 유니크 인덱스로 한 번만 만든다.
 */
export async function issuePracticeObPaymentInvoices({
  settlement,
  invoiceSplit = null,
  now = new Date(),
}) {
  const summary = {
    created: 0,
    skippedExisting: 0,
    skippedOptOut: 0,
    issued: 0,
  };
  if (!settlement?._id || !settlement.practiceAnchorId) return summary;

  const period = periodFromYearMonth(settlement.yearMonth);
  if (!period) return summary;

  const lines = Array.isArray(settlement.lines) ? settlement.lines : [];
  const paidLines = lines.filter(
    (line) =>
      String(line?.transferStatus || "") === "SUCCESS" &&
      Math.round(Number(line?.amount || 0)) > 0,
  );
  if (!paidLines.length) return summary;

  const practice = await BusinessAnchor.findById(settlement.practiceAnchorId).lean();
  if (!practice) return summary;
  const practiceContact = await resolveContactUser(practice);
  const buyer = partyFromAnchor(practice, practiceContact);
  const writeDate = formatKstWriteDate(now);

  const labIds = paidLines
    .filter((line) => line.payeeKind === "direct_lab" && line.payeeAnchorId)
    .map((line) => line.payeeAnchorId);
  const labs = labIds.length
    ? await BusinessAnchor.find({ _id: { $in: labIds } }).lean()
    : [];
  const labById = new Map(labs.map((lab) => [String(lab._id), lab]));

  const createdIds = [];

  for (const line of paidLines) {
    if (line.payeeKind !== "direct_lab") continue;
    const lab = labById.get(String(line.payeeAnchorId || ""));
    if (!lab) continue;
    if (lab.taxInvoice?.trusteeIssueEnabled === false) {
      summary.skippedOptOut += 1;
      continue;
    }
    const amount = Math.round(Number(line.amount || 0));
    const sellerContact = await resolveContactUser(lab);
    const result = await createDraft({
      chargeOrderId: null,
      storeOrderId: null,
      userId: practice.primaryContactUserId || null,
      businessAnchorId: practice._id,
      direction: "LAB_TO_PRACTICE",
      issuanceMode: "TRUSTEE",
      taxType: "면세",
      kind: "NORMAL",
      buyerKind: "practice",
      sellerAnchorId: lab._id,
      seller: partyFromAnchor(lab, sellerContact),
      status: "PENDING_APPROVAL",
      supplyAmount: amount,
      vatAmount: 0,
      totalAmount: amount,
      itemName: "기공서비스(면세 계산서)",
      buyer,
      writeDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      sourceRefType: "PRACTICE_OB_SETTLEMENT",
      sourceRefIds: [settlement._id],
    });
    if (result.created) {
      summary.created += 1;
      createdIds.push(result.id);
    } else if (result.skipped) summary.skippedExisting += 1;
  }

  const corpLine = paidLines.find((line) => line.payeeKind === "abuts_corp");
  if (corpLine) {
    const allocated = allocateAbutsPaymentInvoice(corpLine.amount, invoiceSplit);
    const corpDrafts = [];
    if (allocated.storeTotal > 0 && allocated.storeSupply > 0) {
      corpDrafts.push({
        taxType: "과세",
        supplyAmount: allocated.storeSupply,
        vatAmount: allocated.storeVat,
        totalAmount: allocated.storeTotal,
        itemName: "스토어 기성품(과세 세금계산서)",
      });
    }
    if (allocated.abutment > 0) {
      corpDrafts.push({
        taxType: "면세",
        supplyAmount: allocated.abutment,
        vatAmount: 0,
        totalAmount: allocated.abutment,
        itemName: "커스텀어벗 대금(면세 계산서)",
      });
    }
    for (const spec of corpDrafts) {
      const result = await createDraft({
        chargeOrderId: null,
        storeOrderId: null,
        userId: practice.primaryContactUserId || null,
        businessAnchorId: practice._id,
        direction: "ABUTS_TO_CUSTOMER",
        issuanceMode: "SELF",
        taxType: spec.taxType,
        kind: "NORMAL",
        buyerKind: "practice",
        sellerAnchorId: null,
        status: "PENDING_APPROVAL",
        supplyAmount: spec.supplyAmount,
        vatAmount: spec.vatAmount,
        totalAmount: spec.totalAmount,
        itemName: spec.itemName,
        buyer,
        writeDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        sourceRefType: "PRACTICE_OB_SETTLEMENT",
        sourceRefIds: [settlement._id],
      });
      if (result.created) {
        summary.created += 1;
        createdIds.push(result.id);
      } else if (result.skipped) summary.skippedExisting += 1;
    }
  }

  for (const id of createdIds) {
    if (await issueIfPopbillReady(id)) summary.issued += 1;
  }
  return summary;
}
