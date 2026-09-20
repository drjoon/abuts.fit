// related files:
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/services/customerMonthlyInvoice.service.js
// - web/backend/controllers/admin/adminSettlementBatch.controller.js
// change-log:
// - 2026-09-20: 월합 작성연월일=기간 말일(KST) SSOT.

/**
 * Date → KST civil YYYYMMDD (세금계산서 writeDate).
 * @param {Date|string|number} date
 */
export function formatKstWriteDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

/**
 * 월합 구간 [periodStart, periodEnd) 의 작성연월일 = 전월 말일(KST).
 * periodEnd 는 익월 1일 00:00 KST(배타)이므로 periodEnd - 1ms 를 KST로 포맷.
 * @param {Date} periodEnd
 */
export function writeDateFromPeriodEnd(periodEnd) {
  if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime())) {
    return null;
  }
  return formatKstWriteDate(new Date(periodEnd.getTime() - 1));
}

/** env TAX_INVOICE_AUTO_ISSUE_ON_DAY1=true 일 때만 1B 자동 발행. */
export function isTaxInvoiceAutoIssueOnDay1Enabled() {
  return (
    String(process.env.TAX_INVOICE_AUTO_ISSUE_ON_DAY1 || "")
      .trim()
      .toLowerCase() === "true"
  );
}
