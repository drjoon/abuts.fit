import Business from "../../models/business.model.js";
import { buildBusinessTypeFilter } from "./businessRole.util.js";

export async function resolveOwnedBusiness(req, businessType) {
  const meId = req.user?._id;
  const typeFilter = buildBusinessTypeFilter(businessType);
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await Business.findOne({
      businessAnchorId,
      ...typeFilter,
      $or: [{ owner: meId }, { owners: meId }],
    });
    if (byAnchor) return byAnchor;
  }

  return await Business.findOne({
    ...typeFilter,
    $or: [{ owner: meId }, { owners: meId }],
  }).sort({ updatedAt: -1, createdAt: -1 });
}

export async function resolvePrimaryOwnedBusiness(req, businessType) {
  const typeFilter = buildBusinessTypeFilter(businessType);
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await Business.findOne({
      businessAnchorId,
      ...typeFilter,
      owner: req.user._id,
    });
    if (byAnchor) return byAnchor;
  }

  return await Business.findOne({
    ...typeFilter,
    owner: req.user._id,
  }).sort({ updatedAt: -1, createdAt: -1 });
}
