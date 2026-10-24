// related files:
// - web/backend/services/practiceLaunch.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminPracticeLaunchButton.tsx
import {
  getPracticeLaunchState,
  switchPracticeLaunchToLive,
} from "../../services/practiceLaunch.service.js";

/** @route GET /api/admin/practice-launch */
export async function adminGetPracticeLaunch(req, res) {
  try {
    const data = await getPracticeLaunchState();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[practiceLaunch] get failed", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "실사용 전환 상태를 불러오지 못했습니다.",
    });
  }
}

/** @route POST /api/admin/practice-launch/switch */
export async function adminSwitchPracticeLaunch(req, res) {
  try {
    const data = await switchPracticeLaunchToLive({
      userId: req.user?._id || null,
      userName: req.user?.name || "",
    });
    return res.json({ success: true, data });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (status >= 500) {
      console.error("[practiceLaunch] switch failed", error?.message || error);
    }
    return res.status(status).json({
      success: false,
      message:
        status === 409
          ? error.message
          : "실사용 전환에 실패했습니다.",
    });
  }
}
