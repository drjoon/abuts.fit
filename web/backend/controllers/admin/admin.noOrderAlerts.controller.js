// related files:
// - web/backend/services/noOrderAlerts.service.js
// - web/backend/modules/admin/admin.routes.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { listNoOrderAlerts } from "../../services/noOrderAlerts.service.js";

export async function getAdminNoOrderAlerts(req, res) {
  try {
    const anchors = await BusinessAnchor.find({
      businessType: "requestor",
      status: { $ne: "merged" },
    })
      .select({ _id: 1 })
      .lean();

    const data = await listNoOrderAlerts({
      anchorIds: (anchors || []).map((a) => a?._id),
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[getAdminNoOrderAlerts]", error);
    return res.status(500).json({
      success: false,
      message: "무주문 의뢰자 알람 조회에 실패했습니다.",
    });
  }
}
