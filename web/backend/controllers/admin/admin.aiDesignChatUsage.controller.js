// related files:
// - web/backend/services/aiDesignChatUsage.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminAiDesignChatUsageCard.tsx
import { asyncHandler } from "../../utils/asyncHandler.js";
import { listAiDesignChatUsageByPractice } from "../../services/aiDesignChatUsage.service.js";

export const listAdminAiDesignChatUsage = asyncHandler(async (_req, res) => {
  const data = await listAiDesignChatUsageByPractice();
  return res.status(200).json({ success: true, data });
});
