// related files:
// - web/backend/services/demoConversion.service.js
// - web/backend/controllers/credits/creditBPlan.controller.js
import {
  computeDemoConversionQuote,
  getLatestConversionInvoice,
} from "../../services/demoConversion.service.js";

/**
 * 데모→실사용 전환 견적(하한·라인).
 * @route GET /api/credits/conversion-quote
 */
export async function getMyConversionQuote(req, res) {
  try {
    if (req.user?.role !== "requestor") {
      return res.status(403).json({
        success: false,
        message: "의뢰자만 조회할 수 있습니다.",
      });
    }
    const businessAnchorId = req.user?.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }

    const quote = await computeDemoConversionQuote(businessAnchorId);
    const invoice = await getLatestConversionInvoice(businessAnchorId);
    return res.json({
      success: true,
      data: {
        ...quote,
        invoice: invoice
          ? {
              id: invoice._id,
              status: invoice.status,
              minTotal: invoice.minTotal,
              paidAt: invoice.paidAt || null,
            }
          : null,
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: error?.message || "전환 견적 조회에 실패했습니다.",
    });
  }
}
