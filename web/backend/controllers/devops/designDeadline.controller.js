// related files:
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/designClaim.js
// - web/backend/modules/devops/designDeadline.routes.js
// - web/frontend/src/pages/devops/components/DevopsDesignDeadlineTab.tsx
import SystemSettings from "../../models/systemSettings.model.js";
import {
  clampDesignClaimHours,
  DESIGN_CLAIM_HOURS_DEFAULT,
} from "../../utils/designClaim.js";

function normalizeDesignDeadlineSettings(raw = {}) {
  return {
    claimHours: clampDesignClaimHours(
      raw.claimHours ?? DESIGN_CLAIM_HOURS_DEFAULT,
    ),
  };
}

export async function getDesignDeadlineSettings(req, res) {
  try {
    const doc = await SystemSettings.findOne({ key: "global" })
      .select({ designDeadlineSettings: 1 })
      .lean();
    const designDeadlineSettings = normalizeDesignDeadlineSettings(
      doc?.designDeadlineSettings || {},
    );
    return res.status(200).json({
      success: true,
      data: { designDeadlineSettings },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "디자인 마감 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateDesignDeadlineSettings(req, res) {
  try {
    const input =
      req.body?.designDeadlineSettings &&
      typeof req.body.designDeadlineSettings === "object"
        ? req.body.designDeadlineSettings
        : req.body && typeof req.body === "object"
          ? req.body
          : {};

    const designDeadlineSettings = normalizeDesignDeadlineSettings(input);

    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { designDeadlineSettings } },
      { upsert: true, new: true },
    )
      .select({ designDeadlineSettings: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        designDeadlineSettings: normalizeDesignDeadlineSettings(
          doc?.designDeadlineSettings || designDeadlineSettings,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "디자인 마감 설정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
