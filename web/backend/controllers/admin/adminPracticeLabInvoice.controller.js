// related files:
// - web/backend/rules.md
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/jobs/monthlyPracticeLabInvoiceWorker.js
import {
  generateMonthlyLabToPracticeInvoiceDrafts,
  LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED,
  resolvePreviousKstMonthRange,
} from "../../services/practiceLabInvoice.service.js";
import { scheduleTaxPendingBadgeEmit } from "../../services/adminCommBadge.service.js";

/**
 * ①치과→기공소 기공의뢰비 반대방향 계산서(면세, 위수탁) 월 합계 생성을
 * 관리자가 특정 기간에 대해 수동으로 재실행할 수 있는 API.
 * 2026-09-20: LAB_TO_PRACTICE 신규 생성 중단(410). 기공비는 ABUTS_TO_CUSTOMER.
 * body: { periodStart?: "YYYY-MM-DD", periodEnd?: "YYYY-MM-DD" } — 미지정 시 "지난달(KST)"
 */
export async function adminGenerateLabToPracticeInvoiceDrafts(req, res) {
  try {
    if (!LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED) {
      return res.status(410).json({
        success: false,
        message:
          "기공소→치과(LAB_TO_PRACTICE) 계산서는 중단되었습니다. 기공비는 어벗츠→치과(ABUTS_TO_CUSTOMER) 월합으로 발행합니다.",
        code: "LAB_TO_PRACTICE_DISABLED",
      });
    }

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

    const result = await generateMonthlyLabToPracticeInvoiceDrafts({
      periodStart,
      periodEnd,
    });
    scheduleTaxPendingBadgeEmit();

    return res.json({
      success: true,
      data: {
        periodStart,
        periodEnd,
        ...result,
      },
    });
  } catch (error) {
    console.error("adminGenerateLabToPracticeInvoiceDrafts error:", error);
    return res.status(500).json({
      success: false,
      message: "계산서 생성에 실패했습니다.",
      error: error.message,
    });
  }
}
