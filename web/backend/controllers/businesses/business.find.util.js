import Business from "../../models/business.model.js";
import { buildBusinessTypeFilter } from "./businessRole.util.js";

export async function findBusinessByAnchors({
  businessType,
  businessId,
  businessNumber,
  userId,
  businessName,
}) {
  const typeFilter = buildBusinessTypeFilter(businessType);

  if (businessId) {
    const byId = await Business.findOne({
      _id: businessId,
      ...typeFilter,
    });
    if (byId) return byId;
  }

  if (userId) {
    const byMembership = await Business.findOne({
      ...typeFilter,
      $or: [
        { owner: userId },
        { owners: userId },
        { members: userId },
        { "joinRequests.user": userId },
      ],
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (byMembership) return byMembership;
  }

  const safeBusinessName = String(businessName || "").trim();
  if (safeBusinessName) {
    const matches = await Business.find({
      ...typeFilter,
      name: safeBusinessName,
      $or: [{ owner: userId }, { owners: userId }, { members: userId }],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1);
    if (Array.isArray(matches) && matches[0]) return matches[0];
  }

  const normalizedBusinessNumber = String(businessNumber || "").trim();
  if (normalizedBusinessNumber) {
    const byBusinessNumber = await Business.findOne({
      ...typeFilter,
      "extracted.businessNumber": normalizedBusinessNumber,
    });
    if (byBusinessNumber) return byBusinessNumber;
  }

  return null;
}
