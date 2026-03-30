import BusinessAnchor from "../../models/businessAnchor.model.js";

export async function findBusinessByAnchors({
  businessType,
  businessId,
  businessNumber,
  userId,
  businessName,
}) {
  if (businessId) {
    const byId = await BusinessAnchor.findOne({
      _id: businessId,
      businessType,
    });
    if (byId) return byId;
  }

  if (userId) {
    const byMembership = await BusinessAnchor.findOne({
      businessType,
      $or: [
        { primaryContactUserId: userId },
        { owners: userId },
        { members: userId },
        { "joinRequests.user": userId },
      ],
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (byMembership) return byMembership;
  }

  const safeBusinessName = String(businessName || "").trim();
  if (safeBusinessName) {
    const matches = await BusinessAnchor.find({
      businessType,
      name: safeBusinessName,
      $or: [
        { primaryContactUserId: userId },
        { owners: userId },
        { members: userId },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1);
    if (Array.isArray(matches) && matches[0]) return matches[0];
  }

  const normalizedBusinessNumber = String(businessNumber || "")
    .replace(/\D/g, "")
    .trim();
  if (normalizedBusinessNumber) {
    const byBusinessNumber = await BusinessAnchor.findOne({
      businessType,
      businessNumberNormalized: normalizedBusinessNumber,
    });
    if (byBusinessNumber) return byBusinessNumber;
  }

  return null;
}
