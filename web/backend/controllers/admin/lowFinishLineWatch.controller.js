// related files:
// - web/backend/services/lowFinishLineWatch.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/backend/modules/manufacturer/manufacturer.routes.js
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  getLowFinishLineWatch,
  setLowFinishLineVerdict,
} from "../../services/lowFinishLineWatch.service.js";

export const getAdminLowFinishLineWatch = asyncHandler(async (_req, res) => {
  const data = await getLowFinishLineWatch({ fresh: true });
  return res.status(200).json({ success: true, data });
});

export const getManufacturerLowFinishLineWarning = asyncHandler(async (_req, res) => {
  const data = await getLowFinishLineWatch();
  return res.status(200).json({
    success: true,
    data: {
      warning: data.warning,
      successCount: data.success,
      failed: data.failed,
      open: data.open,
      target: data.target,
      thresholdMm: data.thresholdMm,
    },
  });
});

export const setAdminLowFinishLineVerdict = asyncHandler(async (req, res) => {
  try {
    const data = await setLowFinishLineVerdict(
      req.params.requestId,
      req.body?.verdict,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    throw new ApiError(error.statusCode || 500, error.message);
  }
});
