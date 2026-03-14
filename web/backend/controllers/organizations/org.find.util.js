import RequestorOrganization from "../../models/requestorOrganization.model.js";
import { buildOrganizationTypeFilter } from "./organizationRole.util.js";

export async function findOrganizationByAnchors({
  organizationType,
  businessId,
  businessNumber,
  userId,
  businessName,
}) {
  const orgTypeFilter = buildOrganizationTypeFilter(organizationType);

  if (businessId) {
    const byId = await RequestorOrganization.findOne({
      _id: businessId,
      ...orgTypeFilter,
    });
    if (byId) return byId;
  }

  if (userId) {
    const byMembership = await RequestorOrganization.findOne({
      ...orgTypeFilter,
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
    const matches = await RequestorOrganization.find({
      ...orgTypeFilter,
      name: safeBusinessName,
      $or: [{ owner: userId }, { owners: userId }, { members: userId }],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1);
    if (Array.isArray(matches) && matches[0]) return matches[0];
  }

  const normalizedBusinessNumber = String(businessNumber || "").trim();
  if (normalizedBusinessNumber) {
    const byBusinessNumber = await RequestorOrganization.findOne({
      ...orgTypeFilter,
      "extracted.businessNumber": normalizedBusinessNumber,
    });
    if (byBusinessNumber) return byBusinessNumber;
  }

  return null;
}
