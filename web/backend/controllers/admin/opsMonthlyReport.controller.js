// related files:
// - web/backend/services/opsMonthlyReport.service.js
// - web/backend/modules/opsReport/opsReport.routes.js
import { buildOpsMonthlyReport } from "../../services/opsMonthlyReport.service.js";
import { viewerParty } from "../../services/opsMonthlyReport.core.js";

export async function getOpsMonthlyReport(req, res) {
  try {
    const report = await buildOpsMonthlyReport({
      month: req.query.month,
      now: new Date(),
    });
    if (!report) {
      return res.status(400).json({
        success: false,
        message: "보고 월은 YYYY-MM 형식이어야 합니다.",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        ...report,
        viewer: viewerParty(req.user?.role),
      },
    });
  } catch (error) {
    console.error("[ops-monthly-report]", error);
    return res.status(500).json({
      success: false,
      message: "월간 운영보고서를 만들지 못했습니다.",
    });
  }
}
