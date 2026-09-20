// related files:
// - web/backend/controllers/admin/adminTaxInvoice.controller.js
// - web/backend/jobs/monthlyCustomerInvoiceWorker.js
// - web/backend/utils/taxInvoicePeriod.util.js
// change-log:
// - 2026-09-20: 1B day-1 자동 승인·발행 훅(기본 off). env TAX_INVOICE_AUTO_ISSUE_ON_DAY1.
import TaxInvoiceDraft from "../models/taxInvoiceDraft.model.js";
import {
  buildTaxinvoiceObject,
  registIssueInvoice,
} from "../utils/popbill.util.js";
import { isTaxInvoiceAutoIssueOnDay1Enabled } from "../utils/taxInvoicePeriod.util.js";
import { scheduleTaxPendingBadgeEmit } from "./adminCommBadge.service.js";

/**
 * PENDING_APPROVAL → APPROVED → Popbill SENT (또는 FAILED).
 * 워커/배치용. req 없음(감사 로그는 생략).
 */
export async function approveAndIssueTaxInvoiceDraftById(id) {
  const draftId = String(id || "").trim();
  if (!draftId) return { ok: false, reason: "missing_id" };

  const draft = await TaxInvoiceDraft.findById(draftId).lean();
  if (!draft) return { ok: false, reason: "not_found" };
  if (String(draft.status) === "SENT") {
    return { ok: true, skipped: true, status: "SENT" };
  }

  const now = new Date();
  if (String(draft.status) === "PENDING_APPROVAL") {
    await TaxInvoiceDraft.updateOne(
      { _id: draftId, status: "PENDING_APPROVAL" },
      { $set: { status: "APPROVED", approvedAt: now, failReason: null } },
    );
  }

  const fresh = await TaxInvoiceDraft.findById(draftId).lean();
  if (!fresh || !["APPROVED", "FAILED"].includes(String(fresh.status))) {
    return { ok: false, reason: "not_issuable", status: fresh?.status };
  }

  const corpNum = (process.env.POPBILL_CORP_NUM || "").replace(/-/g, "");
  if (!corpNum) {
    return { ok: false, reason: "missing_popbill_corp_num" };
  }

  const mgtKey = String(draftId).slice(0, 24);
  const taxinvoice = buildTaxinvoiceObject({ draft: fresh, mgtKey });

  try {
    const response = await registIssueInvoice({ corpNum, taxinvoice });
    const trxID = response?.trxID || response?.TrxID || mgtKey;
    await TaxInvoiceDraft.updateOne(
      { _id: draftId },
      {
        $set: {
          status: "SENT",
          hometaxTrxId: trxID,
          sentAt: now,
          failReason: null,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
    );
    return { ok: true, status: "SENT" };
  } catch (popbillError) {
    const errMsg =
      popbillError?.ErrMsg || popbillError?.message || String(popbillError);
    await TaxInvoiceDraft.updateOne(
      { _id: draftId },
      {
        $set: {
          status: "FAILED",
          failReason: `[팝빌 오류] ${errMsg}`,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
    );
    return { ok: false, reason: "popbill_failed", message: errMsg };
  }
}

/**
 * [periodStart, periodEnd) 에 생성된 PENDING_APPROVAL NORMAL draft 를 자동 발행.
 * TAX_INVOICE_AUTO_ISSUE_ON_DAY1 가 true 일 때만 동작.
 */
export async function maybeAutoIssuePendingDraftsForPeriod({
  periodStart,
  periodEnd,
  directions = null,
}) {
  if (!isTaxInvoiceAutoIssueOnDay1Enabled()) {
    return { enabled: false, attempted: 0, sent: 0, failed: 0 };
  }
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    return { enabled: true, attempted: 0, sent: 0, failed: 0 };
  }

  const match = {
    status: "PENDING_APPROVAL",
    kind: { $in: ["NORMAL", null] },
    periodStart,
    periodEnd,
  };
  if (Array.isArray(directions) && directions.length) {
    match.direction = { $in: directions };
  }

  const drafts = await TaxInvoiceDraft.find(match).select({ _id: 1 }).lean();
  let sent = 0;
  let failed = 0;
  for (const row of drafts) {
    const result = await approveAndIssueTaxInvoiceDraftById(row._id);
    if (result.ok && result.status === "SENT") sent++;
    else if (!result.skipped) failed++;
  }
  scheduleTaxPendingBadgeEmit();
  return { enabled: true, attempted: drafts.length, sent, failed };
}
