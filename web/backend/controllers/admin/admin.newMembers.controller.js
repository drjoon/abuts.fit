// related files:
// - web/backend/services/adminNewMembers.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminNewMembersCard.tsx
import { asyncHandler } from "../../utils/asyncHandler.js";
import { listNewMembers } from "../../services/adminNewMembers.service.js";

export const listAdminNewMembers = asyncHandler(async (_req, res) => {
  const data = await listNewMembers();
  return res.status(200).json({ success: true, data });
});
