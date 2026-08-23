// change-log:
// - 2026-08-23: 고객향 월합 면세/과세 draft 수동 생성.
// related files:
// - web/backend/services/customerMonthlyInvoice.service.js
import {
  generateMonthlyCustomerInvoiceDrafts,
  resolvePreviousKstMonthRange,
} from "../../services/customerMonthlyInvoice.service.js";

/**
 * body: { periodStart?: "YYYY-MM-DD", periodEnd?: "YYYY-MM-DD" } — 미지정 시 지난달(KST)
 */
export async function adminGenerateCustomerMonthlyInvoiceDrafts(req, res) {
  try {
    let periodStart;
    let periodEnd;

    if (req.body?.periodStart && req.body?.periodEnd) {
      periodStart = new Date(`${req.body.periodStart}T00:00:00.000+09:00`);
      periodEnd = new Date(`${req.body.periodEnd}T00:00:00.000+09:00`);
    } else {
      const range = resolvePreviousKstMonthRange();
      periodStart = range.periodStart;
      periodEnd = range.periodEnd;
    }

    if (
      Number.isNaN(periodStart.getTime()) ||
      Number.isNaN(periodEnd.getTime()) ||
      periodStart >= periodEnd
    ) {
      return res.status(400).json({
        success: false,
        message: "periodStart/periodEnd가 올바르지 않습니다.",
      });
    }

    const result = await generateMonthlyCustomerInvoiceDrafts({
      periodStart,
      periodEnd,
    });

    return res.json({
      success: true,
      data: {
        periodStart,
        periodEnd,
        ...result,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "customer_monthly_generate_failed",
    });
  }
}
