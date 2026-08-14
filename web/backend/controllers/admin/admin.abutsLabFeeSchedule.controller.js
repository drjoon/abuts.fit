// related files:
// - web/backend/utils/abutsLabFeeSchedule.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/features/settings/tabs/AdminAbutsLabFeeScheduleTab.tsx
import {
  loadAbutsLabFeeSchedule,
  saveAbutsLabFeeSchedule,
} from "../../utils/abutsLabFeeSchedule.js";
import { invalidatePracticeTransferQuoteCaches } from "../../services/practiceTransferBilling.service.js";

export async function getAbutsLabFeeSchedule(req, res) {
  try {
    const data = await loadAbutsLabFeeSchedule();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[abutsLabFeeSchedule] get failed", error);
    return res.status(500).json({
      success: false,
      message: "어벗츠 수가 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function updateAbutsLabFeeSchedule(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const data = await saveAbutsLabFeeSchedule(body.items);
    invalidatePracticeTransferQuoteCaches();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[abutsLabFeeSchedule] update failed", error);
    return res.status(500).json({
      success: false,
      message: "어벗츠 수가 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}
