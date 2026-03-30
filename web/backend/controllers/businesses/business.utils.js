import BusinessAnchor from "../../models/businessAnchor.model.js";

export async function resolveOwnedBusiness(req, businessType) {
  const meId = req.user?._id;
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      businessType,
      $or: [{ primaryContactUserId: meId }, { owners: meId }],
    });
    if (byAnchor) return byAnchor;
  }

  return await BusinessAnchor.findOne({
    businessType,
    $or: [{ primaryContactUserId: meId }, { owners: meId }],
  }).sort({ updatedAt: -1, createdAt: -1 });
}

export async function resolvePrimaryOwnedBusiness(req, businessType) {
  const businessAnchorId = req.user?.businessAnchorId;

  if (businessAnchorId) {
    const byAnchor = await BusinessAnchor.findOne({
      _id: businessAnchorId,
      businessType,
      primaryContactUserId: req.user._id,
    });
    if (byAnchor) return byAnchor;
  }

  return await BusinessAnchor.findOne({
    businessType,
    primaryContactUserId: req.user._id,
  }).sort({ updatedAt: -1, createdAt: -1 });
}
