// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  buildOrgBusinessTypeQuery,
  isCompatibleOrgBusinessType,
} from "../../utils/orgBusinessType.util.js";

export async function resolveOwnedBusiness(req, businessType) {
  const meId = req.user?._id;
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      $or: [{ primaryContactUserId: meId }, { owners: meId }],
    });
    if (byAnchor && isCompatibleOrgBusinessType(businessType, byAnchor)) {
      return byAnchor;
    }
  }

  return await BusinessAnchor.findOne({
    ...buildOrgBusinessTypeQuery(businessType),
    $or: [{ primaryContactUserId: meId }, { owners: meId }],
  }).sort({ updatedAt: -1, createdAt: -1 });
}

export async function resolvePrimaryOwnedBusiness(req, businessType) {
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      primaryContactUserId: req.user._id,
    });
    if (byAnchor && isCompatibleOrgBusinessType(businessType, byAnchor)) {
      return byAnchor;
    }
  }

  return await BusinessAnchor.findOne({
    ...buildOrgBusinessTypeQuery(businessType),
    primaryContactUserId: req.user._id,
  }).sort({ updatedAt: -1, createdAt: -1 });
}
