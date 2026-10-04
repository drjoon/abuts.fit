// related files:
// - web/backend/services/demoConversion.service.js
// - web/backend/modules/credits/credit.routes.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  computeDemoConversionQuote,
  confirmLabDirectPayment,
  listPendingConversionsForLab,
} from "../../services/demoConversion.service.js";
import { aggregateLabDemoSettlementByPractice } from "../../services/labDemoCredit.service.js";

function fail(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  return res.status(status).json({
    success: false,
    message: error?.message || fallback,
  });
}

/**
 * 치과 전환 견적(기공소별 직접 지급액·확인 상태).
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
    return res.json({ success: true, data: quote });
  } catch (error) {
    return fail(res, error, "전환 견적 조회에 실패했습니다.");
  }
}

/**
 * 기공소: 전환 요청 대기 목록 + 데모 치과별 크레딧.
 * @route GET /api/credits/lab-demo-conversions
 */
export async function getLabDemoConversions(req, res) {
  try {
    const businessAnchorId = req.user?.businessAnchorId;
    if (!["requestor", "internalLab"].includes(req.user?.role) || !businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소만 조회할 수 있습니다.",
      });
    }
    const [pending, demoByPractice] = await Promise.all([
      listPendingConversionsForLab(businessAnchorId),
      aggregateLabDemoSettlementByPractice(businessAnchorId),
    ]);
    const practices = demoByPractice.length
      ? await BusinessAnchor.find({
          _id: { $in: demoByPractice.map((row) => row.practiceAnchorId) },
        })
          .select({ name: 1 })
          .lean()
      : [];
    const nameById = new Map(practices.map((p) => [String(p._id), p.name]));
    const demoPractices = demoByPractice
      .filter((row) => row.amount > 0)
      .map((row) => ({
        practiceAnchorId: row.practiceAnchorId,
        practiceName: String(nameById.get(String(row.practiceAnchorId)) || ""),
        amount: row.amount,
      }));
    return res.json({
      success: true,
      data: {
        pending,
        demoPractices,
        demoTotal: demoPractices.reduce((sum, row) => sum + row.amount, 0),
      },
    });
  } catch (error) {
    return fail(res, error, "데모 치과 정산 조회에 실패했습니다.");
  }
}

/**
 * 기공소: 치과로부터 직접 지급받았음을 확인.
 * 어벗츠(internalLab) 몫은 관리자 대시보드(`/api/admin/credits/demo-conversions`)에서만 확인.
 * @route POST /api/credits/lab-demo-conversions/:invoiceId/confirm
 */
export async function confirmLabDemoConversion(req, res) {
  try {
    const businessAnchorId = req.user?.businessAnchorId;
    if (req.user?.role === "internalLab") {
      return res.status(403).json({
        success: false,
        message: "어벗츠 몫은 관리자 대시보드에서 확인해 주세요.",
      });
    }
    if (req.user?.role !== "requestor" || !businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "기공소만 확인할 수 있습니다.",
      });
    }
    const result = await confirmLabDirectPayment({
      invoiceId: req.params.invoiceId,
      labAnchorId: businessAnchorId,
      userId: req.user?._id,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return fail(res, error, "지급 확인에 실패했습니다.");
  }
}
